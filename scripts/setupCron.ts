// Налаштовує автозапуск бота з Supabase: pg_cron за розкладом викликає GitHub API
// "запусти workflow" (те саме, що кнопка Run workflow) з потрібним режимом. Розклад GitHub Actions
// ненадійний — для нового репозиторію він пропускав запуски годинами.
//
// Запуск: npm run setup-cron
// Потрібно в .env: DATABASE_URL, GITHUB_DISPATCH_TOKEN (fine-grained, Actions: Read and write).
// Коли токен закінчиться (створено 2026-10-10, діє до 2027-10-10) — вписати новий у .env і запустити знову.
import "dotenv/config";
import pg from "pg";

// Час у UTC. Київ = UTC+3 влітку, UTC+2 взимку (тоді все зсувається на годину раніше).
// Періодичні формати — о :47, щоб не стартувати одночасно з новинами (:17).
const JOBS: { name: string; schedule: string; mode: string }[] = [
  { name: "content-radar", schedule: "17 5-19/2 * * *", mode: "news" }, // щодня 8:17–22:17, кожні 2 год
  // Зупинено 2026-10-13 разом з каналами «Креатори UA» і «AI для творців»: tools (пн), story (ср), evergreen (вт, чт)
  { name: "content-radar-saves", schedule: "47 11 * * 5", mode: "saves" }, // п'ятниця 14:47 — «💰 Можливості тижня»
];

const SECRET_NAME = "github_dispatch_token";
const DISPATCH_URL = "https://api.github.com/repos/mr-vasyl/content-radar/actions/workflows/radar.yml/dispatches";

const token = process.env.GITHUB_DISPATCH_TOKEN;
if (!token) throw new Error("Немає GITHUB_DISPATCH_TOKEN у .env");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("create extension if not exists pg_cron");
  await client.query("create extension if not exists pg_net");

  // Токен — у Supabase Vault (зашифровано), а не відкритим текстом у тексті cron-задачі
  const existing = await client.query("select id from vault.secrets where name = $1", [SECRET_NAME]);
  if (existing.rows[0]) {
    await client.query("select vault.update_secret($1, $2)", [existing.rows[0].id, token]);
    console.log("Токен у Vault оновлено");
  } else {
    await client.query("select vault.create_secret($1, $2)", [token, SECRET_NAME]);
    console.log("Токен збережено у Vault");
  }

  for (const job of JOBS) {
    const body = JSON.stringify({ ref: "main", inputs: { mode: job.mode } });
    const command = `
      select net.http_post(
        url := '${DISPATCH_URL}',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${SECRET_NAME}'),
          'Accept', 'application/vnd.github+json',
          'X-GitHub-Api-Version', '2022-11-28',
          'User-Agent', 'content-radar-cron'
        ),
        body := '${body}'::jsonb
      )`;
    // cron.schedule з тим самим ім'ям оновлює існуючу задачу
    await client.query("select cron.schedule($1, $2, $3)", [job.name, job.schedule, command]);
  }

  // Задачі, яких більше немає в JOBS, — прибираємо
  const { rows } = await client.query("select jobname from cron.job where jobname like 'content-radar%'");
  for (const { jobname } of rows) {
    if (!JOBS.some((j) => j.name === jobname)) {
      await client.query("select cron.unschedule($1)", [jobname]);
      console.log("Видалено задачу:", jobname);
    }
  }

  const jobs = await client.query("select jobname, schedule, active from cron.job where jobname like 'content-radar%' order by jobname");
  console.table(jobs.rows);
} finally {
  await client.end();
}
