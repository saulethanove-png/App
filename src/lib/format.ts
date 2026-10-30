import type { Money } from '../types';

const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1234567 тиын → "12 345,67 ₸"; целые суммы без копеек */
export function formatMoney(m: Money, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const neg = m < 0;
  const abs = Math.abs(m);
  let body: string;
  if (opts.compact && abs >= 100_000_000) {
    // от 1 млн ₸
    body = (abs / 100_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' млн';
  } else if (opts.compact && abs >= 10_000_000) {
    // от 100 тыс ₸
    body = Math.round(abs / 100_000).toLocaleString('ru-RU') + ' тыс';
  } else {
    body = abs % 100 === 0 ? nf0.format(abs / 100) : nf2.format(abs / 100);
  }
  const sign = neg ? '−' : opts.sign && m > 0 ? '+' : '';
  return `${sign}${body} ₸`;
}

/** Значение для поля ввода: 1250000 → "12500" */
export function moneyToInput(m: Money): string {
  if (m % 100 === 0) return String(m / 100);
  return (m / 100).toFixed(2).replace('.', ',');
}

export type ParseResult = { ok: true; value: Money } | { ok: false; error: string };

export const MAX_AMOUNT: Money = 100_000_000_000_00; // 100 млрд ₸

/** Разбор пользовательского ввода: "12 500,50" → 1250050 тиын */
export function parseMoney(raw: string, { allowZero = false } = {}): ParseResult {
  const s = raw.replace(/[\s ₸]/g, '').replace(',', '.');
  if (s === '') return { ok: false, error: 'Введите сумму' };
  if (!/^\d+(\.\d{0,2})?$/.test(s)) {
    if (/^\d+\.\d{3,}$/.test(s)) return { ok: false, error: 'Не больше двух знаков после запятой' };
    if (s.startsWith('-')) return { ok: false, error: 'Сумма не может быть отрицательной' };
    return { ok: false, error: 'Только цифры, например 12 500' };
  }
  const [int, frac = ''] = s.split('.');
  const value = Number(int) * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(value) || value > MAX_AMOUNT) return { ok: false, error: 'Слишком большая сумма' };
  if (value === 0 && !allowZero) return { ok: false, error: 'Сумма должна быть больше нуля' };
  return { ok: true, value };
}

/** Форматирование числа в поле по мере ввода: "1250000" → "1 250 000" */
export function prettifyInput(raw: string): string {
  let s = raw.replace(/[^\d.,]/g, '').replace('.', ',');
  const firstComma = s.indexOf(',');
  if (firstComma !== -1) s = s.slice(0, firstComma + 1) + s.slice(firstComma + 1).replace(/,/g, '').slice(0, 2);
  const [int, frac] = s.split(',');
  const intClean = int.replace(/^0+(?=\d)/, '');
  const grouped = intClean.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return frac !== undefined ? `${grouped},${frac}` : grouped;
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export const monthName = (m: number) => MONTHS_NOM[m];
export const monthShort = (m: number) => MONTHS_SHORT[m];
export const weekdayShort = (d: Date) => WEEKDAYS_SHORT[d.getDay()];

export function formatDateLong(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
}

export function formatDayHeader(iso: string, today: string): string {
  if (iso === today) return 'Сегодня';
  const d = parseISO(iso);
  const t = parseISO(today);
  const diff = Math.round((t.getTime() - d.getTime()) / 86_400_000);
  if (diff === 1) return 'Вчера';
  const sameYear = d.getFullYear() === t.getFullYear();
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}${sameYear ? '' : ' ' + d.getFullYear()}, ${WEEKDAYS_SHORT[d.getDay()]}`;
}

export function formatDateShort(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** Локальная дата → "YYYY-MM-DD" (без сдвига часового пояса) */
export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayISO = () => toISO(new Date());

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function pluralize(n: number, one: string, few: string, many: string): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
