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
