// ♻️ Евергрін: старі сильні матеріали з архівів стрічок, подані як свіжий пост без прив'язки до дати.
//
// Скарбничка живе в таблиці Article:
//   status "evergreen"          — перевірено, пост уже написано, чекає своєї черги
//   status "evergreen_sent"     — надіслано
//   status "evergreen_rejected" — не підходить (застаріло / не наше), більше не перевіряємо
import { prisma } from "../db.ts";
import { askJson, AUDIENCE, HOOK_RULES, HOOK_SCORE, LANGUAGE, VOICE } from "../gpt.ts";
import { sources } from "../sources.ts";
import { fetchArticles, type Article } from "../fetchArticles.ts";
import { ruleRejectReason } from "../ruleFilter.ts";
import { extractText } from "../extractText.ts";
import { alreadyRan, markRan } from "../formatLog.ts";
import { sendHook, sendPost } from "../sendToTelegram.ts";
import { ACCOUNTS, MIN_SCORE } from "../summarize.ts";
import { TAGS, TAGS_PROMPT } from "../channels.ts";
import type { Account } from "../sources.ts";
import type { RunOptions } from "./types.ts";

const MIN_AGE_DAYS = 14; // молодше — це ще новина
const MAX_AGE_DAYS = 3 * 365; // старше — надто велика ймовірність, що застаріло
const POOL_TARGET = 6; // якщо в скарбничці менше — доповнюємо з архівів
const TITLES_PER_CALL = 80;
const MAX_DEEP_CHECKS = 20; // скільки статей за запуск читаємо повністю
const PER_SOURCE = 3; // не більше стількох з одного джерела за раз — Figma з архівом на 757 статей інакше забиває все

// По черзі з кожного джерела: A1, B1, C1, A2, B2… — щоб великі архіви не витісняли малі
function interleaveBySource(items: Article[]): Article[] {
  const groups = new Map<string, Article[]>();
  for (const a of items) groups.set(a.source, [...(groups.get(a.source) ?? []), a]);
  const out: Article[] = [];
  for (let i = 0; out.length < items.length; i++) {
    for (const g of groups.values()) if (g[i]) out.push(g[i]!);
  }
  return out;
}

const SCREEN_PROMPT = `${AUDIENCE}

Тобі дають список старих статей (заголовок, джерело, дата). Обери ті, що ймовірно досі корисні сьогодні —
вічнозелені: практичні гайди, техніки, кейси з уроками, розбори, добірки ресурсів, поради з монетизації й просування.
НЕ бери: новини й анонси (події минули), оновлення продуктів, знижки, огляди техніки, інтерв'ю без практичного змісту,
внутрішню кухню компаній, технічні статті для великих команд.
Будь вибірковим: зазвичай підходить 5–15% списку. Поверни номери (id) обраних.`;

const SCREEN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ids"],
  properties: { ids: { type: "array", items: { type: "integer" } } },
} as const;

const DEEP_PROMPT = `${AUDIENCE}

Тобі дають статтю, якій більше двох тижнів (дата вказана). Зроби дві речі.

1. ОЦІНИ від 1 до 10, наскільки вона корисна й актуальна СЬОГОДНІ для аудиторії, якщо подати її як вічнозелений матеріал.
Високо: практичні техніки й гайди, які не застаріли; кейси з цифрами й уроками; добірки ресурсів, що досі доступні;
принципи монетизації й просування. Низько: прив'язка до минулих подій, дат, версій продуктів, акцій; загальні поради без конкретики.
Будь суворим: 7+ — лише якщо автор сьогодні реально щось із цього забере.
Гранти, конкурси, премії, челенджі, конференції й події — завжди 1–2: у старих статтях вони вже минули,
а зарубіжні нам і так не потрібні.
Обери account (creators | tools | knowledge), куди пасує. reason — одне коротке речення (до 20 слів).
${TAGS_PROMPT}

2. Якщо оцінка ${MIN_SCORE} або вище — НАПИШИ ПОСТ (post) українською як свіжу знахідку, без прив'язки до дати:
не пиши «нещодавно», «цього тижня», «у 2023 році вийшла стаття», не згадуй, що матеріал старий.
Якщо в статті є дані, що могли застаріти (ціни, версії), — або не згадуй їх, або подай обережно («на момент публікації»).

${VOICE}

Формат:
- від 500 до 1000 символів разом із пробілами;
- 2–4 короткі абзаци (порожній рядок між ними);
- виділи **жирним** 1–3 найголовніші речі, не цілі речення;
- можна почати з короткого жирного заголовка в один рядок;
- жодної іншої розмітки — без списків, курсиву, решіток і посилань;
${LANGUAGE}
Якщо оцінка нижче ${MIN_SCORE} — post порожній рядок.

3. Якщо оцінка ${HOOK_SCORE} або вище — напиши ще ${HOOK_RULES}
Якщо оцінка нижче ${HOOK_SCORE} — hook порожній рядок.`;

const DEEP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "account", "reason", "post", "hook", "tags"],
  properties: {
    score: { type: "integer", minimum: 1, maximum: 10 },
    account: { type: "string", enum: Object.keys(ACCOUNTS) },
    reason: { type: "string" },
    post: { type: "string" },
    hook: { type: "string" },
    tags: { type: "array", minItems: 1, maxItems: 2, items: { type: "string", enum: [...TAGS] } },
  },
} as const;

interface Deep {
  score: number;
  account: Account;
  reason: string;
  post: string;
  hook: string;
  tags: string[];
}

interface PoolItem {
  url: string;
  title: string;
  source: string;
  score: number;
  account: Account;
  reason: string;
  post: string;
  hook: string | null;
  tags: string | null; // через пробіл
}

async function save(a: Article, status: string, extra: Partial<{ score: number; account: string; reason: string; post: string; hook: string | null; tags: string | null }>) {
  const data = { status, score: extra.score ?? null, account: extra.account ?? null, reason: extra.reason ?? null, post: extra.post ?? null, hook: extra.hook ?? null, tags: extra.tags ?? null };
  await prisma.article.upsert({
    where: { url: a.url },
    update: data,
    create: { url: a.url, title: a.title, source: a.source, publishedAt: a.publishedAt, ...data },
  });
}

// Доповнює скарбничку: архіви стрічок → відсів за заголовками → глибока перевірка
async function refillPool(dryRun: boolean): Promise<PoolItem[]> {
  const now = Date.now();
  const all: Article[] = [];
  await Promise.all(
    sources.map(async (s) => {
      try {
        all.push(...(await fetchArticles(s)));
      } catch (err) {
        console.error(`Помилка з джерелом ${s.name}:`, (err as Error).message);
      }
    }),
  );

  const old = all.filter((a) => {
    if (!a.publishedAt) return false;
    const age = (now - a.publishedAt.getTime()) / 86400000;
    return age >= MIN_AGE_DAYS && age <= MAX_AGE_DAYS && !ruleRejectReason(a);
  });
  const known = new Set(
    (await prisma.article.findMany({ where: { url: { in: old.map((a) => a.url) } }, select: { url: true } })).map((r) => r.url),
  );
  const unseen = interleaveBySource([...new Map(old.filter((a) => !known.has(a.url)).map((a) => [a.url, a])).values()]);
  console.log(`♻️ архіви: старих статей ${old.length}, ще не перевірених ${unseen.length}`);

  // 1. Відсів за заголовками — пачками
  const picked: Article[] = [];
  for (let i = 0; i < unseen.length && picked.length < MAX_DEEP_CHECKS; i += TITLES_PER_CALL) {
    const chunk = unseen.slice(i, i + TITLES_PER_CALL);
    const list = chunk.map((a, j) => `${j}. [${a.source}] ${a.title} (${a.publishedAt!.toISOString().slice(0, 10)})`).join("\n");
    const { ids } = await askJson<{ ids: number[] }>(SCREEN_PROMPT, list, "screen", SCREEN_SCHEMA);
    const chosen = new Set(ids.filter((id) => id >= 0 && id < chunk.length));
    for (const [j, a] of chunk.entries()) {
      if (!chosen.has(j)) {
        if (!dryRun) await save(a, "evergreen_rejected", { reason: "відсіяно за заголовком" });
      } else if (picked.filter((p) => p.source === a.source).length < PER_SOURCE) {
        picked.push(a);
      } // понад ліміт з одного джерела — не записуємо, чекають наступного доповнення
    }
  }
  console.log(`♻️ за заголовками відібрано ${picked.length}`);

  // 2. Глибока перевірка — читаємо повністю
  const added: PoolItem[] = [];
  for (const a of picked.slice(0, MAX_DEEP_CHECKS)) {
    try {
      const text = await extractText(a.url);
      if (!text) {
        if (!dryRun) await save(a, "evergreen_rejected", { reason: "не вдалося дістати текст" });
        continue;
      }
      const d = await askJson<Deep>(
        DEEP_PROMPT,
        `Джерело: ${a.source}\nДата: ${a.publishedAt!.toISOString().slice(0, 10)}\nЗаголовок: ${a.title}\n\n${text}`,
        "evergreen",
        DEEP_SCHEMA,
      );
      const ok = d.score >= MIN_SCORE && d.post.trim();
      console.log(`${ok ? "✓" : "·"} ${d.score}/10 [${d.account}] ${a.source}: ${a.title} — ${d.reason}`);
      if (ok) {
        const post = d.post.trim(); // «За матеріалами» додає sendPost під лінією
        const tags = d.tags.length ? d.tags.join(" ") : null;
        const hook = d.score >= HOOK_SCORE && d.hook.trim() ? d.hook.trim() : null;
        added.push({ url: a.url, title: a.title, source: a.source, score: d.score, account: d.account, reason: d.reason, post, hook, tags });
        if (!dryRun) await save(a, "evergreen", { score: d.score, account: d.account, reason: d.reason, post, hook, tags });
      } else if (!dryRun) {
        await save(a, "evergreen_rejected", { score: d.score, account: d.account, reason: d.reason });
      }
    } catch (err) {
      console.error(`✗ ${a.title}:`, (err as Error).message);
    }
  }
  return added;
}

export async function runEvergreen({ dryRun, send }: RunOptions): Promise<void> {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" }); // YYYY-MM-DD
  if (!dryRun && (await alreadyRan("evergreen", today))) {
    console.log(`♻️ сьогодні вже надіслано — пропускаю`);
    return;
  }

  let pool: PoolItem[] = (await prisma.article.findMany({
    where: { status: "evergreen", post: { not: null } },
    orderBy: { score: "desc" },
  })) as PoolItem[];

  if (dryRun || pool.length < POOL_TARGET) {
    const added = await refillPool(dryRun);
    pool = [...pool, ...added].sort((a, b) => b.score - a.score);
  }
  console.log(`♻️ у скарбничці: ${pool.length}`);
  if (pool.length === 0) {
    console.log("♻️ скарбничка порожня — пропускаю");
    return;
  }

  // Чергуємо акаунти: не той самий, що минулого разу (якщо є вибір)
  const last = await prisma.article.findFirst({ where: { status: "evergreen_sent" }, orderBy: { createdAt: "desc" } });
  const item = pool.find((p) => p.account !== last?.account) ?? pool[0]!;

  console.log(`\n♻️ ${item.score}/10 [${item.account}] ${item.title}\n\n${item.post}`);
  if (send) {
    await sendPost(item.post, {
      tags: item.tags?.split(" ").filter(Boolean),
      account: item.account,
      source: item.source,
      lines: [`♻️ Евергрін · ⭐ ${item.score}/10`, item.title],
      link: { url: item.url, label: "Оригінал" },
    }, dryRun ? undefined : { format: "evergreen", title: item.title, url: item.url, source: item.source, account: item.account, score: item.score });
    if (item.hook) await sendHook(item.hook);
  }
  if (!dryRun) {
    await prisma.article.update({ where: { url: item.url }, data: { status: "evergreen_sent" } });
    await markRan("evergreen", today);
  }
}
