// Тестовий прогін без запису в базу. Зручно для налаштування промптів.
//   npm run preview [N] [send]        — новини: N останніх статей з кожного джерела (за замовч. 1)
//   npm run preview tools [send]      — 🧰 інструменти тижня
// "send" — ще й надіслати в бот.
import "dotenv/config";
import { sources } from "./sources.ts";
import { fetchArticles } from "./fetchArticles.ts";
import { ruleRejectReason } from "./ruleFilter.ts";
import { extractText } from "./extractText.ts";
import { analyze, MIN_SCORE } from "./summarize.ts";
import { sendMeta, sendToTelegram } from "./sendToTelegram.ts";
import { runTools } from "./modes/tools.ts";
import { prisma } from "./db.ts";

const MODES = { tools: runTools } as const;

const arg = process.argv[2] ?? "1";
const send = process.argv[3] === "send";

if (arg in MODES) {
  await MODES[arg as keyof typeof MODES]({ dryRun: true, send });
} else {
  await previewNews(Number(arg));
}
await prisma.$disconnect();

async function previewNews(limit: number) {
  for (const source of sources) {
    const articles = (await fetchArticles(source)).slice(0, limit);

    for (const a of articles) {
      const why = ruleRejectReason(a);
      if (why) {
        console.log(`\n✗ правила [${why}] ${a.source}: ${a.title}`);
        continue;
      }

      const fullText = await extractText(a.url);
      const r = await analyze(a, fullText);
      console.log(`\n${r.score >= MIN_SCORE ? "✓" : "·"} ${r.score}/10 [${r.account} · ${r.stream}] ${a.source}: ${a.title}`);
      console.log(`  ${r.reason}${fullText ? "" : "  (лише анонс з RSS)"}`);
      if (r.post) console.log(`\n${r.post}\n[${r.post.slice(0, r.post.lastIndexOf("\n\n")).replace(/\*\*/g, "").length} символів]`);
      if (send && r.score >= MIN_SCORE) {
        await sendMeta(a, r);
        await sendToTelegram(r.post);
      }
    }
  }
}
