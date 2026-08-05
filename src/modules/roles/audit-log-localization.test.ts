import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAuditSnapshot,
  getAuditActionLabel,
  getAuditEntityLabel,
  localizeAuditReason,
} from "./audit-log-localization";

test("audit əməliyyatları və obyektləri Azərbaycan dilində göstərilir", () => {
  assert.equal(getAuditActionLabel("role.permissions.update"), "Rol icazələri yeniləndi");
  assert.equal(getAuditActionLabel("lead.convert_to_student"), "Müraciət tələbəyə çevrildi");
  assert.equal(getAuditEntityLabel("marketing_campaign"), "Marketinq kampaniyası");
});

test("tanınmayan texniki identifikatorlar Azərbaycan dilində ehtiyat mətnə çevrilir", () => {
  assert.equal(getAuditActionLabel("unknown.action"), "Sistem əməliyyatı icra edildi");
  assert.equal(getAuditEntityLabel("unknown_entity"), "Sistem obyekti");
  assert.equal(getAuditEntityLabel("group_session"), "Qrup dərsi");
});

test("dəyişiklik məlumatlarının açarları və sistem dəyərləri lokallaşdırılır", () => {
  const result = formatAuditSnapshot({
    roleId: "123",
    isActive: true,
    scope: "ALL",
    status: "CANCELLED",
    nestedValue: null,
  });

  assert.match(result, /"Rolun identifikatoru": "123"/);
  assert.match(result, /"Aktivdir": "Bəli"/);
  assert.match(result, /"Əhatə dairəsi": "Hamısı"/);
  assert.match(result, /"Status": "Ləğv edilib"/);
  assert.match(result, /"Daxili dəyər": "Məlumat yoxdur"/);
});

test("köhnə qeydlərdəki ingilis terminləri göstərilərkən lokallaşdırılır", () => {
  assert.equal(localizeAuditReason("Yeni custom rol yaradıldı"), "Yeni fərdi rol yaradıldı");
  assert.equal(localizeAuditReason("Task statusu yeniləndi"), "Tapşırıq statusu yeniləndi");
});
