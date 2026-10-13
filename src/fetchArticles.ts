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

// Посилання, які не є першоджерелом: картинки, соцмережі, інші Telegram-канали
const NOT_PRIMARY = /(^|\.)(t\.me|telegram\.me|i\.ibb\.co|r2\.dev|imgur\.com|youtube\.com|youtu\.be)$|instagram\.com$|facebook\.com$|tiktok\.com$|twitter\.com$|x\.com$/i;
const SHORTENERS = /^(bit\.ly|shorturl\.at|surl\.li|tinyurl\.com|cutt\.ly|t\.ly|rb\.gy|is\.gd|tiny\.cc|goo\.gl)$/i;

// Скорочене посилання → справжня адреса (fetch сам іде за редіректами)
async function resolveUrl(url: string): Promise<string> {
  try {
    if (!SHORTENERS.test(new URL(url).host.replace(/^www\./, ""))) return url;
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000) });
    return res.url || url;
  } catch {
    return url;
  }
}

// Публічний Telegram-канал як «радар»: читаємо t.me/s/<канал>, з кожного поста беремо посилання на ПЕРШОДЖЕРЕЛО
// (форма подачі, сторінка фонду). Далі звичайний конвеєр — читаємо першоджерело й пишемо СВІЙ пост.
// content = текст поста (запасний варіант, якщо першоджерело не читається — напр. Google Forms).
async function fetchTelegramChannel(source: Source): Promise<Article[]> {
  const res = await fetch(`https://t.me/s/${source.url}`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Status code ${res.status}`);
  const html = await res.text();

  const out: Article[] = [];
  for (const block of html.split('class="tgme_widget_message_wrap').slice(1)) {
    const textHtml = block.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!textHtml) continue;
    const date = block.match(/datetime="([^"]+)"/)?.[1];
    const text = decodeEntities(textHtml.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim();

    let primary: string | null = null;
    for (const m of textHtml.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
      const url = await resolveUrl(decodeEntities(m[1]!));
      try {
        if (NOT_PRIMARY.test(new URL(url).host.replace(/^www\./, ""))) continue;
      } catch {
        continue;
      }
      primary = url;
      break;
    }
    if (!primary) continue; // без посилання на першоджерело не беремо — нема що перевірити

    out.push({
      source: source.name,
      account: source.account,
      title: (text.split("\n").find((l) => l.trim().length > 10) ?? text).replace(/\s+/g, " ").trim().slice(0, 200),
      url: primary,
      publishedAt: date ? new Date(date) : null,
      content: text.slice(0, 4000),
    });
  }
  return out;
}

export async function fetchArticles(source: Source): Promise<Article[]> {
  if (source.telegram) return fetchTelegramChannel(source);
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
