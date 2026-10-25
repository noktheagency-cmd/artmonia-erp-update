import assert from "node:assert/strict";
import test from "node:test";
import type { EffectivePermissions } from "@/server/rbac/permissions";
import { bonusAwardReadWhere, bonusCampaignReadWhere, bonusParticipantReadWhere, canReadAllBonuses, visibleBonusValue } from "./bonus-access";
import { participantSalesMetricsSql } from "./bonus-metrics-sql";

const aggregate = { baseValue: 33, adjustmentValue: 2, currentValue: 35, scheduledValue: 0 };

test("ASSIGNED bonus access stays personal; ALL and campaign managers can see the team", () => {
  const permissions: EffectivePermissions = new Map([["hr.bonus.read", "ASSIGNED"]]);
  assert.equal(canReadAllBonuses(permissions), false);
  permissions.set("hr.bonus.read", "ALL");
  assert.equal(canReadAllBonuses(permissions), true);
  permissions.set("hr.bonus.read", "ASSIGNED");
  permissions.set("hr.bonus.manage", "ALL");
  assert.equal(canReadAllBonuses(permissions), true);
  permissions.delete("hr.bonus.read");
  assert.equal(canReadAllBonuses(permissions), false);
});

test("personal campaign access requires eligible membership, not merely the same department", () => {
  assert.deepEqual(bonusCampaignReadWhere(false, "employee-a"), {
    participants: { some: { employeeId: "employee-a", isEligible: true } },
  });
  assert.deepEqual(bonusParticipantReadWhere(false, "employee-a"), { employeeId: "employee-a", isEligible: true });
  assert.deepEqual(bonusAwardReadWhere(false, "employee-a"), {
    participant: { employeeId: "employee-a", isEligible: true },
  });
});

test("an unlinked user has an empty access predicate instead of department-wide access", () => {
  assert.deepEqual(bonusCampaignReadWhere(false), { participants: { some: { id: { in: [] } } } });
  assert.deepEqual(bonusParticipantReadWhere(false), { id: { in: [] } });
  assert.deepEqual(bonusAwardReadWhere(false), { participant: { id: { in: [] } } });
});

test("ALL access can read campaigns, participants, and awards without an employee link", () => {
  assert.deepEqual(bonusCampaignReadWhere(true), {});
  assert.deepEqual(bonusParticipantReadWhere(true), {});
  assert.deepEqual(bonusAwardReadWhere(true), {});
});

test("two sales managers receive their own different counts instead of the same aggregate", () => {
  const first = visibleBonusValue({ canSeeAll: false, metricKind: "DEPARTMENT_SALES_COUNT", aggregate, ownMetric: 7 });
  const second = visibleBonusValue({ canSeeAll: false, metricKind: "DEPARTMENT_SALES_COUNT", aggregate, ownMetric: 19 });
  assert.equal(first.currentValue, 7);
  assert.equal(second.currentValue, 19);
  assert.equal(first.metricScope, "PERSONAL");
  assert.equal(first.baseValue, 7);
  assert.equal(first.adjustmentValue, 0);
  assert.equal(aggregate.currentValue, 35);
});

test("a missing personal sale count remains zero and never falls back to the team's number", () => {
  const value = visibleBonusValue({ canSeeAll: false, metricKind: "DEPARTMENT_SALES_COUNT", aggregate, ownMetric: 0 });
  assert.equal(value.currentValue, 0);
});

test("authorized team totals and campaign adjustments are preserved", () => {
  const value = visibleBonusValue({ canSeeAll: true, metricKind: "DEPARTMENT_SALES_COUNT", aggregate, ownMetric: 7 });
  assert.deepEqual(value, { ...aggregate, metricScope: "TEAM" });
});

test("manual KPI and non-sales campaign calculation rules are preserved", () => {
  for (const metricKind of ["MANUAL_KPI", "TEACHER_RETENTION_RATE", "DEPARTMENT_COLLECTED_REVENUE"]) {
    assert.equal(visibleBonusValue({ canSeeAll: false, metricKind, aggregate, ownMetric: 7 }).currentValue, aggregate.currentValue);
  }
});

test("personal sales SQL binds campaign and employee and counts the sale owner's journal", () => {
  const sql = participantSalesMetricsSql("campaign-a", "employee-a");
  assert.match(sql.sql, /cs\.owner_id = employee\.user_id/);
  assert.match(sql.sql, /participant\.employee_id = \?::uuid/);
  assert.match(sql.sql, /participant\.is_eligible = true/);
  assert.match(sql.sql, /cs\.cancelled_at is null/);
  assert.match(sql.sql, /sale_student\.is_test_data = false/);
  assert.match(sql.sql, /campaign\.ends_at \+ interval '1 day'/);
  assert.match(sql.sql, /Asia\/Baku/);
  assert.doesNotMatch(sql.sql, /student\.manager_id|department =/);
  assert.deepEqual(sql.values, ["campaign-a", "employee-a"]);
});

test("administrative bonus calculation retains all eligible participants", () => {
  const sql = participantSalesMetricsSql("campaign-a");
  assert.doesNotMatch(sql.sql, /participant\.employee_id = \?/);
  assert.deepEqual(sql.values, ["campaign-a"]);
});
