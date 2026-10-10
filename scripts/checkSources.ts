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
];

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
