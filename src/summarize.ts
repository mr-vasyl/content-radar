import OpenAI from "openai";
import type { Article } from "./fetchArticles.ts";

const openai = new OpenAI(); // ключ береться з OPENAI_API_KEY
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `Ти редактор українського Telegram-каналу для творців контенту.
Тобі дають англомовну статтю. Напиши пост українською:
- до 500 символів разом із пробілами (приблизно 60–70 слів), один абзац;
- спочатку що сталося, з ключовими цифрами чи фактами;
- далі що це змінює або чому варто звернути увагу (без фраз "Це важливо", "Для читача");
- живою мовою, без канцеляриту, кліше та емодзі;
- не вигадуй фактів, яких немає в тексті;
- назви компаній і продуктів лишай в оригіналі, а звичайні слова перекладай (не "spam", а "спам"; не "inboxes", а "пошта").
Поверни лише текст поста, без заголовка і без посилань.`;

export async function summarize(article: Article, fullText: string | null): Promise<string> {
  const body = fullText ?? article.content;

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Заголовок: ${article.title}\n\n${body}` },
    ],
  });

  const text = res.choices[0]?.message.content?.trim();
  if (!text) throw new Error(`GPT повернув порожню відповідь для ${article.url}`);

  return `${text}\n\nЗа матеріалами: ${article.source}`;
}
