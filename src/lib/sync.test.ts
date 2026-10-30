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
