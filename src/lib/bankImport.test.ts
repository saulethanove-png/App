import { describe, expect, it } from 'vitest';
import { detectColumns, parseAmount, parseDate, parseKaspiLines, sheetToDrafts } from './bankImport';
import { merchantKey, suggestCategory } from './categorize';
import type { CategoryRule } from '../types';

describe('разбор сумм и дат', () => {
  it('суммы', () => {
    expect(parseAmount('- 2 500,00 ₸')).toBe(-250000);
    expect(parseAmount('+50 000,50')).toBe(5000050);
    expect(parseAmount('1,234.56')).toBe(123456);
    expect(parseAmount('1 234')).toBe(123400);
    expect(parseAmount('(700)')).toBe(-70000);
    expect(parseAmount(-1500.5)).toBe(-150050);
    expect(parseAmount('—')).toBeNull();
  });
  it('даты', () => {
    expect(parseDate('29.10.24')).toBe('2024-10-29');
    expect(parseDate('01/02/2026')).toBe('2026-02-01');
    expect(parseDate('2026-10-05 12:30')).toBe('2026-10-05');
    expect(parseDate(45597)).toBe('2024-11-01');
    expect(parseDate('31.02.2026')).toBeNull();
  });
});

describe('Kaspi', () => {
  const lines = [
    'Kaspi Gold ВЫПИСКА',
    'Доступно на 30.10.26 + 154 320,00 ₸',
    'Дата Сумма Операция Детали',
    '29.10.26 - 2 500,00 ₸ Покупка Magnum Cash&Carry',
    '29.10.26 - 2 500,00 ₸ Покупка Magnum Cash&Carry',
    '28.10.26 + 50 000,00 ₸ Пополнение С Kaspi Депозита',
    '27.10.26 - 1 200,00 ₸ Покупка Yandex.Go',
    '26.10.26 - 15 000,00 ₸ Перевод Айгерим С.',
    '25.10.26 + 420 000,00 ₸ Пополнение Зарплата ТОО «Колледж»',
    '24.10.26 - 3 490,00 ₸ Покупка ТОО "Европа-',
    'Фарма" Аптека',
    '1 из 3',
  ];
  const r = parseKaspiLines(lines);
  it('находит все операции и остаток', () => {
    expect(r.drafts).toHaveLength(7);
    expect(r.closingBalance).toBe(15432000);
    expect(r.drafts[0]).toMatchObject({ date: '2026-10-29', amount: 250000, type: 'expense', operation: 'Покупка', description: 'Magnum Cash&Carry' });
    expect(r.drafts[2].type).toBe('income');
    expect(r.drafts[6].description).toBe('ТОО "Европа- Фарма" Аптека');
  });
  it('одинаковые операции в один день получают разные отпечатки', () => {
    expect(r.drafts[0].externalId).not.toBe(r.drafts[1].externalId);
    expect(parseKaspiLines(lines).drafts[1].externalId).toBe(r.drafts[1].externalId);
  });
  it('категории', () => {
    const cats = r.drafts.map((d) => suggestCategory(d.description, d.type, [], d.operation).categoryId);
    expect(cats).toEqual(['food', 'food', 'other-inc', 'transport', 'other-exp', 'salary', 'health']);
  });
});

describe('CSV / Excel', () => {
  it('колонки «Списание/Зачисление»', () => {
    const rows = [
      ['Выписка по счёту'],
      ['Дата операции', 'Описание', 'Списание', 'Зачисление', 'Валюта'],
      ['05.10.2026', 'SMALL ALMATY KZ', '3 200,00', '', 'KZT'],
      ['06.10.2026', 'Зарплата', '', '400000', 'KZT'],
      ['', 'Итого', '3200', '400000', ''],
    ];
    const map = detectColumns(rows);
    expect(map).toMatchObject({ headerRow: 1, date: 0, description: 1, debit: 2, credit: 3 });
    const r = sheetToDrafts(rows, map, 'halyk');
    expect(r.drafts.map((d) => [d.type, d.amount])).toEqual([['expense', 320000], ['income', 40000000]]);
  });
  it('одна колонка суммы со знаком', () => {
    const rows = [['Date', 'Amount', 'Details'], ['2026-10-01', -1500, 'NETFLIX.COM'], ['2026-10-02', 2000, 'Cashback']];
    const map = detectColumns(rows);
    const r = sheetToDrafts(rows, map, 'freedom');
    expect(r.drafts).toHaveLength(2);
    expect(suggestCategory(r.drafts[0].description, 'expense', []).categoryId).toBe('subscriptions');
    expect(suggestCategory(r.drafts[1].description, 'income', []).categoryId).toBe('invest');
  });
});

describe('обучение правилам', () => {
  it('правило пользователя важнее словаря', () => {
    const rules: CategoryRule[] = [{ id: '1', pattern: merchantKey('ТОО Magnum Cash&Carry Алматы'), categoryId: 'fun', type: 'expense', createdAt: 0 }];
    expect(rules[0].pattern).toBe('magnum cash&carry');
    expect(suggestCategory('Magnum Cash&Carry', 'expense', rules).categoryId).toBe('fun');
    expect(suggestCategory('Magnum Cash&Carry', 'expense', rules).reason).toBe('rule');
    expect(suggestCategory('MAGNUM SUPER', 'expense', rules).categoryId).toBe('food');
  });
});
