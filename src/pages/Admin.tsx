import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Ban, Eye, EyeOff, Loader2, Pencil, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, ShieldOff, Trash2,
} from 'lucide-react';
import { adminApi, adminError, type AdminStats, type AdminUser, type AdminUserDetail, type AuditRow } from '../lib/admin';
import { BUILTIN, type ContentKind, type Merged, type Origin } from '../lib/content';
import { useContent } from '../store/Content';
import { useCloud } from '../store/Cloud';
import { useToast } from '../store/Toasts';
import { getCategory } from '../lib/categories';
import { bankInfo } from '../lib/bankImport';
import { formatDateShort, formatMoney, uid } from '../lib/format';
import { BankBadge } from '../components/ImportWizard';
import { Card, CategoryIcon, Empty, Field, Modal, SectionHeader, Segmented, cx } from '../components/ui';
import type { BankId } from '../types';

type Tab = 'overview' | 'users' | 'content' | 'audit';

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [usersErr, setUsersErr] = useState('');
  const loadUsers = useCallback(async () => {
    setUsersErr('');
    try { setUsers(await adminApi.users()); } catch (e) { setUsersErr(adminError(e)); }
  }, []);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-navy-900 text-mint-400 dark:bg-mint-400/10"><ShieldCheck className="h-6 w-6" /></div>
          <div>
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">Админка</h1>
            <div className="text-sm text-navy-400">Видна только администраторам</div>
          </div>
        </div>
      </header>
      <Segmented className="sm:max-w-xl" value={tab} onChange={setTab} options={[
        { value: 'overview', label: 'Обзор' }, { value: 'users', label: 'Люди' }, { value: 'content', label: 'Контент' }, { value: 'audit', label: 'Журнал' },
      ]} />
      {tab === 'overview' && <Overview />}
      {tab === 'users' && <UsersTab users={users} error={usersErr} reload={loadUsers} />}
      {tab === 'content' && <ContentTab />}
      {tab === 'audit' && <AuditTab users={users ?? []} />}
    </div>
  );
}

// ───────────── Обзор ─────────────

function Overview() {
  const [s, setS] = useState<AdminStats | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setErr('');
    try { setS(await adminApi.stats()); } catch (e) { setErr(adminError(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (err) return <ErrorCard text={err} onRetry={load} />;
  if (!s) return <Loading />;
  const tiles = [
    { label: 'Пользователей', value: s.users_total, sub: `+${s.users_7d} за 7 дней` },
    { label: 'Заходили за 7 дней', value: s.active_7d, sub: s.users_total ? `${Math.round((s.active_7d / s.users_total) * 100)}% от всех` : '' },
    { label: 'Ведут учёт', value: s.with_data, sub: 'есть хотя бы 1 операция' },
    { label: 'Операций', value: s.tx_total, sub: `${s.tx_30d} за 30 дней` },
    { label: 'Из выписок', value: s.tx_imported, sub: s.tx_total ? `${Math.round((s.tx_imported / s.tx_total) * 100)}% операций` : '' },
    { label: 'Счетов', value: s.accounts_total, sub: `${s.goals_total} целей · ${s.rules_total} правил` },
  ];
  const signups = s.signups.map((d) => ({ ...d, label: formatDateShort(String(d.day).slice(0, 10)) }));
  const banks = Object.entries(s.banks).sort((a, b) => b[1] - a[1]);
  const bankMax = Math.max(1, ...banks.map((b) => b[1]));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {tiles.map((t) => (
          <Card key={t.label} className="p-4">
            <div className="text-[12px] font-semibold text-navy-400">{t.label}</div>
            <div className="mt-1 text-[26px] font-extrabold tabular-nums tracking-tight">{t.value.toLocaleString('ru-RU')}</div>
            <div className="text-[12px] text-navy-400">{t.sub}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <SectionHeader title="Регистрации за 30 дней" action={<button className="btn-ghost px-3 py-2" onClick={load} aria-label="Обновить"><RefreshCw className="h-4 w-4" /></button>} />
          <div className="-mx-2 h-56">
            <ResponsiveContainer>
              <BarChart data={signups} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="currentColor" className="text-navy-100 dark:text-navy-800" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8197C9' }} interval="preserveStartEnd" minTickGap={16} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8197C9' }} width={28} />
                <Tooltip cursor={{ fill: 'rgba(34,211,127,.08)' }} contentStyle={{ borderRadius: 12, border: 'none', background: '#0B1328', color: '#fff' }} formatter={(v: number) => [v, 'регистраций']} />
                <Bar dataKey="count" fill="#22D37F" radius={[6, 6, 2, 2]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <SectionHeader title="Банки пользователей" />
          {banks.length ? (
            <div className="space-y-3">
              {banks.map(([b, n]) => (
                <div key={b} className="flex items-center gap-3">
                  <BankBadge bank={b as BankId} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-sm"><span className="font-semibold">{bankInfo(b as BankId).name}</span><span className="font-bold tabular-nums">{n}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-navy-100 dark:bg-navy-800"><div className="h-2 rounded-full" style={{ width: `${(n / bankMax) * 100}%`, background: bankInfo(b as BankId).color }} /></div>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="text-sm text-navy-400">Пока никто не загрузил выписку.</div>}
        </Card>
      </div>
    </div>
  );
}

// ───────────── Пользователи ─────────────

function UsersTab({ users, error, reload }: { users: AdminUser[] | null; error: string; reload: () => Promise<void> }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<AdminUser | null>(null);
  const list = useMemo(() => (users ?? []).filter((u) => (u.email + ' ' + (u.name ?? '')).toLowerCase().includes(q.toLowerCase().trim())), [users, q]);
  if (error) return <ErrorCard text={error} onRetry={reload} />;
  if (!users) return <Loading />;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-300" />
          <input id="admin-user-search" className="input pl-12" placeholder="Почта или имя" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn-ghost px-3" onClick={reload} aria-label="Обновить список"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <div className="text-[13px] text-navy-400">{list.length} из {users.length}</div>
      <Card className="divide-y divide-navy-100 p-2 dark:divide-navy-800">
        {list.map((u) => (
          <button key={u.id} onClick={() => setOpen(u)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left hover:bg-navy-50 dark:hover:bg-navy-850">
            <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl font-bold', u.banned ? 'bg-rose-500/10 text-rose-500' : 'bg-navy-900 text-mint-400 dark:bg-navy-700')}>
              {(u.name || u.email).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold">{u.name || u.email.split('@')[0]}</span>
                {u.is_admin && <span className="rounded-full bg-mint-400/15 px-1.5 text-[11px] font-bold text-mint-600 dark:text-mint-300">админ</span>}
                {u.banned && <span className="rounded-full bg-rose-500/10 px-1.5 text-[11px] font-bold text-rose-500">заблокирован</span>}
              </div>
              <div className="truncate text-[12px] text-navy-400">{u.email} · с {formatDateShort(u.created_at.slice(0, 10))}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold tabular-nums">{u.tx_count}</div>
              <div className="text-[11px] text-navy-400">операций</div>
            </div>
          </button>
        ))}
        {!list.length && <Empty emoji="👥" title="Никого не найдено" />}
      </Card>
      <UserModal key={open?.id ?? 'none'} user={open} onClose={() => setOpen(null)} onChanged={reload} />
    </div>
  );
}

function UserModal({ user, onClose, onChanged }: { user: AdminUser | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const cloud = useCloud();
  const toast = useToast();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState('');
  const isSelf = user?.id === cloud.user?.id;

  const loadDetail = async () => {
    if (!user) return;
    setErr('');
    try { setDetail(await adminApi.user(user.id)); setShow(true); } catch (e) { setErr(adminError(e)); }
  };
  const act = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast({ kind: 'success', title: ok }); await onChanged(); onClose(); } catch (e) { toast({ kind: 'error', title: adminError(e) }); }
    setBusy(false);
  };
  if (!user) return null;
  const tx = detail?.transactions ?? [];
  const inc = tx.filter((t) => t.type === 'income').reduce((a, t) => a + Number(t.amount), 0);
  const exp = tx.filter((t) => t.type === 'expense').reduce((a, t) => a + Number(t.amount), 0);

  return (
    <Modal open onClose={onClose} title={user.name || user.email}>
      <div className="space-y-4 pb-4">
        <div className="grid grid-cols-2 gap-2 text-[13px]">
          <Info label="Почта" value={user.email} wide />
          <Info label="Регистрация" value={new Date(user.created_at).toLocaleDateString('ru-RU')} />
          <Info label="Последний вход" value={user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—'} />
          <Info label="Операций" value={String(user.tx_count)} />
          <Info label="Последняя операция" value={user.last_tx ? formatDateShort(user.last_tx) : '—'} />
        </div>

        {!show ? (
          <div className="rounded-2xl border border-amber-300/50 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
            <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">Финансовые данные пользователя</div>
            <div className="mt-1 text-[13px] text-amber-800/80 dark:text-amber-200/80">Каждый просмотр записывается в журнал. Открывайте только когда это нужно — например, чтобы помочь с ошибкой.</div>
            <button className="btn-dark mt-3" onClick={loadDetail}><Eye className="h-4 w-4" /> Показать операции</button>
            {err && <div className="mt-2 text-[13px] font-medium text-rose-600">{err}</div>}
          </div>
        ) : detail && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Info label="Доходы" value={formatMoney(inc)} />
              <Info label="Расходы" value={formatMoney(exp)} />
              <Info label="Счетов / целей" value={`${detail.accounts.length} / ${detail.goals.length}`} />
            </div>
            {detail.accounts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {detail.accounts.map((a) => <span key={a.id} className="chip"><BankBadge bank={a.bank as BankId} size="sm" />{a.name}</span>)}
              </div>
            )}
            <div className="max-h-72 divide-y divide-navy-100 overflow-y-auto rounded-2xl border border-navy-100 dark:divide-navy-800 dark:border-navy-800">
              {tx.slice(0, 200).map((t) => {
                const c = getCategory(t.category_id);
                return (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2">
                    <CategoryIcon emoji={c.emoji} color={c.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{t.note || c.name}</div>
                      <div className="text-[11px] text-navy-400">{formatDateShort(t.date)} · {c.name}{t.source === 'import' ? ' · выписка' : ''}</div>
                    </div>
                    <div className={cx('text-[13px] font-bold tabular-nums', t.type === 'income' && 'text-mint-600 dark:text-mint-400')}>{formatMoney(t.type === 'income' ? Number(t.amount) : -Number(t.amount))}</div>
                  </div>
                );
              })}
              {!tx.length && <div className="p-4 text-center text-sm text-navy-400">Операций нет</div>}
            </div>
            {tx.length > 200 && <div className="text-[12px] text-navy-400">Показаны последние 200 из {tx.length}</div>}
          </div>
        )}

        {isSelf ? (
          <div className="rounded-2xl bg-navy-50 p-3 text-[13px] text-navy-500 dark:bg-navy-850 dark:text-navy-300">Это ваш аккаунт — заблокировать, удалить или снять права с себя нельзя.</div>
        ) : (
          <div className="space-y-2 border-t border-navy-100 pt-4 dark:border-navy-800">
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-ghost" disabled={busy} onClick={() => act(() => adminApi.setBanned(user.id, !user.banned), user.banned ? 'Пользователь разблокирован' : 'Вход заблокирован')}>
                <Ban className="h-4 w-4" /> {user.banned ? 'Разблокировать' : 'Заблокировать'}
              </button>
              <button className="btn-ghost" disabled={busy} onClick={() => act(() => adminApi.setAdmin(user.id, !user.is_admin), user.is_admin ? 'Права админа сняты' : 'Права админа выданы')}>
                {user.is_admin ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />} {user.is_admin ? 'Снять админа' : 'Сделать админом'}
              </button>
            </div>
            <details className="rounded-2xl border border-rose-200 p-3 dark:border-rose-500/30">
              <summary className="cursor-pointer text-sm font-semibold text-rose-600 dark:text-rose-400">Удалить аккаунт и все данные</summary>
              <div className="mt-3 space-y-2">
                <Field label={`Для подтверждения введите почту: ${user.email}`}>
                  <input id="admin-confirm-delete" className="input" autoCapitalize="none" value={confirmDel} onChange={(e) => setConfirmDel(e.target.value)} />
                </Field>
                <button className="btn w-full bg-rose-500 py-3 text-white hover:bg-rose-600" disabled={busy || confirmDel.trim().toLowerCase() !== user.email.toLowerCase()} onClick={() => act(() => adminApi.deleteUser(user.id), 'Аккаунт удалён')}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Удалить навсегда
                </button>
              </div>
            </details>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Info({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cx('rounded-2xl bg-navy-50 px-3 py-2 dark:bg-navy-850', wide && 'col-span-2')}>
      <div className="text-[11px] font-semibold text-navy-400">{label}</div>
      <div className="truncate text-[14px] font-bold tabular-nums">{value}</div>
    </div>
  );
}

// ───────────── Контент ─────────────

const KIND_LABEL: Record<ContentKind, string> = { article: 'Статьи', tip: 'Советы', term: 'Термины', task: 'Задания' };
const ORIGIN: Record<Origin, { text: string; cls: string }> = {
  builtin: { text: 'встроенный', cls: 'bg-navy-100 text-navy-500 dark:bg-navy-800 dark:text-navy-300' },
  edited: { text: 'изменён', cls: 'bg-sky-400/15 text-sky-600 dark:text-sky-300' },
  custom: { text: 'новый', cls: 'bg-mint-400/15 text-mint-600 dark:text-mint-300' },
  hidden: { text: 'скрыт', cls: 'bg-amber-400/15 text-amber-600 dark:text-amber-300' },
};

type AnyItem = { id: string; [k: string]: unknown };

function ContentTab() {
  const content = useContent();
  const toast = useToast();
  const [kind, setKind] = useState<ContentKind>('article');
  const [edit, setEdit] = useState<{ item: AnyItem | null; origin?: Origin } | null>(null);
  const list: Merged<AnyItem>[] = (kind === 'article' ? content.articles : kind === 'tip' ? content.tips : kind === 'term' ? content.terms : content.tasks) as unknown as Merged<AnyItem>[];
  const isBuiltin = (id: string) => (BUILTIN[kind] as { id: string }[]).some((b) => b.id === id);

  const run = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); await content.reload(); toast({ kind: 'success', title: ok }); } catch (e) { toast({ kind: 'error', title: adminError(e) }); }
  };
  const title = (m: Merged<AnyItem>) => String(m.item.title ?? m.item.text ?? m.item.term ?? m.item.id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(KIND_LABEL) as ContentKind[]).map((k) => (
          <button key={k} className={cx('chip', kind === k && 'chip-active')} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
        ))}
        <button className="btn-primary ml-auto" onClick={() => setEdit({ item: null })}><Plus className="h-4 w-4" /> Добавить</button>
      </div>
      <div className="text-[13px] text-navy-400">Изменения сразу видят все пользователи в разделе «Обучение». Встроенные материалы можно править, скрывать и возвращать к исходным.</div>
      <Card className="divide-y divide-navy-100 p-2 dark:divide-navy-800">
        {list.map((m) => (
          <div key={m.item.id} className={cx('flex items-center gap-3 px-2 py-3', m.origin === 'hidden' && 'opacity-60')}>
            <span className="text-xl">{String(m.item.emoji ?? (kind === 'term' ? '📖' : '•'))}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold">{title(m)}</div>
              <span className={cx('mt-0.5 inline-block rounded-full px-1.5 text-[11px] font-bold', ORIGIN[m.origin].cls)}>{ORIGIN[m.origin].text}</span>
            </div>
            <div className="flex shrink-0 gap-1">
              <IconBtn label="Изменить" onClick={() => setEdit({ item: m.item, origin: m.origin })}><Pencil className="h-4 w-4" /></IconBtn>
              {isBuiltin(m.item.id) ? (
                <>
                  {m.origin === 'hidden'
                    ? <IconBtn label="Показать" onClick={() => run(() => adminApi.deleteContent(m.item.id), 'Материал снова виден')}><Eye className="h-4 w-4" /></IconBtn>
                    : <IconBtn label="Скрыть" onClick={() => run(() => adminApi.saveContent({ id: m.item.id, kind, data: m.row?.data ?? {}, hidden: true }), 'Материал скрыт')}><EyeOff className="h-4 w-4" /></IconBtn>}
                  {m.origin === 'edited' && <IconBtn label="Вернуть исходный" onClick={() => run(() => adminApi.deleteContent(m.item.id), 'Возвращён исходный текст')}><RotateCcw className="h-4 w-4" /></IconBtn>}
                </>
              ) : (
                <>
                  <IconBtn label={m.origin === 'hidden' ? 'Показать' : 'Скрыть'} onClick={() => run(() => adminApi.saveContent({ id: m.item.id, kind, data: m.row?.data ?? {}, hidden: m.origin !== 'hidden', position: m.row?.position ?? 0 }), m.origin === 'hidden' ? 'Материал виден' : 'Материал скрыт')}>
                    {m.origin === 'hidden' ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </IconBtn>
                  <IconBtn label="Удалить" danger onClick={() => run(() => adminApi.deleteContent(m.item.id), 'Удалено')}><Trash2 className="h-4 w-4" /></IconBtn>
                </>
              )}
            </div>
          </div>
        ))}
      </Card>
      <ContentForm
        key={(edit?.item?.id ?? 'new') + kind + String(!!edit)}
        open={!!edit}
        kind={kind}
        item={edit?.item ?? null}
        onClose={() => setEdit(null)}
        onSave={async (id, data) => {
          await run(() => adminApi.saveContent({ id, kind, data, position: Date.now() % 1_000_000_000 }), edit?.item ? 'Сохранено' : 'Добавлено');
          setEdit(null);
        }}
      />
    </div>
  );
}

function IconBtn({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} className={cx('grid h-9 w-9 place-items-center rounded-xl transition', danger ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10' : 'text-navy-500 hover:bg-navy-50 dark:text-navy-300 dark:hover:bg-navy-800')}>
      {children}
    </button>
  );
}

function ContentForm({ open, kind, item, onClose, onSave }: {
  open: boolean; kind: ContentKind; item: AnyItem | null; onClose: () => void; onSave: (id: string, data: Record<string, unknown>) => Promise<void>;
}) {
  const s = (k: string) => (item && item[k] != null ? (Array.isArray(item[k]) ? (item[k] as string[]).join('\n\n') : String(item[k])) : '');
  const [f, setF] = useState<Record<string, string>>({
    title: s('title'), emoji: s('emoji'), summary: s('summary'), body: s('body'), takeaway: s('takeaway'), topic: s('topic') || 'Бюджет', minutes: s('minutes'),
    text: s('text'), term: s('term'), def: s('def'),
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let data: Record<string, unknown>;
    if (kind === 'article') {
      if (!f.title.trim()) return setErr('Введите заголовок');
      const body = f.body.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
      if (!body.length) return setErr('Добавьте текст статьи');
      data = { title: f.title.trim(), emoji: f.emoji.trim() || '📘', summary: f.summary.trim(), body, takeaway: f.takeaway.trim(), topic: f.topic, minutes: Number(f.minutes) || undefined };
    } else if (kind === 'tip') {
      if (!f.text.trim()) return setErr('Введите текст совета');
      data = { text: f.text.trim(), emoji: f.emoji.trim() || '💡' };
    } else if (kind === 'term') {
      if (!f.term.trim() || !f.def.trim()) return setErr('Заполните термин и определение');
      data = { term: f.term.trim(), def: f.def.trim() };
    } else {
      if (!f.title.trim()) return setErr('Введите задание');
      data = { title: f.title.trim(), emoji: f.emoji.trim() || '✅' };
    }
    setBusy(true);
    await onSave(item?.id ?? `${kind}-${uid()}`, data);
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={(item ? 'Изменить: ' : 'Новый материал: ') + KIND_LABEL[kind].toLowerCase()}
      footer={<button type="submit" form="content-form" className="btn-primary w-full py-3" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Сохранить'}</button>}>
      <form id="content-form" onSubmit={submit} className="space-y-3 pb-2" noValidate>
        {(kind === 'article' || kind === 'task' || kind === 'tip') && (
          <div className={cx('grid gap-3', kind === 'tip' ? 'grid-cols-[80px_1fr]' : 'grid-cols-[80px_1fr]')}>
            <Field label="Эмодзи"><input id="c-emoji" className="input text-center" maxLength={4} value={f.emoji} onChange={set('emoji')} placeholder="📘" /></Field>
            {kind === 'tip'
              ? <Field label="Совет"><textarea id="c-text" className="input min-h-[96px]" value={f.text} onChange={set('text')} /></Field>
              : <Field label={kind === 'task' ? 'Задание' : 'Заголовок'}><input id="c-title" className="input" value={f.title} onChange={set('title')} /></Field>}
          </div>
        )}
        {kind === 'article' && (
          <>
            <Field label="Кратко (для карточки)"><input id="c-summary" className="input" value={f.summary} onChange={set('summary')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Тема">
                <select id="c-topic" className="input" value={f.topic} onChange={set('topic')}>
                  {['Бюджет', 'Накопления', 'Экономия', 'Долги', 'Инвестиции'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Минут чтения"><input id="c-min" inputMode="numeric" className="input" value={f.minutes} onChange={set('minutes')} placeholder="авто" /></Field>
            </div>
            <Field label="Текст" hint="Абзацы разделяйте пустой строкой"><textarea id="c-body" className="input min-h-[200px]" value={f.body} onChange={set('body')} /></Field>
            <Field label="Главная мысль"><input id="c-take" className="input" value={f.takeaway} onChange={set('takeaway')} /></Field>
          </>
        )}
        {kind === 'term' && (
          <>
            <Field label="Термин"><input id="c-term" className="input" value={f.term} onChange={set('term')} /></Field>
            <Field label="Определение"><textarea id="c-def" className="input min-h-[96px]" value={f.def} onChange={set('def')} /></Field>
          </>
        )}
        {err && <div className="text-[13px] font-medium text-rose-500">{err}</div>}
      </form>
    </Modal>
  );
}

// ───────────── Журнал ─────────────

const ACTIONS: Record<string, string> = {
  view_user: 'просмотрел данные', ban: 'заблокировал', unban: 'разблокировал', delete_user: 'удалил аккаунт',
  grant_admin: 'выдал права админа', revoke_admin: 'снял права админа',
};

function AuditTab({ users }: { users: AdminUser[] }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setErr('');
    try { setRows(await adminApi.audit()); } catch (e) { setErr(adminError(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const email = (id: string | null) => (id ? users.find((u) => u.id === id)?.email ?? 'удалённый пользователь' : '');
  if (err) return <ErrorCard text={err} onRetry={load} />;
  if (!rows) return <Loading />;
  return (
    <Card className="divide-y divide-navy-100 p-2 dark:divide-navy-800">
      {rows.map((r) => (
        <div key={r.id} className="flex items-start gap-3 px-2 py-3 text-[13px]">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-navy-50 dark:bg-navy-800">
            {r.action === 'view_user' ? <Eye className="h-4 w-4" /> : r.action.includes('admin') ? <ShieldCheck className="h-4 w-4" /> : r.action === 'delete_user' ? <Trash2 className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div><b>{email(r.admin_id)}</b> {ACTIONS[r.action] ?? r.action} <b>{r.action === 'delete_user' ? String(r.details?.email ?? '') : email(r.target_user)}</b></div>
            <div className="text-[12px] text-navy-400">{new Date(r.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</div>
          </div>
        </div>
      ))}
      {!rows.length && <Empty emoji="📜" title="Журнал пуст" text="Здесь появятся просмотры данных пользователей, блокировки и удаления." />}
    </Card>
  );
}

function Loading() {
  return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-mint-500" /></div>;
}

function ErrorCard({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <Card className="p-5">
      <div className="text-sm font-semibold text-rose-600 dark:text-rose-400">{text}</div>
      <button className="btn-ghost mt-3" onClick={onRetry}><RefreshCw className="h-4 w-4" /> Повторить</button>
    </Card>
  );
}



