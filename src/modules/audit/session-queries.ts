import "server-only";

import { AppRole, Prisma } from "@/generated/prisma/client";
import { parseSessionDevice } from "@/modules/audit/session-device";
import { buildSessionUsers } from "@/modules/audit/session-users";
import type {
  AuthSessionDto,
  AuditLogDto,
  SessionAuditData,
  SessionDeviceTypeDto,
  SecurityAccountDto,
} from "@/modules/audit/session-types";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

type AuthSessionRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  roleNames: unknown;
  department: string | null;
  position: string | null;
  authUserAgent: string | null;
  authIpAddress: string | null;
  authStartedAt: Date;
  authLastSeenAt: Date;
  expiresAt: Date | null;
  recordUserAgent: string | null;
  recordIpAddress: string | null;
  recordCity: string | null;
  recordCountry: string | null;
  recordDeviceType: string | null;
  recordDeviceName: string | null;
  recordBrowserName: string | null;
  recordBrowserVersion: string | null;
  recordOsName: string | null;
  recordOsVersion: string | null;
};

type SecurityAccountRow = {
  id: string;
  fullName: string;
  email: string | null;
  department: string;
  position: string;
  profilePhotoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: null | {
    id: string;
    email: string;
    authUserId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    roles: Array<{ role: { id: string; name: string; code: AppRole | null } }>;
  };
};

export async function getSessionAuditData(): Promise<SessionAuditData> {
  const actor = await requireErpActor();
  if (!actor.roles.includes(AppRole.SUPER_ADMIN)) {
    throw new Error("Forbidden");
  }

  const canViewAll = true;
  const canViewAudit = true;
  const sessionsPromise = getPrisma().$queryRaw<AuthSessionRow[]>(Prisma.sql`
    select
      s.id::text as "id",
      u.id::text as "userId",
      u.full_name as "userName",
      u.email as "userEmail",
      coalesce(
        array_agg(distinct r.name order by r.name) filter (where r.name is not null),
        array[]::text[]
      ) as "roleNames",
      he.department,
      he.position,
      s.user_agent as "authUserAgent",
      host(s.ip) as "authIpAddress",
      coalesce(s.created_at, now()) as "authStartedAt",
      greatest(
        coalesce(s.refreshed_at at time zone 'UTC', '-infinity'::timestamptz),
        coalesce(s.updated_at, '-infinity'::timestamptz),
        coalesce(sr.last_seen_at, '-infinity'::timestamptz),
        coalesce(s.created_at, '-infinity'::timestamptz)
      ) as "authLastSeenAt",
      s.not_after as "expiresAt",
      sr.user_agent as "recordUserAgent",
      sr.ip_address as "recordIpAddress",
      sr.city as "recordCity",
      sr.country as "recordCountry",
      sr.device_type as "recordDeviceType",
      sr.device_name as "recordDeviceName",
      sr.browser_name as "recordBrowserName",
      sr.browser_version as "recordBrowserVersion",
      sr.os_name as "recordOsName",
      sr.os_version as "recordOsVersion"
    from auth.sessions s
    join erp.users u on u.auth_user_id = s.user_id
    left join erp.hr_employees he on he.user_id = u.id
    left join erp.user_roles ur on ur.user_id = u.id
    left join erp.roles r on r.id = ur.role_id
    left join erp.auth_session_records sr on sr.id = s.id
    where u.is_active = true
      and (s.not_after is null or s.not_after > now())
      and sr.revoked_at is null
    group by
      s.id,
      u.id,
      he.department,
      he.position,
      s.user_agent,
      s.ip,
      s.created_at,
      s.refreshed_at,
      s.updated_at,
      s.not_after,
      sr.user_agent,
      sr.ip_address,
      sr.city,
      sr.country,
      sr.device_type,
      sr.device_name,
      sr.browser_name,
      sr.browser_version,
      sr.os_name,
      sr.os_version,
      sr.last_seen_at
    order by "authLastSeenAt" desc
    limit 1001
  `);
  const activityPromise = getPrisma().auditLog.findMany({
    take: 200,
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { fullName: true, email: true } } },
  });
  const accountsPromise = getPrisma().hrEmployee.findMany({
    select: {
      id: true,
      fullName: true,
      email: true,
      department: true,
      position: true,
      profilePhotoUrl: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          authUserId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          roles: { select: { role: { select: { id: true, name: true, code: true } } } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
    take: 501,
  });
  const roleOptionsPromise = getPrisma().role.findMany({
    where: { OR: [{ code: null }, { code: { notIn: [AppRole.SUPER_ADMIN, AppRole.ADMIN] } }] },
    select: { id: true, name: true, code: true },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    take: 100,
  });
  const [sessionRows, activityLogs, accountRows, accountRoleOptions] = await Promise.all([
    sessionsPromise,
    activityPromise,
    accountsPromise,
    roleOptionsPromise,
  ]);
  const generatedAt = new Date();
  const truncated = sessionRows.length > 1_000;
  const sessions = sessionRows
    .slice(0, 1_000)
    .map((row) => mapSession(row, actor.currentSessionId));
  const accounts = buildAccounts(accountRows.slice(0, 500), sessions, actor.id);
  const users = buildSessionUsers(sessions, accounts);
  const recentThreshold = generatedAt.getTime() - 15 * 60_000;

  return {
    generatedAt: generatedAt.toISOString(),
    truncated,
    canViewAll,
    canViewAudit,
    currentUserId: actor.id,
    currentSessionId: actor.currentSessionId,
    sessions,
    users,
    activity: activityLogs.map<AuditLogDto>((log) => ({
      id: log.id,
      actorName: log.actor?.fullName ?? "Sistem",
      actorEmail: log.actor?.email ?? null,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      reason: log.reason,
      before: log.beforeJson,
      after: log.afterJson,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt.toISOString(),
    })),
    accounts,
    accountRoleOptions: accountRoleOptions.map((role) => ({ id: role.id, name: role.name, code: role.code })),
    summary: {
      activeSessions: sessions.length,
      activeUsers: new Set(sessions.map((session) => session.userId)).size,
      mobileDevices: sessions.filter(
        (session) => session.deviceType === "MOBILE" || session.deviceType === "TABLET",
      ).length,
      recentlyActive: sessions.filter(
        (session) => new Date(session.lastSeenAt).getTime() >= recentThreshold,
      ).length,
    },
  };
}

function buildAccounts(
  rows: SecurityAccountRow[],
  sessions: AuthSessionDto[],
  actorId: string,
): SecurityAccountDto[] {
  const sessionSummary = new Map<string, { count: number; lastSeenAt: string | null }>();
  for (const session of sessions) {
    const current = sessionSummary.get(session.userId) ?? { count: 0, lastSeenAt: null };
    current.count += 1;
    if (!current.lastSeenAt || session.lastSeenAt > current.lastSeenAt) current.lastSeenAt = session.lastSeenAt;
    sessionSummary.set(session.userId, current);
  }
  return rows.map((employee) => {
    const user = employee.user;
    const summary = user ? sessionSummary.get(user.id) : undefined;
    const roles = user?.roles.map(({ role }) => ({ id: role.id, name: role.name, code: role.code })) ?? [];
    return {
      employeeId: employee.id,
      userId: user?.id ?? null,
      fullName: employee.fullName,
      profilePhotoUrl: employee.profilePhotoUrl,
      contactEmail: employee.email,
      loginEmail: user?.email ?? null,
      department: employee.department,
      position: employee.position,
      roles,
      status: !user?.authUserId ? "NOT_CREATED" : user.isActive ? "ACTIVE" : "DISABLED",
      activeSessionCount: summary?.count ?? 0,
      lastSeenAt: summary?.lastSeenAt ?? null,
      createdAt: (user?.createdAt ?? employee.createdAt).toISOString(),
      updatedAt: (user?.updatedAt ?? employee.updatedAt).toISOString(),
      protectedRole: roles.some((role) => role.code === AppRole.SUPER_ADMIN || role.code === AppRole.ADMIN),
      isCurrent: user?.id === actorId,
    };
  });
}

function mapSession(row: AuthSessionRow, currentSessionId: string | null): AuthSessionDto {
  const parsed = parseSessionDevice(row.recordUserAgent ?? row.authUserAgent);
  const deviceType = isDeviceType(row.recordDeviceType)
    ? row.recordDeviceType
    : parsed.deviceType;

  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    userRole: normalizeRoleNames(row.roleNames)[0] ?? "İstifadəçi",
    department: row.department,
    position: row.position,
    deviceType,
    deviceName: row.recordDeviceName ?? parsed.deviceName,
    browserName: row.recordBrowserName ?? parsed.browserName,
    browserVersion: row.recordBrowserVersion ?? parsed.browserVersion,
    osName: row.recordOsName ?? parsed.osName,
    osVersion: row.recordOsVersion ?? parsed.osVersion,
    ipAddress: row.recordIpAddress ?? row.authIpAddress,
    city: row.recordCity,
    country: row.recordCountry,
    startedAt: row.authStartedAt.toISOString(),
    lastSeenAt: row.authLastSeenAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    isCurrent: row.id === currentSessionId,
  };
}

function normalizeRoleNames(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isDeviceType(value: string | null): value is SessionDeviceTypeDto {
  return value === "DESKTOP" || value === "MOBILE" || value === "TABLET" || value === "UNKNOWN";
}
