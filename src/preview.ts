// Тестовий прогін без бази: бере кілька останніх статей і показує, що з них зробить GPT.
// Зручно для налаштування промпту.
// Запуск: npm run preview [кількість]        — лише в консоль
//         npm run preview [кількість] send   — ще й надіслати в бот
import "dotenv/config";
import { sources } from "./sources.ts";
import { fetchArticles } from "./fetchArticles.ts";
import { extractText } from "./extractText.ts";
import { summarize } from "./summarize.ts";
import { sendToTelegram } from "./sendToTelegram.ts";

const limit = Number(process.argv[2] ?? 3);
const send = process.argv[3] === "send";

for (const source of sources) {
  const articles = (await fetchArticles(source)).slice(0, limit);

  for (const a of articles) {
    const fullText = await extractText(a.url);
    console.log(`\n──── ${a.title}`);
    console.log(`текст: ${fullText ? `${fullText.length} символів зі сторінки` : "лише анонс з RSS"}\n`);
    const post = await summarize(a, fullText);
    console.log(post);
    const body = post.slice(0, post.lastIndexOf("\n\n")).replace(/\*\*/g, "");
    console.log(`\n[${body.length} символів без підпису і розмітки]`);
    if (send) await sendToTelegram(post);
  }
}
