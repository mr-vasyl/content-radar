// 🚀 Пости про SkyNovix для Threads — ЛИШЕ за фактами з content/skynovix-facts.md.
// Один запуск = один пост (інколи мультичастинний 1/N). Запуски розкидані по дню (3–5 на день).
// Голос — від бренду («ми»), ОДИН суцільний пост без нумерації і без заклику в кінці. Товари з сайту НЕ публікуємо (власник).
import { readFileSync } from "node:fs";
import { prisma } from "../db.ts";
import { askJson, LANGUAGE } from "../gpt.ts";
import { factCheck, factNote } from "../factCheck.ts";
import { sendPost } from "../sendToTelegram.ts";
import { fetchArticles } from "../fetchArticles.ts";
import { extractArticle } from "../extractText.ts";
import type { RunOptions } from "./types.ts";

const FACTS_PATH = "content/skynovix-facts.md";
const AGENT_PATH = "content/skynovix-agent.md";

// Запасні теми, коли корисної експертної статті не знайшлось (основне — пости за статтями, див. EXPERT_SOURCES).
// Власник 2026-10-21: пости «продавай цифрові товари» збирають мало переглядів; мета — щоб автори вели на SkyNovix
// свій блог (стрічка індексується), збирали читачів і робили платну підписку на найкращі дописи. Тому теми — про блог,
// аудиторію й підписку, а не про товари. Професія чергується (PROFESSIONS).
export const THEMES = {
  own_audience: "Чому {prof} варто мати власний блог, а не лише соцмережі: алгоритм ріже охоплення, а свої читачі лишаються; дописи «Усім» і «Лише читачам» ще й індексує Google — на конкретному прикладі",
  blog_rubrics: "4–5 рубрик для блогу {prof}: що публікувати щотижня, щоб читачі поверталися (конкретні назви рубрик і приклади дописів)",
  behind_scenes: "Що {prof} може показувати за лаштунками — процес, чернетки, помилки, рішення: що з цього зробити дописом «Усім», що — «Лише читачам», а що — для підписників",
  social_to_readers: "Як {prof} перевести аудиторію з Instagram, TikTok чи Threads у свій блог: що пообіцяти за безкоштовну кнопку «Стежити» (дописи «Лише читачам») — конкретні приклади",
  access_plan: "Контент-план тижня для {prof}: 2–3 конкретні дописи «Усім», «Лише читачам» (заблурені, відкриваються після «Стежити») і «Лише підписникам»",
  subscription_ideas: "Що {prof} може давати платним підписникам: 2–3 рівні з конкретним наповненням (без цін і без того, чого немає у факт-листі)",
  first_paid_post: "Перший платний допис для {prof}: що саме закрити блюром, як назвати й що показати у відкритій частині, щоб захотілось підписатися",
  google_blog: "Як {prof} назвати допис і написати перший абзац, щоб блог знаходили в Google (дописи «Усім»/«Лише читачам» індексуються; без обіцянок топу) — приклад до/після",
} as const;
const PROFESSIONS = [
  "ілюстратору чи художниці", "дизайнеру", "фотографу", "відеомейкеру", "музиканту", "письменниці чи автору текстів",
  "викладачу чи експерту", "розробнику", "геймдев-автору", "AI-креатору",
];

// Стара ротація «по фішках» (2026-10-16) — лишаємо як довідку, у ротації не бере участі
export const FEATURE_THEMES = {
  // 💸 гроші
  fees: "Комісії: 6% донати, 8% підписки, 10% товари; банківські комісії беремо на себе; без абонплати (розділ 2) — порахуй на прикладі одного продажу",
  currencies: "Ціна товару в UAH, USD або EUR, а виплата завжди в гривнях на українську карту чи IBAN (розділ 4)",
  // 🛒 покупка
  guest_checkout: "Покупка без реєстрації — гостьовий чекаут; покупцю не треба створювати акаунт (розділ 4) — сценарій покупця з Threads/Instagram",
  payment_methods: "Оплата через Monobank: картка українського чи міжнародного банку, Apple Pay, Google Pay (розділ 4)",
  pwyw: "PWYW — «плати скільки хочеш»: коли й навіщо автору таке вмикати (розділ 5)",
  // 📦 товари
  categories: "10 категорій цифрових товарів — приклади, що може продавати фотограф, музикант, викладач, дизайнер (розділ 5)",
  files: "Файл товару: ZIP, PDF, EPUB, MP4, MP3, JPG, PNG, WEBP, TXT до 1 ГБ; великий курс — TXT з посиланням на Google Drive/Dropbox (розділ 5.1)",
  video_preview: "Відео-превʼю без звуку: на компʼютері грає при наведенні курсора в каталозі, на телефоні — на сторінці товару поруч із фото (розділ 5.1)",
  watermarks: "Водяні знаки на превʼю зображень — показати роботу й не віддати її безкоштовно (розділ 6)",
  exclusive: "Ексклюзивний товар: купити можна лише один раз, після продажу зникає з каталогу назавжди — для унікальних робіт (розділ 6)",
  reviews: "Відгуки й рейтинг (зірки + текст) від покупців — як вони допомагають наступним продажам (розділ 6)",
  moderation: "Товари проходять модерацію перед публікацією — що це дає покупцям і авторам (розділ 6)",
  product_card: "Як оформити картку товару: назва (що + для кого + формат), опис, категорія, превʼю — на прикладі «до/після» (розділ 5.1)",
  google: "Google індексує сторінки товарів і дописи «Усім»/«Лише читачам» (платні — ні); що допомагає знайти — назва, опис, унікальність; без обіцянок топу (розділ 5.1)",
  bilingual: "Сайт українською й англійською: картку товару можна заповнити двома мовами (назва й опис для кожної) — товар бачать англомовні покупці; автор заповнює сам (розділ 5)",
  author_direction: "Напрям автора (художники, фотографи, музиканти, письменники, розробники, AI-креатори…) — власна SEO-сторінка напряму (розділ 5)",
  // 📝 дописи й аудиторія
  access_levels: "Три рівні доступу дописів: «Усім», «Лише читачам», «Лише підписникам» — приклад, що автор публікує на кожному рівні (розділ 5)",
  readers_only: "«Лише читачам»: допис заблурений, відкривається після безкоштовної кнопки «Стежити» — так автор збирає свою аудиторію (розділ 5)",
  blur: "Заблурені дописи: відвідувач бачить, що за блуром є контент — і це мотивує стежити чи підписатися (розділ 5)",
  subscription_tiers: "Платна підписка за рівнями з помісячним автосписанням; валюта підписки фіксується назавжди — обирай уважно (розділ 5)",
  blog_funnel: "Сторінка автора як блог: «Усім» → «Стежити» → платна підписка — шлях читача на прикладі (розділ 5)",
  // 🎙 донати й стріми
  obs_widget: "Донати на стрімі: посилання віджета → OBS Browser Source → алерти під час стріму автоматично (розділ 5)",
  discord: "Сповіщення про донати в Discord-канал через вебхук (розділ 5)",
  donation_gifs: "GIF у донатах: донатер обирає GIF, який завантажив автор, — він у алерті на стрімі й у Discord (розділ 5)",
  banned_words: "Список заборонених слів: слова зі списку в повідомленні донатера стають *** (розділ 5)",
  donation_currency: "Валюту донатів можна змінити будь-коли (на відміну від підписки); комісія на донати 6% (розділи 2, 5)",
} as const;

// Особливі пости — не в ротації, бот вмикає їх сам (див. pickTheme)
const SPECIAL = {
  payday: "📅 Сьогодні день виплат (14 чи 28 число): як працюють виплати — двічі на місяць, період утримання, Monobank/PrivatBank/IBAN, податки для фізособи й ФОП (розділ 3)",
  holiday: "🎁 Скоро свято: які сезонні цифрові товари автор може підготувати заздалегідь (листівки, шаблони, планери, фото, музика, курси) і як оформити їх вчасно",
  question: "💬 Пост-питання до аудиторії: щоб люди відповідали в коментарях",
} as const;
type Theme = keyof typeof THEMES | keyof typeof SPECIAL;
const label = (t: Theme) => ({ ...THEMES, ...SPECIAL } as Record<Theme, string>)[t];

// Свята, перед якими люди купують подарунки: [місяць, день, назва]. Великдень — рухомий, не беремо.
const HOLIDAYS: [number, number, string][] = [
  [2, 14, "День закоханих"],
  [3, 8, "8 березня"],
  [12, 6, "День святого Миколая"],
  [12, 25, "Різдво"],
  [12, 31, "Новий рік"],
];
const HOLIDAY_AHEAD = [5, 12]; // за скільки днів до свята писати (автору треба час підготувати товар)

const DAY = 86400000;
function kyivToday(): Date {
  return new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" }) + "T00:00:00Z");
}
function upcomingHoliday(today: Date): string | null {
  for (const [m, d, name] of HOLIDAYS) {
    for (const year of [today.getUTCFullYear(), today.getUTCFullYear() + 1]) {
      const days = (Date.UTC(year, m - 1, d) - today.getTime()) / DAY;
      if (days >= HOLIDAY_AHEAD[0]! && days <= HOLIDAY_AHEAD[1]!) return `${name} (через ${days} дн.)`;
    }
  }
  return null;
}

// Що саме писати для особливих постів (перекриває загальне форматування)
function specialBrief(theme: Theme, holiday: string | null): string {
  if (theme === "payday")
    return `Сьогодні ${kyivToday().getUTCDate()} число — день виплат на SkyNovix. Почни саме з цього. Далі — лише факти з розділу 3.
Не пиши, що виплата вже прийшла чи прийде «сьогодні до вечора» — про час зарахування фактів немає.`;
  if (theme === "holiday")
    return `Найближче свято: ${holiday ?? "День святого Миколая"}. Тих, хто шукає подарунки, називай «покупці». Порада авторам: підготувати сезонний цифровий товар заздалегідь, поки люди шукають подарунки.
Дай 3–5 конкретних ідей товарів для різних напрямів. НЕ пиши, що товар на SkyNovix можна «подарувати» іншій людині
чи купити подарунковий сертифікат — такого у факт-листі немає. Покупець купує товар собі.`;
  if (theme === "question")
    return `Це пост-ПИТАННЯ, щоб люди відповідали в коментарях. Інше форматування, ніж у зразку:
- 1–4 коротких рядки контексту (ситуація, яку автор впізнає), потім ОДНЕ просте питання до читачів окремим рядком;
- 150–350 символів, без жирного, без переліку, без реклами — SkyNovix можна не згадувати зовсім;
- питання, на яке легко відповісти з досвіду: що зупиняє почати продавати, яку ціну поставили б на конкретний товар
  (наприклад, набір пресетів, шаблон, курс), що купували в інших авторів, де шукають покупців, скільки часу на це йде;
- не питай про те, чого немає на платформі, і не обіцяй нічого;
- питання НЕ має повторювати питання з останніх постів.`;
  return "";
}

// Код-охоронці: те, чого НЕМА на платформі (розділ 7) і небезпечні обіцянки. GPT на слово не віримо.
const FORBIDDEN: [RegExp, string][] = [
  [/промокод|знижков\w* код|купон/i, "промокоди"],
  [/бандл|пакет\w* (товар|продаж)|набір кількох товарів/i, "бандли"],
  [/власн\w* домен|свій домен|кастомн\w* домен/i, "власний домен"],
  [/конструктор\w* лендінг|лендінг/i, "лендінги"],
  [/телеграм-бот|telegram-бот|бот-продав|продаж\w* (у|в|через) (телеграм|telegram)/i, "продаж через Telegram-бота"],
  [/email-розсил|e-mail-розсил|розсилк|воронк/i, "email-автоматизація"],
  [/\butm\b|utm-|джерел\w* трафіку/i, "UTM"],
  // перекладу немає: сайт просто двомовний, картку двома мовами заповнює сам автор (власник 2026-10-14)
  [/(авто|автоматичн\w* |ai[- ]?|штучн\w* інтелект\w* )переклад|переклад\w* (автоматичн|сам|за вас)|перекладе/i, "автопереклад — його немає, автор сам заповнює картку двома мовами"],
  [/ai-(асистент|чат|аналіт)|штучн\w* інтелект\w* (проаналіз|аналітик)|чат-бот/i, "AI-асистент"],
  [/швидк\w* (лінк|посилан)\w*.{0,20}оплат|оплат\w* в обхід/i, "швидкі лінки на оплату"],
  [/stripe|liqpay|paypal|wayforpay|fondy|portmone/i, "інші платіжні провайдери"],
  [/миттєв\w* (виплат|вивед|вивід|зарахув)|виплат\w* (щодня|щотижня|миттєво|одразу)/i, "миттєві виплати"],
  [/гарант\w* (дох|продаж|заробіт)|заробиш|заробите \d/i, "гарантії заробітку"],
  // індексація ≠ позиції: жодних обіцянок місця в пошуку
  [/топ[- ]?(google|гугл|пошук|видач)|перш\w* (місц|сторінк|позиц)|гарантован\w* (знайд|в пошук|в google|у google|трафік)|вивед\w* (в|у) топ/i, "обіцянки позицій у Google"],
  [/ключов\w* слов\w* (у|в) (полі|налаштуван)|\bтег(и|ів|ами)\b|мета-?тег|seo-налаштуван/i, "поля для SEO, яких немає у факт-листі"],
  // те, що є на Patreon, але немає на SkyNovix
  // підписка буває лише платна; «Стежити» — не підписка (власник: «не плутати»)
  [/безкоштовн\w* підписк|підписк\w* (безкоштовн|за 0)|стеженн\w* (—|-|це|як) підписк/i, "безкоштовна підписка — її немає, «Стежити» це не підписка"],
  [/безкоштовн\w* (членств|рів)|річн\w* підписк|щорічн\w* підписк|вітальн\w* повідомл|ранн\w* доступ|опитуван|мерч/i, "можливості інших платформ, яких немає на SkyNovix"],
  [/подарунков\w* (сертифікат|карт)|подарува\w* (товар|підписк|іншій|другу|комусь)|купи\w* (у|в) подарунок (іншій|другу)/i, "дарування товару іншій людині — такого немає у факт-листі"],
  [/patreon|патреон|boosty|бусті|gumroad|ko-fi|etsy|етсі|substack|kickstarter|teachable|kajabi|podia|bandcamp|\bkdp\b|onlyfans|donationalerts|донейшн ?алертс|streamlabs|стрімлабс|streamelements/i, "назви інших платформ"],
  [/(інтеграц\w*|підключ\w*) (з|до|із) (twitch|твіч|youtube|ютуб|tiktok|тікток|kick)/i, "інтеграції зі стрім-платформами — у факт-листі лише OBS-віджет"],
  // обіцянки швидкості виплат: у факт-листі лише «14 та 28 числа» + період утримання
  [/не (треба|потрібно|доведеться) (чекати|довго)|без очікуван\w* (виплат|грош)|швидк\w* виплат|гроші (одразу|відразу|швидко)/i, "обіцянки швидкості виплат"],
];
const ALLOWED_PERCENTS = new Set(["6", "8", "10", "18", "5"]);
const ALLOWED_GB = new Set(["1"]); // ліміт файлу товару — 1 ГБ

// article — текст експертної статті: відсотки з неї дозволені (кейс), решта — лише з факт-листа
function guard(text: string, article?: string): string[] {
  const problems = FORBIDDEN.filter(([re]) => re.test(text)).map(([, why]) => `згадано ${why} — цього немає на платформі`);
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)) {
    const inArticle = article && new RegExp(`${m[1]!.replace(/[.,]/, "[.,]")}\\s?%`).test(article);
    if (!ALLOWED_PERCENTS.has(m[1]!) && !inArticle) problems.push(`відсоток ${m[1]}% не з факт-листа і не зі статті`);
  }
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s?(ГБ|Гб|гб|GB|Gb)/g)) {
    if (!ALLOWED_GB.has(m[1]!)) problems.push(`розмір ${m[1]} ГБ не з факт-листа (ліміт — 1 ГБ)`);
  }
  if (/(три|3|кілька|багат\w*) мов|польськ|німецьк|іспанськ|французьк|італійськ/i.test(text)) problems.push("інші мови — сайт лише українською й англійською");
  if (/збільш\w* ліміт|ліміт\w* (збільш|зросте|буде більш)|скоро (більше|до \d)/i.test(text)) problems.push("обіцянки збільшити ліміт");
  return problems;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["parts"],
  properties: { parts: { type: "array", minItems: 1, maxItems: 1, items: { type: "string" } } }, // один пост
} as const;

const QUESTION_POSTS = false;
const PAYDAY_POSTS = false;
const QUESTION_EVERY_H = 40; // пост-питання — приблизно раз на півтора дня

async function pickTheme(): Promise<Theme> {
  const today = kyivToday();
  const sinceDays = async (theme: Theme) => {
    const p = await prisma.promoPost.findFirst({ where: { theme }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    return p ? (Date.now() - p.createdAt.getTime()) / DAY : Infinity;
  };
  // 1) день виплат — перший пост дня 14 і 28 числа
  // вимкнено власником 2026-10-16 («два дні кидаєш про ФОП» — податки/виплати не цікаві); увімкнути — PAYDAY_POSTS = true
  if (PAYDAY_POSTS && [14, 28].includes(today.getUTCDate()) && (await sinceDays("payday")) > 1) return "payday";
  // 2) свято за 5–12 днів — один пост на свято
  if (upcomingHoliday(today) && (await sinceDays("holiday")) > HOLIDAY_AHEAD[1]! - HOLIDAY_AHEAD[0]! + 1) return "holiday";
  // 3) пост-питання — вимкнено власником 2026-10-14 («не треба пост питань»); щоб увімкнути — QUESTION_POSTS = true
  if (QUESTION_POSTS && (await sinceDays("question")) * 24 >= QUESTION_EVERY_H) return "question";

  const recent = await prisma.promoPost.findMany({
    where: { theme: { in: Object.keys(THEMES) } },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { theme: true },
  });
  const last = recent[0]?.theme;
  // найдавніше використана тема, але не та сама, що минулого разу
  const lastUsed = (t: Theme) => {
    const i = recent.findIndex((r) => r.theme === t);
    return i === -1 ? Infinity : i;
  };
  const candidates = (Object.keys(THEMES) as (keyof typeof THEMES)[]).filter((t) => t !== last);
  return candidates.sort((a, b) => lastUsed(b) - lastUsed(a))[0]!;
}

// 📚 Експертні статті про монетизацію творчості (власник 2026-10-21: «бери експертні статті, бери головне — і вже маєш
// пост; пиши як професійний копірайтер»). Свіжість не критична — беремо за 45 днів, кожну статтю лише раз.
const EXPERT_SOURCES = [
  { name: "Simon Owens", url: "https://simonowens.substack.com/feed" }, // бізнес авторів і розсилок
  { name: "Social Media Examiner", url: "https://www.socialmediaexaminer.com/feed/" },
  { name: "Buffer", url: "https://buffer.com/resources/rss/" },
  { name: "Influencer Marketing Hub", url: "https://influencermarketinghub.com/feed/" },
  { name: "Embedded", url: "https://embedded.substack.com/feed" },
  { name: "Creator Economy", url: "https://creatoreconomy.so/feed" },
  { name: "Tubefilter", url: "https://www.tubefilter.com/feed/" },
  { name: "Spotify Newsroom", url: "https://newsroom.spotify.com/feed/" },
  { name: "DIY Musician", url: "https://diymusician.cdbaby.com/feed/" }, // музиканти
  { name: "Ari's Take", url: "https://aristake.com/feed/" },
  { name: "GameDiscoverCo", url: "https://newsletter.gamediscover.co/feed" }, // геймдев
  { name: "How To Market A Game", url: "https://howtomarketagame.com/feed/" },
  { name: "Jane Friedman", url: "https://janefriedman.com/feed/" }, // письменники
  { name: "ALLi", url: "https://selfpublishingadvice.org/feed/" },
  { name: "Written Word Media", url: "https://www.writtenwordmedia.com/feed/" },
  { name: "BookBub", url: "https://insights.bookbub.com/feed/" },
  { name: "Inbox Collective", url: "https://inboxcollective.com/feed/" },
];
const EXPERT_MAX_AGE_DAYS = 45;
const EXPERT_TRIES = 4; // скільки статей пробуємо за запуск, поки GPT не знайде корисну

interface ExpertArticle { source: string; title: string; url: string; text: string }

async function expertCandidates(): Promise<{ source: string; title: string; url: string; publishedAt: Date | null }[]> {
  const all: { source: string; title: string; url: string; publishedAt: Date | null }[] = [];
  for (const s of EXPERT_SOURCES) {
    try {
      for (const a of await fetchArticles({ ...s, account: "knowledge" })) all.push(a);
    } catch (err) {
      console.error(`📚 ${s.name}: ${(err as Error).message}`);
    }
  }
  const cutoff = Date.now() - EXPERT_MAX_AGE_DAYS * 86400000;
  const fresh = all.filter((a) => a.publishedAt && a.publishedAt.getTime() >= cutoff);
  const used = new Set(
    (await prisma.article.findMany({ where: { url: { in: fresh.map((a) => a.url) } }, select: { url: true } })).map((r) => r.url),
  );
  // різні джерела по черзі (щоб не 4 пости поспіль про книжки), від новіших
  const bySource = new Map<string, typeof fresh>();
  for (const a of fresh.filter((a) => !used.has(a.url)).sort((x, y) => y.publishedAt!.getTime() - x.publishedAt!.getTime()))
    bySource.set(a.source, [...(bySource.get(a.source) ?? []), a]);
  const lastSources = (await prisma.promoPost.findMany({ where: { theme: "expert" }, orderBy: { createdAt: "desc" }, take: 6, select: { text: true } }))
    .map((p) => p.text.match(/^📚 (.+)$/m)?.[1]);
  const order = [...bySource.keys()].sort((a, b) => Number(lastSources.includes(a)) - Number(lastSources.includes(b)));
  const out: typeof fresh = [];
  for (let i = 0; out.length < EXPERT_TRIES && i < 10; i++) for (const s of order) if (bySource.get(s)![i] && out.length < EXPERT_TRIES) out.push(bySource.get(s)![i]!);
  return out;
}

async function markExpert(a: { source: string; title: string; url: string }, status: "promo_used" | "promo_rejected", reason: string) {
  await prisma.article.upsert({
    where: { url: a.url },
    update: { status, reason },
    create: { url: a.url, title: a.title, source: a.source, status, reason, account: "promo" },
  });
}

const EXPERT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["useful", "insight", "parts"],
  properties: {
    useful: { type: "boolean" },
    insight: { type: "string" },
    parts: { type: "array", minItems: 1, maxItems: 1, items: { type: "string" } },
  },
} as const;

function expertBrief(a: ExpertArticle): string {
  return `ФОРМАТ: пост на основі ЕКСПЕРТНОЇ СТАТТІ (нижче). Ти — сильний копірайтер старої школи, ще до ШІ: один пост —
одна думка, гачок у першому рядку, конкретика з кейсу, ритм, жодної води. ШІ лише допомагає, текст має бути живим.

1. useful — true ЛИШЕ якщо стаття — КЕЙС (як конкретний автор зібрав аудиторію чи почав заробляти) або ПРАКТИЧНИЙ
   ПРИЙОМ (як збирати й утримувати аудиторію, що публікувати, як запустити й наповнити платну підписку чи членство,
   як перетворити підписників соцмереж на власних читачів, як розсилка/блог дає стабільний дохід), з якого виходить
   конкретний пост. false — новини й анонси індустрії, етика й суперечки про AI, суди, рейтинги й чарти, огляд одного
   застосунку, реклама сервісу, специфіка США (податки, закони), загальна теорія без дій. Тоді parts = [""].
   Сумніваєшся — false: краще пропустити статтю, ніж написати розмитий пост.
2. insight — одне речення: головна думка статті своїми словами.
3. Якщо useful — post (parts[0]):
   - 1-й рядок — гачок із головною думкою (можна цифра чи результат із кейсу);
   - суть прийому чи кейсу своїми словами, конкретно: що зробив автор, що вийшло, чому спрацювало;
   - як застосувати українському автору — 2–4 конкретні кроки (через «— »);
   - 1–2 речення, як це зробити на SkyNovix — ЛИШЕ факти з факт-листа, природно, без реклами й без «ми найкращі»;
   - можна «західні автори», «дослідження показало», ім'я автора кейсу; цифри — ЛИШЕ ті, що є в статті;
   - НЕ називай платформи-конкуренти (Patreon, Substack, Gumroad, Etsy, Ko-fi, Kickstarter, Teachable, Kajabi, Podia,
     Bandcamp, Amazon KDP тощо) — пиши «платформа для підписок», «маркетплейс», «сервіс розсилок».
     YouTube, Instagram, TikTok, Threads, Spotify, Google — можна.

Стаття: «${a.title}» (${a.source})
${a.text}`;
}

export async function runPromo({ dryRun, send }: RunOptions, forcedTheme?: Theme | "expert"): Promise<void> {
  const facts = readFileSync(FACTS_PATH, "utf8");
  const agent = readFileSync(AGENT_PATH, "utf8");
  const special = forcedTheme && forcedTheme !== "expert" ? forcedTheme : await pickTheme();
  // Спершу — пост за експертною статтею (крім свят); не знайшлось корисної — звичайний формат
  const tryExpert = forcedTheme === "expert" || (!forcedTheme && special !== "holiday");
  const expertQueue: ExpertArticle[] = [];
  if (tryExpert) {
    for (const c of await expertCandidates()) {
      const ex = await extractArticle(c.url);
      if (!ex || ex.text.length < 1500) {
        if (!dryRun) await markExpert(c, "promo_rejected", "не вдалося прочитати статтю");
        continue;
      }
      expertQueue.push({ ...c, text: ex.text.slice(0, 9000) });
    }
  }
  let expert: ExpertArticle | null = null;
  let theme: Theme | "expert" = special;

  const recent = await prisma.promoPost.findMany({ orderBy: { createdAt: "desc" }, take: 15, select: { text: true } });
  const recentList =
    recent.map((r) => `- ${r.text.split("\n").find((l) => l.trim() && !l.startsWith("📚"))!.slice(0, 120)}`).join("\n") || "(ще не було)";

  const system = `${agent}

## Уточнення власника
- Пиши ВІД БРЕНДУ, «ми» («На SkyNovix ми…», «Ми беремо банківські комісії на себе»). Не від першої особи «я».
- Пост для Threads — ЗАВЖДИ ОДИН суцільний текст, без нумерації «1/3». Зазвичай 300–600 символів; якщо тему варто
  розкрити кроками — до ~1000 (Threads сам розбиває довгий текст на ланцюжок).
- Без заклику в кінці («посилання в шапці профілю», «переходьте» тощо) і без посилань — skynovix.com у тексті не пиши.
- Конкретні товари й авторів із сайту НЕ згадуй — пиши про платформу.
- НЕ пиши «люди» (людей, людям…). Називай точно, під тему: «покупці» (купують товари), «користувачі» (платформи),
  «читачі» (стежать за автором), «підписники» (платна підписка), «прихильники» чи «аудиторія» (донати, підтримка),
  «автори» (ті, хто продає).
- Закриті дописи називай «заблурені» (блур), а не «розмиті» — так кажуть креатори.
- НЕ ПЛУТАЙ: «підписка» — ЛИШЕ платна, за рівнями, з помісячним автосписанням. «Стежити» — це НЕ підписка, а безкоштовна
  кнопка; ті, хто стежить, — «читачі», вони бачать дописи «лише читачам». Ніколи не пиши «безкоштовна підписка».

## Мета постів (власник 2026-10-21)
Залучити на SkyNovix авторів різних професій — від музики до ігор, — щоб вони вели на своїй сторінці стрічку-блог
(дописи «Усім» і «Лише читачам» індексуються Google), ділились нею зі своєю аудиторією і робили платну підписку на
найкращі дописи. Але НЕ в лоб і без реклами: пост дає автору цінність — прийом, кейс, ідею, — а висновок «мені потрібен
власний блог з читачами й підпискою» він робить сам. SkyNovix з'являється наприкінці як природний інструмент, 1–2 речення.
Теми, що найкраще ведуть до мети: як збирати власну аудиторію, а не залежати від алгоритмів; що публікувати регулярно;
що давати платним підписникам; як перетворити підписників у соцмережах на читачів; як блог допомагає знаходити автора в Google.

## Як писати (власник 2026-10-17: пости-«інструкції» про оплату/чекаут/PWYW — «лажа»; треба цікаве й корисне)
- Пост — це КОРИСНА ШТУКА, яку автор може взяти й застосувати сьогодні: конкретні ідеї, назви, приклади до/після,
  кроки. Читач має подумати «о, збережу». SkyNovix — інструмент усередині (1–2 речення), а не тема поста.
- Будь КОНКРЕТНИМ: не «шаблони», а «шаблон тижневого контент-плану для Instagram у Notion»; не «опис», а сам приклад
  назви чи опису. Узагальнення без прикладів — брак.
- Перший рядок — гачок, що обіцяє користь (наприклад: «7 цифрових товарів, які фотограф може зробити з архіву за
  вихідні»). НЕ починай з «Коли…», «Іноді…», «Буває так…», «Багато авторів…».
- НЕ закінчуй формулою «Це не X, але Y», гаслами («Менше хаосу. Більше порядку.») чи загальною мораллю. Кінець —
  остання корисна порада або конкретна дія.
- Не пиши про оплату, способи оплати, валюти, чекаут, PWYW, податки, ФОП, виплати — це нецікаво (власник).
- НЕ роби головною думкою «продавайте цифрові товари» — такі пости набирають мало переглядів (власник 2026-10-21).
  Товари можна згадати мимохідь, але фокус — блог, читачі, аудиторія, підписка.
- Не пиши «все в одному профілі», «по шматках», «розпорошується» — уже було.
- Не вигадуй статистику, ціни, «дослідження» й реальних авторів. Приклади товарів — придумані, як ідеї.
- Форма: короткі абзаци з порожнім рядком; для ідей і кроків — перелік через «— » (кожен пункт конкретний).
  До ~1000 символів. **Жирне** — максимум одне.
Зразок власника — підхід «до/після» (бери тон і конкретність, не слова):
"Можна створити класний цифровий продукт, але покупці просто не знайдуть його в Google.

Наприклад, ви продаєте відеоурок із малювання. Назва «Урок з малювання» мало що говорить і покупцям, і пошуковику.

А от «Як намалювати портрет аквареллю: відеоурок для початківців» — уже конкретніше. Покупець розуміє, що отримає, а Google — про що сторінка.

Тому не копіюйте чужі описи й не обмежуйтеся кількома загальними словами. Розкажіть, що саме у вашому продукті, кому він підійде та яку користь дасть.

Унікальний текст не гарантує перших позицій у пошуку, але допомагає пошуковикам зрозуміти сторінку й визначити, за якими запитами її показувати."

- Не повторюй думки й гачки з останніх постів (список нижче).
${LANGUAGE}

## Факт-лист (єдине джерело правди)
${facts}`;

  // професія чергується по колу — щоб ідеї були то для фотографа, то для музиканта, то для викладача
  const prof = PROFESSIONS[(await prisma.promoPost.count()) % PROFESSIONS.length]!;
  const recentBlock = `Останні пости (не повторюй їхні думки й перші рядки):\n${recentList}`;

  // 📚 Спершу експертні статті: GPT сам каже, чи є в статті корисна думка; немає — пробуємо наступну
  type ExpertOut = { useful: boolean; insight: string; parts: string[] };
  let parts: string[] = [];
  let expertInsight = "";
  for (const a of expertQueue) {
    const out = await askJson<ExpertOut>(system, `${expertBrief(a)}\n\n${recentBlock}`, "promo_expert", EXPERT_SCHEMA);
    if (!out.useful || !out.parts[0]?.trim()) {
      console.log(`📚 не підійшла: ${a.title} — ${out.insight}`);
      if (!dryRun) await markExpert(a, "promo_rejected", out.insight || "немає корисної думки");
      continue;
    }
    expert = a;
    theme = "expert";
    expertInsight = out.insight;
    parts = [out.parts[0].trim()];
    break;
  }

  const user = expert
    ? `${expertBrief(expert)}\n\n${recentBlock}`
    : (() => {
        const brief = specialBrief(theme as Theme, upcomingHoliday(kyivToday()));
        return `Тема цього поста: ${label(theme as Theme).replaceAll("{prof}", prof)}.${brief ? `\n\n${brief}` : ""}\n\n${recentBlock}`;
      })();

  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    // для експертного поста перша чернетка вже є (з перевірки корисності)
    if (!(expert && attempt === 1)) {
      const out = expert
        ? await askJson<ExpertOut>(system, user + feedback, "promo_expert", EXPERT_SCHEMA)
        : await askJson<{ parts: string[] }>(system, user + feedback, "promo", SCHEMA);
      parts = out.parts.map((p) => p.trim()).filter(Boolean); // **жирне** лишаємо — у Telegram воно видно
    }
    const problems = guard(parts.join("\n"), expert?.text);
    // стиль власника: замість «люди» — покупці/користувачі/читачі/прихильники; лише 1 спроба, пост через це не губимо
    if (attempt === 1 && /(^|[^а-яіїєґ'’])(люд(и|ей|ям|ьми|ях)|людин\w*)(?![а-яіїєґ])/i.test(parts.join("\n")))
      problems.push("слово «люди» — заміни на покупці/користувачі/читачі/підписники/прихильники за змістом");
    // власник: податки/ФОП — нецікаво; лише якщо тема про комісії
    if (attempt === 1 && /ПДФО|військов\w* збор|\bФОП\b|податк/i.test(parts.join("\n")))
      problems.push("податки й ФОП — нецікаво, прибери; пиши лише про тему");
    // шаблон, від якого власник утомився: «Коли…/Іноді…» на початку і «Це не X, але Y» в кінці
    if (attempt === 1 && /^\s*(Коли|Іноді|Буває|Багато авторів)/i.test(parts[0] ?? ""))
      problems.push("не починай з «Коли/Іноді/Буває/Багато авторів» — перший рядок має обіцяти конкретну користь");
    if (attempt === 1 && /Це не [^.]{0,80}, але/i.test(parts.join("\n")))
      problems.push("прибери кінцівку-формулу «Це не X, але Y» — закінчи конкретною порадою");
    if (attempt === 1 && /PWYW|плати скільки хочеш|гостьов\w* чекаут|Apple Pay|Google Pay/i.test(parts.join("\n")))
      problems.push("оплата/чекаут/PWYW — власнику нецікаво, прибери");
    // власник: загальні думки «все в одному профілі» вже опубліковані — пиши про конкретну фішку
    if (attempt === 1 && /по шматках|розпорош|в одному профілі|менше хаосу|більше порядку/i.test(parts.join("\n")))
      problems.push("загальна думка «все в одному профілі / розпорошення» — вже була; пиши лише про фішку теми з живим прикладом");
    if (!problems.length) break;
    console.log(`🚀 спроба ${attempt}: ${problems.join("; ")}`);
    if (attempt === 2) {
      console.log("🚀 пост не пройшов перевірку — не надсилаю");
      return;
    }
    feedback = `\n\nПопередня версія мала проблеми: ${problems.join("; ")}. Напиши заново без цього.`;
  }

  // Фактчек кожної частини проти факт-листа — та сама перевірка, що й для грантів
  const notes: string[] = [];
  for (const [i, part] of parts.entries()) {
    // експертний пост звіряємо і з факт-листом (про SkyNovix), і зі статтею (кейс, цифри)
    const original = expert ? `${facts}\n\n## Експертна стаття «${expert.title}» (${expert.source})\n${expert.text}` : facts;
    const fc = await factCheck("Факт-лист SkyNovix", "SkyNovix — факти", original, part);
    if (fc.verdict === "reject") {
      console.log(`🚀 фактчек відхилив частину ${i + 1}: ${fc.issues.join("; ")} — не надсилаю`);
      return;
    }
    parts[i] = fc.post;
    const note = factNote(fc);
    if (note) notes.push(`${i + 1}: ${note}`);
  }
  if (guard(parts.join("\n")).length) {
    console.log("🚀 після фактчеку з'явились заборонені речі — не надсилаю");
    return;
  }

  // Власник: один пост (Threads сам робить ланцюжок) і без «посилання в шапці профілю» — прибираємо, якщо GPT дописав
  parts = [parts.join("\n\n").replace(/\s*Посилання (в|у) шапці профілю\.?/gi, "").replace(/^\s*\d\/\d\s*/gm, "").trim()];
  const lastIdx = 0;

  console.log(`\n🚀 [${theme}] ${parts.length} частин:\n\n${parts.join("\n\n---\n\n")}`);

  if (send) {
    for (const [i, part] of parts.entries()) {
      await sendPost(
        part,
        {
          lines: [
            expert
              ? `🚀 SkyNovix для Threads · за статтею ${expert.source}: «${expert.title}»`
              : `🚀 SkyNovix для Threads · ${theme}${label(theme as Theme).includes("{prof}") ? ` · ${prof}` : ""}${parts.length > 1 ? ` · частина ${i + 1}/${parts.length}` : ""}`,
            ...(expert && expertInsight ? [`💡 ${expertInsight}`] : []),
            ...(i === lastIdx ? notes : []),
          ],
        },
        // 👍 на пост → видно в npm run stats, які теми заходять (у тестах не записуємо)
        dryRun ? undefined : { format: "promo", title: part.split("\n")[0]!.slice(0, 200), source: theme },
      );
    }
  }
  if (!dryRun) {
    // для експертного поста першим рядком — джерело (за ним чергуємо джерела, див. expertCandidates)
    const text = expert ? `📚 ${expert.source}\n${parts.join("\n\n")}` : parts.join("\n\n---\n\n");
    await prisma.promoPost.create({ data: { theme, text, productUrl: expert?.url ?? null } });
    if (expert) await markExpert(expert, "promo_used", expertInsight);
  }
}
