import { ARTICLES, GLOSSARY, TASK_POOL, TIPS, type Article, type DailyTask } from './learn';

/**
 * Контент раздела «Обучение» = встроенные материалы + правки администратора из таблицы content_items.
 * Строка с тем же id заменяет встроенный материал, hidden=true скрывает его, новые id добавляются в конец.
 */
export type ContentKind = 'article' | 'tip' | 'term' | 'task';

export interface ContentRow {
  id: string;
  kind: ContentKind;
  data: Record<string, unknown>;
  hidden: boolean;
  position: number;
  updated_at?: string;
}

export interface Tip { id: string; emoji: string; text: string }
export interface Term { id: string; term: string; def: string }

export const BUILTIN = {
  article: ARTICLES.map((a) => ({ ...a })),
  tip: TIPS.map((t, i) => ({ id: `tip-${i + 1}`, ...t })),
  term: GLOSSARY.map((g, i) => ({ id: `term-${i + 1}`, ...g })),
  task: TASK_POOL.map(({ id, title, emoji }) => ({ id, title, emoji })),
};

export type Origin = 'builtin' | 'edited' | 'custom' | 'hidden';

export interface Merged<T> { item: T; origin: Origin; row?: ContentRow }

function merge<T extends { id: string }>(builtin: T[], rows: ContentRow[], kind: ContentKind, normalize: (d: Record<string, unknown>, id: string) => T | null): Merged<T>[] {
  const byId = new Map(rows.filter((r) => r.kind === kind).map((r) => [r.id, r]));
  const out: Merged<T>[] = builtin.map((b) => {
    const r = byId.get(b.id);
    if (!r) return { item: b, origin: 'builtin' as Origin };
    byId.delete(b.id);
    if (r.hidden) return { item: b, origin: 'hidden' as Origin, row: r };
    const n = normalize({ ...b, ...r.data }, b.id);
    return { item: n ?? b, origin: 'edited' as Origin, row: r };
  });
  const custom = [...byId.values()].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  for (const r of custom) {
    const n = normalize(r.data, r.id);
    if (n) out.push({ item: n, origin: r.hidden ? 'hidden' : 'custom', row: r });
  }
  return out;
}

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

export function mergeContent(rows: ContentRow[]) {
  const articles = merge<Article>(BUILTIN.article, rows, 'article', (d, id) => {
    const title = str(d.title).trim();
    const body = Array.isArray(d.body) ? (d.body as unknown[]).map((x) => String(x)).filter(Boolean) : str(d.body).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    if (!title || !body.length) return null;
    const topics: Article['topic'][] = ['Бюджет', 'Накопления', 'Экономия', 'Долги', 'Инвестиции'];
    return {
      id, title, body,
      emoji: str(d.emoji, '📘') || '📘',
      minutes: Math.max(1, Math.min(30, Number(d.minutes) || Math.ceil(body.join(' ').split(/\s+/).length / 180))),
      topic: topics.includes(d.topic as Article['topic']) ? (d.topic as Article['topic']) : 'Бюджет',
      summary: str(d.summary) || body[0].slice(0, 110),
      takeaway: str(d.takeaway),
    };
  });
  const tips = merge<Tip>(BUILTIN.tip, rows, 'tip', (d, id) => (str(d.text).trim() ? { id, emoji: str(d.emoji, '💡') || '💡', text: str(d.text).trim() } : null));
  const terms = merge<Term>(BUILTIN.term, rows, 'term', (d, id) => (str(d.term).trim() && str(d.def).trim() ? { id, term: str(d.term).trim(), def: str(d.def).trim() } : null));
  const tasks = merge<{ id: string; title: string; emoji: string }>(BUILTIN.task, rows, 'task', (d, id) => (str(d.title).trim() ? { id, title: str(d.title).trim(), emoji: str(d.emoji, '✅') || '✅' } : null));
  // автоматические проверки встроенных заданий сохраняем
  const autoById = new Map(TASK_POOL.map((t) => [t.id, t.auto]));
  const taskPool: DailyTask[] = tasks.filter((t) => t.origin !== 'hidden').map((t) => ({ ...t.item, auto: autoById.get(t.item.id) }));
  return {
    articles, tips, terms, tasks,
    visible: {
      articles: articles.filter((a) => a.origin !== 'hidden').map((a) => a.item),
      // новые советы от администратора показываем первыми
      tips: [...tips.filter((a) => a.origin === 'custom'), ...tips.filter((a) => a.origin !== 'custom' && a.origin !== 'hidden')].map((a) => a.item),
      terms: terms.filter((a) => a.origin !== 'hidden').map((a) => a.item),
      tasks: taskPool.length ? taskPool : TASK_POOL,
    },
  };
}
