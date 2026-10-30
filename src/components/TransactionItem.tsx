import type { Transaction } from '../types';
import { getCategory } from '../lib/categories';
import { formatDateShort, formatMoney } from '../lib/format';
import { CategoryIcon, cx } from './ui';
import { useStore } from '../store/AppStore';
import { BankBadge } from './ImportWizard';

export function TransactionItem({ tx, onClick, showDate }: { tx: Transaction; onClick?: () => void; showDate?: boolean }) {
  const c = getCategory(tx.categoryId);
  const income = tx.type === 'income';
  const { state } = useStore();
  const acc = tx.accountId ? state.accounts.find((a) => a.id === tx.accountId) : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-navy-50 dark:hover:bg-navy-850"
    >
      <div className="relative">
        <CategoryIcon emoji={c.emoji} color={c.color} />
        {acc && <div className="absolute -bottom-1 -right-1 rounded-lg ring-2 ring-white dark:ring-navy-900"><BankBadge bank={acc.bank} size="sm" /></div>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{tx.note || c.name}</div>
        <div className="truncate text-[13px] text-navy-400">
          {tx.note ? c.name : income ? 'Доход' : 'Расход'}
          {showDate && ` · ${formatDateShort(tx.date)}`}
        </div>
      </div>
      <div className={cx('shrink-0 text-[15px] font-bold tabular-nums', income ? 'text-mint-500 dark:text-mint-400' : 'text-navy-900 dark:text-white')}>
        {formatMoney(income ? tx.amount : -tx.amount)}
      </div>
    </button>
  );
}
