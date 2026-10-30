import type { BankId, Money, TxType } from '../types';
import { normalize } from './categorize';

/** Операция, распознанная из выписки, до сохранения */
export interface ImportDraft {
  date: string; // YYYY-MM-DD
  amount: Money; // тиыны, > 0
  type: TxType;
  description: string;
  operation: string; // «Покупка», «Перевод»…
  externalId: string;
}

export interface ParseResult {
  drafts: ImportDraft[];
  /** строки, похожие на операции, но не разобранные — показываем пользователю */
  skipped: string[];
  /** остаток на конец периода, если банк его указал */
  closingBalance?: Money;
  periodTo?: string;
}

// ───────────────────────── Общие разборщики ─────────────────────────

/** "−1 234,56 ₸", "1,234.56", "-1234.5 KZT", "(500)" → тиыны со знаком */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw * 100) : null;
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = /^[-−–]/.test(s) || /^\(.*\)$/.test(s) || /[-−–]\s*$/.test(s);
  if (/^\+/.test(s)) neg = false;
  s = s.replace(/[^\d.,]/g, '');
  if (!s || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let intPart = s;
  let frac = '';
  const sepIdx = Math.max(lastDot, lastComma);
  // десятичный разделитель — последний из . или , если после него 1–2 цифры
  if (sepIdx !== -1 && s.length - sepIdx - 1 <= 2 && s.length - sepIdx - 1 > 0) {
    intPart = s.slice(0, sepIdx);
    frac = s.slice(sepIdx + 1);
  }
  intPart = intPart.replace(/[.,]/g, '');
  const v = Number(intPart || '0') * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(v)) return null;
  return neg ? -v : v;
}

/** "29.10.24", "29.10.2024", "2024-10-29", "29/10/2024", Excel-число → YYYY-MM-DD */
export function parseDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && raw > 20000 && raw < 80000) {
    // серийная дата Excel
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return `${raw.getFullYear()}-${String(raw.getMonth() + 1).padStart(2, '0')}-${String(raw.getDate()).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valid(y, +m[2], +m[1]);
  }
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getMonth() !== mo - 1) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function hash(str: string): string {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

/** Проставляем отпечатки: одинаковые операции в один день различаются порядковым номером */
export function withExternalIds(bank: BankId, rows: Omit<ImportDraft, 'externalId'>[]): ImportDraft[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${bank}|${r.date}|${r.type === 'income' ? '' : '-'}${r.amount}|${normalize(r.description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...r, externalId: hash(`${base}|${n}`) };
  });
}

// ───────────────────────── Kaspi (PDF) ─────────────────────────

const KASPI_OPS = ['Покупка', 'Покупки', 'Пополнение', 'Перевод', 'Переводы', 'Снятие', 'Разное', 'Платеж', 'Платёж', 'Платежи', 'Оплата', 'Возврат'];
const KASPI_ROW = new RegExp(
  String.raw`^(\d{2}\.\d{2}\.\d{2,4})\s+([+\-−–])\s*([\d\s ]+(?:[.,]\d{1,2})?)\s*(?:₸|т|тг|KZT)?\s+(` + KASPI_OPS.join('|') + String.raw`)\s*(.*)$`,
  'i',
);

/**
 * Разбор текста выписки Kaspi Gold. Строки операций выглядят так:
 *   29.10.24   - 2 500,00 ₸   Покупка    Magnum Cash&Carry
 *   28.10.24   + 50 000,00 ₸  Пополнение С Kaspi Депозита
 * Описание иногда переносится на следующую строку — склеиваем.
 */
export function parseKaspiLines(lines: string[]): ParseResult {
  const rows: Omit<ImportDraft, 'externalId'>[] = [];
  const skipped: string[] = [];
  let closingBalance: number | undefined;
  let periodTo: string | undefined;
  let last: Omit<ImportDraft, 'externalId'> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;

    const bal = line.match(/(?:Доступно на|Остаток на|Баланс на)\s+(\d{2}\.\d{2}\.\d{2,4})\D*?([+\-−–]?\s*[\d\s ]+[.,]\d{2})/i);
    if (bal) {
      const d = parseDate(bal[1]);
      const v = parseAmount(bal[2]);
      if (d && v != null && (!periodTo || d >= periodTo)) {
        periodTo = d;
        closingBalance = v;
      }
      last = null;
      continue;
    }

    const m = line.match(KASPI_ROW);
    if (m) {
      const date = parseDate(m[1]);
      const amt = parseAmount(m[3]);
      if (!date || amt == null || amt === 0) {
        skipped.push(line);
        last = null;
        continue;
      }
      const sign = m[2] === '+' ? 1 : -1;
      const op = m[4][0].toUpperCase() + m[4].slice(1).toLowerCase();
      last = { date, amount: Math.abs(amt), type: sign > 0 ? 'income' : 'expense', operation: op, description: m[5].trim() || op };
      rows.push(last);
      continue;
    }

    if (/^\d{2}\.\d{2}\.\d{2,4}\s+[+\-−–]/.test(line)) {
      skipped.push(line);
      last = null;
      continue;
    }
    // продолжение описания предыдущей операции
    if (last && line.length < 80 && !/^(дата|сумма|операция|детали|итого|всего|выписка|kaspi|страница|остаток|номер|валюта|период|клиент)/i.test(line) && !/^\d+\s*(из|\/)\s*\d+$/.test(line)) {
      last.description = (last.description === last.operation ? '' : last.description + ' ') + line;
      continue;
    }
    last = null;
  }
  return { drafts: withExternalIds('kaspi', rows), skipped, closingBalance, periodTo };
}

/** Текст PDF построчно (pdf.js, в браузере). Строки собираются по координате Y. */
export async function pdfToLines(data: ArrayBuffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs');
  // разбор в основном потоке — работает и в однофайловой сборке
  (globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: true }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    // группируем фрагменты в строки по Y с допуском (у ячеек одной строки Y может отличаться на 1–2pt)
    const items = (tc.items as { str: string; transform: number[] }[])
      .filter((it) => it.str && it.str.trim())
      .map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || 10 }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    let line: typeof items = [];
    let lineY = Infinity;
    const flush = () => {
      if (line.length) out.push(line.sort((a, b) => a.x - b.x).map((i) => i.s).join(' '));
      line = [];
    };
    for (const it of items) {
      if (Math.abs(it.y - lineY) > Math.max(2, it.h * 0.45)) {
        flush();
        lineY = it.y;
      }
      line.push(it);
    }
    flush();
  }
  return out;
}

// ───────────────────────── CSV / Excel (любой банк) ─────────────────────────

export type Cell = string | number | Date | null | undefined;

export async function readSheet(file: File): Promise<Cell[][]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const isText = /\.(csv|txt)$/i.test(file.name) || file.type.startsWith('text/');
  let wb;
  if (isText) {
    // UTF-8, а если много «�» — Windows-1251 (так выгружают некоторые банки)
    let text = new TextDecoder('utf-8').decode(buf);
    if ((text.match(/�/g) ?? []).length > 3) text = new TextDecoder('windows-1251').decode(buf);
    const delim = guessDelimiter(text);
    wb = XLSX.read(text, { type: 'string', FS: delim, raw: true });
  } else {
    wb = XLSX.read(buf, { type: 'array', cellDates: true });
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
}

function guessDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n');
  const counts = [';', ',', '\t', '|'].map((d) => [d, sample.split(d).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

export interface ColumnMap {
  headerRow: number;
  date: number;
  description: number;
  /** одна колонка суммы со знаком… */
  amount: number;
  /** …или две: списание и зачисление */
  debit: number;
  credit: number;
  operation: number;
}

const H = {
  date: /дата|date|күні|kүні/i,
  amount: /^сумма|сумма операции|сумма в валюте счета|amount|сомасы/i,
  debit: /расход|списан|дебет|debit|withdraw|шығыс/i,
  credit: /приход|зачислен|поступлен|кредит|credit|deposit|кіріс/i,
  description: /описание|детали|назначение|контрагент|получатель|мерчант|место|description|details|merchant|payee|сипаттама/i,
  operation: /операци|тип|вид|type|operation/i,
};

/** Ищем строку заголовков и угадываем колонки */
export function detectColumns(rows: Cell[][]): ColumnMap {
  const empty: ColumnMap = { headerRow: -1, date: -1, description: -1, amount: -1, debit: -1, credit: -1, operation: -1 };
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const row = rows[r].map((c) => (c == null ? '' : String(c).trim()));
    const find = (re: RegExp, skip: number[] = []) => row.findIndex((c, i) => !skip.includes(i) && c.length < 60 && re.test(c));
    const date = find(H.date);
    if (date === -1) continue;
    const amount = find(H.amount, [date]);
    const debit = find(H.debit, [date, amount]);
    const credit = find(H.credit, [date, amount, debit]);
    if (amount === -1 && debit === -1 && credit === -1) continue;
    const used = [date, amount, debit, credit];
    let description = find(H.description, used);
    const operation = find(H.operation, [...used, description]);
    if (description === -1) description = operation;
    return { headerRow: r, date, description, amount, debit, credit, operation: operation === description ? -1 : operation };
  }
  // без заголовков: первая колонка с датами, первая числовая — сумма, самая «текстовая» — описание
  const sample = rows.slice(0, 30);
  const cols = Math.max(0, ...sample.map((r) => r.length));
  const score = (fn: (c: Cell) => boolean) =>
    Array.from({ length: cols }, (_, i) => sample.filter((r) => fn(r[i])).length);
  const ds = score((c) => parseDate(c) != null);
  const as = score((c) => typeof c === 'number' || (typeof c === 'string' && /^[+\-−]?\s*[\d\s]+[.,]?\d*\s*(₸|kzt)?$/i.test(c.trim())));
  const ts = score((c) => typeof c === 'string' && /[a-zа-я]{3,}/i.test(c));
  const best = (arr: number[], skip: number[]) => arr.reduce((bi, v, i) => (skip.includes(i) || v <= (arr[bi] ?? -1) ? bi : i), -1);
  const date = best(ds, []);
  const amount = best(as, [date]);
  const description = best(ts, [date, amount]);
  return { ...empty, headerRow: -1, date, amount, description };
}

export function sheetToDrafts(rows: Cell[][], map: ColumnMap, bank: BankId): ParseResult {
  const out: Omit<ImportDraft, 'externalId'>[] = [];
  const skipped: string[] = [];
  for (let r = map.headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => c == null || String(c).trim() === '')) continue;
    const date = parseDate(row[map.date]);
    let signed: number | null = null;
    if (map.amount !== -1) signed = parseAmount(row[map.amount]);
    if ((signed == null || signed === 0) && (map.debit !== -1 || map.credit !== -1)) {
      const d = map.debit !== -1 ? parseAmount(row[map.debit]) : null;
      const c = map.credit !== -1 ? parseAmount(row[map.credit]) : null;
      if (c && Math.abs(c) > 0) signed = Math.abs(c);
      else if (d && Math.abs(d) > 0) signed = -Math.abs(d);
    }
    const desc = map.description !== -1 && row[map.description] != null ? String(row[map.description]).trim() : '';
    const op = map.operation !== -1 && row[map.operation] != null ? String(row[map.operation]).trim() : '';
    if (!date || signed == null || signed === 0) {
      // строки «Итого», пустые и т.п. — не считаем ошибкой
      const text = row.filter((c) => c != null).join(' ').trim();
      if (date || (signed != null && signed !== 0)) skipped.push(text.slice(0, 120));
      continue;
    }
    out.push({ date, amount: Math.abs(signed), type: signed > 0 ? 'income' : 'expense', description: desc || op || 'Операция', operation: op });
  }
  return { drafts: withExternalIds(bank, out), skipped };
}

export const BANKS: { id: BankId; name: string; color: string; short: string }[] = [
  { id: 'kaspi', name: 'Kaspi Bank', color: '#F14635', short: 'K' },
  { id: 'halyk', name: 'Halyk Bank', color: '#1C9B56', short: 'H' },
  { id: 'freedom', name: 'Freedom Bank', color: '#43B02A', short: 'F' },
  { id: 'jusan', name: 'Jusan Bank', color: '#F47B20', short: 'J' },
  { id: 'alatau', name: 'Alatau City Bank', color: '#0E8C8C', short: 'A' },
  { id: 'bcc', name: 'Банк ЦентрКредит', color: '#2E5AAC', short: 'Ц' },
  { id: 'forte', name: 'ForteBank', color: '#A1005E', short: 'F' },
  { id: 'other', name: 'Другой банк', color: '#64748B', short: '₸' },
];

export const bankInfo = (id: BankId) => BANKS.find((b) => b.id === id) ?? BANKS[BANKS.length - 1];
