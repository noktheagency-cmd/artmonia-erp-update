import assert from "node:assert/strict";
import test from "node:test";
import { syncTeacherAccountLink } from "./teacher-account-link";

function teacherDb(initialUserId: string | null, otherTeacherId: string | null = null) {
  const updates: Array<string | null> = [];
  const db = {
    teacher: {
      async findUnique() {
        return { id: "teacher-1", userId: initialUserId };
      },
      async findFirst() {
        return otherTeacherId ? { id: otherTeacherId } : null;
      },
      async update(args: {
        where: { id: string };
        data: { userId: string | null };
        select: { id: true; userId: true };
      }) {
        updates.push(args.data.userId);
        return { id: args.where.id, userId: args.data.userId };
      },
    },
  };
  return { db, updates };
}

test("TEACHER rolu veriləndə ERP hesabını əməkdaşın müəllim profilinə bağlayır", async () => {
  const { db, updates } = teacherDb(null);
  const result = await syncTeacherAccountLink(db, {
    teacherId: "teacher-1",
    userId: "user-1",
    hasTeacherRole: true,
  });

  assert.deepEqual(result, { teacherId: "teacher-1", linked: true, changed: true });
  assert.deepEqual(updates, ["user-1"]);
});

test("eyni bağlantını təkrar yazmadan idempotent saxlayır", async () => {
  const { db, updates } = teacherDb("user-1");
  const result = await syncTeacherAccountLink(db, {
    teacherId: "teacher-1",
    userId: "user-1",
    hasTeacherRole: true,
  });

  assert.deepEqual(result, { teacherId: "teacher-1", linked: true, changed: false });
  assert.deepEqual(updates, []);
});

test("TEACHER rolu silinəndə yalnız həmin hesabın müəllim bağlantısını ayırır", async () => {
  const { db, updates } = teacherDb("user-1");
  const result = await syncTeacherAccountLink(db, {
    teacherId: "teacher-1",
    userId: "user-1",
    hasTeacherRole: false,
  });

  assert.deepEqual(result, { teacherId: "teacher-1", linked: false, changed: true });
  assert.deepEqual(updates, [null]);
});

test("müəllim profili olmayan əməkdaşa TEACHER rolu verilməsini rədd edir", async () => {
  const { db } = teacherDb(null);
  await assert.rejects(
    syncTeacherAccountLink(db, {
      teacherId: null,
      userId: "user-1",
      hasTeacherRole: true,
    }),
    /əvvəlcə əməkdaşın müəllim profili yaradılmalıdır/,
  );
});

test("başqa hesaba və ya müəllimə bağlı ziddiyyətli əlaqəni rədd edir", async () => {
  const occupied = teacherDb("user-2");
  await assert.rejects(
    syncTeacherAccountLink(occupied.db, {
      teacherId: "teacher-1",
      userId: "user-1",
      hasTeacherRole: true,
    }),
    /başqa ERP hesabına bağlıdır/,
  );

  const duplicated = teacherDb(null, "teacher-2");
  await assert.rejects(
    syncTeacherAccountLink(duplicated.db, {
      teacherId: "teacher-1",
      userId: "user-1",
      hasTeacherRole: true,
    }),
    /başqa müəllim profilinə bağlıdır/,
  );
});
