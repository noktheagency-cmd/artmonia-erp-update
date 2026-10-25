import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@/generated/prisma/client";
import { setActivationBillingAnchor } from "./activation-billing-anchor";

for (const fail of [false, true]) {
  test(`activation sets actor and restores the protected-anchor guard (failure=${fail})`, async () => {
    let allow = "off", actor = "previous";
    const tx = {
      $queryRaw: async (sql: Prisma.Sql) => {
        if (sql.sql.includes("current_setting")) return [{ allow, actor }];
        if (sql.sql.includes("'on'")) { allow = "on"; actor = String(sql.values[0]); }
        else { allow = String(sql.values[0]); actor = String(sql.values[1]); }
        return [];
      },
      student: { update: async () => {
        assert.equal(allow, "on"); assert.equal(actor, "activating-actor");
        if (fail) throw new Error("write failed");
      } },
    } as unknown as Prisma.TransactionClient;
    const result = setActivationBillingAnchor(tx, { studentId: "student", lessonDate: new Date("2026-10-04"), actorId: "activating-actor" });
    if (fail) await assert.rejects(result, /write failed/); else await result;
    assert.equal(allow, "off"); assert.equal(actor, "previous");
  });
}
