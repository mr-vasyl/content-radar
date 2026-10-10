// Тестовий прогін без бази: бере кілька останніх статей з кожного джерела
// і показує, як GPT їх оцінить і що напише. Зручно для налаштування промпту.
// Запуск: npm run preview [кількість з джерела]        — лише в консоль
//         npm run preview [кількість з джерела] send   — ще й надіслати в бот (те, що пройшло поріг)
import "dotenv/config";
import { sources } from "./sources.ts";
import { fetchArticles } from "./fetchArticles.ts";
import { ruleRejectReason } from "./ruleFilter.ts";
import { extractText } from "./extractText.ts";
import { analyze, MIN_SCORE } from "./summarize.ts";
import { sendMeta, sendToTelegram } from "./sendToTelegram.ts";

const limit = Number(process.argv[2] ?? 1);
const send = process.argv[3] === "send";

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
    if (r.post) console.log(`\n${r.post}`);
    if (send && r.score >= MIN_SCORE) {
      await sendMeta(a, r);
      await sendToTelegram(r.post);
    }
  }
}
