"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, CirclePause, Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadRetentionReport } from "./attendance-analytics-action";
import type { RetentionOptions, RetentionReport } from "./retention-analytics";

export function RetentionAnalyticsPanel({ from, to, teacherId, groupId, onOptions }: {
  from: string; to: string; teacherId: string; groupId: string;
  onOptions: Dispatch<SetStateAction<RetentionOptions>>;
}) {
  const [status, setStatus] = useState<"FROZEN" | "STOPPED">("FROZEN");
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; report?: RetentionReport; error?: string }>();
  const key = JSON.stringify({ from, to, teacherId: teacherId || undefined, groupId: groupId || undefined, status, page });
  useEffect(() => {
    let active = true;
    void loadRetentionReport(JSON.parse(key)).then((response) => {
      if (!active) return;
      if (response.ok) {
        setResult({ key, report: response.data });
        onOptions({ teachers: response.data.teachers, groups: response.data.groups });
      } else setResult({ key, error: response.message });
    }).catch(() => { if (active) setResult({ key, error: "Statistika yüklənmədi. Yenidən cəhd edin." }); });
    return () => { active = false; };
  }, [key, attempt, onOptions]);
  if (result?.key !== key) return <p className="attendance-inline-status" role="status">Saxlanma statistikası yüklənir…</p>;
  const report = result.report;
  if (!report) return <div className="attendance-inline-status is-error" role="alert">{result.error} <Button variant="outline" onClick={() => setAttempt(attempt + 1)}>Yenidən cəhd et</Button></div>;
  const choose = (next: "FROZEN" | "STOPPED") => { setStatus(next); setPage(1); setExpanded(true); };
  return <section className="retention-section attendance-block" aria-label="Saxlanma və itki">
    <div className="attendance-section-heading">
      <div><h3>Saxlanma və itki</h3><p>Donduran və dayandıran tələbələr</p></div>
      <span>{report.total} itki · {report.population} baza</span>
    </div>
    <div className="attendance-kpis retention-kpis">
      <div className="attendance-kpi is-primary"><span>Tələbə itkisi</span><strong>{report.rate}%</strong><small>{report.total} / {report.population} tələbə</small></div>
      <div className="attendance-kpi"><span>Saxlanma</span><strong>{100 - report.rate}%</strong><small>Dondurmayan və dayandırmayanlar</small></div>
      <button type="button" className="attendance-kpi is-action" onClick={() => choose("FROZEN")} aria-expanded={expanded && status === "FROZEN"}>
        <span><Snowflake size={17} />Donduran tələbələr</span>
        <strong>{report.frozen}</strong>
        <small className="attendance-kpi-action">Ətraflı <ChevronRight size={14} /></small>
      </button>
      <button type="button" className="attendance-kpi is-action" onClick={() => choose("STOPPED")} aria-expanded={expanded && status === "STOPPED"}>
        <span><CirclePause size={17} />Dayandıran tələbələr</span>
        <strong>{report.stopped}</strong>
        <small className="attendance-kpi-action">Ətraflı <ChevronRight size={14} /></small>
      </button>
    </div>
    {expanded && <div className="retention-details">
      <div className="attendance-section-heading">
        <div><h3>{status === "FROZEN" ? "Donduran tələbələr" : "Təhsili dayandıran tələbələr"}</h3></div>
        <button type="button" className="attendance-back" onClick={() => setExpanded(false)}><ArrowLeft size={15} /> Detalları bağla</button>
      </div>
      {report.details.length === 0 ? <p className="attendance-empty-note">Seçilmiş dövr və filtrlər üzrə tələbə yoxdur.</p> : <div className="students-attendance-table-wrap"><table className="students-attendance-table"><thead><tr><th>Tələbə</th><th>Tarix</th><th>Səbəb və qeyd</th><th>Məsul menecer</th></tr></thead><tbody>{report.details.map((student) => <tr key={student.id}><td><Link href={`/students/${student.studentId}`}>{student.name}</Link></td><td>{student.date.split("-").reverse().join(".")}</td><td>{student.reason}{student.note && <p>{student.note}</p>}</td><td>{student.manager ?? "Təyin edilməyib"}</td></tr>)}</tbody></table></div>}
      {report.pages > 1 && <div className="students-attendance-pagination"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Əvvəlki</Button><span>{page} / {report.pages}</span><Button variant="outline" disabled={page >= report.pages} onClick={() => setPage(page + 1)}>Növbəti</Button></div>}
    </div>}
  </section>;
}
