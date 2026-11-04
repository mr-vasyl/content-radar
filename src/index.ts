// Точка входу. Режим береться з аргументу або змінної MODE (її передає GitHub Actions):
//   npm start              — новини (за замовчуванням)
//   npm start -- saves     — 💰 можливості тижня
//   npm start -- promo     — 🚀 пост про SkyNovix для Threads
//   npm start -- orders    — 🧾 «Замовлення для креаторів»
import "dotenv/config";
import { prisma } from "./db.ts";
import { pollReactions } from "./reactions.ts";
import { runNews } from "./modes/news.ts";
import { runSaves } from "./modes/saves.ts";
import { runPromo } from "./modes/promo.ts";
import { runSell } from "./modes/sell.ts";
import { runThreads } from "./modes/threads.ts";
import { runOrders } from "./modes/orders.ts";
import { runProstir } from "./modes/prostir.ts";

const MODES = {
  // 🧾 «Замовлення для креаторів» ВИМКНЕНО 2026-11-04 (власник: мало підписників); код лишився — `npm start -- orders`
  // 🎨 гранти, а одразу за ними — «Авторський простір» (з 2026-11-04; в одному прогоні, щоб не тратити хвилини GitHub на npm ci)
  news: async () => {
    let err: unknown = null;
    try {
      await runNews();
    } catch (e) {
      err = e;
    }
    try {
      await runProstir({ dryRun: false, send: true });
    } catch (e) {
      console.error("Авторський простір впав:", e);
      err ??= e;
    }
    if (err) throw err;
  },
  prostir: () => runProstir({ dryRun: false, send: true }), // 🎨 «Авторський простір»
  saves: () => runSaves({ dryRun: false, send: true }),
  // 🧵 з 2026-10-22 — Threads v3 (src/modes/threads.ts); стара генерація лишилась як режим promo_old
  promo: () => runThreads({ dryRun: false, send: true }),
  promo_old: () => runPromo({ dryRun: false, send: true }),
  sell: () => runSell({ dryRun: false, send: true }), // 🛍 «Продавай своє»
  orders: () => runOrders({ dryRun: false, send: true }), // 🧾 «Замовлення для креаторів»
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
