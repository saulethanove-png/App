import { useState } from 'react';
import { CalendarDays, Minus, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Goal } from '../types';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toasts';
import { formatDateShort, formatMoney, moneyToInput, parseISO, parseMoney, prettifyInput, addDays, pluralize } from '../lib/format';
import { goalProgress, monthlyToGoal } from '../lib/calc';
import { Card, Empty, Field, Modal, Segmented, cx } from '../components/ui';

const EMOJIS = ['🛡', '📱', '✈️', '🚗', '🏠', '💻', '🎓', '💍', '🏖', '🎮', '👶', '💰'];
const TEMPLATES = [
  { title: 'Финансовая подушка', emoji: '🛡', target: 1_000_000 },
  { title: 'Новый телефон', emoji: '📱', target: 450_000 },
  { title: 'Путешествие', emoji: '✈️', target: 800_000 },
  { title: 'Автомобиль', emoji: '🚗', target: 6_000_000 },
];

export function Goals() {
  const { state, dispatch, today } = useStore();
  const toast = useToast();
  const [form, setForm] = useState<{ open: boolean; goal: Goal | null; template?: (typeof TEMPLATES)[number] }>({ open: false, goal: null });
  const [deposit, setDeposit] = useState<Goal | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const totalSaved = state.goals.reduce((a, g) => a + g.saved, 0);
  const totalTarget = state.goals.reduce((a, g) => a + g.target, 0);
  const goals = [...state.goals].sort((a, b) => Number(goalProgress(a.saved, a.target).done) - Number(goalProgress(b.saved, b.target).done) || a.createdAt - b.createdAt);

  const remove = (g: Goal) => {
    dispatch({ type: 'goal/delete', id: g.id });
    setMenu(null);
    toast({ kind: 'info', title: `Цель «${g.title}» удалена`, action: { label: 'Отменить', onClick: () => dispatch({ type: 'goal/add', goal: g }) } }, 6000);
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">Финансовые цели</h1>
          {state.goals.length > 0 && <div className="text-sm text-navy-400">Накоплено {formatMoney(totalSaved)} из {formatMoney(totalTarget)}</div>}
        </div>
        <button className="btn-primary" onClick={() => setForm({ open: true, goal: null })}>
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Новая цель</span>
        </button>
      </header>

      {state.goals.length === 0 ? (
        <Card>
          <Empty emoji="🎯" title="Целей пока нет" text="Выберите шаблон или создайте свою цель — мы посчитаем, сколько откладывать в месяц." />
          <div className="grid grid-cols-2 gap-3 px-5 pb-6 sm:grid-cols-4">
            {TEMPLATES.map((t) => (
              <button key={t.title} onClick={() => setForm({ open: true, goal: null, template: t })} className="rounded-2xl border border-navy-100 p-4 text-left transition hover:border-mint-400 dark:border-navy-800">
                <div className="text-2xl">{t.emoji}</div>
                <div className="mt-2 text-sm font-bold">{t.title}</div>
                <div className="text-[12px] text-navy-400">{formatMoney(t.target * 100)}</div>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => {
            const gp = goalProgress(g.saved, g.target);
            const perMonth = monthlyToGoal(gp.left, today, g.deadline);
            const overdue = g.deadline && g.deadline < today && !gp.done;
            const R = 34;
            const C = 2 * Math.PI * R;
            return (
              <Card key={g.id} className={cx('relative p-5', gp.done && 'ring-2 ring-mint-400')}>
                <div className="flex items-start gap-4">
                  <div className="relative h-20 w-20 shrink-0">
                    <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
                      <circle cx="40" cy="40" r={R} fill="none" strokeWidth="8" className="stroke-navy-100 dark:stroke-navy-800" />
                      <circle cx="40" cy="40" r={R} fill="none" strokeWidth="8" strokeLinecap="round" stroke="#22D37F" strokeDasharray={C} strokeDashoffset={C * (1 - gp.ratio)} style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} />
                    </svg>
                    <div className="absolute inset-0 grid place-items-center text-3xl">{g.emoji}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate text-[17px] font-bold">{g.title}</div>
                      <div className="relative">
                        <button aria-label="Действия" onClick={() => setMenu(menu === g.id ? null : g.id)} className="-mr-2 -mt-1 rounded-xl p-1.5 text-navy-400 hover:bg-navy-50 dark:hover:bg-navy-800">
                          <MoreHorizontal className="h-5 w-5" />
                        </button>
                        {menu === g.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                            <div className="absolute right-0 z-20 mt-1 w-44 animate-pop overflow-hidden rounded-2xl border border-navy-100 bg-white py-1 shadow-xl dark:border-navy-700 dark:bg-navy-850">
                              <button className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-semibold hover:bg-navy-50 dark:hover:bg-navy-800" onClick={() => { setMenu(null); setForm({ open: true, goal: g }); }}>
                                <Pencil className="h-4 w-4" /> Изменить
                              </button>
                              <button className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10" onClick={() => remove(g)}>
                                <Trash2 className="h-4 w-4" /> Удалить
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-[28px] font-extrabold leading-tight text-mint-500">{gp.percent}%</div>
                    <div className="text-[13px] text-navy-400">
                      <span className="font-bold text-navy-700 dark:text-navy-100">{formatMoney(g.saved)}</span> из {formatMoney(g.target)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-navy-100 dark:bg-navy-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-mint-500 to-mint-300 transition-[width] duration-700" style={{ width: `${gp.ratio * 100}%` }} />
                </div>

                <div className="mt-3 space-y-1 text-[13px]">
                  {gp.done ? (
                    <div className="font-bold text-mint-600 dark:text-mint-300">🎉 Цель достигнута! Поздравляем!</div>
                  ) : (
                    <div className="text-navy-500 dark:text-navy-300">Осталось накопить: <b className="text-navy-900 dark:text-white">{formatMoney(gp.left)}</b></div>
                  )}
                  {g.deadline && !gp.done && (
                    <div className={cx('flex items-center gap-1.5', overdue ? 'text-rose-500' : 'text-navy-400')}>
                      <CalendarDays className="h-3.5 w-3.5" />
                      {overdue ? `Срок прошёл ${formatDateShort(g.deadline)}` : `до ${formatDateShort(g.deadline)} ${parseISO(g.deadline).getFullYear()}`}
                      {perMonth != null && !overdue && <> · <b>{formatMoney(perMonth)}</b>/мес</>}
                    </div>
                  )}
                </div>

                {!gp.done && (
                  <button className="btn-dark mt-4 w-full" onClick={() => setDeposit(g)}>
                    <Plus className="h-4 w-4" /> Пополнить
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <GoalForm
        key={(form.goal?.id ?? 'new') + String(form.open) + (form.template?.title ?? '')}
        open={form.open}
        goal={form.goal}
        template={form.template}
        onClose={() => setForm({ open: false, goal: null })}
        onSave={(data) => {
          if (form.goal) dispatch({ type: 'goal/update', goal: { ...form.goal, ...data } });
          else dispatch({ type: 'goal/add', goal: data });
          toast({ kind: 'success', title: form.goal ? 'Цель обновлена' : 'Цель создана', text: data.title });
          setForm({ open: false, goal: null });
        }}
        today={today}
      />

      <DepositModal
        key={deposit?.id ?? 'none'}
        goal={deposit}
        onClose={() => setDeposit(null)}
        onSave={(amount) => {
          if (!deposit) return;
          const before = goalProgress(deposit.saved, deposit.target);
          dispatch({ type: 'goal/deposit', id: deposit.id, amount });
          const after = goalProgress(Math.max(0, deposit.saved + amount), deposit.target);
          toast(
            after.done && !before.done
              ? { kind: 'success', title: '🎉 Цель достигнута!', text: deposit.title }
              : { kind: 'success', title: amount > 0 ? `+${formatMoney(amount)} к цели` : `Снято ${formatMoney(-amount)}`, text: `${deposit.title}: ${after.percent}%` },
          );
          setDeposit(null);
        }}
      />
    </div>
  );
}

function GoalForm({ open, goal, template, onClose, onSave, today }: {
  open: boolean; goal: Goal | null; template?: (typeof TEMPLATES)[number]; onClose: () => void; today: string;
  onSave: (g: Omit<Goal, 'id' | 'createdAt'>) => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? template?.title ?? '');
  const [emoji, setEmoji] = useState(goal?.emoji ?? template?.emoji ?? '🎯');
  const [target, setTarget] = useState(goal ? prettifyInput(moneyToInput(goal.target)) : template ? prettifyInput(String(template.target)) : '');
  const [saved, setSaved] = useState(goal ? prettifyInput(moneyToInput(goal.saved)) : '');
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!title.trim()) er.title = 'Введите название';
    else if (title.trim().length > 40) er.title = 'Не длиннее 40 символов';
    const t = parseMoney(target);
    if (!t.ok) er.target = t.error;
    const s = saved.trim() ? parseMoney(saved, { allowZero: true }) : ({ ok: true, value: 0 } as const);
    if (!s.ok) er.saved = s.error;
    if (deadline && deadline <= today) er.deadline = 'Срок должен быть в будущем';
    setErr(er);
    if (Object.keys(er).length || !t.ok || !s.ok) return;
    onSave({ title: title.trim(), emoji, target: t.value, saved: s.value, deadline: deadline || undefined });
  };

  return (
    <Modal open={open} onClose={onClose} title={goal ? 'Изменить цель' : 'Новая цель'} footer={<button type="submit" form="goal-form" className="btn-primary w-full py-3">{goal ? 'Сохранить' : 'Создать цель'}</button>}>
      <form id="goal-form" onSubmit={submit} className="space-y-4 pb-2" noValidate>
        <div>
          <span className="label">Иконка</span>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            {EMOJIS.map((e) => (
              <button type="button" key={e} onClick={() => setEmoji(e)} className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl transition', emoji === e ? 'bg-mint-400/20 ring-2 ring-mint-400' : 'bg-navy-50 dark:bg-navy-850')}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <Field label="Название" error={err.title}>
          <input className={cx('input', err.title && 'input-error')} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, накопить на ноутбук" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Нужная сумма, ₸" error={err.target}>
            <input inputMode="decimal" className={cx('input', err.target && 'input-error')} value={target} onChange={(e) => setTarget(prettifyInput(e.target.value))} placeholder="500 000" />
          </Field>
          <Field label="Уже накоплено, ₸" error={err.saved}>
            <input inputMode="decimal" className={cx('input', err.saved && 'input-error')} value={saved} onChange={(e) => setSaved(prettifyInput(e.target.value))} placeholder="0" />
          </Field>
        </div>
        <Field label="Срок (необязательно)" error={err.deadline} hint="Посчитаем, сколько нужно откладывать в месяц">
          <input type="date" className={cx('input', err.deadline && 'input-error')} value={deadline} min={addDays(today, 1)} onChange={(e) => setDeadline(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function DepositModal({ goal, onClose, onSave }: { goal: Goal | null; onClose: () => void; onSave: (amount: number) => void }) {
  const [mode, setMode] = useState<'in' | 'out'>('in');
  const [value, setValue] = useState('');
  const [err, setErr] = useState('');
  if (!goal) return null;
  const gp = goalProgress(goal.saved, goal.target);
  const presets = [5000, 10000, 25000, 50000].map((v) => v * 100);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseMoney(value);
    if (!p.ok) return setErr(p.error);
    if (mode === 'out' && p.value > goal.saved) return setErr(`Можно снять не больше ${formatMoney(goal.saved)}`);
    onSave(mode === 'in' ? p.value : -p.value);
  };
  const months = (v: number) => (v > 0 ? Math.ceil(gp.left / v) : 0);
  return (
    <Modal open onClose={onClose} title={`${goal.emoji} ${goal.title}`} footer={<button type="submit" form="dep-form" className="btn-primary w-full py-3">{mode === 'in' ? 'Пополнить' : 'Снять'}</button>}>
      <form id="dep-form" onSubmit={submit} className="space-y-4 pb-2" noValidate>
        <Segmented value={mode} onChange={(m) => { setMode(m); setErr(''); }} options={[{ value: 'in', label: <span className="flex items-center justify-center gap-1"><Plus className="h-4 w-4" />Пополнить</span> }, { value: 'out', label: <span className="flex items-center justify-center gap-1"><Minus className="h-4 w-4" />Снять</span> }]} />
        <Field label="Сумма, ₸" error={err}>
          <input autoFocus inputMode="decimal" className={cx('input text-lg font-bold', err && 'input-error')} value={value} onChange={(e) => { setValue(prettifyInput(e.target.value)); setErr(''); }} placeholder="0" />
        </Field>
        {mode === 'in' && (
          <>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => <button type="button" key={p} className="chip" onClick={() => setValue(prettifyInput(moneyToInput(p)))}>+{formatMoney(p)}</button>)}
              {gp.left > 0 && <button type="button" className="chip" onClick={() => setValue(prettifyInput(moneyToInput(gp.left)))}>Всё остальное</button>}
            </div>
            {(() => {
              const p = parseMoney(value);
              if (!p.ok || gp.left <= 0) return null;
              const m = months(p.value);
              return <div className="rounded-2xl bg-mint-400/10 p-3 text-[13px] text-navy-600 dark:text-navy-200">Если откладывать по {formatMoney(p.value)} в месяц, цель будет достигнута через <b>{m} {pluralize(m, 'месяц', 'месяца', 'месяцев')}</b>.</div>;
            })()}
          </>
        )}
        <div className="text-[13px] text-navy-400">Сейчас накоплено {formatMoney(goal.saved)} из {formatMoney(goal.target)}.</div>
      </form>
    </Modal>
  );
}
