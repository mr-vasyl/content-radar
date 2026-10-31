// Тематичний акаунт, для якого джерело переважно пише.
// Єдиний канал — гранти й можливості (account "knowledge"). Канали «Креатори UA» і «AI для творців» видалено
// 2026-10-13; їхні перевірені RSS-сайти збережено в src/archive/sourcesArchive.ts.
// 2026-10-17…10-31 був канал «Гранти для бізнесу» — власник закрив (не ріс); ФОП-гранти тепер ідуть у канал грантів (src/fop.ts).
// 2026-10-31: «Замовлення для креаторів» (account "orders", src/orders.ts, власні джерела ORDER_SOURCES).
// 2026-10-19 був третій канал «AI для творців» — 2026-10-20 власник його прибрав; джерела — в src/archive/sourcesArchive.ts.
export type Account = "knowledge" | "orders";

export interface Source {
  name: string; // назва платформи для підпису "за матеріалами: ..."
  url: string; // адреса RSS-стрічки (або сторінки зі списком, якщо задано linkPattern)
  account: Account;
  linkPattern?: RegExp; // сайт без RSS: читаємо сторінку url і беремо посилання за цим шаблоном
  telegram?: boolean; // url — юзернейм публічного Telegram-каналу; з постів беремо посилання на першоджерело
  // 🧾 ФОП-гранти (у канал грантів): "also" — що не підійшло митцям, перевіряємо як грант для ФОП; "only" — лише як ФОП-грант
  fop?: "also" | "only";
}

// 💰 Гранти, конкурси, стипендії, резиденції й можливості для українських митців і авторів.
// «За матеріалами» — завжди першоджерело (фонд, що оголосив), а не ці агрегатори.
export const sources: Source[] = [
  // Агрегатори грантів
  { name: "ГУРТ", url: "https://gurt.org.ua/rss/section/grants/", account: "knowledge", fop: "also" }, // лише розділ «Гранти»
  { name: "Grant.Market", url: "https://grant.market/rss.xml", account: "knowledge", fop: "also" },
  { name: "ІСАР Єднання", url: "https://ednannia.ua/?format=feed&type=rss", account: "knowledge" },
  // Простір: RSS розділу грантів порожній — читаємо сторінку; лише «Конкурси та гранти», без вакансій і тендерів
  { name: "Простір", url: "https://www.prostir.ua/category/grants/", account: "knowledge", linkPattern: /prostir\.ua\/\?grants=[\w-]+$/, fop: "also" },
  // 2026-10-15: розширення — за добу приходив 1 грант. GetGrant — лише розділ «Культура» (там Гранти Президента молодим
  // митцям, УКФ «Мистецькі дебюти», Gaude Polonia…); огляди донорів і добірки по країнах («analiz», «pidbirka»,
  // «польські/американські гранти для України») не беремо — це старі зведення, не один конкретний набір.
  { name: "GetGrant", url: "https://getgrant.ua/grant-category/culture/", account: "knowledge",
    linkPattern: /getgrant\.ua\/grants-and-funding\/(?![\w-]*(analiz|pidbirka|daydzhest|daidzhest|ohliad|ukrainski|dlia-ukrain|dlya-ukrain|vidkryt|derzhavni-granty))[\w-]+\/$/ },
  { name: "Час змін", url: "https://chaszmin.com.ua/feed/", account: "knowledge", fop: "also" }, // ~3/день, є премії й резиденції для митців

  // Фонди й інституції — RSS
  { name: "Український інститут", url: "https://ui.org.ua/feed/", account: "knowledge" },
  // 2026-10-20 (знайдено в linktree KULTMOZ): держпремії й гранти Президента молодим митцям; Culture Helps Solidarity
  { name: "Держмистецтв", url: "https://arts.gov.ua/feed/", account: "knowledge" },
  { name: "Інша освіта", url: "https://insha-osvita.org/feed/", account: "knowledge" },
  { name: "Мінкульт", url: "https://mcsc.gov.ua/feed/", account: "knowledge" },
  { name: "Мистецький арсенал", url: "https://artarsenal.in.ua/feed/", account: "knowledge" },
  { name: "Ізоляція", url: "https://izolyatsia.org/ua/rss/", account: "knowledge" },
  { name: "Польський інститут", url: "https://instytutpolski.pl/kyiv/feed/", account: "knowledge" }, // Gaude Polonia та ін. для українських митців

  // 🎯 Професійні джерела (2026-10-13) — медіа професій публікують конкурси, премії, резиденції, open call.
  // Звичайні новини з них не проходять: у канал іде лише те, що GPT відніс до можливостей (account knowledge).
  // ✍️ Письменники й перекладачі
  { name: "Читомо", url: "https://chytomo.com/feed/", account: "knowledge" },
  { name: "PEN Україна", url: "https://pen.org.ua/feed.rss", account: "knowledge" },
  // Літосвіта — прибрано 2026-10-20 (власник): платна школа, пише про свої курси й добірки книжок, а не можливості
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
  { name: "Грантові фішки", url: "grantovyphishky", account: "knowledge", telegram: true, fop: "also" }, // 32K
  { name: "Грантові фішки EU", url: "grantovyphishkyEU", account: "knowledge", telegram: true, fop: "also" },
  { name: "Гранти та можливості", url: "grants_here", account: "knowledge", telegram: true, fop: "also" }, // 21K
  // UA Grants (@uagrants) — прибрано 2026-10-20: за тиждень 0 постів для нас (ESC-волонтерство, Erasmus+ обміни за кордоном),
  // а посилання сховані за shorturl.at з перевіркою Cloudflare. unicompass — та сама ніша (молодь, навчання за кордоном).
  { name: "Гранти UA", url: "grantsua", account: "knowledge", telegram: true, fop: "also" }, // 18K, багато ГО й гуманітарки — фільтри відсіють
  // 2026-10-15
  { name: "Grant UP!", url: "GrantUP", account: "knowledge", telegram: true, fop: "also" }, // ~4/день: премії, Docudays, open call (+ новини — відсіються)
  { name: "Літцентр", url: "litcentr", account: "knowledge", telegram: true }, // літконкурси й премії для письменників і перекладачів
  // 2026-10-26 (власник: тематика — не лише гранти, а й навчання, безкоштовні події, курси й ресурси; аналіз TGStat)
  { name: "Твій космос можливостей", url: "tviyspace", account: "knowledge", telegram: true, fop: "also" }, // ~20/тиждень, з посиланнями
  { name: "МОЖЛИВОСТІ", url: "Mozhlyvosti", account: "knowledge", telegram: true, fop: "also" }, // 99K: курси, вебінари (+вакансії — фільтр відсіє)
  { name: "Просвіта", url: "ProsvitaUA", account: "knowledge", telegram: true }, // безкоштовні курси (DaVinci, дизайн…)
  { name: "Kyiv Art", url: "kyiv_art", account: "knowledge", telegram: true }, // виставки, презентації, події в Києві
  { name: "Creative Practice", url: "creativepracticeua", account: "knowledge", telegram: true }, // дизайн: навчання, події
  { name: "Онлайн-івенти", url: "events_ua", account: "knowledge", telegram: true }, // вебінари, майстер-класи
  { name: "Prometheus", url: "prometheusmooc", account: "knowledge", telegram: true }, // безкоштовні курси
  // НЕ взято 2026-10-26: Гончаренко центри (загальні курси не для творців), Творча рада й «Художник, малюй!» (без посилань,
  // лише роботи/уроки), Дія.Освіта (курси для держслужбовців), Український інститут книги (сайт не читається ботом).
  // 2026-10-20
  { name: "КУЛЬТУРА.МОЖЛИВОСТІ!", url: "culture_ua", account: "knowledge", telegram: true, fop: "also" }, // ~3/день: резиденції, стипендії, гранти культури
  { name: "УКФ щодня", url: "ucf_ua", account: "knowledge", telegram: true }, // офіційний канал УКФ, ~4/тиждень
  // Перевірено 2026-10-20 й НЕ взято: Мінекономіки (новини й кредити), КОШТ (бізнес-новини), регіональні Дія.Бізнес
  // (майже не пишуть), Громадський Простір TG (мертвий з 2024; сайт уже є), Український фонд стартапів TG (мертвий).
  { name: "ART BOT", url: "artbotme", account: "knowledge", telegram: true }, // open call для художників (рідко, але точно в ціль)
  // 🧾 Лише ФОП-гранти (були джерелами бізнес-каналу 2026-10-17)
  { name: "Грант Радар", url: "https://grantradar.com.ua/", account: "knowledge", fop: "only", linkPattern: /grantradar\.com\.ua\/hrant\/\d+-[\w-]+\/$/ },
  { name: "Грант Радар TG", url: "granty_ukraine", account: "knowledge", fop: "only", telegram: true }, // ~5/день
  { name: "GetGrant Бізнес", url: "https://getgrant.ua/grant-category/business/", account: "knowledge", fop: "only",
    linkPattern: /getgrant\.ua\/grants-and-funding\/(?![\w-]*(analiz|pidbirka|daydzhest|daidzhest|ohliad))[\w-]+\/$/ },
  // 2026-10-20: міжнародні для українського бізнесу
  { name: "EU NEIGHBOURS East", url: "https://euneighbourseast.eu/opportunities/feed/", account: "knowledge", fop: "also" }, // EU4Business та ін. для Східного партнерства
  // Український фонд стартапів — прибрано 2026-10-31 разом з бізнес-каналом (стартапи, не ФОП)
  // НЕ взято 2026-10-20: ONE PASS (наукові консорціуми Horizon), FundingHub (сайт на JS — бот не бачить списку),
  // ПРООН і МОМ в Україні (сайти блокують бота), CSO Digital (не відповідає).
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
