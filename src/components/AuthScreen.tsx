import { useState } from 'react';
import { ArrowRight, Cloud, Eye, EyeOff, Loader2, Lock, Mail, Smartphone, UserRound } from 'lucide-react';
import { useCloud } from '../store/Cloud';
import { Logo } from '../App';
import { Field, Modal, Segmented, cx } from './ui';

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

export function AuthScreen() {
  const cloud = useCloud();
  const [mode, setMode] = useState<'in' | 'up'>('up');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [forgot, setForgot] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (mode === 'up' && !name.trim()) er.name = 'Как к вам обращаться?';
    if (!emailOk(email)) er.email = 'Введите почту, например name@mail.kz';
    if (password.length < 8) er.password = 'Минимум 8 символов';
    setErr(er);
    setNotice('');
    if (Object.keys(er).length) return;
    setBusy(true);
    if (mode === 'in') {
      const error = await cloud.signIn(email, password);
      if (error) setErr({ form: error });
    } else {
      const r = await cloud.signUp(name, email, password);
      if (r.error) setErr({ form: r.error });
      else if (r.needsConfirm) setNotice(`Мы отправили письмо на ${email.trim()}. Откройте ссылку из письма — и вы войдёте автоматически.`);
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-navy-950 text-white lg:grid lg:grid-cols-2">
      <div className="relative overflow-hidden px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))] lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-mint-400/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-10 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="relative">
          <div className="[&_div]:text-white"><Logo /></div>
          <h1 className="mt-8 text-[30px] font-extrabold leading-tight tracking-tight lg:text-[44px]">
            Все деньги —<br />в одном месте
          </h1>
          <p className="mt-3 max-w-md text-[15px] text-navy-200">Kaspi, Halyk, наличные: загрузите выписки, и Money Flow сам разложит траты по категориям.</p>
          <div className="mt-6 hidden gap-3 lg:grid">
            {[
              { icon: Cloud, t: 'Данные в облаке — ничего не потеряется' },
              { icon: Smartphone, t: 'iPhone и компьютер синхронизируются' },
              { icon: Lock, t: 'Ваши данные видите только вы' },
            ].map(({ icon: Icon, t }) => (
              <div key={t} className="flex items-center gap-3 text-sm text-navy-100"><Icon className="h-5 w-5 text-mint-400" />{t}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center bg-[#F3F6FB] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 text-navy-900 dark:bg-navy-900 dark:text-white lg:items-center lg:rounded-l-[40px] lg:py-10">
        <div className="w-full max-w-md -mt-12 rounded-[28px] bg-white p-6 shadow-xl dark:bg-navy-850 lg:mt-0">
          <Segmented value={mode} onChange={(m) => { setMode(m); setErr({}); setNotice(''); }} options={[{ value: 'up', label: 'Регистрация' }, { value: 'in', label: 'Вход' }]} />
          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            {mode === 'up' && (
              <Field label="Имя" error={err.name}>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-300" />
                  <input id="auth-name" autoComplete="given-name" className={cx('input pl-12', err.name && 'input-error')} value={name} onChange={(e) => setName(e.target.value)} placeholder="Рахман" />
                </div>
              </Field>
            )}
            <Field label="Почта" error={err.email}>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-300" />
                <input id="auth-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" className={cx('input pl-12', err.email && 'input-error')} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@mail.kz" />
              </div>
            </Field>
            <Field label="Пароль" error={err.password}>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-300" />
                <input id="auth-password" type={show ? 'text' : 'password'} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} className={cx('input pl-12 pr-12', err.password && 'input-error')} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 8 символов" />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Скрыть пароль' : 'Показать пароль'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-2 text-navy-400 hover:bg-navy-50 dark:hover:bg-navy-800">
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </Field>
            {err.form && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{err.form}</div>}
            {notice && <div className="rounded-2xl bg-mint-400/10 px-4 py-3 text-sm font-medium text-mint-700 dark:text-mint-300">{notice}</div>}
            <button className="btn-primary w-full py-3.5 text-[15px]" disabled={busy}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <>{mode === 'up' ? 'Создать аккаунт' : 'Войти'} <ArrowRight className="h-4 w-4" /></>}
            </button>
            {mode === 'in' && (
              <button type="button" onClick={() => setForgot(true)} className="w-full text-center text-sm font-semibold text-navy-500 hover:text-navy-800 dark:text-navy-300">Забыли пароль?</button>
            )}
          </form>
          <div className="mt-5 border-t border-navy-100 pt-4 text-center dark:border-navy-700">
            <button onClick={cloud.continueAsGuest} className="text-sm font-semibold text-navy-500 hover:text-navy-900 dark:text-navy-300 dark:hover:text-white">
              Продолжить без аккаунта
            </button>
            <div className="mt-1 text-[12px] text-navy-400">Данные будут только на этом устройстве</div>
          </div>
        </div>
      </div>
      <ForgotModal open={forgot} onClose={() => setForgot(false)} initial={email} />
    </div>
  );
}

function ForgotModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: string }) {
  const cloud = useCloud();
  const [email, setEmail] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Восстановить пароль" footer={
      <button className="btn-primary w-full py-3" disabled={busy} onClick={async () => {
        if (!emailOk(email)) return setMsg({ ok: false, text: 'Введите почту' });
        setBusy(true);
        const e = await cloud.resetPassword(email);
        setBusy(false);
        setMsg(e ? { ok: false, text: e } : { ok: true, text: 'Письмо отправлено. Откройте ссылку из него на этом устройстве.' });
      }}>Отправить ссылку</button>
    }>
      <div className="space-y-3 pb-2">
        <Field label="Почта"><input id="forgot-email" type="email" autoCapitalize="none" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {msg && <div className={cx('rounded-2xl px-4 py-3 text-sm font-medium', msg.ok ? 'bg-mint-400/10 text-mint-700 dark:text-mint-300' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10')}>{msg.text}</div>}
      </div>
    </Modal>
  );
}

/** Окна, которые нужны после входа: выбор, что делать с данными, и новый пароль */
export function CloudDialogs() {
  const cloud = useCloud();
  const [pwd, setPwd] = useState('');
  const [pwdErr, setPwdErr] = useState('');
  const c = cloud.choice;
  return (
    <>
      <Modal open={!!c} onClose={() => {}} title={c?.kind === 'both' ? 'В аккаунте уже есть данные' : 'Перенести данные в аккаунт?'}
        footer={c?.kind === 'both' ? (
          <div className="flex flex-col gap-2">
            <button className="btn-primary w-full py-3" onClick={() => cloud.resolveChoice('cloud')}>Использовать данные аккаунта</button>
            <button className="btn-ghost w-full py-3" onClick={() => cloud.resolveChoice('merge')}>Объединить с данными устройства</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button className="btn-primary w-full py-3" onClick={() => cloud.resolveChoice('upload')}>Перенести в аккаунт</button>
            <button className="btn-ghost w-full py-3" onClick={() => cloud.resolveChoice('fresh')}>Начать с чистого листа</button>
          </div>
        )}>
        <p className="pb-2 text-sm text-navy-500 dark:text-navy-300">
          {c?.kind === 'both'
            ? 'На этом устройстве тоже есть операции. Можно взять только данные из аккаунта или добавить к ним операции с устройства (повторы из выписок не задвоятся).'
            : 'На устройстве уже есть операции, цели и бюджет (возможно, демо-данные). Перенесите их в аккаунт или начните учёт с нуля.'}
        </p>
      </Modal>
      <Modal open={cloud.recovery} onClose={cloud.closeRecovery} title="Новый пароль" footer={
        <button className="btn-primary w-full py-3" onClick={async () => {
          if (pwd.length < 8) return setPwdErr('Минимум 8 символов');
          const e = await cloud.updatePassword(pwd);
          if (e) return setPwdErr(e);
          cloud.closeRecovery();
        }}>Сохранить пароль</button>
      }>
        <div className="pb-2"><Field label="Пароль" error={pwdErr}><input id="new-password" type="password" autoComplete="new-password" className="input" value={pwd} onChange={(e) => { setPwd(e.target.value); setPwdErr(''); }} /></Field></div>
      </Modal>
    </>
  );
}
