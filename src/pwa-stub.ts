// Заглушка для однофайловой сборки (MoneyFlow.html) — там нет service worker
export function registerSW(_opts?: unknown) {
  return () => Promise.resolve();
}
