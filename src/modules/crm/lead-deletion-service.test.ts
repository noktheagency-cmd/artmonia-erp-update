import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import type { ErpActor } from "@/server/auth/actor";
import type { PermissionScope } from "@/server/rbac/permissions";
import { deleteLeadWithPlans } from "./lead-deletion-service";

const leadId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";
const date = new Date("2026-10-25T09:00:00.000Z");
const input = { leadId, reason: "  Səhv yaradılmış müraciət  " };

function actor(scope?: PermissionScope): ErpActor {
  return {
    id: actorId, authUserId: null, currentSessionId: null, profilePhotoUrl: null,
    fullName: "Test", email: "test@example.com", roles: [],
    permissions: new Map(scope ? [["crm.lead.delete", scope]] : []),
  };
}

function plan(id: string) {
  return {
    id, leadId, ownerId: actorId, kind: "FOLLOW_UP", source: "PRIMARY", plannedAt: date,
    createdAt: date, completedAt: null as Date | null, completedById: null as string | null,
    cancelledAt: null as Date | null, result: null as string | null, isLegacy: false,
  };
}

function fixture(options: {
  managerId?: string;
  facts?: Partial<{ contactEvents: number; appointments: number; courseSales: number }>;
  converted?: boolean;
  registered?: boolean;
  missing?: boolean;
  workItems?: ReturnType<typeof plan>[];
  taskDone?: boolean;
  changedPlanCount?: number;
  auditFails?: boolean;
} = {}) {
  const workItems = options.workItems ?? [];
  const tasks = options.taskDone === undefined ? [] : [{
    id: "task-1", entityType: "lead", entityId: leadId, status: options.taskDone ? "DONE" : "OPEN",
    completedAt: options.taskDone ? date : null, dueAt: date, createdAt: date, updatedAt: date,
  }];
  const calls: string[] = [];
  const writes: Array<{ table: string; data: Record<string, unknown> }> = [];
  const lead = {
    id: leadId, contactId: "contact-1", managerId: options.managerId ?? actorId,
    stage: options.registered ? "REGISTERED" : "NURTURE", source: "Manual",
    convertedStudentId: options.converted ? "student-1" : null,
    nextFollowUpAt: date, nextActionType: "FOLLOW_UP", createdAt: date, updatedAt: date,
    contact: { fullName: "Test müraciət", phoneDisplay: "0500000000" },
    _count: { contactEvents: 0, appointments: 0, courseSales: 0,
      workItems: workItems.length, stageHistory: 1, ...options.facts },
  };
  const tx = {
    $queryRaw: async () => { calls.push("lock"); return [{ id: leadId }]; },
    lead: {
      findUnique: async () => { calls.push("read-lead"); return options.missing ? null : lead; },
      delete: async ({ where }: { where: Record<string, unknown> }) => { writes.push({ table: "lead", data: where }); },
    },
    leadWorkItem: {
      findMany: async () => workItems,
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        writes.push({ table: "workItems", data: where });
        return { count: options.changedPlanCount ?? workItems.length };
      },
    },
    leadStageHistory: { findMany: async () => [{ id: "stage-1", newStage: "NURTURE", createdAt: date }] },
    task: {
      findMany: async () => tasks,
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => { writes.push({ table: "tasks", data: where }); return { count: tasks.length }; },
    },
    contact: { deleteMany: async ({ where }: { where: Record<string, unknown> }) => { writes.push({ table: "contact", data: where }); return { count: 0 }; } },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => {
      if (options.auditFails) throw new Error("Audit unavailable");
      writes.push({ table: "audit", data });
    } },
  } as unknown as Prisma.TransactionClient;
  return { tx, calls, writes };
}

test("open and replanned reminders do not prevent deletion; their snapshots and reason are audited", async () => {
  const old = { ...plan("plan-old"), cancelledAt: date, result: "REPLANNED", isLegacy: true };
  const current = plan("plan-current");
  const { tx, calls, writes } = fixture({ workItems: [old, current], taskDone: false });
  await deleteLeadWithPlans(tx, input, actor("ASSIGNED"));
  assert.deepEqual(calls, ["lock", "read-lead"]);
  assert.deepEqual(writes.map((row) => row.table), ["audit", "workItems", "tasks", "lead", "contact"]);
  const audit = writes[0].data;
  assert.equal(audit.action, "lead.delete");
  assert.equal(audit.actorUserId, actorId);
  assert.equal(audit.reason, input.reason.trim());
  const before = audit.beforeJson as { workItems: Array<{ result: string | null; plannedAt: string }>; stageHistory: unknown[]; tasks: unknown[] };
  assert.equal(before.workItems.length, 2);
  assert.equal(before.workItems[0].result, "REPLANNED");
  assert.equal(before.workItems[1].plannedAt, date.toISOString());
  assert.equal(before.stageHistory.length, 1);
  assert.equal(before.tasks.length, 1);
  assert.equal(writes[1].data.completedAt, null);
  assert.equal(writes[1].data.completedById, null);
});

test("leads without work items remain deletable", async () => {
  const { tx, writes } = fixture();
  await deleteLeadWithPlans(tx, input, actor("ALL"));
  assert.equal(writes.filter((row) => row.table === "lead").length, 1);
});

test("update permission alone does not authorize deletion", async () => {
  const editor = actor();
  editor.permissions.set("crm.lead.update", "ALL");
  const { tx, calls, writes } = fixture();
  await assert.rejects(deleteLeadWithPlans(tx, input, editor), /Missing permission/);
  assert.equal(calls.length, 0);
  assert.equal(writes.length, 0);
});

test("assigned deletion cannot remove another manager's lead even with ALL read access", async () => {
  const editor = actor("ASSIGNED");
  editor.permissions.set("crm.lead.read", "ALL");
  const { tx, writes } = fixture({ managerId: "other-manager" });
  await assert.rejects(deleteLeadWithPlans(tx, input, editor), /icazəniz yoxdur/);
  assert.equal(writes.length, 0);
});

for (const options of [
  { facts: { contactEvents: 1 } }, { facts: { appointments: 1 } },
  { facts: { courseSales: 1 } }, { converted: true }, { registered: true },
]) {
  test(`factual or student/sale-linked lead is preserved: ${JSON.stringify(options)}`, async () => {
    const { tx, writes } = fixture(options);
    await assert.rejects(deleteLeadWithPlans(tx, input, actor("ALL")), /silinə bilməz/);
    assert.equal(writes.length, 0);
  });
}

for (const work of [
  { ...plan("completed"), completedAt: date, result: "DONE" },
  { ...plan("completer"), completedById: actorId },
  { ...plan("result"), result: "TALKED" },
  { ...plan("legacy"), isLegacy: true, completedAt: date },
]) {
  test(`completed work remains protected: ${work.id}`, async () => {
    const { tx, writes } = fixture({ workItems: [work] });
    await assert.rejects(deleteLeadWithPlans(tx, input, actor("ALL")), /tamamlanmış/);
    assert.equal(writes.length, 0);
  });
}

test("completed legacy tasks also block deletion", async () => {
  const { tx, writes } = fixture({ taskDone: true });
  await assert.rejects(deleteLeadWithPlans(tx, input, actor("ALL")), /tamamlanmış/);
  assert.equal(writes.length, 0);
});

test("audit failure aborts before any child or lead deletion", async () => {
  const { tx, writes } = fixture({ workItems: [plan("open")], auditFails: true });
  await assert.rejects(deleteLeadWithPlans(tx, input, actor("ALL")), /Audit unavailable/);
  assert.equal(writes.length, 0);
});

test("a concurrently completed plan aborts the transaction before deleting its lead", async () => {
  const { tx, writes } = fixture({ workItems: [plan("open")], changedPlanCount: 0 });
  await assert.rejects(deleteLeadWithPlans(tx, input, actor("ALL")), /planı dəyişib/);
  assert.equal(writes.some((row) => row.table === "lead"), false);
});

test("contact cleanup keeps shared and fact-referenced contacts", async () => {
  const { tx, writes } = fixture();
  await deleteLeadWithPlans(tx, input, actor("ALL"));
  const cleanup = writes.find((row) => row.table === "contact")!.data;
  for (const relation of ["leads", "students", "teacherProfiles", "studentRelationships", "factualLeadContacts"]) {
    assert.deepEqual(cleanup[relation], { none: {} });
  }
});

test("missing leads and blank reasons never write data", async () => {
  const missing = fixture({ missing: true });
  await assert.rejects(deleteLeadWithPlans(missing.tx, input, actor("ALL")), /tapılmadı/);
  assert.equal(missing.writes.length, 0);
  const blank = fixture();
  await assert.rejects(deleteLeadWithPlans(blank.tx, { ...input, reason: "  " }, actor("ALL")), /açıqlaması/);
  assert.equal(blank.calls.length, 0);
});
