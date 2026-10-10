import { prisma } from "./db.ts";
import type { Article } from "./fetchArticles.ts";

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

// Позначає статтю як оброблену, щоб наступний запуск її пропустив.
export async function markSeen(article: Article): Promise<void> {
  await prisma.article.upsert({
    where: { url: article.url },
    update: {},
    create: {
      url: article.url,
      title: article.title,
      source: article.source,
      publishedAt: article.publishedAt,
    },
  });
}
