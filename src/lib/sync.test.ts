import { describe, expect, it } from 'vitest';
import { diffState, fullUpload } from './sync';
import { mergeStates } from '../store/Cloud';
import { demoState } from './seed';

describe('синхронизация', () => {
  const base = demoState('2026-10-30');

  it('без изменений — нет операций', () => {
    expect(diffState(base, base)).toEqual([]);
  });

  it('добавление, изменение и удаление операций', () => {
    const [a, b, ...rest] = base.transactions;
    const next = { ...base, transactions: [{ ...a, amount: a.amount + 100 }, ...rest, { ...b, id: 'new1' }] };
    const ops = diffState(base, next);
    expect(ops.filter((o) => o.op === 'upsert').map((o) => o.id).sort()).toEqual([a.id, 'new1'].sort());
    expect(ops.filter((o) => o.op === 'delete').map((o) => o.id)).toEqual([b.id]);
  });

  it('настройки отправляются при изменении профиля/бюджета', () => {
    const next = { ...base, budget: { ...base.budget, monthlyLimit: 1 } };
    expect(diffState(base, next)).toEqual([{ kind: 'settings', id: 'main', op: 'upsert', data: expect.objectContaining({ budget: next.budget }) }]);
  });

  it('полная выгрузка содержит всё', () => {
    const ops = fullUpload(base);
    expect(ops.length).toBe(1 + base.transactions.length + base.goals.length + base.accounts.length + base.rules.length);
  });

  it('объединение не задваивает операции из выписок', () => {
    const t = { ...base.transactions[0], id: 'x1', externalId: 'ext1' };
    const cloud = { ...base, transactions: [t] };
    const local = { ...base, transactions: [{ ...t, id: 'x2' }, { ...t, id: 'x3', externalId: 'ext2' }] };
    expect(mergeStates(cloud, local).transactions.map((x) => x.id)).toEqual(['x1', 'x3']);
  });
});

import { applyRemote } from './sync';
describe('мгновенная синхронизация', () => {
  const base = demoState('2026-10-30');
  const row = { id: 'rt1', type: 'expense', amount: 77700, category_id: 'transport', date: '2026-10-30', note: 'Такси', account_id: null, source: 'manual', external_id: null, raw_description: null, created_at: 5 };
  it('новая операция с другого устройства появляется', () => {
    const s = applyRemote(base, 'transactions', 'INSERT', row, null);
    expect(s.transactions.length).toBe(base.transactions.length + 1);
    expect(s.transactions.at(-1)).toMatchObject({ id: 'rt1', amount: 77700, note: 'Такси' });
  });
  it('эхо своей записи не меняет состояние', () => {
    const s1 = applyRemote(base, 'transactions', 'INSERT', row, null);
    expect(applyRemote(s1, 'transactions', 'UPDATE', row, null)).toBe(s1);
  });
  it('изменение и удаление', () => {
    const s1 = applyRemote(base, 'transactions', 'INSERT', row, null);
    const s2 = applyRemote(s1, 'transactions', 'UPDATE', { ...row, amount: 100 }, null);
    expect(s2.transactions.find((t) => t.id === 'rt1')?.amount).toBe(100);
    const s3 = applyRemote(s2, 'transactions', 'DELETE', null, { id: 'rt1' });
    expect(s3.transactions.some((t) => t.id === 'rt1')).toBe(false);
    expect(applyRemote(s3, 'transactions', 'DELETE', null, { id: 'rt1' })).toBe(s3);
  });
  it('настройки', () => {
    const s = applyRemote(base, 'user_settings', 'UPDATE', { profile: base.profile, budget: { ...base.budget, monthlyLimit: 1 }, learning: base.learning, alerts_shown: base.alertsShown }, null);
    expect(s.budget.monthlyLimit).toBe(1);
    expect(applyRemote(s, 'user_settings', 'UPDATE', { profile: s.profile, budget: s.budget, learning: s.learning, alerts_shown: s.alertsShown }, null)).toBe(s);
  });
});
