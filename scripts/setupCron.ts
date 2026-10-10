// Налаштовує автозапуск бота з Supabase: pg_cron за розкладом викликає GitHub API
// "запусти workflow" (те саме, що кнопка Run workflow). Розклад GitHub Actions ненадійний —
// для нового репозиторію він пропускав запуски годинами.
//
// Запуск: npm run setup-cron
// Потрібно в .env: DATABASE_URL, GITHUB_DISPATCH_TOKEN (fine-grained, Actions: Read and write).
// Коли токен закінчиться (створено 2026-10-10, діє до 2027-10-10) — вписати новий у .env і запустити знову.
import "dotenv/config";
import pg from "pg";

const SCHEDULE = "17 5-19/2 * * *"; // UTC: 8:17–22:17 за Києвом влітку, 7:17–21:17 взимку
const JOB_NAME = "content-radar";
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

  const command = `
    select net.http_post(
      url := '${DISPATCH_URL}',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${SECRET_NAME}'),
        'Accept', 'application/vnd.github+json',
        'X-GitHub-Api-Version', '2022-11-28',
        'User-Agent', 'content-radar-cron'
      ),
      body := '{"ref":"main"}'::jsonb
    )`;

  // cron.schedule з тим самим ім'ям оновлює існуючу задачу
  await client.query("select cron.schedule($1, $2, $3)", [JOB_NAME, SCHEDULE, command]);
  const job = await client.query("select jobid, schedule, active from cron.job where jobname = $1", [JOB_NAME]);
  console.log("Задача pg_cron:", job.rows[0]);
} finally {
  await client.end();
}
