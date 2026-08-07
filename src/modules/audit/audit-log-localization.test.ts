import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAuditSnapshot,
  getAuditActionLabel,
  getAuditDisplayChanges,
  getAuditEntityLabel,
  localizeAuditReason,
} from "./audit-log-localization";

test("audit əməliyyatları və obyektləri Azərbaycan dilində göstərilir", () => {
  assert.equal(getAuditActionLabel("role.permissions.update"), "Rol icazələri yeniləndi");
  assert.equal(getAuditActionLabel("lead.convert_to_student"), "Müraciət tələbəyə çevrildi");
  assert.equal(getAuditActionLabel("SESSION_REVOKED"), "Sessiya bağlandı");
  assert.equal(getAuditEntityLabel("auth_session"), "Giriş sessiyası");
  assert.equal(getAuditEntityLabel("marketing_campaign"), "Marketinq kampaniyası");
});

test("tanınmayan texniki identifikatorlar Azərbaycan dilində ehtiyat mətnə çevrilir", () => {
  assert.equal(getAuditActionLabel("unknown.action"), "Sistem əməliyyatı icra edildi");
  assert.equal(getAuditEntityLabel("unknown_entity"), "Sistem obyekti");
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

test("detal görünüşü yalnız mənalı dəyişiklikləri qaytarır", () => {
  const result = getAuditDisplayChanges(
    { id: "15aeb032-9078-4a38-93d1-ae55f61429b5", name: "Köhnə rol", status: "ACTIVE", roleId: "internal", password: "old" },
    { id: "15aeb032-9078-4a38-93d1-ae55f61429b5", name: "Yeni rol", status: "INACTIVE", roleId: "internal", password: "new" },
  );

  assert.deepEqual(result, [
    { id: "name", label: "Ad", previous: "Köhnə rol", current: "Yeni rol", type: "changed" },
    { id: "status", label: "Status", previous: "Aktiv", current: "Passiv", type: "changed" },
  ]);
});

test("yaradılan qeyddə boş və texniki sahələr göstərilmir", () => {
  const result = getAuditDisplayChanges(null, {
    authUserId: "15aeb032-9078-4a38-93d1-ae55f61429b5",
    fullName: "Aysel Məmmədova",
    email: "aysel@example.com",
    note: null,
    roles: ["TEACHER", "FINANCE"],
  });

  assert.deepEqual(result.map(({ label, current }) => [label, current]), [
    ["Ad və soyad", "Aysel Məmmədova"],
    ["E-poçt", "aysel@example.com"],
    ["Rollar", "Müəllim, Maliyyə"],
  ]);
});

test("CRM mərhələsi və mənbə texniki mətn olmadan göstərilir", () => {
  const result = getAuditDisplayChanges(null, { stage: "QUALIFIED", source: "Instagram" });

  assert.deepEqual(result.map(({ label, current }) => [label, current]), [
    ["Mərhələ", "Konsultasiya təyin olundu"],
    ["Mənbə", "Instagram"],
  ]);
});

test("qismən yeniləmə qeydində toxunulmayan əvvəlki sahələr silinmiş sayılmır", () => {
  const result = getAuditDisplayChanges(
    { fullName: "Vaqif Məmmədzadə", capacity: null, isActive: true },
    { isActive: false },
  );

  assert.deepEqual(result, [
    { id: "isActive", label: "Aktivdir", previous: "Bəli", current: "Xeyr", type: "changed" },
  ]);
});
