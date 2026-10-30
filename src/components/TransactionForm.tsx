import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Transaction, TxType } from '../types';
import { categoriesFor } from '../lib/categories';
import { moneyToInput, parseMoney, prettifyInput, todayISO, addDays } from '../lib/format';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toasts';
import { Field, Modal, Segmented, cx } from './ui';
import { merchantKey, normalize } from '../lib/categorize';
import { getCategory } from '../lib/categories';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Если передана — режим редактирования */
  editing?: Transaction | null;
  defaultType?: TxType;
}

export function TransactionForm({ open, onClose, editing, defaultType = 'expense' }: Props) {
  const { state, dispatch } = useStore();
  const [accountId, setAccountId] = useState<string>('');
  const toast = useToast();
  const [type, setType] = useState<TxType>(defaultType);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setConfirmDelete(false);
    if (editing) {
      setType(editing.type);
      setAmount(prettifyInput(moneyToInput(editing.amount)));
      setCategoryId(editing.categoryId);
      setDate(editing.date);
      setNote(editing.note ?? '');
      setAccountId(editing.accountId && state.accounts.some((a) => a.id === editing.accountId) ? editing.accountId : '');
    } else {
      setType(defaultType);
      setAmount('');
      setCategoryId('');
      setDate(todayISO());
      setNote('');
      setAccountId('');
      setTimeout(() => amountRef.current?.focus(), 250);
    }
  }, [open, editing, defaultType]);

  const cats = categoriesFor(type);

  const switchType = (t: TxType) => {
    setType(t);
    if (!categoriesFor(t).some((c) => c.id === categoryId)) setCategoryId('');
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    const p = parseMoney(amount);
    if (!p.ok) errs.amount = p.error;
    if (!categoryId) errs.category = 'Выберите категорию';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errs.date = 'Укажите дату';
    else if (date > addDays(todayISO(), 365)) errs.date = 'Дата слишком далеко в будущем';
    else if (date < '2000-01-01') errs.date = 'Слишком ранняя дата';
    if (note.length > 140) errs.note = 'Не больше 140 символов';
    setErrors(errs);
    if (Object.keys(errs).length || !p.ok) return;

    const data = { type, amount: p.value, categoryId, date, note: note.trim() || undefined, accountId: accountId || undefined };
    if (editing) {
      dispatch({ type: 'tx/update', tx: { ...editing, ...data } });
      // обучение: исправили категорию у операции из выписки — запоминаем мерчанта
      const pattern = editing.rawDescription ? merchantKey(editing.rawDescription) : '';
      if (pattern.length >= 3 && editing.categoryId !== categoryId && editing.type === type) {
        dispatch({ type: 'rule/upsert', rule: { pattern, categoryId, type } });
        const similar = state.transactions.filter(
          (t) => t.id !== editing.id && t.type === type && t.categoryId !== categoryId && t.rawDescription && normalize(t.rawDescription).includes(pattern),
        );
        const cat = getCategory(categoryId);
        toast(
          similar.length
            ? { kind: 'success', title: `Запомнил: «${pattern}» → ${cat.emoji} ${cat.name}`, text: `Найдено ещё ${similar.length} похожих операций`, action: { label: 'Применить', onClick: () => dispatch({ type: 'tx/recategorize', ids: similar.map((t) => t.id), categoryId }) } }
            : { kind: 'success', title: `Запомнил: «${pattern}» → ${cat.emoji} ${cat.name}`, text: 'Новые операции из выписок получат эту категорию' },
          8000,
        );
      } else toast({ kind: 'success', title: 'Операция обновлена' });
    } else {
      dispatch({ type: 'tx/add', tx: data });
      toast({ kind: 'success', title: type === 'income' ? 'Доход добавлен' : 'Расход добавлен' });
    }
    onClose();
  };

  const remove = () => {
    if (!editing) return;
    if (!confirmDelete) return setConfirmDelete(true);
    const copy = editing;
    dispatch({ type: 'tx/delete', id: editing.id });
    toast({ kind: 'info', title: 'Операция удалена', action: { label: 'Отменить', onClick: () => dispatch({ type: 'tx/restore', tx: copy }) } }, 6000);
    onClose();
  };

  const quickDates = [
    { label: 'Сегодня', v: todayISO() },
    { label: 'Вчера', v: addDays(todayISO(), -1) },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Редактировать операцию' : 'Новая операция'}
      footer={
        <div className="flex gap-2">
          {editing && (
            <button type="button" onClick={remove} className={cx('btn-danger', confirmDelete ? 'flex-1' : 'px-3')} aria-label="Удалить операцию">
              <Trash2 className="h-4 w-4" />
              {confirmDelete && 'Точно удалить?'}
            </button>
          )}
          <button type="submit" form="tx-form" className="btn-primary flex-1 py-3 text-[15px]">
            {editing ? 'Сохранить' : 'Добавить'}
          </button>
        </div>
      }
    >
      <form id="tx-form" onSubmit={submit} className="space-y-5" noValidate>
        <Segmented
          value={type}
          onChange={switchType}
          options={[
            { value: 'expense', label: 'Расход' },
            { value: 'income', label: 'Доход' },
          ]}
        />

        <div>
          <span className="label">Сумма</span>
          <div className={cx('flex items-baseline gap-2 rounded-3xl border-2 px-5 py-4 transition', errors.amount ? 'border-rose-400' : 'border-navy-100 focus-within:border-mint-400 dark:border-navy-700')}>
            <span className={cx('text-2xl font-bold', type === 'income' ? 'text-mint-500' : 'text-navy-400')}>{type === 'income' ? '+' : '−'}</span>
            <input
              ref={amountRef}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amount}
              onChange={(e) => {
                setAmount(prettifyInput(e.target.value));
                if (errors.amount) setErrors((x) => ({ ...x, amount: '' }));
              }}
              className="w-full min-w-0 bg-transparent text-[34px] font-extrabold tracking-tight tabular-nums outline-none placeholder:text-navy-200 dark:placeholder:text-navy-700"
              aria-label="Сумма в тенге"
              aria-invalid={!!errors.amount}
            />
            <span className="text-2xl font-bold text-navy-300">₸</span>
          </div>
          {errors.amount && <span className="mt-1.5 block text-[13px] font-medium text-rose-500">{errors.amount}</span>}
        </div>

        <div>
          <span className="label">Категория</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
            {cats.map((c) => {
              const active = c.id === categoryId;
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    setCategoryId(c.id);
                    if (errors.category) setErrors((x) => ({ ...x, category: '' }));
                  }}
                  className={cx(
                    'flex flex-col items-center gap-1 rounded-2xl border-2 px-1 py-2.5 text-center transition',
                    active ? 'border-mint-400 bg-mint-400/10' : 'border-transparent bg-navy-50 hover:bg-navy-100 dark:bg-navy-850 dark:hover:bg-navy-800',
                  )}
                  aria-pressed={active}
                >
                  <span className="text-2xl" aria-hidden>{c.emoji}</span>
                  <span className="text-[12px] font-semibold leading-tight">{c.name}</span>
                </button>
              );
            })}
          </div>
          {errors.category && <span className="mt-1.5 block text-[13px] font-medium text-rose-500">{errors.category}</span>}
        </div>

        <Field label="Дата" error={errors.date}>
          <div className="flex gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cx('input', errors.date && 'input-error')} max={addDays(todayISO(), 365)} />
            {quickDates.map((q) => (
              <button type="button" key={q.label} onClick={() => setDate(q.v)} className={cx('chip hidden sm:inline-flex', date === q.v && 'chip-active')}>
                {q.label}
              </button>
            ))}
          </div>
        </Field>

        {state.accounts.length > 0 && (
          <Field label="Счёт">
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Наличные / основной</option>
              {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        )}

        {editing?.rawDescription && (
          <div className="rounded-2xl bg-navy-50 px-3 py-2 text-[12px] text-navy-500 dark:bg-navy-850 dark:text-navy-300">
            Из выписки: <span className="font-semibold">{editing.rawDescription}</span>. Смените категорию — приложение запомнит этот магазин.
          </div>
        )}

        <Field label="Комментарий (необязательно)" error={errors.note}>
          <input
            className={cx('input', errors.note && 'input-error')}
            placeholder="Например: обед с коллегами"
            value={note}
            maxLength={160}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
