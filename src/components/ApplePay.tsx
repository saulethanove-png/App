import { useCallback, useEffect, useState } from 'react';
import type React from 'react';
import { Check, CheckCircle2, ChevronDown, Copy, KeyRound, Loader2, RefreshCw, Smartphone, Trash2, Zap } from 'lucide-react';
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

type Phase = 'install' | 'test' | 'automation' | 'done';
const PHASES: Phase[] = ['install', 'test', 'automation', 'done'];
const phaseKey = (uid: string) => `moneyflow:wallet-phase:${uid}`;
const readPhase = (uid: string): Phase => {
  try { const v = localStorage.getItem(phaseKey(uid)) as Phase | null; return v && PHASES.includes(v) ? v : 'install'; } catch { return 'install'; }
};
const writePhase = (uid: string, p: Phase) => { try { localStorage.setItem(phaseKey(uid), p); } catch { /* приватный режим */ } };

function ApplePaySetup({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const cloud = useCloud();
  const uid = cloud.user?.id ?? 'guest';
  const [token, setToken] = useState<string | null>(null);
  const [lastUsed, setLastUsed] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [phase, setPhaseRaw] = useState<Phase>(() => readPhase(uid));
  const setPhase = (p: Phase) => { setPhaseRaw(p); writePhase(uid, p); };

  const refresh = useCallback(async () => {
    try {
      const t = await walletApi.get();
      // ключ нужен заранее: при нажатии он сразу копируется (Safari разрешает копировать только в момент нажатия)
      setToken(t?.token ?? (await walletApi.rotate()));
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
  // команда отозвалась — значит установлена и ключ на месте: сразу к автоматизации
  useEffect(() => {
    if (lastUsed && (phase === 'install' || phase === 'test')) setPhase('automation');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUsed]);

  const linkReady = !!SHORTCUT_ICLOUD_URL;

  /** Одна кнопка: каждый раз делает следующий шаг */
  const next = async () => {
    setErr('');
    if (phase === 'install') {
      if (!token) return;
      try { await navigator.clipboard.writeText(token); } catch { /* ключ виден ниже — можно скопировать вручную */ }
      setPhase('test');
      window.location.href = SHORTCUT_ICLOUD_URL;
      return;
    }
    if (phase === 'test') {
      runShortcut('test');
      return;
    }
    if (phase === 'automation') {
      setPhase('done');
      toast({ kind: 'success', title: 'Готово!', text: 'Оплатите что-нибудь Apple Pay — трата появится сама' });
      return;
    }
    onClose();
  };

  const rotate = async () => {
    setBusy(true); setErr('');
    try { const t = await walletApi.rotate(); setToken(t); setLastUsed(null); setPhase('install'); toast({ kind: 'success', title: 'Новый ключ создан', text: 'Удалите старую команду и установите заново' }); } catch (e) { setErr(walletError(e)); }
    setBusy(false);
  };
  const revoke = async () => {
    setBusy(true);
    try { await walletApi.revoke(); setToken(null); setLastUsed(null); setPhase('install'); toast({ kind: 'info', title: 'Apple Pay отключён' }); } catch (e) { setErr(walletError(e)); }
    setBusy(false);
  };

  const idx = PHASES.indexOf(phase);
  const label: Record<Phase, string> = {
    install: 'Подключить Apple Pay',
    test: 'Проверить',
    automation: 'Я включил — готово',
    done: 'Закрыть',
  };
  const hint: Record<Phase, React.ReactNode> = {
    install: <>Ваш ключ скопируется сам. Откроются «Команды» → <b>«Добавить команду»</b>. Если спросят ключ — нажмите в поле и <b>«Вставить»</b>. Потом вернитесь сюда.</>,
    test: <>Нажмите — команда отправит проверку. Появится <b>«Finalyze подключён ✅»</b> — вернитесь сюда.</>,
    automation: null,
    done: <>Всё работает. Оплатили телефоном — трата появится в Finalyze с категорией.</>,
  };

  return (
    <Modal open onClose={onClose} title="Apple Pay → Finalyze">
      <div className="space-y-4 pb-4 text-[14px]">
        <div className={cx('flex items-center gap-3 rounded-2xl p-3', lastUsed ? 'bg-mint-400/10' : 'bg-navy-50 dark:bg-navy-850')}>
          {busy ? <Loader2 className="h-5 w-5 animate-spin text-navy-400" /> : lastUsed ? <CheckCircle2 className="h-5 w-5 text-mint-500" /> : <Zap className="h-5 w-5 text-amber-500" />}
          <div className="text-[13px] font-semibold">
            {lastUsed ? `Связь есть · последний сигнал ${ago(lastUsed)}` : 'Не подключено · около минуты'}
          </div>
        </div>

        {/* прогресс */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className={cx('h-1.5 flex-1 rounded-full', i < idx ? 'bg-mint-400' : i === idx ? 'bg-mint-400/50' : 'bg-navy-100 dark:bg-navy-800')} />
          ))}
        </div>

        {!linkReady && phase === 'install' ? (
          <div className="rounded-2xl bg-amber-50 p-3 text-[13px] text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
            Подключение Apple Pay скоро станет доступно. Мы сообщим, когда кнопка заработает.
          </div>
        ) : (
          <>
            {phase === 'automation' ? (
              <div className="rounded-2xl border border-navy-100 p-3 dark:border-navy-800">
                <div className="font-bold">Последний шаг — его Apple разрешает сделать только вам</div>
                <ol className="mt-2 space-y-1.5 text-[13px] text-navy-600 dark:text-navy-300">
                  <li>1. Откройте <b>«Команды»</b> → внизу <b>«Автоматизация»</b> → <b>«+»</b></li>
                  <li>2. Выберите <b>«Транзакция»</b>, отметьте свои карты, включите <b>«Запускать сразу»</b> → «Далее»</li>
                  <li>3. Нажмите <b>«{SHORTCUT_NAME}»</b> в списке — готово</li>
                </ol>
                <a className="btn-ghost mt-3 w-full" href="shortcuts://"><Smartphone className="h-4 w-4" /> Открыть «Команды»</a>
              </div>
            ) : (
              <div className="text-[13px] text-navy-500 dark:text-navy-300">{hint[phase]}</div>
            )}
            <button className="btn-primary w-full py-4 text-[16px]" onClick={next} disabled={busy || (phase === 'install' && !token)}>
              {phase === 'done' ? <Check className="h-5 w-5" /> : <AppleLogo className="h-5 w-5" />} {label[phase]}
            </button>
            {phase === 'test' && !lastUsed && (
              <button className="w-full text-center text-[12px] text-navy-400 underline" onClick={() => setPhase('install')}>Команда не установилась? Установить ещё раз</button>
            )}
            {(phase === 'install' || phase === 'test') && token && (
              <Expand title="Ключ не вставился? Скопировать вручную">
                <CopyRow label="ключ" value={token} secret />
              </Expand>
            )}
          </>
        )}

        {err && <div className="rounded-2xl bg-rose-50 p-3 text-[13px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{err}</div>}

        {cloud.isAdmin && (
          <Expand title="Для администратора: рецепт команды «Finalyze»">
            <ol className="list-decimal space-y-1.5 pl-5 text-[12px] leading-snug">
              <li>«Команды» → «+» → название <b>{SHORTCUT_NAME}</b>.</li>
              <li>Действие <b>«Текст»</b> → напишите в нём <code>КЛЮЧ</code>.</li>
              <li>Действие <b>«Получить содержимое URL»</b> → вставьте URL целиком (ниже, уже с ключом) → «▸»: метод <b>POST</b>; «Текст запроса» → <b>JSON</b> → поле <code>p_token</code> = переменная «Текст», поле <code>p_raw</code> = переменная «Ввод команды». Заголовки не нужны.</li>
              <li>Действие <b>«Показать уведомление»</b> → переменная «Содержимое URL».</li>
              <li>Внизу «ⓘ» → «Настройка» → «Добавить вопрос» → выберите действие «Текст» → вопрос: «Вставьте ключ из Finalyze».</li>
              <li>«Готово» → удерживайте команду → «Поделиться» → <b>«Скопировать ссылку iCloud»</b> → пришлите разработчику.</li>
            </ol>
            <div className="mt-2 rounded-xl bg-white p-2 dark:bg-navy-900">
              <CopyRow label="URL" value={`${WALLET_URL}?apikey=${PUBLIC_KEY}`} />
              {token ? <CopyRow label="p_token" value={token} secret /> : <button className="btn-ghost w-full" onClick={rotate}><KeyRound className="h-4 w-4" /> Получить ключ</button>}
            </div>
          </Expand>
        )}

        {token && (phase === 'done' || cloud.isAdmin) && (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost" onClick={rotate} disabled={busy}><RefreshCw className="h-4 w-4" /> Новый ключ</button>
            <button className="btn-danger" onClick={revoke} disabled={busy}><Trash2 className="h-4 w-4" /> Отключить</button>
          </div>
        )}
        <div className="text-[12px] text-navy-400">Работает с Apple Pay на iOS 17+. Kaspi QR и переводы подтянет импорт выписки — без дублей.</div>
      </div>
    </Modal>
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
