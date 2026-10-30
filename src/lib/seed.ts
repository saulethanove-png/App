import type { AppState, Transaction } from '../types';
import { addDays, parseISO, toISO, uid } from './format';

const T = (tenge: number) => Math.round(tenge * 100);

/** Детерминированный генератор случайных чисел — демо-данные одинаковы при каждом сбросе. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function emptyState(name = ''): AppState {
  return {
    version: 1,
    profile: { name, startingBalance: 0, theme: 'system', createdAt: Date.now() },
    transactions: [],
    goals: [],
    accounts: [],
    rules: [],
    budget: { monthlyLimit: null, categoryLimits: {} },
    learning: { readArticles: [], doneTasks: {}, bonusXp: 0 },
    alertsShown: [],
  };
}

/** Демо: 2 полных прошлых месяца + текущий месяц до сегодняшнего дня. */
export function demoState(today: string): AppState {
  const r = rng(20261030);
  const pick = <X,>(arr: X[]) => arr[Math.floor(r() * arr.length)];
  const between = (a: number, b: number, step = 50) => Math.round((a + r() * (b - a)) / step) * step;
  const txs: Transaction[] = [];
  let seq = 0;
  const add = (type: Transaction['type'], tenge: number, categoryId: string, date: string, note?: string) => {
    if (date > today) return;
    txs.push({ id: uid() + seq, type, amount: T(tenge), categoryId, date, note, createdAt: Date.now() - 1_000_000 + seq++ });
  };

  const t = parseISO(today);
  const start = toISO(new Date(t.getFullYear(), t.getMonth() - 2, 1));

  for (let d = start; d <= today; d = addDays(d, 1)) {
    const dt = parseISO(d);
    const dom = dt.getDate();
    const dow = dt.getDay();

    if (dom === 5) add('income', 420000, 'salary', d, 'Зарплата за месяц');
    if (dom === 20) add('income', 140000, 'salary', d, 'Аванс');
    if (dom === 14 && r() > 0.3) add('income', between(35000, 80000, 1000), 'side', d, pick(['Ремонт электроники', 'Репетиторство', 'Фриланс-проект']));
    if (dom === 25 && r() > 0.5) add('income', between(5000, 15000, 500), 'invest', d, 'Проценты по депозиту');

    if (dom === 1) add('expense', 150000, 'housing', d, 'Аренда квартиры');
    if (dom === 10) add('expense', between(16000, 24000, 100), 'housing', d, 'Коммунальные услуги');
    if (dom === 3) add('expense', 2990, 'subscriptions', d, 'Музыкальный сервис');
    if (dom === 12) add('expense', 3490, 'subscriptions', d, 'Онлайн-кинотеатр');
    if (dom === 18) add('expense', 4500, 'subscriptions', d, 'Мобильная связь');

    // продукты почти каждый день
    if (r() > 0.35) add('expense', between(1200, 5500), 'food', d, pick(['Магнум', 'Small', 'Базар', 'Кофейня', 'Обед', 'Продукты', undefined]));
    if (dow === 6) add('expense', between(12000, 19000, 100), 'food', d, 'Закупка на неделю');

    if (dow >= 1 && dow <= 5 && r() > 0.35) add('expense', pick([200, 200, 400, 1800, 2500]), 'transport', d, pick(['Автобус', 'Такси', undefined]));
    if (dom === 15) add('expense', between(12000, 18000, 100), 'transport', d, 'Бензин');

    if ((dow === 5 || dow === 6) && r() > 0.45) add('expense', between(4000, 15000, 100), 'fun', d, pick(['Кино', 'Кафе с друзьями', 'Боулинг', 'Концерт']));
    if (r() > 0.93) add('expense', between(6000, 35000, 500), 'shopping', d, pick(['Одежда', 'Кроссовки', 'Товары для дома', 'Подарок']));
    if (r() > 0.96) add('expense', between(2500, 12000, 100), 'health', d, pick(['Аптека', 'Анализы', 'Стоматолог']));
    if (dom === 8 && r() > 0.4) add('expense', between(8000, 25000, 500), 'education', d, pick(['Онлайн-курс', 'Книги', 'Вебинар']));
    if (r() > 0.97) add('expense', between(1000, 6000, 100), 'other-exp', d, pick(['Подарок коллеге', 'Ремонт обуви', 'Химчистка']));
    if (dom === 22 && r() > 0.6) add('income', between(10000, 30000, 1000), 'gifts', d, 'Подарок');
  }

  const now = Date.now();
  return {
    version: 1,
    profile: { name: 'Рахман', startingBalance: T(150000), theme: 'system', createdAt: now },
    transactions: txs,
    goals: [
      { id: uid() + 'g1', title: 'Финансовая подушка', emoji: '🛡', target: T(1_000_000), saved: T(420_000), createdAt: now - 3 },
      { id: uid() + 'g2', title: 'Новый телефон', emoji: '📱', target: T(450_000), saved: T(310_000), deadline: addDays(today, 90), createdAt: now - 2 },
      { id: uid() + 'g3', title: 'Путешествие', emoji: '✈️', target: T(800_000), saved: T(120_000), deadline: addDays(today, 240), createdAt: now - 1 },
    ],
    accounts: [],
    rules: [],
    budget: {
      monthlyLimit: T(520_000),
      categoryLimits: { food: T(140_000), transport: T(40_000), fun: T(35_000), shopping: T(45_000), subscriptions: T(15_000) },
    },
    learning: { readArticles: ['budget-50-30-20'], doneTasks: {}, bonusXp: 0 },
    alertsShown: [],
  };
}
