// Тематичний акаунт, для якого джерело переважно пише.
// Єдиний канал — гранти й можливості (account "knowledge"). Канали «Креатори UA» і «AI для творців» видалено
// 2026-10-13; їхні перевірені RSS-сайти збережено в src/archive/sourcesArchive.ts.
// 2026-10-17: другий канал — «Гранти для бізнесу» (account "business", src/business.ts).
// 2026-10-19 був третій канал «AI для творців» — 2026-10-20 власник його прибрав; джерела — в src/archive/sourcesArchive.ts.
export type Account = "knowledge" | "business";

export interface Source {
  name: string; // назва платформи для підпису "за матеріалами: ..."
  url: string; // адреса RSS-стрічки (або сторінки зі списком, якщо задано linkPattern)
  account: Account;
  linkPattern?: RegExp; // сайт без RSS: читаємо сторінку url і беремо посилання за цим шаблоном
  telegram?: boolean; // url — юзернейм публічного Telegram-каналу; з постів беремо посилання на першоджерело
  // 💼 бізнес-канал: "also" — що не підійшло митцям, перевіряємо як бізнес-грант; "only" — лише для бізнесу
  business?: "also" | "only";
}

// 💰 Гранти, конкурси, стипендії, резиденції й можливості для українських митців і авторів.
// «За матеріалами» — завжди першоджерело (фонд, що оголосив), а не ці агрегатори.
export const sources: Source[] = [
  // Агрегатори грантів
  { name: "ГУРТ", url: "https://gurt.org.ua/rss/section/grants/", account: "knowledge", business: "also" }, // лише розділ «Гранти»
  { name: "Grant.Market", url: "https://grant.market/rss.xml", account: "knowledge", business: "also" },
  { name: "ІСАР Єднання", url: "https://ednannia.ua/?format=feed&type=rss", account: "knowledge" },
  // Простір: RSS розділу грантів порожній — читаємо сторінку; лише «Конкурси та гранти», без вакансій і тендерів
  { name: "Простір", url: "https://www.prostir.ua/category/grants/", account: "knowledge", linkPattern: /prostir\.ua\/\?grants=[\w-]+$/, business: "also" },
  // 2026-10-15: розширення — за добу приходив 1 грант. GetGrant — лише розділ «Культура» (там Гранти Президента молодим
  // митцям, УКФ «Мистецькі дебюти», Gaude Polonia…); огляди донорів і добірки по країнах («analiz», «pidbirka»,
  // «польські/американські гранти для України») не беремо — це старі зведення, не один конкретний набір.
  { name: "GetGrant", url: "https://getgrant.ua/grant-category/culture/", account: "knowledge",
    linkPattern: /getgrant\.ua\/grants-and-funding\/(?![\w-]*(analiz|pidbirka|daydzhest|daidzhest|ohliad|ukrainski|dlia-ukrain|dlya-ukrain|vidkryt|derzhavni-granty))[\w-]+\/$/ },
  { name: "Час змін", url: "https://chaszmin.com.ua/feed/", account: "knowledge", business: "also" }, // ~3/день, є премії й резиденції для митців

  // Фонди й інституції — RSS
  { name: "Український інститут", url: "https://ui.org.ua/feed/", account: "knowledge" },
  { name: "Мінкульт", url: "https://mcsc.gov.ua/feed/", account: "knowledge" },
  { name: "Мистецький арсенал", url: "https://artarsenal.in.ua/feed/", account: "knowledge" },
  { name: "Ізоляція", url: "https://izolyatsia.org/ua/rss/", account: "knowledge" },
  { name: "Польський інститут", url: "https://instytutpolski.pl/kyiv/feed/", account: "knowledge" }, // Gaude Polonia та ін. для українських митців

  // 🎯 Професійні джерела (2026-10-13) — медіа професій публікують конкурси, премії, резиденції, open call.
  // Звичайні новини з них не проходять: у канал іде лише те, що GPT відніс до можливостей (account knowledge).
  // ✍️ Письменники й перекладачі
  { name: "Читомо", url: "https://chytomo.com/feed/", account: "knowledge" },
  { name: "PEN Україна", url: "https://pen.org.ua/feed.rss", account: "knowledge" },
  { name: "Літосвіта", url: "https://litosvita.com/feed/", account: "knowledge" },
  // 🎬 Кіно
  // Kinokolo — прибрано 2026-10-19: Cloudflare блокує сервери GitHub (і читалку), Telegram-канал закинутий з 2023
  { name: "Українська кіноакадемія", url: "https://uafilmacademy.org/", account: "knowledge", linkPattern: /uafilmacademy\.org\/news\/[^/]+\.html$/ },
  { name: "Одеський кінофестиваль", url: "https://new.oiff.com.ua/blog-feed.xml", account: "knowledge" },
  { name: "Docudays UA", url: "https://docudays.ua/rss", account: "knowledge" },
  // 🎨 Візуальне
  { name: "Your Art", url: "https://supportyourart.com/feed/", account: "knowledge" },
  // 🎵 Музика
  { name: "Music Export Ukraine", url: "https://musicexportukraine.com/", account: "knowledge", linkPattern: /musicexportukraine\.com\/our-work\/browse-by-year\/20\d\d\/[\w-]+$/ },
  // 📰 Медіа й журналісти
  { name: "Детектор медіа", url: "https://detector.media/rss", account: "knowledge" },
  { name: "Академія української преси", url: "https://www.aup.com.ua/feed/", account: "knowledge" },
  { name: "ІМІ", url: "https://imi.org.ua/", account: "knowledge", linkPattern: /imi\.org\.ua\/announcements\/[\w-]+$/ },
  // 🎮 Цифрове й геймдев
  { name: "dev.ua", url: "https://dev.ua/rss", account: "knowledge" },
  // 🎓 Студенти й освіта
  { name: "Studway", url: "https://studway.com.ua/feed/", account: "knowledge" },
  { name: "Erasmus+ Україна", url: "https://erasmusplus.org.ua/feed/", account: "knowledge" },
  { name: "DAAD Україна", url: "https://www.daad-ukraine.org/uk/feed/", account: "knowledge" },

  // 📡 Грантові Telegram-канали (конкуренти) як «радар»: з постів беремо лише посилання на першоджерело,
  // читаємо його й пишемо СВІЙ пост; «За матеріалами» — фонд, а не канал. Аналіз конкурентів — 2026-10-13.
  { name: "Грантові фішки", url: "grantovyphishky", account: "knowledge", telegram: true, business: "also" }, // 32K
  { name: "Грантові фішки EU", url: "grantovyphishkyEU", account: "knowledge", telegram: true, business: "also" },
  { name: "Гранти та можливості", url: "grants_here", account: "knowledge", telegram: true, business: "also" }, // 21K
  { name: "UA Grants", url: "uagrants", account: "knowledge", telegram: true, business: "also" }, // 19K, молодь і студенти
  { name: "Гранти UA", url: "grantsua", account: "knowledge", telegram: true, business: "also" }, // 18K, багато ГО й гуманітарки — фільтри відсіють
  // 2026-10-15
  { name: "Grant UP!", url: "GrantUP", account: "knowledge", telegram: true, business: "also" }, // ~4/день: премії, Docudays, open call (+ новини — відсіються)
  { name: "Літцентр", url: "litcentr", account: "knowledge", telegram: true }, // літконкурси й премії для письменників і перекладачів
  { name: "ART BOT", url: "artbotme", account: "knowledge", telegram: true }, // open call для художників (рідко, але точно в ціль)
  // 💼 Лише для бізнес-каналу (2026-10-17)
  { name: "Грант Радар", url: "https://grantradar.com.ua/", account: "business", business: "only", linkPattern: /grantradar\.com\.ua\/hrant\/\d+-[\w-]+\/$/ },
  { name: "Грант Радар TG", url: "granty_ukraine", account: "business", business: "only", telegram: true }, // ~5/день
  { name: "GetGrant Бізнес", url: "https://getgrant.ua/grant-category/business/", account: "business", business: "only",
    linkPattern: /getgrant\.ua\/grants-and-funding\/(?![\w-]*(analiz|pidbirka|daydzhest|daidzhest|ohliad))[\w-]+\/$/ },
  // Перевірено для бізнесу й НЕ взято: t.me/grants_ukraine (1 пост за 3 дні, посилання на платних консультантів),
  // t.me/grant_market (Telegram не віддає канал ззовні; їхній сайт Grant.Market уже є), ua_bizidea, gurtrc.
  // Перевірено й НЕ взято: unicompass (навчання за кордоном, 1 пост за 3 дні, посилання на бот-файли),
  // t.me/houseofeurope (0 за 3 дні; сайт уже є), Artists at Risk (новини, не відкриті набори),
  // Jam Factory (0 за 3 дні), Lviv Culture Hub і Ukrainian Photographers (403 — блокують бота).

  // Без RSS — читаємо сторінку зі списком програм
  { name: "УКФ", url: "https://ucf.in.ua/programs", account: "knowledge", linkPattern: /ucf\.in\.ua\/m_programs\/\w+/ },
  { name: "House of Europe", url: "https://houseofeurope.org.ua/opportunities", account: "knowledge", linkPattern: /houseofeurope\.org\.ua\/(grant|programme)\/[\w-]+$/ },
  // Креативна Європа: сайт за перевіркою Cloudflare блокує GitHub — читаємо їхній Telegram (2026-10-19)
  { name: "Креативна Європа", url: "creativeeuropeua", account: "knowledge", telegram: true },
  // PinchukArtCentre — прибрано 2026-10-19: сайт блокує GitHub, читалка не бачить подій, Telegram-каналу немає
];
