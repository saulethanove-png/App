-- Finalyze: «терпимый» вход для команды Apple Pay.
-- Если в команде поля названы с ошибкой (пробел, заглавная буква, «token» вместо «p_token» и т.п.),
-- PostgREST вызывает эту версию: она сама находит ключ, сумму, продавца и карту.
create or replace function public.wallet_add(jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  body jsonb := coalesce($1, '{}'::jsonb);
  k text; v text; nk text;
  v_token text := ''; v_raw text := ''; v_amount text := ''; v_merchant text := ''; v_card text := '';
begin
  if jsonb_typeof(body) <> 'object' then
    body := jsonb_build_object('raw', body #>> '{}');
  end if;
  for k, v in select key, coalesce(value #>> '{}', '') from jsonb_each(body) loop
    nk := regexp_replace(lower(trim(k)), '^p[ _-]*', '');
    v := trim(v);
    if nk ~ '(token|key|ключ|токен)' then v_token := v;
    elsif nk ~ '(amount|sum|сумм)' then v_amount := v;
    elsif nk ~ '(merchant|продав|магаз|shop|store)' then v_merchant := v;
    elsif nk ~ '(card|карт|пропуск)' then v_card := v;
    else v_raw := trim(v_raw || ' ' || v);
    end if;
  end loop;
  -- ключ не нашли по названию — ищем значение вида mf_…
  if v_token = '' then
    select coalesce(substring(value #>> '{}' from '(mf_[a-f0-9]+)'), '') into v_token
      from jsonb_each(body) where value #>> '{}' ~ 'mf_[a-f0-9]+' limit 1;
    v_token := coalesce(v_token, '');
    v_raw := trim(replace(v_raw, v_token, ''));
  end if;
  return public.wallet_add(v_token, v_amount, v_merchant, v_card, v_raw);
end;
$$;

grant execute on function public.wallet_add(jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
