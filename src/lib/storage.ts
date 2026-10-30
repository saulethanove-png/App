import type { AppState } from '../types';

export const STORAGE_KEY = 'moneyflow:v1';

/**
 * Хранилище данных. Сейчас — localStorage браузера (данные сохраняются между перезапусками).
 * Интерфейс специально простой, чтобы позже заменить его на Supabase (см. README).
 */
export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AppState;
    if (!s || s.version !== 1 || !Array.isArray(s.transactions)) return null;
    // мягкая миграция на случай отсутствующих полей
    s.learning ??= { readArticles: [], doneTasks: {}, bonusXp: 0 };
    s.alertsShown ??= [];
    s.goals ??= [];
    s.accounts ??= [];
    s.rules ??= [];
    s.budget ??= { monthlyLimit: null, categoryLimits: {} };
    return s;
  } catch {
    return null;
  }
}

let memoryOnly = false;

export function saveState(s: AppState): boolean {
  if (memoryOnly) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    memoryOnly = true; // приватный режим / хранилище недоступно
    return false;
  }
}

export function storageAvailable(): boolean {
  try {
    const k = '__mf_test__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
