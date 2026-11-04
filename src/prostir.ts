// 🎨 «Авторський простір 🇺🇦» (@avtorskyi_prostir, account "prostir", з 2026-11-04).
// Де автор може ПОКАЗАТИ, ОПУБЛІКУВАТИ чи ПРОДАТИ вже створену роботу: виставки, публікації в журналах і антологіях,
// фестивалі й покази, конкурси робіт, замовлення. Гроші на розвиток (гранти, стипендії, резиденції, навчання) —
// це канал грантів, сюди не йде. Як і скрізь: GPT лише витягує факти, рішення приймає КОД.
// Рішення власника: лише безкоштовна участь (так і в описі каналу), SkyNovix у постах не згадуємо — пости про
// SkyNovix він робить сам. План і база джерел — content/plan-de-pokazaty-svoie.md, content/de-pokazaty-dzherela.tsv.
import type { Article } from "./fetchArticles.ts";
import type { ArticleLink } from "./extractText.ts";
import type { Source } from "./sources.ts";
import { askJson, LANGUAGE, TEASER_END, VOICE } from "./gpt.ts";
import { deadlineTooLate } from "./summarize.ts";
import { PROSTIR_TAGS, PROSTIR_TAGS_PROMPT } from "./channels.ts";

// Аудит 2026-11-04 (усі читаються ботом). Не взято: FilmFreeway і Submittable (Cloudflare), Poets & Writers (журнали лише
// за алфавітом, без дат — бот не відрізнить нове), Festhome (сторінки без назв, самі платні фестивалі), ShutterCalls й
// artistcalls (список малює JavaScript), MusiTer (переважно вакансії в оркестрах із переїздом), Envato (закрив прийом авторів).
const S = (name: string, url: string, extra: Partial<Source> = {}): Source => ({ name, url, account: "prostir", ...extra });
export const PROSTIR_SOURCES: Source[] = [
  // фото й візуальне; загальна стрічка на 2/3 платна — читаємо сторінку лише безкоштовних
  S("Monographica", "https://opencalls.monographica.com/fees/free/", { linkPattern: /opencalls\.monographica\.com\/[a-z0-9]+(-[a-z0-9]+){2,}\/$/ }),
  S("Pixcontests", "https://pixcontests.com/rss.xml"), // фотоконкурси й виставки, у тексті є внесок і місто
  S("ARTFOND", "https://artfond.me/uk/open-calls", { linkPattern: /artfond\.me\/uk\/opportunities\/\d+-[\w-]+$/ }),
  S("ArtConnect", "https://www.artconnect.com/opportunities?fees=FREE", { linkPattern: /artconnect\.com\/opportunity\/[\w-]+$/ }), // лише без внеску
  S("opencalls.ai", "https://opencalls.ai/", { linkPattern: /opencalls\.ai\/opencalls\/[\w-]+$/ }),
  S("Kunsten", "https://www.kunsten.be/en/calls/", { linkPattern: /kunsten\.be\/en\/calls\/[\w-]+\/$/ }), // міжнародні calls: музика, сцена, фото…
  S("Indie Balkans", "https://indiebalkans.com/open-calls/", { linkPattern: /indiebalkans\.com\/(?!open-calls\/)[\w-]+-open-call\/$/ }), // музичні шоукейси
  S("Booooooom", "https://www.booooooom.com/feed/"), // власні премії й прийом робіт (блог — решту відсіє попередній відбір)
  // 🇺🇦 Українські радари — те, що забрав канал грантів, сюди не піде (дубль за посиланням і заголовком)
  S("Літцентр", "litcentr", { telegram: true }),
  S("ART BOT", "artbotme", { telegram: true }),
];

// Внесок видно вже в анонсі («Entry fee: $25» у Pixcontests) — відкидаємо до GPT
export function paidInTeaser(a: Article): string | null {
  return /entry fee:\s*(from\s*)?[$€£\d]/i.test(a.content) ? "платна участь (видно в анонсі)" : null;
}

export const RESULTS = ["publication", "exhibition", "screening", "performance", "sale", "commission", "prize", "funding", "residency", "education", "other"] as const;
export const DISCIPLINES = ["literature", "music", "art", "photo", "film", "design", "mixed"] as const;
export const DISC_NAMES: Record<string, string> = {
  literature: "література", music: "музика", art: "мистецтво", photo: "фото", film: "кіно", design: "дизайн", mixed: "різне",
};
// показ роботи — те, заради чого канал; гроші на розвиток — канал грантів
const SHOW = new Set(["publication", "exhibition", "screening", "performance", "sale", "commission", "prize"]);
const GRANT_CHANNEL = new Set(["funding", "residency", "education"]);

export interface Meta {
  deadline: string;
  rolling: boolean;
  grade: "A" | "B";
  headline: string;
  result: string;
  origin: string;
  link: string;
}

interface Facts {
  score: number;
  is_call: boolean;
  result: (typeof RESULTS)[number];
  discipline: (typeof DISCIPLINES)[number];
  fee: "free_stated" | "paid" | "not_mentioned";
  open_to_ukraine: boolean;
  local_only: boolean;
  rights_grab: boolean;
  pays_author: boolean;
  deadline: string;
  rolling: boolean;
  headline: string;
  organizer: string;
  link: string;
  reason: string;
  post: string;
  tags: string[];
}

const SYSTEM_PROMPT = `Ти редактор українського Telegram-каналу «Авторський простір 🇺🇦»: де українському автору показати свою
роботу — виставки, публікації в журналах і антологіях, фестивалі й покази, конкурси робіт, замовлення. Читачі — художники,
ілюстратори, фотографи, письменники й поети, музиканти, кіношники, дизайнери.
Тобі дають оголошення (часто англійською). Витягни ФАКТИ чесно за текстом — рішення приймає код.

is_call — true, якщо це конкретний набір, куди автор надсилає СВОЮ роботу чи заявку (open call, конкурс робіт, прийом
текстів, відбір на виставку/фестиваль/показ, пошук авторів). false — новина, інтерв'ю, огляд, підсумки, переможці, реклама.
result — що автор ОТРИМАЄ в результаті: publication (публікація тексту/робіт у журналі, книжці, антології, онлайн-виданні),
exhibition (виставка), screening (показ фільму), performance (виступ, шоукейс, концерт), sale (продаж робіт),
commission (оплачуване замовлення), prize (премія/конкурс, де головне — приз і відзнака), funding (грант, фінансування
проєкту), residency (резиденція), education (навчання, менторство, воркшоп), other.
discipline — головний напрям: literature, music, art (живопис, ілюстрація, скульптура, медіамистецтво), photo, film
(кіно, відео, анімація), design, mixed (кілька напрямів одразу).
fee — paid, якщо треба платити за участь, розгляд, публікацію, виставку, друк чи «membership» (навіть «лише після відбору»);
free_stated — якщо в тексті ПРЯМО сказано, що участь безкоштовна (free, no fee, no entry fee); not_mentioned — про оплату нічого не сказано.
open_to_ukraine — true, якщо подати може автор з України (будь-яка країна або Україну названо). Перелік країн без України — false.
local_only — true, якщо лише для жителів певного міста/штату/країни (не України) або треба особисто привезти роботу.
rights_grab — true, якщо організатор забирає виключні права чи право власності на роботу.
pays_author — true, якщо автор отримує гроші: гонорар, приз, оплата, продаж.
deadline — КІНЦЕВИЙ дедлайн подачі YYYY-MM-DD рівно як у тексті; немає — порожній рядок. Сьогодні ${new Date().toISOString().slice(0, 10)}.
rolling — true, якщо роботи приймають постійно, без дедлайну.
headline — коротка назва українською до 70 символів (що й де), для списку дедлайнів.
organizer — хто проводить (журнал, галерея, фестиваль), а не агрегатор; немає — порожньо.
link — пряма сторінка організатора чи форма подачі ТІЛЬКИ зі списку «Посилання зі статті»; немає — порожній рядок.
reason — одне коротке речення українською: чому така оцінка.
${PROSTIR_TAGS_PROMPT}

score від 1 до 10 — наскільки це сильна можливість показати роботу: відомий організатор, реальна аудиторія, оплата чи приз,
зрозумілі умови. 9–10 — відомий журнал/фестиваль/галерея з гонораром чи призом; 7–8 — добра публікація чи виставка;
6 — нормальна, але скромна; нижче — слабко, сумнівно чи неясно.

Якщо score 6+ — напиши post українською за форматом:
**Коротка назва-суть одним рядком** (що, де; без «Open call:» англійською)

1–2 речення простими словами: що це й для кого.

— хто може подати: …;
— що надіслати: …;
— що отримаєте: …;
— участь: безкоштовно;
— дедлайн: 12 листопада 2026 (або «приймають постійно»).

Якщо важливо — ще одне речення-нюанс (подача англійською, дорогу оплачуєте самі, кількість робіт).
Вимоги: 400–900 символів; лише факти з тексту, нічого не додумуй; жирним лише назву; без посилань, хештегів і емодзі
(посилання додасть код).
${VOICE}
${LANGUAGE}
Якщо score нижче 6 — post порожній рядок.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "is_call", "result", "discipline", "fee", "open_to_ukraine", "local_only", "rights_grab", "pays_author",
    "deadline", "rolling", "headline", "organizer", "link", "reason", "post", "tags"],
  properties: {
    score: { type: "integer", minimum: 1, maximum: 10 },
    is_call: { type: "boolean" },
    result: { type: "string", enum: [...RESULTS] },
    discipline: { type: "string", enum: [...DISCIPLINES] },
    fee: { type: "string", enum: ["free_stated", "paid", "not_mentioned"] },
    open_to_ukraine: { type: "boolean" },
    local_only: { type: "boolean" },
    rights_grab: { type: "boolean" },
    pays_author: { type: "boolean" },
    deadline: { type: "string" },
    rolling: { type: "boolean" },
    headline: { type: "string" },
    organizer: { type: "string" },
    link: { type: "string" },
    reason: { type: "string" },
    post: { type: "string" },
    tags: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: [...PROSTIR_TAGS] } },
  },
} as const;

export interface Verdict {
  accepted: boolean;
  reason: string;
  score: number;
  discipline: string;
  post: string;
  tags: string[];
  meta: Meta;
}

// Джерела, де безкоштовність гарантує сам фільтр сайту — там «про оплату не сказано» теж означає «безкоштовно»
const FREE_SOURCES = new Set(["Monographica", "ArtConnect"]);
const bare = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
const LISTINGS = new Set(PROSTIR_SOURCES.map((s) => bare(s.url)));

export async function analyzeProstir(a: Article, text: string | null, links: ArticleLink[] = []): Promise<Verdict> {
  const linkList = links.length ? links.slice(0, 60).map((l) => `- ${l.text || "(без тексту)"} — ${l.url}`).join("\n") : "(немає)";
  const r = await askJson<Facts>(SYSTEM_PROMPT, `Джерело: ${a.source}\nЗаголовок: ${a.title}\n\n${(text ?? a.content).slice(0, 6000)}\n\nПосилання зі статті:\n${linkList}`, "prostir", SCHEMA);

  const norm = (u: string) => u.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
  // лише реальне посилання зі статті і не сторінка-список самого агрегатора (ARTFOND давав «усі open call»)
  const found = links.find((l) => norm(l.url) === norm(r.link ?? ""))?.url ?? "";
  const link = found && !LISTINGS.has(bare(found)) ? found : "";
  const meta: Meta = {
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(r.deadline) ? r.deadline : "",
    rolling: r.rolling,
    grade: r.pays_author || r.score >= 8 ? "A" : "B",
    headline: r.headline.trim(),
    result: r.result,
    origin: r.organizer.trim(),
    link,
  };
  // Рішення — тут, за фактами
  const no =
    (!r.is_call && "не набір робіт (новина, огляд, підсумки)") ||
    (GRANT_CHANNEL.has(r.result) && "грант/резиденція/навчання — це канал грантів") ||
    (!SHOW.has(r.result) && "незрозуміло, що отримає автор") ||
    (r.fee === "paid" && "платна участь") ||
    (r.fee === "not_mentioned" && !FREE_SOURCES.has(a.source) && "не сказано, що участь безкоштовна") ||
    (!r.open_to_ukraine && "українці не можуть подати") ||
    (r.local_only && "лише для місцевих") ||
    (r.rights_grab && "забирають права на роботу") ||
    (deadlineTooLate(meta.deadline) && `дедлайн минув або завтра (${meta.deadline})`) ||
    (!meta.deadline && !r.rolling && "без дедлайну й не постійний прийом") ||
    (r.score < 6 && "слабко") ||
    (!r.post.trim() && "GPT не написав пост") ||
    null;
  return {
    accepted: !no,
    reason: no ? `${no} — ${r.reason}` : r.reason,
    score: r.score,
    discipline: r.discipline,
    post: no ? "" : r.post.trim(),
    tags: r.tags,
    meta,
  };
}

// 🔗 у кінці поста — пряма сторінка організатора, інакше саме оголошення
export function withProstirLink(post: string, url: string): string {
  let clean = url;
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^ref$|^source$/i.test(k)) u.searchParams.delete(k);
    clean = u.toString();
  } catch {
    /* як є */
  }
  return `${post.trim()}\n\n🔗 [Деталі та подання](${clean})`;
}

// 🧵 Тизер для Threads під кожним постом (як у каналі грантів, але для всіх постів)
export async function prostirTeaser(post: string): Promise<string> {
  const r = await askJson<{ hook: string }>(
    `Зроби з поста Telegram-каналу «Авторський простір 🇺🇦» короткий пост-тизер для Threads українською (200–380 символів),
який веде людей у наш Telegram:
- перший рядок — що це й де (виставка, журнал, фестиваль), зрозуміло без контексту, не загадка;
- далі 2–4 короткі пункти, кожен з нового рядка через «— »: хто може подати, що отримаєте, участь безкоштовна, дедлайн;
  з малої літери, в кінці «;», в останнього «.»;
- потім одне коротке речення (кому підійде чи головний нюанс);
- БЕЗ смайликів, хештегів, посилань і розмітки (без **зірочок**); рядок про Telegram НЕ пиши — його додасть код;
- лише факти з поста, нічого не вигадуй;
- порожній рядок після першого рядка і перед реченням у кінці (пункти — підряд).
${LANGUAGE}`,
    post.replace(/\n*🔗 \[[^\]]*\]\([^)]*\)\s*$/, ""),
    "prostir_teaser",
    { type: "object", additionalProperties: false, required: ["hook"], properties: { hook: { type: "string" } } },
  );
  return r.hook.split(TEASER_END).join("").trim();
}

// ⏳ «Дедлайни тижня» (неділя): що з надісланого закривається найближчим тижнем. Без GPT.
export function weeklyDeadlines(items: { meta: Meta; url: string }[]): string | null {
  if (items.length < 3) return null;
  const months = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
  const day = (d: string) => `${Number(d.slice(8, 10))} ${months[Number(d.slice(5, 7)) - 1]}`;
  const lines = items
    .sort((x, y) => x.meta.deadline.localeCompare(y.meta.deadline))
    .map((x) => `**до ${day(x.meta.deadline)}** — [${x.meta.headline.replace(/[[\]]/g, "")}](${x.meta.link || x.url})`);
  return `**⏳ Дедлайни тижня**\n\nВстигніть подати роботи — ці набори закриваються найближчими днями:\n\n${lines.join("\n")}\n\nУсюди участь безкоштовна. Збережіть, щоб не загубити.`;
}
