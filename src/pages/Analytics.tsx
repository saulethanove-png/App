import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight, Crown, Flame, TrendingDown, TrendingUp } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useUI } from '../App';
import { addDays, formatDateShort, formatMoney, monthName, monthShort, parseISO, weekdayShort } from '../lib/format';
import { avgDaily, byCategory, dailySeries, daysInPeriod, monthPeriod, monthlySeries, percentChange, prevPeriod, totals, type Period } from '../lib/calc';
import { getCategory } from '../lib/categories';
import { Card, ChartTooltip, Delta, Empty, Field, SectionHeader, Segmented, cx } from '../components/ui';

type Mode = 'week' | 'month' | 'custom';
const axisMoney = (v: number) => {
  const t = v / 100;
  if (t >= 1_000_000) return (t / 1_000_000).toFixed(1).replace('.0', '') + 'м';
  if (t >= 1000) return Math.round(t / 1000) + 'к';
  return String(t);
};

export function Analytics() {
  const { state, today } = useStore();
  const { go } = useUI();
  const t = parseISO(today);
  const [mode, setMode] = useState<Mode>('month');
  const [ym, setYm] = useState({ y: t.getFullYear(), m: t.getMonth() });
  const [custom, setCustom] = useState<Period>({ from: addDays(today, -29), to: today });

  const period: Period = mode === 'week' ? { from: addDays(today, -6), to: today } : mode === 'month' ? monthPeriod(ym.y, ym.m) : custom;
  const customError = mode === 'custom' && custom.from > custom.to ? 'Начало периода позже конца' : mode === 'custom' && daysInPeriod(custom) > 731 ? 'Период не длиннее 2 лет' : '';
  const prev = prevPeriod(period);

  const data = useMemo(() => {
    const cur = state.transactions.filter((x) => x.date >= period.from && x.date <= period.to);
    const old = state.transactions.filter((x) => x.date >= prev.from && x.date <= prev.to);
    return { cur, old, tc: totals(cur), to: totals(old), cats: byCategory(cur), oldCats: byCategory(old) };
  }, [state.transactions, period.from, period.to, prev.from, prev.to]);

  const avg = avgDaily(data.cur, period, today);
  const avgPrev = avgDaily(data.old, prev, today);
  const top = data.cats[0];
  const daily = dailySeries(data.cur, period).map((d) => {
    const dt = parseISO(d.date);
    return { ...d, label: mode === 'week' ? weekdayShort(dt) : String(dt.getDate()) };
  });
  const tooManyDays = daily.length > 62;
  const months = monthlySeries(state.transactions, today, 6).map((m) => ({ ...m, label: monthShort(m.month) }));

  const compareRows = useMemo(() => {
    const ids = new Set([...data.cats.slice(0, 6).map((c) => c.categoryId), ...data.oldCats.slice(0, 3).map((c) => c.categoryId)]);
    const oldMap = new Map(data.oldCats.map((c) => [c.categoryId, c.amount]));
    const curMap = new Map(data.cats.map((c) => [c.categoryId, c.amount]));
    return [...ids].map((id) => ({ id, cur: curMap.get(id) ?? 0, old: oldMap.get(id) ?? 0 })).sort((a, b) => b.cur - a.cur);
  }, [data]);
  const compareMax = Math.max(1, ...compareRows.map((r) => Math.max(r.cur, r.old)));

  const shift = (d: number) => {
    const nd = new Date(ym.y, ym.m + d, 1);
    setYm({ y: nd.getFullYear(), m: nd.getMonth() });
  };
  const isCur = ym.y === t.getFullYear() && ym.m === t.getMonth();
  const prevLabel = mode === 'month' ? monthName(parseISO(prev.from).getMonth()).toLowerCase() : `${formatDateShort(prev.from)} – ${formatDateShort(prev.to)}`;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-extrabold tracking-tight">Аналитика</h1>
        <Segmented className="w-full sm:w-80" value={mode} onChange={setMode} options={[{ value: 'week', label: 'Неделя' }, { value: 'month', label: 'Месяц' }, { value: 'custom', label: 'Период' }]} />
      </header>

      {mode === 'month' && (
        <div className="flex items-center justify-between rounded-2xl bg-navy-100/70 p-1 dark:bg-navy-850 sm:w-80">
          <button onClick={() => shift(-1)} className="rounded-xl p-2 hover:bg-white dark:hover:bg-navy-700" aria-label="Предыдущий месяц"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-bold">{monthName(ym.m)} {ym.y}</span>
          <button onClick={() => shift(1)} disabled={isCur} className="rounded-xl p-2 hover:bg-white disabled:opacity-30 dark:hover:bg-navy-700" aria-label="Следующий месяц"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
      {mode === 'custom' && (
        <Card className="grid grid-cols-2 gap-3 p-4 sm:max-w-md">
          <Field label="С"><input type="date" className={cx('input', customError && 'input-error')} value={custom.from} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} /></Field>
          <Field label="По"><input type="date" className={cx('input', customError && 'input-error')} value={custom.to} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} /></Field>
          {customError && <div className="col-span-2 text-[13px] font-medium text-rose-500">{customError}</div>}
        </Card>
      )}

      {customError ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <Kpi icon={<TrendingDown className="h-4 w-4" />} tone="rose" label="Расходы" value={formatMoney(data.tc.expense)} delta={<Delta value={percentChange(data.tc.expense, data.to.expense)} invert />} />
            <Kpi icon={<TrendingUp className="h-4 w-4" />} tone="mint" label="Доходы" value={formatMoney(data.tc.income)} delta={<Delta value={percentChange(data.tc.income, data.to.income)} />} />
            <Kpi icon={<Flame className="h-4 w-4" />} tone="amber" label="В среднем в день" value={formatMoney(avg)} delta={<Delta value={percentChange(avg, avgPrev)} invert />} />
            <Kpi
              icon={<Crown className="h-4 w-4" />}
              tone="violet"
              label="Самая дорогая категория"
              value={top ? `${getCategory(top.categoryId).emoji} ${getCategory(top.categoryId).name}` : '—'}
              delta={top ? <span className="text-xs font-semibold text-navy-400">{formatMoney(top.amount)} · {Math.round(top.share * 100)}%</span> : null}
              small
            />
          </div>
          <div className="-mt-2 text-[12px] text-navy-400">Изменения — по сравнению с периодом: {prevLabel}</div>

          {data.cur.length === 0 ? (
            <Card><Empty emoji="📭" title="За этот период нет операций" text="Выберите другой период или добавьте операции." /></Card>
          ) : (
            <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
              {/* Круговая */}
              <Card className="p-5">
                <SectionHeader title="Расходы по категориям" />
                {data.cats.length ? (
                  <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
                    <div className="relative h-52 w-52 shrink-0">
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie data={data.cats} dataKey="amount" nameKey="categoryId" innerRadius="64%" outerRadius="100%" paddingAngle={2} stroke="none" animationDuration={700}>
                            {data.cats.map((c) => <Cell key={c.categoryId} fill={getCategory(c.categoryId).color} />)}
                          </Pie>
                          <Tooltip content={({ active, payload }) => active && payload?.length ? (
                            <ChartTooltip active payload={[{ name: getCategory(String(payload[0].name)).name, value: Number(payload[0].value), color: getCategory(String(payload[0].name)).color }]} />
                          ) : null} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                        <div>
                          <div className="text-[12px] font-semibold text-navy-400">Всего</div>
                          <div className="text-[17px] font-extrabold tabular-nums">{formatMoney(data.tc.expense, { compact: true })}</div>
                        </div>
                      </div>
                    </div>
                    <div className="w-full space-y-1">
                      {data.cats.map((c) => {
                        const cat = getCategory(c.categoryId);
                        return (
                          <button key={c.categoryId} onClick={() => go('transactions', { cat: c.categoryId })} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-navy-50 dark:hover:bg-navy-850">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cat.color }} />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{cat.emoji} {cat.name}</span>
                            <span className="shrink-0 text-[12px] font-semibold text-navy-400">{Math.round(c.share * 100)}%</span>
                            <span className="shrink-0 text-right text-sm font-bold tabular-nums">{formatMoney(c.amount)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <Empty emoji="🎉" title="Расходов нет" />
                )}
              </Card>

              {/* По дням */}
              <Card className="p-5">
                <SectionHeader title="Расходы по дням" />
                {tooManyDays ? (
                  <div className="py-10 text-center text-sm text-navy-400">Для периода длиннее 2 месяцев смотрите график по месяцам ниже.</div>
                ) : (
                  <div className="-mx-2 h-64">
                    <ResponsiveContainer>
                      <BarChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="currentColor" className="text-navy-100 dark:text-navy-800" />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8197C9' }} interval="preserveStartEnd" minTickGap={8} />
                        <YAxis tickFormatter={axisMoney} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8197C9' }} width={40} />
                        <Tooltip content={<ChartTooltip labelFormatter={(l) => l} />} cursor={{ fill: 'rgba(34,211,127,.08)' }} />
                        <Bar dataKey="expense" name="Расходы" fill="#22D37F" radius={[6, 6, 2, 2]} maxBarSize={28} animationDuration={700} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              {/* Сравнение с прошлым периодом по категориям */}
              <Card className="p-5">
                <SectionHeader title="Сравнение с прошлым периодом" />
                <div className="mb-3 flex gap-4 text-[12px] font-semibold text-navy-400">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-mint-400" />Сейчас</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-navy-300 dark:bg-navy-600" />{prevLabel}</span>
                </div>
                <div className="space-y-3.5">
                  {compareRows.map((r) => {
                    const c = getCategory(r.id);
                    return (
                      <div key={r.id}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-semibold">{c.emoji} {c.name}</span>
                          <span className="flex items-center gap-2">
                            <span className="font-bold tabular-nums">{formatMoney(r.cur)}</span>
                            <Delta value={percentChange(r.cur, r.old)} invert />
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="h-2 rounded-full bg-mint-400 transition-all" style={{ width: `${(r.cur / compareMax) * 100}%` }} />
                          <div className="h-2 rounded-full bg-navy-200 transition-all dark:bg-navy-700" style={{ width: `${(r.old / compareMax) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Доходы vs расходы */}
              <Card className="p-5">
                <SectionHeader title="Доходы и расходы по месяцам" />
                <div className="-mx-2 h-64">
                  <ResponsiveContainer>
                    <BarChart data={months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={4}>
                      <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="currentColor" className="text-navy-100 dark:text-navy-800" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#8197C9' }} />
                      <YAxis tickFormatter={axisMoney} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8197C9' }} width={40} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(129,151,201,.08)' }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, fontWeight: 600 }} />
                      <Bar dataKey="income" name="Доходы" fill="#22D37F" radius={[6, 6, 2, 2]} maxBarSize={22} />
                      <Bar dataKey="expense" name="Расходы" fill="#3A5290" radius={[6, 6, 2, 2]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <SavingsRate income={data.tc.income} expense={data.tc.expense} />
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SavingsRate({ income, expense }: { income: number; expense: number }) {
  if (income <= 0) return null;
  const rate = (income - expense) / income;
  const pct = Math.round(rate * 100);
  const msg = pct >= 20 ? 'Отлично! Вы откладываете 20% и больше.' : pct > 0 ? 'Хорошо, но цель — откладывать 20% дохода.' : 'Расходы больше доходов — проверьте крупные категории.';
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-navy-50 p-3 dark:bg-navy-850">
      <div className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-sm font-extrabold', pct >= 20 ? 'bg-mint-400 text-navy-950' : pct > 0 ? 'bg-amber-400 text-navy-950' : 'bg-rose-500 text-white')}>{pct}%</div>
      <div className="text-[13px] leading-snug">
        <div className="font-bold">Норма сбережений за период</div>
        <div className="text-navy-400">{msg}</div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, delta, tone, small }: { icon: React.ReactNode; label: string; value: string; delta: React.ReactNode; tone: 'rose' | 'mint' | 'amber' | 'violet'; small?: boolean }) {
  const tones = { rose: 'bg-rose-500/10 text-rose-500', mint: 'bg-mint-400/15 text-mint-500', amber: 'bg-amber-400/15 text-amber-500', violet: 'bg-violet-500/10 text-violet-500' };
  return (
    <Card className="flex flex-col p-4 lg:p-5">
      <div className="flex items-center gap-2">
        <div className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-xl', tones[tone])}>{icon}</div>
        <div className="text-[12px] font-semibold leading-tight text-navy-400">{label}</div>
      </div>
      <div className={cx('mt-2 font-extrabold tracking-tight tabular-nums', small ? 'text-[15px] leading-snug' : 'truncate text-[19px] lg:text-[22px]')}>{value}</div>
      <div className="mt-auto pt-1.5">{delta}</div>
    </Card>
  );
}
