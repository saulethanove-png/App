-- Finalyze — свои иконки счетов (логотип банка из галереи). Повторный запуск безопасен.
alter table public.accounts add column if not exists icon text;
alter table public.accounts drop constraint if exists accounts_icon_size;
alter table public.accounts add constraint accounts_icon_size check (icon is null or char_length(icon) < 60000);
