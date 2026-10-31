// 🧾 Гранти для ФОП — у канал грантів (власник 2026-10-31: бізнес-канал не ріс і закритий; гранти, які під ФОП
// заточені, тепер ідуть у «гранти, конкурси та можливості»). Креатори часто працюють як ФОП, тож грант, куди може
// подати будь-який ФОП (або людина, що лише відкриває справу), їм корисний. Компанії, стартапи, агро, виробництво,
// ветеранські програми — ні. Як і скрізь: GPT витягує факти, рішення приймає КОД.
import type { Article } from "./fetchArticles.ts";
import type { ArticleLink } from "./extractText.ts";
import { askJson, HOOK_RULES, HOOK_SCORE, LANGUAGE, VOICE } from "./gpt.ts";
import { TAGS, TAGS_PROMPT } from "./channels.ts";
import { deadlineTooLate, minScoreFor, STREAMS, type Analysis } from "./summarize.ts";

const WRITE_FROM = minScoreFor("knowledge");

const SYSTEM_PROMPT = `Ти ведеш український Telegram-канал «гранти, конкурси та можливості 🇺🇦» для людей з креативної сфери
(дизайнери, фотографи, ілюстратори, музиканти, автори, відеографи, блогери). Багато з них працюють як ФОП.
Тобі дають статтю про бізнес-грант чи програму підтримки. Нам підходять ЛИШЕ гранти, компенсації й безповоротна підтримка,
куди може подати БУДЬ-ЯКИЙ ФОП (або людина, яка тільки відкриває власну справу/реєструє ФОП), з будь-яким видом діяльності,
зокрема послуги й творчість.

1. ОЦІНИ від 1 до 10, наскільки це варто поста для креаторів-ФОП:
- реальна відкрита програма, куди ФОП може подати заявку ЗАРАЗ; що більша сума й ширше коло — то вище;
- конкретика: суми, умови, дедлайн, як подати.
9–10 — велика державна чи донорська програма для всіх ФОП; 7–8 — корисна; 6 — нормальна, але вузька (один регіон);
нижче 6 — слабко. Звичайна новина про бізнес, інтерв'ю, огляд — 1–3.

Факти, за якими КОД вирішить (заповнюй чесно за текстом):
fop_ok — true, якщо подати може ФОП (фізична особа-підприємець) або людина, яка реєструє ФОП/відкриває власну справу.
false — лише юрособи, компанії певного розміру (від N працівників, оборот від N млн), стартапи-юрособи, ГО, громади.
any_activity — true, якщо підходить будь-який вид діяльності, зокрема послуги, творчість, IT-фриланс, освіта.
false — лише агро, фермери, переробка, виробництво, експорт товарів, енергетика, ІТ-продукти, туризм чи інша одна галузь.
group_only — true, якщо подати можуть ЛИШЕ ветерани, їхні родини, люди з інвалідністю чи інша вузька група
(ВПО, жінки й молодь — не вузька група: false).
ukraine_ok — true, якщо подати може ФОП з України.
non_repayable — true, якщо безповоротно: грант, компенсація, ваучер, приз; false — кредит, позика, лізинг, інвестиція.
open_now — true, якщо з тексту ясно, що прийом триває зараз (дедлайн у майбутньому або «заявки приймаються постійно»).
deadline — КІНЦЕВИЙ дедлайн подачі у форматі YYYY-MM-DD (рівно як у тексті); немає — порожній рядок.
Сьогодні ${new Date().toISOString().slice(0, 10)}.
НЕ ПІДХОДЯТЬ: тендери, закупівлі, вакансії, пошук консультантів — оцінка 1–2.

stream — тип: ${STREAMS.join(", ")} (гранти й компенсації — «Гранти»; конкурс бізнес-проєктів з призом — «Конкурси й премії»;
безкоштовне бізнес-навчання — «Навчання»).
link — пряме посилання на сторінку програми чи форму подачі, ТІЛЬКИ зі списку «Посилання зі статті»; немає — порожній рядок.
origin — ПЕРШОДЖЕРЕЛО: організація, яка дає гроші («Дія.Бізнес», «єРобота», «Mercy Corps»), а не агрегатор. Немає — порожньо.
reason — одне коротке речення українською (до 20 слів): чому така оцінка.
${TAGS_PROMPT}
Для грантів для ФОП другий хештег — #ФОП.

2. Якщо оцінка ${WRITE_FROM} або вище — НАПИШИ ПОСТ (post) українською.
${VOICE}
Формат:
- від 500 до 1000 символів разом із пробілами; 2–4 короткі абзаци (порожній рядок між ними);
- обов'язково: що це, хто може подати (ФОП якої групи, регіон, вік — якщо є), скільки дають і на що, дедлайн,
  головні умови (співфінансування, робочі місця, звітність — якщо є);
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
  required: ["score", "stream", "reason", "post", "hook", "tags", "link", "deadline", "origin", "fop_ok", "any_activity", "group_only", "ukraine_ok", "non_repayable", "open_now"],
  properties: {
    score: { type: "integer", minimum: 1, maximum: 10 },
    stream: { type: "string", enum: [...STREAMS] },
    reason: { type: "string" },
    post: { type: "string" },
    hook: { type: "string" },
    tags: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: [...TAGS] } },
    link: { type: "string" },
    deadline: { type: "string" },
    origin: { type: "string" },
    fop_ok: { type: "boolean" },
    any_activity: { type: "boolean" },
    group_only: { type: "boolean" },
    ukraine_ok: { type: "boolean" },
    non_repayable: { type: "boolean" },
    open_now: { type: "boolean" },
  },
} as const;

interface FopFacts {
  score: number;
  stream: Analysis["stream"];
  reason: string;
  post: string;
  hook: string;
  tags: string[];
  link: string;
  deadline: string;
  origin: string;
  fop_ok: boolean;
  any_activity: boolean;
  group_only: boolean;
  ukraine_ok: boolean;
  non_repayable: boolean;
  open_now: boolean;
}

export async function analyzeFop(article: Article, fullText: string | null, links: ArticleLink[] = []): Promise<Analysis> {
  const body = fullText ?? article.content;
  const linkList = links.length ? links.map((l) => `- ${l.text || "(без тексту)"} — ${l.url}`).join("\n") : "(немає)";
  // Дата оголошення: з RSS або з початку заголовка «26.02.2024 …» (сторінки фондів без RSS)
  const m = article.title.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  const announced = article.publishedAt ?? (m ? new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`) : null);
  const r = await askJson<FopFacts>(
    SYSTEM_PROMPT,
    `Джерело: ${article.source}\nЗаголовок: ${article.title}\n${announced ? `Дата публікації: ${announced.toISOString().slice(0, 10)}\n` : ""}\n${body}\n\nПосилання зі статті:\n${linkList}`,
    "fop",
    SCHEMA,
  );

  const cap = (max: number, why: string) => {
    if (r.score <= max) return;
    r.score = max;
    r.reason = `${why} — ${r.reason}`;
  };
  if (deadlineTooLate(r.deadline)) cap(2, `дедлайн минув або сьогодні/завтра (${r.deadline})`);
  if (!r.fop_ok) cap(2, "не для ФОП");
  if (!r.any_activity) cap(2, "лише одна галузь (агро, виробництво…)");
  if (r.group_only) cap(2, "лише для вузької групи");
  if (!r.ukraine_ok) cap(2, "не для України");
  if (!r.non_repayable) cap(2, "кредит/позика, не грант");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.deadline ?? "") && !r.open_now) cap(5, "незрозуміло, чи прийом відкритий зараз");
  // Старе оголошення без дедлайну: «подача постійна» у 2024-му не означає, що програма відкрита зараз (УФС, 2026-10-20)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.deadline ?? "") && announced && Date.now() - announced.getTime() > 90 * 86400000)
    cap(3, `старе оголошення (${announced.toISOString().slice(0, 10)}) без дедлайну`);

  const norm = (u: string) => u.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
  const real = links.find((l) => norm(l.url) === norm(r.link ?? ""));

  const post = r.score >= WRITE_FROM ? r.post.trim() : "";
  if (r.score >= WRITE_FROM && !post) cap(WRITE_FROM - 1, "GPT не написав пост");

  return {
    score: r.score,
    stream: r.stream,
    account: "knowledge",
    reason: `ФОП: ${r.reason}`,
    post: r.score >= WRITE_FROM ? post : "",
    hook: r.score >= HOOK_SCORE ? r.hook.trim() : "",
    tags: r.tags,
    link: real ? real.url : "",
    deadline: r.deadline,
    origin: r.origin,
    applicants: "individuals",
    creative_sector: true,
  };
}
