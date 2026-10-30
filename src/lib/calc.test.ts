import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import {
  avgDaily, balance, budgetStatus, byCategory, currentMonthPeriod, goalProgress, monthlyToGoal,
  newBudgetAlerts, prevPeriod, totals, dailySeries,
} from './calc';
import { formatMoney, parseMoney, prettifyInput } from './format';
import { demoState } from './seed';

let n = 0;
const tx = (type: Transaction['type'], tenge: number, categoryId: string, date: string): Transaction => ({
  id: String(++n), type, amount: Math.round(tenge * 100), categoryId, date, createdAt: n,
});

describe('parseMoney', () => {
  it('разбирает суммы с пробелами и запятой', () => {
    expect(parseMoney('12 500,50')).toEqual({ ok: true, value: 1250050 });
    expect(parseMoney('0.1')).toEqual({ ok: true, value: 10 });
    expect(parseMoney('1000')).toEqual({ ok: true, value: 100000 });
  });
  it('отклоняет неверный ввод', () => {
    expect(parseMoney('').ok).toBe(false);
    expect(parseMoney('0').ok).toBe(false);
    expect(parseMoney('-5').ok).toBe(false);
    expect(parseMoney('1,234').ok).toBe(false);
    expect(parseMoney('abc').ok).toBe(false);
    expect(parseMoney('999999999999999').ok).toBe(false);
  });
  it('форматирует ввод', () => {
    expect(prettifyInput('1250000')).toBe('1 250 000');
    expect(prettifyInput('1250,555')).toBe('1 250,55');
    expect(prettifyInput('007')).toBe('7');
  });
});

describe('formatMoney', () => {
  it('без копеек для целых сумм', () => {
    expect(formatMoney(1250000).replace(/\s/g, ' ')).toBe('12 500 ₸');
    expect(formatMoney(-1250050).replace(/\s/g, ' ')).toBe('−12 500,50 ₸');
    expect(formatMoney(500, { sign: true })).toBe('+5 ₸');
  });
});

describe('расчёты', () => {
  const list = [
    tx('income', 100000, 'salary', '2026-10-05'),
    tx('expense', 0.1, 'food', '2026-10-06'),
    tx('expense', 0.2, 'food', '2026-10-06'),
    tx('expense', 30000, 'housing', '2026-10-01'),
    tx('expense', 5000, 'fun', '2026-09-30'),
    tx('expense', 9999, 'food', '2026-11-02'), // будущая операция
  ];

  it('нет ошибок плавающей точки: 0.1 + 0.2', () => {
    const t = totals(list.filter((x) => x.categoryId === 'food' && x.date < '2026-11-01'));
    expect(t.expense).toBe(30); // ровно 0,30 ₸
  });

  it('баланс = старт + доходы − расходы, будущие не учитываются', () => {
    const b = balance({ profile: { name: '', startingBalance: 5000000, theme: 'system', createdAt: 0 }, transactions: list }, '2026-10-30');
    expect(b).toBe(5000000 + 10000000 - 30 - 3000000 - 500000);
  });

  it('категории отсортированы и доли в сумме 1', () => {
    const c = byCategory(list.filter((x) => x.date.startsWith('2026-10')));
    expect(c[0].categoryId).toBe('housing');
    expect(c.reduce((a, b) => a + b.share, 0)).toBeCloseTo(1);
  });

  it('периоды', () => {
    expect(currentMonthPeriod('2026-10-30')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(prevPeriod({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(prevPeriod({ from: '2026-10-24', to: '2026-10-30' })).toEqual({ from: '2026-10-17', to: '2026-10-23' });
    expect(prevPeriod({ from: '2026-01-01', to: '2026-01-31' })).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('дневной ряд покрывает все дни периода', () => {
    const d = dailySeries(list, { from: '2026-10-01', to: '2026-10-07' });
    expect(d).toHaveLength(7);
    expect(d[5].expense).toBe(30);
  });

  it('средний расход считает только прошедшие дни', () => {
    const a = avgDaily(list, { from: '2026-10-01', to: '2026-10-31' }, '2026-10-10');
    expect(a).toBe(300000);
  });
});

describe('бюджет', () => {
  const month = [tx('expense', 80000, 'food', '2026-10-02'), tx('expense', 20000, 'fun', '2026-10-03')];
  const budget = { monthlyLimit: 12500000, categoryLimits: { food: 8000000, fun: 4000000 } };

  it('уровни 80% и 100%', () => {
    const s = budgetStatus(budget, month);
    expect(s.total?.level).toBe('warn'); // 100 000 из 125 000 = 80%
    expect(s.categories.find((c) => c.key === 'food')?.level).toBe('over');
    expect(s.categories.find((c) => c.key === 'fun')?.level).toBe('ok');
  });

  it('уведомление показывается один раз', () => {
    const a1 = newBudgetAlerts(budget, month, '2026-10', []);
    expect(a1.map((a) => a.id).sort()).toEqual(['2026-10:food:100', '2026-10:total:80']);
    const a2 = newBudgetAlerts(budget, month, '2026-10', a1.map((a) => a.id));
    expect(a2).toHaveLength(0);
  });
});

describe('цели', () => {
  it('прогресс и взнос', () => {
    expect(goalProgress(31000000, 45000000).percent).toBe(68);
    expect(goalProgress(50000000, 45000000)).toMatchObject({ ratio: 1, left: 0, done: true });
    expect(monthlyToGoal(14000000, '2026-10-30', '2027-01-30')).toBe(Math.ceil(14000000 / 3));
  });
});

describe('демо-данные', () => {
  it('генерируются без будущих дат и с положительными суммами', () => {
    const s = demoState('2026-10-30');
    expect(s.transactions.length).toBeGreaterThan(80);
    expect(s.transactions.every((t) => t.date <= '2026-10-30' && t.amount > 0 && Number.isInteger(t.amount))).toBe(true);
  });
});
