import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  BarChart3, GraduationCap, Home, LayoutGrid, ListOrdered, PiggyBank, Plus, ShieldCheck, Target, UserRound, Wallet,
} from 'lucide-react';
import type { Transaction, TxType } from './types';
import { useStore } from './store/AppStore';
import { useToast } from './store/Toasts';
import { currentMonthPeriod, inPeriod, newBudgetAlerts } from './lib/calc';
import { getCategory } from './lib/categories';
import { suggestCategory } from './lib/categorize';
import { formatMoney } from './lib/format';
import { TransactionForm } from './components/TransactionForm';
import { ImportWizard } from './components/ImportWizard';
import { Modal, cx } from './components/ui';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Analytics } from './pages/Analytics';
import { BudgetPage } from './pages/Budget';
import { Goals } from './pages/Goals';
import { Learn } from './pages/Learn';
import { ProfilePage } from './pages/Profile';
import { AdminPage } from './pages/Admin';
import { useCloud } from './store/Cloud';

export type Route = 'home' | 'transactions' | 'analytics' | 'budget' | 'goals' | 'learn' | 'profile' | 'admin';

const NAV: { route: Route; label: string; icon: typeof Home }[] = [
  { route: 'home', label: 'Главная', icon: Home },
  { route: 'transactions', label: 'Операции', icon: ListOrdered },
  { route: 'analytics', label: 'Аналитика', icon: BarChart3 },
  { route: 'budget', label: 'Бюджет', icon: Wallet },
  { route: 'goals', label: 'Цели', icon: Target },
  { route: 'learn', label: 'Обучение', icon: GraduationCap },
  { route: 'profile', label: 'Профиль', icon: UserRound },
  { route: 'admin', label: 'Админка', icon: ShieldCheck },
];

interface UI {
  route: Route;
  go: (r: Route, params?: Record<string, string>) => void;
  params: URLSearchParams;
  openAdd: (type?: TxType) => void;
  openEdit: (tx: Transaction) => void;
  openImport: () => void;
}
const UICtx = createContext<UI>(null as never);
export const useUI = () => useContext(UICtx);

// Адрес раздела хранится в виде #analytics; доп. параметры (фильтр категории) — в памяти.
let pendingParams = new URLSearchParams();
function readHash(): { route: Route; params: URLSearchParams } {
  const r = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  const route = (NAV.some((n) => n.route === r) ? r : 'home') as Route;
  const params = pendingParams;
  pendingParams = new URLSearchParams();
  return { route, params };
}

export default function App() {
  const { state, dispatch, today } = useStore();
  const toast = useToast();
  const { isAdmin, choice, enabled: cloudOn, user: cloudUser, linked } = useCloud();
  const [{ route: rawRoute, params }, setLoc] = useState(readHash);
  const [form, setForm] = useState<{ open: boolean; editing: Transaction | null; type: TxType }>({ open: false, editing: null, type: 'expense' });
  const [moreOpen, setMoreOpen] = useState(false);
  // раздел админки существует только для администратора
  const route: Route = rawRoute === 'admin' && !isAdmin ? 'home' : rawRoute;
  const nav = NAV.filter((n) => n.route !== 'admin' || isAdmin);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const on = () => {
      setLoc(readHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = useCallback((r: Route, p?: Record<string, string>) => {
    pendingParams = new URLSearchParams(p ?? {});
    const next = `#${r}`;
    if (window.location.hash === next) {
      setLoc(readHash());
      return;
    }
    window.location.hash = next;
  }, []);

  const ui = useMemo<UI>(
    () => ({
      route, params, go,
      openAdd: (type = 'expense') => setForm({ open: true, editing: null, type }),
      openEdit: (tx) => setForm({ open: true, editing: tx, type: tx.type }),
      openImport: () => setImportOpen(true),
    }),
    [route, params, go],
  );

  // Операции из Apple Pay приходят с категорией 'auto' — подбираем её по правилам пользователя
  useEffect(() => {
    const auto = state.transactions.filter((t) => t.categoryId === 'auto');
    if (!auto.length) return;
    const categories: Record<string, string> = {};
    for (const t of auto) categories[t.id] = suggestCategory(t.rawDescription ?? t.note ?? '', t.type, state.rules).categoryId;
    dispatch({ type: 'tx/autocategorize', categories });
    const fresh = auto.filter((t) => t.source === 'wallet' && Date.now() - t.createdAt < 10 * 60_000).slice(-3);
    for (const t of fresh) {
      const c = getCategory(categories[t.id]);
      toast({ kind: 'success', title: `Apple Pay: ${formatMoney(-t.amount)}`, text: `${t.note ?? 'Покупка'} → ${c.emoji} ${c.name}`, action: { label: 'Изменить', onClick: () => setForm({ open: true, editing: { ...t, categoryId: categories[t.id] }, type: t.type }) } }, 6000);
    }
  }, [state.transactions, state.rules, dispatch, toast]);

  // Предупреждения о бюджете: 80% и 100%
  useEffect(() => {
    if (choice || (cloudOn && cloudUser && !linked)) return; // пока данные аккаунта не загружены
    const p = currentMonthPeriod(today);
    const monthTx = state.transactions.filter((t) => inPeriod(t, p));
    const alerts = newBudgetAlerts(state.budget, monthTx, today.slice(0, 7), state.alertsShown);
    if (!alerts.length) return;
    // самое важное — первым
    alerts.sort((a, b) => b.threshold - a.threshold).slice(0, 2).forEach((a) => {
      const name = a.row.key === 'total' ? 'Месячный бюджет' : `${getCategory(a.row.key).emoji} ${getCategory(a.row.key).name}`;
      toast(
        a.threshold === 100
          ? { kind: 'error', title: `${name}: лимит превышен`, text: `Потрачено ${formatMoney(a.row.spent)} из ${formatMoney(a.row.limit)}`, action: { label: 'Бюджет', onClick: () => go('budget') } }
          : { kind: 'warn', title: `${name}: использовано ${Math.floor(a.row.ratio * 100)}%`, text: `Осталось ${formatMoney(a.row.left)} до конца месяца`, action: { label: 'Бюджет', onClick: () => go('budget') } },
        7000,
      );
    });
    dispatch({ type: 'alerts/shown', ids: alerts.map((a) => a.id) });
  }, [state.transactions, state.budget, state.alertsShown, today, dispatch, toast, go, choice, cloudOn, cloudUser, linked]);

  const page = {
    home: <Dashboard />,
    transactions: <Transactions />,
    analytics: <Analytics />,
    budget: <BudgetPage />,
    goals: <Goals />,
    learn: <Learn />,
    profile: <ProfilePage />,
    admin: isAdmin ? <AdminPage /> : <Dashboard />,
  }[route];

  const bottom: Route[] = ['home', 'transactions', 'analytics'];
  const inMore = !bottom.includes(route);

  return (
    <UICtx.Provider value={ui}>
      <div className="min-h-dvh lg:flex">
        {/* Боковая панель — компьютер */}
        <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r border-navy-100 bg-white px-4 py-6 dark:border-navy-850 dark:bg-navy-900/60 lg:flex">
          <Logo className="mb-8 px-2" />
          <nav className="flex flex-1 flex-col gap-1">
            {nav.map(({ route: r, label, icon: Icon }) => (
              <button
                key={r}
                onClick={() => go(r)}
                className={cx(
                  'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-semibold transition',
                  route === r ? 'bg-navy-900 text-white dark:bg-mint-400/10 dark:text-mint-300' : 'text-navy-500 hover:bg-navy-50 hover:text-navy-900 dark:text-navy-300 dark:hover:bg-navy-850 dark:hover:text-white',
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </nav>
          <button onClick={() => ui.openAdd()} className="btn-primary w-full py-3">
            <Plus className="h-5 w-5" /> Добавить операцию
          </button>
        </aside>

        <main className="pt-safe mx-auto w-full max-w-6xl px-4 pb-32 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          <div key={route} className="animate-fade-up">{page}</div>
        </main>

        {/* Нижняя навигация — телефон */}
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-navy-100 bg-white/90 backdrop-blur-xl dark:border-navy-850 dark:bg-navy-950/90 lg:hidden">
          <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-2 pt-1.5">
            {bottom.slice(0, 2).map((r) => <TabBtn key={r} r={r} active={route === r} onClick={() => go(r)} />)}
            <div className="flex justify-center">
              <button
                onClick={() => ui.openAdd()}
                aria-label="Добавить операцию"
                className="-mt-6 grid h-14 w-14 place-items-center rounded-2xl bg-mint-400 text-navy-950 shadow-glow transition active:scale-95"
              >
                <Plus className="h-7 w-7" strokeWidth={2.5} />
              </button>
            </div>
            <TabBtn r="analytics" active={route === 'analytics'} onClick={() => go('analytics')} />
            <button onClick={() => setMoreOpen(true)} className={cx('flex flex-col items-center gap-0.5 pb-2 pt-1 text-[11px] font-semibold', inMore ? 'text-navy-900 dark:text-mint-300' : 'text-navy-400')}>
              <LayoutGrid className="h-6 w-6" strokeWidth={inMore ? 2.4 : 2} />
              Ещё
            </button>
          </div>
        </nav>

        <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Разделы">
          <div className="grid grid-cols-2 gap-3 pb-4">
            {([
              { r: 'budget', icon: Wallet, title: 'Бюджет', text: 'Лимиты и контроль' },
              { r: 'goals', icon: PiggyBank, title: 'Цели', text: 'Накопления' },
              { r: 'learn', icon: GraduationCap, title: 'Обучение', text: 'Статьи и задания' },
              { r: 'profile', icon: UserRound, title: 'Профиль', text: 'Тема, экспорт' },
              ...(isAdmin ? [{ r: 'admin', icon: ShieldCheck, title: 'Админка', text: 'Пользователи и контент' }] : []),
            ] as { r: Route; icon: typeof Home; title: string; text: string }[]).map(({ r, icon: Icon, title, text }) => (
              <button
                key={r}
                onClick={() => {
                  setMoreOpen(false);
                  go(r);
                }}
                className={cx('rounded-3xl border p-4 text-left transition', route === r ? 'border-mint-400 bg-mint-400/10' : 'border-navy-100 hover:bg-navy-50 dark:border-navy-800 dark:hover:bg-navy-850')}
              >
                <Icon className="mb-3 h-6 w-6 text-mint-500" />
                <div className="font-bold">{title}</div>
                <div className="text-[13px] text-navy-400">{text}</div>
              </button>
            ))}
          </div>
        </Modal>

        <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} />
        <TransactionForm open={form.open} editing={form.editing} defaultType={form.type} onClose={() => setForm((f) => ({ ...f, open: false }))} />
      </div>
    </UICtx.Provider>
  );
}

function TabBtn({ r, active, onClick }: { r: Route; active: boolean; onClick: () => void }) {
  const n = NAV.find((x) => x.route === r)!;
  const Icon = n.icon;
  return (
    <button onClick={onClick} className={cx('flex flex-col items-center gap-0.5 pb-2 pt-1 text-[11px] font-semibold transition', active ? 'text-navy-900 dark:text-mint-300' : 'text-navy-400')}>
      <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 2} />
      {n.label}
    </button>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-navy-900 dark:bg-mint-400/10">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#22D37F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 16l5-6 4 4 7-8" />
        </svg>
      </div>
      <div className="text-[17px] font-extrabold tracking-tight">
        MONEY<span className="text-mint-500"> FLOW</span>
      </div>
    </div>
  );
}
