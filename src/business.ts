// 💼 Канал «Гранти для бізнесу» (з 2026-10-17): усі гранти й безповоротна підтримка для бізнесу в Україні.
// Окремий аналіз, щоб не чіпати правила каналу для митців. Як і там: GPT витягує факти, рішення приймає КОД.
import type { Article } from "./fetchArticles.ts";
import type { ArticleLink } from "./extractText.ts";
import { askJson, HOOK_RULES, HOOK_SCORE, LANGUAGE, VOICE } from "./gpt.ts";
import { BUSINESS_TAGS, BUSINESS_TAGS_PROMPT } from "./channels.ts";
import { deadlineTooLate, minScoreFor, STREAMS, type Analysis } from "./summarize.ts";

const WRITE_FROM = minScoreFor("business");

const SYSTEM_PROMPT = `Ти ведеш український Telegram-канал «Гранти для бізнесу 🇺🇦» — гранти, компенсації, безповоротна фінансова
підтримка, конкурси бізнес-проєктів з призами, акселератори й інкубатори з фінансуванням і безкоштовне бізнес-навчання
для бізнесу в Україні: ФОП, мікро-, малий і середній бізнес, стартапи, ті, хто відкриває власну справу (зокрема ветерани,
ВПО, жінки, молодь), аграрії й фермерські господарства, виробники, експортери, компанії.

Тобі дають статтю (анонс програми, пост з Telegram-каналу про гранти, добірку).

1. ОЦІНИ від 1 до 10, наскільки це варто поста для підприємців:
- реальна відкрита програма з умовами, куди бізнес може подати заявку ЗАРАЗ;
- корисна: гроші (грант, компенсація, приз, ваучер), що більша сума й ширше коло тих, хто може подати, — то вище;
- конкретика: суми, умови, дедлайн, як подати.
Шкала: 9–10 — велика програма для багатьох (державні гранти, великі донори); 7–8 — корисна; 6 — нормальна, але вузька
(один регіон, одна галузь); нижче 6 — слабко або не для нас. Звичайна новина про бізнес, інтерв'ю, огляд — 1–3.

Факти, за якими КОД вирішить, чи підходить (заповнюй чесно за текстом):
applicants — хто може подати:
"businesses" — бізнес (ФОП, підприємства, стартапи, фермери, кооперативи) або громадяни, щоб відкрити бізнес;
"businesses_and_others" — і бізнес, і ГО/громади/науковці;
"not_businesses" — лише ГО, БФ, громади, ОМС, ОСББ, школи, університети, науковці, фізособи-митці, посадовці;
  а також стажування, стипендії, молодіжні й громадські ініціативи, конкурси для фізосіб без бізнес-мети — теж "not_businesses";
"n/a" — це не програма (новина, стаття, подія без можливості подати).
ukraine_ok — true, якщо подати може бізнес з України: українська програма (держава, Дія.Бізнес, «Власна справа»,
ОДА, українські фонди) АБО міжнародна, яка прямо приймає українські компанії (ЄБРР, USAID, UPF, EU4Business,
EIT, Horizon Europe для МСП, програми «для України») АБО міжнародна програма, відкрита для стартапів/компаній з
будь-якої країни світу (UNICEF Ventures, Google for Startups, глобальні конкурси й акселератори з грантом), якщо Україну
не виключено. false — лише якщо подати можуть ТІЛЬКИ компанії певних країн (лише ЄС, лише США тощо) без України.
non_repayable — true, якщо це безповоротно: грант, компенсація, приз, ваучер, безкоштовне навчання/акселератор.
false — кредит, позика, лізинг, пільгове кредитування без безповоротної частини, інвестиція за частку.
open_now — true, якщо з тексту ясно, що прийом заявок триває зараз (є дедлайн у майбутньому АБО написано, що
програма діє постійно / заявки приймаються); false — якщо незрозуміло (загальна сторінка програми без дат).
deadline — КІНЦЕВИЙ дедлайн подачі у форматі YYYY-MM-DD (рівно як у тексті, з правильним роком; для постійної програми —
дата завершення, якщо названа); немає — порожній рядок. Сьогодні ${new Date().toISOString().slice(0, 10)}.
НЕ ПІДХОДЯТЬ: тендери, закупівлі, вакансії, стажування, пошук консультантів/підрядників — applicants "n/a", оцінка 1–2.
Великі дослідницькі конкурси Horizon Europe / WIDERA / Excellence Hubs для консорціумів (університети, наукові установи,
де бізнес — лише один із партнерів) — максимум 5: малому бізнесу з них мало користі.

stream — тип: ${STREAMS.join(", ")} (компенсації й гранти — «Гранти»; конкурси з призом — «Конкурси й премії»).
link — пряме посилання на сторінку програми чи форму подачі, ТІЛЬКИ зі списку «Посилання зі статті»; немає — порожній рядок.
Не давай посилання на саму статтю чи на соцмережі.
origin — ПЕРШОДЖЕРЕЛО для «За матеріалами»: організація, яка дає гроші («Дія.Бізнес», «ЄБРР», «Mercy Corps»),
а не агрегатор (ГУРТ, Простір, Grant.Market, Telegram-канал). Не назване — порожній рядок.
reason — одне коротке речення українською (до 20 слів): чому така оцінка.
${BUSINESS_TAGS_PROMPT}

2. Якщо оцінка ${WRITE_FROM} або вище — НАПИШИ ПОСТ (post) українською для підприємців.
${VOICE}
Формат:
- від 500 до 1000 символів разом із пробілами; 2–4 короткі абзаци (порожній рядок між ними);
- обов'язково: що це, хто може подати (ФОП? МСБ? галузь, регіон, вік), скільки дають і на що, дедлайн, головні умови
  (співфінансування, робочі місця, звітність — якщо є);
- виділи **жирним** 1–3 найголовніші речі (сума, дедлайн, назва), не цілі речення;
- можна почати з короткого жирного заголовка в один рядок;
- жодної іншої розмітки — без списків, курсиву, решіток і посилань;
- перекажи своїми словами, не копіюй речення з оригіналу;
${LANGUAGE}
Якщо оцінка нижче ${WRITE_FROM} — post порожній рядок.

3. Якщо оцінка ${HOOK_SCORE} або вище — напиши ще ${HOOK_RULES}
Якщо оцінка нижче ${HOOK_SCORE} — hook порожній рядок.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "stream", "reason", "post", "hook", "tags", "link", "deadline", "origin", "applicants", "ukraine_ok", "non_repayable", "open_now"],
  properties: {
    score: { type: "integer", minimum: 1, maximum: 10 },
    stream: { type: "string", enum: [...STREAMS] },
    reason: { type: "string" },
    post: { type: "string" },
    hook: { type: "string" },
    tags: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: [...BUSINESS_TAGS] } },
    link: { type: "string" },
    deadline: { type: "string" },
    origin: { type: "string" },
    applicants: { type: "string", enum: ["businesses", "businesses_and_others", "not_businesses", "n/a"] },
    ukraine_ok: { type: "boolean" },
    non_repayable: { type: "boolean" },
    open_now: { type: "boolean" },
  },
} as const;

interface BusinessFacts {
  score: number;
  stream: Analysis["stream"];
  reason: string;
  post: string;
  hook: string;
  tags: string[];
  link: string;
  deadline: string;
  origin: string;
  applicants: "businesses" | "businesses_and_others" | "not_businesses" | "n/a";
  ukraine_ok: boolean;
  non_repayable: boolean;
  open_now: boolean;
}

export async function analyzeBusiness(article: Article, fullText: string | null, links: ArticleLink[] = []): Promise<Analysis> {
  const body = fullText ?? article.content;
  const linkList = links.length ? links.map((l) => `- ${l.text || "(без тексту)"} — ${l.url}`).join("\n") : "(немає)";
  const r = await askJson<BusinessFacts>(
    SYSTEM_PROMPT,
    `Джерело: ${article.source}\nЗаголовок: ${article.title}\n\n${body}\n\nПосилання зі статті:\n${linkList}`,
    "business",
    SCHEMA,
  );

  // Рішення — за фактами (як у каналі для митців: загальна оцінка GPT нестабільна)
  const cap = (max: number, why: string) => {
    if (r.score <= max) return;
    r.score = max;
    r.reason = `${why} — ${r.reason}`;
  };
  if (deadlineTooLate(r.deadline)) cap(2, `дедлайн минув або сьогодні/завтра (${r.deadline})`);
  if (r.applicants === "not_businesses" || r.applicants === "n/a") cap(2, r.applicants === "n/a" ? "не програма" : "не для бізнесу");
  if (!r.ukraine_ok) cap(2, "не для бізнесу з України");
  if (!r.non_repayable) cap(2, "кредит/позика, не грант");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.deadline ?? "") && !r.open_now) cap(5, "незрозуміло, чи прийом відкритий зараз");

  const norm = (u: string) => u.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
  const real = links.find((l) => norm(l.url) === norm(r.link ?? ""));

  const post = r.score >= WRITE_FROM ? r.post.trim() : "";
  if (r.score >= WRITE_FROM && !post) cap(WRITE_FROM - 1, "GPT не написав пост");

  return {
    score: r.score,
    stream: r.stream,
    account: "business",
    reason: r.reason,
    post: r.score >= WRITE_FROM ? post : "",
    hook: r.score >= HOOK_SCORE ? r.hook.trim() : "",
    tags: r.tags,
    link: real ? real.url : "",
    deadline: r.deadline,
    origin: r.origin,
    applicants: r.applicants === "not_businesses" ? "orgs_only" : r.applicants === "n/a" ? "n/a" : "individuals_and_orgs",
    creative_sector: false,
  };
}
