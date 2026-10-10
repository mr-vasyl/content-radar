import Parser from "rss-parser";
import type { Account, Source } from "./sources.ts";

export interface Article {
  source: string;
  account: Account;
  title: string;
  url: string;
  publishedAt: Date | null;
  content: string; // текст/опис статті з RSS, піде в GPT
}

const parser = new Parser();

// Качаємо самі через fetch, а не parser.parseURL: fetch розпаковує gzip
// і шле нормальні заголовки — деякі сайти без цього віддають 406 або "сміття".
export async function loadFeed(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ContentRadar/1.0)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Status code ${res.status}`);
  return parser.parseString(await res.text());
}

export async function fetchArticles(source: Source): Promise<Article[]> {
  const feed = await loadFeed(source.url);

  return feed.items
    .filter((item) => item.link && item.title)
    .map((item) => ({
      source: source.name,
      account: source.account,
      title: item.title!.trim(),
      url: item.link!,
      publishedAt: item.isoDate ? new Date(item.isoDate) : null,
      content: (item.contentSnippet ?? item.content ?? "").trim(),
    }));
}
