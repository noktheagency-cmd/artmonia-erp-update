import { join } from "node:path";
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ExportField } from "@/modules/exports/export-config";
import {
  createProfessionalExcelFile,
  type ExcelColumnKind,
} from "@/modules/exports/excel-workbook";

Font.register({
  family: "Noto Sans",
  src: join(process.cwd(), "node_modules", "@fontsource", "noto-sans", "files", "noto-sans-latin-ext-400-normal.woff"),
});

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: "Noto Sans", fontSize: 7, color: "#14213d" },
  title: { fontSize: 17, fontWeight: 700, marginBottom: 4, color: "#0f2d5c" },
  meta: { color: "#60708a", marginBottom: 10 },
  summary: { backgroundColor: "#f2f6fc", border: "1 solid #d7e1ef", borderRadius: 5, padding: 8, marginBottom: 12 },
  summaryTitle: { fontSize: 9, fontWeight: 700, marginBottom: 3 },
  summaryLine: { color: "#42526b", marginBottom: 2 },
  table: { border: "1 solid #d7e1ef" },
  row: { flexDirection: "row", borderBottom: "1 solid #d7e1ef" },
  header: { backgroundColor: "#eaf1fb" },
  cell: { padding: 4, borderRight: "1 solid #d7e1ef", lineHeight: 1.3 },
  headerCell: { fontWeight: 700, color: "#173d76" },
  empty: { padding: 14, color: "#60708a" },
  details: { marginTop: 14, paddingTop: 8, borderTop: "1 solid #d7e1ef" },
  detailHeading: { marginBottom: 6, color: "#173d76", fontSize: 9, fontWeight: 700 },
  detailItem: { marginBottom: 7, padding: 6, backgroundColor: "#f8fafc", borderRadius: 3 },
  detailTitle: { marginBottom: 3, color: "#243b62", fontWeight: 700 },
  detailLine: { color: "#4d5e78", marginBottom: 2, lineHeight: 1.35 },
  footer: { position: "absolute", bottom: 18, left: 28, right: 28, textAlign: "right", color: "#71809a", fontSize: 6 },
});

export type PreparedExport = {
  title: string;
  fields: ExportField[];
  rows: Array<Record<string, string | number | null>>;
  summary: string[];
};

export function createCsvFile(exportData: PreparedExport) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = [
    exportData.fields.map((field) => escape(field.label)).join(","),
    ...exportData.rows.map((row) => exportData.fields.map((field) => escape(String(row[field.key] ?? ""))).join(",")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

export function createExcelFile(exportData: PreparedExport) {
  return createProfessionalExcelFile({
    title: exportData.title,
    worksheetName: exportData.title,
    summary: exportData.summary,
    columns: exportData.fields.map((field) => ({
      key: field.key,
      label: field.label,
      kind: excelKindForField(field),
      wrap: Boolean(field.detail),
    })),
    rows: exportData.rows,
  });
}

export async function createPdfFile(exportData: PreparedExport) {
  return renderToBuffer(<ExportPdf exportData={exportData} />);
}

function ExportPdf({ exportData }: { exportData: PreparedExport }) {
  const primaryFields = exportData.fields.filter((field) => !field.detail);
  const detailFields = exportData.fields.filter((field) => field.detail);
  const tableFields = primaryFields.length > 0 ? primaryFields : exportData.fields;
  const width = `${100 / Math.max(tableFields.length, 1)}%`;
  const now = new Intl.DateTimeFormat("az-AZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date());

  return (
    <Document title={exportData.title} author="Artmonia ERP">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{exportData.title}</Text>
        <Text style={styles.meta}>Artmonia ERP · İxrac tarixi: {now} · {exportData.rows.length} qeyd</Text>
        {exportData.summary.length > 0 ? (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Hesabat xülasəsi</Text>
            {exportData.summary.map((line) => <Text key={line} style={styles.summaryLine}>{line}</Text>)}
          </View>
        ) : null}
          <View style={styles.table}>
            <View style={[styles.row, styles.header]} fixed>
            {tableFields.map((field) => <Text key={field.key} style={[styles.cell, styles.headerCell, { width }]}>{field.label}</Text>)}
            </View>
            {exportData.rows.length > 0 ? exportData.rows.map((row, index) => (
            <View style={styles.row} key={`${index}-${row[tableFields[0]?.key] ?? "row"}`} wrap={false}>
              {tableFields.map((field) => <Text key={field.key} style={[styles.cell, { width }]}>{row[field.key] ?? "-"}</Text>)}
            </View>
          )) : <Text style={styles.empty}>Seçilən meyarlara uyğun qeyd yoxdur.</Text>}
        </View>
        {detailFields.length > 0 && exportData.rows.length > 0 ? (
          <View style={styles.details}>
            <Text style={styles.detailHeading}>Əlavə seçilmiş detallar</Text>
            {exportData.rows.map((row, index) => (
              <View style={styles.detailItem} key={`detail-${index}`} wrap={false}>
                <Text style={styles.detailTitle}>{row[tableFields[0]?.key] ?? `Qeyd ${index + 1}`}</Text>
                {detailFields.map((field) => <Text key={field.key} style={styles.detailLine}>{field.label}: {row[field.key] ?? "-"}</Text>)}
              </View>
            ))}
          </View>
        ) : null}
        <Text style={styles.footer} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

function excelKindForField(field: ExportField): ExcelColumnKind {
  if (["amount", "balance"].includes(field.key)) return "currency";
  if (["overdueDays", "trialLessonCount"].includes(field.key)) return "number";
  if (["nextFollowUp", "createdAt"].includes(field.key)) return "datetime";
  if (["dueDate", "registeredAt", "paidAt", "expenseDate", "joinedAt", "date"].includes(field.key)) return "date";
  if (["stage", "priority", "lifecycle", "paymentStatus", "attendance", "status"].includes(field.key)) return "status";
  return "text";
}
