import "dotenv/config";
import { sources } from "./sources.ts";
import { fetchArticles, type Article } from "./fetchArticles.ts";
import { filterNew, markSeen } from "./dedup.ts";
import { extractText } from "./extractText.ts";
import { summarize } from "./summarize.ts";
import { sendToTelegram } from "./sendToTelegram.ts";
import { prisma } from "./db.ts";

// Не більше стількох постів за один запуск — щоб нове джерело не завалило бота
// всім своїм архівом. Решта прийде наступними запусками.
const MAX_PER_RUN = 15;

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
  // від старіших до новіших, щоб у чаті йшли по порядку
  fresh.sort((a, b) => (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0));
  const batch = fresh.slice(-MAX_PER_RUN);
  console.log(`\nНових: ${fresh.length} з ${all.length}, відправляю ${batch.length}`);

  let sent = 0;
  for (const a of batch) {
    try {
      const fullText = await extractText(a.url);
      const post = await summarize(a, fullText);
      await sendToTelegram(post);
      await markSeen(a); // тільки після успішної відправки
      sent++;
      console.log(`✓ ${a.title}`);
    } catch (err) {
      // не позначаємо — спробуємо ще раз наступного запуску
      console.error(`✗ ${a.title}:`, err);
    }
  }

  // старіші, що не влізли в ліміт, просто позначаємо — їх уже не наздогнати
  for (const a of fresh.slice(0, -MAX_PER_RUN)) await markSeen(a);

  console.log(`\nВідправлено: ${sent}/${batch.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
