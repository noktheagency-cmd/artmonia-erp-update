export const leadStageOptions = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "TRIAL_CONSULTATION",
  "REGISTERED",
  "LOST",
  "NURTURE",
] as const;

export type LeadStageValue = (typeof leadStageOptions)[number];

export const leadStageLabels: Record<LeadStageValue, string> = {
  NEW: "Yeni",
  CONTACTED: "Əlaqə saxlanılıb",
  QUALIFIED: "Uyğundur",
  TRIAL_CONSULTATION: "Sınaq görüşü",
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
  TRIAL_CONSULTATION: "warning",
  REGISTERED: "success",
  LOST: "danger",
  NURTURE: "info",
};
