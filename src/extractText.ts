import { Readability } from "@mozilla/readability";
import { JSDOM, VirtualConsole } from "jsdom";

const MAX_CHARS = 12000; // довгі лонгріди обрізаємо, щоб не палити токени

// Дістає основний текст статті зі сторінки. null — якщо сайт не віддав або не вдалось розпарсити.
export async function extractText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ContentRadar/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    // VirtualConsole без підписки глушить шум jsdom про CSS, який він не вміє парсити
    const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
    const text = new Readability(dom.window.document).parse()?.textContent?.trim();

    if (!text || text.length < 300) return null;
    return text.replace(/\s+/g, " ").slice(0, MAX_CHARS);
  } catch {
    return null;
  }
}
