import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { reconcileStudentAfterAttendanceCorrection } from "./attendance-correction-service";
import { resolveFirstLessonActivationWarning, FIRST_LESSON_ABSENT_WARNING } from "./activation-from-attendance";
import { studentAttendanceRisks, type AttendanceEntry } from "./attendance-analytics";

const input = { studentId: "student-1", actorId: "actor-1", lessonDate: new Date("2026-10-21") };
function fixture(options: { status?: string; present?: boolean; waitingAt?: Date } = {}) {
  const writes: Array<{ kind: string; args: unknown }> = [];
  let status = options.status ?? "ACTIVE";
  let presentQuery: unknown;
  const tx = {
    student: {
      findUnique: async () => ({ lifecycleStatus: status, billingPaused: status !== "ACTIVE" }),
      update: async (args: { data: { lifecycleStatus: string } }) => { writes.push({ kind: "student", args }); status = args.data.lifecycleStatus; },
    },
    studentStatusHistory: {
      findFirst: async () => options.waitingAt ? { effectiveAt: options.waitingAt } : null,
      create: async (args: unknown) => { writes.push({ kind: "history", args }); },
    },
    attendanceRecord: { findFirst: async (args: unknown) => { presentQuery = args; return options.present ? { id: "other-present" } : null; } },
    enrollment: { updateMany: async (args: unknown) => { writes.push({ kind: "enrollment", args }); } },
    payment: { updateMany: async (args: unknown) => { writes.push({ kind: "schedule", args }); } },
    auditLog: { create: async (args: unknown) => { writes.push({ kind: "audit", args }); } },
  } as unknown as Prisma.TransactionClient;
  return { tx, writes, status: () => status, query: () => presentQuery };
}

test("removing the only PRESENT restores waiting, pauses billing and exposes the first-absence warning", async () => {
  const f = fixture();
  assert.equal(await reconcileStudentAfterAttendanceCorrection(f.tx, input), true);
  assert.equal(f.status(), "SLOT_WAITING");
  assert.deepEqual(f.writes.find(w => w.kind === "student")?.args, { where: { id: input.studentId }, data: { lifecycleStatus: "SLOT_WAITING", billingPaused: true, freezeReserved: false } });
  assert.equal(resolveFirstLessonActivationWarning({ lifecycleStatus: f.status(), plannedFirstLessonAt: input.lessonDate, firstLessonAbsent: true }), FIRST_LESSON_ABSENT_WARNING);
  assert.deepEqual(f.writes.map(w => w.kind), ["student", "history", "enrollment", "schedule", "audit"]);
  const count = f.writes.length;
  assert.equal(await reconcileStudentAfterAttendanceCorrection(f.tx, input), false);
  assert.equal(f.writes.length, count, "repeating reconciliation does not append another transition");
});

test("other real presence keeps the student ACTIVE when a later or earlier mark is corrected", async () => {
  const f = fixture({ present: true });
  assert.equal(await reconcileStudentAfterAttendanceCorrection(f.tx, input), false);
  assert.equal(f.status(), "ACTIVE");
  assert.deepEqual(f.writes, []);
});

test("old-cycle or cancelled presence cannot activate the current admission cycle", async () => {
  const waitingAt = new Date("2026-10-20");
  const f = fixture({ waitingAt });
  await reconcileStudentAfterAttendanceCorrection(f.tx, input);
  assert.deepEqual(f.query(), { where: { enrollment: { studentId: input.studentId }, status: "PRESENT", session: { status: { notIn: ["CANCELLED", "RESCHEDULED"] }, sessionDate: { gte: waitingAt } } }, select: { id: true } });
});

test("attendance corrections never overwrite frozen or terminal lifecycle states", async () => {
  for (const status of ["FROZEN", "STOPPED", "COMPLETED", "DECLINED", "SLOT_WAITING"]) {
    const f = fixture({ status });
    assert.equal(await reconcileStudentAfterAttendanceCorrection(f.tx, input), false);
    assert.deepEqual(f.writes, []);
  }
});

test("correcting an older admission's attendance cannot reverse the current admission", async () => {
  const f = fixture({ waitingAt: new Date("2026-10-25") });
  assert.equal(await reconcileStudentAfterAttendanceCorrection(f.tx, input), false);
  assert.deepEqual(f.writes, []);
  assert.equal(f.query(), undefined);
});

test("correcting a later presence to absent yields yellow risk at two consecutive absences without losing activation", async () => {
  const f = fixture({ present: true });
  await reconcileStudentAfterAttendanceCorrection(f.tx, input);
  const rows: AttendanceEntry[] = ["PRESENT", "ABSENT", "PRESENT"].map((status, index) => ({
    studentId: input.studentId, student: "Synthetic student", enrollmentId: "enrollment-1", teacherId: "teacher-1", teacher: "Synthetic teacher", groupId: "slot-1", group: "Synthetic slot", lifecycleStatus: f.status(),
    sessionId: `session-${index}`, date: `2026-10-${21 + index}`, time: "15:00", status: status as AttendanceEntry["status"],
  }));
  assert.equal(studentAttendanceRisks(rows).size, 0);
  rows[2].status = "ABSENT";
  const risk = studentAttendanceRisks(rows).get(input.studentId);
  assert.equal(risk?.level, "warning"); assert.equal(risk?.streak, 2);
  assert.equal(f.status(), "ACTIVE");
});
