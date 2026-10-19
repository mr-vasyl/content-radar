// 🤖 Канал «Створюй більше за допомогою AI» (з 2026-10-19): AI-інструменти, нові функції й практичні знахідки
// для авторів, блогерів, дизайнерів, відеомейкерів, музикантів, письменників — тих, хто монетизує контент і робить
// цифрові товари. Як і в інших каналах: GPT витягує факти, рішення приймає КОД.
import type { Article } from "./fetchArticles.ts";
import type { ArticleLink } from "./extractText.ts";
import { askJson, HOOK_RULES, HOOK_SCORE, LANGUAGE, VOICE } from "./gpt.ts";
import { AI_TAGS, AI_TAGS_PROMPT } from "./channels.ts";
import { minScoreFor, type Analysis } from "./summarize.ts";

const WRITE_FROM = minScoreFor("ai");
export const AI_STREAMS = ["Новий інструмент", "Оновлення", "Як зробити", "Безкоштовно"] as const;
const KINDS = ["new_tool", "feature_update", "how_to", "free_access", "industry_news", "research", "dev_only", "other"] as const;

const SYSTEM_PROMPT = `Ти ведеш український Telegram-канал «Створюй більше за допомогою AI 🤖» — інструменти для авторів,
блогерів, дизайнерів і відеомейкерів (а також фотографів, музикантів, письменників, викладачів, тих, хто робить
цифрові товари — шаблони, курси, пресети, книжки). Корисні сервіси, нові можливості та практичні знахідки: що можна
взяти й використати в роботі вже сьогодні, щоб робити контент швидше, краще або заробляти на ньому.

Тобі дають статтю (новина, блог, огляд, запуск продукту).

Факти, за якими КОД вирішить, чи підходить (заповнюй чесно за текстом):
kind — що це:
"new_tool" — новий AI-сервіс чи застосунок, яким можна користуватись;
"feature_update" — нова AI-функція в продукті, яким користуються автори (Photoshop, Lightroom, Premiere, CapCut, Canva,
  Figma, YouTube, Instagram, TikTok, ChatGPT, Gemini, Claude, Midjourney, Suno, ElevenLabs, Runway, Notion…);
"how_to" — практичний спосіб/інструкція, як використати AI в творчій роботі чи для заробітку на контенті;
"free_access" — інструмент чи функція стали безкоштовними або з'явився безкоштовний доступ;
"industry_news" — бізнес-новини: інвестиції, звільнення, суди, політика, угоди компаній, біржа, банкрутства;
"research" — дослідження, бенчмарки, наукові статті без продукту, який можна спробувати;
"dev_only" — для програмістів: бібліотеки, API, SDK, репозиторії GitHub, AI-асистенти для коду (Claude Code, Codex,
  Cursor, Copilot та їхні альтернативи), агенти для розробки, інфраструктура, GPU, локальні моделі;
"other" — усе інше: залізо (ноутбуки, мікрофони, камери, об'єктиви, відеокарти, світло), налаштування телефона чи ОС,
  утиліти для Mac/Windows, знижки, огляди фільмів і музики, історії, безпека, скандали — навіть якщо корисно автору.
ai_powered — true ЛИШЕ якщо головне в статті — AI: функція чи сервіс працює на штучному інтелекті (генерація, розпізнавання,
  автоматичний монтаж, AI-асистент тощо). Звичайна програма, гаджет чи налаштування без AI — false.
creator_relevant — true, якщо це реально корисно в роботі автора/блогера/дизайнера/відеомейкера/фотографа/музиканта/
письменника/творця цифрових товарів (створення контенту, монтаж, дизайн, тексти, голос, музика, зображення,
просування, продаж). false — для корпорацій, розробників, медицини, науки, військових тощо.
usable_now — true, якщо цим можна скористатись зараз (вийшло, доступно публічно, хоча б у бета чи частині країн);
false — лише анонс на майбутнє, лист очікування, тільки для корпоративних клієнтів.

1. ОЦІНИ від 1 до 10, наскільки це варто поста:
- 9–10 — помітна нова можливість для багатьох авторів (велике оновлення популярного інструмента, нова безкоштовна функція);
- 7–8 — корисний інструмент чи функція для конкретної професії, практичний спосіб;
- 6 — нормально, але вузько чи дрібно;
- нижче 6 — слабко, не для авторів, або вже всім відоме.

stream — ${AI_STREAMS.join(", ")}.
link — пряме посилання на сам інструмент чи сторінку функції (сайт сервісу, анонс від розробника), ТІЛЬКИ зі списку
«Посилання зі статті»; немає — порожній рядок. Не давай посилання на саму статтю чи на соцмережі.
origin — хто зробив інструмент/функцію («Adobe», «Google», «OpenAI»), для «За матеріалами»; невідомо — порожній рядок.
reason — одне коротке речення українською (до 20 слів): чому така оцінка.
${AI_TAGS_PROMPT}

2. Якщо оцінка ${WRITE_FROM} або вище — НАПИШИ ПОСТ (post) українською.
${VOICE}
Формат:
- від 500 до 1000 символів разом із пробілами; 2–4 короткі абзаци (порожній рядок між ними);
- обов'язково: що це (одним простим реченням), що саме воно робить для автора — на конкретному прикладі
  («завантажуєте 10-хвилинне відео — отримуєте 5 вертикальних кліпів із субтитрами»), кому з авторів знадобиться,
  де доступно й скільки коштує (якщо є в тексті: безкоштовно / платно / в якому тарифі), головне обмеження;
- виділи **жирним** 1–3 найголовніші речі (назва, що робить, «безкоштовно»), не цілі речення;
- можна почати з короткого жирного заголовка в один рядок;
- жодної іншої розмітки — без списків, курсиву, решіток і посилань;
${LANGUAGE}
Якщо оцінка нижче ${WRITE_FROM} — post порожній рядок.

3. Якщо оцінка ${HOOK_SCORE} або вище — напиши ще ${HOOK_RULES}
Якщо оцінка нижче ${HOOK_SCORE} — hook порожній рядок.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "stream", "reason", "post", "hook", "tags", "link", "origin", "kind", "ai_powered", "creator_relevant", "usable_now"],
  properties: {
    score: { type: "integer", minimum: 1, maximum: 10 },
    stream: { type: "string", enum: [...AI_STREAMS] },
    reason: { type: "string" },
    post: { type: "string" },
    hook: { type: "string" },
    tags: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: [...AI_TAGS] } },
    link: { type: "string" },
    origin: { type: "string" },
    kind: { type: "string", enum: [...KINDS] },
    ai_powered: { type: "boolean" },
    creator_relevant: { type: "boolean" },
    usable_now: { type: "boolean" },
  },
} as const;

interface AiFacts {
  score: number;
  stream: string;
  reason: string;
  post: string;
  hook: string;
  tags: string[];
  link: string;
  origin: string;
  kind: (typeof KINDS)[number];
  ai_powered: boolean;
  creator_relevant: boolean;
  usable_now: boolean;
}

export async function analyzeAi(article: Article, fullText: string | null, links: ArticleLink[] = []): Promise<Analysis> {
  const body = fullText ?? article.content;
  const linkList = links.length ? links.map((l) => `- ${l.text || "(без тексту)"} — ${l.url}`).join("\n") : "(немає)";
  const r = await askJson<AiFacts>(
    SYSTEM_PROMPT,
    `Джерело: ${article.source}\nЗаголовок: ${article.title}\n\n${body}\n\nПосилання зі статті:\n${linkList}`,
    "ai_tools",
    SCHEMA,
  );

  const cap = (max: number, why: string) => {
    if (r.score <= max) return;
    r.score = max;
    r.reason = `${why} — ${r.reason}`;
  };
  // шлак: бізнес-новини, дослідження, штуки для програмістів (GitHub, API) — не для авторів
  if (["industry_news", "research", "dev_only", "other"].includes(r.kind)) cap(3, `не інструмент для авторів (${r.kind})`);
  if (!r.ai_powered) cap(3, "не про AI (гаджет, утиліта, налаштування)");
  if (!r.creator_relevant) cap(3, "не для авторів");
  if (!r.usable_now) cap(5, "ще не доступно (анонс/лист очікування)");

  const norm = (u: string) => u.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
  const real = links.find((l) => norm(l.url) === norm(r.link ?? ""));
  const post = r.post.trim();
  if (r.score >= WRITE_FROM && !post) cap(WRITE_FROM - 1, "GPT не написав пост");

  return {
    score: r.score,
    stream: r.stream,
    account: "ai",
    reason: r.reason,
    post: r.score >= WRITE_FROM ? post : "",
    hook: r.score >= HOOK_SCORE ? r.hook.trim() : "",
    tags: r.tags,
    link: real ? real.url : "",
    deadline: "",
    origin: r.origin,
    applicants: "n/a",
    creative_sector: true,
  };
}
