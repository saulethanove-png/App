import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, FileSpreadsheet, FileText, Loader2, Repeat, Sparkles, Upload } from 'lucide-react';
import type { Account, BankId, Transaction } from '../types';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toasts';
import {
  BANKS, bankInfo, detectColumns, parsePdfLines, pdfToLines, readSheet, sheetToDrafts,
  type Cell, type ColumnMap, type ImportDraft, type ParseResult,
} from '../lib/bankImport';
import { isTransferLike, merchantKey, suggestCategory } from '../lib/categorize';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategory } from '../lib/categories';
import { formatDateShort, formatMoney, moneyToInput, parseMoney, prettifyInput, uid } from '../lib/format';
import { Field, Modal, cx } from './ui';

type Step = 'source' | 'map' | 'review' | 'done';

interface Row extends ImportDraft {
  include: boolean;
  categoryId: string;
  suggested: string;
  reason: string;
  duplicate: boolean;
  transfer: boolean;
}

const HOWTO: Partial<Record<BankId, string[]>> = {
  kaspi: ['Откройте Kaspi.kz → Kaspi Gold (или нужный счёт)', 'Нажмите «Выписка», выберите период', 'Формат PDF → «Поделиться» → «Сохранить в Файлы»', 'Здесь нажмите «Выбрать файл» и найдите выписку'],
  halyk: ['Homebank → Карта → «Выписка»', 'Выберите период и формат Excel (или CSV)', 'Сохраните файл и загрузите его сюда'],
  freedom: ['Freedom Bank → Карта → «Выписка»', 'Выберите Excel/CSV и период', 'Сохраните файл и загрузите его сюда'],
  jusan: ['Jusan → Карта → «Выписка по счёту»', 'Выберите Excel и период', 'Сохраните файл и загрузите его сюда'],
  alatau: ['Приложение Alatau City Bank → Карта → «Выписка»', 'Выберите период и формат PDF (или Excel)', '«Поделиться» → «Сохранить в Файлы» → загрузите файл сюда'],
};

export function ImportWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch, today } = useStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('source');
  const [bank, setBank] = useState<BankId>('kaspi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pdfText, setPdfText] = useState<string[] | null>(null);
  const [sheet, setSheet] = useState<Cell[][] | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [accountChoice, setAccountChoice] = useState<string>('new');
  const [accountName, setAccountName] = useState('');
  const [balanceInput, setBalanceInput] = useState('');
  const [balanceErr, setBalanceErr] = useState('');
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [doneInfo, setDoneInfo] = useState<{ count: number; learned: number } | null>(null);

  const reset = () => {
    setStep('source');
    setError('');
    setSheet(null);
    setMap(null);
    setResult(null);
    setRows([]);
    setBalanceInput('');
    setDoneInfo(null);
  };
  const close = () => {
    onClose();
    setTimeout(reset, 300);
  };

  const existingIds = useMemo(() => new Set(state.transactions.map((t) => t.externalId).filter(Boolean) as string[]), [state.transactions]);

  const buildRows = (res: ParseResult, b: BankId) => {
    // покупки, уже записанные через Apple Pay: та же сумма, дата ±1 день (банк проводит с задержкой)
    const wallet = state.transactions.filter((t) => t.source === 'wallet');
    const usedWallet = new Set<string>();
    const dayDiff = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);
    const list: Row[] = res.drafts.map((d) => {
      const s = suggestCategory(d.description, d.type, state.rules, d.operation);
      let duplicate = existingIds.has(d.externalId);
      if (!duplicate && d.type === 'expense') {
        const w = wallet.find((t) => !usedWallet.has(t.id) && t.amount === d.amount && dayDiff(t.date, d.date) <= 1);
        if (w) {
          usedWallet.add(w.id);
          duplicate = true;
        }
      }
      const transfer = isTransferLike(d.description, d.operation) && s.reason !== 'rule';
      return { ...d, categoryId: s.categoryId, suggested: s.categoryId, reason: s.reason, duplicate, transfer, include: !duplicate };
    });
    setRows(list);
    setResult(res);
    const sameBank = state.accounts.filter((a) => a.bank === b);
    setAccountChoice(sameBank[0]?.id ?? 'new');
    setAccountName(b === 'kaspi' ? 'Kaspi Gold' : bankInfo(b).name);
    if (res.closingBalance != null) setBalanceInput(prettifyInput(moneyToInput(Math.abs(res.closingBalance))));
    setStep('review');
  };

  const onFile = async (f: File) => {
    setError('');
    setPdfText(null);
    setBusy(true);
    try {
      const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
      if (isPdf) {
        const lines = await pdfToLines(await f.arrayBuffer());
        setPdfText(lines);
        if (!lines.join('').trim()) {
          setError('В PDF нет текста — похоже, это скан или фото. Скачайте выписку заново из приложения банка (кнопка «Выписка» → PDF), а не скриншотом.');
          return;
        }
        const res = parsePdfLines(lines, bank);
        if (!res.drafts.length) {
          setError('Текст в PDF есть, но строки с операциями не распознаны. Откройте «Показать текст из PDF» ниже и пришлите скриншот — добавлю этот формат.');
          return;
        }
        buildRows(res, bank);
      } else {
        const data = await readSheet(f);
        if (!data.length) return setError('Файл пустой или не читается.');
        const m = detectColumns(data);
        setSheet(data);
        setMap(m);
        if (m.date === -1 || (m.amount === -1 && m.debit === -1 && m.credit === -1)) {
          setStep('map');
          return;
        }
        const res = sheetToDrafts(data, m, bank);
        if (!res.drafts.length) {
          setStep('map');
          return;
        }
        // показываем сопоставление, если колонки угаданы без заголовков
        if (m.headerRow === -1) setStep('map');
        else buildRows(res, bank);
      }
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      setError(/password|encrypt/i.test(msg)
        ? 'PDF защищён паролем. Сохраните выписку без пароля и попробуйте снова.'
        : `Не удалось прочитать файл (${msg.slice(0, 120)}). Поддерживаются PDF, Excel (.xlsx, .xls) и CSV.`);
    } finally {
      setBusy(false);
    }
  };

  const visible = rows.map((r, i) => ({ r, i })).filter(({ r }) => filter === 'all' || r.type === filter);
  const chosen = rows.filter((r) => r.include);
  const income = chosen.filter((r) => r.type === 'income').reduce((a, r) => a + r.amount, 0);
  const expense = chosen.filter((r) => r.type === 'expense').reduce((a, r) => a + r.amount, 0);
  const dupCount = rows.filter((r) => r.duplicate).length;
  const transferCount = rows.filter((r) => r.transfer && !r.duplicate).length;
  const transfersIncluded = rows.some((r) => r.transfer && !r.duplicate && r.include);

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  /** Меняем категорию у строки — и у всех похожих в этой выписке */
  const changeCategory = (i: number, categoryId: string) => {
    const key = merchantKey(rows[i].description);
    setRows((rs) =>
      rs.map((r, j) => (j === i || (key && r.type === rows[i].type && merchantKey(r.description) === key && r.categoryId === rows[i].categoryId) ? { ...r, categoryId, reason: 'manual' } : r)),
    );
  };

  const doImport = () => {
    let bal: number | null = null;
    if (balanceInput.trim()) {
      const p = parseMoney(balanceInput, { allowZero: true });
      if (!p.ok) return setBalanceErr(p.error);
      bal = p.value;
    }
    if (accountChoice === 'new' && !accountName.trim()) return setBalanceErr('Введите название счёта');

    const accountId = accountChoice === 'new' ? uid() : accountChoice;
    const prevAccount = state.accounts.find((a) => a.id === accountId);
    const txs: Omit<Transaction, 'id' | 'createdAt'>[] = chosen.map((r) => ({
      type: r.type,
      amount: r.amount,
      categoryId: r.categoryId,
      date: r.date,
      note: cleanNote(r.description),
      accountId,
      source: 'import',
      externalId: r.externalId,
      rawDescription: r.description,
    }));

    let account: Account | undefined = prevAccount;
    if (!account) account = { id: accountId, name: accountName.trim(), bank, startingBalance: 0, createdAt: Date.now() };
    if (bal != null) {
      // начальный остаток = остаток по выписке − все операции этого счёта до даты выписки
      const asOf = result?.periodTo ?? today;
      const all = [...state.transactions.filter((t) => t.accountId === accountId), ...txs];
      const net = all.filter((t) => t.date <= asOf).reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0);
      account = { ...account, startingBalance: bal - net };
    }

    // учим правила там, где пользователь поправил категорию
    const learned = new Map<string, { pattern: string; categoryId: string; type: Row['type'] }>();
    for (const r of chosen) {
      if (r.categoryId === r.suggested) continue;
      const pattern = merchantKey(r.description);
      if (pattern.length >= 3) learned.set(`${r.type}|${pattern}`, { pattern, categoryId: r.categoryId, type: r.type });
    }

    dispatch({ type: 'tx/import', txs, rules: [...learned.values()], account });
    setDoneInfo({ count: txs.length, learned: learned.size });
    setStep('done');
    toast({ kind: 'success', title: `Импортировано ${txs.length} операций`, text: account.name });
  };

  const title = step === 'source' ? 'Импорт выписки' : step === 'map' ? 'Колонки файла' : step === 'review' ? 'Проверьте операции' : 'Готово';

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={
        step === 'review' ? (
          <div className="space-y-2">
            <div className="flex justify-between text-[13px] font-semibold text-navy-500 dark:text-navy-300">
              <span>{chosen.length} из {rows.length}</span>
              <span><span className="text-mint-600 dark:text-mint-400">+{formatMoney(income)}</span> · −{formatMoney(expense)}</span>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost px-3" onClick={() => setStep(sheet ? 'map' : 'source')} aria-label="Назад"><ArrowLeft className="h-4 w-4" /></button>
              <button className="btn-primary flex-1 py-3" disabled={!chosen.length} onClick={doImport}>Импортировать {chosen.length}</button>
            </div>
          </div>
        ) : step === 'map' ? (
          <div className="flex gap-2">
            <button className="btn-ghost px-3" onClick={() => setStep('source')} aria-label="Назад"><ArrowLeft className="h-4 w-4" /></button>
            <button
              className="btn-primary flex-1 py-3"
              disabled={!map || map.date === -1 || (map.amount === -1 && map.debit === -1 && map.credit === -1)}
              onClick={() => {
                if (!sheet || !map) return;
                const res = sheetToDrafts(sheet, map, bank);
                if (!res.drafts.length) return setError('С такими колонками операции не найдены. Проверьте дату и сумму.');
                setError('');
                buildRows(res, bank);
              }}
            >
              Дальше
            </button>
          </div>
        ) : step === 'done' ? (
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 py-3" onClick={reset}>Ещё выписку</button>
            <button className="btn-primary flex-1 py-3" onClick={close}>Готово</button>
          </div>
        ) : undefined
      }
    >
      {step === 'source' && (
        <div className="space-y-4 pb-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BANKS.filter((b) => b.id !== 'forte' && b.id !== 'bcc').map((b) => (
              <button
                key={b.id}
                onClick={() => setBank(b.id)}
                className={cx('flex items-center gap-2.5 rounded-2xl border-2 p-3 text-left transition', bank === b.id ? 'border-mint-400 bg-mint-400/10' : 'border-navy-100 hover:bg-navy-50 dark:border-navy-800 dark:hover:bg-navy-850')}
              >
                <BankBadge bank={b.id} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{b.name}</div>
                  <div className="text-[11px] font-semibold text-navy-400">{b.id === 'kaspi' ? 'PDF' : 'PDF / Excel / CSV'}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-navy-50 p-4 dark:bg-navy-850">
            <div className="mb-2 text-[13px] font-bold">Как получить выписку</div>
            <ol className="space-y-1.5 text-[13px] text-navy-600 dark:text-navy-300">
              {(HOWTO[bank] ?? ['В приложении банка найдите «Выписка по счёту»', 'Выгрузите её в Excel или CSV', 'Загрузите файл сюда']).map((s, i) => (
                <li key={i} className="flex gap-2"><span className="font-bold text-mint-600 dark:text-mint-400">{i + 1}.</span>{s}</li>
              ))}
            </ol>
          </div>

          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={bank === 'kaspi' ? 'application/pdf,.pdf,.csv,.xlsx,.xls' : '.csv,.xlsx,.xls,.txt,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,.pdf'}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
          <button className="btn-primary w-full py-3.5 text-[15px]" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> Читаю выписку…</> : <><Upload className="h-5 w-5" /> Выбрать файл</>}
          </button>
          {error && <div className="flex gap-2 rounded-2xl bg-rose-50 p-3 text-[13px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
          {error && pdfText && pdfText.length > 0 && (
            <details className="rounded-2xl bg-navy-50 px-3 py-2 text-[12px] text-navy-600 dark:bg-navy-850 dark:text-navy-300">
              <summary className="cursor-pointer font-semibold">Показать текст из PDF ({pdfText.length} строк)</summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{pdfText.slice(0, 60).join('\n')}</pre>
            </details>
          )}
          <div className="flex items-start gap-2 text-[12px] text-navy-400">
            {bank === 'kaspi' ? <FileText className="h-4 w-4 shrink-0" /> : <FileSpreadsheet className="h-4 w-4 shrink-0" />}
            Файл читается прямо на устройстве и никуда не отправляется. В приложение попадут только дата, сумма и описание операций.
          </div>
        </div>
      )}

      {step === 'map' && sheet && map && (
        <div className="space-y-4 pb-4">
          <p className="text-[13px] text-navy-500 dark:text-navy-300">Укажите, в каких колонках дата, сумма и описание. Если банк пишет списания и зачисления отдельно — выберите обе колонки.</p>
          <ColumnPicker sheet={sheet} map={map} onChange={setMap} />
          {error && <div className="rounded-2xl bg-rose-50 p-3 text-[13px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{error}</div>}
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-4 pb-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Счёт">
              <select className="input" value={accountChoice} onChange={(e) => setAccountChoice(e.target.value)}>
                {state.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                <option value="new">+ Новый счёт</option>
              </select>
            </Field>
            {accountChoice === 'new' ? (
              <Field label="Название счёта">
                <input className="input" value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Kaspi Gold" />
              </Field>
            ) : <div className="hidden sm:block" />}
            <div className="sm:col-span-2">
              <Field label="Остаток на счёте по выписке, ₸ (необязательно)" error={balanceErr} hint={result?.closingBalance != null ? `Взят из выписки на ${formatDateShort(result.periodTo!)} — баланс счёта будет точным` : 'Если указать — баланс счёта в приложении совпадёт с банком'}>
                <input inputMode="decimal" className={cx('input', balanceErr && 'input-error')} value={balanceInput} onChange={(e) => { setBalanceInput(prettifyInput(e.target.value)); setBalanceErr(''); }} placeholder="например, 154 320" />
              </Field>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'expense', 'income'] as const).map((f) => (
              <button key={f} className={cx('chip', filter === f && 'chip-active')} onClick={() => setFilter(f)}>
                {f === 'all' ? `Все ${rows.length}` : f === 'expense' ? 'Расходы' : 'Доходы'}
              </button>
            ))}
            {transferCount > 0 && (
              <button
                className={cx('chip', !transfersIncluded && 'chip-active')}
                onClick={() => setRows((rs) => rs.map((r) => (r.transfer && !r.duplicate ? { ...r, include: !transfersIncluded } : r)))}
              >
                <Repeat className="h-3.5 w-3.5" /> {transfersIncluded ? 'Убрать переводы' : 'Переводы убраны'} ({transferCount})
              </button>
            )}
          </div>

          {dupCount > 0 && (
            <div className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {dupCount} операций уже есть в приложении — они не будут добавлены повторно.
            </div>
          )}
          {!!result?.skipped.length && (
            <details className="rounded-2xl bg-navy-50 px-3 py-2 text-[12px] text-navy-500 dark:bg-navy-850 dark:text-navy-300">
              <summary className="cursor-pointer font-semibold">Не распознано строк: {result.skipped.length}</summary>
              <ul className="mt-2 space-y-1">{result.skipped.slice(0, 10).map((s, i) => <li key={i} className="truncate">{s}</li>)}</ul>
            </details>
          )}

          <div className="-mx-2 divide-y divide-navy-100 dark:divide-navy-800">
            {visible.map(({ r, i }) => {
              const cat = getCategory(r.categoryId);
              return (
                <div key={r.externalId} className={cx('flex items-start gap-3 px-2 py-2.5', !r.include && 'opacity-50')}>
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 shrink-0 accent-mint-400"
                    checked={r.include}
                    disabled={r.duplicate}
                    onChange={(e) => setRow(i, { include: e.target.checked })}
                    aria-label="Импортировать операцию"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-[14px] font-semibold leading-snug">{r.description}</div>
                      <div className={cx('shrink-0 text-[14px] font-bold tabular-nums', r.type === 'income' ? 'text-mint-600 dark:text-mint-400' : '')}>
                        {formatMoney(r.type === 'income' ? r.amount : -r.amount)}
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-navy-400">
                      <span>{formatDateShort(r.date)}</span>
                      {r.operation && <span>· {r.operation}</span>}
                      {r.duplicate && <span className="rounded-full bg-amber-400/15 px-1.5 font-semibold text-amber-600">уже есть</span>}
                      {r.transfer && !r.duplicate && <span className="rounded-full bg-sky-400/15 px-1.5 font-semibold text-sky-600 dark:text-sky-300">перевод</span>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <select
                        value={r.categoryId}
                        onChange={(e) => changeCategory(i, e.target.value)}
                        disabled={!r.include}
                        className="max-w-full rounded-xl border border-navy-100 bg-white py-1.5 pl-2 pr-7 text-[13px] font-semibold dark:border-navy-700 dark:bg-navy-850"
                        aria-label="Категория"
                      >
                        {(r.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                      </select>
                      {r.reason === 'rule' && <span className="flex items-center gap-1 text-[11px] font-semibold text-mint-600 dark:text-mint-400"><Sparkles className="h-3 w-3" />по вашему правилу</span>}
                      {r.reason === 'manual' && r.categoryId !== r.suggested && <span className="text-[11px] font-semibold text-violet-500">запомню</span>}
                      {r.reason === 'default' && cat.id.startsWith('other') && <span className="text-[11px] text-navy-400">выберите категорию</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step === 'done' && doneInfo && (
        <div className="flex flex-col items-center px-4 pb-6 pt-2 text-center">
          <CheckCircle2 className="h-14 w-14 text-mint-400" />
          <div className="mt-3 text-lg font-extrabold">Добавлено {doneInfo.count} операций</div>
          <div className="mt-1 text-sm text-navy-400">
            {doneInfo.learned > 0 ? `Запомнил ${doneInfo.learned} ваших исправлений — в следующий раз такие операции разложатся сами.` : 'Баланс и аналитика уже пересчитаны.'}
          </div>
        </div>
      )}
    </Modal>
  );
}

function cleanNote(desc: string): string {
  const s = desc.replace(/\s+/g, ' ').replace(/^(ТОО|ИП|АО)\s+/i, '').replace(/[«»"]/g, '').trim();
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

function ColumnPicker({ sheet, map, onChange }: { sheet: Cell[][]; map: ColumnMap; onChange: (m: ColumnMap) => void }) {
  const cols = Math.max(...sheet.slice(0, 50).map((r) => r.length));
  const header = map.headerRow >= 0 ? sheet[map.headerRow] : null;
  const label = (i: number) => {
    const h = header?.[i];
    const sample = sheet.slice(map.headerRow + 1, map.headerRow + 4).map((r) => r[i]).filter((v) => v != null && v !== '').map((v) => (v instanceof Date ? v.toLocaleDateString('ru-RU') : String(v).slice(0, 18)))[0];
    return `${String.fromCharCode(65 + (i % 26))}: ${h != null && String(h).trim() ? String(h).slice(0, 24) : '—'}${sample ? ` (${sample})` : ''}`;
  };
  const sel = (key: keyof ColumnMap, title: string, optional = false) => (
    <Field label={title}>
      <select className="input" value={map[key]} onChange={(e) => onChange({ ...map, [key]: Number(e.target.value) })}>
        <option value={-1}>{optional ? 'нет' : 'не выбрано'}</option>
        {Array.from({ length: cols }, (_, i) => <option key={i} value={i}>{label(i)}</option>)}
      </select>
    </Field>
  );
  return (
    <div className="space-y-3">
      <Field label="Строка заголовков">
        <select className="input" value={map.headerRow} onChange={(e) => onChange({ ...map, headerRow: Number(e.target.value) })}>
          <option value={-1}>Без заголовков</option>
          {sheet.slice(0, 30).map((r, i) => <option key={i} value={i}>{i + 1}: {r.filter((c) => c != null).join(' | ').slice(0, 60)}</option>)}
        </select>
      </Field>
      {sel('date', 'Дата')}
      {sel('description', 'Описание / получатель')}
      {sel('amount', 'Сумма (со знаком «−» для расходов)', true)}
      <div className="grid grid-cols-2 gap-3">
        {sel('debit', 'Списание', true)}
        {sel('credit', 'Зачисление', true)}
      </div>
      {sel('operation', 'Тип операции', true)}
    </div>
  );
}

export function BankBadge({ bank, size = 'md' }: { bank: BankId | 'cash'; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'h-6 w-6 text-[11px] rounded-lg' : 'h-10 w-10 text-[15px] rounded-xl';
  if (bank === 'cash') return <div className={cx('grid shrink-0 place-items-center bg-navy-900 font-extrabold text-mint-400 dark:bg-navy-700', s)}>₸</div>;
  const b = bankInfo(bank);
  return <div className={cx('grid shrink-0 place-items-center font-extrabold text-white', s)} style={{ background: b.color }}>{b.short}</div>;
}
