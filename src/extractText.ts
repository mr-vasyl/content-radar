import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";

const MAX_CHARS = 12000; // довгі лонгріди обрізаємо, щоб не палити токени
const MAX_LINKS = 30;

export interface ArticleLink {
  url: string;
  text: string;
}

export interface Extracted {
  text: string;
  links: ArticleLink[]; // посилання з тексту статті — щоб GPT міг дати пряме посилання на інструмент
  image?: string; // головна картинка статті (og:image / twitter:image) — для постів «Продавай своє»
}

// Дістає основний текст статті і посилання з нього. null — якщо сайт не віддав або не вдалось розпарсити.
export async function extractArticle(url: string): Promise<Extracted | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ContentRadar/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 403) return extractViaReader(url); // сайт блокує сервери GitHub
    if (!res.ok) return null;

    const html = await res.text();
    // VirtualConsole без підписки глушить шум jsdom про CSS, який він не вміє парсити
    const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
    let text: string | undefined;
    const links: ArticleLink[] = [];
    let image: string | undefined;
    try {
      const og = dom.window.document
        .querySelector('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"], meta[property="twitter:image"]')
        ?.getAttribute("content");
      if (og) {
        try {
          image = new URL(og, url).toString();
        } catch {
          /* кривий URL картинки — без неї */
        }
      }
      const parsed = new Readability(dom.window.document).parse();
      text = parsed?.textContent?.trim();
      if (parsed?.content) {
        // Readability повертає очищений HTML статті — беремо посилання саме з тексту, без меню й реклами
        const body = new JSDOM(parsed.content, { url, virtualConsole: new VirtualConsole() });
        try {
          const seen = new Set<string>();
          const articleHost = new URL(url).host;
          for (const a of body.window.document.querySelectorAll("a[href]")) {
            const href = (a as HTMLAnchorElement).href;
            if (!/^https?:/.test(href) || seen.has(href)) continue;
            if (/(twitter|x|facebook|instagram|linkedin|threads|tiktok)\.com\/|\/share|mailto:/i.test(href)) continue;
            // службові посилання: захист пошти Cloudflare, вхід/реєстрація, кошик, підписка на розсилку
            if (/cdn-cgi|email-protection|\/(login|signin|sign-in|register|signup|cart|checkout|subscribe|unsubscribe|wp-login)\b|javascript:|^tel:/i.test(href)) continue;
            seen.add(href);
            links.push({ url: href, text: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80) });
          }
          // спершу зовнішні (сайти інструментів), потім внутрішні
          links.sort((x, y) => Number(new URL(x.url).host === articleHost) - Number(new URL(y.url).host === articleHost));
        } finally {
          body.window.close();
        }
      }
    } finally {
      dom.window.close(); // інакше jsdom тримає процес живим
    }

    if (!text || text.length < 300) return null;
    return { text: text.replace(/\s+/g, " ").slice(0, MAX_CHARS), links: links.slice(0, MAX_LINKS), image };
  } catch {
    return null;
  }
}

// Запасний шлях для сайтів, що блокують сервери GitHub: Jina Reader віддає статтю як Markdown
async function extractViaReader(url: string): Promise<Extracted | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, { signal: AbortSignal.timeout(40000) });
    if (!res.ok) return null;
    const md = await res.text();
    if (/Just a moment|security verification/i.test(md)) return null; // перевірка Cloudflare — не пройшли
    const host = new URL(url).host;
    const links: ArticleLink[] = [];
    const seen = new Set<string>();
    for (const m of md.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
      const href = m[2]!;
      if (seen.has(href) || /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(href)) continue;
      if (/(twitter|x|facebook|instagram|linkedin|threads|tiktok)\.com\/|\/share|cdn-cgi/i.test(href)) continue;
      seen.add(href);
      links.push({ url: href, text: m[1]!.replace(/\s+/g, " ").trim().slice(0, 80) });
    }
    links.sort((x, y) => Number(new URL(x.url).host === host) - Number(new URL(y.url).host === host));
    const text = md.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();
    if (text.length < 300) return null;
    return { text: text.slice(0, MAX_CHARS), links: links.slice(0, MAX_LINKS) };
  } catch {
    return null;
  }
}

// Лише текст — для місць, де посилання не потрібні
export async function extractText(url: string): Promise<string | null> {
  return (await extractArticle(url))?.text ?? null;
}
