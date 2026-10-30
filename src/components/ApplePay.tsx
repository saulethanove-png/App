import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, RefreshCw, Smartphone, Trash2 } from 'lucide-react';
import { useCloud } from '../store/Cloud';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toasts';
import { PUBLIC_KEY, WALLET_URL, walletApi, walletError } from '../lib/wallet';
import { formatMoney } from '../lib/format';
import { Card, Modal, cx } from './ui';

/** Карточка в профиле: автоматическая запись трат по Apple Pay через «Команды» */
export function ApplePayCard() {
  const cloud = useCloud();
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const count = state.transactions.filter((t) => t.source === 'wallet').length;
  const last = state.transactions.filter((t) => t.source === 'wallet').sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!cloud.enabled) return null;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-navy-900 text-white dark:bg-white dark:text-navy-950">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden><path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.3.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.8zM14.1 5.8c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z" /></svg>
        </div>
        <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-auto">
          <div className="font-bold">Apple Pay — траты записываются сами</div>
          <div className="text-[13px] text-navy-400">
            {count ? `Записано ${count} оплат${last ? ` · последняя ${formatMoney(last.amount)} ${last.note ?? ''}` : ''}` : 'Оплатили телефоном — операция появилась в Money Flow с категорией'}
          </div>
        </div>
        <button className="btn-dark w-full sm:w-auto" disabled={!cloud.user} onClick={() => setOpen(true)}>
          <Smartphone className="h-4 w-4" /> {count ? 'Настройки' : 'Подключить'}
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

  useEffect(() => {
    walletApi.get().then((t) => { setToken(t?.token ?? null); setLastUsed(t?.last_used_at ?? null); }).catch((e) => setErr(walletError(e))).finally(() => setBusy(false));
  }, []);

  const rotate = async () => {
    setBusy(true); setErr('');
    try { setToken(await walletApi.rotate()); setLastUsed(null); toast({ kind: 'success', title: 'Ключ создан' }); } catch (e) { setErr(walletError(e)); }
    setBusy(false);
  };
  const revoke = async () => {
    setBusy(true);
    try { await walletApi.revoke(); setToken(null); toast({ kind: 'info', title: 'Apple Pay отключён', text: 'Команда больше не сможет записывать операции' }); } catch (e) { setErr(walletError(e)); }
    setBusy(false);
  };

  return (
    <Modal open onClose={onClose} title="Apple Pay → Money Flow">
      <div className="space-y-4 pb-4 text-[14px]">
        <p className="text-navy-500 dark:text-navy-300">
          iPhone сам запускает команду при каждой оплате картой из Wallet и отправляет сумму, магазин и карту. Категорию Money Flow подберёт по вашим правилам. Нужен iOS 17 или новее.
        </p>

        {busy && !token ? (
          <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-mint-500" /></div>
        ) : !token ? (
          <button className="btn-primary w-full py-3" onClick={rotate} disabled={busy}><KeyRound className="h-4 w-4" /> Получить ключ</button>
        ) : (
          <>
            <div className="rounded-2xl bg-navy-50 p-3 dark:bg-navy-850">
              <div className="mb-2 flex items-center justify-between text-[12px] font-semibold text-navy-400">
                <span>Данные для команды</span>
                <span>{lastUsed ? `последняя оплата ${new Date(lastUsed).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}` : 'ещё не использовался'}</span>
              </div>
              <CopyRow label="URL" value={WALLET_URL} />
              <CopyRow label="apikey" value={PUBLIC_KEY} />
              <CopyRow label="p_token (секрет)" value={token} secret />
            </div>

            <ol className="space-y-3">
              <Step n={1} title="Новая автоматизация">Приложение <b>«Команды»</b> → вкладка <b>«Автоматизация»</b> → <b>«+»</b> → <b>«Транзакция»</b>.</Step>
              <Step n={2} title="Карты">Выберите <b>Kaspi Gold</b> и <b>Alatau City Bank</b> (или нужные карты), категории — все. Включите <b>«Запускать сразу»</b> → <b>«Далее»</b> → <b>«Новая пустая автоматизация»</b>.</Step>
              <Step n={3} title="Отправка">Добавьте действие <b>«Получить содержимое URL»</b>. URL — из поля выше. Нажмите «▸» и задайте: метод <b>POST</b>; заголовки <b>apikey</b> = ключ выше и <b>Content-Type</b> = <code>application/json</code>; текст запроса <b>JSON</b>.</Step>
              <Step n={4} title="Поля JSON">Добавьте 4 поля типа «Текст»:
                <ul className="mt-1 space-y-0.5 text-[13px]">
                  <li><code>p_token</code> — секретный ключ выше</li>
                  <li><code>p_amount</code> — переменная <b>«Сумма»</b> (из «Ввода команды»)</li>
                  <li><code>p_merchant</code> — переменная <b>«Продавец»</b></li>
                  <li><code>p_card</code> — переменная <b>«Карта или пропуск»</b></li>
                </ul>
              </Step>
              <Step n={5} title="Проверка">Сохраните и оплатите что-нибудь через Apple Pay — операция появится в Money Flow через пару секунд.</Step>
            </ol>

            <div className="rounded-2xl bg-amber-50 p-3 text-[12px] text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
              Не показывайте секретный ключ другим: с ним можно добавлять операции в ваш аккаунт (но не читать их). Если ключ попал к кому-то — создайте новый, старый перестанет работать. Покупки через Kaspi QR и переводы сюда не попадают — их подтянет импорт выписки, без дублей.
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" onClick={rotate} disabled={busy}><RefreshCw className="h-4 w-4" /> Новый ключ</button>
              <button className="btn-danger" onClick={revoke} disabled={busy}><Trash2 className="h-4 w-4" /> Отключить</button>
            </div>
          </>
        )}
        {err && <div className="rounded-2xl bg-rose-50 p-3 text-[13px] font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{err}</div>}
      </div>
    </Modal>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-mint-400/15 text-[12px] font-extrabold text-mint-600 dark:text-mint-300">{n}</span>
      <div className="min-w-0 text-[13px] leading-snug"><div className="font-bold">{title}</div><div className="text-navy-600 dark:text-navy-300">{children}</div></div>
    </li>
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
      <div className="w-28 shrink-0 text-[12px] font-semibold text-navy-400">{label}</div>
      <button type="button" onClick={() => setShown(true)} className={cx('min-w-0 flex-1 select-all truncate rounded-lg bg-white px-2 py-1.5 text-left font-mono text-[12px] dark:bg-navy-900', !shown && 'tracking-widest')}>
        {shown ? value : '••••••••••••••'}
      </button>
      <button type="button" onClick={copy} aria-label={`Скопировать ${label}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-navy-500 hover:bg-white dark:hover:bg-navy-800">
        {copied ? <Check className="h-4 w-4 text-mint-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
