import type { Transaction } from '../types';
import { getCategory } from './categories';
import { sortTx } from './calc';

function esc(v: string): string {
  return /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV с разделителем ";" и BOM — корректно открывается в русском Excel. */
export function transactionsToCSV(txs: Transaction[]): string {
  const head = ['Дата', 'Тип', 'Категория', 'Сумма, ₸', 'Комментарий'];
  const rows = sortTx(txs).map((t) => [
    t.date,
    t.type === 'income' ? 'Доход' : 'Расход',
    getCategory(t.categoryId).name,
    ((t.type === 'income' ? 1 : -1) * t.amount / 100).toFixed(2).replace('.', ','),
    t.note ?? '',
  ]);
  return '﻿' + [head, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
