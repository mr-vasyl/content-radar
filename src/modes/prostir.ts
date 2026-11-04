// 🎨 Режим prostir — «Авторський простір 🇺🇦». Іде в тому самому прогоні, що й гранти (кожні 2 год удень), ПІСЛЯ них:
//   1) нові оголошення з PROSTIR_SOURCES (≤3 дні) → правила й дублі (зокрема з каналом грантів) → попередній відбір
//      за заголовками → GPT-факти → код вирішує → фактчек → ЧЕРГА (Article pr_queue з готовим постом);
//   2) з черги — 1 пост за прогін, не більше DAILY_CAP на добу; напрям, якого за тиждень було найменше;
//   3) неділя з 12:00 — «⏳ Дедлайни тижня» з уже надісланого.
import { prisma } from "../db.ts";
import { fetchArticles, type Article } from "../fetchArticles.ts";
import { extractArticle } from "../extractText.ts";
import { ruleRejectReason } from "../ruleFilter.ts";
import { makeDuplicateChecker } from "../dedup.ts";
import { prefilter } from "../prefilter.ts";
import { factCheck } from "../factCheck.ts";
import { sendHook, sendPost } from "../sendToTelegram.ts";
import { alreadyRan, isoWeek, markRan } from "../formatLog.ts";
import { analyzeProstir, paidInTeaser, prostirTeaser, PROSTIR_SOURCES, weeklyDeadlines, withProstirLink, type Meta } from "../prostir.ts";
import type { RunOptions } from "./types.ts";

const MAX_AGE_DAYS = 3;
const ANALYZE_PER_RUN = 6; // 💸 повна оцінка GPT — лише для стількох за запуск
const DAILY_CAP = 5; // власник: 3–5 на день
const DAY = 86400000;
const P = "pr:";

type Stored = Meta & { sentAt?: number };
const kyivDate = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" });
const kyivHour = () => Number(new Date().toLocaleString("en-US", { timeZone: "Europe/Kyiv", hour: "numeric", hourCycle: "h23" }));
const kyivWeekday = () => new Date().toLocaleDateString("en-US", { timeZone: "Europe/Kyiv", weekday: "short" });
const metaOf = (hook: string | null) => JSON.parse(hook ?? "{}") as Stored;
const core = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");

async function save(a: Article, status: string, data: { reason: string; discipline?: string; score?: number; post?: string; tags?: string[]; meta?: Stored }) {
  const row = {
    status, account: "prostir", reason: data.reason, stream: data.discipline ?? null, score: data.score ?? null,
    post: data.post ?? null, tags: data.tags?.join(" ") ?? null, hook: data.meta ? JSON.stringify(data.meta) : null,
  };
  await prisma.article.upsert({ where: { url: P + a.url }, update: row, create: { url: P + a.url, title: a.title, source: a.source, publishedAt: a.publishedAt, ...row } });
}

// Те саме вже є в каналі грантів чи в нашій черзі (за 60 днів) — посилання на програму є в тексті поста
async function linkSeen(link: string): Promise<boolean> {
  const c = core(link);
  if (c.split("/").length < 2) return false; // лише домен — не показник
  return !!(await prisma.article.findFirst({
    where: { status: { in: ["sent", "pr_queue", "pr_sent"] }, createdAt: { gte: new Date(Date.now() - 60 * DAY) }, post: { contains: c } },
    select: { id: true },
  }));
}

// 1. Збір і оцінка
async function collect(opts: RunOptions, limit = ANALYZE_PER_RUN): Promise<void> {
  const all: Article[] = [];
  for (const s of PROSTIR_SOURCES) {
    try {
      // На сторінках без RSS висять відкриті набори з дедлайнами на тижні вперед — це запас, а не старе: не позначаємо
      // їх баченими (як у каналі замовлень), а розбираємо поступово, по кілька найкращих за прогін
      all.push(...(await fetchArticles(s)));
    } catch (err) {
      console.error(`Помилка з джерелом ${s.name}:`, (err as Error).message);
    }
  }
  const cutoff = Date.now() - MAX_AGE_DAYS * DAY;
  const recent = all.filter((a) => !a.publishedAt || a.publishedAt.getTime() >= cutoff);
  const seen = new Set((await prisma.article.findMany({ where: { url: { in: recent.map((a) => P + a.url) } }, select: { url: true } })).map((r) => r.url.slice(P.length)));
  const fresh = [...new Map(recent.filter((a) => !seen.has(a.url)).map((a) => [a.url, a])).values()];

  // дубль за заголовком — з нашим (черга, надіслане) і з каналом грантів за 30 днів
  const titles = await prisma.article.findMany({
    where: { status: { in: ["sent", "pr_queue", "pr_sent"] }, createdAt: { gte: new Date(Date.now() - 30 * DAY) } },
    select: { title: true },
  });
  const isDup = makeDuplicateChecker(titles.map((r) => r.title));
  const candidates: Article[] = [];
  for (const a of fresh) {
    const dup = isDup(a.title);
    const why = ruleRejectReason(a) ?? paidInTeaser(a) ?? (dup ? `дубль: ${dup}` : null) ?? ((await prisma.article.findFirst({ where: { url: a.url, status: "sent" }, select: { id: true } })) ? "уже в каналі грантів" : null);
    if (why) {
      if (!opts.dryRun) await save(a, "pr_rejected_rules", { reason: why });
      continue;
    }
    candidates.push(a);
  }

  const PURPOSE = "безкоштовні open call, де українські автори можуть показати чи опублікувати свою роботу: виставки, журнали й антології, фестивалі й покази, конкурси робіт для художників, фотографів, письменників, музикантів, кіношників, дизайнерів. Гранти, резиденції, навчання, вакансії, новини й платні конкурси — ні.";
  const picked = candidates.length ? await prefilter(candidates, PURPOSE, Math.min(limit, candidates.length)) : new Set<string>();
  console.log(`Простір: у стрічках ${all.length}, свіжих ${recent.length}, нових ${fresh.length}, після правил ${candidates.length}, на оцінку ${picked.size}`);

  for (const a of candidates) {
    if (!picked.has(a.url)) continue; // не відкидаємо назавжди — чекає наступного прогону (RSS — поки свіже, ≤3 дні)
    try {
      const ex = await extractArticle(a.url);
      const isTelegram = PROSTIR_SOURCES.find((s) => s.name === a.source)?.telegram;
      const text = isTelegram && a.content ? `Пост каналу:\n${a.content}\n\nСторінка першоджерела:\n${ex?.text ?? "(не прочиталась)"}` : (ex?.text ?? a.content);
      const v = await analyzeProstir(a, text, ex?.links);
      if (!v.accepted) {
        console.log(`· ${v.score}/10 [${v.discipline}] ${a.title} — ${v.reason}`);
        if (!opts.dryRun) await save(a, "pr_rejected", { reason: v.reason, discipline: v.discipline, score: v.score, tags: v.tags, meta: v.meta });
        continue;
      }
      if ((v.meta.link && (await linkSeen(v.meta.link))) || (await linkSeen(a.url))) {
        console.log(`= дубль за посиланням: ${a.title}`);
        if (!opts.dryRun) await save(a, "pr_rejected_rules", { reason: `дубль за посиланням: ${v.meta.link || a.url}` });
        continue;
      }
      const fc = await factCheck(a.source, a.title, text ?? a.content, v.post, "", { noNovelty: true });
      if (fc.verdict === "reject") {
        console.log(`✗ фактчек: ${a.title} — ${fc.issues.join("; ")}`);
        if (!opts.dryRun) await save(a, "pr_rejected", { reason: `фактчек: ${fc.issues.join("; ")}`, discipline: v.discipline, score: v.score, tags: v.tags, meta: v.meta });
        continue;
      }
      const post = withProstirLink(fc.post, v.meta.link || a.url);
      console.log(`✓ ${v.score}/10 ${v.meta.grade} [${v.discipline}] ${a.title}`);
      if (opts.dryRun) {
        console.log(`\n${post}\n`);
        if (opts.send) {
          await sendPost(post, { tags: v.tags, account: "prostir", source: v.meta.origin || a.source, lines: [`🧪 тест · ${v.meta.grade} · ${v.score}/10`], link: { url: a.url, label: "Оригінал" } });
          await sendHook(await prostirTeaser(post), "prostir");
        }
        continue;
      }
      await save(a, "pr_queue", { reason: v.reason, discipline: v.discipline, score: v.score, post, tags: v.tags, meta: v.meta });
    } catch (err) {
      console.error(`✗ ${a.title}:`, (err as Error).message); // не записуємо — спробуємо наступного запуску
    }
  }
}

// 2. Один пост з черги
async function sendFromQueue(): Promise<void> {
  const queue = await prisma.article.findMany({ where: { url: { startsWith: P }, status: "pr_queue" } });
  const live: typeof queue = [];
  for (const q of queue) {
    const m = metaOf(q.hook);
    const expired = (m.deadline && m.deadline <= kyivDate(new Date(Date.now() + DAY))) || Date.now() - q.createdAt.getTime() > 21 * DAY;
    if (expired) await prisma.article.update({ where: { id: q.id }, data: { status: "pr_expired" } });
    else live.push(q);
  }
  if (!live.length) return console.log("Черга «Авторського простору» порожня");

  const sent = (await prisma.article.findMany({ where: { url: { startsWith: P }, status: "pr_sent", createdAt: { gte: new Date(Date.now() - 40 * DAY) } }, select: { stream: true, hook: true } }))
    .map((s) => ({ disc: s.stream ?? "", at: metaOf(s.hook).sentAt ?? 0 }));
  const today = sent.filter((s) => s.at > Date.now() - DAY).length;
  if (today >= DAILY_CAP) return console.log(`Простір: ліміт ${DAILY_CAP} за добу — чекаємо`);

  // напрям, якого за тиждень було найменше; не той самий, що останній, якщо є вибір; усередині — A, оцінка, ближчий дедлайн
  const week = new Map<string, number>();
  for (const s of sent) if (s.at > Date.now() - 7 * DAY) week.set(s.disc, (week.get(s.disc) ?? 0) + 1);
  const last = sent.sort((x, y) => y.at - x.at)[0]?.disc;
  const soon = (d: string) => (d && d <= kyivDate(new Date(Date.now() + 7 * DAY)) ? 2 : 0);
  const rank = (q: (typeof live)[number]) => { const m = metaOf(q.hook); return (m.grade === "A" ? 10 : 0) + (q.score ?? 0) + soon(m.deadline); };
  const discs = [...new Set(live.map((q) => q.stream ?? ""))];
  const pool = discs.length > 1 ? discs.filter((d) => d !== last) : discs;
  pool.sort((a, b) => (week.get(a) ?? 0) - (week.get(b) ?? 0) || Math.max(...live.filter((q) => q.stream === b).map(rank)) - Math.max(...live.filter((q) => q.stream === a).map(rank)));
  const q = live.filter((x) => (x.stream ?? "") === pool[0]).sort((a, b) => rank(b) - rank(a))[0]!;
  const m = metaOf(q.hook);
  const original = q.url.slice(P.length);

  await sendPost(q.post!, { tags: q.tags?.split(" ").filter(Boolean), account: "prostir", source: m.origin || q.source, lines: [`${m.grade} · ${q.score}/10 · знайдено на: ${q.source}`], link: { url: original, label: "Оригінал" } });
  await prisma.article.update({ where: { id: q.id }, data: { status: "pr_sent", hook: JSON.stringify({ ...m, sentAt: Date.now() }) } });
  try {
    const t = await prostirTeaser(q.post!);
    if (t) await sendHook(t, "prostir");
  } catch (err) {
    console.error("Тизер для Threads не вийшов:", (err as Error).message);
  }
  console.log(`✓ Простір: надіслано [${q.stream}] ${q.title} (у черзі ${live.length - 1})`);
}

// 3. ⏳ Дедлайни тижня — неділя з 12:00
async function weekly(opts: RunOptions): Promise<void> {
  if (!opts.dryRun && !(kyivWeekday() === "Sun" && kyivHour() >= 12 && !(await alreadyRan("prostir_week", isoWeek())))) return;
  const from = kyivDate(new Date(Date.now() + DAY)), to = kyivDate(new Date(Date.now() + 9 * DAY));
  const rows = await prisma.article.findMany({ where: { url: { startsWith: P }, status: "pr_sent", createdAt: { gte: new Date(Date.now() - 40 * DAY) } } });
  const items = rows.map((r) => ({ meta: metaOf(r.hook), url: r.url.slice(P.length) })).filter((x) => x.meta.deadline > from && x.meta.deadline <= to);
  const post = weeklyDeadlines(items);
  if (opts.dryRun) return console.log(post ? `\n${post}` : "\n⏳ Дедлайни тижня: замало постів");
  if (post) await sendPost(post, { tags: ["#дедлайни"], account: "prostir", lines: [] });
  console.log(post ? "⏳ Дедлайни тижня надіслано" : "⏳ Дедлайни тижня: замало — пропускаю");
  await markRan("prostir_week", isoWeek());
}

export async function runProstir(opts: RunOptions): Promise<void> {
  await collect(opts, opts.dryRun ? Number(process.env.PROSTIR_LIMIT || 8) : ANALYZE_PER_RUN);
  if (!opts.dryRun) await sendFromQueue();
  await weekly(opts);
}
