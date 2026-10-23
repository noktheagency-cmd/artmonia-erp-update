"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CirclePause, Snowflake, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadRetentionReport } from "./attendance-analytics-action";
import { retentionDetailsHref, type RetentionReport } from "./retention-analytics";
import type { StudentListData } from "@/modules/students/queries";

type State = { report?: RetentionReport; from?: string; to?: string; error?: string };

export function StudentRiskPanel({ operations }: { operations: StudentListData["operations"] }) {
  const [state, setState] = useState<State>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const to = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Baku" }).format(new Date());
    const from = `${to.slice(0, 8)}01`;
    void loadRetentionReport({ from, to, status: "FROZEN", page: 1 })
      .then((response) => {
        if (!active) return;
        setState(response.ok ? { report: response.data, from, to } : { error: response.message });
      })
      .catch(() => { if (active) setState({ error: "Statistika yüklənmədi." }); });
    return () => { active = false; };
  }, [attempt]);

  const { report, from, to, error } = state;

  return (
    <aside className="students-risk-panel" aria-labelledby="students-risk-title">
      <header className="students-risk-head">
        <span className="students-risk-icon" aria-hidden="true"><TrendingDown /></span>
        <div>
          <h3 id="students-risk-title">İtki və risk</h3>
          <p>Cari ay üzrə saxlanma göstəriciləri</p>
        </div>
      </header>

      {report ? (
        <>
          <div className="students-risk-main">
            <span>Tələbə itkisi (churn)</span>
            <strong>{report.rate}%</strong>
            <small>{report.total} / {report.population} tələbə · saxlanma {100 - report.rate}%</small>
          </div>
          <div className="students-risk-split">
            <div><Snowflake size={15} aria-hidden="true" /><span>Donduran</span><strong>{report.frozen}</strong></div>
            <div><CirclePause size={15} aria-hidden="true" /><span>Dayandıran</span><strong>{report.stopped}</strong></div>
          </div>
          {from && to ? (
            <Link className="students-risk-link" href={retentionDetailsHref(from, to)}>
              Ətraflı hesabat
            </Link>
          ) : null}
        </>
      ) : error ? (
        <div className="students-risk-status" role="alert">
          {error} <Button variant="outline" type="button" onClick={() => { setState({}); setAttempt(attempt + 1); }}>Yenidən cəhd et</Button>
        </div>
      ) : (
        <p className="students-risk-status" role="status">Saxlanma statistikası yüklənir…</p>
      )}

      <dl className="students-risk-list">
        <div><dt>Slot gözləyən</dt><dd>{operations.slotWaitingCount}</dd></div>
        <div><dt>Gecikmiş ödəniş</dt><dd>{operations.overdueCount} · {operations.overdueAmount}</dd></div>
        <div><dt>Cədvəli olmayan</dt><dd>{operations.unscheduledCount}</dd></div>
        <div><dt>Dondurulmuş / dayandırılmış</dt><dd>{operations.frozenOrStoppedCount}</dd></div>
      </dl>
    </aside>
  );
}