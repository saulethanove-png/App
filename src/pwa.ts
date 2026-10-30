import { registerSW } from 'virtual:pwa-register';

/**
 * Обновление приложения на телефоне. iPhone редко сам проверяет новую версию,
 * поэтому проверяем при каждом возвращении в приложение и раз в 30 минут.
 * Новая версия ставится автоматически и страница перезагружается.
 */
export function setupPwa() {
  if (!('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => {
        if (navigator.onLine) reg.update().catch(() => {});
      };
      setInterval(check, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
    },
  });
}
