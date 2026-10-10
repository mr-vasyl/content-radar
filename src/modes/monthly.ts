// 📅 Топ місяця: 1-го числа — найкращі знахідки попереднього місяця, окремо для кожного акаунта.
import { prisma } from "../db.ts";
import { writeDigest, type DigestCandidate } from "../digest.ts";
import { alreadyRan, markRan } from "../formatLog.ts";
import { sendCard, sendToTelegram } from "../sendToTelegram.ts";
import { ACCOUNTS } from "../summarize.ts";
import type { Account } from "../sources.ts";
import type { RunOptions } from "./types.ts";

const COUNT = 6;
const AUDIENCE_LABEL: Record<Account, string> = {
  creators: "дизайнери, фотографи, відеомейкери, музиканти, блогери, стрімери",
  tools: "розробники, AI-креатори, інді-розробники ігор",
  knowledge: "письменники, автори розсилок, курсів і освітнього контенту",
};
const MONTHS_GEN = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];

// Попередній календарний місяць за Києвом (запускаємо 1-го числа)
function previousMonth(now = new Date()) {
  const kyiv = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Kyiv" }));
  const start = new Date(Date.UTC(kyiv.getFullYear(), kyiv.getMonth() - 1, 1));
  const end = new Date(Date.UTC(kyiv.getFullYear(), kyiv.getMonth(), 1));
  const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, label, name: MONTHS_GEN[start.getUTCMonth()]! };
}

export async function runMonthly({ dryRun, send }: RunOptions): Promise<void> {
  // У тестовому прогоні беремо останні 30 днів — щоб було що показати навіть на початку місяця
  const month = dryRun
    ? { start: new Date(Date.now() - 30 * 86400000), end: new Date(), label: "test", name: "останніх 30 днів" }
    : previousMonth();

  for (const account of Object.keys(ACCOUNTS) as Account[]) {
    const period = `${month.label}:${account}`;
    if (!dryRun && (await alreadyRan("monthly", period))) {
      console.log(`📅 ${account}: за ${month.label} уже надіслано — пропускаю`);
      continue;
    }

    const rows = await prisma.article.findMany({
      where: { status: "sent", account, createdAt: { gte: month.start, lt: month.end } },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 15,
    });
    const candidates: DigestCandidate[] = rows.map((r) => ({
      key: `article:${r.url}`,
      url: r.url,
      source: r.source,
      title: r.title,
      text: `оцінка ${r.score}/10. ${r.post ?? r.reason ?? ""}`,
    }));

    const task = `Ти складаєш «Топ ${month.name}» — найкращі знахідки місяця для каналу, де читачі — ${AUDIENCE_LABEL[account]}.
Тобі дають пости, які вже виходили за місяць, з оцінкою. Обери найсильніші й найкорисніші — те, що варто згадати
ще раз або що читач міг пропустити. Різні теми, не кілька пунктів про одне й те саме.
У title обов'язково згадай місяць («${month.name}»).`;

    const digest = await writeDigest(task, candidates, COUNT);
    if (!digest) {
      console.log(`📅 ${account}: замало постів за ${month.name} (${candidates.length}) — пропускаю`);
      continue;
    }
    console.log(`\n📅 ${account}:\n${digest.post}\n[${digest.post.replace(/\*\*/g, "").length} символів]`);

    if (send) {
      await sendCard([`📅 Топ ${month.name} · ${ACCOUNTS[account]}`, `${digest.chosen.length} найкращих знахідок місяця`]);
      await sendToTelegram(digest.post);
    }
    if (!dryRun) await markRan("monthly", period);
  }
}
