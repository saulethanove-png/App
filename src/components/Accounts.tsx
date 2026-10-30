import { useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import type { Account, BankId } from '../types';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toasts';
import { CASH_ACCOUNT, accountBalances } from '../lib/calc';
import { BANKS } from '../lib/bankImport';
import { formatMoney, moneyToInput, parseMoney, prettifyInput, uid } from '../lib/format';
import { BankBadge } from './ImportWizard';
import { Card, Field, Modal, SectionHeader, cx } from './ui';

export function AccountsCard({ onImport }: { onImport: () => void }) {
  const { state, today } = useStore();
  const [edit, setEdit] = useState<Account | 'new' | 'cash' | null>(null);
  const bals = accountBalances(state, today);
  const list: { id: string; name: string; bank: BankId | 'cash'; sub: string }[] = [
    { id: CASH_ACCOUNT, name: 'Наличные / основной', bank: 'cash', sub: 'Операции без счёта' },
    ...state.accounts.map((a) => ({ id: a.id, name: a.name, bank: a.bank, sub: BANKS.find((b) => b.id === a.bank)?.name ?? '' })),
  ];
  const counts = new Map<string, number>();
  for (const t of state.transactions) {
    const k = t.accountId && state.accounts.some((a) => a.id === t.accountId) ? t.accountId : CASH_ACCOUNT;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  return (
    <Card className="p-3 sm:p-4">
      <div className="px-2 pt-1">
        <SectionHeader
          title="Счета"
          action={
            <div className="flex gap-1.5">
              <button className="btn-ghost px-3 py-2 text-[13px]" onClick={() => setEdit('new')}><Plus className="h-4 w-4" /> Счёт</button>
              <button className="btn-dark px-3 py-2 text-[13px]" onClick={onImport}><Upload className="h-4 w-4" /> Выписка</button>
            </div>
          }
        />
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {list.map((a) => (
          <button
            key={a.id}
            onClick={() => setEdit(a.id === CASH_ACCOUNT ? 'cash' : state.accounts.find((x) => x.id === a.id)!)}
            className="flex items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-navy-50 dark:hover:bg-navy-850"
          >
            <BankBadge bank={a.bank} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{a.name}</div>
              <div className="truncate text-[12px] text-navy-400">{a.sub} · {counts.get(a.id) ?? 0} операций</div>
            </div>
            <div className={cx('shrink-0 pr-1 text-[15px] font-bold tabular-nums', (bals.get(a.id) ?? 0) < 0 && 'text-rose-500')}>{formatMoney(bals.get(a.id) ?? 0)}</div>
          </button>
        ))}
      </div>
      {state.accounts.length === 0 && (
        <button onClick={onImport} className="mx-2 mb-1 mt-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-2xl border border-dashed border-navy-200 p-3 text-left text-[13px] text-navy-500 hover:border-mint-400 dark:border-navy-700 dark:text-navy-300">
          <BankBadge bank="kaspi" size="sm" />
          Загрузите выписку Kaspi или другого банка — операции разложатся по категориям автоматически.
        </button>
      )}
      <AccountForm key={typeof edit === 'object' && edit ? edit.id : String(edit)} value={edit} onClose={() => setEdit(null)} />
    </Card>
  );
}

function AccountForm({ value, onClose }: { value: Account | 'new' | 'cash' | null; onClose: () => void }) {
  const { state, dispatch, today } = useStore();
  const toast = useToast();
  const acc = typeof value === 'object' ? value : null;
  const isCash = value === 'cash';
  const bals = accountBalances(state, today);
  const currentBal = isCash ? bals.get(CASH_ACCOUNT) ?? 0 : acc ? bals.get(acc.id) ?? 0 : 0;
  const [name, setName] = useState(acc?.name ?? '');
  const [bank, setBank] = useState<BankId>(acc?.bank ?? 'kaspi');
  const [bal, setBal] = useState(value && value !== 'new' ? prettifyInput(moneyToInput(Math.abs(currentBal))) : '');
  const [negative, setNegative] = useState(currentBal < 0);
  const [err, setErr] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState(false);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!isCash && !name.trim()) er.name = 'Введите название';
    const p = bal.trim() ? parseMoney(bal, { allowZero: true }) : ({ ok: true, value: 0 } as const);
    if (!p.ok) er.bal = p.error;
    setErr(er);
    if (Object.keys(er).length || !p.ok) return;
    const target = negative ? -p.value : p.value;
    const delta = target - currentBal; // меняем начальный остаток так, чтобы текущий стал равен введённому
    if (isCash) {
      dispatch({ type: 'profile/update', patch: { startingBalance: state.profile.startingBalance + delta } });
    } else if (acc) {
      dispatch({ type: 'account/upsert', account: { ...acc, name: name.trim(), bank, startingBalance: acc.startingBalance + delta } });
    } else {
      dispatch({ type: 'account/upsert', account: { id: uid(), name: name.trim(), bank, startingBalance: target, createdAt: Date.now() } });
    }
    toast({ kind: 'success', title: 'Счёт сохранён' });
    onClose();
  };

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={isCash ? 'Наличные / основной' : acc ? 'Изменить счёт' : 'Новый счёт'}
      footer={
        <div className="flex gap-2">
          {acc && (
            <button
              className={cx('btn-danger', confirmDel ? 'flex-1' : 'px-3')}
              onClick={() => {
                if (!confirmDel) return setConfirmDel(true);
                dispatch({ type: 'account/delete', id: acc.id });
                toast({ kind: 'info', title: 'Счёт удалён', text: 'Его операции перенесены в «Наличные / основной»' });
                onClose();
              }}
              aria-label="Удалить счёт"
            >
              <Trash2 className="h-4 w-4" /> {confirmDel && 'Точно удалить?'}
            </button>
          )}
          <button type="submit" form="acc-form" className="btn-primary flex-1 py-3">Сохранить</button>
        </div>
      }
    >
      <form id="acc-form" onSubmit={save} className="space-y-4 pb-2" noValidate>
        {!isCash && (
          <>
            <Field label="Название" error={err.name}>
              <input className={cx('input', err.name && 'input-error')} value={name} onChange={(e) => setName(e.target.value)} placeholder="Kaspi Gold" />
            </Field>
            <div>
              <span className="label">Банк</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {BANKS.map((b) => (
                  <button type="button" key={b.id} onClick={() => setBank(b.id)} className={cx('flex items-center gap-2 rounded-xl border-2 p-2 text-[12px] font-semibold', bank === b.id ? 'border-mint-400 bg-mint-400/10' : 'border-navy-100 dark:border-navy-800')}>
                    <BankBadge bank={b.id} size="sm" /> <span className="truncate">{b.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        <Field label="Текущий остаток, ₸" error={err.bal} hint="Сколько денег на счёте сейчас — приложение подстроит баланс под эту сумму.">
          <div className="flex gap-2">
            <button type="button" onClick={() => setNegative(!negative)} className="btn-ghost w-12 shrink-0 text-lg" aria-label="Знак остатка">{negative ? '−' : '+'}</button>
            <input inputMode="decimal" className={cx('input', err.bal && 'input-error')} value={bal} onChange={(e) => setBal(prettifyInput(e.target.value))} placeholder="0" />
          </div>
        </Field>
      </form>
    </Modal>
  );
}
