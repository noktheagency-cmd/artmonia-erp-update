import "@/modules/students/students.css";
import { ChevronLeft, Banknote, BellRing, Phone, ReceiptText, UserRound, Users, CalendarDays, History, Clock3, TrendingUp } from "lucide-react";
import Link from "next/link";
import { getStudentDetailData } from "@/modules/students/queries";
import {
  recordStudentPaymentAction,
  deleteStudentAction,
  createStudentEnrollmentAction,
  updateStudentProfileAction,
  updateStudentStatusAction,
} from "@/modules/students/actions";
import { StatusChip } from "@/components/ui/status-chip";
import { StudentDetailActions } from "@/modules/students/student-detail-actions";
import { StudentMobileAccountCard } from "@/modules/students/student-mobile-account-card";
import {
  disableStudentMobileAccountAction,
  enableStudentMobileAccountAction,
  inviteStudentMobileAccountAction,
  resendStudentMobileInviteAction,
  resetStudentMobileDeviceAction,
} from "@/modules/students/mobile-account-actions";
import {
  completeStudentReminderAction,
  createStudentReminderAction,
} from "@/modules/students/reminder-actions";
import { CompleteStudentReminderButton } from "@/modules/students/student-reminders-client";

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

  const { student, permissions, createOptions } = data;

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
          editOptions={{
            programs: createOptions.programs,
            teachers: createOptions.teachers,
            managers: createOptions.managers,
            campaigns: createOptions.campaigns,
            educationLevels: createOptions.educationLevels,
            discountTypes: createOptions.discountTypes,
            sourceOptions: createOptions.sourceOptions,
          }}
          permissions={permissions}
          recordPaymentAction={recordStudentPaymentAction}
          updateStudentProfileAction={updateStudentProfileAction}
          createStudentEnrollmentAction={createStudentEnrollmentAction}
          updateStudentStatusAction={updateStudentStatusAction}
          deleteStudentAction={deleteStudentAction}
          createStudentReminderAction={createStudentReminderAction}
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
          <span><small>Slot</small><strong>{student.group}</strong></span>
        </div>
        <div className="student-profile-quick-item is-balance">
          <Banknote />
          <span><small>Açıq balans</small><strong>{student.balance}</strong></span>
        </div>
      </div>

      <StudentMobileAccountCard
        studentId={student.id}
        contactEmail={student.detail.email}
        account={student.detail.mobileAccount}
        canManage={permissions.canUpdateStudent}
        inviteAction={inviteStudentMobileAccountAction}
        resendAction={resendStudentMobileInviteAction}
        disableAction={disableStudentMobileAccountAction}
        enableAction={enableStudentMobileAccountAction}
        resetDeviceAction={resetStudentMobileDeviceAction}
      />

      <section className="student-detail-section">
        <div className="student-detail-section-title">
          <ReceiptText />
          <span>Tədris paketləri ({student.detail.packages.length})</span>
        </div>
        <div className="student-slot-list">
          {student.detail.packages.map((item) => (
            <article className="student-slot-item" data-active={item.status === "Aktiv"} key={item.id}>
              <div>
                <strong>{item.program}</strong>
                <span>{item.teacher}</span>
              </div>
              <div>
                <span>{item.monthlyFee} · {item.lessonsPerMonth} dərs</span>
                <span>{item.status}</span>
              </div>
              <div className="student-package-lesson-balance">
                <span data-state="used">
                  <small>İstifadə olunub</small>
                  <strong>{item.usedLessons} dərs</strong>
                </span>
                <span data-state="remaining">
                  <small>Qalan</small>
                  <strong>{item.remainingLessons === null ? "Limitsiz" : `${item.remainingLessons} dərs`}</strong>
                </span>
              </div>
              {item.overLimitLessons ? (
                <span className="student-package-over-limit">
                  Paket limitindən {item.overLimitLessons} dərs artıq istifadə olunub
                </span>
              ) : null}
              <small>
                {item.usagePeriodSource}: {item.usagePeriod} · İlk dərs: {item.firstLessonDate}
              </small>
            </article>
          ))}
        </div>
      </section>

      <section className="student-reminder-section" aria-labelledby="student-reminder-title">
        <div className="student-reminder-section-head">
          <div>
            <span className="student-reminder-section-icon" aria-hidden="true">
              <BellRing />
            </span>
            <div>
              <h2 id="student-reminder-title">Xatırlatma və qeydlər</h2>
              <p>Ödəniş və digər geri dönüş bildirişləri</p>
            </div>
          </div>
          <span className="student-reminder-count">{student.detail.reminders.length}</span>
        </div>

        {student.detail.reminders.length > 0 ? (
          <div className="student-reminder-history">
            {student.detail.reminders.map((reminder) => (
              <article
                className="student-reminder-history-item"
                data-kind={reminder.kind.toLowerCase()}
                data-complete={reminder.status === "DONE"}
                key={reminder.id}
              >
                <span className="student-reminder-kind-icon" aria-hidden="true">
                  {reminder.kind === "PAYMENT" ? <Banknote /> : <BellRing />}
                </span>
                <div className="student-reminder-history-copy">
                  <div>
                    <strong>{reminder.kindLabel}</strong>
                    <StatusChip tone={reminder.status === "DONE" ? "success" : "warning"}>
                      {reminder.statusLabel}
                    </StatusChip>
                  </div>
                  <p>{reminder.note}</p>
                  <small>{reminder.dueDate} · Məsul: {reminder.ownerName}</small>
                </div>
                {reminder.canComplete ? (
                  <CompleteStudentReminderButton
                    reminderId={reminder.id}
                    studentId={student.id}
                    action={completeStudentReminderAction}
                  />
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="student-reminder-empty">
            Bu tələbə üçün aktiv xatırlatma və ya əvvəlki qeyd yoxdur.
          </div>
        )}
      </section>

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
          {student.clv.hasCredit && (
            <div className="is-credit">
              <span>Avans / kredit</span>
              <strong>{student.clv.creditBalance}</strong>
            </div>
          )}
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

      <section className="student-detail-section student-slot-section">
        <div className="student-detail-section-title">
          <CalendarDays />
          <span>Tədris slotları</span>
        </div>
        {student.detail.slots.length > 0 ? (
          <div className="student-slot-list">
            {student.detail.slots.map((slot) => (
              <article className="student-slot-item" data-active={slot.isActive} key={slot.id}>
                <div>
                  <strong>{slot.name}</strong>
                  <span>{slot.schedule}</span>
                </div>
                <div>
                  <span>{slot.teacher}</span>
                  <span>{slot.room}</span>
                </div>
                <small>{slot.period}</small>
              </article>
            ))}
          </div>
        ) : (
          <div className="student-detail-empty">Tələbə heç bir slota təyin edilməyib</div>
        )}
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
              <span>Məbləğ</span>
              <span>Balans</span>
              <span>Status</span>
            </div>
            <div className="student-mini-table-body">
              {student.detail.invoices.length > 0 ? (
                student.detail.invoices.map((invoice) => (
                  <div className="student-mini-table-row" key={invoice.id}>
                    <span>{invoice.period}</span>
                    <span>{invoice.dueDate}</span>
                    <span>{invoice.amount}</span>
                    <span>{invoice.balance}</span>
                    <StatusChip tone={invoice.tone}>{invoice.status}</StatusChip>
                  </div>
                ))
              ) : (
                <div className="student-detail-empty">Faktura yoxdur</div>
              )}
            </div>
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
                    {payment.paidAt} - {payment.scheduleType} - {payment.method} - {payment.createdBy}
                  </span>
                  <small>Cari billing tarixi: {payment.nextPaymentDate} · {payment.note}</small>
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
              <span>Kampaniya</span>
              <strong>{student.detail.campaign}</strong>
            </div>
            <div className="profile-info-item">
              <span>Mənbə</span>
              <strong>{student.detail.source || "Təyin edilməyib"}</strong>
            </div>
            <div className="profile-info-item">
              <span>Təhsil səviyyəsi</span>
              <strong>{student.detail.educationLevel || "Təyin edilməyib"}</strong>
            </div>
            <div className="profile-info-item">
              <span>Qeydiyyat tarixi</span>
              <strong>{student.detail.registeredAt}</strong>
            </div>
            <div className="profile-info-item">
              <span>Ümumi ilk dərs tarixi</span>
              <strong>{student.detail.overallFirstLessonDate || "Təyin edilməyib"}</strong>
            </div>
            <div className="profile-info-item">
              <span>Cari dövrün ilk dərs tarixi</span>
              <strong>{student.detail.firstLessonDate || "Təyin edilməyib"}</strong>
            </div>
            <div className="profile-info-item">
              <span>Aylıq məbləğ</span>
              <strong>{student.detail.monthlyFeeLabel}</strong>
            </div>
            <div className="profile-info-item">
              <span>Aylıq dərs sayı</span>
              <strong>{student.detail.lessonsPerMonth || "Təyin edilməyib"}</strong>
            </div>
            <div className="profile-info-item">
              <span>Güzəşt növü</span>
              <strong>{student.detail.discountType || "Güzəşt yoxdur"}</strong>
            </div>
            <div className="profile-info-item">
              <span>E-poçt</span>
              <strong>{student.detail.email || "Təyin edilməyib"}</strong>
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
