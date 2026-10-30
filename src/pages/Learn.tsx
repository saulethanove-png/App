import { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Clock, Lock, Search, Sparkles } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { useToast } from '../store/Toasts';
import { ARTICLES, GLOSSARY, TIPS, achievements, isTaskDone, levelOf, tasksForDay, xpOf, type Article } from '../lib/learn';
import { Card, Modal, SectionHeader, Segmented, cx } from '../components/ui';

type Tab = 'main' | 'articles' | 'glossary' | 'achievements';

export function Learn() {
  const { state, dispatch, today } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('main');
  const [article, setArticle] = useState<Article | null>(null);

  const xp = xpOf(state, today);
  const lvl = levelOf(xp);
  const tasks = tasksForDay(today);
  const ach = achievements(state, today);
  const unlocked = ach.filter((a) => a.unlocked).length;

  // автоматически засчитываем задания, условия которых уже выполнены
  useEffect(() => {
    const done = state.learning.doneTasks[today] ?? [];
    tasks.forEach((t) => {
      if (t.auto && t.auto(state, today) && !done.includes(t.id)) dispatch({ type: 'learn/task', id: t.id, day: today, done: true });
    });
  }, [state, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTask = (id: string, done: boolean) => {
    const prevLevel = lvl.index;
    dispatch({ type: 'learn/task', id, day: today, done });
    if (done) {
      const nextLvl = levelOf(xp + 20);
      toast(nextLvl.index > prevLevel ? { kind: 'success', title: `Новый уровень: ${nextLvl.name}! 🎉` } : { kind: 'success', title: 'Задание выполнено', text: '+20 XP' });
    }
  };

  const markRead = (a: Article) => {
    if (state.learning.readArticles.includes(a.id)) return setArticle(null);
    const nextLvl = levelOf(xp + 30);
    dispatch({ type: 'learn/read', id: a.id, day: today });
    toast(nextLvl.index > lvl.index ? { kind: 'success', title: `Новый уровень: ${nextLvl.name}! 🎉` } : { kind: 'success', title: 'Статья прочитана', text: '+30 XP' });
    setArticle(null);
  };

  const doneCount = tasks.filter((t) => isTaskDone(state, t, today)).length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[26px] font-extrabold tracking-tight">Финансовая грамотность</h1>
        <div className="text-sm text-navy-400">Учитесь по 5 минут в день — и деньги начнут работать на вас</div>
      </header>

      {/* Уровень */}
      <section className="relative overflow-hidden rounded-[28px] bg-navy-900 p-6 text-white dark:bg-navy-850">
        <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-mint-400/25 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-mint-400 text-2xl font-extrabold text-navy-950 shadow-glow">{lvl.index}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-navy-300">Уровень {lvl.index}</div>
            <div className="text-[22px] font-extrabold tracking-tight">{lvl.name}</div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-mint-400 transition-[width] duration-700" style={{ width: `${lvl.progress * 100}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[12px] text-navy-300">
              <span>{xp} XP</span>
              <span>{lvl.nextName ? `до «${lvl.nextName}» ${lvl.toNext} XP` : 'Максимальный уровень'}</span>
            </div>
          </div>
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-2 text-center">
          <Stat value={`${state.learning.readArticles.length}/${ARTICLES.length}`} label="статей" />
          <Stat value={`${doneCount}/3`} label="заданий сегодня" />
          <Stat value={`${unlocked}/${ach.length}`} label="достижений" />
        </div>
      </section>

      <div>
        <Segmented className="sm:max-w-xl" value={tab} onChange={setTab} options={[{ value: 'main', label: 'Главное' }, { value: 'articles', label: 'Статьи' }, { value: 'glossary', label: 'Термины' }, { value: 'achievements', label: 'Награды' }]} />
      </div>

      {tab === 'main' && (
        <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
          <Card className="p-5">
            <SectionHeader title="Задания на сегодня" action={<span className="text-[12px] font-bold text-mint-600 dark:text-mint-400">+20 XP каждое</span>} />
            <div className="space-y-2">
              {tasks.map((t) => {
                const done = isTaskDone(state, t, today);
                return (
                  <button
                    key={t.id}
                    onClick={() => !t.auto && toggleTask(t.id, !done)}
                    className={cx('flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition', done ? 'border-mint-400/40 bg-mint-400/10' : 'border-navy-100 hover:bg-navy-50 dark:border-navy-800 dark:hover:bg-navy-850', t.auto && 'cursor-default')}
                  >
                    <span className="text-2xl">{t.emoji}</span>
                    <span className={cx('flex-1 text-sm font-semibold', done && 'text-navy-400 line-through')}>{t.title}{t.auto && !done && <span className="mt-0.5 block text-[12px] font-medium text-navy-400 no-underline">Засчитается автоматически</span>}</span>
                    <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition', done ? 'border-mint-400 bg-mint-400 text-navy-950' : 'border-navy-200 dark:border-navy-600')}>
                      {done && <Check className="h-4 w-4" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
            {doneCount === 3 && <div className="mt-3 rounded-2xl bg-mint-400/10 p-3 text-center text-sm font-bold text-mint-700 dark:text-mint-300">🔥 Все задания выполнены! Возвращайтесь завтра.</div>}
          </Card>

          <Card className="p-5">
            <SectionHeader title="Советы по экономии" />
            <div className="space-y-2.5">
              {TIPS.slice(0, 6).map((t) => (
                <div key={t.text} className="flex gap-3 rounded-2xl bg-navy-50 p-3 dark:bg-navy-850">
                  <span className="text-xl">{t.emoji}</span>
                  <span className="text-[13px] font-medium leading-snug">{t.text}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <SectionHeader title="Продолжить обучение" action={<button className="text-sm font-semibold text-mint-600 dark:text-mint-400" onClick={() => setTab('articles')}>Все статьи</button>} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ARTICLES.filter((a) => !state.learning.readArticles.includes(a.id)).slice(0, 3).map((a) => <ArticleCard key={a.id} a={a} read={false} onOpen={() => setArticle(a)} />)}
              {ARTICLES.every((a) => state.learning.readArticles.includes(a.id)) && <div className="text-sm text-navy-400">🎓 Вы прочитали все статьи!</div>}
            </div>
          </Card>
        </div>
      )}

      {tab === 'articles' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ARTICLES.map((a) => <ArticleCard key={a.id} a={a} read={state.learning.readArticles.includes(a.id)} onOpen={() => setArticle(a)} />)}
        </div>
      )}

      {tab === 'glossary' && <Glossary />}

      {tab === 'achievements' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ach.map((a) => (
            <Card key={a.id} className={cx('flex flex-col items-center p-4 text-center', !a.unlocked && 'opacity-60')}>
              <div className={cx('relative grid h-16 w-16 place-items-center rounded-3xl text-3xl', a.unlocked ? 'bg-mint-400/15' : 'bg-navy-100 grayscale dark:bg-navy-800')}>
                {a.emoji}
                {!a.unlocked && <Lock className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-white p-1 text-navy-400 dark:bg-navy-900" />}
                {a.unlocked && <CheckCircle2 className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-white text-mint-500 dark:bg-navy-900" />}
              </div>
              <div className="mt-3 text-sm font-bold">{a.title}</div>
              <div className="mt-0.5 text-[12px] leading-snug text-navy-400">{a.desc}</div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!article}
        onClose={() => setArticle(null)}
        title={article ? `${article.emoji} ${article.title}` : ''}
        footer={article && (
          <button className={state.learning.readArticles.includes(article.id) ? 'btn-ghost w-full py-3' : 'btn-primary w-full py-3'} onClick={() => markRead(article)}>
            {state.learning.readArticles.includes(article.id) ? 'Закрыть' : <><Sparkles className="h-4 w-4" /> Прочитано · +30 XP</>}
          </button>
        )}
      >
        {article && (
          <article className="space-y-4 pb-2 text-[15px] leading-relaxed">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-navy-400">
              <span className="rounded-full bg-navy-50 px-2.5 py-0.5 dark:bg-navy-800">{article.topic}</span>
              <Clock className="h-3.5 w-3.5" /> {article.minutes} мин
            </div>
            {article.body.map((p, i) => <p key={i}>{p}</p>)}
            <div className="rounded-2xl border-l-4 border-mint-400 bg-mint-400/10 p-4 font-semibold">💡 {article.takeaway}</div>
          </article>
        )}
      </Modal>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/5 px-2 py-2.5">
      <div className="text-[17px] font-extrabold">{value}</div>
      <div className="text-[11px] text-navy-300">{label}</div>
    </div>
  );
}

function ArticleCard({ a, read, onOpen }: { a: Article; read: boolean; onOpen: () => void }) {
  return (
    <Card onClick={onOpen} className="flex flex-col p-5">
      <div className="flex items-start justify-between">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-navy-50 text-2xl dark:bg-navy-800">{a.emoji}</div>
        {read ? (
          <span className="flex items-center gap-1 rounded-full bg-mint-400/15 px-2 py-0.5 text-[11px] font-bold text-mint-600 dark:text-mint-300"><Check className="h-3 w-3" /> Прочитано</span>
        ) : (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-300">+30 XP</span>
        )}
      </div>
      <div className="mt-3 font-bold leading-snug">{a.title}</div>
      <div className="mt-1 flex-1 text-[13px] leading-snug text-navy-400">{a.summary}</div>
      <div className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-navy-400">
        <span>{a.topic}</span>·<Clock className="h-3 w-3" />{a.minutes} мин
      </div>
    </Card>
  );
}

function Glossary() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => GLOSSARY.filter((g) => (g.term + g.def).toLowerCase().includes(q.toLowerCase())), [q]);
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-navy-300" />
        <input className="input pl-12" placeholder="Найти термин" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card className="divide-y divide-navy-100 dark:divide-navy-800">
        {list.map((g) => (
          <button key={g.term} onClick={() => setOpen(open === g.term ? null : g.term)} className="block w-full px-5 py-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <span className="font-bold">{g.term}</span>
              <ChevronDown className={cx('h-4 w-4 shrink-0 text-navy-400 transition', open === g.term && 'rotate-180')} />
            </div>
            {open === g.term && <div className="mt-2 animate-fade text-sm leading-relaxed text-navy-500 dark:text-navy-300">{g.def}</div>}
          </button>
        ))}
        {!list.length && <div className="p-6 text-center text-sm text-navy-400">Ничего не найдено</div>}
      </Card>
    </div>
  );
}
