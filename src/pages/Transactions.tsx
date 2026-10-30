import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Plus, Search, Upload, X } from 'lucide-react';
import type { TxType } from '../types';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toasts';
import { useUI } from '../App';
import { categoriesFor, ALL_CATEGORIES, getCategory } from '../lib/categories';
import { formatDayHeader, formatMoney, monthName, parseISO } from '../lib/format';
import { CASH_ACCOUNT, monthPeriod, sortTx, totals } from '../lib/calc';
import { BankBadge } from '../components/ImportWizard';
import { transactionsToCSV, downloadText } from '../lib/csv';
import { TransactionItem } from '../components/TransactionItem';
import { Card, Empty, Segmented, cx } from '../components/ui';

export function Transactions() {
  const { state, today } = useStore();
  const { openAdd, openEdit, params, openImport } = useUI();
  const [acc, setAcc] = useState<string | null>(null);
  const toast = useToast();
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | TxType>('all');
  const [cat, setCat] = useState<string | null>(params.get('cat'));
  const t = parseISO(today);
  const [ym, setYm] = useState<{ y: number; m: number } | null>(() => (params.get('cat') ? null : { y: t.getFullYear(), m: t.getMonth() }));

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const p = ym ? monthPeriod(ym.y, ym.m) : null;
    return sortTx(
      state.transactions.filter((x) => {
        if (type !== 'all' && x.type !== type) return false;
        if (cat && x.categoryId !== cat) return false;
        if (acc && (acc === CASH_ACCOUNT ? x.accountId && state.accounts.some((a) => a.id === x.accountId) : x.accountId !== acc)) return false;
        if (p && (x.date < p.from || x.date > p.to)) return false;
        if (query) {
          const c = getCategory(x.categoryId);
          const amountStr = String(x.amount / 100);
          if (!(x.note?.toLowerCase().includes(query) || c.name.toLowerCase().includes(query) || amountStr.includes(query.replace(/\s/g, '')))) return false;
        }
        return true;
      }),
    );
  }, [state.transactions, state.accounts, q, type, cat, ym, acc]);

  const groups = useMemo(() => {
    const g: { date: string; items: typeof filtered; net: number }[] = [];
    for (const x of filtered) {
      const last = g[g.length - 1];
      const v = x.type === 'income' ? x.amount : -x.amount;
      if (last && last.date === x.date) {
        last.items.push(x);
        last.net += v;
      } else g.push({ date: x.date, items: [x], net: v });
    }
    return g;
  }, [filtered]);

  const sumF = totals(filtered);
  const chipCats = type === 'all' ? ALL_CATEGORIES : categoriesFor(type);

  const shiftMonth = (d: number) => {
    if (!ym) return;
    const nd = new Date(ym.y, ym.m + d, 1);
    setYm({ y: nd.getFullYear(), m: nd.getMonth() });
  };
  const isCurrentMonth = ym && ym.y === t.getFullYear() && ym.m === t.getMonth();

  const exportCsv = () => {
    if (!filtered.length) return toast({ kind: 'warn', title: 'Нечего экспортировать', text: 'Измените фильтры' });
    const name = ym ? `finalyze-${ym.y}-${String(ym.m + 1).padStart(2, '0')}.csv` : 'finalyze-all.csv';
    downloadText(name, transactionsToCSV(filtered));
    toast({ kind: 'success', title: 'Файл CSV сохранён', text: `${filtered.length} операций` });
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">Операции</h1>
        <div className="flex gap-2">
          <button onClick={openImport} className="btn-dark px-3" aria-label="Импорт выписки">
            <Upload className="h-4 w-4" /> <span className="hidden sm:inline">Импорт</span>
          </button>
          <button onClick={exportCsv} className="btn-ghost px-3" aria-label="Экспорт CSV">
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">CSV</span>
          </button>
          <button onClick={() => openAdd()} className="btn-primary hidden sm:inline-flex">
            <Plus className="h-4 w-4" /> Добавить
          </button>
        </div>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-300" />
        <input className="input pl-12 pr-10" placeholder="Поиск: комментарий, категория или сумма" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && (
          <button onClick={() => setQ('')} aria-label="Очистить поиск" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-navy-400 hover:bg-navy-100 dark:hover:bg-navy-800">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Segmented
          className="sm:w-80"
          value={type}
          onChange={(v) => {
            setType(v);
            if (cat && v !== 'all' && getCategory(cat).type !== v) setCat(null);
          }}
          options={[{ value: 'all', label: 'Все' }, { value: 'expense', label: 'Расходы' }, { value: 'income', label: 'Доходы' }]}
        />
        <div className="flex items-center justify-between gap-1 rounded-2xl bg-navy-100/70 p-1 dark:bg-navy-850 sm:ml-auto">
          {ym ? (
            <>
              <button onClick={() => shiftMonth(-1)} className="rounded-xl p-2 hover:bg-white dark:hover:bg-navy-700" aria-label="Предыдущий месяц"><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-[130px] text-center text-sm font-bold">{monthName(ym.m)} {ym.y}</span>
              <button onClick={() => shiftMonth(1)} disabled={!!isCurrentMonth} className="rounded-xl p-2 hover:bg-white disabled:opacity-30 dark:hover:bg-navy-700" aria-label="Следующий месяц"><ChevronRight className="h-4 w-4" /></button>
              <button onClick={() => setYm(null)} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-navy-500 hover:bg-white dark:text-navy-300 dark:hover:bg-navy-700">Вся история</button>
            </>
          ) : (
            <>
              <span className="px-3 text-sm font-bold">Вся история</span>
              <button onClick={() => setYm({ y: t.getFullYear(), m: t.getMonth() })} className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold shadow-sm dark:bg-navy-700">По месяцам</button>
            </>
          )}
        </div>
      </div>

      {state.accounts.length > 0 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <button className={cx('chip', !acc && 'chip-active')} onClick={() => setAcc(null)}>Все счета</button>
          <button className={cx('chip', acc === CASH_ACCOUNT && 'chip-active')} onClick={() => setAcc(acc === CASH_ACCOUNT ? null : CASH_ACCOUNT)}>
            <BankBadge bank="cash" size="sm" /> Наличные
          </button>
          {state.accounts.map((a) => (
            <button key={a.id} className={cx('chip', acc === a.id && 'chip-active')} onClick={() => setAcc(acc === a.id ? null : a.id)}>
              <BankBadge bank={a.bank} size="sm" icon={a.icon} /> {a.name}
            </button>
          ))}
        </div>
      )}

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <button className={cx('chip', !cat && 'chip-active')} onClick={() => setCat(null)}>Все категории</button>
        {chipCats.map((c) => (
          <button key={c.id} className={cx('chip', cat === c.id && 'chip-active')} onClick={() => setCat(cat === c.id ? null : c.id)}>
            <span>{c.emoji}</span>
            {c.name}
            {type === 'all' && c.name === 'Другое' && <span className="opacity-60">({c.type === 'income' ? 'доход' : 'расход'})</span>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <MiniStat label="Доходы" value={sumF.income} className="text-mint-500 dark:text-mint-400" />
        <MiniStat label="Расходы" value={sumF.expense} />
        <MiniStat label="Итого" value={sumF.net} sign className={sumF.net >= 0 ? 'text-mint-500 dark:text-mint-400' : 'text-rose-500'} />
      </div>

      <Card className="p-2 sm:p-3">
        {groups.length ? (
          groups.map((g) => (
            <div key={g.date} className="mb-1">
              <div className="flex items-center justify-between px-2 pb-1 pt-3 text-[13px] font-bold text-navy-400">
                <span className="first-letter:uppercase">{formatDayHeader(g.date, today)}</span>
                <span className="tabular-nums">{formatMoney(g.net, { sign: true })}</span>
              </div>
              {g.items.map((x) => <TransactionItem key={x.id} tx={x} onClick={() => openEdit(x)} />)}
            </div>
          ))
        ) : (
          <Empty
            emoji="🔍"
            title={state.transactions.length ? 'Ничего не найдено' : 'История пуста'}
            text={state.transactions.length ? 'Попробуйте изменить поиск, период или категорию.' : 'Добавьте первую операцию.'}
            action={!state.transactions.length && <button className="btn-primary" onClick={() => openAdd()}>Добавить операцию</button>}
          />
        )}
      </Card>
      {filtered.length > 0 && <div className="text-center text-[13px] text-navy-400">{filtered.length} операций · нажмите на операцию, чтобы изменить или удалить</div>}
    </div>
  );
}

function MiniStat({ label, value, className, sign }: { label: string; value: number; className?: string; sign?: boolean }) {
  return (
    <div className="rounded-2xl border border-navy-100/70 bg-white px-3 py-3 dark:border-navy-800 dark:bg-navy-900 sm:px-4">
      <div className="text-[12px] font-semibold text-navy-400">{label}</div>
      <div className={cx('mt-0.5 truncate text-[14px] font-extrabold tabular-nums sm:text-[17px]', className)}>{formatMoney(value, { sign })}</div>
    </div>
  );
}
