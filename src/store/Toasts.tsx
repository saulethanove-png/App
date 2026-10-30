import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XOctagon } from 'lucide-react';

type Kind = 'success' | 'info' | 'warn' | 'error';
interface Toast {
  id: number;
  kind: Kind;
  title: string;
  text?: string;
  action?: { label: string; onClick: () => void };
}

const Ctx = createContext<(t: Omit<Toast, 'id'>, ms?: number) => void>(() => {});

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const close = (id: number) => setList((l) => l.filter((t) => t.id !== id));
  const push = useCallback((t: Omit<Toast, 'id'>, ms = 3800) => {
    const id = nextId++;
    setList((l) => [...l.slice(-2), { ...t, id }]);
    setTimeout(() => close(id), ms);
  }, []);

  const icon = {
    success: <CheckCircle2 className="h-5 w-5 text-mint-400" />,
    info: <Info className="h-5 w-5 text-sky-400" />,
    warn: <AlertTriangle className="h-5 w-5 text-amber-400" />,
    error: <XOctagon className="h-5 w-5 text-rose-400" />,
  };

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-auto lg:right-6 lg:top-auto lg:items-end">
        {list.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm animate-pop items-start gap-3 rounded-2xl border border-white/10 bg-navy-900/95 px-4 py-3 text-white shadow-2xl backdrop-blur"
          >
            <div className="mt-0.5 shrink-0">{icon[t.kind]}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.text && <div className="mt-0.5 text-[13px] leading-snug text-navy-200">{t.text}</div>}
            </div>
            {t.action && (
              <button
                className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-mint-400 hover:bg-white/10"
                onClick={() => {
                  t.action!.onClick();
                  close(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button aria-label="Закрыть" className="shrink-0 rounded-lg p-1 text-navy-300 hover:bg-white/10" onClick={() => close(t.id)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
