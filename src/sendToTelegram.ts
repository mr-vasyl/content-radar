import { Telegram } from "telegraf";

const telegram = new Telegram(process.env.TELEGRAM_BOT_TOKEN!);
const chatId = process.env.TELEGRAM_CHAT_ID!;

// GPT пише **жирний** і _курсив_; перетворюємо на HTML Telegram.
// Спершу екрануємо все, тож будь-які інші символи з тексту не зламають розмітку.
export function toTelegramHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1<i>$2</i>");
}

export async function sendToTelegram(text: string): Promise<void> {
  await telegram.sendMessage(chatId, toTelegramHtml(text), {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}
