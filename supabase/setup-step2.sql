-- Finalyze — шаг 2: админка, мгновенная синхронизация, Apple Pay. Запускать после schema.sql. Повторный запуск безопасен.

-- Finalyze — администрирование
-- Запускать ПОСЛЕ schema.sql: Supabase → SQL Editor → New query → вставить → Run.
-- Все функции админа проверяют права в базе (is_admin), поэтому подделать их из браузера нельзя.

-- Кто администратор
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "see own admin row" on public.admins;
create policy "see own admin row" on public.admins for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Журнал действий администратора (кто, когда, чьи данные смотрел/менял)
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid not null,
  action text not null,
  target_user uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
drop policy if exists "admins read audit" on public.admin_audit;
create policy "admins read audit" on public.admin_audit for select to authenticated using (public.is_admin());

create or replace function public._require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Нет прав администратора' using errcode = '42501';
  end if;
end $$;

-- Статистика без чужих сумм
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare result jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object(
    'users_total',      (select count(*) from auth.users),
    'users_7d',         (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'users_30d',        (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active_7d',        (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    'with_data',        (select count(distinct user_id) from public.transactions),
    'tx_total',         (select count(*) from public.transactions),
    'tx_imported',      (select count(*) from public.transactions where source = 'import'),
    'tx_30d',           (select count(*) from public.transactions where date > current_date - 30),
    'accounts_total',   (select count(*) from public.accounts),
    'goals_total',      (select count(*) from public.goals),
    'rules_total',      (select count(*) from public.category_rules),
    'banks',            coalesce((select jsonb_object_agg(bank, n) from (select bank, count(*) n from public.accounts group by bank) b), '{}'::jsonb),
    'signups', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'count', coalesce(c.n, 0)) order by d)
      from generate_series(current_date - 29, current_date, interval '1 day') d
      left join (select created_at::date as d_day, count(*) as n from auth.users group by 1) c on c.d_day = d::date
    ), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- Список пользователей
create or replace function public.admin_list_users()
returns table (
  id uuid, email text, name text, created_at timestamptz, last_sign_in_at timestamptz,
  banned boolean, is_admin boolean, tx_count bigint, last_tx date, accounts_count bigint
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  perform public._require_admin();
  return query
    select u.id, u.email::text,
      coalesce(s.profile->>'name', u.raw_user_meta_data->>'name')::text,
      u.created_at, u.last_sign_in_at,
      coalesce(u.banned_until > now(), false),
      exists (select 1 from public.admins a where a.user_id = u.id),
      (select count(*) from public.transactions t where t.user_id = u.id),
      (select max(t.date) from public.transactions t where t.user_id = u.id),
      (select count(*) from public.accounts a where a.user_id = u.id)
    from auth.users u
    left join public.user_settings s on s.user_id = u.id
    order by u.created_at desc;
end $$;

-- Все данные одного пользователя (просмотр записывается в журнал)
create or replace function public.admin_get_user(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare result jsonb;
begin
  perform public._require_admin();
  insert into public.admin_audit (admin_id, action, target_user) values (auth.uid(), 'view_user', p_user);
  select jsonb_build_object(
    'settings',     (select to_jsonb(s) from public.user_settings s where s.user_id = p_user),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) order by t.date desc, t.created_at desc) from public.transactions t where t.user_id = p_user), '[]'::jsonb),
    'accounts',     coalesce((select jsonb_agg(to_jsonb(a)) from public.accounts a where a.user_id = p_user), '[]'::jsonb),
    'goals',        coalesce((select jsonb_agg(to_jsonb(g)) from public.goals g where g.user_id = p_user), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- Блокировка / разблокировка входа
create or replace function public.admin_set_banned(p_user uuid, p_ban boolean) returns void
language plpgsql volatile security definer set search_path = public, auth as $$
begin
  perform public._require_admin();
  if p_user = auth.uid() then raise exception 'Нельзя заблокировать самого себя'; end if;
  update auth.users set banned_until = case when p_ban then 'infinity'::timestamptz else null end where id = p_user;
  insert into public.admin_audit (admin_id, action, target_user) values (auth.uid(), case when p_ban then 'ban' else 'unban' end, p_user);
end $$;

-- Удаление аккаунта вместе со всеми данными
create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql volatile security definer set search_path = public, auth as $$
begin
  perform public._require_admin();
  if p_user = auth.uid() then raise exception 'Нельзя удалить самого себя'; end if;
  insert into public.admin_audit (admin_id, action, target_user, details)
    select auth.uid(), 'delete_user', p_user, jsonb_build_object('email', email) from auth.users where id = p_user;
  delete from auth.users where id = p_user; -- данные удалятся каскадом
end $$;

-- Выдать / снять права администратора другому пользователю
create or replace function public.admin_set_admin(p_user uuid, p_make boolean) returns void
language plpgsql volatile security definer set search_path = public, auth as $$
begin
  perform public._require_admin();
  if p_user = auth.uid() and not p_make then raise exception 'Нельзя снять права с самого себя'; end if;
  if p_make then insert into public.admins (user_id) values (p_user) on conflict do nothing;
  else delete from public.admins where user_id = p_user; end if;
  insert into public.admin_audit (admin_id, action, target_user) values (auth.uid(), case when p_make then 'grant_admin' else 'revoke_admin' end, p_user);
end $$;

-- Контент раздела «Обучение»: статьи, советы, термины, задания
create table if not exists public.content_items (
  id text primary key,
  kind text not null check (kind in ('article', 'tip', 'term', 'task')),
  data jsonb not null default '{}'::jsonb,
  hidden boolean not null default false,  -- скрыть встроенный материал
  position int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.content_items enable row level security;
drop policy if exists "everyone reads content" on public.content_items;
create policy "everyone reads content" on public.content_items for select to anon, authenticated using (true);
drop policy if exists "admins write content" on public.content_items;
create policy "admins write content" on public.content_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop trigger if exists touch on public.content_items;
create trigger touch before update on public.content_items for each row execute function public.touch_updated_at();

-- Функции доступны только вошедшим пользователям (внутри всё равно проверяется is_admin)
revoke all on function public.admin_stats(), public.admin_list_users(), public.admin_get_user(uuid),
  public.admin_set_banned(uuid, boolean), public.admin_delete_user(uuid), public.admin_set_admin(uuid, boolean),
  public._require_admin() from public, anon;
grant execute on function public.admin_stats(), public.admin_list_users(), public.admin_get_user(uuid),
  public.admin_set_banned(uuid, boolean), public.admin_delete_user(uuid), public.admin_set_admin(uuid, boolean),
  public.is_admin() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- ПЕРВЫЙ АДМИНИСТРАТОР. Сначала зарегистрируйтесь в приложении, затем
-- подставьте свою почту и выполните эту строку отдельно:
--
-- insert into public.admins (user_id) select id from auth.users where email = 'ВАША@ПОЧТА' on conflict do nothing;

-- Приглашения в администраторы по почте: если человек ещё не зарегистрирован,
-- права выдадутся автоматически сразу после регистрации.
create table if not exists public.admin_invites (email text primary key, created_at timestamptz not null default now());
alter table public.admin_invites enable row level security;

create or replace function public.grant_admin_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.admin_invites where lower(email) = lower(new.email)) then
    insert into public.admins (user_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists grant_admin_on_signup on auth.users;
create trigger grant_admin_on_signup after insert on auth.users for each row execute function public.grant_admin_on_signup();

-- Finalyze — мгновенная синхронизация между устройствами (Supabase Realtime)
-- Запустите в SQL Editor один раз. Повторный запуск безопасен.
do $$
declare t text;
begin
  foreach t in array array['transactions', 'accounts', 'goals', 'category_rules', 'user_settings'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

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

-- Администратор: saulethanove@gmail.com (права выдаются сразу или автоматически после регистрации)
insert into public.admin_invites (email) values ('saulethanove@gmail.com') on conflict do nothing;
insert into public.admins (user_id) select id from auth.users where lower(email) = 'saulethanove@gmail.com' on conflict do nothing;

-- Finalyze — свои иконки счетов (логотип банка из галереи). Повторный запуск безопасен.
alter table public.accounts add column if not exists icon text;
alter table public.accounts drop constraint if exists accounts_icon_size;
alter table public.accounts add constraint accounts_icon_size check (icon is null or char_length(icon) < 60000);
