// 🔥 Вау-історія тижня: для кожного акаунта — найсильніша історія (герой, цифри, поворот) зі статей за 7 днів.
import { prisma } from "../db.ts";
import { askJson, AUDIENCE, CLEAR_START, LANGUAGE } from "../gpt.ts";
import { extractText } from "../extractText.ts";
import { alreadyRan, featuredKeys, isoWeek, markFeatured, markRan } from "../formatLog.ts";
import { sendHook, sendPost } from "../sendToTelegram.ts";
import { ACCOUNTS } from "../summarize.ts";
import type { Account } from "../sources.ts";
import type { RunOptions } from "./types.ts";

const MIN_STORY = 6;
const DAYS = 7;

const SYSTEM_PROMPT = `${AUDIENCE}

Тобі дають статтю, у якій є історія: герой, цифри, поворот. Перекажи її українською як захопливу історію для Threads/Telegram.

Будова:
- перший рядок — гачок, через який неможливо не дочитати: найнесподіваніший факт, цифра або контраст
  («один ролик на день і 4 мільйони підписників за рік»), без заголовка, без «Сьогодні розповім…»;
  гачок має бути зрозумілим без контексту — простими словами, хто і що зробив;
${CLEAR_START}
- далі коротко, хто герой і з чого все почалось;
- потім як розвивались події — з конкретними цифрами, рішеннями, помилками, поворотом;
- наприкінці — що з цього може забрати собі автор (1–2 речення, без моралізаторства).

Стиль:
- живо, як блогер розповідає друзям; короткі речення; на «ви» до читачів, коли звертаєшся;
- 4–6 коротких абзаців (порожній рядок між ними), 800–1500 символів — не більше 1500, обирай лише найсильніші деталі;
- без сленгу-калік («офлайннулися», «зафейлився») — звичайні українські слова;
- **жирним** — 2–4 ключові цифри чи повороти, не цілі речення; жодної іншої розмітки, без списків і посилань;
- максимум 1–2 емодзі або без них;
- не вигадуй особистий досвід і нічого, чого немає в тексті; якщо деталі немає — просто не згадуй її.
${LANGUAGE}

Окремо напиши hook — короткий самостійний пост-гачок для Threads (до 280 символів): одна чіпка думка або питання,
що інтригує й змушує зайти в профіль; можна маленькими літерами в розмовному стилі; без хештегів і посилань.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["story", "hook"],
  properties: { story: { type: "string" }, hook: { type: "string" } },
} as const;

export async function runStory({ dryRun, send }: RunOptions): Promise<void> {
  const week = isoWeek();
  const since = new Date(Date.now() - DAYS * 86400000);

  for (const account of Object.keys(ACCOUNTS) as Account[]) {
    const period = `${week}:${account}`;
    if (!dryRun && (await alreadyRan("story", period))) {
      console.log(`🔥 ${account}: за ${week} уже надіслано — пропускаю`);
      continue;
    }

    // Кандидати: висока "історійна" оцінка. Для статей, оцінених до появи storyScore, — запасний критерій: кейси авторів.
    const rows = await prisma.article.findMany({
      where: {
        createdAt: { gte: since },
        account,
        OR: [
          { storyScore: { gte: MIN_STORY } },
          { storyScore: null, stream: "Кейси авторів", score: { gte: 5 } },
        ],
      },
      orderBy: [{ storyScore: { sort: "desc", nulls: "last" } }, { score: "desc" }],
      take: 10,
    });
    const seen = dryRun ? new Set<string>() : await featuredKeys("story", rows.map((r) => `article:${r.url}`));
    const candidates = rows.filter((r) => !seen.has(`article:${r.url}`));

    // Беремо першу, з якої вдається дістати повний текст — історії без деталей не буває
    let picked: { row: (typeof rows)[number]; text: string } | null = null;
    for (const row of candidates.slice(0, 3)) {
      const text = await extractText(row.url);
      if (text) {
        picked = { row, text };
        break;
      }
    }
    if (!picked) {
      console.log(`🔥 ${account}: немає підходящої історії за ${DAYS} днів — пропускаю`);
      continue;
    }

    const { row, text } = picked;
    const out = await askJson<{ story: string; hook: string }>(
      SYSTEM_PROMPT,
      `Джерело: ${row.source}\nЗаголовок: ${row.title}\n\n${text}`,
      "story",
      SCHEMA,
    );
    const story = `${out.story.trim()}\n\n_За матеріалами: ${row.source}_`;
    console.log(`\n🔥 ${account} (story ${row.storyScore ?? "—"}/10, score ${row.score}/10) ${row.title}\n\n${story}\n\n🪝 ${out.hook}`);

    if (send) {
      await sendPost(story, {
        lines: [`🔥 Вау-історія · ${ACCOUNTS[account]} · історія ${row.storyScore ?? "—"}/10`, row.title],
        link: { url: row.url, label: `Оригінал · ${row.source}` },
      });
      await sendHook(out.hook.trim());
    }
    if (!dryRun) {
      await markFeatured("story", [`article:${row.url}`]);
      await markRan("story", period);
    }
  }
}
