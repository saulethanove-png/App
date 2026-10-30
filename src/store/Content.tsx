import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { adminApi } from '../lib/admin';
import { mergeContent, type ContentRow } from '../lib/content';

type Ctx = ReturnType<typeof mergeContent> & { rows: ContentRow[]; reload: () => Promise<void> };
const C = createContext<Ctx>(null as never);
export const useContent = () => useContext(C);

const CACHE = 'moneyflow:content';

/** Материалы «Обучения»: встроенные + из Supabase (кешируются, чтобы работать без интернета) */
export function ContentProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<ContentRow[]>(() => {
    try { return JSON.parse(localStorage.getItem(CACHE) ?? '[]'); } catch { return []; }
  });
  const reload = useCallback(async () => {
    const r = await adminApi.content();
    if (!r.length && !navigator.onLine) return;
    setRows(r);
    try { localStorage.setItem(CACHE, JSON.stringify(r)); } catch { /* */ }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const value = useMemo(() => ({ ...mergeContent(rows), rows, reload }), [rows, reload]);
  return <C.Provider value={value}>{children}</C.Provider>;
}
