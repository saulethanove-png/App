import type { SupabaseClient } from '@supabase/supabase-js';
import type { Account, AppState, CategoryRule, Goal, Transaction } from '../types';

/**
 * Синхронизация с Supabase по принципу local-first:
 *  • приложение всегда работает с локальными данными (быстро и без интернета);
 *  • каждое изменение попадает в очередь (она хранится на устройстве и переживает перезапуск);
 *  • очередь отправляется в облако, как только есть сеть;
 *  • при входе и при возвращении в приложение загружаем свежие данные из облака.
 */

export type Kind = 'transactions' | 'accounts' | 'goals' | 'category_rules';
type Item = Transaction | Account | Goal | CategoryRule;

export type Op =
  | { kind: Kind; id: string; op: 'upsert'; data: Item }
  | { kind: Kind; id: string; op: 'delete' }
  | { kind: 'settings'; id: 'main'; op: 'upsert'; data: Pick<AppState, 'profile' | 'budget' | 'learning' | 'alertsShown'> };

const COLLECTIONS: [Kind, keyof AppState][] = [
  ['transactions', 'transactions'],
  ['accounts', 'accounts'],
  ['goals', 'goals'],
  ['category_rules', 'rules'],
];

/** Разница между двумя состояниями — какие строки отправить/удалить */
export function diffState(prev: AppState, next: AppState): Op[] {
  const ops: Op[] = [];
  for (const [kind, key] of COLLECTIONS) {
    const a = prev[key] as Item[];
    const b = next[key] as Item[];
    if (a === b) continue;
    const before = new Map(a.map((x) => [x.id, x]));
    const after = new Set<string>();
    for (const x of b) {
      after.add(x.id);
      if (before.get(x.id) !== x) ops.push({ kind, id: x.id, op: 'upsert', data: x });
    }
    for (const id of before.keys()) if (!after.has(id)) ops.push({ kind, id, op: 'delete' });
  }
  if (prev.profile !== next.profile || prev.budget !== next.budget || prev.learning !== next.learning || prev.alertsShown !== next.alertsShown) {
    ops.push({ kind: 'settings', id: 'main', op: 'upsert', data: settingsOf(next) });
  }
  return ops;
}

/** Все данные целиком — для переноса с устройства в новый аккаунт */
export function fullUpload(s: AppState): Op[] {
  const ops: Op[] = [{ kind: 'settings', id: 'main', op: 'upsert', data: settingsOf(s) }];
  for (const [kind, key] of COLLECTIONS) for (const x of s[key] as Item[]) ops.push({ kind, id: x.id, op: 'upsert', data: x });
  return ops;
}

const settingsOf = (s: AppState) => ({ profile: s.profile, budget: s.budget, learning: s.learning, alertsShown: s.alertsShown });

// ───────── преобразование «приложение ↔ таблицы» ─────────

const toRow: Record<Kind, (x: never) => Record<string, unknown>> = {
  transactions: (t: Transaction) => ({
    id: t.id, type: t.type, amount: t.amount, category_id: t.categoryId, date: t.date, note: t.note ?? null,
    account_id: t.accountId ?? null, source: t.source ?? 'manual', external_id: t.externalId ?? null,
    raw_description: t.rawDescription ?? null, created_at: t.createdAt,
  }),
  accounts: (a: Account) => ({ id: a.id, name: a.name, bank: a.bank, starting_balance: a.startingBalance, created_at: a.createdAt, ...('icon' in a ? { icon: a.icon ?? null } : {}) }),
  goals: (g: Goal) => ({ id: g.id, title: g.title, emoji: g.emoji, target: g.target, saved: g.saved, deadline: g.deadline ?? null, created_at: g.createdAt }),
  category_rules: (r: CategoryRule) => ({ id: r.id, pattern: r.pattern, category_id: r.categoryId, type: r.type, created_at: r.createdAt }),
};

type R = Record<string, unknown>;
const num = (v: unknown) => Number(v);
const opt = <T,>(v: unknown) => (v == null ? undefined : (v as T));

export const fromRow = {
  transactions: (r: R): Transaction => ({
    id: String(r.id), type: r.type as Transaction['type'], amount: num(r.amount), categoryId: String(r.category_id), date: String(r.date),
    note: opt<string>(r.note), accountId: opt<string>(r.account_id), source: opt<Transaction['source']>(r.source),
    externalId: opt<string>(r.external_id), rawDescription: opt<string>(r.raw_description), createdAt: num(r.created_at),
  }),
  accounts: (r: R): Account => ({ id: String(r.id), name: String(r.name), bank: r.bank as Account['bank'], startingBalance: num(r.starting_balance), createdAt: num(r.created_at), icon: opt<string>(r.icon) }),
  goals: (r: R): Goal => ({ id: String(r.id), title: String(r.title), emoji: String(r.emoji), target: num(r.target), saved: num(r.saved), deadline: opt<string>(r.deadline), createdAt: num(r.created_at) }),
  category_rules: (r: R): CategoryRule => ({ id: String(r.id), pattern: String(r.pattern), categoryId: String(r.category_id), type: r.type as CategoryRule['type'], createdAt: num(r.created_at) }),
};

// ───────── очередь ─────────

const qKey = (userId: string) => `moneyflow:queue:${userId}`;

export function loadQueue(userId: string): Map<string, Op> {
  try {
    const arr = JSON.parse(localStorage.getItem(qKey(userId)) ?? '[]') as Op[];
    return new Map(arr.map((o) => [`${o.kind}:${o.id}`, o]));
  } catch {
    return new Map();
  }
}

export function saveQueue(userId: string, q: Map<string, Op>) {
  try {
    if (q.size) localStorage.setItem(qKey(userId), JSON.stringify([...q.values()]));
    else localStorage.removeItem(qKey(userId));
  } catch {
    /* хранилище недоступно — очередь живёт в памяти */
  }
}

/** Отправка очереди. Возвращает ключи успешно отправленных операций. */
export async function pushOps(sb: SupabaseClient, userId: string, ops: Op[]): Promise<string[]> {
  const done: string[] = [];
  const settings = ops.find((o) => o.kind === 'settings');
  if (settings && settings.op === 'upsert' && settings.kind === 'settings') {
    const d = settings.data;
    const { error } = await sb.from('user_settings').upsert({ user_id: userId, profile: d.profile, budget: d.budget, learning: d.learning, alerts_shown: d.alertsShown });
    if (error) throw error;
    done.push('settings:main');
  }
  for (const [kind] of COLLECTIONS) {
    const ups = ops.filter((o): o is Extract<Op, { op: 'upsert' }> & { kind: Kind } => o.kind === kind && o.op === 'upsert');
    for (let i = 0; i < ups.length; i += 500) {
      const chunk = ups.slice(i, i + 500);
      const rows = chunk.map((o) => ({ user_id: userId, ...toRow[kind](o.data as never) }));
      let { error } = await sb.from(kind).upsert(rows, { onConflict: 'user_id,id' });
      // в базе ещё нет колонки icon (не выполнен SQL) — сохраняем счёт без иконки, чтобы не блокировать синхронизацию
      if (error && kind === 'accounts' && /icon/i.test(error.message)) {
        ({ error } = await sb.from(kind).upsert(rows.map((r) => { const c: Record<string, unknown> = { ...r }; delete c.icon; return c; }), { onConflict: 'user_id,id' }));
      }
      if (error) throw error;
      done.push(...chunk.map((o) => `${kind}:${o.id}`));
    }
    const dels = ops.filter((o) => o.kind === kind && o.op === 'delete').map((o) => o.id);
    for (let i = 0; i < dels.length; i += 200) {
      const chunk = dels.slice(i, i + 200);
      const { error } = await sb.from(kind).delete().eq('user_id', userId).in('id', chunk);
      if (error) throw error;
      done.push(...chunk.map((id) => `${kind}:${id}`));
    }
  }
  return done;
}

async function selectAll(sb: SupabaseClient, table: string, userId: string): Promise<R[]> {
  const out: R[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await sb.from(table).select('*').eq('user_id', userId).range(from, from + page - 1);
    if (error) throw error;
    out.push(...((data ?? []) as R[]));
    if (!data || data.length < page) break;
  }
  return out;
}

/** Загрузка всех данных пользователя. null — в облаке ещё ничего нет. */
export async function pullState(sb: SupabaseClient, userId: string, base: AppState): Promise<AppState | null> {
  const { data: st, error } = await sb.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  const [tx, acc, goals, rules] = await Promise.all([
    selectAll(sb, 'transactions', userId),
    selectAll(sb, 'accounts', userId),
    selectAll(sb, 'goals', userId),
    selectAll(sb, 'category_rules', userId),
  ]);
  if (!st && !tx.length && !acc.length && !goals.length) return null;
  const s = (st ?? {}) as R;
  const profile = { ...base.profile, ...((s.profile as object) ?? {}) };
  return {
    version: 1,
    profile,
    budget: { monthlyLimit: null, categoryLimits: {}, ...((s.budget as object) ?? {}) },
    learning: { readArticles: [], doneTasks: {}, bonusXp: 0, ...((s.learning as object) ?? {}) },
    alertsShown: Array.isArray(s.alerts_shown) ? (s.alerts_shown as string[]) : [],
    transactions: tx.map(fromRow.transactions),
    accounts: acc.map(fromRow.accounts),
    goals: goals.map(fromRow.goals),
    rules: rules.map(fromRow.category_rules),
  };
}

// ───────── мгновенные изменения (Supabase Realtime) ─────────

export const REALTIME_TABLES = ['transactions', 'accounts', 'goals', 'category_rules', 'user_settings'] as const;
export type RealtimeTable = (typeof REALTIME_TABLES)[number];

const KEY: Record<Kind, 'transactions' | 'accounts' | 'goals' | 'rules'> = {
  transactions: 'transactions', accounts: 'accounts', goals: 'goals', category_rules: 'rules',
};

/**
 * Применить изменение, пришедшее с другого устройства, к локальному состоянию.
 * Возвращает то же состояние, если ничего не поменялось (например, это эхо нашей же записи).
 */
export function applyRemote(
  s: AppState,
  table: RealtimeTable,
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  row: Record<string, unknown> | null,
  old: Record<string, unknown> | null,
): AppState {
  if (table === 'user_settings') {
    if (event === 'DELETE' || !row) return s;
    const profile = { ...s.profile, ...((row.profile as object) ?? {}) };
    const budget = { ...s.budget, ...((row.budget as object) ?? {}) };
    const learning = { ...s.learning, ...((row.learning as object) ?? {}) };
    const alertsShown = Array.isArray(row.alerts_shown) ? (row.alerts_shown as string[]) : s.alertsShown;
    const same = JSON.stringify([s.profile, s.budget, s.learning, s.alertsShown]) === JSON.stringify([profile, budget, learning, alertsShown]);
    return same ? s : { ...s, profile, budget, learning, alertsShown };
  }
  const key = KEY[table];
  const list = s[key] as Item[];
  if (event === 'DELETE') {
    const id = String(old?.id ?? '');
    if (!id || !list.some((x) => x.id === id)) return s;
    return { ...s, [key]: list.filter((x) => x.id !== id) };
  }
  if (!row) return s;
  const item = fromRow[table](row) as Item;
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0 && JSON.stringify(list[i]) === JSON.stringify({ ...list[i], ...item })) return s; // эхо
  const next = i >= 0 ? list.map((x, j) => (j === i ? item : x)) : [...list, item];
  return { ...s, [key]: next };
}
