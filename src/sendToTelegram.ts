import { Telegram } from "telegraf";
import { prisma } from "./db.ts";
import { CHANNELS } from "./channels.ts";
import { TEASER_END } from "./gpt.ts";
import type { Account } from "./sources.ts";

export const telegram = new Telegram(process.env.TELEGRAM_BOT_TOKEN!);
const chatId = process.env.TELEGRAM_CHAT_ID!;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// GPT пише **жирний** і _курсив_; перетворюємо на HTML Telegram.
// Спершу екрануємо все, тож будь-які інші символи з тексту не зламають розмітку.
export function toTelegramHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1<i>$2</i>");
}

export interface Footer {
  lines: string[]; // службова інфа: формат/акаунт/оцінка, назва статті…
  link?: { url: string; label: string }; // посилання на оригінал
  source?: string; // «За матеріалами: …» — під лінією
  account?: Account; // підпис каналу — над лінією
  tags?: string[]; // 1–2 хештеги — над лінією
}

// Старі пости (у скарбничці евергріну) мають «За матеріалами» прямо в тексті — прибираємо, бо тепер воно під лінією
function stripAttribution(post: string): string {
  return post.replace(/\n*_?За матеріалами:[^\n]*_?\s*$/u, "").trim();
}

function channelSignature(account: Account): string {
  const ch = CHANNELS[account];
  return ch.username ? `<a href="https://t.me/${ch.username}">${escapeHtml(ch.name)}</a>` : escapeHtml(ch.name);
}

// Що записати про пост, щоб потім зіставити з ним твою реакцію
export interface Track {
  format: "news" | "saves" | "promo" | "sell";
  title: string;
  url?: string;
  source?: string;
  account?: string;
  score?: number;
}

// Одне повідомлення:
//   текст поста
//   #хештеги
//   підпис каналу
//   ———               ← до лінії — готовий пост для каналу
//   За матеріалами: … ← після — службове для власника (оцінка, назва статті, оригінал)
// track — записати пост у SentMessage (у тестових прогонах не передаємо).
export async function sendPost(post: string, footer?: Footer, track?: Track): Promise<void> {
  let text = toTelegramHtml(stripAttribution(post));

  const tail: string[] = [];
  if (footer?.tags?.length) tail.push(escapeHtml(footer.tags.join(" ")));
  if (footer?.account) tail.push(channelSignature(footer.account));
  if (tail.length) text += `\n\n${tail.join("\n")}`;

  if (footer) {
    const meta: string[] = [];
    if (footer.source) meta.push(`За матеріалами: ${escapeHtml(footer.source)}`);
    meta.push(...footer.lines.map(escapeHtml));
    if (footer.link) meta.push(`<a href="${escapeHtml(footer.link.url)}">${escapeHtml(footer.link.label)}</a>`);
    text += `${tail.length ? "\n" : "\n\n"}———\n<i>${meta.join("\n")}</i>`;
  }
  const msg = await telegram.sendMessage(chatId, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    disable_notification: true, // власник попросив: пости без звуку
  });
  if (track) {
    await prisma.sentMessage.create({
      data: {
        messageId: msg.message_id,
        format: track.format,
        title: track.title,
        url: track.url ?? null,
        source: track.source ?? null,
        account: track.account ?? null,
        score: track.score ?? null,
      },
    });
  }
}

// 🛍 «Продавай своє»: пост із картинкою (фото + підпис). Підпис у Telegram — до 1024 символів; довший пост або
// картинка, яку Telegram не зміг завантажити, — звичайне повідомлення з прев'ю картинки над текстом.
export async function sendPhotoPost(post: string, image: string | undefined, meta: string[], track?: Track): Promise<void> {
  let text = toTelegramHtml(post);
  if (meta.length) text += `\n———\n<i>${meta.map(escapeHtml).join("\n")}</i>`;
  const plainLength = text.replace(/<[^>]+>/g, "").length;
  let msg: { message_id: number } | null = null;
  if (image && plainLength <= 1024) {
    try {
      msg = await telegram.sendPhoto(chatId, image, { caption: text, parse_mode: "HTML", disable_notification: true });
    } catch (err) {
      console.error(`Картинка не пройшла (${image}): ${(err as Error).message} — шлю текстом`);
    }
  }
  if (!msg) {
    msg = await telegram.sendMessage(chatId, text, {
      parse_mode: "HTML",
      disable_notification: true,
      link_preview_options: image ? { url: image, prefer_large_media: true, show_above_text: true } : { is_disabled: true },
    });
  }
  if (track) {
    await prisma.sentMessage.create({
      data: { messageId: msg.message_id, format: track.format, title: track.title, url: track.url ?? null, source: track.source ?? null, account: track.account ?? null, score: track.score ?? null },
    });
  }
}

// 🧵 Тизер для Threads — окремим беззвучним повідомленням під постом, текст копіюється одним дотиком.
export async function sendHook(hook: string): Promise<void> {
  let plain = hook.replace(/\*\*/g, "").trim(); // Threads розмітку не показує
  // прибираємо заклики GPT в кінці (наш, старий «Посилання — у шапці профілю», «…у нашому Telegram»)
  // і ставимо наш завжди однаково — окремим абзацом
  plain = plain.replace(/(\n+[^\n]*(шапці профілю|нашому Telegram|у Telegram)[^\n]*)+\s*$/iu, "").trim();
  plain = `${plain}\n\n${TEASER_END}`;
  await telegram.sendMessage(chatId, `🧵 <i>Для Threads</i>\n\n${escapeHtml(plain)}`, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    disable_notification: true,
  });
}
