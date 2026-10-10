import "dotenv/config";
import { sources } from "./sources.ts";
import { fetchArticles, type Article } from "./fetchArticles.ts";
import { filterNew, markSeen } from "./dedup.ts";
import { prisma } from "./db.ts";

async function main() {
  const all: Article[] = [];

  for (const source of sources) {
    try {
      const articles = await fetchArticles(source);
      console.log(`${source.name}: ${articles.length} статей у стрічці`);
      all.push(...articles);
    } catch (err) {
      // одне зламане джерело не повинно зупиняти інші
      console.error(`Помилка з джерелом ${source.name}:`, err);
    }
  }

  const fresh = await filterNew(all);
  console.log(`\nНових: ${fresh.length} з ${all.length}`);

  for (const a of fresh) {
    console.log(`\n• [${a.source}] ${a.title}`);
    console.log(`  ${a.url}`);
    // тут пізніше буде: повний текст → GPT → Telegram
    await markSeen(a);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
