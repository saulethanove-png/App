import { useCallback, useEffect, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Copy, Download, KeyRound, Link2, Loader2, RefreshCw, Smartphone, Trash2, Zap } from 'lucide-react';
import { useCloud } from '../store/Cloud';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toasts';
import { PUBLIC_KEY, SHORTCUT_ICLOUD_URL, SHORTCUT_NAME, WALLET_URL, runShortcut, walletApi, walletError } from '../lib/wallet';
import { formatMoney } from '../lib/format';
import { Card, Modal, cx } from './ui';

const AppleLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.8zM14.1 5.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z" /></svg>
);

const ago = (iso: string | null) => {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  if (m < 60 * 24) return `${Math.round(m / 60)} ч назад`;
  return new Date(iso).toLocaleDateString('ru-RU');
};

/** Карточка в профиле: автоматическая запись трат по Apple Pay через «Команды» */
export function ApplePayCard() {
  const cloud = useCloud();
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const wallet = state.transactions.filter((t) => t.source === 'wallet');
  const last = [...wallet].sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!cloud.enabled) return null;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-navy-900 text-white dark:bg-white dark:text-navy-950">
          <AppleLogo className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-auto">
          <div className="font-bold">Apple Pay — траты записываются сами</div>
          <div className="text-[13px] text-navy-400">
            {wallet.length ? `Записано ${wallet.length} оплат${last ? ` · последняя ${formatMoney(last.amount)} ${last.note ?? ''}` : ''}` : 'Оплатили телефоном — операция появилась в Finalyze с категорией'}
          </div>
        </div>
        <button className="btn-dark w-full sm:w-auto" disabled={!cloud.user} onClick={() => setOpen(true)}>
          <Smartphone className="h-4 w-4" /> {wallet.length ? 'Настройки' : 'Подключить'}
        </button>
      </div>
      {!cloud.user && <div className="mt-3 text-[12px] text-navy-400">Нужен аккаунт: войдите, чтобы подключить Apple Pay.</div>}
      {open && <ApplePaySetup onClose={() => setOpen(false)} />}
    </Card>
  );
}

function ApplePaySetup({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [lastUsed, setLastUsed] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [step, setStep] = useState<'connect' | 'test' | null>(null);

  const refresh = useCallback(async () => {
    try {
      const t = await walletApi.get();
      setToken(t?.token ?? null);
      setLastUsed(t?.last_used_at ?? null);
    } catch (e) {
      setErr(walletError(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  // вернулись из «Команд» — проверяем, дошёл ли сигнал
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, [refresh]);

  const ensureToken = async () => token ?? (await walletApi.rotate());

  const connect = async () => {
    setErr('');
    try {
      const t = await ensureToken();
      setToken(t);
      setStep('connect');
      runShortcut(t);
    } catch (e) {
      setErr(walletError(e));
    }
  };
  const test = () => {
    setStep('test');
    runShortcut('test');
  };
  const rotate = async () => {
    setBusy(true); setErr('');
    try { const t = await walletApi.rotate(); setToken(t); setLastUsed(null); toast({ kind: 'success', title: 'Новый ключ создан', text: 'Нажмите «Подключить», чтобы передать его в команду' }); } catch (e) { setErr(walletError(e)); }
    setBusy(false);
  };
  const revoke = async () => {
    setBusy(true);
    try { await walletApi.revoke(); setToken(null); setLastUsed(null); toast({ kind: 'info', title: 'Apple Pay отключён' }); } catch (e) { setErr(walletError(e)); }
    setBusy(false);
  };

  const connected = !!lastUsed;

  return (
    <Modal open onClose={onClose} title="Apple Pay → Finalyze">
      <div className="space-y-4 pb-4 text-[14px]">
        <div className={cx('flex items-center gap-3 rounded-2xl p-3', connected ? 'bg-mint-400/10' : 'bg-navy-50 dark:bg-navy-850')}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin text-navy-400" /> : connected ? <CheckCircle2 className="h-5 w-5 text-mint-500" /> : <Zap className="h-5 w-5 text-amber-500" />}
          <div className="text-[13px] font-semibold">
            {connected ? `Подключено · последний сигнал ${ago(lastUsed)}` : 'Пока не подключено — займёт около минуты'}
          </div>
        </div>

        <ol className="space-y-3">
          <BigStep n={1} done={false} title="Установите команду">
            {SHORTCUT_ICLOUD_URL ? (
              <a className="btn-dark mt-2 w-full" href={SHORTCUT_ICLOUD_URL} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> Установить команду «{SHORTCUT_NAME}»</a>
            ) : (
              <div className="mt-1 rounded-xl bg-amber-50 p-2 text-[12px] text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">Ссылка на готовую команду скоро появится. Пока соберите её по рецепту внизу.</div>
            )}
            <div className="mt-1 text-[12px] text-navy-400">Откроются «Команды» → нажмите «Добавить команду».</div>
          </BigStep>

          <BigStep n={2} done={!!token && step !== null} title="Подключите аккаунт">
            <button className="btn-primary mt-2 w-full" onClick={connect} disabled={busy}><Link2 className="h-4 w-4" /> Подключить</button>
            <div className="mt-1 text-[12px] text-navy-400">Ключ передастся в команду сам — появится «Finalyze подключён ✅». Вернитесь сюда.</div>
          </BigStep>

          <BigStep n={3} done={connected} title="Включите автоматизацию">
            <ul className="mt-1 space-y-1 text-[13px] text-navy-600 dark:text-navy-300">
              <li>«Команды» → вкладка <b>«Автоматизация»</b> → <b>«+»</b> → <b>«Транзакция»</b></li>
              <li>Отметьте ваши карты (Kaspi Gold, Alatau…) → <b>«Запускать сразу»</b> → «Далее»</li>
              <li>Выберите <b>«{SHORTCUT_NAME}»</b> из списка команд → «Готово»</li>
            </ul>
          </BigStep>

          <BigStep n={4} done={connected} title="Проверьте связь">
            <button className="btn-ghost mt-2 w-full" onClick={test} disabled={!token}><RefreshCw className="h-4 w-4" /> Проверить</button>
            <div className="mt-1 text-[12px] text-navy-400">
              {step === 'test' && !connected ? 'Если «Команды» показали «Finalyze подключён ✅» — всё готово. Статус наверху обновится.' : 'Команда отправит тестовый сигнал — операция не создаётся.'}
            </div>
          </BigStep>
        </ol>

        {err && <div className="rounded-2xl bg-rose-50 p-3 text-[13px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{err}</div>}

        <Expand title="Рецепт команды «Finalyze» (собрать один раз)">
          <ol className="list-decimal space-y-1.5 pl-5 text-[12px] leading-snug">
            <li>«Команды» → «+» → назовите команду <b>{SHORTCUT_NAME}</b>.</li>
            <li><b>«Если»</b>: «Ввод команды» → «начинается с» → <code>mf_</code>.</li>
            <li>Внутри «Если»: <b>«Сохранить файл»</b> — «Ввод команды», папка «Команды», подпапка/имя <code>Finalyze/token.txt</code>, «Спрашивать, куда сохранять» — выкл, «Перезаписывать» — вкл.</li>
            <li>Там же: <b>«Показать уведомление»</b> «Finalyze подключён ✅» и <b>«Остановить эту команду»</b>.</li>
            <li>После «Конец Если»: <b>«Получить файл»</b> из папки «Команды», путь <code>Finalyze/token.txt</code>, «Ошибка, если не найден» — выкл.</li>
            <li><b>«Получить содержимое URL»</b>: URL и apikey — ниже; метод POST; заголовки <code>apikey</code> и <code>Content-Type: application/json</code>; JSON-поля (тип «Текст»): <code>p_token</code> = «Файл», <code>p_raw</code> = «Ввод команды», <code>p_amount</code> = «Ввод команды → Сумма», <code>p_merchant</code> = «→ Продавец», <code>p_card</code> = «→ Карта или пропуск». Если свойства «Сумма»/«Продавец» не выбираются — оставьте только <code>p_token</code> и <code>p_raw</code>.</li>
            <li><b>«Показать уведомление»</b>: «Содержимое URL».</li>
            <li>Готово → «⋯» у команды → «Поделиться» → <b>«Скопировать ссылку iCloud»</b> → пришлите ссылку разработчику — у всех появится кнопка «Установить команду».</li>
          </ol>
          <div className="mt-2 rounded-xl bg-white p-2 dark:bg-navy-900">
            <CopyRow label="URL" value={WALLET_URL} />
            <CopyRow label="apikey" value={PUBLIC_KEY} />
          </div>
        </Expand>

        <Expand title="Ручная настройка без готовой команды">
          <div className="text-[12px] text-navy-500 dark:text-navy-300">Автоматизация «Транзакция» → действие «Получить содержимое URL» с полями ниже. Секретный ключ не показывайте другим.</div>
          <div className="mt-2 rounded-xl bg-white p-2 dark:bg-navy-900">
            <CopyRow label="URL" value={WALLET_URL} />
            <CopyRow label="apikey" value={PUBLIC_KEY} />
            {token ? <CopyRow label="p_token" value={token} secret /> : <button className="btn-ghost w-full" onClick={rotate}><KeyRound className="h-4 w-4" /> Получить ключ</button>}
          </div>
        </Expand>

        {token && (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={rotate} disabled={busy}><RefreshCw className="h-4 w-4" /> Новый ключ</button>
            <button className="btn-danger" onClick={revoke} disabled={busy}><Trash2 className="h-4 w-4" /> Отключить</button>
          </div>
        )}
        <div className="text-[12px] text-navy-400">Работает с оплатами Apple Pay на iOS 17+. Kaspi QR и переводы подтянет импорт выписки — без дублей.</div>
      </div>
    </Modal>
  );
}

function BigStep({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-2xl border border-navy-100 p-3 dark:border-navy-800">
      <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-extrabold', done ? 'bg-mint-400 text-navy-950' : 'bg-navy-900 text-white dark:bg-white dark:text-navy-950')}>
        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1"><div className="font-bold">{title}</div>{children}</div>
    </li>
  );
}

function Expand({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl bg-navy-50 dark:bg-navy-850">
      <button className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] font-semibold" onClick={() => setOpen(!open)}>
        {title}<ChevronDown className={cx('h-4 w-4 transition', open && 'rotate-180')} />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!secret);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setShown(true);
    }
  };
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-16 shrink-0 text-[12px] font-semibold text-navy-400">{label}</div>
      <button type="button" onClick={() => setShown(true)} className={cx('min-w-0 flex-1 select-all truncate rounded-lg bg-navy-50 px-2 py-1.5 text-left font-mono text-[12px] dark:bg-navy-850', !shown && 'tracking-widest')}>
        {shown ? value : '••••••••••••••'}
      </button>
      <button type="button" onClick={copy} aria-label={`Скопировать ${label}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-navy-500 hover:bg-navy-50 dark:hover:bg-navy-800">
        {copied ? <Check className="h-4 w-4 text-mint-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
