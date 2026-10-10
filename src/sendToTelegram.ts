import { Telegram } from "telegraf";

const telegram = new Telegram(process.env.TELEGRAM_BOT_TOKEN!);
const chatId = process.env.TELEGRAM_CHAT_ID!;

// Звичайний текст без розмітки — щоб пост можна було одразу переслати або скопіювати.
export async function sendToTelegram(text: string): Promise<void> {
  await telegram.sendMessage(chatId, text, {
    link_preview_options: { is_disabled: true },
  });
}
