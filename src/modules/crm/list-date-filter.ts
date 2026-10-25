import { currentBakuDateValue } from "@/lib/baku-date";

export type CrmListDateInput = {
  listDateBy?: string;
  listFrom?: string;
  listTo?: string;
};

export type CrmListDateFilter = {
  active: boolean;
  field: "created" | "planned";
  from: string;
  to: string;
  error: string;
};

export function crmListMonthDates(offset = 0, now = new Date()) {
  const today = currentBakuDateValue(now);
  const [year, month] = today.split("-").map(Number);
  return {
    from: new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(year, month + offset, 0)).toISOString().slice(0, 10),
  };
}

export function crmListNextWeekDates(now = new Date()) {
  const monday = new Date(`${currentBakuDateValue(now)}T00:00:00.000Z`);
  monday.setUTCDate(monday.getUTCDate() + 7 - (monday.getUTCDay() + 6) % 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

export function crmListDateError(from: string, to: string) {
  for (const value of [from, to]) {
    if (!value) continue;
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      return "Tarix düzgün seçilməyib.";
    }
  }
  return from && to && from > to ? "Başlanğıc tarixi bitmə tarixindən sonra ola bilməz." : "";
}

export function resolveCrmListDateFilter(
  input: CrmListDateInput,
  fallback: { from: string; to: string } = crmListMonthDates(),
): CrmListDateFilter {
  const active = input.listDateBy !== undefined || input.listFrom !== undefined || input.listTo !== undefined;
  const from = active ? input.listFrom?.trim() ?? "" : fallback.from;
  const to = active ? input.listTo?.trim() ?? "" : fallback.to;
  return {
    active,
    field: input.listDateBy === "planned" ? "planned" : "created",
    from,
    to,
    error: active && input.listDateBy && !["created", "planned"].includes(input.listDateBy)
      ? "Tarix növü düzgün seçilməyib."
      : crmListDateError(from, to),
  };
}

export function clearCrmListDateParams(params: URLSearchParams) {
  params.delete("listDateBy");
  params.delete("listFrom");
  params.delete("listTo");
}
