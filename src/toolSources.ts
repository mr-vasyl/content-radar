// Джерела для добірок інструментів: GitHub (Trending + пошук за темами) і Hugging Face Spaces.
import type { Account } from "./sources.ts";

export interface ToolCandidate {
  key: string; // унікальний ключ для журналу добірок
  name: string;
  url: string;
  description: string;
  stars: number; // зірки GitHub або лайки Hugging Face
  starsRecent?: number; // скільки зірок набрав за тиждень (лише GitHub Trending)
  kind: "github" | "hf";
  readme?: string; // уривок README — щоб GPT зрозумів, навіщо інструмент
}

// Теми GitHub для кожного акаунта. Беремо свіжі репозиторії (створені за ~4 місяці) з найбільшою кількістю зірок.
const GITHUB_TOPICS: Record<Exclude<Account, "knowledge">, string[]> = {
  tools: ["chatgpt", "claude", "ai-tools", "generative-ai", "ai-agents", "local-llm", "text-to-speech", "speech-to-text", "automation", "n8n"],
  creators: [
    "comfyui", "stable-diffusion", "image-generation", "video-generation", "figma-plugin",
    "blender-addon", "obsidian-plugin", "obs-studio", "audio-plugin", "video-editing", "youtube", "godot", "gamedev",
  ],
};

// Відсіюємо NSFW і явно не наше
const BLOCKLIST = /nsfw|uncensored|nude|porn|hentai|deepnude|undress|onlyfans|crypto|airdrop|trading-bot|cheat/i;

const GH_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "User-Agent": "ContentRadar/1.0",
  ...(process.env.GITHUB_TOKEN || process.env.GITHUB_DISPATCH_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN || process.env.GITHUB_DISPATCH_TOKEN}` }
    : {}),
};

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

async function githubSearch(topic: string): Promise<ToolCandidate[]> {
  const q = encodeURIComponent(`topic:${topic} created:>${daysAgo(120)} stars:>50`);
  const res = await fetch(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=8`, {
    headers: GH_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`GitHub search ${topic}: ${res.status}`);
  const data = (await res.json()) as {
    items: { full_name: string; html_url: string; description: string | null; stargazers_count: number; fork: boolean; archived: boolean }[];
  };
  return data.items
    .filter((r) => !r.fork && !r.archived)
    .map((r) => ({
      key: `github:${r.full_name.toLowerCase()}`,
      name: r.full_name,
      url: r.html_url,
      description: r.description ?? "",
      stars: r.stargazers_count,
      kind: "github" as const,
    }));
}

// github.com/trending не має API — парсимо сторінку. Дає "зірок за тиждень" — найкращий сигнал популярності.
async function githubTrending(): Promise<ToolCandidate[]> {
  const res = await fetch("https://github.com/trending?since=weekly", {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`GitHub trending: ${res.status}`);
  const html = await res.text();

  return html.split('<article class="Box-row">').slice(1).flatMap((block) => {
    const full = block.match(/<h2[\s\S]*?href="\/([^"]+)"/)?.[1];
    if (!full) return [];
    const desc = block.match(/<p class="col-9[^"]*">\s*([\s\S]*?)\s*<\/p>/)?.[1] ?? "";
    const total = block.match(/href="\/[^"]+\/stargazers"[\s\S]*?<\/svg>\s*([\d,]+)/)?.[1];
    const week = block.match(/([\d,]+) stars this week/)?.[1];
    const num = (s?: string) => (s ? Number(s.replace(/,/g, "")) : 0);
    return [{
      key: `github:${full.toLowerCase()}`,
      name: full,
      url: `https://github.com/${full}`,
      description: desc.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim(),
      stars: num(total),
      starsRecent: num(week),
      kind: "github" as const,
    }];
  });
}

async function hfTrendingSpaces(): Promise<ToolCandidate[]> {
  const res = await fetch("https://huggingface.co/api/spaces?sort=trendingScore&direction=-1&limit=40&full=true", {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Hugging Face: ${res.status}`);
  const data = (await res.json()) as { id: string; likes: number; cardData?: { title?: string; short_description?: string } }[];
  return data.map((s) => ({
    key: `hf:${s.id.toLowerCase()}`,
    name: s.cardData?.title || s.id,
    url: `https://huggingface.co/spaces/${s.id}`,
    description: s.cardData?.short_description ?? "",
    stars: s.likes,
    kind: "hf" as const,
  }));
}

async function readmeExcerpt(fullName: string): Promise<string> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${fullName}/HEAD/README.md`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return "";
    return (await res.text())
      .replace(/<[^>]+>/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // картинки
      .replace(/\s+/g, " ")
      .slice(0, 1200);
  } catch {
    return "";
  }
}

// Кандидати для акаунта, відсортовані за "гарячістю". Помилка одного джерела не валить решту.
export async function collectToolCandidates(account: "tools" | "creators"): Promise<ToolCandidate[]> {
  const tasks: Promise<ToolCandidate[]>[] = GITHUB_TOPICS[account].map(githubSearch);
  if (account === "tools") tasks.push(githubTrending());
  tasks.push(hfTrendingSpaces()); // HF корисний обом: AI-застосунки для зображень/відео/аудіо й для розробників

  const results = await Promise.allSettled(tasks);
  for (const r of results) if (r.status === "rejected") console.error("Джерело інструментів:", r.reason);

  const byKey = new Map<string, ToolCandidate>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const c of r.value) {
      if (BLOCKLIST.test(`${c.name} ${c.description}`)) continue;
      const prev = byKey.get(c.key);
      if (!prev || (c.starsRecent ?? 0) > (prev.starsRecent ?? 0)) byKey.set(c.key, c);
    }
  }

  // Trending (зірки за тиждень) важать більше за загальні зірки свіжого репо
  const hotness = (c: ToolCandidate) => (c.starsRecent ? c.starsRecent * 3 : c.stars);
  return [...byKey.values()].sort((a, b) => hotness(b) - hotness(a));
}

export async function withReadmes(candidates: ToolCandidate[]): Promise<ToolCandidate[]> {
  return Promise.all(
    candidates.map(async (c) => (c.kind === "github" ? { ...c, readme: await readmeExcerpt(c.name) } : c)),
  );
}
