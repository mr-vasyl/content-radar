// 💰 Можливості тижня: щоп'ятниці — усі відкриті гранти й конкурси, які канал публікував за тиждень,
// одним списком від найближчого дедлайну (щоб зберегти й не пропустити).
import { prisma } from "../db.ts";
import { extractText } from "../extractText.ts";
import { writeDigest, type DigestCandidate } from "../digest.ts";
import { OPPORTUNITIES } from "../gpt.ts";
import { alreadyRan, featuredKeys, isoWeek, markFeatured, markRan } from "../formatLog.ts";
import { sendPost } from "../sendToTelegram.ts";
import type { RunOptions } from "./types.ts";

const DAYS = 7;
const COUNT = 6;

const task = () => `Ти складаєш п'ятничну добірку «Можливості тижня» для українських креаторів:
гранти, конкурси, стипендії, резиденції, open call і безкоштовні події, які канал публікував цього тижня.
Бери лише ті, де прийом ще відкритий (сьогодні ${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" })}) і є дедлайн.
У why обов'язково: для кого, скільки дають (якщо є) і дедлайн у форматі «до 4 грудня». Упорядкуй від найближчого дедлайну.
title — напр. «Гранти й конкурси, на які ще можна встигнути подати». Добірка — щоб зберегти й не пропустити.
${OPPORTUNITIES}`;

export async function runSaves({ dryRun, send }: RunOptions): Promise<void> {
  const week = isoWeek();
  const since = new Date(Date.now() - DAYS * 86400000);

  if (!dryRun && (await alreadyRan("saves", week))) {
    console.log(`💰 за ${week} уже надіслано — пропускаю`);
    return;
  }

  // Усе, що канал надіслав за тиждень
  const rows = await prisma.article.findMany({
    where: { createdAt: { gte: since }, account: "knowledge", status: "sent" },
    orderBy: { score: "desc" },
    take: 20,
  });
  const seen = dryRun ? new Set<string>() : await featuredKeys("saves", rows.map((r) => `article:${r.url}`));
  const fresh = rows.filter((r) => !seen.has(`article:${r.url}`)).slice(0, 12);

  const candidates: DigestCandidate[] = [];
  for (const r of fresh) {
    const text = r.post ?? (await extractText(r.url)) ?? r.reason ?? "";
    if (text) candidates.push({ key: `article:${r.url}`, url: r.url, source: r.source, title: r.title, text });
  }

  const digest = await writeDigest(task(), candidates, COUNT);
  if (!digest) {
    console.log(`💰 замало відкритих можливостей за тиждень (${candidates.length}) — пропускаю`);
    return;
  }
  console.log(`\n💰 Можливості тижня:\n${digest.post}\n[${digest.post.replace(/\*\*/g, "").length} символів]`);

  if (send) {
    await sendPost(
      digest.post,
      { tags: ["#гранти", "#усім"], account: "knowledge", lines: [`💰 Можливості тижня · ${week}`, "Відкриті гранти й конкурси з дедлайнами"] },
      dryRun ? undefined : { format: "saves", title: `Можливості тижня ${week}`, account: "knowledge" },
    );
  }
  if (!dryRun) {
    await markFeatured("saves", digest.chosen.map((c) => c.key));
    await markRan("saves", week);
  }
}
