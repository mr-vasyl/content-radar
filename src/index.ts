// Точка входу. Режим береться з аргументу або змінної MODE (її передає GitHub Actions):
//   npm start              — новини (за замовчуванням)
//   npm start -- saves     — 💰 можливості тижня
//   npm start -- promo     — 🚀 пост про SkyNovix для Threads
import "dotenv/config";
import { prisma } from "./db.ts";
import { pollReactions } from "./reactions.ts";
import { runNews } from "./modes/news.ts";
import { runSaves } from "./modes/saves.ts";
import { runPromo } from "./modes/promo.ts";
import { runSell } from "./modes/sell.ts";

const MODES = {
  news: () => runNews(),
  saves: () => runSaves({ dryRun: false, send: true }),
  promo: () => runPromo({ dryRun: false, send: true }),
  sell: () => runSell({ dryRun: false, send: true }), // 🛍 «Продавай своє»
} as const;

const mode = (process.argv[2] || process.env.MODE || "news") as keyof typeof MODES;

async function main() {
  const run = MODES[mode];
  if (!run) throw new Error(`Невідомий режим "${mode}". Доступні: ${Object.keys(MODES).join(", ")}`);
  console.log(`Режим: ${mode}`);

  // Спершу забираємо твої реакції на пости — збій тут не повинен зупиняти основну роботу
  try {
    await pollReactions();
  } catch (err) {
    console.error("Не вдалося забрати реакції:", (err as Error).message);
  }

  await run();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
