import { supabase } from './supabase';

/** Адрес, на который «Команды» на iPhone отправляют оплату Apple Pay */
export const WALLET_URL = `${import.meta.env.VITE_SUPABASE_URL ?? ''}/rest/v1/rpc/wallet_add`;
export const PUBLIC_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export const walletApi = {
  /** текущий ключ пользователя (или null) */
  get: async (): Promise<{ token: string; last_used_at: string | null } | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('wallet_tokens').select('token,last_used_at').maybeSingle();
    if (error) throw new Error(error.message);
    return data as { token: string; last_used_at: string | null } | null;
  },
  rotate: async (): Promise<string> => {
    const { data, error } = await supabase!.rpc('rotate_wallet_token');
    if (error) throw new Error(error.message);
    return data as string;
  },
  revoke: async () => {
    const { error } = await supabase!.rpc('revoke_wallet_token');
    if (error) throw new Error(error.message);
  },
};

export function walletError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/does not exist|Could not find|schema cache|relation/i.test(m)) return 'В базе нет функций Apple Pay — выполните supabase/wallet.sql в SQL Editor';
  if (/fetch|network/i.test(m)) return 'Нет связи с сервером';
  return m;
}
