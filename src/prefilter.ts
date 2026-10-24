// 💸 Дешевий попередній відбір за заголовками (аудит 2026-10-24: «Продавай своє» й SkyNovix читали повністю ~150
// статей на день, а надсилали ~10). Один запит із заголовками й коротким описом усієї пачки → GPT обирає кілька
// найперспективніших, лише їх читаємо повністю й оцінюємо. Решту позначаємо як відсіяні, щоб не платити за них знову.
import { askJson } from "./gpt.ts";
import type { Article } from "./fetchArticles.ts";

export async function prefilter(batch: Article[], purpose: string, keep: number): Promise<Set<string>> {
  if (batch.length <= keep) return new Set(batch.map((a) => a.url));
  const list = batch
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}${a.content ? ` — ${a.content.replace(/\s+/g, " ").slice(0, 160)}` : ""}`)
    .join("\n");
  const r = await askJson<{ picks: number[] }>(
    `Ти редактор. За заголовками й короткими описами обери до ${keep} матеріалів, з яких найімовірніше вийде сильний пост.
Мета каналу: ${purpose}
Відкидай звичайні новини без зв'язку з темою, рекламу, знижки, техніку для програмістів, політику, некрологи.
Поверни picks — номери зі списку (до ${keep}), від найкращого.`,
    list,
    "prefilter",
    { type: "object", additionalProperties: false, required: ["picks"], properties: { picks: { type: "array", items: { type: "integer" } } } },
  );
  return new Set(r.picks.filter((n) => n >= 1 && n <= batch.length).slice(0, keep).map((n) => batch[n - 1]!.url));
}
