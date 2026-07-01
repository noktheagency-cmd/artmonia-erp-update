export const leadPriorityOptions = ["CRITICAL", "MEDIUM", "NORMAL"] as const;

export type LeadPriorityValue = (typeof leadPriorityOptions)[number];

export const leadPriorityLabels: Record<LeadPriorityValue, string> = {
  NORMAL: "Adi",
  MEDIUM: "Orta",
  CRITICAL: "Kritik",
};

export const leadPriorityTones: Record<
  LeadPriorityValue,
  "success" | "warning" | "danger" | "neutral" | "info"
> = {
  NORMAL: "neutral",
  MEDIUM: "warning",
  CRITICAL: "danger",
};

export const leadPrioritySelectOptions = leadPriorityOptions.map((priority) => ({
  value: priority,
  label: leadPriorityLabels[priority],
}));

export const nextActionTypeOptions = [
  "CALL",
  "CONSULTATION_REMINDER",
  "PAYMENT_REMINDER",
  "FOLLOW_UP",
] as const;

export type NextActionTypeValue = (typeof nextActionTypeOptions)[number];

export const nextActionTypeLabels: Record<NextActionTypeValue, string> = {
  CALL: "Zəng et",
  CONSULTATION_REMINDER: "Konsultasiya xatırlat",
  PAYMENT_REMINDER: "Ödəniş xatırlat",
  FOLLOW_UP: "Follow up et",
};

export const nextActionTypeSelectOptions = nextActionTypeOptions.map((actionType) => ({
  value: actionType,
  label: nextActionTypeLabels[actionType],
}));

export function formatLeadPriorityLabel(value: string | null | undefined) {
  return leadPriorityLabels[value as LeadPriorityValue] ?? leadPriorityLabels.NORMAL;
}

export function formatNextActionTypeLabel(value: string | null | undefined) {
  return value
    ? nextActionTypeLabels[value as NextActionTypeValue] ?? value
    : "Təyin edilməyib";
}
