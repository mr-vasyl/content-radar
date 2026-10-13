// Точка входу. Режим береться з аргументу або змінної MODE (її передає GitHub Actions):
//   npm start              — новини (за замовчуванням)
//   npm start -- saves     — 📌 збережи собі
import "dotenv/config";
import { prisma } from "./db.ts";
import { pollReactions } from "./reactions.ts";
import { runNews } from "./modes/news.ts";
import { runSaves } from "./modes/saves.ts";

const MODES = {
  news: () => runNews(),
  saves: () => runSaves({ dryRun: false, send: true }),
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
