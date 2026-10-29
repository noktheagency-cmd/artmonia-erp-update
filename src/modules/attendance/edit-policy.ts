import type { PermissionScope } from "@/server/rbac/permissions";

/** Teachers edit today; all-scope attendance managers can also correct history. */
export function assertAttendanceEditDate(date: string, today: string, scope: PermissionScope | null) {
  if (date > today) throw new Error("Gələcək dərsin davamiyyəti yazıla bilməz");
  if (date < today && scope !== "ALL") {
    throw new Error("Keçmiş davamiyyəti dəyişmək üçün bütün davamiyyətə giriş icazəsi lazımdır");
  }
}
