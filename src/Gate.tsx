import type { ReactNode } from 'react';
import { useCloud } from './store/Cloud';
import { AuthScreen, CloudDialogs } from './components/AuthScreen';

/** Показываем вход/регистрацию, если облако настроено, а пользователь не вошёл и не выбрал режим без аккаунта */
export function Gate({ children }: { children: ReactNode }) {
  const c = useCloud();
  if (!c.ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-navy-950">
        <svg viewBox="0 0 24 24" className="h-10 w-10 animate-pulse" fill="none" stroke="#22D37F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16l5-6 4 4 7-8" /></svg>
      </div>
    );
  }
  if (c.enabled && !c.user && !c.guest) return <AuthScreen />;
  return (
    <>
      {children}
      <CloudDialogs />
    </>
  );
}
