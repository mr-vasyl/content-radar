// АРХІВ (2026-10-13): джерела каналів «Креатори UA» і «AI для творців», зупинених власником.
// Не підключено ніде. Повернути — перенести потрібні рядки в src/sources.ts.
// Тип локальний: акаунтів creators і tools у проєкті більше немає
export interface ArchivedSource { name: string; url: string; account: "creators" | "tools" }

export const archivedSources: ArchivedSource[] = [
  // 🎨 Digital Creators — дизайн, фото, відео, 3D, музика
  { name: "Figma Blog", url: "https://www.figma.com/blog/feed/atom.xml", account: "creators" },
  { name: "It's Nice That", url: "http://feeds2.feedburner.com/itsnicethat/SlXC", account: "creators" },
  { name: "80 Level", url: "https://80.lv/feed/", account: "creators" },
  { name: "CG Channel", url: "https://www.cgchannel.com/feed/", account: "creators" },
  { name: "Music Business Worldwide", url: "https://www.musicbusinessworldwide.com/feed/", account: "creators" },
  { name: "Sidebar", url: "https://sidebar.io/feed.xml", account: "creators" },
  { name: "Graphic Design Junction", url: "https://graphicdesignjunction.com/feed/", account: "creators" },
  { name: "Speckyboy", url: "https://speckyboy.com/feed/", account: "creators" },
  { name: "CineD", url: "https://www.cined.com/feed/", account: "creators" },
  { name: "MusicTech", url: "https://musictech.com/feed/", account: "creators" },
  { name: "Attack Magazine", url: "https://www.attackmagazine.com/feed/", account: "creators" },

  // Платформи й соцмережі — офіційні оновлення та поради для авторів
  { name: "YouTube Blog", url: "https://blog.youtube/rss/", account: "creators" },
  { name: "Meta Newsroom", url: "https://about.fb.com/news/feed/", account: "creators" },
  { name: "Spotify Newsroom", url: "https://newsroom.spotify.com/feed/", account: "creators" },
  { name: "Podnews", url: "https://podnews.net/rss", account: "creators" },
  { name: "Social Media Examiner", url: "https://www.socialmediaexaminer.com/feed/", account: "creators" },
  { name: "Later", url: "https://later.com/rss.xml", account: "creators" },
  { name: "Buffer", url: "https://buffer.com/resources/rss/", account: "creators" },
  { name: "TubeBuddy", url: "https://www.tubebuddy.com/blog/feed/", account: "creators" },

  // Креатори, фриланс, музиканти (2026-10-11)
  { name: "Creative Boom", url: "https://www.creativeboom.com/feed/", account: "creators" },
  { name: "Webdesigner Depot", url: "https://www.webdesignerdepot.com/feed/", account: "creators" },
  { name: "Influencer Marketing Hub", url: "https://influencermarketinghub.com/feed/", account: "creators" },
  { name: "Embedded", url: "https://embedded.substack.com/feed", account: "creators" },
  { name: "DIY Musician", url: "https://diymusician.cdbaby.com/feed/", account: "creators" },
  { name: "Ari's Take", url: "https://aristake.com/feed/", account: "creators" },
  { name: "Platformer", url: "https://www.platformer.news/rss/", account: "creators" },

  // 🇺🇦 Українські джерела — GPT переказує своїми словами (див. промпт)
  { name: "MC.today", url: "https://mc.today/uk/feed/", account: "creators" },
  { name: "Детектор медіа", url: "https://detector.media/rss", account: "creators" },
  { name: "Платформа", url: "https://platfor.ma/feed/", account: "creators" },

  // Креатор-економіка й монетизація — поки теж у creators
  { name: "The Verge", url: "https://www.theverge.com/rss/creators/index.xml", account: "creators" },
  { name: "Passionfruit", url: "https://passionfru.it/feed/", account: "creators" },
  { name: "Streams Charts", url: "https://streamscharts.com/feed", account: "creators" },
  { name: "Creator Economy", url: "https://creatoreconomy.so/feed", account: "creators" },

  // 🎮 Геймдев і розробка — переїхали з AI-каналу в Креатори UA (2026-10-11)
  { name: "Game Developer", url: "https://www.gamedeveloper.com/rss.xml", account: "creators" },
  { name: "GamesIndustry.biz", url: "https://www.gamesindustry.biz/feed", account: "creators" },
  { name: "GameDiscoverCo", url: "https://newsletter.gamediscover.co/feed", account: "creators" },
  { name: "How To Market A Game", url: "https://howtomarketagame.com/feed/", account: "creators" },
  { name: "Godot", url: "https://godotengine.org/rss.xml", account: "creators" },
  { name: "Blender Developers", url: "https://code.blender.org/feed/", account: "creators" },

  // 🧠 AI-джерела 2026-10-19 перенесено в src/sources.ts (AI-канал); шлак (GitHub, Hacker News, Hugging Face, мертві розсилки) видалено

  // ✍️ Письменники, самвидав, розсилки, курси — з 2026-10-13 у creators (GPT частину відправляє в AI-канал)
  { name: "Jane Friedman", url: "https://janefriedman.com/feed/", account: "creators" },
  { name: "ALLi", url: "https://selfpublishingadvice.org/feed/", account: "creators" },
  { name: "Writer's Digest", url: "https://www.writersdigest.com/feed", account: "creators" },
  { name: "Written Word Media", url: "https://www.writtenwordmedia.com/feed/", account: "creators" },
  { name: "BookBub", url: "https://insights.bookbub.com/feed/", account: "creators" },
  { name: "Draft2Digital", url: "https://www.draft2digital.com/blog/feed/", account: "creators" },
  { name: "Substack", url: "https://on.substack.com/feed", account: "creators" },
  { name: "eLearning Industry", url: "https://elearningindustry.com/feed", account: "creators" },
  { name: "Nathan Bransford", url: "https://nathanbransford.com/feed", account: "creators" },
  { name: "Inbox Collective", url: "https://inboxcollective.com/feed/", account: "creators" },
  { name: "Writer Beware", url: "https://writerbeware.blog/feed/", account: "creators" },
  { name: "Simon Owens", url: "https://simonowens.substack.com/feed", account: "creators" },
];
