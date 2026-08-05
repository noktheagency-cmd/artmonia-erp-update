import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, unzipSync } from "fflate";
import { createProfessionalExcelFile } from "@/modules/exports/excel-workbook";

test("professional Excel export produces a styled and typed XLSX workbook", async () => {
  const bytes = await createProfessionalExcelFile({
    title: "Artmonia · Test hesabatı",
    worksheetName: "Test / hesabat",
    generatedAt: new Date("2026-08-05T12:30:00.000Z"),
    summary: ["Əhatə: Test", "Nəticə sayı: 2"],
    columns: [
      { key: "name", label: "Ad soyad", width: 24 },
      { key: "amount", label: "Məbləğ", kind: "currency" },
      { key: "date", label: "Tarix", kind: "date" },
      { key: "status", label: "Status", kind: "status" },
      { key: "note", label: "Qeyd", wrap: true },
    ],
    rows: [
      { name: "Aysel Məmmədova", amount: 1250.5, date: "2026-08-05", status: "Aktiv", note: "Normal qeyd" },
      { name: "Nicat Əliyev", amount: "2.400,75 AZN", date: "06.08.2026", status: "Passiv", note: "=SUM(A1:A2)" },
    ],
  });

  assert.equal(String.fromCharCode(bytes[0], bytes[1]), "PK");
  const files = unzipSync(bytes);
  const workbook = strFromU8(files["xl/workbook.xml"]);
  const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);
  const styles = strFromU8(files["xl/styles.xml"]);

  assert.match(workbook, /sheet name="Test hesabat"/);
  assert.match(sheet, /<pane ySplit="5" topLeftCell="A6"[^>]+state="frozen"/);
  assert.match(sheet, /<autoFilter ref="A5:E7"\/>/);
  assert.match(sheet, /<mergeCell ref="A1:E1"\/>/);
  assert.match(sheet, /<c r="B6" s="11"><v>1250\.5<\/v><\/c>/);
  assert.match(sheet, /<c r="B7" s="12"><v>2400\.75<\/v><\/c>/);
  assert.match(sheet, /<c r="D6" s="19" t="inlineStr">/);
  assert.match(sheet, /<c r="D7" s="21" t="inlineStr">/);
  assert.match(sheet, /=SUM\(A1:A2\)/);
  assert.doesNotMatch(sheet, /<f>/);
  assert.match(styles, /formatCode="#,##0\.00 &quot;₼&quot;"/);
  assert.match(styles, /formatCode="dd mmm yyyy"/);
});

test("professional Excel export validates unsafe workbook dimensions", async () => {
  await assert.rejects(
    () => createProfessionalExcelFile({ title: "Test", columns: [], rows: [] }),
    /ən azı bir sütun/,
  );
});
