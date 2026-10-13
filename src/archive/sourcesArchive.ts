// АРХІВ (2026-10-13): джерела каналів «Креатори UA» і «AI для творців», зупинених власником.
// Не підключено ніде. Повернути — перенести потрібні рядки в src/sources.ts.
import type { Source } from "../sources.ts";

export const archivedSources: Source[] = [
  // 🎨 Digital Creators — дизайн, фото, відео, 3D, музика
  { name: "Figma Blog", url: "https://www.figma.com/blog/feed/atom.xml", account: "creators" },
  { name: "It's Nice That", url: "http://feeds2.feedburner.com/itsnicethat/SlXC", account: "creators" },
  { name: "Creative Bloq", url: "https://www.creativebloq.com/feeds/all", account: "creators" },
  { name: "Fstoppers", url: "https://fstoppers.com/rss.xml", account: "creators" },
  { name: "No Film School", url: "https://nofilmschool.com/feeds/feed.rss", account: "creators" },
  { name: "80 Level", url: "https://80.lv/feed/", account: "creators" },
  { name: "CG Channel", url: "https://www.cgchannel.com/feed/", account: "creators" },
  { name: "MusicRadar", url: "https://www.musicradar.com/feeds/all", account: "creators" },
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
  { name: "AIN.UA", url: "https://ain.ua/feed/", account: "tools" },
  { name: "Mezha", url: "https://mezha.media/feed/", account: "tools" },

  // Креатор-економіка й монетизація — поки теж у creators
  { name: "Tubefilter", url: "https://www.tubefilter.com/feed/", account: "creators" },
  { name: "The Verge", url: "https://www.theverge.com/rss/creators/index.xml", account: "creators" },
  { name: "Social Media Today", url: "https://www.socialmediatoday.com/feeds/news/", account: "creators" },
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
  { name: "GitHub Blog", url: "https://github.blog/feed/", account: "creators" },

  // 🧠 AI для всіх — безкоштовні інструменти, нові функції, практичні способи
  { name: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/", account: "tools" },
  { name: "The Verge", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", account: "tools" },
  { name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", account: "tools" },
  { name: "The Decoder", url: "https://the-decoder.com/feed/", account: "tools" },
  { name: "Ben's Bites", url: "https://www.bensbites.com/feed", account: "tools" },
  { name: "The Neuron", url: "https://www.theneuron.ai/feed", account: "tools" },
  { name: "One Useful Thing", url: "https://www.oneusefulthing.org/feed", account: "tools" },
  { name: "TLDR AI", url: "https://tldr.tech/api/rss/ai", account: "tools" },
  { name: "The Rundown AI", url: "https://www.therundown.ai/feed", account: "tools" },
  { name: "Product Hunt", url: "https://www.producthunt.com/feed?category=artificial-intelligence", account: "tools" },
  { name: "Hacker News", url: "https://hnrss.org/show?q=AI&points=50", account: "tools" }, // нові відкриті AI-проєкти (Show HN)
  { name: "OpenAI", url: "https://openai.com/news/rss.xml", account: "tools" }, // текст закритий — GPT бачить анонс з RSS
  { name: "Google AI", url: "https://blog.google/technology/ai/rss/", account: "tools" },
  { name: "Google Gemini", url: "https://blog.google/products/gemini/rss/", account: "tools" },
  { name: "MakeUseOf", url: "https://www.makeuseof.com/feed/", account: "tools" },
  { name: "How-To Geek", url: "https://www.howtogeek.com/feed/", account: "tools" },
  { name: "Zapier", url: "https://zapier.com/blog/feeds/latest/", account: "tools" },
  { name: "DOU", url: "https://dou.ua/lenta/tags/AI/feed/", account: "tools" }, // лише тег AI

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
