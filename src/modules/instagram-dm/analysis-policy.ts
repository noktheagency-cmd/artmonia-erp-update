export const DM_ANALYSIS_VERSION = "dm-ai-v9-safe-provider-diagnostics";
export const OPENROUTER_DM_MODEL = "google/gemini-3.8-flash";
export const DM_RETRY_AFTER_MS = 15 * 60 * 1000;
export const DM_ANALYSIS_TIMEOUT_MS = 5 * 60 * 1000;

export function bakuAnalysisDay(now = new Date()) {
  return new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function dmProviderOptions(useOpenRouter: boolean) {
  // Vertex ZDR endpoints do not support temperature. With require_parameters,
  // sending it removes every eligible endpoint. Keep the privacy policy intact.
  return useOpenRouter ? {} : { temperature: 0 };
}

export function safeAnalysisError(error: unknown): { code: string; reason: string } {
  const candidate = error as { name?: string; statusCode?: number; cause?: unknown } | null;
  if (candidate?.cause && candidate.name === "AI_RetryError") return safeAnalysisError(candidate.cause);
  const status = candidate?.statusCode;
  if (status === 401 || status === 403) return { code: `HTTP_${status}`, reason: "AI açarı və ya modelə giriş icazəsi yoxlanmalıdır." };
  if (status === 402) return { code: "HTTP_402", reason: "OpenRouter balansı və ya açarın xərc limiti kifayət etmir." };
  if (status === 404) return { code: "HTTP_404", reason: "Model üçün tələb olunan parametrlərə və məxfilik qaydasına uyğun AI marşrutu tapılmadı." };
  if (status === 429) return { code: "HTTP_429", reason: "AI xidmətinin sorğu limiti dolub. Bir qədər sonra yeniləyin." };
  if (candidate?.name === "TimeoutError" || candidate?.name === "AbortError") return { code: "TIMEOUT", reason: "AI analizi vaxt limitini keçdi." };
  if (candidate?.name === "DmContextLimitError") return { code: "CONTEXT_LIMIT", reason: "Dialoq həcmi bir analiz paketinin limitini keçir; mətn kəsilmədi. Daha qısa tarix aralığı seçin." };
  return { code: status ? `HTTP_${status}` : "ANALYSIS_FAILED", reason: "AI analizi yenilənə bilmədi. Xəta qeydə alındı; 15 dəqiqə sonra yenidən yoxlamaq olar." };
}

// Only fixed diagnostic labels leave this function, never provider response text,
// request bodies, credentials or customer messages echoed by an upstream service.
export function safeProviderDiagnostics(error: unknown): string[] {
  const candidate = error as { name?: string; cause?: unknown; message?: unknown; responseBody?: unknown } | null;
  if (candidate?.cause && candidate.name === "AI_RetryError") return safeProviderDiagnostics(candidate.cause);
  const text = [candidate?.message, candidate?.responseBody].filter((value) => typeof value === "string").join(" ").toLowerCase();
  const patterns: Record<string, RegExp> = {
    AUTH: /api.?key|authorization|authentication|unauthorized|user not found/,
    BALANCE: /credit|balance|spending|payment/,
    SCHEMA: /schema|structured.output|response_format/,
    REASONING: /reasoning|thinking/,
    TOKEN_LIMIT: /max_tokens|max.output.tokens|token.limit|context.length/,
    UNSUPPORTED: /unsupported|not supported|not allowed/,
    INVALID_ARGUMENT: /invalid.argument|invalid parameter|invalid request/,
    PROVIDER_ERROR: /provider returned error/,
    ROUTING: /no endpoints|no available|routing|data.policy|zero.data.retention/,
    MODEL: /model/,
  };
  return Object.entries(patterns).filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

export type PreparedConversation = {
  index: number;
  messages: Array<{ direction: "MÜŞTƏRİ" | "KOMANDA"; text: string }>;
};

export function redactDmContactDetails(text: string) {
  return text
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[E-POÇT]")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[LİNK]")
    .replace(/(?<!\d)\+?\d[\d ()-]{7,}\d(?!\d)/g, "[TELEFON]");
}

export function createAnalysisBatches(conversations: PreparedConversation[]) {
  const batches: PreparedConversation[][] = [];
  let batch: PreparedConversation[] = [];
  let size = 0;
  for (const conversation of conversations) {
    const length = JSON.stringify(conversation).length;
    if (length > 60_000) {
      const error = new Error("Conversation exceeds the analysis batch limit");
      error.name = "DmContextLimitError";
      throw error;
    }
    if (batch.length && (batch.length >= 10 || size + length > 60_000)) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(conversation);
    size += length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
