import { Prisma, type InstagramDmDailyAnalysis } from "@/generated/prisma/client";
import type { AiAnalysis, ConversationClassification } from "@/modules/instagram-dm/analytics-ai";
import { bakuAnalysisDay, DM_ANALYSIS_VERSION, DM_RETRY_AFTER_MS, safeAnalysisError, safeProviderDiagnostics } from "@/modules/instagram-dm/analysis-policy";
import { getPrisma } from "@/server/db/prisma";

export type DailyAiResult = ({ state: "ready"; generatedAt: string } & AiAnalysis) | {
  state: "no_data" | "unavailable";
  generatedAt: string;
  reason: string;
};

export type DailyAnalysisHistoryItem = {
  day: string;
  generatedAt: string;
  dataCutoffAt: string;
  state: string;
  model: string;
  analyzedConversations: number | null;
  customerConversations: number | null;
  highIntentUnanswered: number | null;
};

export type DailyAnalysisOutput = {
  ai: DailyAiResult;
  snapshot: { day: string; dataCutoffAt: string; model: string; status: string } | null;
  history: DailyAnalysisHistoryItem[];
};

export async function getDailyDmAnalysis(input: {
  period: { from: string; to: string };
  now: Date;
  model: string | null;
  metrics: object;
  analyze: () => Promise<{
    analysis: AiAnalysis | null;
    classifications: Array<ConversationClassification & { conversationId: string }>;
  }>;
}, prisma = getPrisma()): Promise<DailyAnalysisOutput> {
  const day = bakuAnalysisDay(input.now);
  const key = {
    periodFrom: new Date(`${input.period.from}T00:00:00Z`),
    periodTo: new Date(`${input.period.to}T00:00:00Z`),
    snapshotDay: new Date(`${day}T00:00:00Z`),
  };
  try {
    let row = await prisma.instagramDmDailyAnalysis.findUnique({ where: { periodFrom_periodTo_snapshotDay: key } });
    if (input.model) {
      const claimData = {
        ...key,
        model: input.model,
        status: "RUNNING",
        analysisVersion: DM_ANALYSIS_VERSION,
        startedAt: input.now,
        dataCutoffAt: input.now,
        metrics: input.metrics as Prisma.InputJsonObject,
      };
      let claimed = 0;
      if (!row) {
        // Database uniqueness, not process memory, arbitrates simultaneous visits.
        claimed = (await prisma.instagramDmDailyAnalysis.createMany({ data: [claimData], skipDuplicates: true })).count;
      } else if (row.status === "FAILED" || row.status === "RUNNING") {
        // Only failed or abandoned attempts may retry; a completed daily result is immutable.
        const repairedFailure = row.status === "FAILED" && row.analysisVersion !== DM_ANALYSIS_VERSION;
        claimed = (await prisma.instagramDmDailyAnalysis.updateMany({
          where: { id: row.id, status: row.status, startedAt: repairedFailure ? row.startedAt : { lte: new Date(input.now.getTime() - DM_RETRY_AFTER_MS) } },
          data: { ...claimData, errorCode: null, finishedAt: null, result: Prisma.DbNull },
        })).count;
      }
      if (claimed) {
        try {
          const result = await input.analyze();
          const finishedAt = new Date();
          const ai: DailyAiResult = result.analysis
            ? { state: "ready", generatedAt: finishedAt.toISOString(), ...result.analysis }
            : { state: "no_data", generatedAt: finishedAt.toISOString(), reason: "Seçilmiş dövrdə analiz üçün mətnli müştəri dialoqu yoxdur." };
          await prisma.instagramDmDailyAnalysis.updateMany({
            where: { ...key, status: "RUNNING", startedAt: input.now },
            data: {
              status: result.analysis ? "READY" : "NO_DATA", finishedAt,
              result: ai as unknown as Prisma.InputJsonObject,
              classifications: result.classifications as unknown as Prisma.InputJsonArray,
            },
          });
        } catch (error) {
          const failure = safeAnalysisError(error);
          console.error("Instagram DM daily AI analysis failed", { code: failure.code, diagnostics: safeProviderDiagnostics(error), model: input.model, period: input.period, day });
          await prisma.instagramDmDailyAnalysis.updateMany({
            where: { ...key, status: "RUNNING", startedAt: input.now },
            data: {
              status: "FAILED", finishedAt: new Date(), errorCode: failure.code,
              result: { state: "unavailable", generatedAt: "", reason: failure.reason },
            },
          });
        }
      }
      row = await prisma.instagramDmDailyAnalysis.findUnique({ where: { periodFrom_periodTo_snapshotDay: key } });
    }
    const historyRows = await prisma.instagramDmDailyAnalysis.findMany({
      where: { periodFrom: key.periodFrom, periodTo: key.periodTo },
      orderBy: { snapshotDay: "desc" }, take: 31,
      // Classification IDs and any raw message text never go to the browser.
      select: { snapshotDay: true, finishedAt: true, dataCutoffAt: true, status: true, model: true, result: true },
    });
    return {
      ai: row ? resultFromRow(row) : { state: "unavailable", generatedAt: "", reason: "AI xidməti konfiqurasiya edilməyib." },
      snapshot: row ? { day, dataCutoffAt: row.dataCutoffAt.toISOString(), model: row.model, status: row.status } : null,
      history: historyRows.map((entry) => {
        const result = entry.result as DailyAiResult | null;
        const ready = result?.state === "ready" ? result : null;
        return {
          day: entry.snapshotDay.toISOString().slice(0, 10),
          generatedAt: entry.finishedAt?.toISOString() ?? "", dataCutoffAt: entry.dataCutoffAt.toISOString(),
          state: entry.status, model: entry.model,
          analyzedConversations: ready?.analyzedConversations ?? null,
          customerConversations: ready?.customerConversations ?? null,
          highIntentUnanswered: ready?.highIntentUnanswered ?? null,
        };
      }),
    };
  } catch {
    // Never fall back to paid, non-persistent generation when the migration/storage is unavailable.
    console.error("Instagram DM daily analysis storage unavailable");
    return {
      ai: { state: "unavailable", generatedAt: "", reason: "Gündəlik analiz yaddaşı əlçatan deyil. Database migration və bağlantı yoxlanmalıdır." },
      snapshot: null, history: [],
    };
  }
}

function resultFromRow(row: InstagramDmDailyAnalysis): DailyAiResult {
  if (row.result && row.status !== "RUNNING") return row.result as DailyAiResult;
  const stale = Date.now() - row.startedAt.getTime() >= DM_RETRY_AFTER_MS;
  return {
    state: "unavailable", generatedAt: "",
    reason: stale ? "Əvvəlki analiz yarımçıq qalıb. Səhifəni yeniləyin." : "Bu günün analizi hazırlanır. Bir qədər sonra səhifəni yeniləyin.",
  };
}
