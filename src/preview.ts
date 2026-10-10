// Тестовий прогін без бази: бере кілька останніх статей і показує, що з них зробить GPT.
// Зручно для налаштування промпту. Запуск: npm run preview [кількість]
import "dotenv/config";
import { sources } from "./sources.ts";
import { fetchArticles } from "./fetchArticles.ts";
import { extractText } from "./extractText.ts";
import { summarize } from "./summarize.ts";

const limit = Number(process.argv[2] ?? 3);

for (const source of sources) {
  const articles = (await fetchArticles(source)).slice(0, limit);

  for (const a of articles) {
    const fullText = await extractText(a.url);
    console.log(`\n──── ${a.title}`);
    console.log(`текст: ${fullText ? `${fullText.length} символів зі сторінки` : "лише анонс з RSS"}\n`);
    const post = await summarize(a, fullText);
    console.log(post);
    console.log(`\n[${post.split("\n\n")[0]!.length} символів без підпису]`);
  }
}
