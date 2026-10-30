import { useRef, useState } from 'react';
import { Database, Download, FileJson, Monitor, Moon, RotateCcw, Sun, Trash2, Upload } from 'lucide-react';
import type { AppState, ThemeMode } from '../types';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toasts';
import { formatMoney, moneyToInput, parseMoney, prettifyInput, todayISO } from '../lib/format';
import { transactionsToCSV, downloadText } from '../lib/csv';
import { storageAvailable } from '../lib/storage';
import { levelOf, xpOf } from '../lib/learn';
import { Card, Field, Modal, SectionHeader, cx } from '../components/ui';
import { useCloud } from '../store/Cloud';
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw } from 'lucide-react';

export function ProfilePage() {
  const { state, dispatch, today } = useStore();
  const toast = useToast();
  const [name, setName] = useState(state.profile.name);
  const [start, setStart] = useState(prettifyInput(moneyToInput(state.profile.startingBalance)));
  const [err, setErr] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<null | 'demo' | 'clear' | 'logout'>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lvl = levelOf(xpOf(state, today));
  const persistent = storageAvailable();
  const cloud = useCloud();
  const [busySync, setBusySync] = useState(false);

  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (name.trim().length > 30) er.name = 'Не длиннее 30 символов';
    const p = parseMoney(start, { allowZero: true });
    if (!p.ok) er.start = p.error;
    setErr(er);
    if (Object.keys(er).length || !p.ok) return;
    dispatch({ type: 'profile/update', patch: { name: name.trim(), startingBalance: p.value } });
    toast({ kind: 'success', title: 'Профиль сохранён' });
  };

  const setTheme = (t: ThemeMode) => dispatch({ type: 'profile/update', patch: { theme: t } });

  const exportCsv = () => {
    if (!state.transactions.length) return toast({ kind: 'warn', title: 'Нет операций для экспорта' });
    downloadText(`moneyflow-${todayISO()}.csv`, transactionsToCSV(state.transactions));
    toast({ kind: 'success', title: 'CSV сохранён', text: `${state.transactions.length} операций` });
  };
  const exportJson = () => {
    downloadText(`moneyflow-backup-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json');
    toast({ kind: 'success', title: 'Резервная копия сохранена' });
  };
  const importJson = async (f: File) => {
    try {
      const s = JSON.parse(await f.text()) as AppState;
      if (s?.version !== 1 || !Array.isArray(s.transactions) || !s.profile) throw new Error();
      if (!s.transactions.every((t) => typeof t.amount === 'number' && Number.isInteger(t.amount) && t.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date))) throw new Error();
      dispatch({ type: 'import', state: { ...s, learning: s.learning ?? { readArticles: [], doneTasks: {}, bonusXp: 0 }, alertsShown: [] } });
      toast({ kind: 'success', title: 'Данные восстановлены', text: `${s.transactions.length} операций` });
    } catch {
      toast({ kind: 'error', title: 'Не удалось прочитать файл', text: 'Выберите резервную копию Money Flow (.json)' });
    }
  };

  const themes: { v: ThemeMode; label: string; icon: typeof Sun }[] = [
    { v: 'light', label: 'Светлая', icon: Sun },
    { v: 'dark', label: 'Тёмная', icon: Moon },
    { v: 'system', label: 'Системная', icon: Monitor },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-[26px] font-extrabold tracking-tight">Профиль</h1>

      <Card className="flex items-center gap-4 p-5">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-navy-900 text-2xl font-extrabold text-mint-400 dark:bg-mint-400 dark:text-navy-950">
          {(state.profile.name || 'Я').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xl font-extrabold">{state.profile.name || 'Пользователь'}</div>
          <div className="text-sm text-navy-400">Уровень {lvl.index} · {lvl.name} · {state.transactions.length} операций</div>
        </div>
      </Card>

      {cloud.enabled && (
        <Card className="p-5">
          {cloud.user ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl', cloud.status === 'error' || cloud.status === 'offline' ? 'bg-amber-400/15 text-amber-500' : 'bg-mint-400/15 text-mint-500')}>
                {cloud.status === 'error' || cloud.status === 'offline' ? <CloudOff className="h-6 w-6" /> : <Cloud className="h-6 w-6" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{cloud.user.email}</div>
                <div className="text-[13px] text-navy-400">
                  {cloud.status === 'syncing' ? 'Синхронизация…'
                    : cloud.status === 'offline' ? `Нет интернета · ${cloud.pending} изменений ждут отправки`
                    : cloud.status === 'error' ? 'Ошибка синхронизации — попробуйте ещё раз'
                    : cloud.pending ? `Отправляется: ${cloud.pending}`
                    : cloud.live ? `Мгновенная синхронизация включена${cloud.lastSync ? ` · ${new Date(cloud.lastSync).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                    : cloud.lastSync ? `Синхронизировано в ${new Date(cloud.lastSync).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'Данные хранятся в облаке'}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-ghost px-3" disabled={busySync} onClick={async () => { setBusySync(true); await cloud.syncNow(); setBusySync(false); }} aria-label="Синхронизировать">
                  <RefreshCw className={cx('h-4 w-4', (busySync || cloud.status === 'syncing') && 'animate-spin')} /> <span className="hidden sm:inline">Синхронизировать</span>
                </button>
                <button className="btn-ghost px-3" onClick={() => setConfirm('logout')} aria-label="Выйти"><LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Выйти</span></button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-navy-50 text-navy-500 dark:bg-navy-800"><CloudOff className="h-6 w-6" /></div>
              <div className="min-w-0 flex-1">
                <div className="font-bold">Вы без аккаунта</div>
                <div className="text-[13px] text-navy-400">Войдите, чтобы данные не потерялись и были на всех устройствах</div>
              </div>
              <button className="btn-primary" onClick={cloud.leaveGuest}><LogIn className="h-4 w-4" /> Войти</button>
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <Card className="p-5">
          <SectionHeader title="Личные данные" />
          <form onSubmit={saveProfile} className="space-y-4" noValidate>
            <Field label="Имя" error={err.name}>
              <input className={cx('input', err.name && 'input-error')} value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" />
            </Field>
            <Field label="Начальный баланс, ₸" error={err.start} hint="Сколько денег было до начала учёта. Баланс = начальный + доходы − расходы.">
              <input inputMode="decimal" className={cx('input', err.start && 'input-error')} value={start} onChange={(e) => setStart(prettifyInput(e.target.value))} />
            </Field>
            <button className="btn-dark w-full">Сохранить</button>
          </form>
        </Card>

        <div className="space-y-5 lg:space-y-6">
          <Card className="p-5">
            <SectionHeader title="Оформление" />
            <div className="grid grid-cols-3 gap-2">
              {themes.map(({ v, label, icon: Icon }) => (
                <button key={v} onClick={() => setTheme(v)} className={cx('flex flex-col items-center gap-2 rounded-2xl border-2 py-4 text-sm font-semibold transition', state.profile.theme === v ? 'border-mint-400 bg-mint-400/10' : 'border-navy-100 hover:bg-navy-50 dark:border-navy-800 dark:hover:bg-navy-850')}>
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Данные" />
            <div className="space-y-2">
              <Row icon={<Download className="h-5 w-5" />} title="Экспорт в CSV" text="Все операции — открывается в Excel" onClick={exportCsv} />
              <Row icon={<FileJson className="h-5 w-5" />} title="Резервная копия" text="Сохранить все данные в файл .json" onClick={exportJson} />
              <Row icon={<Upload className="h-5 w-5" />} title="Восстановить из копии" text="Загрузить файл .json" onClick={() => fileRef.current?.click()} />
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
              <Row icon={<RotateCcw className="h-5 w-5" />} title="Загрузить демо-данные" text="Заменит текущие данные примером" onClick={() => setConfirm('demo')} />
              <Row icon={<Trash2 className="h-5 w-5" />} title="Удалить все данные" text="Начать учёт с нуля" danger onClick={() => setConfirm('clear')} />
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-2xl bg-navy-50 p-3 text-[12px] leading-snug text-navy-500 dark:bg-navy-850 dark:text-navy-300">
              <Database className="mt-0.5 h-4 w-4 shrink-0" />
              {persistent
                ? cloud.user ? 'Данные хранятся в вашем аккаунте и на устройстве — работают и без интернета, синхронизируются автоматически.' : 'Данные хранятся на этом устройстве и сохраняются между перезапусками. Войдите в аккаунт или делайте резервную копию, чтобы не потерять их.'
                : 'Браузер не разрешает сохранять данные (приватный режим?). Изменения пропадут после закрытия вкладки — сохраните резервную копию.'}
            </div>
          </Card>
        </div>
      </div>

      <div className="pb-4 text-center text-[12px] text-navy-400">MONEY FLOW · версия 1.0 · баланс сейчас {formatMoney(state.profile.startingBalance + state.transactions.filter((t) => t.date <= today).reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0))}</div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === 'demo' ? 'Загрузить демо-данные?' : confirm === 'logout' ? 'Выйти из аккаунта?' : 'Удалить все данные?'}
        footer={
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 py-3" onClick={() => setConfirm(null)}>Отмена</button>
            <button
              className={cx('flex-1 py-3', confirm === 'clear' ? 'btn bg-rose-500 text-white hover:bg-rose-600' : 'btn-primary')}
              onClick={async () => {
                const c = confirm;
                setConfirm(null);
                if (c === 'logout') {
                  await cloud.signOut();
                  return;
                }
                dispatch({ type: c === 'demo' ? 'reset/demo' : 'reset/empty' });
                if (c === 'clear') setStart('0');
                toast({ kind: 'success', title: c === 'demo' ? 'Демо-данные загружены' : 'Все данные удалены' });
              }}
            >
              {confirm === 'demo' ? 'Загрузить' : confirm === 'logout' ? 'Выйти' : 'Удалить'}
            </button>
          </div>
        }
      >
        <p className="pb-2 text-sm text-navy-500 dark:text-navy-300">
          {confirm === 'demo'
            ? 'Текущие операции, цели и бюджет будут заменены примером.' + (cloud.user ? ' Изменение попадёт и в облако.' : ' Сначала сделайте резервную копию, если они вам нужны.')
            : confirm === 'logout'
              ? 'Данные останутся в аккаунте, а с этого устройства будут удалены. Войдите снова, чтобы их увидеть.'
              : 'Будут удалены все операции, цели, бюджет и прогресс обучения' + (cloud.user ? ' — и на этом устройстве, и в облаке.' : '.') + ' Это действие нельзя отменить.'}
        </p>
      </Modal>
    </div>
  );
}

function Row({ icon, title, text, onClick, danger }: { icon: React.ReactNode; title: string; text: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-navy-50 dark:hover:bg-navy-850">
      <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', danger ? 'bg-rose-500/10 text-rose-500' : 'bg-navy-50 text-navy-600 dark:bg-navy-800 dark:text-navy-200')}>{icon}</div>
      <div className="min-w-0">
        <div className={cx('text-[15px] font-semibold', danger && 'text-rose-500')}>{title}</div>
        <div className="text-[13px] text-navy-400">{text}</div>
      </div>
    </button>
  );
}
