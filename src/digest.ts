// Спільне для добірок зі статей у базі (📌 Збережи собі, 📅 Топ місяця):
// GPT обирає найкращі й пише заголовок/опис, а список, посилання й нумерацію збирає код.
import { askJson, AUDIENCE, LANGUAGE } from "./gpt.ts";

export interface DigestCandidate {
  key: string; // article:<url>
  url: string;
  source: string;
  title: string;
  text: string; // текст поста або статті — щоб GPT зрозумів суть
}

interface DigestOut {
  title: string;
  intro: string;
  items: { key: string; name: string; why: string }[];
  outro: string;
}

export interface Digest {
  post: string;
  chosen: DigestCandidate[];
}

// Без протоколу, www і міток відстеження (?utm_…) — коротше й чистіше в пості
export function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^ref$|^source$/i.test(k)) u.searchParams.delete(k);
    return `${u.host.replace(/^www\./, "")}${u.pathname}${u.search}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

const schema = (max: number) => ({
  type: "object",
  additionalProperties: false,
  required: ["title", "intro", "items", "outro"],
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    items: {
      type: "array",
      minItems: 3,
      maxItems: max,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "name", "why"],
        properties: { key: { type: "string" }, name: { type: "string" }, why: { type: "string" } },
      },
    },
    outro: { type: "string" },
  },
});

// task — що за добірка і як обирати; count — скільки пунктів
export async function writeDigest(task: string, candidates: DigestCandidate[], count: number): Promise<Digest | null> {
  const n = Math.min(count, candidates.length);
  if (n < 3) return null;

  const system = `${AUDIENCE}

${task}

Обери від 3 до ${n} пунктів зі списку — лише ті, що справді підходять під завдання. Краще менше, ніж натягувати.
Для кожного:
- key — точно як у списку;
- name — коротка назва пункту українською (до 60 символів): назва ресурсу/інструмента/події, без лапок і емодзі;
- why — 1–2 короткі речення (до 220 символів): що це і навіщо читачу, конкретно, без реклами.
Також напиши:
- title — короткий чіпкий заголовок добірки (до 70 символів), без емодзі;
- intro — одне речення, навіщо ця добірка;
- outro — одне коротке речення-порада читачам (можна порожнім); не пропонуй «зібрати ще добірку» і не звертайся до редакції.
Пиши живою мовою блогера, на «ви». Не пиши від першої особи («зібрав», «підібрав», «я») — просто подавай знахідки.
Не згадуй технічні назви каналів (creators, tools, knowledge).
${LANGUAGE}`;

  const list = candidates
    .map((c) => `key: ${c.key}\nджерело: ${c.source}\nзаголовок: ${c.title}\nтекст: ${c.text.slice(0, 1500)}`)
    .join("\n\n---\n\n");

  const out = await askJson<DigestOut>(system, list, "digest", schema(n));

  const byKey = new Map(candidates.map((c) => [c.key, c]));
  const picked = out.items.filter((it) => byKey.has(it.key));
  if (picked.length < 3) throw new Error(`GPT обрав замало валідних пунктів (${picked.length} з ${n})`);

  const lines = picked.map((it, i) => {
    const c = byKey.get(it.key)!;
    return `${i + 1}. **${it.name.trim()}**\n${it.why.trim()}\n${displayUrl(c.url)}`;
  });
  const post = [`**${out.title.trim()}**`, out.intro.trim(), ...lines, out.outro.trim()].filter(Boolean).join("\n\n");
  return { post, chosen: picked.map((it) => byKey.get(it.key)!) };
}
