import type {
  AuthSessionDto,
  SecurityAccountDto,
  SessionUserDto,
} from "@/modules/audit/session-types";

export function buildSessionUsers(
  sessions: AuthSessionDto[],
  accounts: SecurityAccountDto[],
): SessionUserDto[] {
  const byUser = new Map<string, SessionUserDto>();

  for (const session of sessions) {
    const current = byUser.get(session.userId);
    if (current) {
      current.activeSessionCount += 1;
      if (!current.lastSeenAt || session.lastSeenAt > current.lastSeenAt) {
        current.lastSeenAt = session.lastSeenAt;
      }
      continue;
    }

    byUser.set(session.userId, {
      id: session.userId,
      fullName: session.userName,
      email: session.userEmail,
      role: session.userRole,
      department: session.department,
      position: session.position,
      activeSessionCount: 1,
      lastSeenAt: session.lastSeenAt,
    });
  }

  for (const account of accounts) {
    if (account.status !== "ACTIVE" || !account.userId) continue;

    const current = byUser.get(account.userId);
    byUser.set(account.userId, {
      id: account.userId,
      fullName: account.fullName,
      email: account.loginEmail ?? account.contactEmail ?? current?.email ?? "",
      role: account.roles[0]?.name ?? current?.role ?? "İstifadəçi",
      department: account.department,
      position: account.position,
      activeSessionCount: current?.activeSessionCount ?? 0,
      lastSeenAt: current?.lastSeenAt ?? null,
    });
  }

  return [...byUser.values()].toSorted(
    (left, right) =>
      (right.lastSeenAt ?? "").localeCompare(left.lastSeenAt ?? "") ||
      left.fullName.localeCompare(right.fullName, "az"),
  );
}
