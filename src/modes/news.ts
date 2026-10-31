import { prisma } from "../db.ts";
import { sources } from "../sources.ts";
import { fetchArticles, type Article } from "../fetchArticles.ts";
import { filterNew, makeDuplicateChecker, recentSentTitles, record, sameAsRecent } from "../dedup.ts";
import { noisyReason, notCreativeReason, ruleRejectReason } from "../ruleFilter.ts";
import { extractArticle } from "../extractText.ts";
import { analyze, minScoreFor, MIN_SCORE_BY_ACCOUNT, type Analysis } from "../summarize.ts";
import { analyzeFop } from "../fop.ts";
import { queueFromGrant } from "../orders.ts";
import { sendHook, sendPost } from "../sendToTelegram.ts";
import { factCheck } from "../factCheck.ts";
import { withToolLink } from "../digest.ts";

// Не більше стількох статей на GPT за один запуск — щоб нове джерело не завалило бота
// всім своїм архівом. Ті, що не влізли, нікуди не записуються й чекають наступного запуску
// (MAX_AGE_DAYS не дасть черзі рости вічно).
const MAX_PER_RUN = 50;

// Старіше — не новина. Деякі стрічки (Figma, Hugging Face) віддають увесь архів.
const MAX_AGE_DAYS = 3;

// Чи надсилали за 60 днів пост з тим самим посиланням на програму (withToolLink дописує «🔗 url» у кінець поста)
async function sentWithLink(link: string): Promise<boolean> {
  const core = link.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");
  if (core.split("/").length < 2) return false; // лише домен (головна сайту фонду) — не показник дубля
  const hit = await prisma.article.findFirst({
    where: { status: "sent", createdAt: { gte: new Date(Date.now() - 60 * 86400000) }, post: { contains: core } },
    select: { id: true },
  });
  return !!hit;
}

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

  // 🧾 ФОП-гранти: "also" — що не підійшло митцям, перевіряємо як грант для ФОП; "only" — лише як ФОП-грант
  const fopMode = new Map(sources.map((s) => [s.name, s.fop]));
  const skipCreative = new Set<string>(); // url-и з джерел лише ФОП-грантів

  // 1. прості правила — без GPT
  const candidates: Article[] = [];
  for (const a of fresh) {
    // агро, ветерани, медицина… — не для креаторів і не «будь-який ФОП» (fop.ts), тож відсікаємо для всіх джерел
    const why = ruleRejectReason(a) ?? noisyReason(a) ?? notCreativeReason(a);
    if (why) {
      await record(a, "rejected_rules", { reason: why });
      continue;
    }
    if (fopMode.get(a.source) === "only") skipCreative.add(a.url);
    candidates.push(a);
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
      // Telegram-радар: дедлайн і суми часто є лише в самому пості каналу, а на сторінці-першоджерелі — ні (аудит 2026-10-26:
      // премія Леонтовича, стипендія OSA відкинуті як «без дедлайну»). Тому GPT бачить і пост каналу, і першоджерело.
      const isTelegram = sources.find((s) => s.name === a.source)?.telegram;
      const fullText = isTelegram && a.content ? `Пост каналу:\n${a.content}\n\nСторінка першоджерела:\n${extracted?.text ?? "(не прочиталась)"}` : (extracted?.text ?? null);
      // Спершу — як можливість для митців; що не підійшло й прийшло з грантового джерела — перевіряємо як грант для ФОП
      let analysis: Analysis | null = null;
      if (!skipCreative.has(a.url)) analysis = await analyze(a, fullText, extracted?.links);
      const creativeOk = analysis?.account === "knowledge" && analysis.score >= minScoreFor("knowledge");
      if (!creativeOk && fopMode.get(a.source)) {
        const fop = await analyzeFop(a, fullText, extracted?.links);
        if (fop.score >= minScoreFor("knowledge") || !analysis) analysis = fop;
        else analysis.reason = `${analysis.reason} | ${fop.score}/10 ${fop.reason}`;
      }
      if (!analysis) throw new Error("немає аналізу"); // не буває: без аналізу для митців завжди є ФОП-аналіз

      // Надсилаємо лише можливості; звичайні новини з медіа-джерел — "other", не шлемо
      if (analysis.account !== "other" && analysis.score >= minScoreFor(analysis.account)) {
        // Та сама програма вже була з іншого агрегатора під іншою назвою — не шлемо (і не платимо за фактчек)
        const same = await sameAsRecent(a.title, analysis.post);
        if (same) {
          await record(a, "rejected_rules", { reason: `дубль (GPT): ${same}` });
          console.log(`= дубль за змістом: ${a.title} ≈ ${same}`);
          continue;
        }
        // Фактчек: звіряємо пост з оригіналом; перекручене — виправляємо, непідтверджене — не шлемо
        const fc = await factCheck(a.source, a.title, fullText ?? a.content, analysis.post, analysis.hook);
        if (fc.verdict === "reject") {
          await record(a, "rejected_ai", { analysis: { ...analysis, reason: `фактчек: ${fc.issues.join("; ")}` } });
          console.log(`✗ фактчек відхилив ${a.title}: ${fc.issues.join("; ")}`);
          continue;
        }
        // Та сама програма з іншого сайту під іншою назвою (Грант Радар і GetGrant) — ловимо за посиланням на першоджерело
        // …і за адресою самої статті: її могли вже дати як 🔗 у пості з іншого агрегатора (УФС ← GetGrant)
        if ((analysis.link && (await sentWithLink(analysis.link))) || (await sentWithLink(a.url))) {
          await record(a, "rejected_rules", { reason: `дубль за посиланням: ${analysis.link}` });
          console.log(`= дубль за посиланням: ${a.title}`);
          continue;
        }
        // Посилання в пості є ЗАВЖДИ: якщо GPT не знайшов у тексті окремої сторінки програми, даємо саму статтю.
        // Для Telegram-джерел a.url — це вже першоджерело (сторінка фонду, форма), для агрегаторів — сторінка з умовами.
        analysis.post = withToolLink(fc.post, analysis.link || a.url);
        if (analysis.hook) analysis.hook = fc.hook;
        // Під лінією — лише «За матеріалами» й «Оригінал» (власник 2026-10-29: без оцінки, назви й правок фактчеку;
        // канал видно з підпису над лінією)
        await sendPost(analysis.post, {
          tags: analysis.tags,
          account: analysis.account,
          source: analysis.origin?.trim() || a.source, // першоджерело, а не посередник (ГУРТ, TLDR…)
          lines: [],
          link: { url: a.url, label: "Оригінал" },
        }, { format: "news", title: a.title, url: a.url, source: a.source, account: analysis.account, score: analysis.score });
        if (analysis.hook) await sendHook(analysis.hook);
        await record(a, "sent", { analysis }); // тільки після успішної відправки
        // 🧾 конкурс/open call з грошима для учасника — ще й у чергу «Замовлень для креаторів»
        if (analysis.cash_prize) await queueFromGrant(a, analysis).catch((e) => console.error("черга замовлень:", e));
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

