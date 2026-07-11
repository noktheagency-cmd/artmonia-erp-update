import { ChevronLeft, Banknote, Phone, ReceiptText, UserRound, Users, CalendarDays, History, Clock3, TrendingUp } from "lucide-react";
import Link from "next/link";
import { getStudentDetailData } from "@/modules/students/queries";
import {
  recordStudentPaymentAction,
  deleteStudentAction,
  updateStudentStatusAction,
} from "@/modules/students/actions";
import { StatusChip } from "@/components/ui/status-chip";
import { StudentDetailActions } from "@/modules/students/student-detail-actions";

export const dynamic = "force-dynamic";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getStudentDetailData(id);

  if (!data) {
    return (
      <div className="empty-state">Tələbə tapılmadı</div>
    );
  }

  const { student, permissions } = data;

  return (
    <section className="page-stack student-detail-page student-detail-modern-page">
      <div className="page-heading list-heading">
        <div className="student-header-back-col">
          <Link href="/students" className="back-link">
            <ChevronLeft size={16} />
            <span>Tələbələrə qayıt</span>
          </Link>
          <div className="student-header-title-row">
            <h1>{student.name}</h1>
            <StatusChip tone={student.lifecycleTone}>{student.lifecycleStatus}</StatusChip>
            <StatusChip tone={student.paymentTone}>{student.paymentStatus}</StatusChip>
          </div>
          <p className="student-header-meta">ART Kodu: {student.code} • {student.lastContact}</p>
        </div>
        
        <StudentDetailActions 
          student={student}
          permissions={permissions}
          recordPaymentAction={recordStudentPaymentAction}
          updateStudentStatusAction={updateStudentStatusAction}
          deleteStudentAction={deleteStudentAction}
        />
      </div>

      <div className="lead-detail-summary student-detail-summary student-profile-quick-grid">
        <div className="student-profile-quick-item">
          <Phone />
          <span><small>Əlaqə</small><strong>{student.phone}</strong></span>
        </div>
        <div className="student-profile-quick-item">
          <ReceiptText />
          <span><small>Proqram</small><strong>{student.program}</strong></span>
        </div>
        <div className="student-profile-quick-item">
          <UserRound />
          <span><small>Müəllim</small><strong>{student.teacher}</strong></span>
        </div>
        <div className="student-profile-quick-item">
          <Users />
          <span><small>Qrup</small><strong>{student.group}</strong></span>
        </div>
        <div className="student-profile-quick-item is-balance">
          <Banknote />
          <span><small>Açıq balans</small><strong>{student.balance}</strong></span>
        </div>
      </div>

      <section className="student-clv-profile" aria-labelledby="student-clv-title">
        <div className="student-detail-section-title">
          <TrendingUp />
          <span id="student-clv-title">Tələbə CLV-si</span>
        </div>
        <div className="student-clv-summary-grid">
          <div>
            <span>Toplam ödənilən məbləğ</span>
            <strong>{student.clv.totalPaid}</strong>
          </div>
          <div>
            <span>Ödəniş edilmiş aylar</span>
            <strong>{student.clv.paidMonths} ay</strong>
          </div>
          {student.paymentTone !== "success" && (
            <div className="is-debt">
              <span>Qalan borc</span>
              <strong>{student.balance}</strong>
            </div>
          )}
        </div>
        <div className="student-clv-history">
          <div className="student-clv-history-head">
            <span>Aylıq ödəniş tarixçəsi</span>
            <span>Məbləğ</span>
            <span>Son ödəniş</span>
          </div>
          {student.detail.monthlyPayments.length > 0 ? (
            student.detail.monthlyPayments.map((payment) => (
              <div className="student-clv-history-row" key={payment.month}>
                <span>{payment.month}</span>
                <strong>{payment.amount}</strong>
                <span>{payment.paidAt}</span>
              </div>
            ))
          ) : (
            <div className="student-detail-empty">Ödəniş tarixçəsi yoxdur</div>
          )}
        </div>
      </section>

      <div className="student-detail-layout">
        <section className="student-detail-section">
          <div className="student-detail-section-title">
            <ReceiptText />
            <span>Faktura vəziyyəti</span>
          </div>
          <div className="student-mini-table">
            <div className="student-mini-table-head">
              <span>Ay</span>
              <span>Son tarix</span>
              <span>Balans</span>
              <span>Status</span>
            </div>
            {student.detail.invoices.length > 0 ? (
              student.detail.invoices.map((invoice) => (
                <div className="student-mini-table-row" key={invoice.id}>
                  <span>{invoice.period}</span>
                  <span>{invoice.dueDate}</span>
                  <span>{invoice.balance}</span>
                  <StatusChip tone={invoice.tone}>{invoice.status}</StatusChip>
                </div>
              ))
            ) : (
              <div className="student-detail-empty">Faktura yoxdur</div>
            )}
          </div>
        </section>

        <section className="student-detail-section">
          <div className="student-detail-section-title">
            <Clock3 />
            <span>Son ödənişlər</span>
          </div>
          <div className="student-payment-history">
            {student.detail.payments.length > 0 ? (
              student.detail.payments.map((payment) => (
                <div className="student-history-line" key={payment.id}>
                  <strong>{payment.amount}</strong>
                  <span>
                    {payment.paidAt} - {payment.method} - {payment.createdBy}
                  </span>
                  <small>Növbəti ödəniş: {payment.nextPaymentDate} · {payment.note}</small>
                </div>
              ))
            ) : (
              <div className="student-detail-empty">Ödəniş yoxdur</div>
            )}
          </div>
        </section>
      </div>

      <div className="student-detail-layout student-detail-layout-secondary">
        <section className="student-detail-section">
          <div className="student-detail-section-title">
            <History />
            <span>Status tarixçəsi</span>
          </div>
          <div className="student-timeline-history">
            <div className="student-history-line">
              <strong>{student.lifecycleStatus}</strong>
              <span>
                <CalendarDays /> Qeydiyyat: {student.detail.registeredAt}
              </span>
              <small>
                Məsul: {student.detail.manager} - Hesablama: {student.detail.billingPaused}
              </small>
            </div>
            {student.detail.timeline.map((item) => (
              <div className="student-history-line" key={item.id}>
                <strong>{item.label}</strong>
                <span>
                  {item.date} - {item.changedBy}
                </span>
                <small>{item.reason}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="student-detail-section">
          <div className="student-detail-section-title">
            <UserRound />
            <span>Profil məlumatları</span>
          </div>
          <div className="student-profile-info-grid">
            <div className="profile-info-item">
              <span>Qeydiyyatdan keçirən menecer</span>
              <strong>{student.detail.manager}</strong>
            </div>
            <div className="profile-info-item">
              <span>Qeydiyyat tarixi</span>
              <strong>{student.detail.registeredAt}</strong>
            </div>
            <div className="profile-info-item">
              <span>Fakturalandırma</span>
              <strong>{student.detail.billingPaused}</strong>
            </div>
            <div className="profile-info-item">
              <span>Qeydlər</span>
              <p>{student.detail.notes}</p>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
