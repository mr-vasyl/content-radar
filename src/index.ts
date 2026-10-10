import "dotenv/config";
import { sources } from "./sources.ts";
import { fetchArticles } from "./fetchArticles.ts";

async function main() {
  for (const source of sources) {
    try {
      const articles = await fetchArticles(source);
      console.log(`\n=== ${source.name}: ${articles.length} статей ===`);

      for (const a of articles) {
        console.log(`\n• ${a.title}`);
        console.log(`  ${a.url}`);
        console.log(`  ${a.publishedAt?.toISOString() ?? "без дати"} | ${a.content.length} символів`);
      }
    } catch (err) {
      // одне зламане джерело не повинно зупиняти інші
      console.error(`Помилка з джерелом ${source.name}:`, err);
    }
  }
}

main();
