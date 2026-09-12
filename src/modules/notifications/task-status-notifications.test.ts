import assert from "node:assert/strict";
import test from "node:test";
import { TaskStatus, type Prisma } from "@/generated/prisma/client";
import { createTaskStatusNotifications, taskStatusRecipientIds } from "./task-status-notifications";

const outsiderId = "11111111-1111-4111-8111-111111111111";
const base = {
  taskId: "22222222-2222-4222-8222-222222222222",
  taskTitle: "Test task",
  createdById: taskStatusRecipientIds[0] as string | null,
  previousStatus: TaskStatus.OPEN,
  status: TaskStatus.IN_PROGRESS,
  actorId: outsiderId,
  actorName: "Test əməkdaş",
};

function fixture(activeIds: readonly string[] = taskStatusRecipientIds) {
  const rows: Prisma.PersonalNotificationCreateManyInput[] = [];
  let lookups = 0;
  const db = {
    user: {
      async findMany(args: { where: { id: { in: string[] }; isActive: true }; select: { id: true } }) {
        lookups++;
        assert.deepEqual(args.where, { id: { in: [...taskStatusRecipientIds] }, isActive: true });
        return activeIds.filter((id) => args.where.id.in.includes(id)).map((id) => ({ id }));
      },
    },
    personalNotification: {
      async createMany(args: { data: Prisma.PersonalNotificationCreateManyInput[] }) {
        rows.push(...args.data);
        return { count: args.data.length };
      },
    },
  };
  return { db, rows, get lookups() { return lookups; } };
}

test("either designated creator: every actual status transition goes only to both profiles", async () => {
  for (const createdById of taskStatusRecipientIds) {
    for (const previousStatus of Object.values(TaskStatus)) {
      for (const status of Object.values(TaskStatus)) {
        if (previousStatus === status) continue;
        const f = fixture([...taskStatusRecipientIds, outsiderId]);
        const recipients = await createTaskStatusNotifications(f.db, { ...base, createdById, previousStatus, status });
        assert.deepEqual(recipients, [...taskStatusRecipientIds]);
        assert.equal(f.rows.length, 2);
        assert.equal(new Set(f.rows.map((row) => row.dedupeKey)).size, 2);
        for (const row of f.rows) {
          assert.equal(row.href, `/tasks?task=${base.taskId}`);
          assert.equal(row.taskId, base.taskId);
          assert.match(row.message, /Test task.*→.*Test əməkdaş/);
          assert.equal((row.metadata as { status: string }).status, status);
        }
      }
    }
  }
});

test("unchanged status and other/missing creators produce no notification", async () => {
  for (const change of [
    { ...base, status: base.previousStatus },
    { ...base, createdById: outsiderId },
    { ...base, createdById: null },
  ]) {
    const f = fixture();
    assert.deepEqual(await createTaskStatusNotifications(f.db, change), []);
    assert.equal(f.rows.length, 0);
    assert.equal(f.lookups, 0);
  }
});

test("inactive recipients are excluded; recipient's own changes still notify", async () => {
  const f = fixture([taskStatusRecipientIds[0]]);
  assert.deepEqual(await createTaskStatusNotifications(f.db, { ...base, actorId: taskStatusRecipientIds[0] }), [taskStatusRecipientIds[0]]);
  const empty = fixture([]);
  assert.deepEqual(await createTaskStatusNotifications(empty.db, base), []);
  assert.equal(empty.rows.length, 0);
});

test("returning to a previous status creates a new event rather than losing it to deduplication", async () => {
  const f = fixture();
  await createTaskStatusNotifications(f.db, base);
  await createTaskStatusNotifications(f.db, { ...base, previousStatus: base.status, status: base.previousStatus });
  await createTaskStatusNotifications(f.db, base);
  assert.equal(f.rows.length, 6);
  assert.equal(new Set(f.rows.map((row) => row.dedupeKey)).size, 6);
});

test("notification write failure propagates so the caller transaction can roll back", async () => {
  const f = fixture();
  f.db.personalNotification.createMany = async () => { throw new Error("write failed"); };
  await assert.rejects(createTaskStatusNotifications(f.db, base), /write failed/);
});
