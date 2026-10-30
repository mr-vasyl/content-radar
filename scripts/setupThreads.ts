// 🧵 Автопублікація в Threads прямо з бази Supabase (власник 2026-10-29: 2 акаунти × 150 постів, рандомний час).
// Усе живе в Postgres: pg_cron щохвилини викликає threads.tick(), який через pg_net ходить у Threads API.
// Ні GitHub-хвилин, ні Edge Functions. Запуск: npm run setup-threads (повторний запуск безпечний — лише оновлює).
//
// Публікація в Threads — 2 кроки: створити контейнер (POST /{user}/threads) → ≥30 с → опублікувати
// (POST /{user}/threads_publish). pg_net асинхронний, тож це машина станів:
//   queued → creating → created → publishing → published        (помилка → знову queued через 15 хв, після 3 — failed)
// Довгий пост (>500 символів) — ланцюжок: частина 0 (queued), решта waiting; коли частина опублікована, наступна стає
// queued з reply_to_id = id попередньої.
import "dotenv/config";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const SQL = String.raw`
create schema if not exists threads;

create table if not exists threads.accounts (
  name text primary key,              -- наша назва акаунта (напр. "skynovix", "second")
  user_id text not null,              -- Threads user id
  username text,
  token text not null,                -- long-lived token (60 днів)
  token_expires timestamptz,
  refresh_request bigint,             -- id запиту pg_net на оновлення токена
  paused boolean not null default false,
  updated timestamptz not null default now()
);

create table if not exists threads.posts (
  id bigserial primary key,
  account text not null references threads.accounts(name),
  root_id bigint references threads.posts(id),   -- для частин ланцюжка: id першої частини
  part int not null default 0,
  text text not null,
  scheduled_at timestamptz,
  status text not null default 'queued',          -- queued | waiting | creating | created | publishing | published | failed
  request_id bigint,
  container_id text,
  media_id text,
  reply_to text,
  attempts int not null default 0,
  error text,
  published_at timestamptz,
  updated timestamptz not null default now(),
  created timestamptz not null default now()
);
create index if not exists posts_due on threads.posts (status, scheduled_at);
alter table threads.accounts add column if not exists blocked_since timestamptz; -- Meta тимчасово закрила доступ

-- Відповідь не завжди JSON (HTML-помилка, таймаут) — не падаємо
create or replace function threads.try_json(t text) returns jsonb language plpgsql immutable as $$
begin return t::jsonb; exception when others then return null; end $$;

-- Повідомлення власнику в бот SkyNovix (токен і chat id — у Vault)
create or replace function threads.notify(msg text) returns void language plpgsql security definer as $$
declare tok text; chat text;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'threads_notify_bot_token';
  select decrypted_secret into chat from vault.decrypted_secrets where name = 'threads_notify_chat_id';
  if tok is null or chat is null then return; end if;
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || tok || '/sendMessage',
    body := jsonb_build_object('chat_id', chat, 'text', msg, 'disable_notification', true),
    params := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 15000);
end $$;

create or replace function threads.tick() returns void language plpgsql security definer as $$
declare r record; resp record; rid bigint; cid text; p jsonb;
begin
  -- 1) відповіді Threads на надіслані запити
  for r in select * from threads.posts where status in ('creating', 'publishing') and request_id is not null loop
    select * into resp from net._http_response where id = r.request_id;
    if not found then
      if r.updated < now() - interval '10 minutes' then
        update threads.posts set status = 'queued', request_id = null, attempts = attempts + 1,
          error = 'немає відповіді від Threads', scheduled_at = now() + interval '10 minutes', updated = now() where id = r.id;
      end if;
      continue;
    end if;
    cid := case when resp.status_code = 200 then threads.try_json(resp.content) ->> 'id' end;
    if cid is not null then
      if (select blocked_since from threads.accounts where name = r.account) is not null then
        update threads.accounts set blocked_since = null where name = r.account;
        perform threads.notify('✅ Threads (' || r.account || '): доступ повернувся, публікую далі.');
      end if;
      if r.status = 'creating' then
        update threads.posts set status = 'created', container_id = cid, request_id = null, updated = now() where id = r.id;
      else
        update threads.posts set status = 'published', media_id = cid, request_id = null, published_at = now(), error = null, updated = now() where id = r.id;
        -- наступна частина ланцюжка — відповіддю на цю
        update threads.posts set status = 'queued', reply_to = cid, scheduled_at = now() + interval '20 seconds', updated = now()
          where root_id = coalesce(r.root_id, r.id) and part = r.part + 1 and status = 'waiting';
      end if;
    elsif resp.content like '%OAuthException%' then
      -- Meta тимчасово закрила доступ (2026-10-30 «API access blocked» на ~1 год): це не вина поста —
      -- спроби не рахуємо, чекаємо 20 хв; власнику — одне попередження, доки доступ не повернеться
      -- creating → знову queued через 20 хв; publishing → знову created (той самий контейнер), крок 2 чекає, доки updated мине
      update threads.posts set status = case when r.status = 'publishing' then 'created' else 'queued' end,
        request_id = null, error = left(resp.content, 500),
        scheduled_at = case when r.status = 'publishing' then scheduled_at else now() + interval '20 minutes' end,
        updated = case when r.status = 'publishing' then now() + interval '20 minutes' else now() end
      where id = r.id;
      if (select blocked_since from threads.accounts where name = r.account) is null then
        update threads.accounts set blocked_since = now() where name = r.account;
        perform threads.notify('⚠️ Threads (' || r.account || '): Meta тимчасово не пускає (' || left(threads.try_json(resp.content) -> 'error' ->> 'message', 100)
          || '). Пости чекають, пробую кожні 20 хв. Прийде ✅, коли запрацює.');
      end if;
    else
      -- невдала публікація → повторюємо публікацію ТОГО Ж контейнера (контейнер публікується лише раз — без дублів)
      update threads.posts set
        status = case when attempts + 1 >= 3 then 'failed' when r.status = 'publishing' then 'created' else 'queued' end,
        attempts = attempts + 1, request_id = null,
        error = left(coalesce(resp.content, resp.error_msg, 'помилка'), 500),
        scheduled_at = now() + interval '15 minutes', updated = now()
      where id = r.id;
      if r.attempts + 1 >= 3 then
        perform threads.notify('⚠️ Threads (' || r.account || '): пост не опублікувався після 3 спроб: «' || left(r.text, 80) || '…» — ' || left(coalesce(resp.content, resp.error_msg, ''), 200));
      end if;
    end if;
  end loop;

  -- 2) контейнери, створені ≥30 с тому, — публікуємо
  for r in select ps.*, a.user_id, a.token from threads.posts ps join threads.accounts a on a.name = ps.account
           where ps.status = 'created' and ps.updated < now() - interval '30 seconds' loop
    rid := net.http_post(
      url := 'https://graph.threads.net/v1.0/' || r.user_id || '/threads_publish',
      body := '{}'::jsonb,
      params := jsonb_build_object('creation_id', r.container_id, 'access_token', r.token),
      headers := '{}'::jsonb, timeout_milliseconds := 30000);
    update threads.posts set status = 'publishing', request_id = rid, updated = now() where id = r.id;
  end loop;

  -- 3) пости, час яких настав, — створюємо контейнер (по одному на акаунт за хвилину)
  for r in select distinct on (ps.account) ps.*, a.user_id, a.token from threads.posts ps
           join threads.accounts a on a.name = ps.account
           where ps.status = 'queued' and ps.scheduled_at <= now() and not a.paused
             -- після паузи/блоку не публікуємо пачкою: новий пост — не раніше ніж через 60 хв після попереднього
             and (ps.part > 0 or not exists (select 1 from threads.posts x where x.account = ps.account and x.part = 0
                  and (x.published_at > now() - interval '60 minutes' or x.status in ('creating', 'created', 'publishing'))))
           order by ps.account, ps.scheduled_at loop
    p := jsonb_build_object('media_type', 'TEXT', 'text', r.text, 'access_token', r.token);
    if r.reply_to is not null then p := p || jsonb_build_object('reply_to_id', r.reply_to); end if;
    rid := net.http_post(
      url := 'https://graph.threads.net/v1.0/' || r.user_id || '/threads',
      body := '{}'::jsonb, params := p, headers := '{}'::jsonb, timeout_milliseconds := 30000);
    update threads.posts set status = 'creating', request_id = rid, updated = now() where id = r.id;
  end loop;

  -- 4) оновлення токенів: відповідь на запит refresh
  for r in select * from threads.accounts where refresh_request is not null loop
    select * into resp from net._http_response where id = r.refresh_request;
    if not found then continue; end if;
    if resp.status_code = 200 and threads.try_json(resp.content) ? 'access_token' then
      update threads.accounts set token = threads.try_json(resp.content) ->> 'access_token',
        token_expires = now() + make_interval(secs => coalesce((threads.try_json(resp.content) ->> 'expires_in')::int, 5184000)),
        refresh_request = null, updated = now() where name = r.name;
    else
      update threads.accounts set refresh_request = null, updated = now() where name = r.name;
      perform threads.notify('⚠️ Threads (' || r.name || '): токен не оновився — ' || left(coalesce(resp.content, resp.error_msg, ''), 200));
    end if;
  end loop;
end $$;

-- Раз на тиждень: оновити токени, яким лишилось < 30 днів (Threads дозволяє оновлювати токен, старший за добу)
create or replace function threads.refresh_tokens() returns void language plpgsql security definer as $$
declare r record;
begin
  for r in select * from threads.accounts where token_expires is null or token_expires < now() + interval '30 days' loop
    update threads.accounts set refresh_request = net.http_get(
      url := 'https://graph.threads.net/refresh_access_token',
      params := jsonb_build_object('grant_type', 'th_refresh_token', 'access_token', r.token),
      headers := '{}'::jsonb, timeout_milliseconds := 30000), updated = now() where name = r.name;
  end loop;
end $$;

-- Щоденний звіт у бот
create or replace function threads.report() returns void language plpgsql security definer as $$
declare msg text := '🧵 Threads за сьогодні:'; r record;
begin
  for r in select a.name, a.username,
      count(*) filter (where p.status = 'published' and p.part = 0 and p.published_at > now() - interval '24 hours') as today,
      count(*) filter (where p.status in ('queued', 'waiting') and p.part = 0) as left_,
      count(*) filter (where p.status = 'failed') as failed,
      max(p.scheduled_at) filter (where p.part = 0) as last_at
    from threads.accounts a left join threads.posts p on p.account = a.name group by a.name, a.username loop
    msg := msg || E'\n• @' || coalesce(r.username, r.name) || ': опубліковано ' || r.today || ', у черзі ' || r.left_
      || coalesce(', помилок ' || nullif(r.failed, 0), '')
      || coalesce(', пости закінчаться ' || to_char(r.last_at at time zone 'Europe/Kyiv', 'DD.MM'), '');
  end loop;
  perform threads.notify(msg);
end $$;
`;

try {
  await client.query(SQL);
  // Куди слати звіти й попередження: бот SkyNovix
  for (const [name, value] of [
    ["threads_notify_bot_token", process.env.TELEGRAM_BOT_TOKEN_SKYNOVIX ?? process.env.TELEGRAM_BOT_TOKEN],
    ["threads_notify_chat_id", process.env.TELEGRAM_CHAT_ID],
  ] as const) {
    if (!value) continue;
    const ex = await client.query("select id from vault.secrets where name = $1", [name]);
    if (ex.rows[0]) await client.query("select vault.update_secret($1, $2)", [ex.rows[0].id, value]);
    else await client.query("select vault.create_secret($1, $2)", [value, name]);
  }
  const jobs: [string, string, string][] = [
    ["threads-tick", "* * * * *", "select threads.tick()"],
    ["threads-refresh", "15 3 * * 1", "select threads.refresh_tokens()"], // пн 5:15 Київ
    ["threads-report", "50 21 * * *", "select threads.report()"], // 23:50 Київ (зима)
  ];
  for (const [name, schedule, command] of jobs) await client.query("select cron.schedule($1, $2, $3)", [name, schedule, command]);
  console.table((await client.query("select jobname, schedule, active from cron.job where jobname like 'threads-%' order by jobname")).rows);
  console.log("Готово: схема threads, функції tick/refresh_tokens/report, задачі pg_cron.");
} finally {
  await client.end();
}
