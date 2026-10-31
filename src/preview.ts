// Тестовий прогін без запису в базу. Зручно для налаштування промптів.
//   npm run preview [N] [send]        — новини: N останніх статей з кожного джерела (за замовч. 1)
//   npm run preview saves [send]      — 📌 збережи собі
//   npm run preview orders [send]     — 🧾 «Замовлення для креаторів» (ORDERS_LIMIT=10 — скільки оцінити)
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
import { runSaves } from "./modes/saves.ts";
import { runPromo } from "./modes/promo.ts";
import { runOrders } from "./modes/orders.ts";
import { prisma } from "./db.ts";

const MODES = { saves: runSaves, promo: runPromo, orders: runOrders } as const;

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
      const ok = r.account === "knowledge" && r.score >= minScoreFor(r.account);
      if (r.post) r.post = withToolLink(r.post, r.link);
      console.log(`\n${ok ? "✓" : "·"} ${r.score}/10 [${r.account} · ${r.stream}] ${a.source}: ${a.title}`);
      console.log(`  ${r.reason}${fullText ? "" : "  (лише анонс з RSS)"}`);
      if (r.post) console.log(`\n${r.post}\n[${r.post.slice(0, r.post.lastIndexOf("\n\n")).replace(/\*\*/g, "").length} символів]`);
      if (r.hook) console.log(`\n🪝 ${r.hook}`);
      if (send && ok && r.account === "knowledge") {
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
