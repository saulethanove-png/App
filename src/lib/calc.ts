import type { AppState, Budget, Money, Transaction, TxType } from '../types';
import { addDays, parseISO, toISO } from './format';

/** Все финансовые расчёты — чистые функции над целыми тиынами. */

export interface Period {
  from: string; // включительно, YYYY-MM-DD
  to: string; // включительно
}

export const monthKey = (iso: string) => iso.slice(0, 7); // "2026-10"

export function monthPeriod(year: number, month: number): Period {
  const from = toISO(new Date(year, month, 1));
  const to = toISO(new Date(year, month + 1, 0));
  return { from, to };
}

export function currentMonthPeriod(today: string): Period {
  const d = parseISO(today);
  return monthPeriod(d.getFullYear(), d.getMonth());
}

export function prevPeriod(p: Period): Period {
  const fromD = parseISO(p.from);
  const toD = parseISO(p.to);
  // Полный календарный месяц → предыдущий календарный месяц
  const isFullMonth =
    fromD.getDate() === 1 && toISO(new Date(toD.getFullYear(), toD.getMonth() + 1, 0)) === p.to &&
    fromD.getMonth() === toD.getMonth() && fromD.getFullYear() === toD.getFullYear();
  if (isFullMonth) return monthPeriod(fromD.getFullYear(), fromD.getMonth() - 1);
  const len = daysInPeriod(p);
  return { from: addDays(p.from, -len), to: addDays(p.from, -1) };
}

export function daysInPeriod(p: Period): number {
  return Math.round((parseISO(p.to).getTime() - parseISO(p.from).getTime()) / 86_400_000) + 1;
}

export const inPeriod = (t: Transaction, p: Period) => t.date >= p.from && t.date <= p.to;

export function sum(txs: Transaction[], type?: TxType): Money {
  let s = 0;
  for (const t of txs) if (!type || t.type === type) s += t.amount;
  return s;
}

export function totals(txs: Transaction[]) {
  const income = sum(txs, 'income');
  const expense = sum(txs, 'expense');
  return { income, expense, net: income - expense };
}

/** Текущий баланс: стартовый остаток + все доходы − все расходы (будущие даты не учитываются). */
export function balance(state: Pick<AppState, 'profile' | 'transactions'> & { accounts?: AppState['accounts'] }, asOf: string): Money {
  const past = state.transactions.filter((t) => t.date <= asOf);
  const accStart = (state.accounts ?? []).reduce((a, x) => a + x.startingBalance, 0);
  return state.profile.startingBalance + accStart + totals(past).net;
}

export const CASH_ACCOUNT = 'cash';

/** Баланс каждого счёта. Операции без счёта и с удалённым счётом относятся к «Наличные / основной». */
export function accountBalances(state: Pick<AppState, 'profile' | 'transactions' | 'accounts'>, asOf: string) {
  const ids = new Set(state.accounts.map((a) => a.id));
  const map = new Map<string, Money>([[CASH_ACCOUNT, state.profile.startingBalance]]);
  for (const a of state.accounts) map.set(a.id, a.startingBalance);
  for (const t of state.transactions) {
    if (t.date > asOf) continue;
    const k = t.accountId && ids.has(t.accountId) ? t.accountId : CASH_ACCOUNT;
    map.set(k, (map.get(k) ?? 0) + (t.type === 'income' ? t.amount : -t.amount));
  }
  return map;
}

export function byCategory(txs: Transaction[], type: TxType = 'expense') {
  const map = new Map<string, Money>();
  for (const t of txs) if (t.type === type) map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export function dailySeries(txs: Transaction[], p: Period) {
  const days: { date: string; income: Money; expense: Money }[] = [];
  const idx = new Map<string, number>();
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) {
    idx.set(d, days.length);
    days.push({ date: d, income: 0, expense: 0 });
  }
  for (const t of txs) {
    const i = idx.get(t.date);
    if (i === undefined) continue;
    days[i][t.type] += t.amount;
  }
  return days;
}

export function monthlySeries(txs: Transaction[], today: string, months = 6) {
  const d = parseISO(today);
  const out: { key: string; year: number; month: number; income: Money; expense: Money }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ key: toISO(m).slice(0, 7), year: m.getFullYear(), month: m.getMonth(), income: 0, expense: 0 });
  }
  const idx = new Map(out.map((o, i) => [o.key, i]));
  for (const t of txs) {
    const i = idx.get(monthKey(t.date));
    if (i !== undefined) out[i][t.type] += t.amount;
  }
  return out;
}

/** Средний расход в день: за прошедшие дни периода (не считая будущие дни текущего месяца). */
export function avgDaily(txs: Transaction[], p: Period, today: string): Money {
  const effTo = p.to > today ? today : p.to;
  if (effTo < p.from) return 0;
  const days = daysInPeriod({ from: p.from, to: effTo });
  const spent = sum(txs.filter((t) => t.type === 'expense' && t.date >= p.from && t.date <= effTo));
  return Math.round(spent / days / 100) * 100; // до целых тенге
}

export function percentChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / prev) * 100;
}

export type BudgetLevel = 'ok' | 'warn' | 'over';

export function budgetLevel(spent: Money, limit: Money): BudgetLevel {
  if (limit <= 0) return 'ok';
  const r = spent / limit;
  if (r >= 1) return 'over';
  if (r >= 0.8) return 'warn';
  return 'ok';
}

export interface BudgetRow {
  key: string; // 'total' | categoryId
  limit: Money;
  spent: Money;
  left: Money;
  ratio: number;
  level: BudgetLevel;
}

export function budgetStatus(budget: Budget, monthTxs: Transaction[]) {
  const spentByCat = new Map(byCategory(monthTxs, 'expense').map((c) => [c.categoryId, c.amount]));
  const totalSpent = sum(monthTxs, 'expense');
  const mk = (key: string, limit: Money, spent: Money): BudgetRow => ({
    key,
    limit,
    spent,
    left: limit - spent,
    ratio: limit > 0 ? spent / limit : 0,
    level: budgetLevel(spent, limit),
  });
  const total = budget.monthlyLimit != null ? mk('total', budget.monthlyLimit, totalSpent) : null;
  const categories = Object.entries(budget.categoryLimits)
    .filter(([, l]) => l > 0)
    .map(([id, l]) => mk(id, l, spentByCat.get(id) ?? 0))
    .sort((a, b) => b.ratio - a.ratio);
  return { total, categories, totalSpent };
}

/** Какие пороги (80/100%) пересечены и ещё не показаны — для уведомлений. */
export function newBudgetAlerts(budget: Budget, monthTxs: Transaction[], month: string, shown: string[]) {
  const st = budgetStatus(budget, monthTxs);
  const rows = [...(st.total ? [st.total] : []), ...st.categories];
  const alerts: { id: string; row: BudgetRow; threshold: 80 | 100 }[] = [];
  for (const r of rows) {
    const th: 80 | 100 | null = r.ratio >= 1 ? 100 : r.ratio >= 0.8 ? 80 : null;
    if (!th) continue;
    const id = `${month}:${r.key}:${th}`;
    if (!shown.includes(id)) alerts.push({ id, row: r, threshold: th });
  }
  return alerts;
}

export function goalProgress(saved: Money, target: Money) {
  const ratio = target > 0 ? Math.min(saved / target, 1) : 0;
  return { ratio, percent: Math.floor(ratio * 100), left: Math.max(target - saved, 0), done: saved >= target && target > 0 };
}

/** Сколько откладывать в месяц, чтобы успеть к сроку */
export function monthlyToGoal(left: Money, today: string, deadline?: string): Money | null {
  if (!deadline || left <= 0) return null;
  const a = parseISO(today);
  const b = parseISO(deadline);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() >= a.getDate() ? 0 : -1);
  if (months <= 0) return left;
  return Math.ceil(left / months);
}

export function sortTx(txs: Transaction[]) {
  return [...txs].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}
