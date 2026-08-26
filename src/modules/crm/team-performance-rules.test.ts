import assert from "node:assert/strict";
import test from "node:test";
import {
  crmTeamVisibleHrStatuses,
  getCrmTeamPerformanceAccess,
} from "./team-performance-rules";

test("ALL CRM oxu scope-u bütün satış komandasını göstərir", () => {
  assert.equal(getCrmTeamPerformanceAccess("ALL"), "SALES_TEAM");
});

test("ASSIGNED CRM oxu scope-u yalnız cari əməkdaşı göstərir", () => {
  assert.equal(getCrmTeamPerformanceAccess("ASSIGNED"), "SELF");
});

test("məzuniyyətdə olan əməkdaşın dövr performansı komanda nəticəsində saxlanılır", () => {
  assert.deepEqual(crmTeamVisibleHrStatuses, ["ACTIVE", "PROBATION", "ON_LEAVE"]);
});
