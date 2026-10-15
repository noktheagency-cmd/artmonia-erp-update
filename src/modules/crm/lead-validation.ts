import { PublicActionError } from "@/server/actions/public-action-error";

export function assertLeadPlan(input: { stage: string; phone: string | null | undefined; programId: string | null | undefined;
  nextActionType: string | null | undefined; nextDate: string | Date | null | undefined; reason?: string | null }) {
  if (!input.phone) throw new PublicActionError("Telefon nömrəsi daxil edilməlidir.");
  if (input.stage === "LOST") {
    if (!input.reason?.trim()) throw new PublicActionError("İtirilmə səbəbini yazın.");
    return;
  }
  if (input.stage === "REGISTERED") return;
  if (!input.programId || !input.nextActionType || !input.nextDate) {
    throw new PublicActionError("Açıq müraciət üçün proqram, növbəti iş və tarix məcburidir.");
  }
}
