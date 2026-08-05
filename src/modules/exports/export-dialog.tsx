"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, LoaderCircle, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  exportDatasetRegistry,
  getDefaultExportFields,
  type ExportModule,
} from "@/modules/exports/export-config";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";

type ExportDialogProps = {
  module: ExportModule;
  filters: Record<string, string>;
  resultCount: number;
  previewRows?: Array<Record<string, string | number | null>>;
  initialDataset?: string;
};

export function ExportDialog({ module, filters, resultCount, previewRows = [], initialDataset }: ExportDialogProps) {
  const datasets = exportDatasetRegistry[module];
  const initialDatasetKey = datasets.some((dataset) => dataset.key === initialDataset) ? initialDataset! : datasets[0].key;
  const [datasetKey, setDatasetKey] = useState(initialDatasetKey);
  const [scope, setScope] = useState<"filtered" | "all">("filtered");
  const [format, setFormat] = useState<"xlsx" | "pdf">("xlsx");
  const [includeSummary, setIncludeSummary] = useState(true);
  const [fields, setFields] = useState(() => getDefaultExportFields(module, initialDatasetKey));
  const [isExporting, setIsExporting] = useState(false);
  const [feedback, setFeedback] = useState("");

  const dataset = datasets.find((item) => item.key === datasetKey) ?? datasets[0];
  const activeFilterCount = Object.entries(filters).filter(([, value]) => value && value !== "all" && value !== "overview").length;
  const preview = useMemo(() => previewRows.slice(0, 3), [previewRows]);

  function changeDataset(nextDataset: string) {
    setDatasetKey(nextDataset);
    setFields(getDefaultExportFields(module, nextDataset));
    setFeedback("");
  }

  function toggleField(key: string) {
    setFields((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function downloadExport() {
    if (fields.length === 0) {
      setFeedback("Ən azı bir sütun seçin.");
      return;
    }

    setIsExporting(true);
    setFeedback("");
    try {
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, dataset: dataset.key, scope, format, fields, filters, includeSummary }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "İxrac hazırlanmadı.");
      }
      const blob = await response.blob();
      const filename = response.headers.get("content-disposition")?.match(/filename="?([^";]+)"?/)?.[1]
        ?? `artmonia-export.${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const formatLabel = format === "xlsx" ? "Excel" : "PDF";
      setFeedback(`${formatLabel} faylı hazırlandı.`);
      notifySuccess("İxrac hazırdır", `${formatLabel} faylı uğurla yaradıldı.`);
    } catch (error) {
      setFeedback(notifyCaughtError(error, "İxrac hazırlanmadı.", "İxrac alınmadı"));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="export-trigger" aria-label="İxrac et" title="İxrac et">
          <Download />
        </Button>
      </DialogTrigger>
      <DialogContent className="export-dialog-content" aria-describedby="export-dialog-description">
        <DialogHeader className="export-dialog-header">
          <div className="export-dialog-title-icon" aria-hidden="true"><SlidersHorizontal /></div>
          <div>
            <DialogTitle>İxrac hesabatı</DialogTitle>
            <DialogDescription id="export-dialog-description">Sütunları seçin, məlumat əhatəsini müəyyən edin və faylı hazırlayın.</DialogDescription>
          </div>
        </DialogHeader>

        <div className="export-dialog-grid">
          <section className="export-dialog-section export-scope-section">
            <div className="export-section-heading"><span>1. Məlumat əhatəsi</span><strong>{resultCount.toLocaleString("az-AZ")} nəticə</strong></div>
            {datasets.length > 1 ? (
              <label className="export-select-label">Hesabat növü
                <select value={dataset.key} onChange={(event) => changeDataset(event.target.value)}>
                  {datasets.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
                </select>
              </label>
            ) : <p className="export-dataset-name">{dataset.label}</p>}
            <label className="export-scope-option">
              <input type="radio" name={`scope-${module}`} checked={scope === "filtered"} onChange={() => setScope("filtered")} />
              <span><strong>Mövcud filtrlər</strong><small>{activeFilterCount ? `${activeFilterCount} aktiv filtr tətbiq ediləcək.` : "Hazırkı modul görünüşü ixrac ediləcək."}</small></span>
            </label>
            <label className="export-scope-option">
              <input type="radio" name={`scope-${module}`} checked={scope === "all"} onChange={() => setScope("all")} />
              <span><strong>Bütün icazəli qeydlər</strong><small>Yalnız sizin oxuma icazəniz olan məlumatlar daxil ediləcək.</small></span>
            </label>
            <div className="export-filter-summary">
              <strong>Filtr xülasəsi</strong>
              {activeFilterCount ? Object.entries(filters).filter(([, value]) => value && value !== "all" && value !== "overview").map(([key, value]) => <span key={key}>{key}: {value}</span>) : <span>Əlavə filtr seçilməyib</span>}
            </div>
          </section>

          <section className="export-dialog-section export-fields-section">
            <div className="export-section-heading"><span>2. Sütunları seçin</span><button type="button" onClick={() => setFields(dataset.fields.map((field) => field.key))}>Hamısını seç</button></div>
            <div className="export-field-list">
              {dataset.fields.map((field) => (
                <label className="export-field-option" key={field.key}>
                  <input type="checkbox" checked={fields.includes(field.key)} onChange={() => toggleField(field.key)} />
                  <span>{field.label}</span>{field.detail ? <small>Əlavə detal</small> : null}
                </label>
              ))}
            </div>
          </section>

          <section className="export-dialog-section export-preview-section">
            <div className="export-section-heading"><span>3. Canlı önizləmə</span><strong>{fields.length} sütun</strong></div>
            <div className="export-preview-table" role="region" aria-label="İxrac önizləməsi">
              <div className="export-preview-head">{fields.slice(0, 4).map((key) => <span key={key}>{dataset.fields.find((field) => field.key === key)?.label}</span>)}</div>
              {preview.length ? preview.map((row, index) => <div className="export-preview-row" key={index}>{fields.slice(0, 4).map((key) => <span key={key}>{row[key] ?? "—"}</span>)}</div>) : <p>Önizləmə üçün seçilmiş məlumat görünmür.</p>}
            </div>
            <label className="export-summary-toggle"><input type="checkbox" checked={includeSummary} onChange={(event) => setIncludeSummary(event.target.checked)} /><span><strong>{format === "xlsx" ? "Excel-də hesabat xülasəsini göstər" : "PDF-də hesabat xülasəsini göstər"}</strong><small>Filtrlər, ixrac tarixi və nəticə sayı göstəriləcək.</small></span></label>
          </section>
        </div>

        {feedback ? <p className="export-feedback" role="status">{feedback}</p> : null}
        <DialogFooter className="export-dialog-footer">
          <div className="export-format-switch" aria-label="İxrac formatı">
            <button type="button" className={format === "xlsx" ? "is-selected" : ""} onClick={() => setFormat("xlsx")}><FileSpreadsheet /> Excel</button>
            <button type="button" className={format === "pdf" ? "is-selected" : ""} onClick={() => setFormat("pdf")}><FileText /> PDF</button>
          </div>
          <Button type="button" onClick={() => void downloadExport()} disabled={isExporting}>
            {isExporting ? <LoaderCircle className="export-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
            {isExporting ? "Hazırlanır..." : `${format === "xlsx" ? "Excel" : "PDF"} ixrac et`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
