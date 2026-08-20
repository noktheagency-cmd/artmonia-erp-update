export type SessionDeviceTypeDto = "DESKTOP" | "MOBILE" | "TABLET" | "UNKNOWN";

export type AuthSessionDto = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  department: string | null;
  position: string | null;
  deviceType: SessionDeviceTypeDto;
  deviceName: string;
  browserName: string;
  browserVersion: string | null;
  osName: string;
  osVersion: string | null;
  ipAddress: string | null;
  city: string | null;
  country: string | null;
  startedAt: string;
  lastSeenAt: string;
  expiresAt: string | null;
  isCurrent: boolean;
};

export type SessionUserDto = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  department: string | null;
  position: string | null;
  activeSessionCount: number;
  lastSeenAt: string | null;
};

export type AuditLogDto = {
  id: string;
  actorName: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  createdAt: string;
};

export type SecurityAccountDto = {
  employeeId: string;
  userId: string | null;
  fullName: string;
  profilePhotoUrl: string | null;
  contactEmail: string | null;
  loginEmail: string | null;
  department: string;
  position: string;
  roles: Array<{ id: string; name: string; code: string | null }>;
  status: "ACTIVE" | "DISABLED" | "NOT_CREATED";
  activeSessionCount: number;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
  protectedRole: boolean;
  isCurrent: boolean;
};

export type SecurityRoleOptionDto = {
  id: string;
  name: string;
  code: string | null;
};

export type SessionAuditData = {
  generatedAt: string;
  truncated: boolean;
  canViewAll: boolean;
  canViewAudit: boolean;
  currentUserId: string;
  currentSessionId: string | null;
  sessions: AuthSessionDto[];
  users: SessionUserDto[];
  activity: AuditLogDto[];
  accounts: SecurityAccountDto[];
  accountRoleOptions: SecurityRoleOptionDto[];
  summary: {
    activeSessions: number;
    activeUsers: number;
    mobileDevices: number;
    recentlyActive: number;
  };
};

export type RevokeSessionsResult =
  | { ok: true; revokedSessionIds: string[]; signedOut: boolean }
  | {
      ok: false;
      code: "VALIDATION" | "FORBIDDEN" | "NOT_FOUND" | "UNKNOWN";
      message: string;
    };
