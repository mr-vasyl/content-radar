import { Telegram } from "telegraf";

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

export interface Footer {
  lines: string[]; // службова інфа: формат/акаунт/оцінка, назва статті…
  link?: { url: string; label: string }; // посилання на оригінал
}

// Одне повідомлення: зверху пост, під рискою — службовий підпис (акаунт, оцінка, назва, джерело).
// Пост копіюється до риски; при пересиланні підпис піде разом із постом.
export async function sendPost(post: string, footer?: Footer): Promise<void> {
  let text = toTelegramHtml(post);
  if (footer) {
    const meta = footer.lines.map(escapeHtml);
    if (footer.link) meta.push(`<a href="${escapeHtml(footer.link.url)}">${escapeHtml(footer.link.label)}</a>`);
    text += `\n\n———\n<i>${meta.join("\n")}</i>`;
  }
  await telegram.sendMessage(chatId, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

// Короткий гачок для Threads — окремим беззвучним повідомленням, текст копіюється одним дотиком.
export async function sendHook(hook: string): Promise<void> {
  const plain = hook.replace(/\*\*/g, "").trim(); // Threads розмітку не показує
  await telegram.sendMessage(chatId, `🪝 <i>Гачок для Threads</i>\n\n${escapeHtml(plain)}`, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    disable_notification: true,
  });
}
