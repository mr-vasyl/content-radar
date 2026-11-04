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
import { PROSTIR_DISC_TAGS, PROSTIR_TAGS, PROSTIR_TAGS_PROMPT } from "./channels.ts";

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
  // ➕ 2026-11-04 (друга хвиля, дірки — література й дизайн)
  S("Authors Publish", "https://www.authorspublish.com/feed/"), // журнали для письменників; публікують лише безкоштовну подачу
  S("Trish Hopkinson", "https://trishhopkinson.com/feed/"), // поезія й проза: беремо лише «NO FEE submission call» (sourceSkip)
  S("ArtRabbit", "https://www.artrabbit.com/artist-opportunities", { linkPattern: /artrabbit\.com\/artist-opportunities\/\d{4}\/[a-z]+\/[\w-]+$/ }), // усі напрями, внесок позначено
  S("Arts Thread", "https://www.artsthread.com/competitions/", { linkPattern: /artsthread\.com\/competitions\/[\w-]+$/ }), // конкурси дизайну від брендів
  // 🇺🇦 Українські радари — те, що забрав канал грантів, сюди не піде (дубль за посиланням і заголовком)
  S("Літцентр", "litcentr", { telegram: true }),
  S("ART BOT", "artbotme", { telegram: true }),
];

// Правила окремих джерел — до GPT
export function sourceSkip(a: Article): string | null {
  // виставки «для членів» спілки чи галереї — платне членство й зазвичай місцеві (Tulsa Artists' Coalition, RBSA Friends)
  if (/\bmembers?['’]?\s*(show|exhibition|salon)|\bfriends exhibition\b/i.test(a.title)) return "лише для членів спілки/галереї";
  if (a.source === "Authors Publish" && /^\d+\s/.test(a.title)) return "добірка кількох наборів, а не один";
  if (a.source === "Trish Hopkinson" && !/no fee/i.test(a.title)) return "не «NO FEE submission call»";
  if (a.source === "ArtRabbit" && /^(Job|Artist in Residence|Fellowship|Funding|Course|Residency)\b/i.test(a.title)) return "вакансія/резиденція/грант — не сюди";
  return null;
}

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
  institution: boolean;
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
institution — true, якщо організатор — музей, публічна чи муніципальна галерея, державна установа, університет, відомий фестиваль
або культурний інститут; false — комерційний конкурс, приватна «галерея»-організатор конкурсів, платформа подань.
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
— участь: безкоштовно (якщо про оплату в тексті нічого — напиши «внеску в умовах немає»);
— дедлайн: 12 листопада 2026 (або «приймають постійно»);
— додаткові витрати: доставка роботи, друк, рамування, дорога чи проживання — ЛИШЕ якщо про них є в тексті; немає — цей рядок не пиши.

Якщо важливо — ще одне речення-нюанс (подача англійською, дорогу оплачуєте самі, кількість робіт).
Вимоги: 400–900 символів; лише факти з тексту, нічого не додумуй; жирним лише назву; без посилань, хештегів і емодзі
(посилання додасть код).
${VOICE}
${LANGUAGE}
Якщо score нижче 6 — post порожній рядок.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "is_call", "result", "discipline", "fee", "open_to_ukraine", "local_only", "rights_grab", "pays_author", "institution",
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
    institution: { type: "boolean" },
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
const FREE_SOURCES = new Set(["Monographica", "ArtConnect", "Authors Publish", "Trish Hopkinson"]);
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
    // про оплату нічого — довіряємо лише фільтру сайту, музеям/публічним галереям/фестивалям або коли автору платять
    (r.fee === "not_mentioned" && !FREE_SOURCES.has(a.source) && !r.institution && !r.pays_author && "не сказано, що участь безкоштовна") ||
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
    // Формат — за зразком власника 2026-11-04: ВИГОДА першим рядком, далі короткі абзаци, без пунктів
    `Зроби з поста Telegram-каналу «Авторський простір 🇺🇦» короткий пост для Threads українською (250–450 символів),
який веде людей у наш Telegram. Зразок власника — пиши саме так:
«€2 000 за фотосерію. Участь безкоштовна.

У Болгарії відкрито прийом заявок на PHODAR Biennial 2026 — міжнародний фотоконкурс для авторів, які працюють із цілісними фотопроєктами.

Можна подати серію з 8–20 фотографій. Учасники з будь-якої країни, від 18 років.

Окрім головного призу, є ще дві нагороди по €600 та можливість потрапити на міжнародні виставки й до фотокниги.»
Правила:
- ПЕРШИЙ РЯДОК — ВИГОДА для автора: гроші (сума — «€2 000 за фотосерію», «25 000 грн за ілюстрації до книжки»), а якщо
  грошей немає — що він отримає («Публікація в журналі, що виходить з 2003 року.», «Виставка у Варшаві + €500.»);
  друге коротке речення в тому ж рядку — головна умова: «Участь безкоштовна.», «Для художниць з України.», «Подача до 1 грудня.»;
- далі 2–3 короткі абзаци з порожніми рядками між ними: що це й де (одне речення з назвою), що подати і хто може,
  що ще отримаєте (інші призи, виставки, публікація);
- без пунктів і тире-списків, без смайликів, хештегів, посилань і розмітки (без **зірочок**);
- рядок про Telegram НЕ пиши — його додасть код;
- лише факти з поста, нічого не вигадуй і не перебільшуй.
${LANGUAGE}`,
    post.replace(/\n*🔗 \[[^\]]*\]\([^)]*\)\s*$/, ""),
    "prostir_teaser",
    { type: "object", additionalProperties: false, required: ["hook"], properties: { hook: { type: "string" } } },
  );
  return r.hook.split(TEASER_END).join("").trim();
}
// кінцівка тизера «Авторського простору» — як у зразку власника
export const PROSTIR_TEASER_END = "Деталі та подача — у нашому Telegram. Посилання в профілі.";

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

// ─────────── 📚 «Як подаватись» і ✨ «Історії авторів» (власник 2026-11-04: «тематика ширша, ніж open call») ───────────
// По 1–2 на тиждень за розкладом (modes/prostir.ts). Беремо свіжі статті профільних блогів, GPT вирішує, чи з них вийде
// корисний пост, і пише його своїми словами. Використані й відхилені статті — в Article з префіксом url «prx:».
export const TIP_SOURCES: Source[] = [
  S("Jane Friedman", "https://janefriedman.com/feed/"), // письменництво й видання, шахраї у видавничій справі
  S("Writer's Digest", "https://www.writersdigest.com/feed"),
  S("Ari's Take", "https://aristake.com/feed/"), // музиканти: просування, релізи, гроші
  S("DIY Musician", "https://diymusician.cdbaby.com/feed/"),
  S("Artists Network", "https://artistsnetwork.com/feed/"), // художники
  S("Authors Publish", "https://www.authorspublish.com/feed/"),
];
export const STORY_SOURCES: Source[] = [
  S("The Creative Independent", "https://thecreativeindependent.com/feed.xml"), // інтерв'ю з авторами всіх напрямів
  S("Trish Hopkinson", "https://trishhopkinson.com/feed/"), // гостьові історії авторів про публікації
  S("Jane Friedman", "https://janefriedman.com/feed/"),
];

// 🧰 безкоштовні інструменти (власник 2026-11-04: «круті безкоштовні інструменти для авторів»)
export const TOOL_SOURCES: Source[] = [
  S("Bedroom Producers Blog", "https://bedroomproducersblog.com/feed/"), // безкоштовні плагіни й синтезатори
  S("Creative Bloq", "https://www.creativebloq.com/feeds/all"), // дизайн, ілюстрація: шрифти, пензлі, програми
  S("MakeUseOf Creative", "https://www.makeuseof.com/feed/category/creative/"),
  S("BlenderNation", "https://www.blendernation.com/feed/"), // 3D: безкоштовні аддони й ресурси
  S("Fstoppers", "https://fstoppers.com/rss.xml"),
  S("MusicRadar", "https://www.musicradar.com/feeds.xml"),
];

// 💰 «Як заробляти» і ⚖️ «Права й просування» (власник 2026-11-04: «додавай, що вважаєш правильним» після чорновика
// «професійне медіа для незалежних авторів»; дослідження Cedos: маркетинг 54%, авторське право 24% серед потреб)
export const MONEY_SOURCES: Source[] = [
  S("Jane Friedman", "https://janefriedman.com/feed/"),
  S("The Creative Penn", "https://www.thecreativepenn.com/feed/"),
  S("ALLi", "https://selfpublishingadvice.org/feed/"),
  S("Ari's Take", "https://aristake.com/feed/"),
  S("DIY Musician", "https://diymusician.cdbaby.com/feed/"),
];
export const RIGHTS_SOURCES: Source[] = [
  S("Authors Guild", "https://authorsguild.org/feed/"),
  S("Creative Commons", "https://creativecommons.org/feed/"),
  S("Jane Friedman", "https://janefriedman.com/feed/"),
  S("Buffer", "https://buffer.com/resources/rss/"),
  S("Social Media Examiner", "https://www.socialmediaexaminer.com/feed/"),
  S("PetaPixel", "https://petapixel.com/feed/"), // справи про крадіжку фото й права
];
// Платформи-конкуренти SkyNovix у тексті поста — не можна (як у Threads, власник 2026-10-25)
export const COMPETITOR_NAME =
  /\b(Substack|Patreon|Gumroad|Ko-?fi|Etsy|Amazon|KDP|Kindle Unlimited|Kickstarter|beehiiv|ConvertKit|Teachable|Kajabi|Podia|Bandcamp|Boosty|OnlyFans|Fourthwall|Lemon ?Squeezy|Buy Me a Coffee|Memberful)\b|Сабстек|Патреон|Амазон|Етсі|Кікстартер/i;

export type Editorial = "tip" | "story" | "tool" | "money" | "rights";
const EDITORIAL_RULES: Record<Editorial, string> = {
  money: `Рубрика «💰 Як заробляти на своєму»: конкретний спосіб, яким автор заробляє на ВЛАСНИХ роботах — ліцензування,
роялті, продаж прав і перекладів, комісійні замовлення й ціни на них, власний цифровий продукт, підписка читачів, виступи.
useful = true лише якщо є конкретний прийом, цифри чи кейс, які читач може застосувати. Новини індустрії, звіти компаній,
загальні мотиваційні тексти — false. Стаття, побудована навколо однієї платформи продажу чи підписок (Amazon KDP,
Patreon, Substack, Etsy тощо), — false. Назви таких платформ у пості НЕ згадуй.
Пост: **заголовок — вигода чи цифра одним рядком**, порожній рядок, 1–2 речення про суть, порожній рядок,
3–5 пунктів через «— » (як саме, з прикладом), порожній рядок, одне речення-висновок. 600–1100 символів.`,
  rights: `Рубрика «⚖️ Права й просування»: практичне пояснення конкретної ситуації — пункт договору з видавцем, галереєю
чи замовником, види ліцензій, виключні права, що робити, коли вкрали роботу, ШІ й навчання на роботах авторів, як захистити
авторство; АБО конкретний прийом, як автору знайти аудиторію (портфоліо в соцмережах, розсилка, співпраця, медіа).
useful = true лише якщо читач після поста знає, що робити в конкретній ситуації. Загальний маркетинг для бізнесу, ШІ-агенти,
реклама, новини судів без висновку для автора — false. Законодавство іншої країни — лише якщо висновок корисний і українцю
(тоді скажи, що це приклад з іншої країни). Платформи продажу й підписок не згадуй.
Пост: **заголовок — ситуація чи питання одним рядком**, порожній рядок, 1–2 речення, порожній рядок, 3–5 пунктів через «— »,
порожній рядок, одне речення-висновок. 600–1100 символів.`,
  tool: `Рубрика «🧰 Безкоштовні інструменти»: програма, плагін, сервіс, шрифт, набір пензлів чи ресурсів, корисний у РОБОТІ
художнику, ілюстратору, дизайнеру, фотографу, відеографу, музиканту, письменнику чи 3D-автору.
useful = true лише якщо: в статті ПРЯМО сказано, що інструмент безкоштовний або має безкоштовну версію (і що в ній є);
зрозуміло, що він робить і кому знадобиться. «Безкоштовно до дати» — лише якщо дата ще не минула (сьогодні 2026-11-04), і назви її.
false — платне зі знижкою, огляди техніки й гаджетів, новини компаній, інструменти для програмістів, загальні ШІ-чатботи,
платформи для продажу, підписок і донатів (крауд- і членські платформи, маркетплейси), реклама курсів.
Пост: **Назва — що робить одним рядком**, порожній рядок, 1–2 речення: яку проблему автора вирішує; потім пункти через «— »:
що вміє (2–3 конкретні можливості), що саме безкоштовно й обмеження, для чого/де працює (Windows, Mac, браузер, iPad…, якщо є);
наприкінці одне речення — кому найбільше знадобиться. 500–900 символів.`,
  tip: `Рубрика «📚 Як подаватись»: практична порада автору, як показати, опублікувати чи продати свою роботу —
портфоліо, artist statement, супровідний лист, як обрати журнал чи виставку, як читати умови конкурсу, права на роботи,
як розпізнати платну «пастку» чи шахрая, як підготувати демо чи подачу на фестиваль, як говорити з видавцем чи галереєю.
useful = true лише якщо в статті є конкретні кроки чи прийоми, які читач застосує сам. Техніка малювання, огляди техніки,
новини індустрії, реклама курсів — false.
Пост: **заголовок-вигода одним рядком**, 1–2 речення, навіщо це, потім 3–5 порад через «— » (конкретно, з прикладом),
наприкінці одне речення-висновок. Порожній рядок після заголовка, після вступу й перед висновком (пункти — підряд). 600–1100 символів.`,
  story: `Рубрика «✨ Історії авторів»: реальна історія конкретного автора (художник, фотограф, письменник, музикант,
кіношник, дизайнер) про те, як він показав, опублікував чи продав свою роботу, — з поворотом, помилками, цифрами чи висновком,
корисним іншим. useful = true лише якщо є конкретна людина, конкретний шлях і чого з нього можна навчитись.
Загальні роздуми без історії, некрологи, новини, реклама — false.
Пост: **заголовок — суть історії одним рядком** (хто й що зробив), 2–3 короткі абзаци історії з деталями,
наприкінці — «Що з цього взяти:» і 2–3 короткі пункти через «— ». 700–1200 символів.`,
};

export interface EditorialPost {
  useful: boolean;
  reason: string;
  post: string;
  tags: string[];
}

export async function editorialPost(kind: Editorial, a: Article, text: string): Promise<EditorialPost> {
  const r = await askJson<EditorialPost>(
    `Ти редактор українського Telegram-каналу «Авторський простір 🇺🇦» для художників, ілюстраторів, фотографів,
письменників, музикантів, кіношників і дизайнерів. Тобі дають статтю (часто англійською).
${EDITORIAL_RULES[kind]}
reason — одне речення українською: чому так.
${PROSTIR_TAGS_PROMPT.replace(/Перший — ЩО[^]*?Далі 1–2 — НАПРЯМ: /, "Лише НАПРЯМ (1–2): ")}
Якщо useful = false — post порожній рядок.
Вимоги до поста: перекажи своїми словами, не перекладай дослівно; ім'я автора й назви — як в оригіналі; жирним лише заголовок;
без посилань і хештегів (посилання додасть код); не згадуй інші платформи для продажу й підписок.
${VOICE}
${LANGUAGE}`,
    `Джерело: ${a.source}\nЗаголовок: ${a.title}\n\n${text.slice(0, 7000)}`,
    `prostir_${kind}`,
    {
      type: "object", additionalProperties: false, required: ["useful", "reason", "post", "tags"],
      properties: {
        useful: { type: "boolean" }, reason: { type: "string" }, post: { type: "string" },
        tags: { type: "array", minItems: 1, maxItems: 2, items: { type: "string", enum: [...PROSTIR_DISC_TAGS] } },
      },
    },
  );
  if (r.useful && !r.post.trim()) r.useful = false;
  if (r.useful && COMPETITOR_NAME.test(r.post)) {
    r.useful = false;
    r.reason = `згадано платформу-конкурента SkyNovix — ${r.reason}`;
  }
  return r;
}

// 📋 «Добірка тижня» (субота): напрям, у якому за 14 днів надіслано найбільше ще відкритих можливостей (≥4), одним списком.
// Без GPT — лише те, що вже пройшло перевірку. Немає 4 в одному напрямі — беремо найкращі з усіх («для всіх авторів»).
const DISC_WHO: Record<string, string> = {
  literature: "письменників і поетів", music: "музикантів", art: "художників та ілюстраторів", photo: "фотографів",
  film: "кіношників", design: "дизайнерів", mixed: "авторів різних напрямів",
};
const RESULT_WORD: Record<string, string> = {
  publication: "публікація", exhibition: "виставка", screening: "показ", performance: "виступ", sale: "продаж",
  commission: "оплачуване замовлення", prize: "приз",
};
export function weeklyCompilation(items: { meta: Meta; url: string; discipline: string }[]): string | null {
  const byDisc = new Map<string, typeof items>();
  for (const x of items) byDisc.set(x.discipline, [...(byDisc.get(x.discipline) ?? []), x]);
  const best = [...byDisc.entries()].filter(([d]) => d !== "mixed").sort((a, b) => b[1].length - a[1].length)[0];
  const [who, list] = best && best[1].length >= 4 ? [DISC_WHO[best[0]] ?? "авторів", best[1]] : ["всіх авторів", items];
  if (list.length < 4) return null;
  const months = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
  const day = (d: string) => (d ? `до ${Number(d.slice(8, 10))} ${months[Number(d.slice(5, 7)) - 1]}` : "приймають постійно");
  const top = list
    .sort((x, y) => (x.meta.grade === y.meta.grade ? (x.meta.deadline || "9").localeCompare(y.meta.deadline || "9") : x.meta.grade === "A" ? -1 : 1))
    .slice(0, 7);
  const lines = top.map((x, i) => `${i + 1}. [${x.meta.headline.replace(/[[\]]/g, "")}](${x.meta.link || x.url}) — ${RESULT_WORD[x.meta.result] ?? "можливість"}, ${day(x.meta.deadline)}`);
  const word = top.length % 10 === 1 && top.length % 100 !== 11 ? "можливість" : [2, 3, 4].includes(top.length % 10) && ![12, 13, 14].includes(top.length % 100) ? "можливості" : "можливостей";
  return `**📋 Добірка тижня: ${top.length} ${word} для ${who}**\n\nУсе відкрите зараз і з безкоштовною участю — збережіть, щоб подати вчасно:\n\n${lines.join("\n")}\n\nДеталі кожної — за посиланням або в наших постах цього тижня.`;
}
