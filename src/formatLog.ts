import { prisma } from "./db.ts";

// Журнал періодичних форматів: що вже виходило і що вже було в добірках.
// У режимі dryRun (preview) нічого не пишемо і не блокуємо — щоб можна було тестувати скільки завгодно.

export type Format = "saves";

// ISO-тиждень за Києвом: "2026-W41"
export function isoWeek(d = new Date()): string {
  const kyiv = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Kyiv" }));
  const t = new Date(Date.UTC(kyiv.getFullYear(), kyiv.getMonth(), kyiv.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function alreadyRan(format: Format, period: string): Promise<boolean> {
  return (await prisma.formatRun.count({ where: { format, period } })) > 0;
}

export async function markRan(format: Format, period: string): Promise<void> {
  await prisma.formatRun.upsert({ where: { format_period: { format, period } }, update: {}, create: { format, period } });
}

export async function featuredKeys(format: Format, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const rows = await prisma.featuredItem.findMany({ where: { format, key: { in: keys } }, select: { key: true } });
  return new Set(rows.map((r) => r.key));
}

export async function markFeatured(format: Format, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await prisma.featuredItem.createMany({ data: keys.map((key) => ({ key, format })), skipDuplicates: true });
}
