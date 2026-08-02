import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@/generated/prisma/client";
import { persistStandaloneUser } from "./standalone-user-service";

test("standalone ERP profili HR əməkdaşı yaratmadan saxlanılır", async () => {
  const calls: string[] = [];
  const userId = "11111111-1111-4111-8111-111111111111";
  const roleId = "22222222-2222-4222-8222-222222222222";

  const db = {
    user: {
      async create(args: {
        data: Prisma.UserUncheckedCreateInput;
        select: { id: true; email: true };
      }) {
        calls.push("user.create");
        assert.deepEqual(args.data, {
          authUserId: "33333333-3333-4333-8333-333333333333",
          fullName: "investor@example.com",
          email: "investor@example.com",
          isActive: true,
        });
        return { id: userId, email: String(args.data.email) };
      },
    },
    userRole: {
      async create(args: { data: Prisma.UserRoleUncheckedCreateInput }) {
        calls.push("userRole.create");
        assert.deepEqual(args.data, { userId, roleId });
        return args.data;
      },
    },
    auditLog: {
      async create(args: { data: Prisma.AuditLogUncheckedCreateInput }) {
        calls.push("auditLog.create");
        assert.equal(
          (args.data.afterJson as { hrEmployeeCreated?: boolean }).hrEmployeeCreated,
          false,
        );
        return args.data;
      },
    },
  };

  const result = await persistStandaloneUser(db, {
    authUserId: "33333333-3333-4333-8333-333333333333",
    email: "investor@example.com",
    role: { id: roleId, name: "Investor" },
    actorUserId: "44444444-4444-4444-8444-444444444444",
  });

  assert.deepEqual(result, { id: userId, email: "investor@example.com" });
  assert.deepEqual(calls, ["user.create", "userRole.create", "auditLog.create"]);
  assert.equal("hrEmployee" in db, false);
});
