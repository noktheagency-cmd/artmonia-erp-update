export const crmDefaultSourceOptions = [
  "Instagram",
  "WhatsApp",
  "Referral",
  "Website",
  "Walk-in",
  "Phone call",
  "Facebook",
  "TikTok",
  "Google Ads",
  "Workshop",
  "Masterclass",
  "Event",
  "Partner",
  "Returning student",
  "Manual",
] as const;

const crmSourceLabels: Record<string, string> = {
  Instagram: "Instagram",
  WhatsApp: "WhatsApp",
  Referral: "Tövsiyə",
  Website: "Veb-sayt",
  "Walk-in": "Yerində müraciət",
  "Phone call": "Telefon zəngi",
  Facebook: "Facebook",
  TikTok: "TikTok",
  "Google Ads": "Google reklamı",
  Workshop: "Ustad dərsi",
  Masterclass: "Masterclass",
  Event: "Tədbir",
  Partner: "Tərəfdaş",
  "Returning student": "Təkrar müraciət",
  Manual: "Əl ilə daxil edilib",
};

export function formatCrmSourceLabel(value: string | null | undefined) {
  return value ? crmSourceLabels[value] ?? value : "-";
}

export function buildCrmSourceSelectOptions(values: string[]) {
  return values.map((value) => ({
    value,
    label: formatCrmSourceLabel(value),
  }));
}

export function buildCrmSourceOptions(values: string[]) {
  const seen = new Set<string>();

  return [...crmDefaultSourceOptions, ...values]
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLowerCase();

      if (!value || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}
