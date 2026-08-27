import assert from "node:assert/strict";
import test from "node:test";
import type { AuthSessionDto, SecurityAccountDto } from "@/modules/audit/session-types";
import { buildSessionUsers } from "@/modules/audit/session-users";

test("active accounts remain visible when they have no sessions", () => {
  const users = buildSessionUsers([], [account({
    userId: "user-anel",
    fullName: "Anel Abışova",
    loginEmail: "anel@artmonia.com",
    roles: [{ id: "role-finance", name: "Mühasib", code: "FINANCE" }],
  })]);

  assert.deepEqual(users, [{
    id: "user-anel",
    fullName: "Anel Abışova",
    email: "anel@artmonia.com",
    role: "Mühasib",
    department: "Maliyyə",
    position: "Mühasib",
    activeSessionCount: 0,
    lastSeenAt: null,
  }]);
});

test("session counts are merged with canonical account identity", () => {
  const users = buildSessionUsers([
    session({ id: "session-1", userId: "user-ayshen", lastSeenAt: "2026-08-28T09:00:00.000Z" }),
    session({ id: "session-2", userId: "user-ayshen", lastSeenAt: "2026-08-28T10:00:00.000Z" }),
  ], [account({
    userId: "user-ayshen",
    fullName: "Ayşən Bəndəlieyva",
    loginEmail: "ayshen@artmonia.com",
    department: "Satış",
    position: "Satış meneceri",
    roles: [{ id: "role-sales", name: "Satış təmsilçisi", code: "SALES" }],
  })]);

  assert.equal(users.length, 1);
  assert.equal(users[0]?.fullName, "Ayşən Bəndəlieyva");
  assert.equal(users[0]?.email, "ayshen@artmonia.com");
  assert.equal(users[0]?.role, "Satış təmsilçisi");
  assert.equal(users[0]?.activeSessionCount, 2);
  assert.equal(users[0]?.lastSeenAt, "2026-08-28T10:00:00.000Z");
});

test("disabled and not-created accounts are not added to the session rail", () => {
  const users = buildSessionUsers([], [
    account({ userId: "user-disabled", status: "DISABLED" }),
    account({ userId: null, status: "NOT_CREATED" }),
  ]);

  assert.deepEqual(users, []);
});

function session(overrides: Partial<AuthSessionDto> = {}): AuthSessionDto {
  return {
    id: "session-default",
    userId: "user-default",
    userName: "Köhnə ad",
    userEmail: "old@example.com",
    userRole: "Köhnə rol",
    department: null,
    position: null,
    deviceType: "DESKTOP",
    deviceName: "Windows kompüter",
    browserName: "Chrome",
    browserVersion: "140",
    osName: "Windows",
    osVersion: "11",
    ipAddress: null,
    city: null,
    country: null,
    startedAt: "2026-08-28T08:00:00.000Z",
    lastSeenAt: "2026-08-28T08:00:00.000Z",
    expiresAt: null,
    isCurrent: false,
    ...overrides,
  };
}

function account(overrides: Partial<SecurityAccountDto> = {}): SecurityAccountDto {
  return {
    employeeId: "employee-default",
    userId: "user-default",
    fullName: "Test əməkdaş",
    profilePhotoUrl: null,
    contactEmail: "contact@example.com",
    loginEmail: "login@example.com",
    department: "Maliyyə",
    position: "Mühasib",
    roles: [],
    status: "ACTIVE",
    activeSessionCount: 0,
    lastSeenAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    protectedRole: false,
    isCurrent: false,
    ...overrides,
  };
}
