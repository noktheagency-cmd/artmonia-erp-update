import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, BellRing, CheckCheck, GraduationCap } from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompleteStudentReminderButton } from "./student-reminders-client";
import type { getStudentDetailData } from "./queries";

type Student = NonNullable<Awaited<ReturnType<typeof getStudentDetailData>>>["student"];

export function StudentProfileView({ student, actions, mobileAccount, freezePeriods, billingDeadline, completeReminderAction, canReadAttendance = false }: {
  student: Student;
  actions: ReactNode;
  mobileAccount: ReactNode;
  freezePeriods: ReactNode;
  billingDeadline: ReactNode;
  completeReminderAction: (formData: FormData) => unknown | Promise<unknown>;
  canReadAttendance?: boolean;
}) {
  const detail = student.detail;
  const attendance = detail.attendance;
  const profileFields = [
    ["Məsul menecer", detail.manager], ["Qeydiyyat tarixi", detail.registeredAt],
    ["Müəllim", student.teacher], ["Qrup / dərs vaxtı", student.group],
    ["Aylıq məbləğ", detail.monthlyFeeLabel], ["Aylıq dərs sayı", detail.lessonsPerMonth],
    ["Ümumi ilk dərs", detail.overallFirstLessonDate], ["Cari dövrün ilk dərsi", detail.firstLessonDate],
    ["Təhsil səviyyəsi", detail.educationLevel], ["Mənbə", detail.source],
    ["Kampaniya", detail.campaign], ["Güzəşt növü", detail.discountType || "Güzəşt yoxdur"],
    ["E-poçt", detail.email], ["Fakturalandırma", detail.billingPaused],
  ];

  return <section className="student-profile-page" aria-labelledby="student-profile-name">
    <nav className="sp-breadcrumb" aria-label="Səhifə yolu"><Link href="/students"><ChevronLeft size={14} />Tələbələr</Link><span>/</span><span>{student.code}</span></nav>
    <Tabs defaultValue="overview" className="sp-workspace">
      <header className="sp-header">
        <div className="sp-identity-row">
          <div className="sp-identity">
            <span className="sp-avatar" aria-hidden="true">{student.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span>
            <div><h1 id="student-profile-name">{student.name}</h1><div className="sp-identity-meta"><StatusChip tone={student.lifecycleTone}>{student.lifecycleStatus}</StatusChip><StatusChip tone={student.paymentTone}>{student.paymentStatus}</StatusChip><span>{student.code} · {student.lastContact}</span></div></div>
          </div>
          {actions}
        </div>
        {student.activationWarning ? (
          <p className="sp-activation-warning" role="status">{student.activationWarning}</p>
        ) : null}
        <dl className="sp-summary">
          <div><dt>Əlaqə</dt><dd>{student.phone}</dd></div>
          <div><dt>Proqram</dt><dd>{student.program}</dd></div>
          <div data-debt={student.hasDueDebt}><dt>Cari borc</dt><dd>{student.dueDebt}</dd></div>
          <div><dt>Növbəti ödəniş tarixi</dt><dd>{student.dueDate}</dd></div>
        </dl>
        <TabsList className="sp-tabs" variant="line" aria-label="Tələbə məlumatları">
          <TabsTrigger value="overview">Ümumi</TabsTrigger>
          <TabsTrigger value="education">Tədris</TabsTrigger>
          {canReadAttendance ? <TabsTrigger value="attendance">Davamiyyət</TabsTrigger> : null}
          <TabsTrigger value="finance">Maliyyə</TabsTrigger>
          <TabsTrigger value="history">Tarixçə</TabsTrigger>
        </TabsList>
      </header>

      <TabsContent value="overview" className="sp-tab-content" keepMounted>
        <div className="sp-overview-grid">
          <div className="sp-column">
            <ProfilePanel title="Profil məlumatları"><dl className="sp-fields">{profileFields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Təyin edilməyib"}</dd></div>)}</dl></ProfilePanel>
            <PackagePanel packages={detail.packages} />
          </div>
          <aside className="sp-column">
            <ProfilePanel title="Xatırlatma və qeydlər" count={detail.reminders.length}>
              {detail.reminders.length ? <div className="sp-reminders">{detail.reminders.map((reminder) => <article className="sp-reminder" data-complete={reminder.status === "DONE"} key={reminder.id}>
                <span className="sp-reminder-dot" aria-hidden="true">{reminder.status === "DONE" ? <CheckCheck size={14} /> : <BellRing size={13} />}</span>
                <div className="sp-reminder-copy"><div><strong>{reminder.kindLabel}</strong><StatusChip tone={reminder.status === "DONE" ? "success" : "warning"}>{reminder.statusLabel}</StatusChip></div><small>{reminder.dueDate} · {reminder.ownerName}</small><p>{reminder.note}</p></div>
                {reminder.canComplete && <CompleteStudentReminderButton reminderId={reminder.id} studentId={student.id} action={completeReminderAction} />}
              </article>)}</div> : <EmptyDetail text="Bu tələbə üçün xatırlatma yoxdur. Yeni qeyd üçün “Bildiriş yarat” düyməsini seçin." />}
            </ProfilePanel>
            {mobileAccount}
          </aside>
        </div>
        <ProfilePanel title="Qeydlər"><p className="sp-notes">{detail.notes || "Qeyd yoxdur"}</p></ProfilePanel>
      </TabsContent>

      <TabsContent value="education" className="sp-tab-content" keepMounted>
        <PackagePanel packages={detail.packages} />
        <ProfilePanel title="Dərs cədvəli" count={detail.slots.length}>
          {detail.slots.length ? <div className="sp-table-scroll" tabIndex={0} aria-label="Dərs cədvəli"><table className="sp-table"><thead><tr><th>Qrup</th><th>Cədvəl</th><th>Müəllim</th><th>Otaq</th><th>Dövr</th><th>Status</th></tr></thead><tbody>{detail.slots.map((slot) => <tr key={slot.id}><td><strong>{slot.name}</strong></td><td>{slot.schedule}</td><td>{slot.teacher}</td><td>{slot.room}</td><td>{slot.period}</td><td><StatusChip tone={slot.isActive ? "success" : "neutral"}>{slot.isActive ? "Aktiv" : "Arxiv"}</StatusChip></td></tr>)}</tbody></table></div> : <EmptyDetail text="Tələbə dərs cədvəlinə təyin edilməyib." />}
        </ProfilePanel>
        <div className="sp-freeze">{freezePeriods}</div>
      </TabsContent>

      {canReadAttendance ? (
        <TabsContent value="attendance" className="sp-tab-content" keepMounted>
          <ProfilePanel title="Davamiyyət xülasəsi">
            <dl className="sp-financial-summary sp-attendance-summary" aria-label="Davamiyyət xülasəsi">
              <div><dt>Ümumi qeyd</dt><dd>{attendance.total}</dd></div>
              <div data-tone="credit"><dt>Gəldi</dt><dd>{attendance.present}</dd></div>
              <div data-tone="debt"><dt>Gəlmədi</dt><dd>{attendance.absent}</dd></div>
              <div><dt>Üzrlü</dt><dd>{attendance.excused}</dd></div>
              <div><dt>Davamiyyət</dt><dd>{attendance.rate === null ? "—" : `${attendance.rate}%`}</dd></div>
            </dl>
          </ProfilePanel>
          <ProfilePanel title="Dərs jurnalı" count={attendance.records.length}>
            {attendance.records.length ? (
              <div className="sp-table-scroll" tabIndex={0} aria-label="Davamiyyət jurnalı">
                <table className="sp-table">
                  <thead>
                    <tr>
                      <th>Tarix</th>
                      <th>Slot</th>
                      <th>Müəllim</th>
                      <th>Proqram</th>
                      <th>Status</th>
                      <th>Qeyd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.records.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <strong>{record.date}</strong>
                          <small>{record.time}</small>
                        </td>
                        <td>
                          {record.slot}
                          <small>{record.room}</small>
                        </td>
                        <td>{record.teacher}</td>
                        <td>{record.program}</td>
                        <td><StatusChip tone={record.tone}>{record.status}</StatusChip></td>
                        <td>{record.note || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyDetail text="Bu tələbə üçün hələ davamiyyət qeydi yoxdur. Qruplar jurnalından qeyd yazıldıqdan sonra burada görünəcək." />
            )}
          </ProfilePanel>
        </TabsContent>
      ) : null}

      <TabsContent value="finance" className="sp-tab-content" keepMounted>
        {billingDeadline && <div className="sp-finance-tools">{billingDeadline}</div>}
        <ProfilePanel title="Maliyyə xülasəsi">
          <dl className="sp-financial-summary"><div><dt>Toplam ödənilən məbləğ</dt><dd>{student.clv.totalPaid}</dd></div><div><dt>Ödəniş edilmiş aylar</dt><dd>{student.clv.paidMonths} ay</dd></div>{student.clv.hasCredit && <div data-tone="credit"><dt>Avans / kredit</dt><dd>{student.clv.creditBalance}</dd></div>}{student.hasDueDebt && <div data-tone="debt"><dt>Cari borc</dt><dd>{student.dueDebt}</dd></div>}{student.hasFutureReceivable && <div><dt>Gələcək ödəniş · {student.dueDate}</dt><dd>{student.futureReceivable}</dd></div>}</dl>
        </ProfilePanel>
        <ProfilePanel title="Fakturalar" count={detail.invoices.length}>
          {detail.invoices.length ? <div className="sp-table-scroll" tabIndex={0} aria-label="Fakturalar"><table className="sp-table"><thead><tr><th>Ay</th><th>Son tarix</th><th>Məbləğ</th><th>Balans</th><th>Status</th></tr></thead><tbody>{detail.invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.period}</td><td>{invoice.dueDate}</td><td>{invoice.amount}</td><td><strong>{invoice.balance}</strong></td><td><StatusChip tone={invoice.tone}>{invoice.status}</StatusChip></td></tr>)}</tbody></table></div> : <EmptyDetail text="Faktura yoxdur." />}
        </ProfilePanel>
        <div className="sp-two-column">
          <ProfilePanel title="Aylıq ödəniş tarixçəsi">
            {detail.monthlyPayments.length ? <div className="sp-table-scroll" tabIndex={0} aria-label="Aylıq ödənişlər"><table className="sp-table"><thead><tr><th>Ay</th><th>Məbləğ</th><th>Son ödəniş</th></tr></thead><tbody>{detail.monthlyPayments.map((payment) => <tr key={payment.month}><td>{payment.month}</td><td><strong>{payment.amount}</strong></td><td>{payment.paidAt}</td></tr>)}</tbody></table></div> : <EmptyDetail text="Ödəniş tarixçəsi yoxdur." />}
          </ProfilePanel>
          <ProfilePanel title="Son ödənişlər">
            {detail.payments.length ? <div className="sp-payment-list">{detail.payments.map((payment) => <article key={payment.id}><div><strong>{payment.amount}</strong><span>{payment.paidAt}</span></div><p>{payment.scheduleType} · {payment.method} · {payment.createdBy}</p><small>Növbəti ödəniş: {payment.nextPaymentDate}</small>{payment.note && payment.note !== "-" && <p>{payment.note}</p>}</article>)}</div> : <EmptyDetail text="Ödəniş yoxdur." />}
          </ProfilePanel>
        </div>
      </TabsContent>

      <TabsContent value="history" className="sp-tab-content" keepMounted>
        <ProfilePanel title="Status tarixçəsi">
          <div className="sp-history-summary"><StatusChip tone={student.lifecycleTone}>{student.lifecycleStatus}</StatusChip><span>Qeydiyyat: {detail.registeredAt}</span><span>Məsul: {detail.manager}</span><span>Hesablama: {detail.billingPaused}</span></div>
          {detail.timeline.length ? <ol className="sp-timeline">{detail.timeline.map((item) => <li key={item.id}><span className="sp-timeline-mark" aria-hidden="true" /><div><strong>{item.label}</strong><small>{item.date} · {item.changedBy}</small><p>{item.reason}</p></div></li>)}</ol> : <EmptyDetail text="Əlavə status dəyişikliyi yoxdur." />}
        </ProfilePanel>
      </TabsContent>
    </Tabs>
  </section>;
}

function ProfilePanel({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return <section className="sp-panel"><div className="sp-panel-heading"><h2>{title}</h2>{count !== undefined && <span>{count}</span>}</div>{children}</section>;
}

function PackagePanel({ packages }: { packages: Student["detail"]["packages"] }) {
  return <ProfilePanel title="Tədris paketləri" count={packages.length}>
    {packages.length ? <div className="sp-table-scroll" tabIndex={0} aria-label="Tədris paketləri"><table className="sp-table sp-packages"><thead><tr><th>Proqram / müəllim</th><th>Məbləğ · dərs sayı</th><th>İstifadə</th><th>Qalan</th><th>Status</th></tr></thead><tbody>{packages.map((item) => <tr key={item.id}>
      <td><strong>{item.program}</strong><small>{item.teacher}</small><details className="sp-package-period"><summary>Dövr məlumatları</summary><p>{item.usagePeriodSource}: {item.usagePeriod}</p><p>İlk dərs: {item.firstLessonDate}</p></details></td>
      <td>{item.monthlyFee}<small>{item.lessonsPerMonth} dərs</small></td><td>{item.usedLessons}</td><td><strong>{item.remainingLessons === null ? "Limitsiz" : item.remainingLessons}</strong>{item.overLimitLessons > 0 && <small className="sp-over-limit">Limitdən {item.overLimitLessons} dərs artıq</small>}</td><td><StatusChip tone={item.status === "Aktiv" ? "success" : "neutral"}>{item.status}</StatusChip></td>
    </tr>)}</tbody></table></div> : <EmptyDetail text="Tədris paketi yoxdur. Yeni paket əlavə edə bilərsiniz." />}
  </ProfilePanel>;
}

function EmptyDetail({ text }: { text: string }) {
  return <div className="sp-empty"><GraduationCap size={20} aria-hidden="true" /><p>{text}</p></div>;
}
