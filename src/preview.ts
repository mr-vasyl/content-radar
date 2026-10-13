// Тестовий прогін без запису в базу. Зручно для налаштування промптів.
//   npm run preview [N] [send]        — новини: N останніх статей з кожного джерела (за замовч. 1)
//   npm run preview tools [send]      — 🧰 інструменти тижня
//   npm run preview story [send]      — 🔥 вау-історія тижня
//   npm run preview saves [send]      — 📌 збережи собі
//   npm run preview evergreen [send]  — ♻️ евергрін (у тесті — перевіряє архіви, нічого не пише в базу)
// "send" — ще й надіслати в бот.
import "dotenv/config";
import { sources } from "./sources.ts";
import { fetchArticles } from "./fetchArticles.ts";
import { ruleRejectReason } from "./ruleFilter.ts";
import { extractText } from "./extractText.ts";
import { analyze, minScoreFor } from "./summarize.ts";
import { withToolLink } from "./digest.ts";
import { extractArticle } from "./extractText.ts";
import { sendHook, sendPost } from "./sendToTelegram.ts";
import { runTools } from "./modes/tools.ts";
import { runStory } from "./modes/story.ts";
import { runSaves } from "./modes/saves.ts";
import { runEvergreen } from "./modes/evergreen.ts";
import { prisma } from "./db.ts";

const MODES = { tools: runTools, story: runStory, saves: runSaves, evergreen: runEvergreen } as const;

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
    let articles;
    try {
      articles = (await fetchArticles(source)).slice(0, limit);
    } catch (err) {
      console.error(`Помилка з джерелом ${source.name}:`, (err as Error).message);
      continue;
    }

    for (const a of articles) {
      const why = ruleRejectReason(a);
      if (why) {
        console.log(`\n✗ правила [${why}] ${a.source}: ${a.title}`);
        continue;
      }

      const ex = await extractArticle(a.url);
      const fullText = ex?.text ?? null;
      const r = await analyze(a, fullText, ex?.links);
      if (r.post) r.post = withToolLink(r.post, r.link);
      console.log(`\n${r.score >= minScoreFor(r.account) ? "✓" : "·"} ${r.score}/10 [${r.account} · ${r.stream}] ${a.source}: ${a.title}`);
      console.log(`  ${r.reason}${fullText ? "" : "  (лише анонс з RSS)"}`);
      if (r.post) console.log(`\n${r.post}\n[${r.post.slice(0, r.post.lastIndexOf("\n\n")).replace(/\*\*/g, "").length} символів]`);
      if (r.hook) console.log(`\n🪝 ${r.hook}`);
      if (send && r.score >= minScoreFor(r.account)) {
        await sendPost(r.post, {
          tags: r.tags,
          account: r.account,
          source: r.origin?.trim() || a.source,
          lines: [`📰 ⭐ ${r.score}/10 · ${r.stream}`, a.title],
          link: { url: a.url, label: "Оригінал" },
        });
        if (r.hook) await sendHook(r.hook);
      }
    }
  }
}
