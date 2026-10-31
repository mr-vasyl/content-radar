// 🧾 Режим orders — «Замовлення для креаторів 🇺🇦». Кожен запуск (кожні 2 год удень):
//   1) нові пропозиції з ORDER_SOURCES (≤2 дні) → правила → попередній відбір за заголовками → GPT-факти → код вирішує →
//      фактчек → ЧЕРГА (Article ord_queue з готовим постом);
//   2) з черги надсилаємо 1 найкращий пост з рубрики, якої найбільше бракує до цільової частки (не більше DAILY_CAP на день);
//   3) за розкладом: 💡 «від замовлення до продукту» (вт, пт) і 📊 «ціни тижня» (нд).
// Вакансії швидко закривають: у черзі пропозиція живе 3 дні (конкурс — до дедлайну, але не більше 10 днів).
import { prisma } from "../db.ts";
import { fetchArticles, type Article } from "../fetchArticles.ts";
import { extractArticle } from "../extractText.ts";
import { ruleRejectReason } from "../ruleFilter.ts";
import { makeDuplicateChecker } from "../dedup.ts";
import { prefilter } from "../prefilter.ts";
import { factCheck } from "../factCheck.ts";
import { sendPost } from "../sendToTelegram.ts";
import { alreadyRan, isoWeek, markRan } from "../formatLog.ts";
import {
  analyzeOrder, notCreativeOrder, ORDER_SOURCES, PRODUCT_IDEAS, priorityOf, productPost, rubricOf, RUBRICS, weeklyPrices,
  withOrderLink, type Meta, type Rubric,
} from "../orders.ts";
import type { RunOptions } from "./types.ts";

const MAX_AGE_DAYS = 2;
const ANALYZE_PER_RUN = 8; // 💸 повна оцінка GPT — лише для стількох за запуск
const DAILY_CAP = 6; // постів-пропозицій на день (власник перевіряє й публікує вручну)
const DAY = 86400000;
const P = "ord:";

const kyivDate = (d = new Date()) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" });
const kyivHour = () => Number(new Date().toLocaleString("en-US", { timeZone: "Europe/Kyiv", hour: "numeric", hourCycle: "h23" }));
const kyivWeekday = () => new Date().toLocaleDateString("en-US", { timeZone: "Europe/Kyiv", weekday: "short" }); // Sun, Mon…

async function save(a: Article, status: string, data: { reason: string; kind?: string; score?: number; post?: string; tags?: string[]; meta?: object }) {
  const row = {
    status, account: "orders", reason: data.reason, stream: data.kind ?? null, score: data.score ?? null,
    post: data.post ?? null, tags: data.tags?.join(" ") ?? null, hook: data.meta ? JSON.stringify(data.meta) : null,
  };
  await prisma.article.upsert({
    where: { url: P + a.url },
    update: row,
    create: { url: P + a.url, title: a.title, source: a.source, publishedAt: a.publishedAt, ...row },
  });
}

// 1. Збір і оцінка
async function collect(opts: RunOptions, limit = ANALYZE_PER_RUN): Promise<void> {
  const all: Article[] = [];
  for (const s of ORDER_SOURCES) {
    try {
      all.push(...(await fetchArticles(s)));
    } catch (err) {
      console.error(`Помилка з джерелом ${s.name}:`, (err as Error).message);
    }
  }
  const cutoff = Date.now() - MAX_AGE_DAYS * DAY;
  const recent = all.filter((a) => !a.publishedAt || a.publishedAt.getTime() >= cutoff);
  const seen = new Set(
    (await prisma.article.findMany({ where: { url: { in: recent.map((a) => P + a.url) } }, select: { url: true } })).map((r) => r.url.slice(P.length)),
  );
  const fresh = [...new Map(recent.filter((a) => !seen.has(a.url)).map((a) => [a.url, a])).values()];

  // та сама вакансія з двох сайтів — за схожістю заголовка з тим, що вже бачили за 14 днів
  const recentTitles = await prisma.article.findMany({
    where: { url: { startsWith: P }, status: { in: ["ord_queue", "ord_sent"] }, createdAt: { gte: new Date(Date.now() - 14 * DAY) } },
    select: { title: true },
  });
  const isDup = makeDuplicateChecker(recentTitles.map((r) => r.title));

  const candidates: Article[] = [];
  for (const a of fresh) {
    const why = ruleRejectReason(a) ?? notCreativeOrder(a) ?? (isDup(a.title) ? "дубль за заголовком" : null);
    if (why) {
      if (!opts.dryRun) await save(a, "ord_rejected_rules", { reason: why });
      continue;
    }
    candidates.push(a);
  }

  const picked = await prefilter(
    candidates,
    "оплачувані творчі замовлення, віддалена творча робота, конкурси з грошовими призами й бренди, що шукають UGC-креаторів, — для українських дизайнерів, ілюстраторів, фотографів, відеографів, музикантів і авторів. Офісні вакансії, продажі, менеджмент, розробка — ні.",
    limit,
  );
  console.log(`Замовлення: у стрічках ${all.length}, свіжих ${recent.length}, нових ${fresh.length}, після правил ${candidates.length}, на оцінку ${picked.size}`);

  for (const a of candidates) {
    if (!picked.has(a.url)) {
      if (!opts.dryRun) await save(a, "ord_rejected_rules", { reason: "попередній відбір" });
      continue;
    }
    try {
      const ex = await extractArticle(a.url);
      const isTelegram = ORDER_SOURCES.find((s) => s.name === a.source)?.telegram;
      const text = isTelegram && a.content ? `Пост каналу:\n${a.content}\n\nСторінка першоджерела:\n${ex?.text ?? "(не прочиталась)"}` : (ex?.text ?? null);
      const v = await analyzeOrder(a, text, ex?.links);
      const meta = { ...v.meta, deadline: v.deadline };
      if (!v.accepted) {
        console.log(`· ${v.score}/10 [${v.kind}] ${a.title} — ${v.reason}`);
        if (!opts.dryRun) await save(a, "ord_rejected", { reason: v.reason, kind: v.kind, score: v.score, tags: v.tags, meta });
        continue;
      }
      const fc = await factCheck(a.source, a.title, text ?? a.content, v.post, "", { noNovelty: true });
      if (fc.verdict === "reject") {
        console.log(`✗ фактчек: ${a.title} — ${fc.issues.join("; ")}`);
        if (!opts.dryRun) await save(a, "ord_rejected", { reason: `фактчек: ${fc.issues.join("; ")}`, kind: v.kind, score: v.score, tags: v.tags, meta });
        continue;
      }
      const post = withOrderLink(fc.post, a.url, v.kind) // a.url — сама вакансія/проєкт (для Telegram — уже першоджерело); GPT інколи брав сторінку компанії;
      console.log(`✓ ${v.score}/10 [${v.kind}] ${a.title}`);
      if (opts.dryRun) {
        console.log(`\n${post}\n`);
        if (opts.send) await sendPost(post, { tags: v.tags, account: "orders", source: v.meta.origin || a.source, lines: [`🧪 тест · ${v.kind} · ${v.score}/10`], link: { url: a.url, label: "Оригінал" } });
        continue;
      }
      await save(a, "ord_queue", { reason: v.reason, kind: v.kind, score: v.score, post, tags: v.tags, meta });
    } catch (err) {
      console.error(`✗ ${a.title}:`, (err as Error).message); // не записуємо — спробуємо наступного запуску
    }
  }
}

// 2. Надсилання одного поста з черги
async function sendFromQueue(): Promise<void> {
  // протерміновані: вакансії — 3 дні, конкурси — до дедлайну (≤10 днів)
  const queue = await prisma.article.findMany({ where: { url: { startsWith: P }, status: "ord_queue" } });
  const live: typeof queue = [];
  for (const q of queue) {
    const meta = JSON.parse(q.hook ?? "{}") as Meta & { deadline?: string };
    const age = Date.now() - q.createdAt.getTime();
    const contest = q.stream === "contest_prize";
    const expired = (meta.deadline && meta.deadline <= kyivDate(new Date(Date.now() + DAY))) || age > (contest ? 10 : 3) * DAY;
    if (expired) await prisma.article.update({ where: { id: q.id }, data: { status: "ord_expired" } });
    else live.push(q);
  }
  if (!live.length) return console.log("Черга замовлень порожня");

  // ліміт — за добу (ковзні 24 год), лише пости-пропозиції (без 💡 і 📊)
  const sentDay = await prisma.sentMessage.count({
    where: { format: "orders", account: { in: Object.keys(RUBRICS) }, createdAt: { gte: new Date(Date.now() - DAY) } },
  });
  if (sentDay >= DAILY_CAP) return console.log(`Ліміт ${DAILY_CAP} постів за добу — чекаємо`);

  // рубрика з найбільшим недобором до цільової частки за 7 днів
  const week = await prisma.sentMessage.findMany({ where: { format: "orders", account: { in: Object.keys(RUBRICS) }, createdAt: { gte: new Date(Date.now() - 7 * DAY) } }, select: { account: true } });
  const done = new Map<string, number>();
  for (const w of week) done.set(w.account ?? "", (done.get(w.account ?? "") ?? 0) + 1);
  const total = week.length + 1;
  const order = (Object.keys(RUBRICS) as Rubric[]).sort((a, b) => (done.get(a) ?? 0) / total - RUBRICS[a].target - ((done.get(b) ?? 0) / total - RUBRICS[b].target));
  const best = (r: Rubric) => live.filter((q) => rubricOf(q.stream ?? "") === r).sort((a, b) => priorityOf(b.stream!, b.score ?? 0) - priorityOf(a.stream!, a.score ?? 0))[0];
  const rubric = order.find((r) => best(r));
  const q = rubric && best(rubric);
  if (!q || !rubric) return;

  const meta = JSON.parse(q.hook ?? "{}") as Meta;
  const original = q.url.slice(P.length).replace(/^grant:/, "");
  await sendPost(q.post!, {
    tags: q.tags?.split(" ").filter(Boolean),
    account: "orders",
    source: meta.origin || q.source,
    lines: [],
    link: { url: original, label: "Оригінал" },
  }, { format: "orders", title: q.title, url: original, source: q.source, account: rubric, score: q.score ?? undefined });
  await prisma.article.update({ where: { id: q.id }, data: { status: "ord_sent" } });
  console.log(`✓ надіслано [${rubric}] ${q.title} (у черзі лишилось ${live.length - 1})`);
}

// 3. Пости за розкладом
async function scheduled(opts: RunOptions): Promise<void> {
  const day = kyivWeekday();
  const hour = kyivHour();

  // 💡 «Від замовлення до продукту» — вівторок і п'ятниця, з 12:00
  if ((day === "Tue" || day === "Fri") && hour >= 12 && !(await alreadyRan("orders_product", kyivDate()))) {
    const n = await prisma.article.count({ where: { url: { startsWith: `${P}product:` } } });
    const p = await productPost(n);
    await sendPost(p.post, { tags: ["#продукт", p.tag], account: "orders", lines: [] },
      { format: "orders", title: `💡 ${p.title}`, account: "product" });
    await prisma.article.create({ data: { url: `${P}product:${kyivDate()}`, title: p.title, source: "SkyNovix", status: "ord_sent", stream: "product", account: "orders", post: p.post } });
    await markRan("orders_product", kyivDate());
    console.log(`💡 ${p.title}`);
  }

  // 📊 «Ціни тижня» — неділя, з 12:00
  if (day === "Sun" && hour >= 12 && !(await alreadyRan("orders_prices", isoWeek()))) {
    const post = await weeklyPrices();
    if (post) {
      await sendPost(post, { tags: ["#ціни"], account: "orders", lines: [] }, { format: "orders", title: `📊 Ціни тижня ${isoWeek()}`, account: "prices" });
      console.log("📊 Ціни тижня надіслано");
    } else console.log("📊 Ціни тижня: замало даних — пропускаю");
    await markRan("orders_prices", isoWeek());
  }
  void opts;
}

export async function runOrders(opts: RunOptions): Promise<void> {
  if (opts.dryRun) {
    // тест: оцінка без запису в базу + пробний 💡 і 📊
    await collect(opts, Number(process.env.ORDERS_LIMIT || 10));
    const p = await productPost(Math.floor(Math.random() * PRODUCT_IDEAS.length));
    console.log(`\n💡 ${p.title}\n\n${p.post}\n`);
    if (opts.send) await sendPost(p.post, { tags: ["#продукт", p.tag], account: "orders", lines: ["🧪 тест · від замовлення до продукту"] });
    const prices = await weeklyPrices();
    console.log(prices ? `\n📊\n${prices}` : "\n📊 Ціни тижня: даних ще замало");
    return;
  }
  await collect(opts);
  await sendFromQueue();
  await scheduled(opts);
}
