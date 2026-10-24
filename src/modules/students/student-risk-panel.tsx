import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CalendarClock, TrendingDown, UserX } from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import type { StudentListData } from "@/modules/students/queries";

/** Sağ kart: aktiv tələbələr arasında ardıcıl qayıb sayına görə riskli olanlar (qırmızı → sarı). */
export function StudentRiskPanel({ riskPanel }: { riskPanel: StudentListData["riskPanel"] }) {
  const total = riskPanel.dangerCount + riskPanel.warningCount;

  return (
    <aside className="students-risk-panel" aria-labelledby="students-risk-title">
      <header className="students-risk-head">
        <span className="students-risk-icon" aria-hidden="true"><TrendingDown /></span>
        <div>
          <h3 id="students-risk-title">Riskli tələbələr</h3>
          <p>Ardıcıl qayıb: 2 = sarı, 3 və çox = qırmızı</p>
        </div>
        <span className="students-risk-counts">
          <StatusChip tone="danger">{riskPanel.dangerCount}</StatusChip>
          <StatusChip tone="warning">{riskPanel.warningCount}</StatusChip>
        </span>
      </header>

      <div className="students-risk-items">
        {riskPanel.items.map((item) => (
          <Link
            key={item.studentId}
            href={`/students/${item.studentId}` as Route}
            className="students-risk-item"
            data-level={item.level}
            aria-label={`${item.student}: ardıcıl ${item.streak} dərs qayıb`}
          >
            <span className="students-attention-avatar" aria-hidden="true"><UserX /></span>
            <span className="students-attention-person">
              <strong>{item.student}</strong>
              <small>{item.code} · {item.teacher} · {item.group}</small>
            </span>
            <StatusChip tone={item.level}>Riskli · {item.streak} qayıb</StatusChip>
            <small className="students-risk-item-date">
              <CalendarClock aria-hidden="true" /> Son qayıb: {item.lastAbsentDate}
            </small>
            <ArrowRight className="students-attention-open" aria-hidden="true" />
          </Link>
        ))}
        {total === 0 ? (
          <p className="students-risk-status" role="status">Hazırda riskli tələbə yoxdur.</p>
        ) : null}
      </div>
    </aside>
  );
}