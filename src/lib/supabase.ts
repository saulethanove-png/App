import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Клиент Supabase. Адрес проекта и публичный ключ (anon / publishable) задаются в файле .env:
 *   VITE_SUPABASE_URL=https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJ... или sb_publishable_...
 * Публичный ключ можно хранить в коде: доступ к данным защищён правилами RLS (supabase/schema.sql).
 * Если переменные не заданы — приложение работает только на устройстве.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'moneyflow:auth' } }) : null;

export const cloudEnabled = !!supabase;
