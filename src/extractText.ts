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
}

// Дістає основний текст статті і посилання з нього. null — якщо сайт не віддав або не вдалось розпарсити.
export async function extractArticle(url: string): Promise<Extracted | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ContentRadar/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    // VirtualConsole без підписки глушить шум jsdom про CSS, який він не вміє парсити
    const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
    let text: string | undefined;
    const links: ArticleLink[] = [];
    try {
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
    return { text: text.replace(/\s+/g, " ").slice(0, MAX_CHARS), links: links.slice(0, MAX_LINKS) };
  } catch {
    return null;
  }
}

// Лише текст — для місць, де посилання не потрібні
export async function extractText(url: string): Promise<string | null> {
  return (await extractArticle(url))?.text ?? null;
}
