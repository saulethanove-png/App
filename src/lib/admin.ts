import { supabase } from './supabase';
import type { ContentKind, ContentRow } from './content';

export interface AdminStats {
  users_total: number; users_7d: number; users_30d: number; active_7d: number; with_data: number;
  tx_total: number; tx_imported: number; tx_30d: number; accounts_total: number; goals_total: number; rules_total: number;
  banks: Record<string, number>;
  signups: { day: string; count: number }[];
}

export interface AdminUser {
  id: string; email: string; name: string | null; created_at: string; last_sign_in_at: string | null;
  banned: boolean; is_admin: boolean; tx_count: number; last_tx: string | null; accounts_count: number;
}

export interface AdminUserDetail {
  settings: { profile?: { name?: string; startingBalance?: number }; budget?: { monthlyLimit?: number | null } } | null;
  transactions: { id: string; type: 'income' | 'expense'; amount: number; category_id: string; date: string; note: string | null; account_id: string | null; source: string }[];
  accounts: { id: string; name: string; bank: string; starting_balance: number }[];
  goals: { id: string; title: string; emoji: string; target: number; saved: number }[];
}

export interface AuditRow { id: number; admin_id: string; action: string; target_user: string | null; details: Record<string, unknown> | null; created_at: string }

function sb() {
  if (!supabase) throw new Error('Облако не настроено');
  return supabase;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const adminApi = {
  isAdmin: async (): Promise<boolean> => {
    if (!supabase) return false;
    const { data, error } = await supabase.rpc('is_admin');
    return !error && data === true;
  },
  stats: () => rpc<AdminStats>('admin_stats'),
  users: async () => ((await rpc<AdminUser[]>('admin_list_users')) ?? []).map((u) => ({ ...u, tx_count: Number(u.tx_count), accounts_count: Number(u.accounts_count) })),
  user: (id: string) => rpc<AdminUserDetail>('admin_get_user', { p_user: id }),
  setBanned: (id: string, ban: boolean) => rpc<void>('admin_set_banned', { p_user: id, p_ban: ban }),
  setAdmin: (id: string, make: boolean) => rpc<void>('admin_set_admin', { p_user: id, p_make: make }),
  deleteUser: (id: string) => rpc<void>('admin_delete_user', { p_user: id }),
  audit: async (): Promise<AuditRow[]> => {
    const { data, error } = await sb().from('admin_audit').select('*').order('id', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as AuditRow[];
  },
  content: async (): Promise<ContentRow[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('content_items').select('*');
    if (error) return [];
    return (data ?? []) as ContentRow[];
  },
  saveContent: async (row: { id: string; kind: ContentKind; data: Record<string, unknown>; hidden?: boolean; position?: number }) => {
    const { error } = await sb().from('content_items').upsert({ hidden: false, position: 0, ...row });
    if (error) throw new Error(error.message);
  },
  deleteContent: async (id: string) => {
    const { error } = await sb().from('content_items').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};

/** Понятные сообщения об ошибках админки */
export function adminError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/function .* does not exist|Could not find the function|schema cache/i.test(m)) return 'В базе нет функций админки — выполните supabase/admin.sql в SQL Editor';
  if (/Нет прав|42501|permission denied/i.test(m)) return 'Нет прав администратора';
  if (/fetch|network/i.test(m)) return 'Нет связи с сервером';
  return m;
}
