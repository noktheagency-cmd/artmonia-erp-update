import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@/generated/prisma/client";
import {
  leadHadMeetingAttendedSql,
  leadHadMeetingScheduledSql,
  leadHadRealContactSql,
} from "./contact-metrics-sql";

function sqlText(fragment: Prisma.Sql) {
  return [...fragment.strings].join("?");
}

test("BK-19/16 SQL helpers emit factual event predicates", () => {
  assert.match(sqlText(leadHadRealContactSql()), /lead_contact_events/);
  assert.match(sqlText(leadHadRealContactSql()), /WHATSAPP_REPLIED/);
  assert.match(sqlText(leadHadMeetingScheduledSql()), /crm_appointments/);
  assert.match(sqlText(leadHadMeetingAttendedSql()), /ATTENDED/);
});
