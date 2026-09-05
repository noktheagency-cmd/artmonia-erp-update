import { z } from "zod";
import { Output } from "ai";

export const conversationClassificationSchema = z.object({
  index: z.number().int().positive(),
  kind: z.enum(["CUSTOMER", "HR", "WORKSHOP", "IRRELEVANT"]),
  service: z.enum([
    "ABILITY_PREP",
    "ART_COURSE",
    "DESIGN",
    "ARCHITECTURE",
    "CHILDREN_ART",
    "OTHER_EDUCATION",
  ]).nullable(),
  purchaseIntent: z.enum(["HOT", "WARM", "COLD"]).nullable(),
  barriers: z.array(z.enum([
    "PRICE",
    "SCHEDULE",
    "ONLINE",
    "LOCATION",
    "TRUST",
    "UNCERTAINTY",
  ])).max(3),
  outcome: z.enum([
    "CONTACT_SHARED",
    "INFO_PROVIDED",
    "FOLLOW_UP_REQUIRED",
    "CUSTOMER_CLOSED",
    "NO_RESOLUTION",
    "NOT_CUSTOMER",
  ]),
  needsReply: z.boolean(),
  teamRatings: z.object({
    professionalism: z.number().int().min(1).max(5).nullable(),
    needDiscovery: z.number().int().min(1).max(5).nullable(),
    answerQuality: z.number().int().min(1).max(5).nullable(),
    objectionHandling: z.number().int().min(1).max(5).nullable(),
    registrationDirection: z.number().int().min(1).max(5).nullable(),
  }).nullable(),
});

export const conversationClassificationBatchSchema = z.object({
  conversations: z.array(conversationClassificationSchema).min(1).max(30),
});

export function conversationClassificationOutput(useOpenRouter: boolean) {
  // The live Gemini Vertex route rejects this nested JSON schema. JSON mode
  // retains strict server-side Zod validation before any result is used.
  return useOpenRouter ? Output.json() : Output.object({ schema: conversationClassificationBatchSchema });
}

export const conversationClassificationFormatInstruction = `Yalnız bu sxemə uyğun JSON obyektini qaytar (markdown deyil). Bütün sahələr məcburidir; tətbiq olunmayan nullable sahələr null olmalıdır:\n${JSON.stringify(z.toJSONSchema(conversationClassificationBatchSchema))}`;

export type ConversationClassification = z.infer<typeof conversationClassificationSchema>;

export function normalizeConversationClassification(
  item: ConversationClassification,
  context: { lastDirection: "MÜŞTƏRİ" | "KOMANDA"; hasTeamMessage: boolean },
): ConversationClassification {
  if (item.kind !== "CUSTOMER") {
    return {
      ...item,
      service: null,
      purchaseIntent: null,
      barriers: [],
      outcome: "NOT_CUSTOMER",
      needsReply: false,
      teamRatings: null,
    };
  }

  const teamRatings = context.hasTeamMessage ? item.teamRatings : null;
  const needsReply = context.lastDirection === "MÜŞTƏRİ" && item.needsReply;
  let outcome = item.outcome === "NOT_CUSTOMER" ? "NO_RESOLUTION" as const : item.outcome;
  if (needsReply) outcome = "FOLLOW_UP_REQUIRED";
  if (outcome === "NO_RESOLUTION" && (teamRatings?.answerQuality ?? 0) >= 3) outcome = "INFO_PROVIDED";

  return {
    ...item,
    purchaseIntent: item.purchaseIntent ?? "COLD",
    outcome,
    needsReply,
    teamRatings,
  };
}

export type PercentageItem = { label: string; percentage: number };
export type AiAnalysis = {
  analyzedConversations: number;
  customerConversations: number;
  excludedConversations: number;
  serviceInterest: PercentageItem[];
  purchaseIntent: { hot: number; warm: number; cold: number };
  barriers: PercentageItem[];
  outcomes: PercentageItem[];
  teamScores: {
    professionalism: number;
    needDiscovery: number;
    answerQuality: number;
    objectionHandling: number;
    registrationDirection: number;
  };
  incompleteDialogs: number;
  highIntentUnanswered: number;
  summary: string;
  recommendations: string[];
};

type OperationalMetrics = {
  responseRate: number;
  medianFirstResponseMinutes: number | null;
};

const serviceLabels: Record<NonNullable<ConversationClassification["service"]>, string> = {
  ABILITY_PREP: "Qabiliyyət imtahanına hazırlıq",
  ART_COURSE: "Rəsm kursu",
  DESIGN: "Dizayn",
  ARCHITECTURE: "Memarlıq",
  CHILDREN_ART: "Uşaqlar üçün rəsm",
  OTHER_EDUCATION: "Digər təhsil xidməti",
};

const barrierLabels: Record<ConversationClassification["barriers"][number], string> = {
  PRICE: "Qiymət / ödəniş",
  SCHEDULE: "Cədvəl / vaxt",
  ONLINE: "Onlayn format ehtiyacı",
  LOCATION: "Məkan / məsafə",
  TRUST: "Etibar / nəticə sübutu",
  UNCERTAINTY: "Əlavə məlumat ehtiyacı",
};

const outcomeLabels: Record<ConversationClassification["outcome"], string> = {
  CONTACT_SHARED: "Əlaqə məlumatı verildi",
  INFO_PROVIDED: "Məlumat verildi",
  FOLLOW_UP_REQUIRED: "Follow-up tələb olunur",
  CUSTOMER_CLOSED: "Müştəri söhbəti tamamladı",
  NO_RESOLUTION: "Nəticəsiz qaldı",
  NOT_CUSTOMER: "Müştəri sorğusu deyil",
};

export function aggregateConversationClassifications(
  classifications: ConversationClassification[],
  metrics: OperationalMetrics,
): AiAnalysis {
  const customers = classifications.filter((item) => item.kind === "CUSTOMER");
  const customerTotal = customers.length;
  const serviceInterest = percentageItems(
    customers.flatMap((item) => item.service ? [item.service] : []),
    customerTotal,
    serviceLabels,
  );
  const intentCounts = countValues(customers.flatMap((item) => item.purchaseIntent ? [item.purchaseIntent] : []));
  const intentTotal = sumCounts(intentCounts);
  const intentPercentages = exclusivePercentages(["HOT", "WARM", "COLD"], intentCounts, intentTotal);
  const barriers = percentageItems(
    customers.flatMap((item) => item.barriers),
    customerTotal,
    barrierLabels,
  );
  const outcomes = percentageItems(
    customers.map((item) => item.outcome),
    customerTotal,
    outcomeLabels,
  );
  const teamScores = {
    professionalism: averageRating(customers, "professionalism"),
    needDiscovery: averageRating(customers, "needDiscovery"),
    answerQuality: averageRating(customers, "answerQuality"),
    objectionHandling: averageRating(customers, "objectionHandling"),
    registrationDirection: averageRating(customers, "registrationDirection"),
  };
  const incompleteDialogs = customers.filter((item) => item.needsReply).length;
  const highIntentUnanswered = customers.filter((item) => item.needsReply && item.purchaseIntent === "HOT").length;
  const analyzedConversations = classifications.length;
  const excludedConversations = analyzedConversations - customerTotal;
  const base = {
    analyzedConversations,
    customerConversations: customerTotal,
    excludedConversations,
    serviceInterest,
    purchaseIntent: {
      hot: intentPercentages.HOT,
      warm: intentPercentages.WARM,
      cold: intentPercentages.COLD,
    },
    barriers,
    outcomes,
    teamScores,
    incompleteDialogs,
    highIntentUnanswered,
  };

  return {
    ...base,
    summary: buildSummary(base),
    recommendations: buildRecommendations(base, metrics),
  };
}

function percentageItems<K extends string>(
  values: K[],
  denominator: number,
  labels: Record<K, string>,
) {
  if (denominator <= 0) return [];
  return [...countValues(values).entries()]
    .map(([value, count]) => ({ label: labels[value], percentage: round1(count * 100 / denominator), count }))
    .filter((item) => item.percentage > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "az"))
    .slice(0, 6)
    .map(({ label, percentage }) => ({ label, percentage }));
}

function exclusivePercentages<K extends string>(keys: K[], counts: Map<K, number>, total: number) {
  const result = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
  if (total <= 0) return result;
  keys.forEach((key) => { result[key] = round1((counts.get(key) ?? 0) * 100 / total); });
  const delta = round1(100 - keys.reduce((sum, key) => sum + result[key], 0));
  const largest = [...keys].sort((left, right) => (counts.get(right) ?? 0) - (counts.get(left) ?? 0))[0];
  if (largest) result[largest] = round1(result[largest] + delta);
  return result;
}

function countValues<K extends string>(values: K[]) {
  const counts = new Map<K, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return counts;
}

function sumCounts<K>(counts: Map<K, number>) {
  return [...counts.values()].reduce((sum, value) => sum + value, 0);
}

function averageRating(
  classifications: ConversationClassification[],
  key: keyof NonNullable<ConversationClassification["teamRatings"]>,
) {
  const ratings = classifications.flatMap((item) => {
    const value = item.teamRatings?.[key];
    return value === null || value === undefined ? [] : [value];
  });
  if (!ratings.length) return 0;
  return Math.round(ratings.reduce((sum, value) => sum + value, 0) * 20 / ratings.length);
}

function buildSummary(analysis: Omit<AiAnalysis, "summary" | "recommendations">) {
  const topService = analysis.serviceInterest[0];
  const serviceSentence = topService
    ? `Ən çox görünən xidmət marağı ${topService.label.toLocaleLowerCase("az")}dır (${formatPercent(topService.percentage)}).`
    : "Xidmət marağını dəqiq müəyyən etmək üçün kifayət qədər açıq müştəri mesajı yoxdur.";
  const replySentence = analysis.highIntentUnanswered > 0
    ? `${analysis.highIntentUnanswered} yüksək niyyətli dialoq cavab gözləyir.`
    : "Cavab gözləyən yüksək niyyətli dialoq aşkarlanmadı.";
  return `${analysis.analyzedConversations} inbound dialoq təsnif edildi; ${analysis.customerConversations} müştəri sorğusu analizə daxil edildi, ${analysis.excludedConversations} HR, workshop/masterclass və ya əlaqəsiz dialoq faizlərdən çıxarıldı. ${serviceSentence} Yüksək alış niyyəti ${formatPercent(analysis.purchaseIntent.hot)} təşkil edir. ${replySentence}`;
}

function buildRecommendations(
  analysis: Omit<AiAnalysis, "summary" | "recommendations">,
  metrics: OperationalMetrics,
) {
  const recommendations: string[] = [];
  if (metrics.medianFirstResponseMinutes !== null && metrics.medianFirstResponseMinutes > 60) {
    recommendations.push(`Median ilk cavab ${durationLabel(metrics.medianFirstResponseMinutes)}dır; iş saatları üçün cavab SLA-sı və növbə bildirişi təyin edin.`);
  }
  if (analysis.highIntentUnanswered > 0) {
    recommendations.push(`${analysis.highIntentUnanswered} yüksək niyyətli cavabsız dialoqu prioritet follow-up siyahısına çıxarın.`);
  }
  const priceBarrier = analysis.barriers.find((item) => item.label === barrierLabels.PRICE);
  if (priceBarrier && priceBarrier.percentage >= 10) {
    recommendations.push(`Qiymət və ödəniş mövzusu müştəri dialoqlarının ${formatPercent(priceBarrier.percentage)}-ində görünür; standart, aydın qiymət cavabı hazırlayın.`);
  }
  const scheduleBarrier = analysis.barriers.find((item) => item.label === barrierLabels.SCHEDULE);
  if (scheduleBarrier && scheduleBarrier.percentage >= 10) {
    recommendations.push(`Cədvəl və vaxt mövzusu ${formatPercent(scheduleBarrier.percentage)} paya malikdir; uyğun qrupları qısa seçimlə təqdim edin.`);
  }
  const teamScoreLabels: Record<keyof AiAnalysis["teamScores"], string> = {
    professionalism: "ton və peşəkarlıq",
    needDiscovery: "ehtiyacın aşkarlanması",
    answerQuality: "cavab keyfiyyəti",
    objectionHandling: "etirazların idarəsi",
    registrationDirection: "qeydiyyata yönləndirmə",
  };
  const weakestTeamEntry = (Object.entries(analysis.teamScores) as Array<[keyof AiAnalysis["teamScores"], number]>)
    .filter(([, value]) => value > 0)
    .sort((left, right) => left[1] - right[1])[0];
  if (weakestTeamEntry && weakestTeamEntry[1] < 60) {
    recommendations.push(`Komandada ən zəif meyar: ${teamScoreLabels[weakestTeamEntry[0]]} (${weakestTeamEntry[1]}/100). Bu mövzu üzrə cavab nümunələri və qısa təlim hazırlayın.`);
  }
  if (!recommendations.length) {
    recommendations.push(`Cavab faizi ${formatPercent(metrics.responseRate)} səviyyəsindədir; mövcud cavab axınını qoruyub həftəlik dəyişimi izləyin.`);
  }
  return recommendations.slice(0, 5);
}

function durationLabel(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} dəqiqə`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours} saat ${remainder} dəqiqə` : `${hours} saat`;
}

function formatPercent(value: number) {
  return `${String(round1(value)).replace(".", ",")}%`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
