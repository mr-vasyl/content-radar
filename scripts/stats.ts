// Статистика: що бот надсилав і на що ти ставив реакції.
// Запуск: npm run stats [днів]   (за замовчуванням 30)
import "dotenv/config";
import { prisma } from "../src/db.ts";
import { pollReactions } from "../src/reactions.ts";

const days = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - days * 86400000);

await pollReactions(); // спершу підтягнути свіжі реакції

const sent = await prisma.sentMessage.findMany({ where: { createdAt: { gte: since } } });
const liked = sent.filter((m) => m.reaction && m.reaction !== "👎");

function table(by: (m: (typeof sent)[number]) => string | null, title: string) {
  const rows = new Map<string, { sent: number; liked: number }>();
  for (const m of sent) {
    const k = by(m) ?? "—";
    const r = rows.get(k) ?? { sent: 0, liked: 0 };
    r.sent++;
    if (m.reaction && m.reaction !== "👎") r.liked++;
    rows.set(k, r);
  }
  console.log(`\n${title}`);
  console.table(
    [...rows.entries()]
      .map(([k, r]) => ({ [title]: k, надіслано: r.sent, "👍": r.liked, "%": r.sent ? Math.round((r.liked / r.sent) * 100) : 0 }))
      .sort((a, b) => b["👍"] - a["👍"] || b.надіслано - a.надіслано),
  );
}

console.log(`За ${days} днів: надіслано ${sent.length}, з реакцією ${liked.length}`);
table((m) => m.format, "формат");
table((m) => m.account, "акаунт");
table((m) => m.source, "джерело");
table((m) => (m.score != null ? String(m.score) : null), "оцінка");

// Як GPT відсіював статті (з таблиці Article)
const decisions = await prisma.article.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true });
console.log("\nРішення щодо статей:", Object.fromEntries(decisions.map((d) => [d.status, d._count])));

if (liked.length) {
  console.log("\nОстанні пости з реакцією:");
  for (const m of liked.slice(-15)) console.log(`${m.reaction} [${m.format}] ${m.source ?? ""}: ${m.title}`);
}

await prisma.$disconnect();
