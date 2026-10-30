import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import type { Account, AppState, Budget, CategoryRule, Goal, Money, Profile, Transaction } from '../types';
import { loadState, saveState } from '../lib/storage';
import { demoState, emptyState } from '../lib/seed';
import { todayISO, uid } from '../lib/format';
import { accentHex } from '../lib/theme';

type Action =
  | { type: 'tx/add'; tx: Omit<Transaction, 'id' | 'createdAt'> }
  | { type: 'tx/update'; tx: Transaction }
  | { type: 'tx/delete'; id: string }
  | { type: 'tx/restore'; tx: Transaction }
  | { type: 'budget/set'; budget: Budget }
  | { type: 'goal/add'; goal: Omit<Goal, 'id' | 'createdAt'> }
  | { type: 'goal/update'; goal: Goal }
  | { type: 'goal/delete'; id: string }
  | { type: 'goal/deposit'; id: string; amount: Money }
  | { type: 'profile/update'; patch: Partial<Profile> }
  | { type: 'learn/read'; id: string; day: string }
  | { type: 'learn/task'; id: string; day: string; done: boolean }
  | { type: 'alerts/shown'; ids: string[] }
  | { type: 'tx/import'; txs: Omit<Transaction, 'id' | 'createdAt'>[]; rules: Omit<CategoryRule, 'id' | 'createdAt'>[]; account?: Account }
  | { type: 'tx/recategorize'; ids: string[]; categoryId: string }
  | { type: 'tx/autocategorize'; categories: Record<string, string> }
  | { type: 'account/upsert'; account: Account }
  | { type: 'account/delete'; id: string }
  | { type: 'rule/upsert'; rule: Omit<CategoryRule, 'id' | 'createdAt'> }
  | { type: 'rule/delete'; id: string }
  | { type: 'reset/demo' }
  | { type: 'reset/empty' }
  | { type: 'import'; state: AppState };

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'tx/add':
      return { ...s, transactions: [...s.transactions, { ...a.tx, id: uid(), createdAt: Date.now() }] };
    case 'tx/update':
      return { ...s, transactions: s.transactions.map((t) => (t.id === a.tx.id ? a.tx : t)) };
    case 'tx/delete':
      return { ...s, transactions: s.transactions.filter((t) => t.id !== a.id) };
    case 'tx/restore':
      return s.transactions.some((t) => t.id === a.tx.id) ? s : { ...s, transactions: [...s.transactions, a.tx] };
    case 'tx/import': {
      const now = Date.now();
      const accounts = a.account ? upsertById(s.accounts, a.account) : s.accounts;
      let rules = s.rules;
      for (const r of a.rules) rules = upsertRule(rules, r);
      return {
        ...s,
        accounts,
        rules,
        transactions: [...s.transactions, ...a.txs.map((t, i) => ({ ...t, id: uid() + i.toString(36), createdAt: now + i }))],
      };
    }
    case 'tx/autocategorize': {
      const c = a.categories;
      return { ...s, transactions: s.transactions.map((t) => (c[t.id] && t.categoryId === 'auto' ? { ...t, categoryId: c[t.id] } : t)) };
    }
    case 'tx/recategorize': {
      const ids = new Set(a.ids);
      return { ...s, transactions: s.transactions.map((t) => (ids.has(t.id) && t.categoryId !== a.categoryId ? { ...t, categoryId: a.categoryId } : t)) };
    }
    case 'account/upsert':
      return { ...s, accounts: upsertById(s.accounts, a.account) };
    case 'account/delete':
      // операции удалённого счёта не теряются — переходят в «Наличные / основной»
      return {
        ...s,
        accounts: s.accounts.filter((x) => x.id !== a.id),
        transactions: s.transactions.map((t) => (t.accountId === a.id ? { ...t, accountId: undefined } : t)),
      };
    case 'rule/upsert':
      return { ...s, rules: upsertRule(s.rules, a.rule) };
    case 'rule/delete':
      return { ...s, rules: s.rules.filter((r) => r.id !== a.id) };
    case 'budget/set':
      // при изменении лимитов предупреждения для текущего месяца показываются заново
      return { ...s, budget: a.budget, alertsShown: [] };
    case 'goal/add':
      return { ...s, goals: [...s.goals, { ...a.goal, id: uid(), createdAt: Date.now() }] };
    case 'goal/update':
      return { ...s, goals: s.goals.map((g) => (g.id === a.goal.id ? a.goal : g)) };
    case 'goal/delete':
      return { ...s, goals: s.goals.filter((g) => g.id !== a.id) };
    case 'goal/deposit':
      return {
        ...s,
        goals: s.goals.map((g) => (g.id === a.id ? { ...g, saved: Math.max(0, g.saved + a.amount) } : g)),
      };
    case 'profile/update':
      return { ...s, profile: { ...s.profile, ...a.patch } };
    case 'learn/read': {
      if (s.learning.readArticles.includes(a.id)) return s;
      const day = s.learning.doneTasks[a.day] ?? [];
      return {
        ...s,
        learning: {
          ...s.learning,
          readArticles: [...s.learning.readArticles, a.id],
          doneTasks: { ...s.learning.doneTasks, [a.day]: day.includes('__read__') ? day : [...day, '__read__'] },
        },
      };
    }
    case 'learn/task': {
      const day = s.learning.doneTasks[a.day] ?? [];
      const next = a.done ? (day.includes(a.id) ? day : [...day, a.id]) : day.filter((x) => x !== a.id);
      return { ...s, learning: { ...s.learning, doneTasks: { ...s.learning.doneTasks, [a.day]: next } } };
    }
    case 'alerts/shown':
      return { ...s, alertsShown: [...new Set([...s.alertsShown, ...a.ids])] };
    case 'reset/demo':
      return { ...demoState(todayISO()), profile: { ...demoState(todayISO()).profile, theme: s.profile.theme } };
    case 'reset/empty':
      return { ...emptyState(s.profile.name), profile: { ...s.profile, startingBalance: 0 } };
    case 'import':
      return a.state;
  }
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
}

function upsertRule(rules: CategoryRule[], r: Omit<CategoryRule, 'id' | 'createdAt'>): CategoryRule[] {
  const ex = rules.find((x) => x.pattern === r.pattern && x.type === r.type);
  if (ex) return ex.categoryId === r.categoryId ? rules : rules.map((x) => (x === ex ? { ...x, categoryId: r.categoryId } : x));
  return [...rules, { ...r, id: uid(), createdAt: Date.now() }];
}

export type { Action };

interface Ctx {
  state: AppState;
  dispatch: (a: Action) => void;
  today: string;
}

const StoreCtx = createContext<Ctx | null>(null);

function init(): AppState {
  return loadState() ?? demoState(todayISO());
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  useEffect(() => {
    // сохраняем после каждого изменения (и сразу при первом запуске, чтобы демо-данные не пересоздавались)
    saveState(state);
  }, [state]);

  // тема
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const t = state.profile.theme;
      const dark = t === 'dark' || (t === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.dataset.accent = state.profile.accent ?? 'green';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#060C1C' : '#F3F6FB');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [state.profile.theme, state.profile.accent]);

  const today = todayISO();
  const value = useMemo(() => ({ state, dispatch, today }), [state, today]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('useStore outside provider');
  return c;
}

/** HEX акцентного цвета — для графиков и SVG, где CSS-переменные не работают */
export function useAccentHex(shade: 300 | 400 | 500 = 400) {
  const { state } = useStore();
  return accentHex(state.profile.accent, shade);
}
