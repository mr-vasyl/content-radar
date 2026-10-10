import Parser from "rss-parser";
import type { Source } from "./sources.ts";

export interface Article {
  source: string;
  title: string;
  url: string;
  publishedAt: Date | null;
  content: string; // текст/опис статті з RSS, піде в GPT
}

const parser = new Parser({ timeout: 15000 });

export async function fetchArticles(source: Source): Promise<Article[]> {
  const feed = await parser.parseURL(source.url);

  return feed.items
    .filter((item) => item.link && item.title)
    .map((item) => ({
      source: source.name,
      title: item.title!.trim(),
      url: item.link!,
      publishedAt: item.isoDate ? new Date(item.isoDate) : null,
      content: (item.contentSnippet ?? item.content ?? "").trim(),
    }));
}
