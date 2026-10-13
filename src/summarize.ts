import type { Article } from "./fetchArticles.ts";
import type { ArticleLink } from "./extractText.ts";
import type { Account } from "./sources.ts";
import { askJson, AUDIENCE, HOOK_RULES, HOOK_SCORE, LANGUAGE, OPPORTUNITIES, VOICE } from "./gpt.ts";
import { TAGS, TAGS_PROMPT, TYPE_TAGS } from "./channels.ts";

// Нижче цієї оцінки пост не пишемо (економія токенів) і не надсилаємо.
export const MIN_SCORE = Number(process.env.MIN_SCORE || 7);

// Поріг каналу грантів — 6 (власник: «нижче 6 не беремо»). GPT пише пост від нього ж.
export const MIN_SCORE_BY_ACCOUNT: Record<Account, number> = { knowledge: MIN_SCORE - 1 };
export const minScoreFor = (account: Account) => MIN_SCORE_BY_ACCOUNT[account];
const WRITE_FROM = Math.min(...Object.values(MIN_SCORE_BY_ACCOUNT));

export const STREAMS = ["Гранти", "Конкурси й премії", "Резиденції", "Стипендії", "Навчання", "Події", "Інше"] as const;

export const ACCOUNTS: Record<Account, string> = { knowledge: "💰 Можливості" };

export interface Analysis {
  score: number;
  stream: (typeof STREAMS)[number];
  account: Account | "other"; // "other" — не можливість, не надсилаємо
  reason: string;
  post: string; // порожній, якщо score нижче порогу
  hook: string; // тизер для Threads; порожній, якщо score < HOOK_SCORE
  tags: string[]; // тип + професія з TAGS
  link: string; // пряме посилання на форму/сторінку можливості (лише зі статті) або ""
  deadline: string; // YYYY-MM-DD — дедлайн подачі / дата події, якщо є; інакше ""
  origin: string; // першоджерело (хто оголосив), якщо стаття — переказ; інакше ""
  // Факти про умови; рішення «підходить чи ні» приймає код, а не загальна оцінка GPT
  applicants: "individuals" | "individuals_and_orgs" | "orgs_only" | "n/a";
  creative_sector: boolean;
}

const SYSTEM_PROMPT = `${AUDIENCE}

Тобі дають статтю англійською або українською (новина, анонс, пост з Telegram-каналу про гранти).

0. Визнач account: "knowledge", якщо стаття — про конкретну МОЖЛИВІСТЬ (грант, конкурс, премію, стипендію, резиденцію,
open call, програму навчання чи менторства, безкоштовну подію) для людей з креативної сфери; інакше "other"
(звичайна новина, інтерв'ю, огляд, підсумки, релізи, номінанти, кадрові новини — це "other").

1. ОЦІНИ від 1 до 10, наскільки ця можливість варта поста:
- реальна відкрита можливість з умовами й дедлайном, куди людина може подати заявку чи зареєструватися;
- корисна: гроші, резиденція, навчання, помітність; що більша цінність і ширше коло тих, хто може подати, — то вище;
- конкретика: є суми, умови, дедлайн, як подати.
${OPPORTUNITIES}
Шкала: 9–10 — велика відкрита можливість для багатьох митців; 7–8 — корисна; 6 — нормальна, але вузька;
нижче 6 — слабко або не для нас. Для "other" — 1–3.

stream — тип: ${STREAMS.join(", ")}.
link — пряме посилання на форму подачі чи сторінку можливості (сайт фонду, форма, положення конкурсу),
ТІЛЬКИ зі списку «Посилання зі статті» нижче тексту; якщо такого немає в списку — порожній рядок.
Не давай посилання на саму статтю чи на соцмережі.
applicants — хто може подати ЗГІДНО З УМОВАМИ:
"individuals" — окремі люди (автори, митці, перекладачі, ФОП); "individuals_and_orgs" — і люди, і організації;
"orgs_only" — лише організації (ГО, БФ, заклади, компанії, громади, ОМС); не можливість — "n/a".
applicants для відкритої події (воркшоп, лекція, конференція), куди може зареєструватися будь-хто, — "individuals".
creative_sector — true, якщо для креативної сфери (мистецтво, музика, кіно, театр, фото, дизайн, література й переклад,
медіа й контент, культура й спадщина, освітні творчі проєкти, IT/цифрові продукти, креативний бізнес);
false — охорона здоров'я, соцзахист, агро, ветерани, розвиток громад, інфраструктура тощо.
origin — ПЕРШОДЖЕРЕЛО, яке вкажемо в «За матеріалами»: якщо стаття лише передає чужу інформацію (агрегатор грантів —
ГУРТ, Простір, Grant.Market; Telegram-канал з грантами; новина з посиланням на оголошення), то назва організації чи фонду,
яка оголосила й дає гроші. Коротко, як назва: «ІЗОЛЯЦІЯ», «House of Europe», «Український інститут книги».
Якщо першоджерело ніде не назване — порожній рядок.
deadline — КІНЦЕВИЙ дедлайн подачі (для події — дата проведення; для СЕРІЇ подій чи курсу — дата ОСТАННЬОЇ сесії;
якщо кілька етапів — найпізніший, що ще стосується читача) у форматі YYYY-MM-DD, рівно як у тексті, з правильним роком.
Немає дати — порожній рядок.
reason — одне коротке речення українською (до 20 слів): чому така оцінка.
${TAGS_PROMPT}

2. Якщо оцінка ${WRITE_FROM} або вище — НАПИШИ ПОСТ (post) українською.

${VOICE}

Формат:
- від 500 до 1000 символів разом із пробілами;
- 2–4 короткі абзаци (порожній рядок між ними);
- обов'язково: що це, хто може подати, що дають (суми, якщо є), дедлайн, головні умови;
- виділи **жирним** 1–3 найголовніші речі (сума, дедлайн, назва), не цілі речення;
- можна почати з короткого жирного заголовка в один рядок;
- жодної іншої розмітки — без списків, курсиву, решіток і посилань;
- перекажи своїми словами й у своєму тоні, не копіюй речення з оригіналу;
${LANGUAGE}
Якщо оцінка нижче ${WRITE_FROM} — post порожній рядок.

3. Якщо оцінка ${HOOK_SCORE} або вище — напиши ще ${HOOK_RULES}
Якщо оцінка нижче ${HOOK_SCORE} — hook порожній рядок.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "stream", "account", "reason", "post", "hook", "tags", "link", "deadline", "origin", "applicants", "creative_sector"],
  properties: {
    score: { type: "integer", minimum: 1, maximum: 10 },
    stream: { type: "string", enum: [...STREAMS] },
    account: { type: "string", enum: ["knowledge", "other"] },
    reason: { type: "string" },
    post: { type: "string" },
    hook: { type: "string" },
    tags: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: [...TAGS] } },
    link: { type: "string" },
    deadline: { type: "string" },
    origin: { type: "string" },
    applicants: { type: "string", enum: ["individuals", "individuals_and_orgs", "orgs_only", "n/a"] },
    creative_sector: { type: "boolean" },
  },
} as const;

export async function analyze(article: Article, fullText: string | null, links: ArticleLink[] = []): Promise<Analysis> {
  const body = fullText ?? article.content;
  const linkList = links.length ? links.map((l) => `- ${l.text || "(без тексту)"} — ${l.url}`).join("\n") : "(немає)";
  const result = await askJson<Analysis>(
    SYSTEM_PROMPT,
    `Джерело: ${article.source}\nЗаголовок: ${article.title}\n\n${body}\n\nПосилання зі статті:\n${linkList}`,
    "analysis",
    SCHEMA,
  );

  // Дедлайн перевіряє КОД, а не GPT «на око»: на сторінках фондів висять торішні програми (УКФ з дедлайном 2026-01-19
  // пройшов у жовтні 2026). Минула дата — пост не пишемо і не шлемо.
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" }); // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(result.deadline ?? "") && result.deadline < today) {
    result.reason = `дедлайн минув (${result.deadline}) — ${result.reason}`;
    result.score = Math.min(result.score, 2);
    result.post = "";
    result.hook = "";
  }

  // Хто може подати і чи креативна сфера — вирішує КОД за фактами, бо загальна оцінка GPT для грантів нестабільна
  // (міні-гранти для ГО й закладів охорони здоров'я отримували то 2, то 8).
  const isOpportunity = result.tags?.some((t) => (TYPE_TAGS as readonly string[]).includes(t)) || result.applicants !== "n/a";
  if (isOpportunity && (result.applicants === "orgs_only" || result.creative_sector === false)) {
    const why = result.applicants === "orgs_only" ? "подати можуть лише організації" : "не креативна сфера";
    result.reason = `грант не для креаторів (${why}) — ${result.reason}`;
    result.score = Math.min(result.score, 2);
    result.post = "";
    result.hook = "";
  }

  // Грант/конкурс без дедлайну — це загальна сторінка програми, а не відкритий набір (House of Europe «На переклад»:
  // власник опублікував, набрав 1000 переглядів і зніс, бо незрозуміло, чи прийом відкритий). Не шлемо.
  if (isOpportunity && !/^\d{4}-\d{2}-\d{2}$/.test(result.deadline ?? "")) {
    result.reason = `грант без дедлайну — незрозуміло, чи набір відкритий — ${result.reason}`;
    result.score = Math.min(result.score, 5);
    result.post = "";
    result.hook = "";
  }

  // Посилання — лише з реальних посилань статті (GPT не повинен вигадати адресу)
  const norm = (u: string) => u.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
  const real = links.find((l) => norm(l.url) === norm(result.link ?? ""));
  result.link = real ? real.url : "";

  // GPT інколи ставить високу оцінку, але не пише пост. Раніше це валило статтю, і вона перевірялась щоразу заново —
  // тепер просто не надсилаємо (запишеться як відхилена з причиною)
  if (result.score >= WRITE_FROM && !result.post.trim()) {
    result.reason = `GPT не написав пост — ${result.reason}`;
    result.score = Math.min(result.score, WRITE_FROM - 1);
    result.hook = "";
  }
  if (result.post) result.post = result.post.trim(); // «За матеріалами» додає sendPost під лінією
  result.hook = result.score >= HOOK_SCORE ? result.hook.trim() : "";
  return result;
}
