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
