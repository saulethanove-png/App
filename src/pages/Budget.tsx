import { useMemo, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toasts';
import { EXPENSE_CATEGORIES, getCategory } from '../lib/categories';
import { formatMoney, monthName, moneyToInput, parseISO, parseMoney, prettifyInput } from '../lib/format';
import { budgetStatus, byCategory, currentMonthPeriod, inPeriod, prevPeriod } from '../lib/calc';
import { BUDGET_RULES } from '../lib/learn';
import { Card, CategoryIcon, Field, Modal, Progress, SectionHeader, cx } from '../components/ui';
import type { Money } from '../types';

export function BudgetPage() {
  const { state, dispatch, today } = useStore();
  const toast = useToast();
  const [edit, setEdit] = useState<{ key: string } | null>(null);

  const month = currentMonthPeriod(today);
  const monthTx = useMemo(() => state.transactions.filter((t) => inPeriod(t, month)), [state.transactions, month.from]);
  const prevTx = useMemo(() => {
    const p = prevPeriod(month);
    return state.transactions.filter((t) => inPeriod(t, p));
  }, [state.transactions, month.from]);
  const bs = budgetStatus(state.budget, monthTx);
  const spentByCat = new Map(byCategory(monthTx).map((c) => [c.categoryId, c.amount]));
  const prevByCat = new Map(byCategory(prevTx).map((c) => [c.categoryId, c.amount]));
  const prevTotal = [...prevByCat.values()].reduce((a, b) => a + b, 0);

  const t = parseISO(today);
  const daysLeft = parseISO(month.to).getDate() - t.getDate() + 1;
  const perDay = bs.total && bs.total.left > 0 ? Math.floor(bs.total.left / daysLeft) : 0;

  const save = (key: string, value: Money | null) => {
    if (key === 'total') {
      dispatch({ type: 'budget/set', budget: { ...state.budget, monthlyLimit: value } });
    } else {
      const cl = { ...state.budget.categoryLimits };
      if (value == null) delete cl[key];
      else cl[key] = value;
      dispatch({ type: 'budget/set', budget: { ...state.budget, categoryLimits: cl } });
    }
    toast({ kind: 'success', title: value == null ? 'Лимит удалён' : 'Лимит сохранён' });
    setEdit(null);
  };

  const sumCatLimits = Object.values(state.budget.categoryLimits).reduce((a, b) => a + b, 0);
  const editingKey = edit?.key;
  const editingCurrent = editingKey === 'total' ? state.budget.monthlyLimit : editingKey ? state.budget.categoryLimits[editingKey] ?? null : null;
  const suggestion = editingKey === 'total' ? prevTotal : editingKey ? prevByCat.get(editingKey) ?? 0 : 0;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[26px] font-extrabold tracking-tight">Бюджет</h1>
        <div className="text-sm text-navy-400">{monthName(t.getMonth())} {t.getFullYear()} · осталось {daysLeft} дн.</div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:gap-6">
        {/* Общий лимит */}
        <section className="relative overflow-hidden rounded-[28px] bg-navy-900 p-6 text-white dark:bg-navy-850">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-mint-400/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-navy-200">Месячный лимит расходов</div>
              <button onClick={() => setEdit({ key: 'total' })} className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/15">
                <Pencil className="h-3.5 w-3.5" /> {bs.total ? 'Изменить' : 'Установить'}
              </button>
            </div>
            {bs.total ? (
              <>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div>
                    <div className="text-[13px] text-navy-300">Осталось</div>
                    <div className={cx('text-[34px] font-extrabold leading-tight tracking-tight tabular-nums', bs.total.left < 0 && 'text-rose-300')}>{formatMoney(bs.total.left)}</div>
                  </div>
                  <div className={cx('rounded-2xl px-3 py-1.5 text-lg font-extrabold', bs.total.level === 'over' ? 'bg-rose-500 text-white' : bs.total.level === 'warn' ? 'bg-amber-400 text-navy-950' : 'bg-mint-400 text-navy-950')}>
                    {Math.round(bs.total.ratio * 100)}%
                  </div>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/10">
                  <div className={cx('h-full rounded-full transition-[width] duration-700', bs.total.level === 'over' ? 'bg-rose-500' : bs.total.level === 'warn' ? 'bg-amber-400' : 'bg-mint-400')} style={{ width: `${Math.min(bs.total.ratio, 1) * 100}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-[13px] text-navy-300">
                  <span>Потрачено {formatMoney(bs.total.spent)}</span>
                  <span>из {formatMoney(bs.total.limit)}</span>
                </div>
                <div className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-sm">
                  {bs.total.left > 0 ? (
                    <>Можно тратить <b className="text-mint-300">{formatMoney(perDay)}</b> в день до конца месяца</>
                  ) : (
                    <>Лимит превышен на <b className="text-rose-300">{formatMoney(-bs.total.left)}</b>. Постарайтесь сократить необязательные траты.</>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-4 text-sm text-navy-300">
                Установите лимит — и приложение предупредит, когда вы потратите 80% и 100%.
                {prevTotal > 0 && <> В прошлом месяце расходы составили <b className="text-white">{formatMoney(prevTotal)}</b>.</>}
              </div>
            )}
          </div>
        </section>

        <Card className="p-5">
          <SectionHeader title="Правила бюджета" />
          <ol className="space-y-3">
            {BUDGET_RULES.map((r, i) => (
              <li key={r.title} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-mint-400/15 text-[12px] font-extrabold text-mint-600 dark:text-mint-300">{i + 1}</span>
                <div className="text-[13px] leading-snug"><b>{r.title}.</b> <span className="text-navy-500 dark:text-navy-300">{r.text}</span></div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card className="p-3 sm:p-5">
        <div className="px-2 sm:px-0">
          <SectionHeader title="Лимиты по категориям" action={state.budget.monthlyLimit != null && sumCatLimits > state.budget.monthlyLimit ? <span className="text-[12px] font-semibold text-amber-600">Сумма лимитов больше общего</span> : undefined} />
        </div>
        <div className="grid gap-x-6 lg:grid-cols-2">
          {EXPENSE_CATEGORIES.map((c) => {
            const row = bs.categories.find((r) => r.key === c.id);
            const spent = spentByCat.get(c.id) ?? 0;
            return (
              <button key={c.id} onClick={() => setEdit({ key: c.id })} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition hover:bg-navy-50 dark:hover:bg-navy-850">
                <CategoryIcon emoji={c.emoji} color={c.color} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[15px] font-semibold">{c.name}</span>
                    {row ? (
                      <span className={cx('text-[13px] font-bold tabular-nums', row.level === 'over' ? 'text-rose-500' : row.level === 'warn' ? 'text-amber-500' : 'text-navy-500 dark:text-navy-300')}>
                        {formatMoney(spent)} / {formatMoney(row.limit)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[13px] font-semibold text-navy-400">
                        {spent > 0 && <span className="tabular-nums">{formatMoney(spent)} · </span>}
                        <Plus className="h-3.5 w-3.5" /> лимит
                      </span>
                    )}
                  </div>
                  {row && (
                    <>
                      <Progress value={row.ratio} level={row.level} className="mt-2 h-2" />
                      <div className="mt-1 text-[12px] text-navy-400">
                        {row.level === 'over' ? `Превышен на ${formatMoney(-row.left)}` : row.level === 'warn' ? `⚠️ Использовано ${Math.floor(row.ratio * 100)}% · осталось ${formatMoney(row.left)}` : `Осталось ${formatMoney(row.left)}`}
                      </div>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <LimitModal
        key={editingKey ?? 'none'}
        open={!!edit}
        title={editingKey === 'total' ? 'Месячный лимит' : editingKey ? `Лимит: ${getCategory(editingKey).name}` : ''}
        current={editingCurrent}
        suggestion={suggestion}
        onClose={() => setEdit(null)}
        onSave={(v) => editingKey && save(editingKey, v)}
      />
    </div>
  );
}

function LimitModal({ open, title, current, suggestion, onClose, onSave }: {
  open: boolean; title: string; current: Money | null; suggestion: Money; onClose: () => void; onSave: (v: Money | null) => void;
}) {
  const [value, setValue] = useState(current != null ? prettifyInput(moneyToInput(current)) : '');
  const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseMoney(value);
    if (!p.ok) return setError(p.error);
    onSave(p.value);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          {current != null && <button type="button" className="btn-danger" onClick={() => onSave(null)}>Удалить лимит</button>}
          <button type="submit" form="limit-form" className="btn-primary flex-1 py-3">Сохранить</button>
        </div>
      }
    >
      <form id="limit-form" onSubmit={submit} className="space-y-4 pb-2" noValidate>
        <Field label="Сумма лимита на месяц, ₸" error={error}>
          <input
            autoFocus
            inputMode="decimal"
            className={cx('input text-lg font-bold', error && 'input-error')}
            placeholder="Например, 100 000"
            value={value}
            onChange={(e) => {
              setValue(prettifyInput(e.target.value));
              setError('');
            }}
          />
        </Field>
        {suggestion > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="w-full text-[12px] font-semibold text-navy-400">Подсказка по прошлому месяцу ({formatMoney(suggestion)}):</span>
            {[0.9, 1, 1.1].map((k) => {
              const v = Math.round((suggestion * k) / 100_000) * 100_000 || suggestion;
              return (
                <button key={k} type="button" className="chip" onClick={() => setValue(prettifyInput(moneyToInput(v)))}>
                  {k === 0.9 ? 'Сэкономить 10%' : k === 1 ? 'Как в прошлом' : '+10%'} · {formatMoney(v)}
                </button>
              );
            })}
          </div>
        )}
        <div className="text-[13px] text-navy-400">Вы получите уведомление, когда расходы достигнут 80% и 100% лимита.</div>
      </form>
    </Modal>
  );
}
