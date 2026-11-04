import { Telegram } from "telegraf";
import { prisma } from "./db.ts";
import { CHANNELS } from "./channels.ts";
import type { Account } from "./sources.ts";
import { shortenPost, type Illustration } from "./postImage.ts";

export const telegram = new Telegram(process.env.TELEGRAM_BOT_TOKEN!);
// 🧵 Окремий бот для постів SkyNovix (власник 2026-10-22). Немає токена — пости йдуть у головний бот.
// У SentMessage його повідомлення пишемо з МІНУСОМ (messageId = -id): у двох ботів номери повідомлень можуть збігатися.
export const telegramSky = process.env.TELEGRAM_BOT_TOKEN_SKYNOVIX ? new Telegram(process.env.TELEGRAM_BOT_TOKEN_SKYNOVIX) : null;
// 🎨 «Авторський простір» — окремий бот (власник 2026-11-04). Немає токена — пости йдуть у головний бот.
export const telegramProstir = process.env.TELEGRAM_BOT_TOKEN_PROSTIR ? new Telegram(process.env.TELEGRAM_BOT_TOKEN_PROSTIR.trim()) : null;
const botFor = (account?: string) => (account === "prostir" && telegramProstir) || telegram;
const chatId = process.env.TELEGRAM_CHAT_ID!;

// 👍-кнопка під кожним постом, який записуємо для статистики (обробляє pollReactions у reactions.ts)
export const LIKE = "like";
const likeKeyboard = { inline_keyboard: [[{ text: "👍 Зайшло", callback_data: LIKE }]] };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// GPT пише **жирний** і _курсив_; перетворюємо на HTML Telegram.
// Спершу екрануємо все, тож будь-які інші символи з тексту не зламають розмітку.
export function toTelegramHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1<i>$2</i>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>'); // [слово](url) → сховане посилання
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
  format: "news" | "saves" | "promo" | "sell" | "orders";
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

  const meta: string[] = [];
  if (footer?.source) meta.push(`За матеріалами: ${escapeHtml(footer.source)}`);
  meta.push(...(footer?.lines ?? []).map(escapeHtml));
  if (footer?.link) meta.push(`<a href="${escapeHtml(footer.link.url)}">${escapeHtml(footer.link.label)}</a>`);
  if (meta.length) text += `${tail.length ? "\n" : "\n\n"}———\n<i>${meta.join("\n")}</i>`;
  const msg = await botFor(footer?.account).sendMessage(chatId, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    disable_notification: true, // власник попросив: пости без звуку
    ...(track ? { reply_markup: likeKeyboard } : {}),
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

// 🖼 Пост із картинкою (власник 2026-11-04): фото + підпис = готовий пост (текст, хештеги, підпис каналу) — власник
// ПЕРЕСИЛАЄ його в канал з прихованим відправником. Службового повідомлення під ним НЕМАЄ (власник: «таке не надсилай»).
// Підпис до фото — до 1024 символів: довший пост скорочуємо (shortenPost), не влізло — звичайний текстовий пост.
export async function sendImagePost(post: string, ill: Illustration | null, footer: Footer): Promise<void> {
  const clean: Footer = { lines: [], tags: footer.tags, account: footer.account };
  if (!ill) return sendPost(post, clean);
  const body = (p: string) => {
    let t = toTelegramHtml(stripAttribution(p));
    const tail: string[] = [];
    if (footer.tags?.length) tail.push(escapeHtml(footer.tags.join(" ")));
    if (footer.account) tail.push(channelSignature(footer.account));
    return tail.length ? `${t}\n\n${tail.join("\n")}` : t;
  };
  const visible = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt);/g, "x").length;
  let caption = body(post);
  if (visible(caption) > 1024) caption = body(await shortenPost(post, 1024 - (visible(caption) - visible(toTelegramHtml(post))) - 40));
  if (visible(caption) > 1024) return sendPost(post, clean);
  await botFor(footer.account).sendPhoto(chatId, { source: ill.image }, { caption, parse_mode: "HTML", disable_notification: true });
}

// 🛍 «Продавай своє»: пост із картинкою (фото + підпис). Підпис у Telegram — до 1024 символів; довший пост або
// картинка, яку Telegram не зміг завантажити, — звичайне повідомлення з прев'ю картинки над текстом.
// tailHtml — готовий HTML після поста (посилання, вшиті в слова). meta — службове: окремим повідомленням ПІД постом
// (власник 2026-10-21: у самому пості після посилання нічого не має бути).
// bot — через якого бота слати (telegramSky — пости SkyNovix); якщо окремий бот не зміг — шлемо через головний
export async function sendPhotoPost(post: string, image: string | undefined, meta: string[], track?: Track, tailHtml = "", bot: Telegram = telegram): Promise<void> {
  try {
    await sendPhotoPostVia(bot, post, image, meta, track, tailHtml);
  } catch (err) {
    if (bot === telegram) throw err;
    console.error(`Окремий бот не надіслав (${(err as Error).message}) — шлю через головний`);
    await sendPhotoPostVia(telegram, post, image, meta, track, tailHtml);
  }
}

async function sendPhotoPostVia(bot: Telegram, post: string, image: string | undefined, meta: string[], track: Track | undefined, tailHtml: string): Promise<void> {
  const text = toTelegramHtml(post) + tailHtml;
  const plainLength = text.replace(/<[^>]+>/g, "").length;
  let msg: { message_id: number } | null = null;
  // без службового повідомлення (бот SkyNovix, власник 2026-10-22) — 👍-кнопка прямо під постом
  const keyboard = track && !meta.length ? { reply_markup: likeKeyboard } : {};
  if (image && plainLength <= 1024) {
    try {
      msg = await bot.sendPhoto(chatId, image, { caption: text, parse_mode: "HTML", disable_notification: true, ...keyboard });
    } catch (err) {
      console.error(`Картинка не пройшла (${image}): ${(err as Error).message} — шлю текстом`);
    }
  }
  if (!msg) {
    msg = await bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      disable_notification: true,
      link_preview_options: image ? { url: image, prefer_large_media: true, show_above_text: true } : { is_disabled: true },
      ...keyboard,
    });
  }
  // 👍-кнопка — на службовому повідомленні під постом, щоб сам пост пересилався в канал чистим
  if (meta.length) {
    const metaMsg = await bot.sendMessage(chatId, `<i>${meta.map(escapeHtml).join("\n")}</i>`, {
      parse_mode: "HTML",
      disable_notification: true,
      reply_parameters: { message_id: msg.message_id },
      ...(track ? { reply_markup: likeKeyboard } : {}),
    });
    msg = metaMsg; // лайк прийде з цього повідомлення — під його id і записуємо
  }
  if (track) {
    await prisma.sentMessage.create({
      data: { messageId: bot === telegram ? msg.message_id : -msg.message_id, format: track.format, title: track.title, url: track.url ?? null, source: track.source ?? null, account: track.account ?? null, score: track.score ?? null },
    });
  }
}

// 🧵 Тизер для Threads — окремим беззвучним повідомленням під постом, текст копіюється одним дотиком.
// Власник 2026-11-04: Threads ріже перегляди постам, що ведуть з платформи — БЕЗ «у нашому Telegram», «лінк у шапці»;
// кінцівку-заклик до коментарів пише GPT (prostirTeaser). track — 👍-кнопка й запис у SentMessage (лише головний бот).
export async function sendHook(hook: string, account?: string, track?: Track): Promise<void> {
  let plain = hook.replace(/\*\*/g, "").trim(); // Threads розмітку не показує
  // рядки з закликом піти в Telegram / профіль — геть
  plain = plain.split("\n").filter((l) => !/telegram|телеграм|шапц|профіл|посиланн/iu.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // власник 2026-10-29: без смайликів у тексті й без заголовка «Для Threads» — повідомлення копіюється як є
  plain = plain.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]️?/gu, "").replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?])/g, "$1").replace(/^ +| +$/gm, "");
  const bot = botFor(account);
  const keep = track && bot === telegram;
  const msg = await bot.sendMessage(chatId, escapeHtml(plain), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    disable_notification: true,
    ...(keep ? { reply_markup: likeKeyboard } : {}),
  });
  if (keep) {
    await prisma.sentMessage.create({
      data: { messageId: msg.message_id, format: track.format, title: track.title, url: track.url ?? null, source: track.source ?? null, account: track.account ?? null, score: track.score ?? null },
    });
  }
}
