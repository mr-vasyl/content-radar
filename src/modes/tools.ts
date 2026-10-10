// 🧰 Інструменти тижня: добірка 5 свіжих популярних інструментів з GitHub і Hugging Face.
import { askJson, AUDIENCE, LANGUAGE } from "../gpt.ts";
import { collectToolCandidates, withReadmes, type ToolCandidate } from "../toolSources.ts";
import { alreadyRan, featuredKeys, isoWeek, markFeatured, markRan } from "../formatLog.ts";
import { sendCard, sendToTelegram } from "../sendToTelegram.ts";
import { ACCOUNTS } from "../summarize.ts";
import type { RunOptions } from "./types.ts";

const PICKS = 5;
const SHORTLIST = 25; // скільки кандидатів показуємо GPT

const FOCUS = {
  tools: "розробники, AI-креатори, автоматизатори, інді-розробники ігор",
  creators: "дизайнери, ілюстратори, відеомейкери, 3D-артисти, музиканти, блогери, ютубери, стрімери",
} as const;

const SYSTEM_PROMPT = `${AUDIENCE}

Ти складаєш тижневу добірку «${PICKS} інструментів, які варто знати» для одного каналу.
Тобі дають список свіжих популярних інструментів (GitHub-репозиторії та AI-застосунки Hugging Face) з описом і уривком README.

Обери рівно ${PICKS}, які найкорисніші саме для аудиторії каналу:
- автор-одинак може спробувати це вже сьогодні (встановити, відкрити в браузері, підключити до своїх інструментів);
- розв'язує конкретну задачу: швидше створювати, монтувати, писати, продавати, автоматизувати рутину;
- безкоштовне або відкрите;
- різноманітність: не бери два майже однакові інструменти; охопи щонайменше 3 різні напрями
  (для creators: зображення, відео, звук і музика, 3D, дизайн, стрімінг, соцмережі; для tools: агенти, автоматизація,
  розробка, геймдев, робота з текстом і даними).
Не бери: інфраструктуру для великих команд, наукові бенчмарки, гайди з навчання моделей на кластерах,
інструменти для обходу чужих прав (зняття чужих водяних знаків, крадіжка контенту), читерство, крипту, NSFW,
речі, з яких незрозуміло, що вони роблять.

Напиши:
- title — короткий чіпкий заголовок добірки українською (до 70 символів), без емодзі, напр. «5 інструментів, які цього тижня забирають собі розробники»;
- intro — одне речення, навіщо ця добірка (без «у цій добірці»);
- для кожного обраного: key (точно як у списку) і why — 1–2 короткі речення (до 220 символів):
  що саме робить і кому стане в пригоді; конкретно, без реклами й перебільшень; без назви інструмента на початку;
- outro — одне коротке речення-висновок або порада (можна порожнім).
Пиши живою мовою блогера, на «ви», без сленгу-калік («фетчить», «деплоїть», «end-to-end» — пиши «завантажує», «розгортає», «наскрізні»).
Технічні назви форматів і протоколів (MCP, API, STL, MP4) лишай як є.
${LANGUAGE}`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "intro", "items", "outro"],
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    items: {
      type: "array",
      minItems: PICKS,
      maxItems: PICKS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "why"],
        properties: { key: { type: "string" }, why: { type: "string" } },
      },
    },
    outro: { type: "string" },
  },
} as const;

interface Digest {
  title: string;
  intro: string;
  items: { key: string; why: string }[];
  outro: string;
}

function compact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

function describe(c: ToolCandidate): string {
  const stats = c.kind === "hf" ? `лайків ${c.stars}` : `зірок ${c.stars}${c.starsRecent ? `, +${c.starsRecent} за тиждень` : ""}`;
  return `key: ${c.key}\nназва: ${c.name} (${c.kind === "hf" ? "AI-застосунок Hugging Face" : "GitHub"}, ${stats})\n` +
    `опис: ${c.description || "—"}${c.readme ? `\nREADME: ${c.readme}` : ""}`;
}

// Пост збирає код: цифри й посилання — з даних, а не від GPT
function buildPost(d: Digest, chosen: ToolCandidate[]): string {
  const lines = chosen.map((c, i) => {
    const why = d.items.find((it) => it.key === c.key)!.why.trim();
    const shortName = c.kind === "github" ? c.name.split("/")[1]! : c.name;
    const stats = c.kind === "hf"
      ? `❤️ ${compact(c.stars)}`
      : `⭐ ${compact(c.stars)}${c.starsRecent ? ` (+${compact(c.starsRecent)} за тиждень)` : ""}`;
    return `${i + 1}. **${shortName}** · ${stats}\nнавіщо: ${why}\n${c.url.replace(/^https:\/\//, "")}`;
  });
  return [`**${d.title.trim()}**`, d.intro.trim(), ...lines, d.outro.trim()].filter(Boolean).join("\n\n");
}

export async function runTools({ dryRun, send }: RunOptions): Promise<void> {
  const week = isoWeek();

  for (const account of ["tools", "creators"] as const) {
    const period = `${week}:${account}`;
    if (!dryRun && (await alreadyRan("tools", period))) {
      console.log(`🧰 ${account}: за ${week} уже надіслано — пропускаю`);
      continue;
    }

    const all = await collectToolCandidates(account);
    const seen = dryRun ? new Set<string>() : await featuredKeys("tools", all.map((c) => c.key));
    const shortlist = await withReadmes(all.filter((c) => !seen.has(c.key)).slice(0, SHORTLIST));
    if (shortlist.length < PICKS) {
      console.log(`🧰 ${account}: замало нових кандидатів (${shortlist.length}) — пропускаю`);
      continue;
    }

    const digest = await askJson<Digest>(
      SYSTEM_PROMPT,
      `Канал: ${account} (${FOCUS[account]})\n\nКандидати:\n\n${shortlist.map(describe).join("\n\n---\n\n")}`,
      "tools_digest",
      SCHEMA,
    );

    const byKey = new Map(shortlist.map((c) => [c.key, c]));
    const invalid = digest.items.filter((it) => !byKey.has(it.key));
    if (invalid.length) console.warn(`🧰 ${account}: GPT повернув невідомі ключі: ${invalid.map((i) => i.key).join(", ")}`);
    const chosen = digest.items.map((it) => byKey.get(it.key)).filter((c): c is ToolCandidate => !!c).slice(0, PICKS);
    if (chosen.length < 3) throw new Error(`🧰 ${account}: GPT обрав замало валідних інструментів (${chosen.length})`);

    const post = buildPost(digest, chosen);
    console.log(`\n🧰 ${account}:\n${post}\n[${post.replace(/\*\*/g, "").length} символів]`);

    if (send) {
      await sendCard([`🧰 Інструменти тижня · ${ACCOUNTS[account]}`, `GitHub і Hugging Face · ${week}`]);
      await sendToTelegram(post);
    }
    if (!dryRun) {
      await markFeatured("tools", chosen.map((c) => c.key));
      await markRan("tools", period);
    }
  }
}
