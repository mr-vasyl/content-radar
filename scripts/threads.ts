// 🧵 Керування автопублікацією в Threads (сама публікація — у базі, див. scripts/setupThreads.ts).
//   npm run threads -- account <назва> <токен>      додати/оновити акаунт (токен з Meta → User Token Generator)
//   npm run threads -- import <назва> <файл.txt>    додати пости в чергу (розділювач — рядок «---»)
//   npm run threads -- test <назва>                 опублікувати перший пост черги за хвилину
//   npm run threads -- status                       що опубліковано, що в черзі, помилки
//   npm run threads -- pause|resume <назва>
// Розклад (власник 2026-10-29): 5 на день, 2 між 9:00 і 18:00, 3 між 18:00 і 24:00 за Києвом, час випадковий.
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const LIMIT = 480; // ліміт Threads — 500 символів, лишаємо запас
const SLOTS: [number, number, number][] = [
  // [скільки, з години, до години]
  [2, 9, 18],
  [3, 18, 24],
];
const MIN_GAP = 75; // хв між постами одного акаунта
const OTHER_GAP = 20; // хв між постами різних акаунтів

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

// Довгий пост → частини ≤ LIMIT по абзацах (довгий абзац — по реченнях)
export function splitPost(text: string): string[] {
  const pieces: string[] = [];
  for (const para of text.trim().split(/\n\s*\n/)) {
    if (para.length <= LIMIT) pieces.push(para.trim());
    else {
      let cur = "";
      for (const s of para.match(/[^.!?…]+[.!?…]+["»)]*\s*|[^.!?…]+$/g) ?? [para]) {
        if (cur && (cur + s).length > LIMIT) {
          pieces.push(cur.trim());
          cur = "";
        }
        cur += s;
      }
      if (cur.trim()) pieces.push(cur.trim());
    }
  }
  const parts: string[] = [];
  for (const p of pieces) {
    const last = parts.at(-1);
    if (last !== undefined && last.length + 2 + p.length <= LIMIT) parts[parts.length - 1] = `${last}\n\n${p}`;
    else parts.push(p.length > LIMIT ? p.slice(0, LIMIT) : p);
  }
  return parts;
}

// Київський час → UTC
function kyiv(y: number, m: number, d: number, minutes: number): Date {
  const guess = new Date(Date.UTC(y, m, d, 0, minutes));
  const local = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Kyiv" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime()));
}
function kyivDate(t: Date): [number, number, number] {
  const [y, m, d] = t.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" }).split("-").map(Number);
  return [y!, m! - 1, d!];
}
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a));

// Випадкові часи на один день, з проміжками між постами та від постів іншого акаунта
function dayTimes(y: number, m: number, d: number, busy: number[]): Date[] {
  for (let attempt = 0; attempt < 500; attempt++) {
    const mins: number[] = [];
    for (const [n, from, to] of SLOTS) for (let i = 0; i < n; i++) mins.push(rnd(from * 60, to * 60 - 5));
    mins.sort((a, b) => a - b);
    const times = mins.map((x) => kyiv(y, m, d, x));
    const okGap = mins.every((x, i) => i === 0 || x - mins[i - 1]! >= MIN_GAP);
    const okOther = times.every((t) => busy.every((b) => Math.abs(t.getTime() - b) >= OTHER_GAP * 60000));
    if (okGap && okOther) return times;
  }
  throw new Error("не вдалось підібрати час");
}

async function account(name: string, token: string) {
  const r = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
  const me = (await r.json()) as { id?: string; username?: string; error?: { message: string } };
  if (!me.id) throw new Error(`Threads не прийняв токен: ${me.error?.message ?? r.status}`);
  await db.query(
    `insert into threads.accounts (name, user_id, username, token, token_expires) values ($1, $2, $3, $4, now() + interval '60 days')
     on conflict (name) do update set user_id = $2, username = $3, token = $4, token_expires = now() + interval '60 days', updated = now()`,
    [name, me.id, me.username, token],
  );
  console.log(`✓ акаунт ${name} = @${me.username} (${me.id})`);
}

async function importPosts(name: string, file: string) {
  const raw = readFileSync(file, "utf8").replace(/^﻿/, "").replace(/\r/g, "");
  const posts = raw.split(/\n\s*-{3,}\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (!(await db.query("select 1 from threads.accounts where name = $1", [name])).rowCount) throw new Error(`немає акаунта ${name}`);

  // з якого дня планувати: після останнього запланованого поста цього акаунта, але не раніше завтра
  const last = (await db.query("select max(scheduled_at) m from threads.posts where account = $1 and part = 0", [name])).rows[0].m as Date | null;
  const tomorrow = new Date(Date.now() + 86400000);
  const dayAfterLast = last ? new Date(last.getTime() + 86400000) : tomorrow;
  let [y, m, d] = kyivDate(dayAfterLast > tomorrow ? dayAfterLast : tomorrow);

  const busyRows = (await db.query("select scheduled_at from threads.posts where account <> $1 and part = 0 and scheduled_at > now()", [name])).rows;
  const busy = busyRows.map((r) => (r.scheduled_at as Date).getTime());
  const perDay = SLOTS.reduce((s, [n]) => s + n, 0);
  let chains = 0;
  for (let i = 0; i < posts.length; i += perDay) {
    const times = dayTimes(y, m, d, busy);
    for (let j = 0; j < perDay && i + j < posts.length; j++) {
      const parts = splitPost(posts[i + j]!);
      if (parts.length > 1) chains++;
      const root = (await db.query(
        "insert into threads.posts (account, part, text, scheduled_at, status) values ($1, 0, $2, $3, 'queued') returning id",
        [name, parts[0], times[j]],
      )).rows[0].id;
      for (let k = 1; k < parts.length; k++)
        await db.query("insert into threads.posts (account, root_id, part, text, status) values ($1, $2, $3, $4, 'waiting')", [name, root, k, parts[k]]);
    }
    const next = new Date(Date.UTC(y, m, d + 1));
    [y, m, d] = [next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate()];
  }
  const days = Math.ceil(posts.length / perDay);
  console.log(`✓ ${name}: ${posts.length} постів (з них ланцюжків: ${chains}) на ${days} днів`);
}

// План власника: «30.10» / «2 листопада» → «Акаунт 1 …» / «Акаунт 2 …» → «Допис N» (+ заголовок) → рядки-абзаци.
// Кожен рядок — абзац (у Threads — з порожнім рядком між ними); пункти «— …» лишаються списком.
const MONTHS = ["січня", "лютого", "березня", "квітня", "травня", "червня", "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
type PlanPost = { day: string; account: string; text: string };
export function parsePlan(raw: string, year = new Date().getFullYear()): PlanPost[] {
  const out: PlanPost[] = [];
  let day = "", account = "", lines: string[] | null = null;
  const flush = () => {
    if (lines?.length && day && account) {
      let text = "";
      for (const l of lines) {
        const prev = text.split("\n").at(-1) ?? "";
        text += !text ? l : /^[—–-]\s/.test(l) && (/^[—–-]\s/.test(prev) || prev.endsWith(":")) ? `\n${l}` : `\n\n${l}`;
      }
      out.push({ day, account, text });
    }
    lines = null;
  };
  for (const rawLine of raw.replace(/\r/g, "").split("\n")) {
    const l = rawLine.trim();
    if (!l || /^_{5,}$/.test(l)) continue;
    let m;
    if ((m = l.match(/^(\d{1,2})\.(\d{1,2})$/)) || (m = l.match(new RegExp(`^(\\d{1,2})\\s+(${MONTHS.join("|")})$`, "i")))) {
      flush();
      const mon = /^\d+$/.test(m[2]!) ? Number(m[2]) : MONTHS.indexOf(m[2]!.toLowerCase()) + 1;
      day = `${year}-${String(mon).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    } else if ((m = l.match(/^Акаунт\s+(\d)/))) {
      flush();
      account = m[1]!;
    } else if ((m = l.match(/^Допис\s+\d+\.?\s*(.*)$/))) {
      flush();
      lines = m[1] ? [m[1]] : [];
    } else if (lines) lines.push(l);
  }
  flush();
  return out;
}

async function importPlan(file: string, dry: boolean) {
  const posts = parsePlan(readFileSync(file, "utf8").replace(/^﻿/, ""), 2026);
  const groups = new Map<string, PlanPost[]>();
  for (const p of posts) groups.set(`${p.day}|${p.account}`, [...(groups.get(`${p.day}|${p.account}`) ?? []), p]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
  let added = 0, chains = 0;
  for (const [key, list] of groups) {
    const [day, acc] = key.split("|") as [string, string];
    const [y, m, d] = day.split("-").map(Number) as [number, number, number];
    console.log(`${day} акаунт ${acc}: ${list.length} постів, довжини ${list.map((p) => p.text.length).join("/")}`);
    if (dry) continue;
    if (day <= today) { console.log("   ↳ пропущено: дата вже настала"); continue; }
    const fresh = [];
    for (const p of list)
      if (!(await db.query("select 1 from threads.posts where account = $1 and part = 0 and text = $2", [acc, splitPost(p.text)[0]])).rowCount) fresh.push(p);
    if (!fresh.length) continue;
    const busy = (await db.query("select scheduled_at from threads.posts where account <> $1 and part = 0 and scheduled_at > now()", [acc])).rows.map((r) => (r.scheduled_at as Date).getTime());
    const times = dayTimes(y, m - 1, d, busy); // пости дня йдуть у порядку плану
    for (const [j, p] of fresh.entries()) {
      const parts = splitPost(p.text);
      if (parts.length > 1) chains++;
      const root = (await db.query("insert into threads.posts (account, part, text, scheduled_at) values ($1, 0, $2, $3) returning id", [acc, parts[0], times[j]])).rows[0].id;
      for (let k = 1; k < parts.length; k++)
        await db.query("insert into threads.posts (account, root_id, part, text, status) values ($1, $2, $3, $4, 'waiting')", [acc, root, k, parts[k]]);
      added++;
    }
  }
  console.log(`${dry ? "Перевірка" : "✓ додано"}: ${dry ? posts.length : added} постів${dry ? "" : `, з них ланцюжків: ${chains}`}`);
}

async function status() {
  console.table((await db.query(`
    select a.name, a.username, a.paused, to_char(a.token_expires at time zone 'Europe/Kyiv', 'DD.MM.YYYY') token_until,
      count(*) filter (where p.part = 0 and p.status = 'published') published,
      count(*) filter (where p.part = 0 and p.status in ('queued','waiting')) queued,
      count(*) filter (where p.status = 'failed') failed,
      to_char(min(p.scheduled_at) filter (where p.status = 'queued') at time zone 'Europe/Kyiv', 'DD.MM HH24:MI') next,
      to_char(max(p.scheduled_at) filter (where p.part = 0) at time zone 'Europe/Kyiv', 'DD.MM') last_day
    from threads.accounts a left join threads.posts p on p.account = a.name group by a.name order by a.name`)).rows);
  const errs = (await db.query("select account, part, left(text, 50) text, error from threads.posts where error is not null order by updated desc limit 5")).rows;
  if (errs.length) console.table(errs);
}

const [cmd, a1, a2] = process.argv.slice(2);
await db.connect();
try {
  if (cmd === "account" && a1 && a2) await account(a1, a2);
  // токени з .env (THREADS_TOKEN_1=…, THREADS_TOKEN_2=…) — щоб не пересилати їх у чат; назва акаунта = суфікс
  else if (cmd === "accounts") {
    const found = Object.entries(process.env).filter(([k, v]) => k.startsWith("THREADS_TOKEN_") && v);
    if (!found.length) console.log("У .env немає рядків THREADS_TOKEN_1=… / THREADS_TOKEN_2=…");
    for (const [k, v] of found) await account(k.slice("THREADS_TOKEN_".length).toLowerCase(), v!.trim());
  }
  else if (cmd === "import" && a1 && a2) await importPosts(a1, a2);
  else if (cmd === "test" && a1) {
    const r = await db.query(
      `update threads.posts set scheduled_at = now() where id = (select id from threads.posts where account = $1 and part = 0 and status = 'queued' order by scheduled_at limit 1) returning left(text, 60) t`,
      [a1],
    );
    console.log(r.rowCount ? `✓ за ~1–2 хв опублікується: «${r.rows[0].t}…»` : "черга порожня");
  } else if ((cmd === "pause" || cmd === "resume") && a1) {
    await db.query("update threads.accounts set paused = $2 where name = $1", [a1, cmd === "pause"]);
    console.log(`✓ ${a1}: ${cmd === "pause" ? "пауза" : "працює"}`);
  } else if (cmd === "plan" && a1) await importPlan(a1, a2 === "dry");
  else if (cmd === "status") await status();
  else console.log("npm run threads -- account <назва> <токен> | import <назва> <файл> | test <назва> | status | pause|resume <назва>");
} finally {
  await db.end();
}
