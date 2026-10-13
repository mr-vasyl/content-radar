// Тематичний акаунт, для якого джерело переважно пише.
// З 2026-10-13 працює лише канал можливостей (knowledge): «Креатори UA» і «AI для творців» зупинені,
// їхні джерела — в src/archive/sourcesArchive.ts.
export type Account = "creators" | "tools" | "knowledge";

export interface Source {
  name: string; // назва платформи для підпису "за матеріалами: ..."
  url: string; // адреса RSS-стрічки (або сторінки зі списком, якщо задано linkPattern)
  account: Account;
  linkPattern?: RegExp; // сайт без RSS: читаємо сторінку url і беремо посилання за цим шаблоном
  telegram?: boolean; // url — юзернейм публічного Telegram-каналу; з постів беремо посилання на першоджерело
}

// 💰 Гранти, конкурси, стипендії, резиденції й можливості для українських митців і авторів.
// «За матеріалами» — завжди першоджерело (фонд, що оголосив), а не ці агрегатори.
export const sources: Source[] = [
  // Агрегатори грантів
  { name: "ГУРТ", url: "https://gurt.org.ua/rss/section/grants/", account: "knowledge" }, // лише розділ «Гранти»
  { name: "Grant.Market", url: "https://grant.market/rss.xml", account: "knowledge" },
  { name: "ІСАР Єднання", url: "https://ednannia.ua/?format=feed&type=rss", account: "knowledge" },
  // Простір: RSS розділу грантів порожній — читаємо сторінку; лише «Конкурси та гранти», без вакансій і тендерів
  { name: "Простір", url: "https://www.prostir.ua/category/grants/", account: "knowledge", linkPattern: /prostir\.ua\/\?grants=[\w-]+$/ },

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
  { name: "Kinokolo", url: "https://kinokolo.ua/feed/", account: "knowledge" },
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
  { name: "Грантові фішки", url: "grantovyphishky", account: "knowledge", telegram: true }, // 32K
  { name: "Грантові фішки EU", url: "grantovyphishkyEU", account: "knowledge", telegram: true },
  { name: "Гранти та можливості", url: "grants_here", account: "knowledge", telegram: true }, // 21K
  { name: "UA Grants", url: "uagrants", account: "knowledge", telegram: true }, // 19K, молодь і студенти
  { name: "Гранти UA", url: "grantsua", account: "knowledge", telegram: true }, // 18K, багато ГО й гуманітарки — фільтри відсіють

  // Без RSS — читаємо сторінку зі списком програм
  { name: "УКФ", url: "https://ucf.in.ua/programs", account: "knowledge", linkPattern: /ucf\.in\.ua\/m_programs\/\w+/ },
  { name: "House of Europe", url: "https://houseofeurope.org.ua/opportunities", account: "knowledge", linkPattern: /houseofeurope\.org\.ua\/(grant|programme)\/[\w-]+$/ },
  { name: "Креативна Європа", url: "https://creativeeurope.in.ua/news", account: "knowledge", linkPattern: /creativeeurope\.in\.ua\/news\/[\w-]+$/ },
  { name: "PinchukArtCentre", url: "https://pinchukartcentre.org/osvitni-programy-ta-podii", account: "knowledge", linkPattern: /pinchukartcentre\.org\/events\/[\w-]+$/ },
];
