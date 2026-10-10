// 📌 Збережи собі: щоп'ятниці — безкоштовні ресурси й корисні можливості, знайдені за тиждень.
import { prisma } from "../db.ts";
import { extractText } from "../extractText.ts";
import { writeDigest, type DigestCandidate } from "../digest.ts";
import { alreadyRan, featuredKeys, isoWeek, markFeatured, markRan } from "../formatLog.ts";
import { sendPost } from "../sendToTelegram.ts";
import type { RunOptions } from "./types.ts";

const DAYS = 7;
const COUNT = 6;

const TASK = `Ти складаєш п'ятничну добірку «Збережи собі» — безкоштовні ресурси й корисні можливості тижня:
шрифти, текстури, пресети, LUT-и, семпли, плагіни, шаблони, безкоштовні програми й тарифи, курси, гранти, конкурси.
Тобі дають статті, які бот знайшов за тиждень. Бери ЛИШЕ те, що читач може взяти й використати безкоштовно
(завантажити, відкрити, встановити) або можливість, якою може скористатися (подати заявку, зареєструватися на безкоштовну подію).
НЕ бери: огляди й порівняння програм чи техніки (навіть якщо серед них є безкоштовна), нові функції платних сервісів,
списки книжок, новини компаній, аналітику, загальні поради.
Перевірка для кожного пункту: «чи може читач сьогодні щось безкоштовно отримати за посиланням?» Якщо ні — не бери,
навіть якщо пунктів вийде лише 3.
Різні напрями — не лише одна професія.
Якщо в статті кілька ресурсів, назви найкращий або узагальни («добірка з 20 безкоштовних шрифтів для заголовків»).`;

export async function runSaves({ dryRun, send }: RunOptions): Promise<void> {
  const week = isoWeek();
  if (!dryRun && (await alreadyRan("saves", week))) {
    console.log(`📌 за ${week} уже надіслано — пропускаю`);
    return;
  }

  const since = new Date(Date.now() - DAYS * 86400000);
  const rows = await prisma.article.findMany({
    where: {
      createdAt: { gte: since },
      OR: [
        { stream: "Безкоштовні ресурси", score: { gte: 5 } },
        { stream: "Інструкції та можливості", score: { gte: 6 } },
      ],
    },
    orderBy: { score: "desc" },
    take: 20,
  });
  const seen = dryRun ? new Set<string>() : await featuredKeys("saves", rows.map((r) => `article:${r.url}`));
  const fresh = rows.filter((r) => !seen.has(`article:${r.url}`)).slice(0, 12);

  // Пост є лише в надісланих; для решти дістаємо текст статті заново
  const candidates: DigestCandidate[] = [];
  for (const r of fresh) {
    const text = r.post ?? (await extractText(r.url)) ?? r.reason ?? "";
    if (text) candidates.push({ key: `article:${r.url}`, url: r.url, source: r.source, title: r.title, text });
  }

  const digest = await writeDigest(TASK, candidates, COUNT);
  if (!digest) {
    console.log(`📌 замало ресурсів за тиждень (${candidates.length}) — пропускаю`);
    return;
  }
  console.log(`\n📌 Збережи собі:\n${digest.post}\n[${digest.post.replace(/\*\*/g, "").length} символів]`);

  if (send) {
    await sendPost(
      digest.post,
      { lines: [`📌 Збережи собі · ${week}`, "Безкоштовні ресурси й можливості тижня"] },
      dryRun ? undefined : { format: "saves", title: `Збережи собі ${week}` },
    );
  }
  if (!dryRun) {
    await markFeatured("saves", digest.chosen.map((c) => c.key));
    await markRan("saves", week);
  }
}
