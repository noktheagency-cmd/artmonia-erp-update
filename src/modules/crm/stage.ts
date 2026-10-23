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

/** Consultation and trial lesson are one pipeline step. */
export const consultationTrialStage = "CONSULTATION_TRIAL" as const;
export type CrmStageFilter = LeadStageValue | typeof consultationTrialStage;
export const consultationTrialLabel = "Konsultasiya/Sınaq";

export const leadStageLabels: Record<LeadStageValue, string> = {
  NEW: "Zəng gözləyir",
  CONTACTED: "Əlaqə quruldu",
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

const contactCompletedStages = new Set<LeadStageValue>([
  "CONTACTED",
  "QUALIFIED",
  "TRIAL_LESSON",
  "TRIAL_CONSULTATION",
  "REGISTERED",
  "NURTURE",
]);

const meetingCompletedStages = new Set<LeadStageValue>([
  // "QUALIFIED",
  "TRIAL_LESSON",
  "TRIAL_CONSULTATION",
  "REGISTERED",
]);

export function isContactStageCompleted(stage: string) {
  return contactCompletedStages.has(stage as LeadStageValue);
}

export function isMeetingStageCompleted(stage: string) {
  return meetingCompletedStages.has(stage as LeadStageValue);
}

export const leadStageTones: Record<
  LeadStageValue,
  "success" | "warning" | "danger" | "neutral" | "info"
> = {
  NEW: "info",
  CONTACTED: "success",
  QUALIFIED: "warning",
  TRIAL_LESSON: "info",
  TRIAL_CONSULTATION: "warning",
  REGISTERED: "success",
  LOST: "danger",
  NURTURE: "info",
};
