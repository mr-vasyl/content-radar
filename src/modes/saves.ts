// 📌 Збережи собі: щоп'ятниці — безкоштовні ресурси й корисні можливості тижня,
// окремим постом для кожного акаунта (Creators, Tools, Knowledge).
import { prisma } from "../db.ts";
import { extractText } from "../extractText.ts";
import { writeDigest, type DigestCandidate } from "../digest.ts";
import { OPPORTUNITIES } from "../gpt.ts";
import { alreadyRan, featuredKeys, isoWeek, markFeatured, markRan } from "../formatLog.ts";
import { sendPost } from "../sendToTelegram.ts";
import { ACCOUNTS } from "../summarize.ts";
import type { Account } from "../sources.ts";
import type { RunOptions } from "./types.ts";

const DAYS = 7;
const COUNT = 6;

const AUDIENCE_LABEL: Record<Account, string> = {
  creators: "дизайнерів, фотографів, відеомейкерів, 3D-артистів, музикантів, блогерів, стрімерів і письменників",
  tools: "усіх, хто користується AI: студентів, офісних працівників, підприємців, авторів",
  knowledge: "українських креаторів, які шукають гранти й можливості",
};

// Для каналу можливостей п'ятнична добірка — «Можливості тижня»: усі відкриті гранти й конкурси з дедлайнами
const OPPORTUNITIES_TASK = () => `Ти складаєш п'ятничну добірку «Можливості тижня» для українських креаторів:
гранти, конкурси, стипендії, резиденції, open call і безкоштовні події, які канал публікував цього тижня.
Бери лише ті, де прийом ще відкритий (сьогодні ${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" })}) і є дедлайн.
У why обов'язково: для кого, скільки дають (якщо є) і дедлайн у форматі «до 4 грудня». Упорядкуй від найближчого дедлайну.
title — напр. «Гранти й конкурси, на які ще можна встигнути подати». Добірка — щоб зберегти й не пропустити.
${OPPORTUNITIES}`;

const task = (account: Account) => account === "knowledge" ? OPPORTUNITIES_TASK() : `Ти складаєш п'ятничну добірку «Збережи собі» для ${AUDIENCE_LABEL[account]} —
безкоштовні ресурси й корисні можливості тижня: шрифти, текстури, пресети, LUT-и, семпли, плагіни, шаблони,
безкоштовні програми й тарифи, курси, гранти, конкурси, безкоштовні події.
Тобі дають статті, які бот знайшов за тиждень. Бери ЛИШЕ те, що читач може взяти й використати безкоштовно
(завантажити, відкрити, встановити) або можливість, якою може скористатися (подати заявку, зареєструватися на безкоштовну подію).
НЕ бери: огляди й порівняння програм чи техніки (навіть якщо серед них є безкоштовна), нові функції платних сервісів,
списки книжок, новини компаній, аналітику, загальні поради.
Перевірка для кожного пункту: «чи може читач сьогодні щось безкоштовно отримати за посиланням?» Якщо ні — не бери,
навіть якщо пунктів вийде лише 3.
Якщо в статті кілька ресурсів, назви найкращий або узагальни («добірка з 20 безкоштовних шрифтів для заголовків»).
${OPPORTUNITIES}
Безкоштовні ресурси (шрифти, пресети, програми тощо) можуть бути з будь-якої країни — правило вище стосується лише
грантів, конкурсів, премій, подій.`;

export async function runSaves({ dryRun, send }: RunOptions): Promise<void> {
  const week = isoWeek();
  const since = new Date(Date.now() - DAYS * 86400000);

  // Лише канал можливостей («Можливості тижня») — інші два канали зупинені 2026-10-13
  for (const account of ["knowledge"] as Account[]) {
    const period = `${week}:${account}`;
    if (!dryRun && (await alreadyRan("saves", period))) {
      console.log(`📌 ${account}: за ${week} уже надіслано — пропускаю`);
      continue;
    }

    const rows = await prisma.article.findMany({
      where: {
        createdAt: { gte: since },
        account,
        // для можливостей — усе, що канал надіслав за тиждень; для інших — безкоштовні ресурси
        ...(account === "knowledge"
          ? { status: "sent" }
          : {
              OR: [
                { stream: "Безкоштовні ресурси", score: { gte: 5 } },
                { stream: "Інструкції та можливості", score: { gte: 6 } },
              ],
            }),
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

    const digest = await writeDigest(task(account), candidates, COUNT);
    if (!digest) {
      console.log(`📌 ${account}: замало ресурсів за тиждень (${candidates.length}) — пропускаю`);
      continue;
    }
    console.log(`\n📌 ${account}:\n${digest.post}\n[${digest.post.replace(/\*\*/g, "").length} символів]`);

    if (send) {
      await sendPost(
        digest.post,
        account === "knowledge"
          ? { tags: ["#гранти"], account, lines: [`💰 Можливості тижня · ${week}`, "Відкриті гранти й конкурси з дедлайнами"] }
          : { tags: ["#ресурси"], account, lines: [`📌 Збережи собі · ${week}`, "Безкоштовні ресурси й можливості тижня"] },
        dryRun ? undefined : { format: "saves", title: `Збережи собі ${week}`, account },
      );
    }
    if (!dryRun) {
      await markFeatured("saves", digest.chosen.map((c) => c.key));
      await markRan("saves", period);
    }
  }
}
