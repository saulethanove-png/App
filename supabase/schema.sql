-- MONEY FLOW — схема базы данных Supabase
-- Запустите целиком: Supabase → SQL Editor → New query → вставить → Run.
-- Каждая таблица защищена Row Level Security: пользователь видит и меняет только свои строки.

-- Счета (Kaspi Gold, Halyk и т.д.)
create table if not exists public.accounts (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  name text not null check (char_length(name) between 1 and 60),
  bank text not null default 'other',
  starting_balance bigint not null default 0,          -- в тиынах
  created_at bigint not null,                          -- мс с 1970 (как в приложении)
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Операции
create table if not exists public.transactions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  type text not null check (type in ('income', 'expense')),
  amount bigint not null check (amount > 0),           -- в тиынах: 1 ₸ = 100
  category_id text not null,
  date date not null,
  note text check (char_length(note) <= 200),
  account_id text,
  source text not null default 'manual' check (source in ('manual', 'import')),
  external_id text,                                    -- отпечаток операции из выписки
  raw_description text,
  created_at bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists transactions_user_date on public.transactions (user_id, date desc);
create index if not exists transactions_user_external on public.transactions (user_id, external_id) where external_id is not null;

-- Финансовые цели
create table if not exists public.goals (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  title text not null check (char_length(title) between 1 and 60),
  emoji text not null default '🎯',
  target bigint not null check (target > 0),
  saved bigint not null default 0 check (saved >= 0),
  deadline date,
  created_at bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Выученные правила категорий («magnum» → Еда)
create table if not exists public.category_rules (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  pattern text not null,
  category_id text not null,
  type text not null check (type in ('income', 'expense')),
  created_at bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Профиль, бюджет, прогресс обучения — одной строкой на пользователя
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  budget jsonb not null default '{}'::jsonb,
  learning jsonb not null default '{}'::jsonb,
  alerts_shown jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security
do $$
declare t text;
begin
  foreach t in array array['accounts', 'transactions', 'goals', 'category_rules', 'user_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- updated_at обновляется автоматически
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['accounts', 'transactions', 'goals', 'category_rules', 'user_settings'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
