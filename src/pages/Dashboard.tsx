import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Lightbulb, Moon, Sun, Wallet } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useUI } from '../App';
import { addDays, formatDateLong, formatMoney, parseISO, pluralize, weekdayShort } from '../lib/format';
import { balance, budgetStatus, currentMonthPeriod, dailySeries, goalProgress, inPeriod, sortTx, totals } from '../lib/calc';
import { TIPS, levelOf, xpOf } from '../lib/learn';
import { TransactionItem } from '../components/TransactionItem';
import { AccountsCard } from '../components/Accounts';
import { Card, ChartTooltip, Empty, Progress, SectionHeader, Segmented, cx } from '../components/ui';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function Dashboard() {
  const { state, dispatch, today } = useStore();
  const { openAdd, openEdit, go, openImport } = useUI();
  const [range, setRange] = useState<'week' | 'month'>('week');

  const month = currentMonthPeriod(today);
  const monthTx = useMemo(() => state.transactions.filter((t) => inPeriod(t, month)), [state.transactions, month.from]);
  const m = totals(monthTx);
  const bal = balance(state, today);
  const bs = budgetStatus(state.budget, monthTx);
  const recent = sortTx(state.transactions.filter((t) => t.date <= today)).slice(0, 6);

  const chartPeriod = range === 'week' ? { from: addDays(today, -6), to: today } : { from: month.from, to: today };
  const series = dailySeries(state.transactions, chartPeriod).map((d) => ({
    ...d,
    label: range === 'week' ? weekdayShort(parseISO(d.date)) : String(parseISO(d.date).getDate()),
  }));
  const chartTotal = series.reduce((a, b) => a + b.expense, 0);

  const goal = [...state.goals].sort((a, b) => goalProgress(b.saved, b.target).ratio - goalProgress(a.saved, a.target).ratio).find((g) => !goalProgress(g.saved, g.target).done) ?? state.goals[0];
  const tip = TIPS[parseISO(today).getDate() % TIPS.length];
  const lvl = levelOf(xpOf(state, today));
  const isDark = state.profile.theme === 'dark' || (state.profile.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const warnRows = [...(bs.total && bs.total.level !== 'ok' ? [bs.total] : []), ...bs.categories.filter((c) => c.level !== 'ok')];

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* Шапка */}
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold first-letter:uppercase text-navy-400">{formatDateLong(new Date())}</div>
          <h1 className="truncate text-[24px] font-extrabold tracking-tight lg:text-[28px]">
            {greeting()}{state.profile.name ? `, ${state.profile.name}` : ''} 👋
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            aria-label="Сменить тему"
            onClick={() => dispatch({ type: 'profile/update', patch: { theme: isDark ? 'light' : 'dark' } })}
            className="grid h-11 w-11 place-items-center rounded-2xl border border-navy-100 bg-white text-navy-600 transition hover:bg-navy-50 dark:border-navy-800 dark:bg-navy-900 dark:text-navy-200"
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button onClick={() => go('profile')} aria-label="Профиль" className="grid h-11 w-11 place-items-center rounded-2xl bg-navy-900 text-[15px] font-bold text-mint-400 dark:bg-mint-400 dark:text-navy-950">
            {(state.profile.name || 'Я').slice(0, 1).toUpperCase()}
          </button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr] lg:gap-6">
        {/* Баланс */}
        <section className="relative flex flex-col justify-center overflow-hidden rounded-[28px] bg-navy-900 p-6 text-white shadow-xl dark:bg-navy-850 lg:p-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-mint-400/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-sky-500/15 blur-3xl" />
          <svg className="pointer-events-none absolute bottom-0 right-0 h-28 w-2/3 opacity-30" viewBox="0 0 300 100" preserveAspectRatio="none">
            <path d="M0 90 C 40 80, 60 60, 100 65 S 160 30, 200 40 S 260 10, 300 5" fill="none" stroke="#22D37F" strokeWidth="2.5" />
          </svg>
          <div className="relative">
            <div className="flex items-center gap-2 text-sm font-semibold text-navy-200">
              <Wallet className="h-4 w-4" /> Общий баланс
            </div>
            <div className={cx('mt-2 text-[38px] font-extrabold leading-none tracking-tight tabular-nums lg:text-[46px]', bal < 0 && 'text-rose-300')}>
              {formatMoney(bal)}
            </div>
            <div className="mt-2 text-sm text-navy-300">
              За месяц:{' '}
              <span className={cx('font-bold', m.net >= 0 ? 'text-mint-300' : 'text-rose-300')}>{formatMoney(m.net, { sign: true })}</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button onClick={() => openAdd('income')} className="flex items-center justify-center gap-2 rounded-2xl bg-mint-400 py-3 text-sm font-bold text-navy-950 transition hover:bg-mint-300 active:scale-[.98]">
                <ArrowDownLeft className="h-4 w-4" /> Доход
              </button>
              <button onClick={() => openAdd('expense')} className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-sm font-bold text-white transition hover:bg-white/15 active:scale-[.98]">
                <ArrowUpRight className="h-4 w-4" /> Расход
              </button>
            </div>
            <div className="mt-5 hidden grid-cols-3 gap-3 border-t border-white/10 pt-5 lg:grid">
              <HeroStat label="Норма сбережений" value={m.income > 0 ? `${Math.round(((m.income - m.expense) / m.income) * 100)}%` : '—'} />
              <HeroStat label="В целях накоплено" value={formatMoney(state.goals.reduce((a, g) => a + g.saved, 0), { compact: true })} />
              <HeroStat label="Операций в месяце" value={String(monthTx.length)} />
            </div>
          </div>
        </section>

        {/* Месяц */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-4">
          <StatCard label="Доходы за месяц" value={m.income} tone="income" />
          <StatCard label="Расходы за месяц" value={m.expense} tone="expense" />
          <Card className="col-span-2 p-5 lg:col-span-1" onClick={() => go('budget')}>
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-navy-400">Остаток бюджета</div>
              <ChevronRight className="h-4 w-4 text-navy-300" />
            </div>
            {bs.total ? (
              <>
                <div className={cx('mt-1 text-[22px] font-extrabold tracking-tight tabular-nums', bs.total.left < 0 && 'text-rose-500')}>
                  {formatMoney(bs.total.left)}
                </div>
                <Progress value={bs.total.ratio} level={bs.total.level} className="mt-3" />
                <div className="mt-2 flex justify-between text-[12px] font-medium text-navy-400">
                  <span>Потрачено {Math.round(bs.total.ratio * 100)}%</span>
                  <span>Лимит {formatMoney(bs.total.limit)}</span>
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm text-navy-400">Лимит не задан — <span className="font-semibold text-mint-500">установить</span></div>
            )}
          </Card>
        </div>
      </div>

      {warnRows.length > 0 && (
        <button onClick={() => go('budget')} className="flex w-full items-center gap-3 rounded-3xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-left dark:border-amber-400/20 dark:bg-amber-400/10">
          <span className="text-xl">⚠️</span>
          <span className="flex-1 text-sm font-semibold text-amber-800 dark:text-amber-200">
            {warnRows.some((r) => r.level === 'over') ? 'Есть превышения бюджета' : 'Бюджет почти исчерпан'}: {warnRows.length} {pluralize(warnRows.length, 'лимит', 'лимита', 'лимитов')}
          </span>
          <ChevronRight className="h-4 w-4 text-amber-600" />
        </button>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr] lg:gap-6">
        {/* График */}
        <Card className="p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="h-section">Расходы</h2>
              <div className="text-[13px] text-navy-400">
                {range === 'week' ? 'за 7 дней' : 'с начала месяца'}: <span className="font-bold text-navy-700 dark:text-navy-100">{formatMoney(chartTotal)}</span>
              </div>
            </div>
            <Segmented value={range} onChange={setRange} className="w-44" options={[{ value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }]} />
          </div>
          <div className="-mx-2 mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22D37F" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#22D37F" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="currentColor" className="text-navy-100 dark:text-navy-800" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#8197C9' }} interval={range === 'week' ? 0 : 'preserveStartEnd'} minTickGap={12} />
                <YAxis hide />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#22D37F', strokeOpacity: 0.3 }} />
                <Area type="monotone" dataKey="expense" name="Расходы" stroke="#22D37F" strokeWidth={2.5} fill="url(#gExp)" animationDuration={700} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Цель + совет */}
        <div className="space-y-5 lg:space-y-6">
          <Card className="p-5" onClick={() => go('goals')}>
            <div className="flex items-center justify-between">
              <h2 className="h-section">Финансовая цель</h2>
              <ChevronRight className="h-4 w-4 text-navy-300" />
            </div>
            {goal ? (
              (() => {
                const gp = goalProgress(goal.saved, goal.target);
                return (
                  <div className="mt-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-mint-400/15 text-2xl">{goal.emoji}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{goal.title}</div>
                        <div className="text-[13px] text-navy-400">
                          {formatMoney(goal.saved)} из {formatMoney(goal.target)}
                        </div>
                      </div>
                      <div className="text-xl font-extrabold text-mint-500">{gp.percent}%</div>
                    </div>
                    <Progress value={gp.ratio} className="mt-4 h-3" />
                  </div>
                );
              })()
            ) : (
              <div className="mt-2 text-sm text-navy-400">Поставьте первую цель — например, финансовую подушку.</div>
            )}
          </Card>

          <Card className="p-5" onClick={() => go('learn')}>
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-400/15">
                <Lightbulb className="h-5 w-5 text-amber-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] font-semibold text-navy-400">Совет дня</div>
                  <div className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-bold text-navy-500 dark:bg-navy-800 dark:text-navy-200">Ур. {lvl.index} · {lvl.name}</div>
                </div>
                <div className="mt-1 text-[14px] font-medium leading-snug">{tip.emoji} {tip.text}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <AccountsCard onImport={openImport} />

      {/* Последние операции */}
      <Card className="p-3 sm:p-4">
        <div className="px-2 pt-1">
          <SectionHeader
            title="Последние операции"
            action={
              <button onClick={() => go('transactions')} className="text-sm font-semibold text-mint-600 hover:underline dark:text-mint-400">
                Все
              </button>
            }
          />
        </div>
        {recent.length ? (
          <div className="grid gap-x-4 lg:grid-cols-2">
            {recent.map((t) => <TransactionItem key={t.id} tx={t} onClick={() => openEdit(t)} showDate />)}
          </div>
        ) : (
          <Empty emoji="🧾" title="Операций пока нет" text="Добавьте первый доход или расход — баланс посчитается автоматически." action={<button className="btn-primary" onClick={() => openAdd()}>Добавить</button>} />
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'income' | 'expense' }) {
  const inc = tone === 'income';
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <div className={cx('grid h-8 w-8 place-items-center rounded-xl', inc ? 'bg-mint-400/15 text-mint-500' : 'bg-rose-500/10 text-rose-500')}>
          {inc ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
        </div>
        <div className="text-[13px] font-semibold leading-tight text-navy-400">{label}</div>
      </div>
      <div className="mt-2 truncate text-[20px] font-extrabold tracking-tight tabular-nums sm:text-[22px]">{formatMoney(value)}</div>
    </Card>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] font-semibold text-navy-300">{label}</div>
      <div className="mt-0.5 text-[18px] font-extrabold tabular-nums">{value}</div>
    </div>
  );
}
