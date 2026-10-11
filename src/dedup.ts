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
    storyScore: a?.story_score ?? null,
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
