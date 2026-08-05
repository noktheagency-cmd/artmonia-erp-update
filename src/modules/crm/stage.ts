export const leadStageOptions = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "TRIAL_LESSON",
  "TRIAL_CONSULTATION",
  "REGISTERED",
  "LOST",
  "NURTURE",
] as const;

export type LeadStageValue = (typeof leadStageOptions)[number];

export const leadStageLabels: Record<LeadStageValue, string> = {
  NEW: "Zəng gözləyir",
  CONTACTED: "Xatırlatma",
  QUALIFIED: "Konsultasiya təyin olundu",
  TRIAL_LESSON: "Sınaq dərsi",
  TRIAL_CONSULTATION: "Ödəniş gözlənilir",
  REGISTERED: "Qeydiyyata alınıb",
  LOST: "İtirilib",
  NURTURE: "İzləmədə",
};

export const leadStageSelectOptions = leadStageOptions.map((stage) => ({
  value: stage,
  label: leadStageLabels[stage],
}));

export function formatLeadStageLabel(value: string) {
  return leadStageLabels[value as LeadStageValue] ?? value;
}

export const leadStageTones: Record<
  LeadStageValue,
  "success" | "warning" | "danger" | "neutral" | "info"
> = {
  NEW: "info",
  CONTACTED: "neutral",
  QUALIFIED: "warning",
  TRIAL_LESSON: "info",
  TRIAL_CONSULTATION: "warning",
  REGISTERED: "success",
  LOST: "danger",
  NURTURE: "info",
};
