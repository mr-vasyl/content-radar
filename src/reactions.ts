// 👍 Реакції власника на пости в боті. Забираємо їх на початку кожного запуску через getUpdates
// (вебхука немає — бот не працює постійно). Telegram зберігає непрочитані оновлення ~24 год,
// а запуски в нас кожні 2 години, тож нічого не губиться.
import { prisma } from "./db.ts";
import { LIKE, telegram } from "./sendToTelegram.ts";

const OFFSET_KEY = "telegram_update_offset";
const LIKED = "liked";

export async function pollReactions(): Promise<void> {
  const state = await prisma.botState.findUnique({ where: { key: OFFSET_KEY } });
  let offset = state ? Number(state.value) : 0;
  let total = 0;

  for (;;) {
    const updates = await telegram.getUpdates(0, 100, offset, ["message_reaction", "callback_query"]);
    if (updates.length === 0) break;

    for (const u of updates) {
      offset = u.update_id + 1;
      // 👍-кнопка під постом (2026-10-22): реакції в особистому чаті Telegram боту НЕ передає (лише в групах, де бот
      // адмін) — за 10 днів не записалось жодної. Натискання кнопки передає.
      if ("callback_query" in u && "data" in u.callback_query && u.callback_query.data === LIKE && u.callback_query.message) {
        const m = u.callback_query.message;
        const res = await prisma.sentMessage.updateMany({
          where: { messageId: m.message_id },
          data: { reaction: "👍", reactedAt: new Date() },
        });
        total += res.count;
        // кнопка міняється на «зараховано» (із запізненням — бот прокидається за розкладом)
        await telegram
          .editMessageReplyMarkup(m.chat.id, m.message_id, undefined, { inline_keyboard: [[{ text: "👍 Зараховано", callback_data: LIKED }]] })
          .catch(() => {});
        await telegram.answerCbQuery(u.callback_query.id, "👍 Зараховано").catch(() => {}); // старі запити Telegram уже не приймає — це нормально
        continue;
      }
      if (!("message_reaction" in u)) continue;
      const r = u.message_reaction;
      // беремо останній емодзі; порожній список — реакцію зняли
      const emoji = r.new_reaction.map((x) => (x.type === "emoji" ? x.emoji : x.type)).at(-1) ?? null;
      const res = await prisma.sentMessage.updateMany({
        where: { messageId: r.message_id },
        data: { reaction: emoji, reactedAt: emoji ? new Date(r.date * 1000) : null },
      });
      total += res.count;
    }
    await prisma.botState.upsert({ where: { key: OFFSET_KEY }, update: { value: String(offset) }, create: { key: OFFSET_KEY, value: String(offset) } });
  }

  if (total) console.log(`👍 реакцій оновлено: ${total}`);
}
