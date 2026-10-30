-- Finalyze — автоматическая запись трат по Apple Pay (через «Команды» на iPhone)
-- Запустите в SQL Editor после schema.sql. Повторный запуск безопасен.

-- Источник операции «wallet» — оплата через Apple Pay
alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions add constraint transactions_source_check check (source in ('manual', 'import', 'wallet'));

-- Личный секретный ключ пользователя для «Команд»
create table if not exists public.wallet_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.wallet_tokens enable row level security;
drop policy if exists "own token" on public.wallet_tokens;
create policy "own token" on public.wallet_tokens for select to authenticated using (user_id = (select auth.uid()));

-- Выдать новый ключ (старый перестаёт работать)
create or replace function public.rotate_wallet_token() returns text
language plpgsql volatile security definer set search_path = public as $$
declare t text := 'mf_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then raise exception 'Войдите в аккаунт'; end if;
  insert into public.wallet_tokens (user_id, token) values (auth.uid(), t)
    on conflict (user_id) do update set token = excluded.token, created_at = now(), last_used_at = null;
  return t;
end $$;

create or replace function public.revoke_wallet_token() returns void
language sql volatile security definer set search_path = public as $$
  delete from public.wallet_tokens where user_id = auth.uid();
$$;

-- «2 500,00 ₸», «₸2,500.00», «2500» → тиыны
create or replace function public._parse_amount(p text) returns bigint
language plpgsql immutable as $$
declare s text := regexp_replace(coalesce(p, ''), '[^0-9.,]', '', 'g');
declare int_part text; frac text := '';
begin
  if s = '' then return null; end if;
  if s ~ '[.,][0-9]{1,2}$' then
    int_part := regexp_replace(s, '[.,][0-9]{1,2}$', '');
    frac := substring(s from '[.,]([0-9]{1,2})$');
  else
    int_part := s;
  end if;
  int_part := regexp_replace(int_part, '[.,]', '', 'g');
  if int_part = '' then int_part := '0'; end if;
  if length(int_part) > 13 then return null; end if;
  return int_part::bigint * 100 + rpad(frac, 2, '0')::bigint;
end $$;

-- Приём операции из «Команд». Вызывается без входа в аккаунт — пользователь определяется по ключу.
create or replace function public.wallet_add(p_token text, p_amount text, p_merchant text default '', p_card text default '')
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  uid uuid;
  amt bigint;
  merchant text := left(trim(coalesce(p_merchant, '')), 120);
  card text := left(trim(coalesce(p_card, '')), 80);
  v_bank text;
  acc text;
  ext text;
  today date := (now() at time zone 'Asia/Qyzylorda')::date;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  tx_id text := 'w' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 14);
begin
  select user_id into uid from public.wallet_tokens where token = p_token;
  if uid is null then return jsonb_build_object('ok', false, 'error', 'Неверный ключ — получите новый в Finalyze → Профиль → Apple Pay'); end if;

  amt := public._parse_amount(p_amount);
  if amt is null or amt <= 0 then return jsonb_build_object('ok', false, 'error', 'Не удалось прочитать сумму: ' || coalesce(p_amount, '')); end if;

  -- не больше 300 операций в сутки на ключ
  if (select count(*) from public.transactions where user_id = uid and source = 'wallet' and date = today) >= 300 then
    return jsonb_build_object('ok', false, 'error', 'Слишком много операций за сегодня');
  end if;

  -- одна и та же оплата могла прийти дважды — защищаемся в пределах минуты
  ext := 'wallet:' || md5(uid::text || amt::text || lower(merchant) || to_char(now(), 'YYYYMMDDHH24MI'));
  if exists (select 1 from public.transactions where user_id = uid and external_id = ext) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  -- счёт по названию карты; если такого счёта ещё нет — создаём
  v_bank := case
    when card ilike '%kaspi%' or card ilike '%каспи%' then 'kaspi'
    when card ilike '%alatau%' or card ilike '%алатау%' then 'alatau'
    when card ilike '%halyk%' or card ilike '%халык%' then 'halyk'
    when card ilike '%freedom%' or card ilike '%фридом%' then 'freedom'
    when card ilike '%jusan%' or card ilike '%жусан%' then 'jusan'
    when card ilike '%forte%' then 'forte'
    when card ilike '%bcc%' or card ilike '%центркредит%' then 'bcc'
    else 'other' end;
  select a.id into acc from public.accounts a where a.user_id = uid and (lower(a.name) = lower(card) or (v_bank <> 'other' and a.bank = v_bank)) order by (lower(a.name) = lower(card)) desc, a.created_at limit 1;
  if acc is null and card <> '' then
    acc := 'acc-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    insert into public.accounts (user_id, id, name, bank, starting_balance, created_at) values (uid, acc, card, v_bank, 0, now_ms);
  end if;

  -- категорию подберёт приложение по вашим правилам (category_id = 'auto')
  insert into public.transactions (user_id, id, type, amount, category_id, date, note, account_id, source, external_id, raw_description, created_at)
  values (uid, tx_id, 'expense', amt, 'auto', today, nullif(merchant, ''), acc, 'wallet', ext, nullif(merchant, ''), now_ms);

  update public.wallet_tokens set last_used_at = now() where user_id = uid;
  return jsonb_build_object('ok', true, 'amount', amt / 100.0, 'merchant', merchant, 'account', card);
end $$;

revoke all on function public.wallet_add(text, text, text, text), public._parse_amount(text) from public;
grant execute on function public.wallet_add(text, text, text, text) to anon, authenticated;
revoke all on function public.rotate_wallet_token(), public.revoke_wallet_token() from public, anon;
grant execute on function public.rotate_wallet_token(), public.revoke_wallet_token() to authenticated;
