export type TxType = 'income' | 'expense';

/** Все суммы хранятся в тиынах (целое число, 1 ₸ = 100 тиын), чтобы не было ошибок округления. */
export type Money = number;

export interface Transaction {
  id: string;
  type: TxType;
  amount: Money;
  categoryId: string;
  /** Локальная дата в формате YYYY-MM-DD */
  date: string;
  note?: string;
  createdAt: number;
  /** Счёт; если не указан — «Наличные / основной» */
  accountId?: string;
  /** Откуда операция: вручную или из выписки банка */
  source?: 'manual' | 'import' | 'wallet';
  /** Отпечаток операции из выписки — защищает от повторного импорта */
  externalId?: string;
  /** Исходное описание из выписки (по нему обучаются правила категорий) */
  rawDescription?: string;
}

export type BankId = 'kaspi' | 'halyk' | 'freedom' | 'jusan' | 'alatau' | 'bcc' | 'forte' | 'other';

export interface Account {
  id: string;
  name: string;
  bank: BankId;
  /** Остаток счёта до первой учтённой операции */
  startingBalance: Money;
  createdAt: number;
}

/** Правило автокатегоризации: если описание содержит pattern — ставим categoryId */
export interface CategoryRule {
  id: string;
  pattern: string;
  categoryId: string;
  type: TxType;
  createdAt: number;
}

export interface Goal {
  id: string;
  title: string;
  emoji: string;
  target: Money;
  saved: Money;
  deadline?: string;
  createdAt: number;
}

export interface Budget {
  /** Общий месячный лимит расходов, null — не задан */
  monthlyLimit: Money | null;
  /** Лимиты по категориям расходов */
  categoryLimits: Record<string, Money>;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Profile {
  name: string;
  /** Деньги, которые были у пользователя до начала учёта */
  startingBalance: Money;
  theme: ThemeMode;
  /** акцентный цвет оформления */
  accent?: import('./lib/theme').AccentId;
  createdAt: number;
}

export interface LearningState {
  readArticles: string[];
  /** ключ: YYYY-MM-DD, значение: id выполненных заданий в этот день */
  doneTasks: Record<string, string[]>;
  bonusXp: number;
}

export interface AppState {
  version: 1;
  profile: Profile;
  transactions: Transaction[];
  goals: Goal[];
  accounts: Account[];
  rules: CategoryRule[];
  budget: Budget;
  learning: LearningState;
  /** Пороги бюджета, о которых уже предупредили: "2026-10:total:80" */
  alertsShown: string[];
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  color: string;
  type: TxType;
}
