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
