// 🖼 Картинки до постів у Telegram (власник 2026-11-04: «класична картинка до поста, без наворотів»).
// Спершу — справжня картинка події зі сторінки організатора (og:image: постер, роботи, фото); якщо там логотип,
// загальний банер агрегатора чи нічого — малюємо брендову картку каналу: вигода великим текстом, умова, дедлайн.
// ШІ-генерацію свідомо не робимо: аудиторія — художники й фотографи, для багатьох це болюча тема.
import { readFileSync } from "node:fs";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { extractArticle } from "./extractText.ts";
import { askJson } from "./gpt.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const font = (sub: string, w: number) => readFileSync(new URL(`../assets/fonts/montserrat-${sub}-${w}.woff`, import.meta.url));
// латиниця й кирилиця — окремі файли під РІЗНИМИ назвами: satori шукає відсутні літери в наступному шрифті зі списку
const FONTS = [500, 800].flatMap((w) => ["latin", "cyrillic"].map((sub) => ({ name: sub === "latin" ? "MontLat" : "MontCyr", data: font(sub, w), weight: w as 500 | 800, style: "normal" as const })));

// ─────────── брендова картка ───────────
export interface Card {
  channel: string; // «АВТОРСЬКИЙ ПРОСТІР»
  label: string; // «ФОТО · КОНКУРС»
  headline: string; // вигода: «€2 000 за фотосерію»
  sub?: string; // умова: «Участь безкоштовна»
  footer?: string; // «До 1 січня 2027»
  handle: string; // «@avtorskyi_prostir»
  color: string; // фон
}

type El = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown): El => ({ type, props: { style, children } });

export async function renderCard(c: Card): Promise<Buffer> {
  // дата вже є в умові («Подача до 30 листопада») — нижній рядок не дублюємо
  if (c.sub && /до \d/i.test(c.sub)) c = { ...c, footer: "" };
  const size = c.headline.length > 60 ? 62 : c.headline.length > 34 ? 74 : 88;
  const tree = el("div", {
    width: "100%", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between",
    padding: "64px 80px", backgroundColor: c.color, color: "#FFFFFF", fontFamily: "MontCyr, MontLat",
  }, [
    el("div", { display: "flex", justifyContent: "space-between", fontSize: 26, fontWeight: 500, letterSpacing: 2, opacity: 0.85 }, [
      el("div", { display: "flex" }, c.channel.toUpperCase()),
      el("div", { display: "flex", padding: "6px 18px", border: "2px solid rgba(255,255,255,0.6)", borderRadius: 999 }, c.label.toUpperCase()),
    ]),
    el("div", { display: "flex", flexDirection: "column" }, [
      el("div", { display: "flex", fontSize: size, fontWeight: 800, lineHeight: 1.12 }, c.headline),
      ...(c.sub ? [el("div", { display: "flex", marginTop: 28, fontSize: 38, fontWeight: 500, opacity: 0.9 }, c.sub)] : []),
    ]),
    el("div", { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 30, fontWeight: 500 }, [
      el("div", { display: "flex", fontWeight: 800 }, c.footer ?? ""),
      el("div", { display: "flex", opacity: 0.8 }, c.handle),
    ]),
  ]);
  const svg = await satori(tree as never, { width: 1280, height: 720, fonts: FONTS });
  return Buffer.from(new Resvg(svg).render().asPng());
}

// Перший рядок тизера («€2 000 за фотосерію. Участь безкоштовна.») → велика вигода + умова
export function splitBenefit(line: string): { headline: string; sub?: string } {
  const clean = line.replace(/\*\*/g, "").trim();
  const m = clean.match(/^(.+?[.!])\s+(.+)$/);
  const [h, s] = m ? [m[1]!, m[2]!] : [clean, undefined];
  return { headline: h.replace(/\.$/, "").slice(0, 90), sub: s?.replace(/\.$/, "").slice(0, 70) };
}

const MONTHS = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
export const deadlineText = (d: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d) ? `До ${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : "";

// ─────────── справжня картинка зі сторінки ───────────
const GENERIC_NAME = /logo|favicon|icon|placeholder|default|avatar|sprite|og-image|og_image|share-image|social-share|banner-|\/layout\//i;
const pageImage = new Map<string, string | null>();
async function ogOf(url: string): Promise<string | null> {
  if (pageImage.has(url)) return pageImage.get(url)!;
  const img = (await extractArticle(url).catch(() => null))?.image ?? null;
  pageImage.set(url, img);
  return img;
}

// Розмір PNG/JPEG з заголовка файлу (без сторонніх бібліотек)
function dims(b: Buffer): { w: number; h: number } | null {
  if (b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length - 9) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null; // webp, gif, svg — не беремо
}

// pages — сторінка організатора, потім саме оголошення; listing — сторінка-список джерела (її картинка = «загальна»)
export async function pickRealImage(pages: string[], listing?: string): Promise<Buffer | null> {
  for (const page of pages.filter(Boolean)) {
    try {
      const img = await ogOf(page);
      if (!img || GENERIC_NAME.test(new URL(img).pathname)) continue;
      const origin = new URL(page).origin + "/";
      const generic = [await ogOf(origin), listing ? await ogOf(listing) : null].filter(Boolean);
      if (generic.includes(img)) continue; // та сама картинка, що на головній чи в списку — це банер сайту
      const res = await fetch(img, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const d = dims(buf);
      if (!d || d.w < 600 || d.h < 300 || d.w / d.h > 2.4 || d.w / d.h < 0.6 || buf.length < 25000 || buf.length > 9_000_000) continue;
      return buf;
    } catch {
      /* наступна сторінка */
    }
  }
  return null;
}

// ─────────── кольори карток ───────────
export const DISC_COLOR: Record<string, string> = {
  literature: "#3D5A40", music: "#4B2E83", art: "#A0472F", photo: "#1F3B4D", film: "#2B2D42", design: "#B0700E", mixed: "#22577A",
};
export const DISC_LABEL: Record<string, string> = {
  literature: "Література", music: "Музика", art: "Мистецтво", photo: "Фото", film: "Кіно", design: "Дизайн", mixed: "Для всіх",
};
export const STREAM_COLOR: Record<string, string> = {
  "Гранти": "#1E5631", "Конкурси й премії": "#7A1F3D", "Резиденції": "#2F4858", "Стипендії": "#3B3B98", "Навчання": "#6B4226", "Події": "#0B5563",
};

// ─────────── усе разом ───────────
export interface Illustration { image: Buffer; kind: "real" | "card" }

// Справжня картинка зі сторінок (організатор, оголошення), інакше — брендова картка
export async function illustrate(pages: string[], listing: string | undefined, card: Card): Promise<Illustration | null> {
  try {
    const real = pages.length ? await pickRealImage(pages, listing) : null;
    if (real) return { image: real, kind: "real" };
    return { image: await renderCard(card), kind: "card" };
  } catch (err) {
    console.error("Картинка не вийшла:", (err as Error).message);
    return null;
  }
}

// Підпис до фото в Telegram — до 1024 символів. Довгий пост скорочуємо, зберігаючи всі факти й посилання.
export async function shortenPost(post: string, max: number): Promise<string> {
  const r = await askJson<{ post: string }>(
    `Скороти пост Telegram-каналу до ${max} символів разом із пробілами. Збережи: жирний заголовок, усі факти (суми, хто може
подати, дедлайн, умови), пункти через «— » і останній рядок із посиланням «🔗 [...](...)» без змін. Прибери повтори,
вступні фрази й зайві пояснення. Нічого не додавай. Поверни лише текст поста.`,
    post,
    "shorten_post",
    { type: "object", additionalProperties: false, required: ["post"], properties: { post: { type: "string" } } },
  );
  return r.post.trim();
}
