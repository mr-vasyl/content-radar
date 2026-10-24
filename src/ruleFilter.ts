import type { Article } from "./fetchArticles.ts";

// Дешевий фільтр до GPT: відсікає те, що видно з адреси чи заголовка.
// Повертає причину відсіву або null, якщо стаття проходить.

const URL_RULES: [RegExp, string][] = [
  [/\/(video|videos|podcast|podcasts)\//i, "відео/подкаст — на сторінці немає тексту"],
  [/\/(deals?|coupons?|shopping)\//i, "розділ знижок"],
];

const TITLE_RULES: [RegExp, string][] = [
  // "deal" окремо не ловимо — це часто "угода" (licensing deal, brand deals), а не знижка
  [/\bdeals? (on|for)\b|\bon sale\b|\bsale (is|ends|price)\b|\bdiscount|% off|\bsave \$|savings? of|black friday|cyber monday|prime day|\bcoupon|cheaper than/i, "знижки/розпродаж"],
  [/\bbest\b.*\b(20\d\d|right now|for (beginners|the money))\b/i, "добірка «best of»"],
  [/\bhow to watch\b|\bwhere to buy\b/i, "куди дивитись/де купити"],
  [/\bsponsored\b|\bpartner content\b|\bin partnership with\b/i, "реклама"],
  [/(^|\s)review\b|\breviewed\b|\bhands[- ]on\b|\bunboxing\b/i, "огляд техніки"],
];

// Українські гранти не для креаторів (з ГУРТу/Простору) — GPT інколи пропускає, тому відсікаємо за словами.
// Лише для каналу митців: для бізнес-каналу агро й ветеранський бізнес якраз підходять.
const NOT_CREATIVE = /агро|аграр|фермер|сільськогосп|медичн|медик|госпітал|ветеран|ОСББ|теплопостач|енергоефектив|водопостач|гуманітарн|реінтеграц|соцзахист|соціальн\w* послуг/i;
export function notCreativeReason(a: Article): string | null {
  return NOT_CREATIVE.test(a.title) ? "грант/програма не для креаторів" : null;
}

// Медіа-джерела, де можливості трапляються зрідка серед звичайних новин (аудит 2026-10-24: dev.ua і Детектор медіа —
// 167 оцінок GPT за 3 дні, надіслано 4). Їхні статті йдуть на GPT, лише якщо заголовок схожий на можливість.
const NOISY_SOURCES = new Set(["dev.ua", "Детектор медіа", "Studway", "Мінкульт", "Читомо"]);
const OPPORTUNITY_WORDS =
  /грант|конкурс|преміі|премі|стипенді|резиденц|open ?call|опенкол|набір|прийом (заявок|робіт|творів)|заявк|подати|подавай|реєстрац|хакатон|джем|фестивал|воркшоп|тренінг|школ|курс|лаборатор|програм|відбір|шукаємо|запрошу|можливіст|фінансуванн|підтримк/i;
export function noisyReason(a: Article): string | null {
  return NOISY_SOURCES.has(a.source) && !OPPORTUNITY_WORDS.test(a.title) ? "звичайна новина медіа (за заголовком)" : null;
}

export function ruleRejectReason(a: Article): string | null {
  for (const [re, why] of URL_RULES) if (re.test(a.url)) return why;
  for (const [re, why] of TITLE_RULES) if (re.test(a.title)) return why;
  return null;
}
