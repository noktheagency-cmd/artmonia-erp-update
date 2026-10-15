import { z } from "zod";
import type { MobileAuthUser } from "@/server/supabase/mobile-auth";

export type MobileMatchStatus = "matched" | "not_found" | "review_required";
export type MobileAccess = {
  contractVersion: 1;
  authUserId: string;
  role: "member" | "student";
  accountStatus: "active" | "disabled";
  matchStatus: MobileMatchStatus;
  displayName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  checkedAt: string;
};

export function normalizeMobileMatchPhone(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw || !/^\+?[\d\s().-]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = `994${digits.slice(1)}`;
  else if (digits.length === 9) digits = `994${digits}`;
  return digits.length >= 7 && digits.length <= 15 ? digits : null;
}

export function mobileAuthProfile(user: MobileAuthUser) {
  const metadata = z.record(z.string(), z.unknown()).safeParse(user.metadata);
  const values = metadata.success ? metadata.data : {};
  const text = (key: string) => typeof values[key] === "string"
    ? values[key].trim().slice(0, 200) : "";
  const phone = user.phoneConfirmed && user.phone ? user.phone : text("phone") || null;
  return {
    displayName: text("full_name") || [text("first_name"), text("last_name")].filter(Boolean).join(" ") || "Artmonia üzvü",
    phone,
  };
}

export function decideMobileStudentMatch(
  candidates: Array<{ phoneDisplay: string | null; phoneNormalized: string | null; linkedAuthUserId: string | null }>,
  authUserId: string,
  phone: string | null,
): Exclude<MobileMatchStatus, "matched"> | "match" {
  if (!candidates.length) return "not_found";
  if (candidates.length !== 1) return "review_required";
  const candidate = candidates[0];
  if (candidate.linkedAuthUserId && candidate.linkedAuthUserId !== authUserId) return "review_required";
  if (candidate.phoneDisplay || candidate.phoneNormalized) {
    const display = normalizeMobileMatchPhone(candidate.phoneDisplay);
    const normalized = normalizeMobileMatchPhone(candidate.phoneNormalized);
    const supplied = normalizeMobileMatchPhone(phone);
    if (!supplied || !(display || normalized) || (display && normalized && display !== normalized)
      || supplied !== (normalized ?? display)) return "review_required";
  }
  // Phone metadata is only an extra consistency check; verified email is the
  // prerequisite at the service boundary. Names and metadata roles never grant access.
  return "match";
}
