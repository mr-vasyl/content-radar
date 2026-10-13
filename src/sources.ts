// Тематичний акаунт, для якого джерело переважно пише.
// З 2026-10-13 працює лише канал можливостей (knowledge): «Креатори UA» і «AI для творців» зупинені,
// їхні джерела — в src/archive/sourcesArchive.ts.
export type Account = "creators" | "tools" | "knowledge";

export interface Source {
  name: string; // назва платформи для підпису "за матеріалами: ..."
  url: string; // адреса RSS-стрічки (або сторінки зі списком, якщо задано linkPattern)
  account: Account;
  linkPattern?: RegExp; // сайт без RSS: читаємо сторінку url і беремо посилання за цим шаблоном
}

// 💰 Гранти, конкурси, стипендії, резиденції й можливості для українських митців і авторів.
// «За матеріалами» — завжди першоджерело (фонд, що оголосив), а не ці агрегатори.
export const sources: Source[] = [
  // Агрегатори грантів
  { name: "ГУРТ", url: "https://gurt.org.ua/rss/section/grants/", account: "knowledge" }, // лише розділ «Гранти»
  // Простір: RSS розділу грантів порожній — читаємо сторінку; лише «Конкурси та гранти», без вакансій і тендерів
  { name: "Простір", url: "https://www.prostir.ua/category/grants/", account: "knowledge", linkPattern: /prostir\.ua\/\?grants=[\w-]+$/ },

  // Фонди й інституції — RSS
  { name: "Український інститут", url: "https://ui.org.ua/feed/", account: "knowledge" },
  { name: "Мінкульт", url: "https://mcsc.gov.ua/feed/", account: "knowledge" },
  { name: "Мистецький арсенал", url: "https://artarsenal.in.ua/feed/", account: "knowledge" },
  { name: "Ізоляція", url: "https://izolyatsia.org/ua/rss/", account: "knowledge" },

  // Без RSS — читаємо сторінку зі списком програм
  { name: "УКФ", url: "https://ucf.in.ua/programs", account: "knowledge", linkPattern: /ucf\.in\.ua\/m_programs\/\w+/ },
  { name: "House of Europe", url: "https://houseofeurope.org.ua/opportunities", account: "knowledge", linkPattern: /houseofeurope\.org\.ua\/(grant|programme)\/[\w-]+$/ },
  { name: "Креативна Європа", url: "https://creativeeurope.in.ua/news", account: "knowledge", linkPattern: /creativeeurope\.in\.ua\/news\/[\w-]+$/ },
  { name: "PinchukArtCentre", url: "https://pinchukartcentre.org/osvitni-programy-ta-podii", account: "knowledge", linkPattern: /pinchukartcentre\.org\/events\/[\w-]+$/ },
];
