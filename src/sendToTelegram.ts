import { Telegram } from "telegraf";
import type { Article } from "./fetchArticles.ts";
import { ACCOUNTS, type Analysis } from "./summarize.ts";

const telegram = new Telegram(process.env.TELEGRAM_BOT_TOKEN!);
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

export async function sendToTelegram(text: string): Promise<void> {
  await telegram.sendMessage(chatId, toTelegramHtml(text), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

// Картка для форматів, що не прив'язані до однієї статті (добірки, топи).
// Беззвучно — щоб пост під нею пересилався без неї.
export async function sendCard(lines: string[], link?: { url: string; label: string }): Promise<void> {
  let text = lines.map(escapeHtml).join("\n").replace(/^(.+)$/m, "<b>$1</b>");
  if (link) text += `\n<a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>`;
  await telegram.sendMessage(chatId, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    disable_notification: true,
  });
}

// Короткий гачок для Threads — окремим беззвучним повідомленням, текст копіюється одним дотиком.
export async function sendHook(hook: string): Promise<void> {
  await telegram.sendMessage(chatId, `🪝 <i>Гачок для Threads</i>\n\n${escapeHtml(hook)}`, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    disable_notification: true,
  });
}

// Службова картка над постом: оцінка, канал, потік, посилання на оригінал.
// Окремим беззвучним повідомленням — щоб пост пересилався в канал без неї.
export async function sendMeta(article: Article, a: Analysis): Promise<void> {
  const text =
    `⭐ <b>${a.score}/10</b> · ${ACCOUNTS[a.account]} · ${escapeHtml(a.stream)}\n` +
    `<i>${escapeHtml(a.reason)}</i>\n` +
    `<a href="${escapeHtml(article.url)}">Оригінал</a> · ${escapeHtml(article.source)}`;

  await telegram.sendMessage(chatId, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    disable_notification: true,
  });
}
