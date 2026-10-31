// 🧾 «Замовлення для креаторів 🇺🇦» (@zamovlennia_creators, з 2026-10-31): оплачувані замовлення, віддалена творча
// робота, конкурси з грошовими призами, бренди й UGC для дизайнерів, ілюстраторів, фотографів, відеографів,
// музикантів і авторів. Офісні вакансії — ні. Мета власника: аудиторія, частина якої — майбутні продавці SkyNovix,
// і згодом дохід з реклами.
//
// Як і в каналі грантів: GPT лише витягує ФАКТИ (тип, оплата, формат роботи, червоні прапорці), рішення приймає КОД.
// Записи — у таблиці Article з url-префіксом "ord:" (як «Продавай своє»), статуси ord_*.
// Службові поля: stream — тип пропозиції (Kind), tags — хештеги, hook — JSON з фактами (Meta: оплата, професія,
// першоджерело) — з них рахуються «Ціни тижня».
import { prisma } from "./db.ts";
import type { Article } from "./fetchArticles.ts";
import type { ArticleLink } from "./extractText.ts";
import type { Source } from "./sources.ts";
import type { Analysis } from "./summarize.ts";
import { askJson, LANGUAGE } from "./gpt.ts";
import { deadlineTooLate } from "./summarize.ts";
import { ORDER_PROF_TAGS, ORDER_TAGS, ORDER_TYPE_TAGS } from "./channels.ts";

// Джерела перевірено 2026-10-31 (~200 пропозицій на тиждень). Конкурси з призами додатково приходять з каналу грантів
// (queueFromGrant). Не взято: Work.ua, robota.ua (блокують бота, переважно офіс), Remotive (порожньо), RemoteOK, ProZ,
// ArtStation, Mandy (немає стрічки), Himalayas і JOB for Ukrainians (не творче), Базу збирає і Фріланс в Україні (мертві).
const S = (name: string, url: string, extra: Partial<Source> = {}): Source => ({ name, url, account: "orders", ...extra });
export const ORDER_SOURCES: Source[] = [
  // 💼 Разові замовлення (стрічка дозволяє агрегаторам; ~50 проєктів на добу, творчих ~10; бюджет часто в заголовку)
  S("Freelancehunt", "https://freelancehunt.com/projects.rss"),
  // 🏠 Віддалена робота — Україна
  S("DOU Дизайн", "https://jobs.dou.ua/vacancies/feeds/?category=Design&remote"),
  S("DOU Маркетинг", "https://jobs.dou.ua/vacancies/feeds/?category=Marketing&remote"), // сценаристи, UGC, motion
  S("Djinni Дизайн", "https://djinni.co/jobs/rss/?primary_keyword=Design"), // інші ключові слова Djinni ігнорує
  // 🌍 Віддалена робота — міжнародні
  S("Jobicy", "https://jobicy.com/?feed=job_feed&job_categories=design-multimedia"),
  S("Dribbble Jobs", "https://dribbble.com/jobs.rss"),
  S("Coroflot", "https://www.coroflot.com/jobs/rss"),
  S("We Work Remotely", "https://weworkremotely.com/categories/remote-design-jobs.rss"),
  // 🏆 Конкурси з призами (з внеском — відсіє код)
  S("Contest Watchers", "https://www.contestwatchers.com/feed/"),
  S("Contest Watchers фото", "https://www.contestwatchers.com/category/photography/feed/"),
  // 📡 Telegram-радари: беремо посилання на першоджерело (анкета бренду, сторінка вакансії) + текст поста
  S("UGC Україна", "ua_ugc", { telegram: true }), // бренди шукають UGC-креаторів
  S("Крезюме", "cresume", { telegram: true }), // вакансії в культурі й креативі — багато офісу, фільтр відсіє
];

// Джерела, де багато нетворчого (Excel, CRM, продажі) — на GPT лише за творчими словами в заголовку
const NEEDS_CREATIVE_WORDS = new Set(["Freelancehunt", "DOU Маркетинг", "Крезюме"]);
const CREATIVE_WORDS =
  /дизайн|design|логот|logo|ілюстр|иллюстр|illustr|малю|рису|draw|банер|баннер|banner|креатив|creative|постер|poster|обклад|облож|cover|етикет|этикет|упаков|пакуван|packag|брендбук|айдентик|брендинг|branding|шрифт|font|іконк|иконк|icon|стікер|стикер|відео|видео|video|монтаж|edit|ролик|reels|shorts|анімац|анимац|animat|motion|моушн|3d|3д|рендер|render|візуаліз|визуализ|фото|photo|зйомк|съемк|ретуш|retouch|музик|music|звук|sound|аудіо|аудио|audio|озвуч|voice|диктор|подкаст|podcast|текст|copywrit|копірайт|копирайт|сценар|script|стат(ей|ті|тя)|article|редакт|editor|переклад|перевод|translat|контент|content|ugc|блогер|blogger|smm|презентац|presentation|інфограф|инфограф|книг|book|комікс|комикс|персонаж|character|арт|art|ігр|игр|game/i;
export function notCreativeOrder(a: Article): string | null {
  return NEEDS_CREATIVE_WORDS.has(a.source) && !CREATIVE_WORDS.test(a.title) ? "не творче (за заголовком)" : null;
}

export const KINDS = ["digital_product", "one_off", "brand_ugc", "remote_contract", "remote_fulltime", "contest_prize", "publisher_call", "not_offer"] as const;
export type Kind = (typeof KINDS)[number];
// Пріоритет (власник 2026-10-31): замовлення на цифрові продукти — найцінніші (перетин із SkyNovix), далі разові
// замовлення, бренди, контракт, повна ставка, конкурси
const KIND_PRIORITY: Record<Kind, number> = {
  digital_product: 6, one_off: 5, brand_ugc: 4, publisher_call: 4, remote_contract: 3, remote_fulltime: 2, contest_prize: 2, not_offer: 0,
};
// Рубрики для квот (частки від постів-пропозицій; «від замовлення до продукту» й «ціни тижня» — окремо за розкладом)
export const RUBRICS = {
  orders: { kinds: ["digital_product", "one_off"], target: 0.4 },
  remote: { kinds: ["remote_contract", "remote_fulltime"], target: 0.22 },
  contests: { kinds: ["contest_prize"], target: 0.22 },
  brands: { kinds: ["brand_ugc", "publisher_call"], target: 0.16 },
} as const satisfies Record<string, { kinds: readonly Kind[]; target: number }>;
export type Rubric = keyof typeof RUBRICS;
export const rubricOf = (kind: string): Rubric | null =>
  (Object.keys(RUBRICS) as Rubric[]).find((r) => (RUBRICS[r].kinds as readonly string[]).includes(kind)) ?? null;
export const priorityOf = (kind: string, score: number) => (KIND_PRIORITY[kind as Kind] ?? 0) * 10 + score;

export const PROFESSIONS = ["illustration", "design", "video", "animation", "photo", "3d", "music", "voice", "writing", "translation", "gamedev", "other"] as const;
export type Profession = (typeof PROFESSIONS)[number];
export const PROF_NAMES: Record<Profession, string> = {
  illustration: "ілюстрація", design: "дизайн", video: "відео й монтаж", animation: "анімація й motion", photo: "фото",
  "3d": "3D", music: "музика й звук", voice: "озвучка", writing: "тексти й сценарії", translation: "переклад",
  gamedev: "ігровий арт", other: "інше",
};

// Факти, що зберігаються в Article.hook (JSON)
export interface Meta {
  prof: Profession;
  payStatus: "amount" | "negotiable" | "in_form" | "unclear";
  payMin: number;
  payMax: number;
  currency: string; // UAH | USD | EUR | other | ""
  period: string; // project | hour | month | prize | ""
  origin: string; // замовник / організатор
  link: string;
}

const SYSTEM_PROMPT = `Ти редактор українського Telegram-каналу «Замовлення для креаторів 🇺🇦»: оплачувані творчі замовлення,
віддалена творча робота, конкурси з грошовими призами, бренди й UGC, видавництва й студії, що шукають авторів —
для українських дизайнерів, ілюстраторів, фотографів, відеографів, аніматорів, 3D-художників, музикантів і
звукорежисерів, дикторів, авторів текстів і сценаріїв, перекладачів.
Офісні вакансії сюди НЕ йдуть. Неоплачувана робота («за досвід», «за відгук», бартер без грошей) — теж ні.

Тобі дають оголошення (проєкт з біржі фрилансу, вакансію, конкурс, пост Telegram-каналу). Заповни ФАКТИ чесно за текстом —
рішення прийме код.

kind — тип:
"digital_product" — разове замовлення на створення цифрового продукту: набір іконок, шаблони, пресети, шрифт, стікери,
  семпли чи музика для бібліотеки, електронна книга, навчальний матеріал, курс, 3D-асети;
"one_off" — інше разове оплачуване творче замовлення (логотип, ілюстрація, монтаж відео, зйомка, озвучка, тексти);
"brand_ugc" — бренд шукає UGC-креаторів, блогерів, ведучих, амбасадорів за оплату;
"publisher_call" — видавництво, лейбл, студія, медіа чи фестиваль шукає авторів, ілюстраторів, музикантів за гонорар;
"remote_contract" — віддалена робота на контракт, part-time чи проєктна зайнятість;
"remote_fulltime" — віддалена робота на повну ставку;
"contest_prize" — конкурс, премія чи open call з ГРОШОВИМ призом або гонораром;
"not_offer" — не пропозиція (стаття, новина, курс, реклама послуг) або робота не творча.
creative — true, якщо сама робота творча: дизайн (графічний, UI/UX, веб, продуктовий), ілюстрація, фото, відео, монтаж,
анімація, motion, 3D, ігровий арт, музика, звук, озвучка, тексти, копірайтинг, сценарії, переклад, UGC.
false — продажі, менеджмент, таргетолог, SMM-менеджер без створення контенту, розробка, адміністрування, підтримка, Excel.
profession — ${PROFESSIONS.join(", ")}.
location — "remote" (віддалено, з будь-якого міста; для конкурсу — подача онлайн); "city_one_off" (разова робота в
конкретному місті: зйомка, захід); "office" (офіс чи гібрид, постійна присутність у місті).
ukraine_ok — true, якщо людина з України може відгукнутися: українське оголошення, «worldwide», «anywhere», Європа
(Україна в Європі), «CET ±3». false — лише США, лише певні країни без України, потрібен дозвіл на роботу в іншій країні.
pay_status — "amount" (сума чи діапазон вказані), "negotiable" (оплату прямо передбачено, але сума за домовленістю:
«бюджет обговорюється», «оплата за портфоліо»), "in_form" (бренд, видавництво чи студія шукає креаторів, а умови
співпраці й оплати — в анкеті чи формі за посиланням; бартер прямо не згаданий), "unclear" (про оплату нічого, бартер, «за досвід», «за відгук»,
«безкоштовно», «undisclosed» без інших ознак оплати).
Проєкт на біржі фрилансу (джерело Freelancehunt) оплачуваний за природою: якщо суми немає — "negotiable".
Хештег #оплата в пості каналу UGC Україна означає, що робота оплачувана: якщо суми немає — "negotiable".
pay_min, pay_max — числа рівно з тексту (без пробілів; одна сума — обидва однакові; немає — 0).
pay_currency — "UAH", "USD", "EUR", "other" або "" (немає суми). pay_period — "project" (за проєкт/замовлення), "hour",
"month", "prize" (грошовий приз конкурсу) або "".
upfront_payment — true, якщо виконавця просять щось заплатити (за доступ, навчання, «гарантійний внесок», матеріали).
unpaid_test — true, якщо вимагають велике неоплачуване тестове (більше ~2 годин роботи чи повноцінний проєкт).
scam_signs — true: «легкий заробіток», нереальні суми, MLM, «пиши в особисті» без замовника й умов, криптосхеми, казино.
entry_fee — true, якщо за участь у конкурсі треба платити.
contradictory — true, якщо в тексті суперечливі суми, дедлайни чи умови.
deadline — дедлайн подачі (конкурс, набір) у форматі YYYY-MM-DD, рівно як у тексті; немає — порожній рядок.
Сьогодні ${new Date().toISOString().slice(0, 10)}.
origin — замовник чи організатор (назва компанії, бренду, фестивалю); не названо — порожній рядок.
link — пряме посилання на форму чи сторінку подачі ТІЛЬКИ зі списку «Посилання»; немає — порожній рядок.
score — від 1 до 10, наскільки пропозиція приваблива й зрозуміла для креатора: є чітке завдання, адекватна оплата,
зрозумілий замовник. 9–10 — щедро й чітко; 7–8 — добре; 6 — нормально; нижче — слабко.
tags — 2–3 хештеги зі списку (точно як написано): ${ORDER_TAGS.join(" ")}.
Перший — ТИП: ${ORDER_TYPE_TAGS.join(" ")} (разове замовлення й цифровий продукт — #замовлення; віддалена робота —
#віддалено; конкурс із призом — #конкурси; бренди й UGC — #UGC; видавництва, лейбли, студії шукають авторів —
#шукаютьавторів). Далі 1–2 — ПРОФЕСІЯ: ${ORDER_PROF_TAGS.join(" ")}.
reason — одне коротке речення українською (до 20 слів): чому така оцінка.

post — пост українською (навіть якщо оголошення російською чи англійською), 350–700 символів, рівно такий формат:
**<Що треба — коротко> — <сума, якщо є>**

<1–2 речення: що саме зробити, для кого/якого проєкту, головні вимоги>

💸 Оплата: <сума й за що, як у тексті; якщо за домовленістю — «за домовленістю»; якщо pay_status "in_form" — рівно «умови в анкеті бренду»; приз — «приз …»>
👤 Кого шукають: <хто, досвід, портфоліо>
📍 Формат: <віддалено / разово в місті …>
⏳ До: <дедлайн словами> — лише якщо є дедлайн, інакше цей рядок не пиши

<одне коротке речення: нюанс чи порада (що додати у відгук, на що звернути увагу)>
Правила: суми — рівно як в оголошенні (не перераховуй у гривні), валюту пиши «грн», «$» чи «€» (не UAH/USD/EUR); нічого не вигадуй; без посилань і хештегів;
жирним лише перший рядок; пиши на «ви», просто й по-людськи, без канцеляриту.
${LANGUAGE}`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "creative", "profession", "location", "ukraine_ok", "pay_status", "pay_min", "pay_max", "pay_currency", "pay_period",
    "upfront_payment", "unpaid_test", "scam_signs", "entry_fee", "contradictory", "deadline", "origin", "link", "score", "tags", "reason", "post"],
  properties: {
    kind: { type: "string", enum: [...KINDS] },
    creative: { type: "boolean" },
    profession: { type: "string", enum: [...PROFESSIONS] },
    location: { type: "string", enum: ["remote", "city_one_off", "office"] },
    ukraine_ok: { type: "boolean" },
    pay_status: { type: "string", enum: ["amount", "negotiable", "in_form", "unclear"] },
    pay_min: { type: "number" },
    pay_max: { type: "number" },
    pay_currency: { type: "string", enum: ["UAH", "USD", "EUR", "other", ""] },
    pay_period: { type: "string", enum: ["project", "hour", "month", "prize", ""] },
    upfront_payment: { type: "boolean" },
    unpaid_test: { type: "boolean" },
    scam_signs: { type: "boolean" },
    entry_fee: { type: "boolean" },
    contradictory: { type: "boolean" },
    deadline: { type: "string" },
    origin: { type: "string" },
    link: { type: "string" },
    score: { type: "integer", minimum: 1, maximum: 10 },
    tags: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: [...ORDER_TAGS] } },
    reason: { type: "string" },
    post: { type: "string" },
  },
} as const;

interface Facts {
  kind: Kind;
  creative: boolean;
  profession: Profession;
  location: "remote" | "city_one_off" | "office";
  ukraine_ok: boolean;
  pay_status: Meta["payStatus"];
  pay_min: number;
  pay_max: number;
  pay_currency: string;
  pay_period: string;
  upfront_payment: boolean;
  unpaid_test: boolean;
  scam_signs: boolean;
  entry_fee: boolean;
  contradictory: boolean;
  deadline: string;
  origin: string;
  link: string;
  score: number;
  tags: string[];
  reason: string;
  post: string;
}

export const MIN_ORDER_SCORE = 6;

export interface OrderVerdict {
  accepted: boolean;
  kind: Kind;
  score: number;
  reason: string;
  post: string;
  tags: string[];
  deadline: string;
  meta: Meta;
}

export async function analyzeOrder(a: Article, fullText: string | null, links: ArticleLink[] = []): Promise<OrderVerdict> {
  const linkList = links.length ? links.slice(0, 20).map((l) => `- ${l.text || "(без тексту)"} — ${l.url}`).join("\n") : "(немає)";
  const r = await askJson<Facts>(
    SYSTEM_PROMPT,
    `Джерело: ${a.source}\nЗаголовок: ${a.title}\n\n${(fullText ?? a.content).slice(0, 6000)}\n\nПосилання:\n${linkList}`,
    "order",
    SCHEMA,
  );

  // Рішення — КОД за фактами (власник 2026-10-31: офіс — ні; оплата не підтверджена — ні; внесок за участь — ні)
  const no =
    r.kind === "not_offer" ? "не пропозиція"
    : !r.creative ? "не творча робота"
    : r.location === "office" ? "офіс чи гібрид"
    : !r.ukraine_ok ? "недоступно з України"
    : r.pay_status === "unclear" ? "оплата не підтверджена"
    // власник 2026-10-31: бренди/UGC без суми — можна, з позначкою «умови в анкеті бренду»; для решти — ні
    : r.pay_status === "in_form" && r.kind !== "brand_ugc" && r.kind !== "publisher_call" ? "оплата не підтверджена (умови лише в анкеті)"
    : r.entry_fee ? "платна участь"
    : r.upfront_payment ? "просять заплатити виконавця"
    : r.unpaid_test ? "велике неоплачуване тестове"
    : r.scam_signs ? "ознаки шахрайства"
    : r.contradictory ? "суперечливі умови"
    : deadlineTooLate(r.deadline) ? `дедлайн минув або сьогодні/завтра (${r.deadline})`
    : r.score < MIN_ORDER_SCORE ? "слабка пропозиція"
    : !r.post.trim() ? "GPT не написав пост"
    : null;

  const norm = (u: string) => u.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
  const real = links.find((l) => norm(l.url) === norm(r.link ?? ""));
  return {
    accepted: !no,
    kind: r.kind,
    score: r.score,
    reason: no ? `${no} — ${r.reason}` : r.reason,
    post: r.post.trim(),
    tags: r.tags,
    deadline: r.deadline,
    meta: {
      prof: r.profession,
      payStatus: r.pay_status,
      payMin: Math.max(0, Math.round(r.pay_min || 0)),
      payMax: Math.max(0, Math.round(r.pay_max || r.pay_min || 0)),
      currency: r.pay_currency,
      period: r.pay_period,
      origin: r.origin.trim(),
      link: real ? real.url : "",
    },
  };
}

// «🔗 Відгукнутися» / «🔗 Умови й заявка» — посилання сховане в слово, як у каналі грантів
export function withOrderLink(post: string, url: string, kind: string): string {
  let clean = url;
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^ref$|^source$/i.test(k)) u.searchParams.delete(k);
    clean = u.toString();
  } catch {
    /* як є */
  }
  return `${post.trim()}\n\n🔗 [${kind === "contest_prize" ? "Умови й заявка" : "Відгукнутися"}](${clean})`;
}

// 🏆 Конкурс чи open call з грошима з каналу грантів → черга «Замовлень» (пост уже пройшов фактчек)
const GRANT_TO_ORDER_TAG: Record<string, string> = {
  "#дизайн": "#дизайн", "#фото": "#фото", "#музика": "#музика", "#література": "#тексти", "#кіно": "#відео",
  "#візуальне": "#ілюстрація", "#геймдев": "#геймдев", "#медіа": "#тексти",
};
export async function queueFromGrant(a: Article, analysis: Analysis): Promise<void> {
  const prof = [...new Set(analysis.tags.map((t) => GRANT_TO_ORDER_TAG[t]).filter(Boolean))].slice(0, 2);
  const meta: Meta = { prof: "other", payStatus: "amount", payMin: 0, payMax: 0, currency: "", period: "prize", origin: analysis.origin?.trim() || a.source, link: analysis.link };
  await prisma.article.upsert({
    where: { url: `ord:grant:${a.url}` },
    update: {},
    create: {
      url: `ord:grant:${a.url}`, title: a.title, source: a.source, publishedAt: a.publishedAt, status: "ord_queue",
      score: analysis.score, stream: "contest_prize", account: "orders", reason: "з каналу грантів (грошовий приз)",
      post: analysis.post, tags: ["#конкурси", ...(prof.length ? prof : ["#усім"])].join(" "), hook: JSON.stringify(meta),
    },
  });
}

// ─────────────── 📊 Ціни тижня (раз на тиждень; цифри рахує код, не GPT) ───────────────

async function uahRates(): Promise<Record<string, number>> {
  const rates: Record<string, number> = { UAH: 1, USD: 41.5, EUR: 48 }; // запасні, якщо НБУ не відповів
  try {
    const res = await fetch("https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json", { signal: AbortSignal.timeout(10000) });
    for (const r of (await res.json()) as { cc: string; rate: number }[]) if (r.cc === "USD" || r.cc === "EUR") rates[r.cc] = r.rate;
  } catch {
    /* запасні */
  }
  return rates;
}

const fmt = (n: number) => Math.round(n).toLocaleString("uk-UA").replace(/ /g, " ");
const roundNice = (n: number) => (n >= 10000 ? Math.round(n / 1000) * 1000 : n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 50) * 50);

// Усі творчі разові замовлення з сумою за 7 днів (і прийняті, і ні — головне, що творче й з ціною за проєкт)
export async function weeklyPrices(): Promise<string | null> {
  const rows = await prisma.article.findMany({
    where: { url: { startsWith: "ord:" }, createdAt: { gte: new Date(Date.now() - 7 * 86400000) }, hook: { startsWith: "{" } },
    select: { hook: true, stream: true, reason: true },
  });
  const rates = await uahRates();
  const by = new Map<Profession, number[]>();
  for (const r of rows) {
    if (!["one_off", "digital_product", "brand_ugc"].includes(r.stream ?? "")) continue;
    if (/не творча|ознаки шахрайства|суперечливі/.test(r.reason ?? "")) continue;
    const m = JSON.parse(r.hook!) as Meta;
    if (m.payStatus !== "amount" || m.period !== "project" || !rates[m.currency] || m.prof === "other") continue;
    const uah = ((m.payMin + m.payMax) / 2) * rates[m.currency]!;
    if (uah < 100 || uah > 500000) continue; // сміття в даних
    by.set(m.prof, [...(by.get(m.prof) ?? []), uah]);
  }
  const groups = [...by.entries()].filter(([, v]) => v.length >= 3).sort((a, b) => b[1].length - a[1].length);
  const total = groups.reduce((s, [, v]) => s + v.length, 0);
  if (groups.length < 2 || total < 12) return null;

  const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
  let top: [Profession, number] = [groups[0]![0], 0];
  for (const [p, v] of groups) for (const x of v) if (x > top[1]) top = [p, x];
  const lines = groups.map(([p, v]) =>
    `— ${PROF_NAMES[p]}: від ${fmt(roundNice(Math.min(...v)))} до ${fmt(roundNice(Math.max(...v)))} грн, найчастіше ~${fmt(roundNice(median(v)))} грн (${v.length});`);
  lines[lines.length - 1] = lines[lines.length - 1]!.replace(/;$/, ".");
  return [
    "**Скільки платили креаторам за замовлення цього тижня**",
    `Порахували ${total} оплачуваних разових замовлень з бюджетом, які бачили за 7 днів:`,
    lines.join("\n"),
    `Найдорожче — ${PROF_NAMES[top[0]]} за ${fmt(roundNice(top[1]))} грн. Суми в доларах і євро перераховано в гривні за курсом НБУ.`,
    "Збережіть, щоб знати, скільки просити за свою роботу.",
  ].join("\n\n");
}

// ─────────────── 💡 «Від замовлення до власного продукту» (місток до SkyNovix) ───────────────

// Банк ідей: професія → що робить на замовлення → який цифровий продукт з цього зробити. Йдемо по колу.
export const PRODUCT_IDEAS: { prof: string; tag: string; from: string; to: string }[] = [
  { prof: "дизайнер презентацій", tag: "#дизайн", from: "робить презентації на замовлення", to: "набір шаблонів презентацій" },
  { prof: "фотограф", tag: "#фото", from: "обробляє фото клієнтам", to: "пресети для Lightroom" },
  { prof: "музикант", tag: "#музика", from: "пише музику й джингли для клієнтів", to: "набір семплів чи лупів" },
  { prof: "ілюстратор", tag: "#ілюстрація", from: "малює на замовлення", to: "набір стікерів або цифрових ілюстрацій" },
  { prof: "графічний дизайнер", tag: "#дизайн", from: "робить банери й пости для соцмереж", to: "шаблони для Instagram" },
  { prof: "відеомонтажер", tag: "#відео", from: "монтує ролики клієнтам", to: "пак переходів, титрів чи LUT-ів" },
  { prof: "копірайтер", tag: "#тексти", from: "пише тексти для бізнесу", to: "збірку шаблонів текстів чи гайд" },
  { prof: "3D-художник", tag: "#3D", from: "робить 3D-моделі на замовлення", to: "набір 3D-моделей чи текстур" },
  { prof: "веб-дизайнер", tag: "#дизайн", from: "малює сайти й лендинги", to: "UI-кіт або шаблон сайту" },
  { prof: "викладач чи експерт", tag: "#усім", from: "проводить консультації й заняття", to: "посібник, чекліст чи міні-курс" },
  { prof: "дизайнер шрифтів і леттерингу", tag: "#дизайн", from: "робить написи й логотипи", to: "власний шрифт" },
  { prof: "ігровий художник", tag: "#геймдев", from: "малює арт для ігор", to: "набір ігрових асетів (спрайти, тайли, іконки)" },
];

// Останнє речення — фіксоване (не GPT), лише факти з content/skynovix-facts.md
const SKYNOVIX_LINES = [
  "Продавати такі товари можна на SkyNovix — українському маркетплейсі цифрових товарів: покупцям не треба реєструватися, а виплати приходять на українську картку.",
  "На SkyNovix можна створити сторінку автора й продавати такі файли — з виплатами двічі на місяць на українську картку.",
  "Такий продукт можна викласти на SkyNovix: сторінки товарів індексуються в Google, тож покупці можуть знайти вас через пошук.",
];

export async function productPost(index: number): Promise<{ post: string; tag: string; title: string }> {
  const idea = PRODUCT_IDEAS[index % PRODUCT_IDEAS.length]!;
  const r = await askJson<{ post: string }>(
    `Ти пишеш для українського Telegram-каналу «Замовлення для креаторів 🇺🇦». Рубрика «Від замовлення до власного продукту»:
людина, яка бере замовлення, щоразу продає свій час; покажи, як ту саму навичку перетворити на цифровий продукт,
що продається багато разів.
Напиши пост українською, 450–750 символів:
- перший рядок жирним: **<Професія>? <коротка думка про продукт>**;
- 1–2 речення: за кожне замовлення платять один раз, але напрацювання вже є;
- 3–4 конкретні кроки, КОЖЕН З НОВОГО РЯДКА, що починається з «— » (з малої літери, в кінці «;», в останнього «.»): що зібрати, як оформити, що додати;
- одне речення-висновок про те, що продукт продається, поки людина працює над новими замовленнями.
Не обіцяй сум заробітку й «пасивного доходу», не називай інших платформ і маркетплейсів, без посилань і хештегів,
звертайся на «ви» по всьому тексту, і в заголовку теж. Про SkyNovix НЕ пиши — його речення код додасть сам.
${LANGUAGE}`,
    `Професія: ${idea.prof}. Що робить на замовлення: ${idea.from}. Продукт: ${idea.to}.`,
    "product_post",
    { type: "object", additionalProperties: false, required: ["post"], properties: { post: { type: "string" } } },
  );
  const post = `${r.post.trim().replace(/SkyNovix[^\n]*$/i, "").trim()}\n\n${SKYNOVIX_LINES[index % SKYNOVIX_LINES.length]}`;
  return { post, tag: idea.tag, title: `Від замовлення до продукту: ${idea.prof}` };
}
