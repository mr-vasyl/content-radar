import { prisma } from "./db.ts";
import type { Article } from "./fetchArticles.ts";
import type { Analysis } from "./summarize.ts";

// Повертає лише ті статті, яких ще немає в базі.
export async function filterNew(articles: Article[]): Promise<Article[]> {
  if (articles.length === 0) return [];

  const seen = await prisma.article.findMany({
    where: { url: { in: articles.map((a) => a.url) } },
    select: { url: true },
  });
  const seenUrls = new Set(seen.map((s) => s.url));

  // ще й дублі всередині однієї пачки (та сама стаття у двох стрічках)
  const unique = new Map<string, Article>();
  for (const a of articles) {
    if (!seenUrls.has(a.url) && !unique.has(a.url)) unique.set(a.url, a);
  }
  return [...unique.values()];
}

// Слова заголовка без дрібниць: "ZMINA:Resilience. Підтримка проєктів…" → {zmina, resilience, підтримка, проєктів, …}
function words(title: string): Set<string> {
  return new Set(title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4));
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return common / Math.min(a.size, b.size); // частка спільних слів від коротшого заголовка
}

// Та сама новина/грант з різних сайтів (ГУРТ, Простір, фонд, Креативна Європа) — різні посилання, схожі заголовки.
// Повертає заголовок уже надісланого схожого поста або null.
export function makeDuplicateChecker(sentTitles: string[]) {
  const seen = sentTitles.map((t) => ({ t, w: words(t) }));
  return (title: string): string | null => {
    const w = words(title);
    if (w.size < 3) return null; // надто короткий заголовок — не ризикуємо
    const hit = seen.find((s) => similarity(w, s.w) >= 0.7);
    if (hit) return hit.t;
    seen.push({ t: title, w }); // щоб ловити дублі й усередині однієї пачки
    return null;
  };
}

export async function recentSentTitles(days = 30): Promise<string[]> {
  const rows = await prisma.article.findMany({
    where: { status: "sent", createdAt: { gte: new Date(Date.now() - days * 86400000) } },
    select: { title: true },
  });
  return rows.map((r) => r.title);
}

// 🔁 Та сама програма під іншою назвою з іншого агрегатора (аудит 2026-10-24: BLOOM, «65% на дослідження», хакатон OBRIO
// прийшли двічі — заголовки й посилання різні, тож ні схожість слів, ні посилання не ловили). Перед надсиланням —
// короткий запит до GPT зі списком уже надісланого за 14 днів. Дешево: ~1–2 тис. токенів, лише для постів, що пройшли.
export async function sameAsRecent(title: string, post: string): Promise<string | null> {
  const rows = await prisma.article.findMany({
    where: { status: "sent", createdAt: { gte: new Date(Date.now() - 14 * 86400000) } },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { title: true },
  });
  if (!rows.length) return null;
  const list = rows.map((r, i) => `${i + 1}. ${r.title.slice(0, 140)}`).join("\n");
  const { askJson } = await import("./gpt.ts");
  const r = await askJson<{ duplicate_of: number }>(
    `Ти перевіряєш дублі в каналі грантів. Дубль — це ТА САМА програма/конкурс/можливість (той самий організатор і той
самий набір), навіть якщо назва написана інакше. Різні раунди, різні програми одного фонду чи схожа тема — НЕ дубль.
Поверни duplicate_of — номер зі списку, якщо новий пост про те саме; інакше 0.`,
    `Уже надіслано:\n${list}\n\nНовий: ${title}\n${post.slice(0, 600)}`,
    "dup_check",
    { type: "object", additionalProperties: false, required: ["duplicate_of"], properties: { duplicate_of: { type: "integer" } } },
  );
  return r.duplicate_of > 0 && r.duplicate_of <= rows.length ? rows[r.duplicate_of - 1]!.title : null;
}

type Status = "sent" | "rejected_rules" | "rejected_ai";

// Записує статтю з рішенням щодо неї — наступний запуск її пропустить.
export async function record(
  article: Article,
  status: Status,
  extra: { reason?: string; analysis?: Analysis } = {},
): Promise<void> {
  const a = extra.analysis;
  const data = {
    status,
    score: a?.score ?? null,
    stream: a?.stream ?? null,
    account: a?.account ?? null,
    reason: a?.reason ?? extra.reason ?? null,
    post: status === "sent" ? (a?.post ?? null) : null,
    hook: status === "sent" && a?.hook ? a.hook : null,
    tags: a?.tags?.length ? a.tags.join(" ") : null,
  };
  await prisma.article.upsert({
    where: { url: article.url },
    update: data,
    create: {
      url: article.url,
      title: article.title,
      source: article.source,
      publishedAt: article.publishedAt,
      ...data,
    },
  });
}
