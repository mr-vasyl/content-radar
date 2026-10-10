// Тематичний акаунт, для якого джерело переважно пише.
export type Account = "creators" | "tools" | "knowledge";

export interface Source {
  name: string; // назва платформи для підпису "за матеріалами: ..."
  url: string; // адреса RSS-стрічки
  account: Account;
}

// Перевірено `npm run check-sources` 2026-10-10: RSS живий, повний текст дістається.
export const sources: Source[] = [
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

  // Креатор-економіка й монетизація — поки теж у creators
  { name: "Tubefilter", url: "https://www.tubefilter.com/feed/", account: "creators" },
  { name: "The Verge", url: "https://www.theverge.com/rss/creators/index.xml", account: "creators" },
  { name: "Social Media Today", url: "https://www.socialmediatoday.com/feeds/news/", account: "creators" },
  { name: "Passionfruit", url: "https://passionfru.it/feed/", account: "creators" },
  { name: "Streams Charts", url: "https://streamscharts.com/feed", account: "creators" },
  { name: "Creator Economy", url: "https://creatoreconomy.so/feed", account: "creators" },

  // 💻 Digital Tools — AI, розробка, геймдев
  { name: "TechCrunch", url: "https://techcrunch.com/category/artificial-intelligence/feed/", account: "tools" },
  { name: "The Verge", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", account: "tools" },
  { name: "GitHub Blog", url: "https://github.blog/feed/", account: "tools" },
  { name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", account: "tools" },
  { name: "Game Developer", url: "https://www.gamedeveloper.com/rss.xml", account: "tools" },

  // ✍️ Digital Knowledge — письменники, самвидав, розсилки, автори курсів
  { name: "Jane Friedman", url: "https://janefriedman.com/feed/", account: "knowledge" },
  { name: "ALLi", url: "https://selfpublishingadvice.org/feed/", account: "knowledge" },
  { name: "Writer's Digest", url: "https://www.writersdigest.com/feed", account: "knowledge" },
  { name: "Written Word Media", url: "https://www.writtenwordmedia.com/feed/", account: "knowledge" },
  { name: "BookBub", url: "https://insights.bookbub.com/feed/", account: "knowledge" },
  { name: "Draft2Digital", url: "https://www.draft2digital.com/blog/feed/", account: "knowledge" },
  { name: "Substack", url: "https://on.substack.com/feed", account: "knowledge" },
  { name: "eLearning Industry", url: "https://elearningindustry.com/feed", account: "knowledge" },
];
