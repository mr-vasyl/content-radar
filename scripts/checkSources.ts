// Перевіряє кандидатів у джерела: чи є RSS, як часто пишуть, чи дістається повний текст.
// Запуск: npm run check-sources
import { extractText } from "../src/extractText.ts";
import { loadFeed } from "../src/fetchArticles.ts";

interface Candidate {
  name: string;
  group: string;
  feeds: string[]; // відомі/ймовірні адреси RSS — пробуються по черзі
  home?: string; // якщо жодна не спрацювала — шукаємо <link rel="alternate"> на сторінці
}

const candidates: Candidate[] = [
  // Дизайн, ілюстрація, фото, відео
  { name: "Figma Blog", group: "design", feeds: ["https://www.figma.com/blog/feed/atom.xml", "https://www.figma.com/blog/feed/"], home: "https://www.figma.com/blog/" },
  { name: "Canva Newsroom", group: "design", feeds: ["https://www.canva.com/newsroom/news/feed/"], home: "https://www.canva.com/newsroom/news/" },
  { name: "Adobe Blog", group: "design", feeds: ["https://blog.adobe.com/en/feed.xml", "https://blog.adobe.com/feed.xml"], home: "https://blog.adobe.com/" },
  { name: "Creative Bloq", group: "design", feeds: ["https://www.creativebloq.com/feeds/all"] },
  { name: "Smashing Magazine", group: "design", feeds: ["https://www.smashingmagazine.com/feed/"] },
  { name: "Codrops", group: "design", feeds: ["https://tympanus.net/codrops/feed/"] },
  { name: "It's Nice That", group: "design", feeds: ["https://www.itsnicethat.com/rss"], home: "https://www.itsnicethat.com/" },
  { name: "PetaPixel", group: "photo", feeds: ["https://petapixel.com/feed/"] },
  { name: "Fstoppers", group: "photo", feeds: ["https://fstoppers.com/rss.xml"] },
  { name: "No Film School", group: "video", feeds: ["https://nofilmschool.com/feeds/feed.rss", "https://nofilmschool.com/rss.xml"], home: "https://nofilmschool.com/" },
  { name: "CG Channel", group: "3d", feeds: ["https://www.cgchannel.com/feed/"] },
  { name: "BlenderNation", group: "3d", feeds: ["https://www.blendernation.com/feed/"] },
  { name: "80 Level", group: "3d", feeds: ["https://80.lv/feed/", "https://80.lv/rss/"], home: "https://80.lv/" },

  // Музика
  { name: "LANDR Blog", group: "music", feeds: ["https://blog.landr.com/feed/"] },
  { name: "MusicRadar", group: "music", feeds: ["https://www.musicradar.com/feeds/all"] },
  { name: "Music Business Worldwide", group: "music", feeds: ["https://www.musicbusinessworldwide.com/feed/"] },

  // Письменники, освіта
  { name: "Reedsy Blog", group: "writers", feeds: ["https://blog.reedsy.com/feed/", "https://reedsy.com/blog/feed/"], home: "https://reedsy.com/blog/" },
  { name: "Jane Friedman", group: "writers", feeds: ["https://janefriedman.com/feed/"] },
  { name: "Kindlepreneur", group: "writers", feeds: ["https://kindlepreneur.com/feed/"] },
  { name: "Teachable Blog", group: "education", feeds: ["https://www.teachable.com/blog/rss.xml", "https://teachable.com/blog/feed"], home: "https://www.teachable.com/blog" },

  // Геймдев
  { name: "Game Developer", group: "gamedev", feeds: ["https://www.gamedeveloper.com/rss.xml"] },

  // Розробка, AI, інструменти
  { name: "GitHub Blog", group: "dev", feeds: ["https://github.blog/feed/"] },
  { name: "Canva Developers", group: "dev", feeds: ["https://www.canva.dev/blog/rss.xml", "https://www.canva.dev/blog/feed/"], home: "https://www.canva.dev/blog/" },
  { name: "Hugging Face Blog", group: "ai", feeds: ["https://huggingface.co/blog/feed.xml"] },
  { name: "OpenAI News", group: "ai", feeds: ["https://openai.com/news/rss.xml"] },
  { name: "TechCrunch AI", group: "ai", feeds: ["https://techcrunch.com/category/artificial-intelligence/feed/"] },
  { name: "The Verge AI", group: "ai", feeds: ["https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"] },
  { name: "Product Hunt", group: "tools", feeds: ["https://www.producthunt.com/feed"] },

  // Креатор-економіка, монетизація, соцмережі
  { name: "Tubefilter", group: "creators", feeds: ["https://www.tubefilter.com/feed/"] },
  { name: "Social Media Today", group: "creators", feeds: ["https://www.socialmediatoday.com/feeds/news/"] },
  { name: "The Verge Creators", group: "creators", feeds: ["https://www.theverge.com/rss/creators/index.xml"] },
  { name: "Kit (ConvertKit) Blog", group: "creators", feeds: ["https://kit.com/resources/blog/rss.xml"], home: "https://kit.com/resources/blog" },
  { name: "Patreon Blog", group: "monetize", feeds: ["https://blog.patreon.com/rss.xml", "https://news.patreon.com/rss.xml"], home: "https://news.patreon.com/" },
  { name: "Ko-fi Blog", group: "monetize", feeds: ["https://ko-fi.com/blog/rss"], home: "https://ko-fi.com/blog" },
  { name: "Creator Economy (Peter Yang)", group: "monetize", feeds: ["https://creatoreconomy.so/feed"] },
  { name: "The Publish Press", group: "monetize", feeds: ["https://www.thepublishpress.com/feed", "https://thepublishpress.com/feed/"], home: "https://www.thepublishpress.com/" },
  { name: "Passionfruit", group: "monetize", feeds: ["https://passionfru.it/feed/"], home: "https://passionfru.it/" },
  { name: "Digiday", group: "monetize", feeds: ["https://digiday.com/feed/"] },
  { name: "Streams Charts", group: "monetize", feeds: ["https://streamscharts.com/news/rss", "https://streamscharts.com/rss"], home: "https://streamscharts.com/news" },
  { name: "Game Developer (indie)", group: "monetize", feeds: ["https://www.gamedeveloper.com/business/rss.xml"] },

  // Knowledge: письменники, самвидав, розсилки
  { name: "The Creative Penn", group: "knowledge", feeds: ["https://www.thecreativepenn.com/feed/"] },
  { name: "ALLi Self-Publishing Advice", group: "knowledge", feeds: ["https://selfpublishingadvice.org/feed/"] },
  { name: "Written Word Media", group: "knowledge", feeds: ["https://www.writtenwordmedia.com/feed/"] },
  { name: "BookBub Insights", group: "knowledge", feeds: ["https://insights.bookbub.com/feed/"] },
  { name: "Draft2Digital", group: "knowledge", feeds: ["https://www.draft2digital.com/blog/feed/"], home: "https://www.draft2digital.com/blog/" },
  { name: "Writer's Digest", group: "knowledge", feeds: ["https://www.writersdigest.com/.rss/full/"], home: "https://www.writersdigest.com/" },
  { name: "Publishers Weekly", group: "knowledge", feeds: ["https://www.publishersweekly.com/pw/feeds/recent/index.xml"], home: "https://www.publishersweekly.com/" },
  { name: "The Book Designer", group: "knowledge", feeds: ["https://www.thebookdesigner.com/feed/"] },
  { name: "On Substack", group: "knowledge", feeds: ["https://on.substack.com/feed"] },
  { name: "beehiiv Blog", group: "knowledge", feeds: ["https://blog.beehiiv.com/feed", "https://www.beehiiv.com/blog/rss.xml"], home: "https://www.beehiiv.com/blog" },
  { name: "Ghost Blog", group: "knowledge", feeds: ["https://ghost.org/blog/rss/"] },
  { name: "Nieman Lab", group: "knowledge", feeds: ["https://www.niemanlab.org/feed/"] },
  // Knowledge: викладачі, курси, експерти
  { name: "Thinkific Blog", group: "knowledge", feeds: ["https://www.thinkific.com/blog/feed/"] },
  { name: "Podia Blog", group: "knowledge", feeds: ["https://www.podia.com/articles/feed", "https://www.podia.com/articles/rss"], home: "https://www.podia.com/articles" },
  { name: "Kajabi Blog", group: "knowledge", feeds: ["https://www.kajabi.com/blog/rss.xml"], home: "https://www.kajabi.com/blog" },
  { name: "Class Central", group: "knowledge", feeds: ["https://www.classcentral.com/report/feed/"] },
  { name: "EdSurge", group: "knowledge", feeds: ["https://www.edsurge.com/articles_rss"], home: "https://www.edsurge.com/" },
  { name: "eLearning Industry", group: "knowledge", feeds: ["https://elearningindustry.com/feed"] },
  { name: "Ness Labs", group: "knowledge", feeds: ["https://nesslabs.com/feed"] },

  // ── Третя хвиля (2026-10-10): закриваємо прогалини ──
  // Безкоштовні ресурси й дизайн
  { name: "Freebiesbug", group: "b3-design", feeds: ["https://freebiesbug.com/feed/"] },
  { name: "Speckyboy", group: "b3-design", feeds: ["https://speckyboy.com/feed/"] },
  { name: "Abduzeedo", group: "b3-design", feeds: ["https://abduzeedo.com/rss.xml", "https://abduzeedo.com/feed"], home: "https://abduzeedo.com/" },
  { name: "Designmodo", group: "b3-design", feeds: ["https://designmodo.com/feed/"] },
  { name: "Graphic Design Junction", group: "b3-design", feeds: ["https://graphicdesignjunction.com/feed/"] },
  { name: "Design Week", group: "b3-design", feeds: ["https://www.designweek.co.uk/feed/"] },
  { name: "Motionographer", group: "b3-design", feeds: ["https://motionographer.com/feed/"] },
  { name: "Colossal", group: "b3-design", feeds: ["https://www.thisiscolossal.com/feed/"] },
  { name: "UX Collective", group: "b3-design", feeds: ["https://uxdesign.cc/feed"] },
  { name: "Sidebar", group: "b3-design", feeds: ["https://sidebar.io/feed.xml"] },
  // Відео й фото
  { name: "PremiumBeat", group: "b3-video", feeds: ["https://www.premiumbeat.com/blog/feed/"] },
  { name: "CineD", group: "b3-video", feeds: ["https://www.cined.com/feed/"] },
  { name: "Frame.io Insider", group: "b3-video", feeds: ["https://blog.frame.io/feed/"] },
  { name: "DIY Photography", group: "b3-video", feeds: ["https://www.diyphotography.net/feed/"] },
  { name: "Motion Array Learn", group: "b3-video", feeds: ["https://motionarray.com/learn/feed/"], home: "https://motionarray.com/learn/" },
  // YouTube, стрімінг, соцмережі, подкасти
  { name: "YouTube Official Blog", group: "b3-creators", feeds: ["https://blog.youtube/rss/"], home: "https://blog.youtube/" },
  { name: "vidIQ Blog", group: "b3-creators", feeds: ["https://vidiq.com/blog/feed/"], home: "https://vidiq.com/blog/" },
  { name: "TubeBuddy Blog", group: "b3-creators", feeds: ["https://www.tubebuddy.com/blog/feed/"], home: "https://www.tubebuddy.com/blog" },
  { name: "Social Media Examiner", group: "b3-creators", feeds: ["https://www.socialmediaexaminer.com/feed/"] },
  { name: "Buffer Blog", group: "b3-creators", feeds: ["https://buffer.com/resources/rss/"], home: "https://buffer.com/resources/" },
  { name: "Later Blog", group: "b3-creators", feeds: ["https://later.com/blog/feed/"], home: "https://later.com/blog/" },
  { name: "Hootsuite Blog", group: "b3-creators", feeds: ["https://blog.hootsuite.com/feed/"] },
  { name: "Twitch Blog", group: "b3-creators", feeds: ["https://blog.twitch.tv/en/rss.xml"], home: "https://blog.twitch.tv/en/" },
  { name: "Spotify Newsroom", group: "b3-creators", feeds: ["https://newsroom.spotify.com/feed/"] },
  { name: "Podnews", group: "b3-creators", feeds: ["https://podnews.net/rss"] },
  { name: "Meta Newsroom", group: "b3-creators", feeds: ["https://about.fb.com/news/feed/"] },
  { name: "TikTok Newsroom", group: "b3-creators", feeds: ["https://newsroom.tiktok.com/en-us/rss"], home: "https://newsroom.tiktok.com/en-us" },
  // Продаж цифрових продуктів
  { name: "Creative Market Blog", group: "b3-sell", feeds: ["https://creativemarket.com/blog/feed"] },
  { name: "Envato Blog", group: "b3-sell", feeds: ["https://www.envato.com/blog/feed/"] },
  { name: "Etsy Seller Handbook", group: "b3-sell", feeds: ["https://www.etsy.com/seller-handbook/rss"], home: "https://www.etsy.com/seller-handbook" },
  { name: "Shutterstock Blog", group: "b3-sell", feeds: ["https://www.shutterstock.com/blog/feed"], home: "https://www.shutterstock.com/blog" },
  { name: "Lemon Squeezy Blog", group: "b3-sell", feeds: ["https://www.lemonsqueezy.com/blog/rss.xml"], home: "https://www.lemonsqueezy.com/blog" },
  { name: "Gumroad Blog", group: "b3-sell", feeds: ["https://gumroad.com/blog/feed", "https://gumroad.gumroad.com/feed"], home: "https://gumroad.com/blog" },
  // AI-інструменти
  { name: "VentureBeat AI", group: "b3-ai", feeds: ["https://venturebeat.com/category/ai/feed/"] },
  { name: "Ben's Bites", group: "b3-ai", feeds: ["https://www.bensbites.com/feed"], home: "https://www.bensbites.com/" },
  { name: "Simon Willison", group: "b3-ai", feeds: ["https://simonwillison.net/atom/everything/"] },
  { name: "The Decoder", group: "b3-ai", feeds: ["https://the-decoder.com/feed/"] },
  // Музика
  { name: "Bedroom Producers Blog", group: "b3-music", feeds: ["https://bedroomproducersblog.com/feed/"] },
  { name: "Rekkerd", group: "b3-music", feeds: ["https://rekkerd.org/feed/"] },
  { name: "Attack Magazine", group: "b3-music", feeds: ["https://www.attackmagazine.com/feed/"] },
  { name: "MusicTech", group: "b3-music", feeds: ["https://musictech.com/feed/"] },
  { name: "Hypebot", group: "b3-music", feeds: ["https://www.hypebot.com/feed/"] },
  // Геймдев
  { name: "How To Market A Game", group: "b3-gamedev", feeds: ["https://howtomarketagame.com/feed/"] },
  { name: "GameDiscoverCo", group: "b3-gamedev", feeds: ["https://newsletter.gamediscover.co/feed"] },
  { name: "Godot News", group: "b3-gamedev", feeds: ["https://godotengine.org/rss.xml"] },
  { name: "Blender Developers", group: "b3-gamedev", feeds: ["https://code.blender.org/feed/"] },
  { name: "GameDev Pulse (TG)", group: "b3-gamedev", feeds: ["https://rsshub.app/telegram/channel/gamedev"] },
  // Письменники, розсилки, курси
  { name: "Self-Publishing Formula", group: "b3-knowledge", feeds: ["https://selfpublishingformula.com/feed/"] },
  { name: "Writer Unboxed", group: "b3-knowledge", feeds: ["https://writerunboxed.com/feed/"] },
  { name: "Nathan Bransford", group: "b3-knowledge", feeds: ["https://nathanbransford.com/feed"] },
  { name: "Inbox Collective", group: "b3-knowledge", feeds: ["https://inboxcollective.com/feed/"] },
  { name: "Circle Blog", group: "b3-knowledge", feeds: ["https://circle.so/blog/rss.xml"], home: "https://circle.so/blog" },
  { name: "Mighty Networks", group: "b3-knowledge", feeds: ["https://www.mightynetworks.com/resources/rss.xml"], home: "https://www.mightynetworks.com/resources" },

  // ── Четверта хвиля (2026-10-11) ──
  // 🇺🇦 Українські медіа
  { name: "AIN.UA", group: "b4-ua", feeds: ["https://ain.ua/feed/"], home: "https://ain.ua/" },
  { name: "MC.today", group: "b4-ua", feeds: ["https://mc.today/uk/feed/", "https://mc.today/feed/"], home: "https://mc.today/uk/" },
  { name: "Speka", group: "b4-ua", feeds: ["https://speka.media/rss", "https://speka.media/feed"], home: "https://speka.media/" },
  { name: "DOU", group: "b4-ua", feeds: ["https://dou.ua/feed/"], home: "https://dou.ua/" },
  { name: "Bird in Flight", group: "b4-ua", feeds: ["https://birdinflight.com/ua/feed", "https://birdinflight.com/feed"], home: "https://birdinflight.com/ua/" },
  { name: "Детектор медіа", group: "b4-ua", feeds: ["https://detector.media/rss", "https://detector.media/rss.xml"], home: "https://detector.media/" },
  { name: "Mezha", group: "b4-ua", feeds: ["https://mezha.media/feed/"], home: "https://mezha.media/" },
  { name: "ITC.ua", group: "b4-ua", feeds: ["https://itc.ua/feed/"], home: "https://itc.ua/" },
  { name: "Платформа (Platfor.ma)", group: "b4-ua", feeds: ["https://platfor.ma/feed/", "https://platfor.ma/rss"], home: "https://platfor.ma/" },
  { name: "Український інститут", group: "b4-ua", feeds: ["https://ui.org.ua/feed/"], home: "https://ui.org.ua/" },
  // 💰 Гранти й можливості для українців
  { name: "УКФ", group: "b4-grants", feeds: ["https://ucf.in.ua/feed", "https://ucf.in.ua/rss"], home: "https://ucf.in.ua/" },
  { name: "House of Europe", group: "b4-grants", feeds: ["https://houseofeurope.org.ua/feed", "https://houseofeurope.org.ua/rss"], home: "https://houseofeurope.org.ua/" },
  { name: "Creative Europe Desk Ukraine", group: "b4-grants", feeds: ["https://creativeeurope.in.ua/feed", "https://creativeeurope.in.ua/rss"], home: "https://creativeeurope.in.ua/" },
  { name: "ГУРТ: гранти", group: "b4-grants", feeds: ["https://gurt.org.ua/rss/news/grants/", "https://gurt.org.ua/rss/"], home: "https://gurt.org.ua/news/grants/" },
  { name: "Простір: гранти", group: "b4-grants", feeds: ["https://www.prostir.ua/?feed=rss2", "https://www.prostir.ua/feed/"], home: "https://www.prostir.ua/" },
  // 🤖 Практичний AI
  { name: "One Useful Thing", group: "b4-ai", feeds: ["https://www.oneusefulthing.org/feed"] },
  { name: "The Neuron", group: "b4-ai", feeds: ["https://www.theneurondaily.com/feed", "https://www.theneuron.ai/feed"], home: "https://www.theneurondaily.com/" },
  { name: "Every", group: "b4-ai", feeds: ["https://every.to/feed", "https://every.to/feed.xml"], home: "https://every.to/" },
  // 🎨 Креатори й фриланс
  { name: "Creative Boom", group: "b4-creators", feeds: ["https://www.creativeboom.com/feed/"] },
  { name: "Webdesigner Depot", group: "b4-creators", feeds: ["https://www.webdesignerdepot.com/feed/"] },
  { name: "Influencer Marketing Hub", group: "b4-creators", feeds: ["https://influencermarketinghub.com/feed/"] },
  { name: "Embedded (Kate Lindsay)", group: "b4-creators", feeds: ["https://embedded.substack.com/feed", "https://www.embedded.club/feed"], home: "https://embedded.substack.com/" },
  // 🎵 Музиканти
  { name: "DIY Musician (CD Baby)", group: "b4-music", feeds: ["https://diymusician.cdbaby.com/feed/"] },
  { name: "Ari's Take", group: "b4-music", feeds: ["https://aristake.com/feed/"] },
  // ✍️ Knowledge
  { name: "Writer Beware", group: "b4-knowledge", feeds: ["https://writerbeware.blog/feed/"] },
  { name: "Simon Owens", group: "b4-knowledge", feeds: ["https://simonowens.substack.com/feed"] },
  { name: "Platformer", group: "b4-knowledge", feeds: ["https://www.platformer.news/rss/", "https://www.platformer.news/feed"], home: "https://www.platformer.news/" },
  // 🎮 Геймдев
  { name: "GamesIndustry.biz", group: "b4-gamedev", feeds: ["https://www.gamesindustry.biz/feed"], home: "https://www.gamesindustry.biz/" },
  { name: "itch.io (featured)", group: "b4-gamedev", feeds: ["https://itch.io/feed/featured.xml", "https://itch.io/games/featured.xml"] },
];

// npm run check-sources knowledge monetize — перевірити лише ці групи
const onlyGroups = process.argv.slice(2);
if (onlyGroups.length) candidates.splice(0, candidates.length, ...candidates.filter((c) => onlyGroups.includes(c.group)));

const DAY = 24 * 60 * 60 * 1000;
const SAMPLE = 3;

async function discoverFeed(home: string): Promise<string | null> {
  try {
    const html = await (await fetch(home, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Mozilla/5.0" } })).text();
    const m = html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i);
    const href = m?.[0].match(/href=["']([^"']+)["']/i)?.[1];
    return href ? new URL(href, home).toString() : null;
  } catch {
    return null;
  }
}

async function check(c: Candidate) {
  let feedUrl: string | null = null;
  let feed: Awaited<ReturnType<typeof loadFeed>> | null = null;

  const tryUrls = [...c.feeds];
  for (let i = 0; i < tryUrls.length && !feed; i++) {
    try {
      feed = await loadFeed(tryUrls[i]!);
      feedUrl = tryUrls[i]!;
    } catch {
      if (i === tryUrls.length - 1 && c.home) {
        const found = await discoverFeed(c.home);
        if (found && !tryUrls.includes(found)) tryUrls.push(found);
      }
    }
  }
  if (!feed || !feedUrl) return { ...c, ok: false as const };

  const items = feed.items.filter((i) => i.link);
  const dates = items.map((i) => (i.isoDate ? new Date(i.isoDate).getTime() : NaN)).filter((d) => !isNaN(d) && d <= Date.now()); // бувають дати з майбутнього
  const week = dates.filter((d) => Date.now() - d < 7 * DAY).length;
  const newest = dates.length ? Math.round((Date.now() - Math.max(...dates)) / DAY) : null;

  const lengths: number[] = [];
  for (const item of items.slice(0, SAMPLE)) {
    const text = await extractText(item.link!);
    lengths.push(text?.length ?? 0);
  }
  const extracted = lengths.filter((l) => l > 0).length;
  const avgLen = extracted ? Math.round(lengths.reduce((a, b) => a + b, 0) / extracted) : 0;

  return { ...c, ok: true as const, feedUrl, total: items.length, week, newest, extracted, sampled: lengths.length, avgLen };
}

// по 6 паралельно, щоб не чекати вічність
const results: Awaited<ReturnType<typeof check>>[] = [];
for (let i = 0; i < candidates.length; i += 6) {
  results.push(...(await Promise.all(candidates.slice(i, i + 6).map(check))));
}

for (const r of results) {
  if (!r.ok) {
    console.log(`✗ ${r.name.padEnd(26)} [${r.group}] RSS не знайдено`);
    continue;
  }
  const verdict = r.extracted === r.sampled && r.week > 0 ? "✓" : r.extracted > 0 && r.week > 0 ? "~" : "✗";
  console.log(
    `${verdict} ${r.name.padEnd(26)} [${r.group}] ${String(r.week).padStart(3)}/тиждень, ` +
      `останнє ${r.newest ?? "?"} дн. тому, текст ${r.extracted}/${r.sampled} (~${r.avgLen} симв.)  ${r.feedUrl}`,
  );
}
