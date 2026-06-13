import Link from "next/link";
import type { Route } from "next";
import { StatusChip } from "@/components/ui/status-chip";
import {
  createStudentAction,
} from "@/modules/students/actions";
import { StudentCreateDialogClient } from "@/modules/students/student-create-dialog-client";
import { StudentFilterForm } from "@/modules/students/student-filter-form";
import type { StudentListData } from "@/modules/students/queries";

export function StudentList({ data }: { data: StudentListData }) {
  return (
    <section className="page-stack">
      <div className="page-heading list-heading">
        <div>
          <h1>Tələbələr və balans</h1>
          <p>Tələbələrin proqram, status və ödəniş vəziyyəti.</p>
        </div>
        <StudentCreateDialogClient
          createOptions={data.createOptions}
          canCreateStudent={data.permissions.canCreateStudent}
          canConvertLead={data.permissions.canConvertLead}
          canRecordPayment={data.permissions.canRecordPayment}
          returnTo={data.returnTo}
          createStudentAction={createStudentAction}
        />
      </div>

      <div className="summary-grid">
        {data.statusSummary.map((item) => (
          <article className={`summary-card summary-${item.tone}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.delta}</small>
          </article>
        ))}
      </div>

      <article className="panel table-panel crm-table-panel student-table-panel">
        <StudentFilterForm
          filterOptions={data.filterOptions}
          filters={data.filters}
          query={data.query}
        />

        <div className="filter-chips" aria-label="Tələbə filterləri">
          <span>{data.total} tələbə</span>
          <span>{data.filters.activeCount} aktiv filtr</span>
          <span>Status: {data.filterLabels.status}</span>
          <span>Ödəniş: {data.filterLabels.payment}</span>
          <span>Proqram: {data.filterLabels.program}</span>
          <span>Müəllim: {data.filterLabels.teacher}</span>
        </div>

        <div className="data-table-wrap">
          <table className="data-table student-table">
            <thead>
              <tr>
                <th>Tələbə</th>
                <th>Proqram</th>
                <th>Müəllim</th>
                <th>Ödəniş tarixi</th>
                <th>Balans</th>
                <th>Ödəniş</th>
                <th>Status</th>
                <th>Son əlaqə</th>
              </tr>
            </thead>
            <tbody>
              {data.students.length > 0 ? (
                data.students.map((student) => (
                  <tr key={student.code}>
                    <td>
                      <Link href={`/students/${student.id}` as Route} className="student-open-link">
                        <strong>{student.name}</strong>
                        <span>
                          {student.code} - {student.phone}
                        </span>
                      </Link>
                    </td>
                    <td>{student.program}</td>
                    <td>{student.teacher}</td>
                    <td>{student.dueDate}</td>
                    <td>
                      <span className="student-balance" data-debt={student.paymentTone === "danger" || student.paymentTone === "warning"}>
                        {student.balance}
                      </span>
                    </td>
                    <td>
                      <StatusChip tone={student.paymentTone}>
                        {student.paymentStatus}
                      </StatusChip>
                    </td>
                    <td>
                      <StatusChip tone={student.lifecycleTone}>
                        {student.lifecycleStatus}
                      </StatusChip>
                    </td>
                    <td>{student.lastContact}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">Tələbə tapılmadı</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
