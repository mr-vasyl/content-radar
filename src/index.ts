// Точка входу. Режим береться з аргументу або змінної MODE (її передає GitHub Actions):
//   npm start              — новини (за замовчуванням)
//   npm start -- tools     — 🧰 інструменти тижня
//   npm start -- story     — 🔥 вау-історія тижня
//   npm start -- saves     — 📌 збережи собі
import "dotenv/config";
import { prisma } from "./db.ts";
import { runNews } from "./modes/news.ts";
import { runTools } from "./modes/tools.ts";
import { runStory } from "./modes/story.ts";
import { runSaves } from "./modes/saves.ts";

const MODES = {
  news: () => runNews(),
  tools: () => runTools({ dryRun: false, send: true }),
  story: () => runStory({ dryRun: false, send: true }),
  saves: () => runSaves({ dryRun: false, send: true }),
} as const;

const mode = (process.argv[2] || process.env.MODE || "news") as keyof typeof MODES;

async function main() {
  const run = MODES[mode];
  if (!run) throw new Error(`Невідомий режим "${mode}". Доступні: ${Object.keys(MODES).join(", ")}`);
  console.log(`Режим: ${mode}`);
  await run();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
