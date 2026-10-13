// 🚀 Пости про SkyNovix для Threads — ЛИШЕ за фактами з content/skynovix-facts.md.
// Один запуск = один пост (інколи мультичастинний 1/N). Запуски розкидані по дню (3–5 на день).
// Голос — від бренду («ми»), кінцівка — «Посилання в шапці профілю.». Товари з сайту поки НЕ публікуємо (власник).
import { readFileSync } from "node:fs";
import { prisma } from "../db.ts";
import { askJson, LANGUAGE } from "../gpt.ts";
import { factCheck, factNote } from "../factCheck.ts";
import { sendPost } from "../sendToTelegram.ts";
import type { RunOptions } from "./types.ts";

const FACTS_PATH = "content/skynovix-facts.md";
const AGENT_PATH = "content/skynovix-agent.md";
export const PROMO_END = "Посилання в шапці профілю.";

export const THEMES = {
  fees: "Комісії, виплати й податки (розділи 2–3)",
  checkout: "Оплата й покупка (розділ 4)",
  what_to_sell: "Що можна продавати і напрями авторів (розділ 5)",
  trust: "Довіра: відгуки й рейтинг, бейдж «ексклюзивний товар», водяні знаки на превʼю (розділ 6) — без конкретних товарів",
  positioning: "Позиціонування: чому українським авторам потрібна така платформа (розділ 1)",
  tips: "Загальна порада авторам (маркетинг, перші покупці, ціноутворення) — не про фічі; у кінці м'яко згадати SkyNovix",
} as const;
type Theme = keyof typeof THEMES;

// Код-охоронці: те, чого НЕМА на платформі (розділ 7) і небезпечні обіцянки. GPT на слово не віримо.
const FORBIDDEN: [RegExp, string][] = [
  [/промокод|знижков\w* код|купон/i, "промокоди"],
  [/бандл|пакет\w* (товар|продаж)|набір кількох товарів/i, "бандли"],
  [/власн\w* домен|свій домен|кастомн\w* домен/i, "власний домен"],
  [/конструктор\w* лендінг|лендінг/i, "лендінги"],
  [/телеграм-бот|telegram-бот|бот-продав|продаж\w* (у|в|через) (телеграм|telegram)/i, "продаж через Telegram-бота"],
  [/email-розсил|e-mail-розсил|розсилк|воронк/i, "email-автоматизація"],
  [/\butm\b|utm-|джерел\w* трафіку/i, "UTM"],
  [/ai-(асистент|чат|аналіт)|штучн\w* інтелект\w* (проаналіз|аналітик)|чат-бот/i, "AI-асистент"],
  [/швидк\w* (лінк|посилан)\w*.{0,20}оплат|оплат\w* в обхід/i, "швидкі лінки на оплату"],
  [/stripe|liqpay|paypal|wayforpay|fondy|portmone/i, "інші платіжні провайдери"],
  [/миттєв\w* (виплат|вивед|вивід|зарахув)|виплат\w* (щодня|щотижня|миттєво|одразу)/i, "миттєві виплати"],
  [/гарант\w* (дох|продаж|заробіт)|заробиш|заробите \d/i, "гарантії заробітку"],
  // обіцянки швидкості виплат: у факт-листі лише «14 та 28 числа» + період утримання
  [/не (треба|потрібно|доведеться) (чекати|довго)|без очікуван\w* (виплат|грош)|швидк\w* виплат|гроші (одразу|відразу|швидко)/i, "обіцянки швидкості виплат"],
];
const ALLOWED_PERCENTS = new Set(["6", "8", "10", "18", "5"]);

function guard(text: string): string[] {
  const problems = FORBIDDEN.filter(([re]) => re.test(text)).map(([, why]) => `згадано ${why} — цього немає на платформі`);
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)) {
    if (!ALLOWED_PERCENTS.has(m[1]!)) problems.push(`відсоток ${m[1]}% не з факт-листа`);
  }
  return problems;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["parts"],
  properties: { parts: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } } },
} as const;

async function pickTheme(): Promise<Theme> {
  const recent = await prisma.promoPost.findMany({ orderBy: { createdAt: "desc" }, take: 12, select: { theme: true } });
  const last = recent[0]?.theme;
  // найдавніше використана тема, але не та сама, що минулого разу
  const lastUsed = (t: Theme) => {
    const i = recent.findIndex((r) => r.theme === t);
    return i === -1 ? Infinity : i;
  };
  const candidates = (Object.keys(THEMES) as Theme[]).filter((t) => t !== last);
  return candidates.sort((a, b) => lastUsed(b) - lastUsed(a))[0]!;
}

export async function runPromo({ dryRun, send }: RunOptions, forcedTheme?: Theme): Promise<void> {
  const facts = readFileSync(FACTS_PATH, "utf8");
  const agent = readFileSync(AGENT_PATH, "utf8");
  const theme = forcedTheme ?? (await pickTheme());

  const recent = await prisma.promoPost.findMany({ orderBy: { createdAt: "desc" }, take: 15, select: { text: true } });
  const recentList = recent.map((r) => `- ${r.text.split("\n")[0]!.slice(0, 120)}`).join("\n") || "(ще не було)";

  const system = `${agent}

## Уточнення власника
- Пиши ВІД БРЕНДУ, «ми» («На SkyNovix ми…», «Ми беремо банківські комісії на себе»). Не від першої особи «я».
- Пост — лише для Threads: кожна частина до 450 символів (ліміт Threads — 500).
- Мультичастинний пост (2–5 частин, «1/4», «2/4» на початку кожної) — приблизно кожен четвертий, коли тему справді
  варто розкласти по кроках; інакше — одна частина.
- Останнє речення останньої частини рівно: «${PROMO_END}» (без посилань, skynovix.com у тексті не пиши).
- Конкретні товари й авторів із сайту НЕ згадуй — пиши про платформу.
- Не повторюй думки й гачки з останніх постів (список нижче).
${LANGUAGE}

## Факт-лист (єдине джерело правди)
${facts}`;

  const user = `Тема цього поста: ${THEMES[theme]}.

Останні пости (не повторюй їхні думки й перші рядки):
${recentList}`;

  let parts: string[] = [];
  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const out = await askJson<{ parts: string[] }>(system, user + feedback, "promo", SCHEMA);
    parts = out.parts.map((p) => p.replace(/\*\*/g, "").trim()).filter(Boolean);
    const problems = guard(parts.join("\n"));
    if (!problems.length) break;
    console.log(`🚀 спроба ${attempt}: ${problems.join("; ")}`);
    if (attempt === 2) {
      console.log("🚀 пост не пройшов перевірку — не надсилаю");
      return;
    }
    feedback = `\n\nПопередня версія мала проблеми: ${problems.join("; ")}. Напиши заново без цього.`;
  }

  // Фактчек кожної частини проти факт-листа — та сама перевірка, що й для грантів
  const notes: string[] = [];
  for (const [i, part] of parts.entries()) {
    const fc = await factCheck("Факт-лист SkyNovix", "SkyNovix — факти", facts, part);
    if (fc.verdict === "reject") {
      console.log(`🚀 фактчек відхилив частину ${i + 1}: ${fc.issues.join("; ")} — не надсилаю`);
      return;
    }
    parts[i] = fc.post;
    const note = factNote(fc);
    if (note) notes.push(`${i + 1}: ${note}`);
  }
  if (guard(parts.join("\n")).length) {
    console.log("🚀 після фактчеку з'явились заборонені речі — не надсилаю");
    return;
  }

  // Кінцівка — лише в останній частині й завжди наша; нумерація «1/3» — кодом, GPT її забував
  const lastIdx = parts.length - 1;
  parts = parts.map((p, i) => {
    let text = p.replace(/\s*Посилання (в|у) шапці профілю\.?/gi, "").replace(/^\s*\d\/\d\s*/, "").trim();
    if (parts.length > 1) text = `${i + 1}/${parts.length}\n\n${text}`;
    if (i === lastIdx) text = `${text}\n\n${PROMO_END}`;
    return text;
  });

  console.log(`\n🚀 [${theme}] ${parts.length} частин:\n\n${parts.join("\n\n---\n\n")}`);

  if (send) {
    for (const [i, part] of parts.entries()) {
      await sendPost(part, {
        lines: [
          `🚀 SkyNovix для Threads · ${THEMES[theme].split(" (")[0]}${parts.length > 1 ? ` · частина ${i + 1}/${parts.length}` : ""}`,
          ...(i === lastIdx ? notes : []),
        ],
      });
    }
  }
  if (!dryRun) await prisma.promoPost.create({ data: { theme, text: parts.join("\n\n---\n\n") } });
}
