"use client";

import "client-only";
import {
  createProfessionalExcelFile,
  type ExcelExportDefinition,
} from "@/modules/exports/excel-workbook";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function downloadProfessionalExcel(definition: ExcelExportDefinition, filename: string) {
  const bytes = await createProfessionalExcelFile(definition);
  const blob = new Blob([bytes.slice().buffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.toLocaleLowerCase("az").endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
