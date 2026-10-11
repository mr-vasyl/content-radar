import { sources } from "../sources.ts";
import { fetchArticles, type Article } from "../fetchArticles.ts";
import { filterNew, makeDuplicateChecker, recentSentTitles, record } from "../dedup.ts";
import { ruleRejectReason } from "../ruleFilter.ts";
import { extractArticle } from "../extractText.ts";
import { analyze, minScoreFor, MIN_SCORE_BY_ACCOUNT } from "../summarize.ts";
import { sendHook, sendPost } from "../sendToTelegram.ts";
import { factCheck, factNote } from "../factCheck.ts";
import { withToolLink } from "../digest.ts";

// Не більше стількох статей на GPT за один запуск — щоб нове джерело не завалило бота
// всім своїм архівом. Ті, що не влізли, нікуди не записуються й чекають наступного запуску
// (MAX_AGE_DAYS не дасть черзі рости вічно).
const MAX_PER_RUN = 50;

// Старіше — не новина. Деякі стрічки (Figma, Hugging Face) віддають увесь архів.
const MAX_AGE_DAYS = 3;

export async function runNews(): Promise<void> {
  const all: Article[] = [];

  // ONLY_SOURCES="AIN.UA,ГУРТ" — прогнати лише ці джерела (для ручних запусків)
  const only = process.env.ONLY_SOURCES?.split(",").map((s) => s.trim()).filter(Boolean);
  for (const source of only ? sources.filter((s) => only.includes(s.name)) : sources) {
    try {
      all.push(...(await fetchArticles(source)));
    } catch (err) {
      // одне зламане джерело не повинно зупиняти інші
      console.error(`Помилка з джерелом ${source.name}:`, err);
    }
  }

  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const recent = all.filter((a) => !a.publishedAt || a.publishedAt.getTime() >= cutoff);
  const fresh = await filterNew(recent);

  // 1. прості правила — без GPT
  const candidates: Article[] = [];
  for (const a of fresh) {
    const why = ruleRejectReason(a);
    if (why) await record(a, "rejected_rules", { reason: why });
    else candidates.push(a);
  }

  // від старіших до новіших, щоб у чаті йшли по порядку; без дати (сторінки без RSS) — як щойно знайдені
  const when = (a: Article) => a.publishedAt?.getTime() ?? Date.now();
  candidates.sort((a, b) => when(a) - when(b));
  const batch = candidates.slice(-MAX_PER_RUN);

  console.log(
    `Статей у стрічках: ${all.length}, свіжих: ${recent.length}, нових: ${fresh.length}, ` +
      `відсіяно правилами: ${fresh.length - candidates.length}, на оцінку GPT: ${batch.length}, ` +
      `чекають наступного запуску: ${candidates.length - batch.length}`,
  );

  // 2. GPT оцінює і пише пост; 3. надсилаємо те, що пройшло поріг
  let sent = 0;
  let failed = 0;
  const isDuplicate = makeDuplicateChecker(await recentSentTitles());
  for (const a of batch) {
    // Той самий грант/новина з іншого сайту — без GPT і без повторного поста
    const dup = isDuplicate(a.title);
    if (dup) {
      await record(a, "rejected_rules", { reason: `дубль: ${dup}` });
      console.log(`= дубль: ${a.title}`);
      continue;
    }
    try {
      const extracted = await extractArticle(a.url);
      const fullText = extracted?.text ?? null;
      const analysis = await analyze(a, fullText, extracted?.links);

      if (analysis.score >= minScoreFor(analysis.account)) {
        // Фактчек: звіряємо пост з оригіналом; перекручене — виправляємо, непідтверджене — не шлемо
        const fc = await factCheck(a.source, a.title, fullText ?? a.content, analysis.post, analysis.hook);
        if (fc.verdict === "reject") {
          await record(a, "rejected_ai", { analysis: { ...analysis, reason: `фактчек: ${fc.issues.join("; ")}` } });
          console.log(`✗ фактчек відхилив ${a.title}: ${fc.issues.join("; ")}`);
          continue;
        }
        analysis.post = withToolLink(fc.post, analysis.link);
        if (analysis.hook) analysis.hook = fc.hook;
        const note = factNote(fc);

        await sendPost(analysis.post, {
          tags: analysis.tags,
          account: analysis.account,
          source: a.source,
          lines: [`📰 ⭐ ${analysis.score}/10 · ${analysis.stream}`, a.title, ...(note ? [note] : [])],
          link: { url: a.url, label: "Оригінал" },
        }, { format: "news", title: a.title, url: a.url, source: a.source, account: analysis.account, score: analysis.score });
        if (analysis.hook) await sendHook(analysis.hook);
        await record(a, "sent", { analysis }); // тільки після успішної відправки
        sent++;
        console.log(`✓ ${analysis.score}/10 ${a.title}`);
      } else {
        await record(a, "rejected_ai", { analysis });
        console.log(`· ${analysis.score}/10 ${a.title} — ${analysis.reason}`);
      }
    } catch (err) {
      // не записуємо — спробуємо ще раз наступного запуску
      console.error(`✗ ${a.title}:`, err);
      failed++;
    }
  }

  console.log(`\nВідправлено: ${sent}/${batch.length} (пороги: ${JSON.stringify(MIN_SCORE_BY_ACCOUNT)}), помилок: ${failed}`);

  // Якщо впало все (скінчились гроші на OpenAI, бот заблоковано, ключ невірний) —
  // позначаємо запуск як збійний, щоб GitHub Actions надіслав попередження.
  if (all.length === 0 || (batch.length > 0 && failed === batch.length)) {
    throw new Error(all.length === 0 ? "Жодне джерело не відповіло" : "Усі статті запуску завершились помилкою");
  }
}

