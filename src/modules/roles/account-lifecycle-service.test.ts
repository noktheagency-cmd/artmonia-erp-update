import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma, PrismaClient, AppRole } from "@/generated/prisma/client";
import type { ErpActor } from "@/server/auth/actor";
import { accountLifecycleSchema, type AccountLifecycleInput } from "./account-lifecycle-policy";
import { changeAccountLifecycle, pendingAccountLifecycle, type AccountAuthProvider } from "./account-lifecycle-service";

const userId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";
const authId = "00000000-0000-4000-8000-000000000003";
const requestKey = "00000000-0000-4000-8000-000000000004";
const roleId = "00000000-0000-4000-8000-000000000005";
const initialTime = "2026-10-25T09:00:00.000Z";
const input: AccountLifecycleInput = { userId, requestKey, operation: "DISABLE", expectedUpdatedAt: initialTime, reason: "Test hesabı üzrə əməliyyat" };

function actor(): ErpActor {
  return { id: actorId, authUserId: null, currentSessionId: null, fullName: "Test", email: "test@example.com", profilePhotoUrl: null, roles: [],
    permissions: new Map([["auth.user.read", "ALL"], ["auth.user.status.change", "ALL"], ["auth.user.delete", "ALL"]]) };
}

type Log = { id: string; action: string; entityId: string; entityType: string; reason: string; afterJson: Record<string, unknown> };
function fixture(options: { protectedRole?: AppRole; active?: boolean; archived?: boolean; inactiveEmployee?: boolean; missingAuth?: boolean; sharedMobileAuth?: boolean; initialAuditFails?: boolean; finalAuditFails?: boolean } = {}) {
  let tick = 0;
  let state = {
    user: { id: userId, authUserId: options.missingAuth ? null as string | null : authId as string | null,
      updatedAt: new Date(initialTime), isActive: options.active ?? true,
      roles: [{ roleId, role: { id: roleId, code: (options.protectedRole ?? "SALES") as AppRole | null, name: "Test rolu" } }],
      hrEmployeeProfile: { id: "employee-1", status: options.inactiveEmployee ? "INACTIVE" : "ACTIVE", archivedAt: options.archived ? new Date(initialTime) : null as Date | null } },
    logs: [] as Log[],
    sessions: [{ id: "target-session", authUserId: authId }, { id: "actor-session", authUserId: "actor-auth" }],
    records: [{ userId, revokedAt: null as Date | null }, { userId: actorId, revokedAt: null as Date | null }],
    hrHistory: { payroll: 250, saleIds: ["sale-old"], employeeId: "employee-1" },
  };
  const providerCalls: Array<{ authUserId: string; operation: string }> = [];
  let providerError: { status?: number; code?: string } | null = null;
  let providerThrows = false;
  let onProvider: (() => Promise<void>) | null = null;
  const tx = {
    $queryRaw: async () => [{ id: userId }],
    $executeRaw: async (_strings: TemplateStringsArray, value: string) => {
      state.sessions = state.sessions.filter((session) => session.authUserId !== value);
      return 1;
    },
    user: {
      findUnique: async () => structuredClone(state.user),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.user, data, { updatedAt: new Date(Date.parse(initialTime) + (++tick) * 1000) });
        return structuredClone(state.user);
      },
    },
    userRole: { deleteMany: async () => { state.user.roles = []; return { count: 1 }; } },
    studentMobileAccount: { findUnique: async () => options.sharedMobileAuth ? { id: "mobile-1" } : null },
    authSessionRecord: { updateMany: async ({ where, data }: { where: { userId: string }; data: { revokedAt: Date } }) => {
      for (const record of state.records) if (record.userId === where.userId && !record.revokedAt) record.revokedAt = data.revokedAt;
      return { count: 1 };
    } },
    auditLog: {
      findFirst: async ({ where }: { where: { action: string; entityId: string; afterJson?: { equals: string } } }) =>
        [...state.logs].reverse().find((row) => row.action === where.action && row.entityId === where.entityId
          && (!where.afterJson || row.afterJson.requestKey === where.afterJson.equals)) ?? null,
      create: async ({ data }: { data: Log }) => {
        if ((options.initialAuditFails && data.action.endsWith(".request")) || (options.finalAuditFails && data.action.endsWith(".complete"))) throw new Error("Audit unavailable");
        state.logs.push({ ...data, id: `log-${state.logs.length}` });
        return data;
      },
    },
  } as unknown as Prisma.TransactionClient;
  let queue: Promise<void> = Promise.resolve();
  const db = { $transaction: async <T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) => {
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const snapshot = structuredClone(state);
    try { return await operation(tx); }
    catch (error) { state = snapshot; throw error; }
    finally { release(); }
  } } as unknown as PrismaClient;
  const provider: AccountAuthProvider = { apply: async (authUserId, operation) => {
    providerCalls.push({ authUserId, operation });
    assert.equal(state.user.isActive, false, "ERP must be closed before the provider is called");
    assert.equal(state.sessions.some((row) => row.authUserId === authId), false);
    if (onProvider) await onProvider();
    if (providerThrows) throw new Error("Provider timeout");
    return { error: providerError };
  } };
  return { db, tx, provider, providerCalls, options, state: () => state,
    setProviderError: (value: typeof providerError) => { providerError = value; },
    setProviderThrows: (value: boolean) => { providerThrows = value; },
    setOnProvider: (value: () => Promise<void>) => { onProvider = value; } };
}

test("account lifecycle inputs require a reason, UUID and a valid operation", () => {
  assert.equal(accountLifecycleSchema.safeParse(input).success, true);
  for (const patch of [{ reason: " " }, { userId: "bad" }, { requestKey: "bad" }, { operation: "DROP" }]) {
    assert.equal(accountLifecycleSchema.safeParse({ ...input, ...patch }).success, false);
  }
});

test("disable closes only the target's sessions, keeps roles and leaves HR/sales history intact", async () => {
  const f = fixture();
  const originalHistory = structuredClone(f.state().hrHistory);
  const result = await changeAccountLifecycle(f.db, f.provider, actor(), input);
  assert.equal(result.isActive, false);
  assert.equal(result.hasLogin, true);
  assert.deepEqual(result.roleIds, [roleId]);
  assert.deepEqual(f.state().hrHistory, originalHistory);
  assert.deepEqual(f.state().sessions, [{ id: "actor-session", authUserId: "actor-auth" }]);
  assert.ok(f.state().records[0].revokedAt);
  assert.equal(f.state().records[1].revokedAt, null);
  assert.deepEqual(f.providerCalls, [{ authUserId: authId, operation: "DISABLE" }]);
});

test("enable opens ERP only after successful provider unban", async () => {
  const f = fixture({ active: false });
  const result = await changeAccountLifecycle(f.db, f.provider, actor(), { ...input, operation: "ENABLE" });
  assert.equal(result.isActive, true);
});

test("delete removes the Auth link and grants while retaining the ERP identity and HR history", async () => {
  const f = fixture();
  const result = await changeAccountLifecycle(f.db, f.provider, actor(), { ...input, operation: "DELETE" });
  assert.equal(result.userId, userId);
  assert.equal(result.hasLogin, false);
  assert.equal(result.isActive, false);
  assert.deepEqual(result.roleIds, []);
  assert.equal(f.state().hrHistory.employeeId, "employee-1");
  assert.deepEqual(f.state().hrHistory.saleIds, ["sale-old"]);
});

test("existing user-management permission does not substitute for the new lifecycle permission", async () => {
  const f = fixture();
  const current = actor();
  current.permissions = new Map([["auth.user.manage", "ALL"]]);
  await assert.rejects(changeAccountLifecycle(f.db, f.provider, current, input), /Missing permission/);
  assert.equal(f.state().user.isActive, true);
  assert.equal(f.providerCalls.length, 0);
});

test("self-disable and self-delete are denied", async () => {
  for (const operation of ["DISABLE", "DELETE"] as const) {
    const f = fixture();
    await assert.rejects(changeAccountLifecycle(f.db, f.provider, { ...actor(), id: userId }, { ...input, operation }), /Öz giriş/);
    assert.equal(f.providerCalls.length, 0);
  }
});

test("staff lifecycle actions do not alter a shared student mobile Auth identity", async () => {
  const f = fixture({ sharedMobileAuth: true });
  await assert.rejects(changeAccountLifecycle(f.db, f.provider, actor(), input), /mobil hesabı ilə paylaşılır/);
  assert.equal(f.state().user.isActive, true);
  assert.equal(f.state().logs.length, 0);
  assert.equal(f.providerCalls.length, 0);
});

for (const protectedRole of ["SUPER_ADMIN", "ADMIN", "OWNER"] as const) {
  test(`protected ${protectedRole} accounts cannot be modified through delegated rights`, async () => {
    const f = fixture({ protectedRole });
    await assert.rejects(changeAccountLifecycle(f.db, f.provider, actor(), input), /Qorunan/);
    assert.equal(f.state().logs.length, 0);
    assert.equal(f.providerCalls.length, 0);
  });
}

test("archived and inactive HR employees cannot be reactivated", async () => {
  for (const options of [{ archived: true }, { inactiveEmployee: true }]) {
    const f = fixture(options);
    await assert.rejects(changeAccountLifecycle(f.db, f.provider, actor(), { ...input, operation: "ENABLE" }), /bərpa edilə bilməz/);
    assert.equal(f.providerCalls.length, 0);
  }
});

test("stale account versions and profiles without a login are rejected before changes", async () => {
  const stale = fixture();
  await assert.rejects(changeAccountLifecycle(stale.db, stale.provider, actor(), { ...input, expectedUpdatedAt: "2026-10-24T09:00:00.000Z" }), /Profil dəyişib/);
  assert.equal(stale.state().logs.length, 0);
  const missing = fixture({ missingAuth: true });
  await assert.rejects(changeAccountLifecycle(missing.db, missing.provider, actor(), input), /giriş hesabı yoxdur/);
});

test("provider failure stays closed and resumes from its persisted request after a reload", async () => {
  const f = fixture();
  f.setProviderThrows(true);
  await assert.rejects(changeAccountLifecycle(f.db, f.provider, actor(), input), /ERP girişi bağlanıb/);
  assert.equal(f.state().user.isActive, false);
  assert.equal(f.state().logs.length, 1);
  const pending = await pendingAccountLifecycle(f.tx, userId);
  assert.equal(pending?.requestKey, input.requestKey);
  assert.equal(pending?.inputVersion, input.expectedUpdatedAt);
  f.setProviderThrows(false);
  const result = await changeAccountLifecycle(f.db, f.provider, actor(), input);
  assert.equal(result.isActive, false);
  assert.equal(await pendingAccountLifecycle(f.tx, userId), null);
});

test("a different operation cannot reopen a partially deleted account", async () => {
  const f = fixture();
  f.setProviderError({ status: 500 });
  await assert.rejects(changeAccountLifecycle(f.db, f.provider, actor(), { ...input, operation: "DELETE" }));
  await assert.rejects(changeAccountLifecycle(f.db, f.provider, actor(), {
    ...input, operation: "ENABLE", requestKey: "00000000-0000-4000-8000-000000000006", expectedUpdatedAt: f.state().user.updatedAt.toISOString(),
  }), /tamamlanmamış/);
  assert.equal(f.providerCalls.length, 1);
  assert.equal(f.state().user.isActive, false);
});

test("completed replays do not call the provider or affect a newly recreated login", async () => {
  const f = fixture();
  const deletion = { ...input, operation: "DELETE" as const };
  await changeAccountLifecycle(f.db, f.provider, actor(), deletion);
  f.state().user.authUserId = "00000000-0000-4000-8000-000000000007";
  f.state().user.isActive = true;
  const result = await changeAccountLifecycle(f.db, f.provider, actor(), deletion);
  assert.equal(result.replayed, true);
  assert.equal(result.hasLogin, true);
  assert.equal(result.isActive, true);
  assert.equal(f.providerCalls.length, 1);
});

test("reusing a request key with different content is rejected", async () => {
  const f = fixture();
  await changeAccountLifecycle(f.db, f.provider, actor(), input);
  for (const patch of [{ reason: "Fərqli səbəb" }, { operation: "DELETE" as const }]) {
    await assert.rejects(changeAccountLifecycle(f.db, f.provider, actor(), { ...input, ...patch }), /uyğun deyil/);
  }
  assert.equal(f.providerCalls.length, 1);
});

test("an already removed Auth user completes deletion, but cannot complete enable", async () => {
  const f = fixture();
  f.setProviderError({ status: 404, code: "user_not_found" });
  assert.equal((await changeAccountLifecycle(f.db, f.provider, actor(), { ...input, operation: "DELETE" })).hasLogin, false);
  const enable = fixture({ active: false });
  enable.setProviderError({ status: 404 });
  await assert.rejects(changeAccountLifecycle(enable.db, enable.provider, actor(), { ...input, operation: "ENABLE" }));
  assert.equal(enable.state().user.isActive, false);
});

test("initial audit failure rolls back closure and never calls the provider", async () => {
  const f = fixture({ initialAuditFails: true });
  await assert.rejects(changeAccountLifecycle(f.db, f.provider, actor(), input), /Audit unavailable/);
  assert.equal(f.state().user.isActive, true);
  assert.equal(f.state().sessions.length, 2);
  assert.equal(f.providerCalls.length, 0);
});

test("final database failure can retry Auth deletion safely without reopening access", async () => {
  const f = fixture({ finalAuditFails: true });
  const deletion = { ...input, operation: "DELETE" as const };
  await assert.rejects(changeAccountLifecycle(f.db, f.provider, actor(), deletion), /Audit unavailable/);
  assert.equal(f.state().user.isActive, false);
  assert.equal(f.state().user.authUserId, authId);
  assert.equal(f.state().user.roles.length, 1);
  f.options.finalAuditFails = false;
  f.setProviderError({ status: 404, code: "user_not_found" });
  assert.equal((await changeAccountLifecycle(f.db, f.provider, actor(), deletion)).hasLogin, false);
});

test("an unknown provider 404 is not treated as confirmed deletion", async () => {
  const f = fixture();
  f.setProviderError({ status: 404 });
  await assert.rejects(changeAccountLifecycle(f.db, f.provider, actor(), { ...input, operation: "DELETE" }));
  assert.equal(f.state().user.authUserId, authId);
  assert.equal(f.state().user.isActive, false);
});

test("concurrent duplicate delete completions are idempotent", async () => {
  const f = fixture();
  let inside = false;
  const deletion = { ...input, operation: "DELETE" as const };
  f.setOnProvider(async () => {
    if (inside) return;
    inside = true;
    await changeAccountLifecycle(f.db, f.provider, actor(), deletion);
  });
  const result = await changeAccountLifecycle(f.db, f.provider, actor(), deletion);
  assert.equal(result.hasLogin, false);
  assert.equal(result.replayed, true);
  assert.equal(f.state().logs.filter((row) => row.action.endsWith(".complete")).length, 1);
});

test("an Auth link changed during the provider call is never overwritten", async () => {
  const f = fixture();
  const replacement = "00000000-0000-4000-8000-000000000007";
  f.setOnProvider(async () => { f.state().user.authUserId = replacement; });
  await assert.rejects(changeAccountLifecycle(f.db, f.provider, actor(), { ...input, operation: "DELETE" }), /Yeni hesaba müdaxilə/);
  assert.equal(f.state().user.authUserId, replacement);
});
