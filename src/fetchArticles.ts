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

// Деякі стрічки лишають у заголовках HTML-сутності: &#8217; &amp; &quot; …
function decodeEntities(s: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isNaN(n) ? m : String.fromCodePoint(n);
    }
    return named[code.toLowerCase()] ?? m;
  });
}

// Сайти без RSS: читаємо сторінку зі списком і беремо посилання, що відповідають шаблону.
// Дати немає (publishedAt = null) — кожне посилання оцінюється один раз, а актуальність (дедлайн) перевіряє GPT.
async function fetchPageLinks(source: Source, pattern: RegExp): Promise<Article[]> {
  const res = await fetch(source.url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Status code ${res.status}`);
  const html = await res.text();

  const byUrl = new Map<string, string>();
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string;
    try {
      url = new URL(m[1]!, source.url).toString();
    } catch {
      continue;
    }
    if (!pattern.test(url)) continue;
    const text = decodeEntities(m[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    // одне посилання буває кілька разів (картинка + заголовок) — беремо найзмістовніший текст
    if (text.length > (byUrl.get(url)?.length ?? -1)) byUrl.set(url, text);
  }

  return [...byUrl.entries()].slice(0, 40).map(([url, text]) => ({
    source: source.name,
    account: source.account,
    // якщо тексту посилання немає — назва з адреси: /grant/translation-grants → "translation grants"
    title: text.length >= 8 ? text : decodeURIComponent(url.replace(/\/$/, "").split("/").pop() ?? url).replace(/[-_]+/g, " "),
    url,
    publishedAt: null,
    content: "",
  }));
}

export async function fetchArticles(source: Source): Promise<Article[]> {
  if (source.linkPattern) return fetchPageLinks(source, source.linkPattern);
  const feed = await loadFeed(source.url);

  return feed.items
    .filter((item) => item.link && item.title)
    .map((item) => ({
      source: source.name,
      account: source.account,
      title: decodeEntities(item.title!.trim()),
      url: item.link!,
      publishedAt: item.isoDate ? new Date(item.isoDate) : null,
      content: (item.contentSnippet ?? item.content ?? "").trim(),
    }));
}
