import type { CategoryRule, TxType } from '../types';

/**
 * Автоматическая категоризация операций из банковских выписок.
 * 1) Сначала — правила пользователя (выученные из его исправлений), самые длинные совпадения важнее.
 * 2) Потом — встроенный словарь мерчантов Казахстана.
 * 3) Иначе — «Другое».
 */

/** Приводим описание к виду для сравнения: нижний регистр, без кавычек, форм собственности, номеров карт и т.п. */
export function normalize(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`“”„]/g, ' ')
    .replace(/(^|\s)(тоо|ип|ао|llp|ltd|llc|jsc|too)(?=\s|$)/g, ' ')
    .replace(/\*+\d+|\d{4,}/g, ' ') // маски карт, номера терминалов, телефоны
    .replace(/[^a-zа-я0-9әғқңөұүһі&+.\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ключ мерчанта для запоминания правила: первые 1–3 значимых слова */
export function merchantKey(desc: string): string {
  const words = normalize(desc)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w));
  return words.slice(0, words[0] && words[0].length >= 6 ? 2 : 3).join(' ');
}

const STOP = new Set(['kz', 'almaty', 'astana', 'алматы', 'астана', 'kaz', 'г.', 'г', 'pos', 'оплата', 'покупка', 'payment', 'kazakhstan']);

type Builtin = { re: RegExp; cat: string; type?: TxType };

// Порядок важен: более специфичные правила выше.
const BUILTIN: Builtin[] = [
  // Доходы
  { re: /зарплат|заработн|salary|з\/п|аванс/, cat: 'salary', type: 'income' },
  { re: /вознагражд|кэшбэк|кешбэк|cashback|бонус|процент|дивиденд|купон/, cat: 'invest', type: 'income' },
  { re: /подарок|gift/, cat: 'gifts', type: 'income' },

  // Еда и продукты
  { re: /magnum|магнум|small|смолл|galmart|галмарт|arbuz|арбуз|metro c&c|metro cash|ramstore|рамстор|anvar|анвар|interfood|toimart|food city|продукт|маркет|market|супермаркет|minimarket|мини-маркет|базар|bazar|dostyk market|astykzhan|wolt|glovo|chocofood|яндекс еда|yandex eat|kfc|mcdonald|макдон|burger|бургер|pizza|пицц|dodo|додо|coffee|кофе|кофейн|starbucks|cafe|кафе|ресторан|restaurant|столов|lanzhou|ланчжоу|salam bro|шаурм|донер|doner|bahandi|баханди|hardees|tomyumbar|del papa|пекарн|bakery|chocolate|кондитер|grill|гриль|sushi|суши|бар(?=\s|$)/, cat: 'food', type: 'expense' },

  // Транспорт
  { re: /yandex go|yandex\.go|яндекс go|яндекс такси|yandex taxi|uber|indrive|indriver|такси|taxi|onay|онай|автобус|bus|метро|metro alm|авиа|air astana|fly arystan|scat|qazaq air|aviata|chocotravel|ктж|ktz|temir|поезд|азс| azs|helios|гелиос|sinooil|синооил|kazmunaygas|qazaqoil|petrol|бензин|gas station|parking|парков|автомойк|car wash|шиномонтаж/, cat: 'transport', type: 'expense' },

  // Кредиты, рассрочки, ипотека
  { re: /кредит|рассрочк|installment|погашени|ипотек|mortgage|отбасы|otbasy|микрозайм|займ|loan|kaspi red|каспи ред/, cat: 'credit', type: 'expense' },

  // Подписки и связь
  { re: /netflix|spotify|apple\.com|apple com|itunes|icloud|google|youtube|yandex plus|яндекс плюс|кинопоиск|kinopoisk|ivi|okko|megogo|chatgpt|openai|anthropic|claude|steam|playstation|xbox|telegram|beeline|билайн|kcell|кселл|activ|актив|tele2|теле2|altel|алтел|kazakhtelecom|казахтелеком|id net|интернет|internet|подписк|subscription/, cat: 'subscriptions', type: 'expense' },

  // Жильё и коммуналка
  { re: /ерц|erc|алсеко|alseco|астана-ерц|коммунал|ксж|(?:^|\s)оси(?=\s|$)|аренд|rent|квартплат|энерго|energo|электро|водоканал|тепло|газоснаб|kazakhgaz|алматы су|астана су|сервис-центр|krisha|крыша/, cat: 'housing', type: 'expense' },

  // Здоровье
  { re: /аптек|apteka|pharm|фарм|europharma|европharma|еврофарма|биосфер|sadyhan|садыхан|med|мед|клиник|clinic|стомат|dental|invivo|инвиво|олимп|olymp|kdl|лаборат|hospital|больниц|оптика|optic|фитнес|fitness|gym|спортзал/, cat: 'health', type: 'expense' },

  // Образование
  { re: /coursera|udemy|stepik|skillbox|geekbrains|яндекс практикум|practicum|школ|school|универ|universit|колледж|college|курс|course|обучен|education|книг|book|meloman|меломан|marwin|марвин|канцтовар/, cat: 'education', type: 'expense' },

  // Развлечения
  { re: /kinopark|кинопарк|chaplin|чаплин|кинотеатр|cinema|kino|кино|театр|theatre|концерт|concert|ticketon|тикетон|kassir|kaspi тикет|боулинг|bowling|караоке|karaoke|игр|game|квест|парк развлеч|аквапарк|happylon|хэппилон|музей|museum|lounge|лаундж|кальян/, cat: 'fun', type: 'expense' },

  // Покупки
  { re: /wildberries|вайлдберриз|ozon|озон|kaspi магазин|kaspi\.kz магазин|kaspi shop|kaspi маркет|lamoda|ламода|aliexpress|алиэкспресс|temu|shein|technodom|технодом|sulpak|сулпак|mechta|мечта|alser|алсер|white wind|evrika|эврика|leroy|леруа|ikea|икеа|flip|детский мир|zara|lc waikiki|defacto|h&m|mango|adidas|nike|puma|sportmaster|спортмастер|decathlon|декатлон|mega|мега|dostyk plaza|keruen|керуен|khan shatyr|хан шатыр|mart\b|магазин|shop|store|бутик/, cat: 'shopping', type: 'expense' },
];

/** Подсказки по типу операции Kaspi / банков */
function byOperation(op: string, type: TxType): string | null {
  const o = op.toLowerCase();
  if (type === 'expense' && /снятие|withdraw|банкомат|atm/.test(o)) return 'other-exp';
  if (type === 'income' && /перевод|transfer|пополнение/.test(o)) return 'other-inc';
  if (type === 'expense' && /перевод|transfer/.test(o)) return 'other-exp';
  return null;
}

export interface Suggestion {
  categoryId: string;
  /** откуда взялась категория — показываем пользователю */
  reason: 'rule' | 'builtin' | 'operation' | 'default';
}

export function suggestCategory(description: string, type: TxType, rules: CategoryRule[], operation = ''): Suggestion {
  const n = normalize(description);
  // правила пользователя: побеждает самое длинное совпадение
  let best: CategoryRule | null = null;
  for (const r of rules) {
    if (r.type !== type || !r.pattern) continue;
    if (n.includes(r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r;
  }
  if (best) return { categoryId: best.categoryId, reason: 'rule' };

  // переводы / снятия определяем раньше словаря, чтобы «Перевод Магнум Иван» не ушёл в продукты
  const opCat = byOperation(operation, type);
  if (opCat && /перевод|transfer|снятие|withdraw/.test(operation.toLowerCase())) return { categoryId: opCat, reason: 'operation' };

  for (const b of BUILTIN) {
    if (b.type && b.type !== type) continue;
    if (b.re.test(n)) return { categoryId: b.cat, reason: 'builtin' };
  }
  if (opCat) return { categoryId: opCat, reason: 'operation' };
  return { categoryId: type === 'income' ? 'other-inc' : 'other-exp', reason: 'default' };
}

/** Похоже ли на перевод между своими счетами / людьми (такие операции можно не учитывать) */
export function isTransferLike(description: string, operation: string): boolean {
  const s = (operation + ' ' + description).toLowerCase();
  return /перевод|transfer|пополнение|с карты|на карту|между своими|с kaspi депозита|на kaspi депозит|kaspi депозит|с депозита|на депозит/.test(s);
}
