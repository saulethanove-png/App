import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { formatMoney } from '../lib/format';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div className={cx('card', onClick && 'cursor-pointer transition hover:-translate-y-0.5', className)} onClick={onClick}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="h-section">{title}</h2>
      {action}
    </div>
  );
}

export function Progress({ value, level, className, color }: { value: number; level?: 'ok' | 'warn' | 'over'; className?: string; color?: string }) {
  const pct = Math.max(0, Math.min(value, 1)) * 100;
  const bg = level === 'over' ? 'bg-rose-500' : level === 'warn' ? 'bg-amber-400' : 'bg-mint-400';
  return (
    <div className={cx('h-2.5 w-full overflow-hidden rounded-full bg-navy-100 dark:bg-navy-800', className)}>
      <div
        className={cx('h-full rounded-full transition-[width] duration-700 ease-out', !color && bg)}
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string;
}) {
  return (
    <div className={cx('flex rounded-2xl bg-navy-100/70 p-1 dark:bg-navy-850', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition',
            value === o.value ? 'bg-white text-navy-900 shadow-sm dark:bg-navy-700 dark:text-white' : 'text-navy-500 hover:text-navy-800 dark:text-navy-300 dark:hover:text-white',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Модальное окно: на телефоне — шторка снизу, на компьютере — по центру */
export function Modal({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  // Окно рендерится прямо в <body>: в Safari на iPhone fixed-элемент внутри анимированного
  // блока страницы привязывается к этому блоку и уезжает за экран.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade bg-navy-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full animate-sheet-up flex-col rounded-t-[28px] bg-white shadow-2xl dark:bg-navy-900 sm:max-w-lg sm:animate-pop sm:rounded-[28px]">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-navy-100 dark:bg-navy-700 sm:hidden" />
        <div className="flex items-center justify-between px-5 pb-2 pt-3 sm:px-6 sm:pt-5">
          <h3 className="text-lg font-bold tracking-tight">{title}</h3>
          <button onClick={onClose} aria-label="Закрыть" className="rounded-full p-2 text-navy-400 hover:bg-navy-50 dark:hover:bg-navy-800">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-4 sm:px-6">{children}</div>
        {footer && <div className="pb-safe border-t border-navy-100 px-5 py-4 dark:border-navy-800 sm:px-6">{footer}</div>}
        {!footer && <div className="pb-safe" />}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[13px] font-medium text-rose-500">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[12px] text-navy-400">{hint}</span>
      ) : null}
    </label>
  );
}

export function Empty({ emoji, title, text, action }: { emoji: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 grid h-16 w-16 place-items-center rounded-3xl bg-navy-50 text-3xl dark:bg-navy-800">{emoji}</div>
      <div className="font-bold">{title}</div>
      {text && <div className="mt-1 max-w-xs text-sm text-navy-400">{text}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-xs font-semibold text-navy-400">нет данных</span>;
  const up = value > 0;
  const good = invert ? !up : up;
  if (Math.abs(value) < 0.5) return <span className="text-xs font-semibold text-navy-400">без изменений</span>;
  return (
    <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', good ? 'bg-mint-400/15 text-mint-600 dark:text-mint-300' : 'bg-rose-500/10 text-rose-500 dark:text-rose-400')}>
      {up ? '▲' : '▼'} {Math.abs(value).toFixed(0)}%
    </span>
  );
}

export function Money({ value, className, sign }: { value: number; className?: string; sign?: boolean }) {
  return <span className={cx('tabular-nums', className)}>{formatMoney(value, { sign })}</span>;
}

export function CategoryIcon({ emoji, color, size = 'md' }: { emoji: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'h-9 w-9 text-base rounded-xl' : size === 'lg' ? 'h-14 w-14 text-2xl rounded-2xl' : 'h-11 w-11 text-xl rounded-2xl';
  return (
    <div className={cx('grid shrink-0 place-items-center', s)} style={{ background: `${color}1F` }}>
      <span aria-hidden>{emoji}</span>
    </div>
  );
}

export function ChartTooltip({ active, payload, label, labelFormatter }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; labelFormatter?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-navy-900/95 px-3 py-2 text-white shadow-xl backdrop-blur">
      {label !== undefined && <div className="mb-1 text-xs text-navy-300">{labelFormatter ? labelFormatter(label) : label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-navy-200">{p.name}</span>
          <span className="ml-auto tabular-nums">{formatMoney(p.value)}</span>
        </div>
      ))}
    </div>
  );
}
