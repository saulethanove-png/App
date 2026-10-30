import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AppState } from '../types';
import { supabase, cloudEnabled } from '../lib/supabase';
import { diffState, fullUpload, loadQueue, pullState, pushOps, saveQueue, type Op } from '../lib/sync';
import { emptyState } from '../lib/seed';
import { useStore } from './AppStore';
import { useToast } from './Toasts';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

type Choice = null | { kind: 'empty' } | { kind: 'both'; cloud: AppState };

interface CloudCtx {
  enabled: boolean;
  ready: boolean; // сессия проверена
  user: User | null;
  guest: boolean;
  status: SyncStatus;
  lastSync: number | null;
  pending: number;
  choice: Choice;
  resolveChoice: (c: 'upload' | 'fresh' | 'merge' | 'cloud') => void;
  continueAsGuest: () => void;
  leaveGuest: () => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (name: string, email: string, password: string) => Promise<{ error: string | null; needsConfirm: boolean }>;
  resetPassword: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  recovery: boolean;
  closeRecovery: () => void;
}

const Ctx = createContext<CloudCtx>(null as never);
export const useCloud = () => useContext(Ctx);

const OWNER = 'moneyflow:owner';
const GUEST = 'moneyflow:guest';
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* */ } },
};

/** Ошибки Supabase → понятный русский текст */
export function authError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Неверная почта или пароль';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Эта почта уже зарегистрирована — войдите';
  if (m.includes('email not confirmed')) return 'Почта не подтверждена — откройте письмо от Supabase';
  if (m.includes('password should be') || m.includes('weak')) return 'Пароль слишком простой: минимум 8 символов';
  if (m.includes('rate limit') || m.includes('too many')) return 'Слишком много попыток. Подождите минуту';
  if (m.includes('fetch') || m.includes('network')) return 'Нет связи с сервером. Проверьте интернет';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'Проверьте адрес почты';
  return msg;
}

export function CloudProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!cloudEnabled);
  const [guest, setGuest] = useState(() => ls.get(GUEST) === '1');
  const [status, setStatus] = useState<SyncStatus>(cloudEnabled ? 'idle' : 'off');
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const [choice, setChoice] = useState<Choice>(null);
  const [recovery, setRecovery] = useState(false);

  const stateRef = useRef(state);
  const prevRef = useRef(state);
  const linked = useRef(false); // данные на устройстве принадлежат вошедшему пользователю
  const queue = useRef<Map<string, Op>>(new Map());
  const userRef = useRef<User | null>(null);
  const timer = useRef<number>();
  const flushing = useRef<Promise<void> | null>(null);
  const lastOk = useRef(true);
  stateRef.current = state;

  /** Подмена локальных данных данными из облака — без отправки их обратно */
  const replaceLocal = (s: AppState) => {
    prevRef.current = s;
    dispatch({ type: 'import', state: s });
  };

  const flush = useCallback(async () => {
    const sb = supabase;
    const u = userRef.current;
    if (!sb || !u || !linked.current) return;
    if (flushing.current) return flushing.current;
    if (!queue.current.size) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('offline');
      return;
    }
    const run = (async () => {
      setStatus('syncing');
      const sent = new Map(queue.current);
      try {
        const done = await pushOps(sb, u.id, [...sent.values()]);
        for (const k of done) if (queue.current.get(k) === sent.get(k)) queue.current.delete(k);
        saveQueue(u.id, queue.current);
        setPending(queue.current.size);
        setStatus('idle');
        setLastSync(Date.now());
        lastOk.current = true;
      } catch (e) {
        lastOk.current = false;
        console.error('sync push', e);
        setStatus(navigator.onLine ? 'error' : 'offline');
      } finally {
        flushing.current = null;
      }
    })();
    flushing.current = run;
    await run;
    if (queue.current.size && lastOk.current) {
      // за время отправки появились новые изменения
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 1500);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enqueue = useCallback((ops: Op[]) => {
    const u = userRef.current;
    if (!u || !ops.length) return;
    for (const o of ops) queue.current.set(`${o.kind}:${o.id}`, o);
    saveQueue(u.id, queue.current);
    setPending(queue.current.size);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 700);
  }, [flush]);

  const pull = useCallback(async () => {
    const sb = supabase;
    const u = userRef.current;
    if (!sb || !u || !linked.current) return;
    await flush();
    if (queue.current.size) return; // не затираем неотправленные изменения
    setStatus('syncing');
    try {
      const cloud = await pullState(sb, u.id, stateRef.current);
      if (cloud) replaceLocal(cloud);
      setStatus('idle');
      setLastSync(Date.now());
    } catch (e) {
      console.error('sync pull', e);
      setStatus(navigator.onLine ? 'error' : 'offline');
    }
  }, [flush]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Первый вход на этом устройстве: решаем, что делать с локальными данными */
  const link = useCallback(async (u: User) => {
    const sb = supabase!;
    queue.current = loadQueue(u.id);
    setPending(queue.current.size);
    if (ls.get(OWNER) === u.id) {
      linked.current = true;
      await pull();
      return;
    }
    setStatus('syncing');
    try {
      const cloud = await pullState(sb, u.id, stateRef.current);
      const local = stateRef.current;
      const localHasData = local.transactions.length > 0 || local.goals.length > 0;
      if (cloud) {
        if (localHasData) setChoice({ kind: 'both', cloud });
        else finishLink(u, cloud, []);
      } else if (localHasData) {
        setChoice({ kind: 'empty' });
      } else {
        finishLink(u, withName(local, u), fullUpload(withName(local, u)));
      }
      setStatus('idle');
    } catch (e) {
      console.error('link', e);
      setStatus('error');
      toast({ kind: 'error', title: 'Не удалось загрузить данные аккаунта', text: 'Проверьте интернет и нажмите «Синхронизировать» в профиле' });
    }
  }, [pull]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishLink = (u: User, s: AppState, ops: Op[]) => {
    replaceLocal(s);
    ls.set(OWNER, u.id);
    linked.current = true;
    setChoice(null);
    if (ops.length) {
      for (const o of ops) queue.current.set(`${o.kind}:${o.id}`, o);
      saveQueue(u.id, queue.current);
      setPending(queue.current.size);
      setTimeout(flush, 50);
    }
  };

  const resolveChoice = (c: 'upload' | 'fresh' | 'merge' | 'cloud') => {
    const u = userRef.current;
    if (!u || !choice) return;
    const local = stateRef.current;
    if (c === 'upload') {
      const s = withName(local, u);
      finishLink(u, s, fullUpload(s));
      toast({ kind: 'success', title: 'Данные перенесены в аккаунт' });
    } else if (c === 'fresh') {
      const s = withName({ ...emptyState(), profile: { ...emptyState().profile, theme: local.profile.theme } }, u);
      finishLink(u, s, fullUpload(s));
    } else if (c === 'cloud' && choice.kind === 'both') {
      finishLink(u, choice.cloud, []);
    } else if (c === 'merge' && choice.kind === 'both') {
      const m = mergeStates(choice.cloud, local);
      finishLink(u, m, fullUpload(m));
      toast({ kind: 'success', title: 'Данные объединены' });
    }
  };

  // сессия
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const u = data.session?.user ?? null;
      userRef.current = u;
      setUser(u);
      setReady(true);
      if (u) link(u);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      const changed = (userRef.current?.id ?? null) !== (u?.id ?? null);
      userRef.current = u;
      setUser(u);
      if (changed && u) {
        linked.current = false;
        link(u);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [link]);

  // каждое изменение данных → очередь
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (!linked.current || !userRef.current || prev === state) return;
    enqueue(diffState(prev, state));
  }, [state, enqueue]);

  // сеть появилась / вернулись в приложение — синхронизируемся
  useEffect(() => {
    if (!supabase) return;
    let lastPull = 0;
    const onOnline = () => flush();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        flush();
        return;
      }
      if (Date.now() - lastPull > 20_000) {
        lastPull = Date.now();
        pull();
      }
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [flush, pull]);

  const value: CloudCtx = {
    enabled: cloudEnabled,
    ready,
    user,
    guest,
    status,
    lastSync,
    pending,
    choice,
    resolveChoice,
    recovery,
    closeRecovery: () => setRecovery(false),
    continueAsGuest: () => {
      ls.set(GUEST, '1');
      setGuest(true);
    },
    leaveGuest: () => {
      ls.del(GUEST);
      setGuest(false);
    },
    signIn: async (email, password) => {
      if (!supabase) return 'Облако не настроено';
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return error ? authError(error.message) : null;
    },
    signUp: async (name, email, password) => {
      if (!supabase) return { error: 'Облако не настроено', needsConfirm: false };
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim() }, emailRedirectTo: location.origin + location.pathname },
      });
      if (error) return { error: authError(error.message), needsConfirm: false };
      if (data.user && data.user.identities && data.user.identities.length === 0) return { error: 'Эта почта уже зарегистрирована — войдите', needsConfirm: false };
      return { error: null, needsConfirm: !data.session };
    },
    resetPassword: async (email) => {
      if (!supabase) return 'Облако не настроено';
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
      return error ? authError(error.message) : null;
    },
    updatePassword: async (password) => {
      if (!supabase) return 'Облако не настроено';
      const { error } = await supabase.auth.updateUser({ password });
      return error ? authError(error.message) : null;
    },
    signOut: async () => {
      if (!supabase) return;
      await flush().catch(() => {});
      const u = userRef.current;
      linked.current = false;
      await supabase.auth.signOut();
      if (u) {
        queue.current = new Map();
        saveQueue(u.id, queue.current);
      }
      ls.del(OWNER);
      ls.del(GUEST);
      setGuest(false);
      // на устройстве не оставляем чужие данные
      replaceLocal({ ...emptyState(), profile: { ...emptyState().profile, theme: stateRef.current.profile.theme } });
    },
    syncNow: async () => {
      await flush();
      await pull();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function withName(s: AppState, u: User): AppState {
  const name = (u.user_metadata?.name as string | undefined)?.trim();
  return name && !s.profile.name ? { ...s, profile: { ...s.profile, name } } : name && s.profile.name === 'Рахман' && name !== 'Рахман' ? { ...s, profile: { ...s.profile, name } } : s;
}

/** Объединение: всё из облака + то, чего в облаке нет (операции из выписок — без повторов) */
export function mergeStates(cloud: AppState, local: AppState): AppState {
  const ids = <T extends { id: string }>(l: T[]) => new Set(l.map((x) => x.id));
  const ext = new Set(cloud.transactions.map((t) => t.externalId).filter(Boolean));
  const txIds = ids(cloud.transactions);
  return {
    ...cloud,
    transactions: [...cloud.transactions, ...local.transactions.filter((t) => !txIds.has(t.id) && !(t.externalId && ext.has(t.externalId)))],
    accounts: [...cloud.accounts, ...local.accounts.filter((a) => !ids(cloud.accounts).has(a.id))],
    goals: [...cloud.goals, ...local.goals.filter((g) => !ids(cloud.goals).has(g.id))],
    rules: [...cloud.rules, ...local.rules.filter((r) => !cloud.rules.some((c) => c.pattern === r.pattern && c.type === r.type))],
  };
}
