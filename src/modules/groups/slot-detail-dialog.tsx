"use client";

import Link from "next/link";
import {
  ArrowRightLeft,
  BookOpenCheck,
  CalendarDays,
  Check,
  Clock3,
  DoorOpen,
  Edit3,
  ExternalLink,
  GraduationCap,
  Mail,
  NotebookTabs,
  Phone,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  PlannerSlot,
  PlannerStudentDetail,
  PlannerWorkspaceData,
} from "@/modules/groups/planner-queries";
import { weekdayMeta } from "@/modules/groups/shared";
import styles from "./planner.module.css";

type DetailTab = "overview" | "students" | "journal";

const shiftLabels: Record<PlannerSlot["shift"], string> = {
  morning: "Səhər",
  afternoon: "Günorta",
  evening: "Axşam",
};

const lifecycleLabels: Record<string, string> = {
  SLOT_WAITING: "Slot gözləyir",
  ACTIVE: "Aktiv",
  DEBT: "Borclu",
  FROZEN: "Dondurulub",
  STOPPED: "Dayandırılıb",
  DECLINED: "İmtina edib",
  COMPLETED: "Tamamlayıb",
};

const enrollmentLabels: Record<string, string> = {
  ACTIVE: "Aktiv qeydiyyat",
  PAUSED: "Qeydiyyat dayandırılıb",
  COMPLETED: "Qeydiyyat tamamlanıb",
  CANCELLED: "Qeydiyyat ləğv edilib",
};

export function SlotDetailDialog({
  slot,
  detail,
  canManage,
  canManageAttendance,
  canReadStudentDetails,
  today,
  defaultJournalDate,
  onClose,
  onEditSlot,
  onAddStudent,
  onTransferStudent,
  onOpenJournal,
}: {
  slot: PlannerSlot;
  detail: PlannerWorkspaceData["slotDetail"];
  canManage: boolean;
  canManageAttendance: boolean;
  canReadStudentDetails: boolean;
  today: string;
  defaultJournalDate: string;
  onClose: () => void;
  onEditSlot: () => void;
  onAddStudent: () => void;
  onTransferStudent: (enrollmentId: string) => void;
  onOpenJournal: (date: string) => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const journalDisabled = defaultJournalDate > today || !slot.teacherId;
  const journalDisabledTitle = !slot.teacherId
    ? "Əvvəlcə slota müəllim təyin edin"
    : journalDisabled
      ? "Slot hələ başlamayıb"
      : undefined;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.slotDetailDialog}>
        <DialogHeader className={styles.slotDetailHeader}>
          <div className={styles.slotDetailTitleRow}>
            <div className={styles.slotDetailIcon}><CalendarDays /></div>
            <div>
              <DialogTitle>
                {weekdayMeta[slot.weekday].label} · {slot.startTime}–{slot.endTime}
              </DialogTitle>
              <DialogDescription>
                {shiftLabels[slot.shift]} növbəsi · {slot.teacherName} · {slot.room}
              </DialogDescription>
            </div>
          </div>
          <div className={styles.slotDetailHeaderActions}>
            {canManageAttendance ? (
              <Button
                type="button"
                onClick={() => onOpenJournal(detail.journalHistory[0]?.date ?? defaultJournalDate)}
                disabled={journalDisabled}
                title={journalDisabledTitle}
              >
                <BookOpenCheck data-icon="inline-start" /> Jurnala keç
              </Button>
            ) : null}
            {canManage ? (
              <Button type="button" variant="outline" onClick={onEditSlot}>
                <Edit3 data-icon="inline-start" /> Slotu redaktə et
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        <nav className={styles.slotDetailTabs} aria-label="Slot detalları">
          <button type="button" data-active={tab === "overview" || undefined} onClick={() => setTab("overview")}>
            Ümumi məlumat
          </button>
          <button type="button" data-active={tab === "students" || undefined} onClick={() => setTab("students")}>
            Tələbələr <span>{slot.assignedCount}</span>
          </button>
          <button type="button" data-active={tab === "journal" || undefined} onClick={() => setTab("journal")}>
            Jurnal tarixçəsi <span>{detail.journalHistory.length}</span>
          </button>
        </nav>

        <div className={styles.slotDetailBody}>
          {tab === "overview" ? (
            <SlotOverview
              slot={slot}
              canManage={canManage}
              canManageAttendance={canManageAttendance}
              journalDisabled={journalDisabled}
              journalDate={detail.journalHistory[0]?.date ?? defaultJournalDate}
              onAddStudent={onAddStudent}
              onOpenJournal={onOpenJournal}
              onShowStudents={() => setTab("students")}
              onShowJournal={() => setTab("journal")}
            />
          ) : null}

          {tab === "students" ? (
            <StudentDetails
              members={detail.members}
              canManage={canManage}
              canReadStudentDetails={canReadStudentDetails}
              onAddStudent={onAddStudent}
              onTransferStudent={onTransferStudent}
            />
          ) : null}

          {tab === "journal" ? (
            <JournalHistory
              history={detail.journalHistory}
              canManageAttendance={canManageAttendance}
              journalDisabled={journalDisabled}
              defaultJournalDate={defaultJournalDate}
              onOpenJournal={onOpenJournal}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SlotOverview({
  slot,
  canManage,
  canManageAttendance,
  journalDisabled,
  journalDate,
  onAddStudent,
  onOpenJournal,
  onShowStudents,
  onShowJournal,
}: {
  slot: PlannerSlot;
  canManage: boolean;
  canManageAttendance: boolean;
  journalDisabled: boolean;
  journalDate: string;
  onAddStudent: () => void;
  onOpenJournal: (date: string) => void;
  onShowStudents: () => void;
  onShowJournal: () => void;
}) {
  const occupancy = slot.capacity ? Math.min((slot.assignedCount / slot.capacity) * 100, 100) : 0;

  return (
    <div className={styles.slotOverview}>
      <div className={styles.slotOverviewFacts}>
        <Fact icon={UserRound} label="Müəllim" value={slot.teacherName} />
        <Fact icon={DoorOpen} label="Otaq" value={slot.room} />
        <Fact icon={Clock3} label="Dərs vaxtı" value={`${slot.startTime}–${slot.endTime}`} />
        <Fact icon={CalendarDays} label="Başlanğıc" value={formatInputDate(slot.validFrom)} />
      </div>

      <section className={styles.slotCapacityPanel}>
        <div>
          <span><UsersRound /></span>
          <div><small>Slotun doluluğu</small><strong>{slot.assignedCount} / {slot.capacity} tələbə</strong></div>
          <b>{Math.round(occupancy)}%</b>
        </div>
        <span className={styles.slotCapacityTrack}><i style={{ width: `${occupancy}%` }} /></span>
      </section>

      <div className={styles.slotQuickActions}>
        <button type="button" onClick={onShowStudents}>
          <UsersRound />
          <span><strong>Tələbələri idarə et</strong><small>Məlumat, profil və transfer əməliyyatları</small></span>
          <ExternalLink />
        </button>
        <button type="button" onClick={onShowJournal}>
          <NotebookTabs />
          <span><strong>Jurnal tarixçəsi</strong><small>Əvvəlki dərslər və davamiyyət statusları</small></span>
          <ExternalLink />
        </button>
      </div>

      {canManage || canManageAttendance ? (
        <div className={styles.slotOverviewActions}>
          {canManage ? (
            <Button type="button" variant="outline" onClick={onAddStudent}>
              <UserPlus data-icon="inline-start" /> Tələbə əlavə et
            </Button>
          ) : null}
          {canManageAttendance ? (
            <Button type="button" onClick={() => onOpenJournal(journalDate)} disabled={journalDisabled}>
              <BookOpenCheck data-icon="inline-start" /> Davamiyyəti aç
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return (
    <div className={styles.slotDetailFact}>
      <span><Icon /></span>
      <div><small>{label}</small><strong>{value}</strong></div>
    </div>
  );
}

function StudentDetails({
  members,
  canManage,
  canReadStudentDetails,
  onAddStudent,
  onTransferStudent,
}: {
  members: PlannerStudentDetail[];
  canManage: boolean;
  canReadStudentDetails: boolean;
  onAddStudent: () => void;
  onTransferStudent: (enrollmentId: string) => void;
}) {
  return (
    <section className={styles.slotStudentSection}>
      <div className={styles.slotSectionToolbar}>
        <div><h3>Slotdakı tələbələr</h3><p>Əlaqə, təhsil, qeydiyyat və slot planı məlumatları.</p></div>
        {canManage ? (
          <Button type="button" onClick={onAddStudent}>
            <UserPlus data-icon="inline-start" /> Tələbə əlavə et
          </Button>
        ) : null}
      </div>

      {!canReadStudentDetails && members.length ? (
        <div className={styles.studentPrivacyNote}>
          Ətraflı şəxsi məlumatları görmək üçün “Tələbələri gör” icazəsi tələb olunur.
        </div>
      ) : null}

      <div className={styles.slotStudentList}>
        {members.map((member) => (
          <StudentCard
            key={member.assignmentId}
            member={member}
            canManage={canManage}
            canReadStudentDetails={canReadStudentDetails}
            onTransfer={() => onTransferStudent(member.enrollmentId)}
          />
        ))}
        {!members.length ? (
          <div className={styles.slotDetailEmpty}>
            <UsersRound />
            <strong>Bu slotda tələbə yoxdur</strong>
            <p>Slot planından tələbə əlavə edə və ya başqa slotdan transfer edə bilərsiniz.</p>
            {canManage ? <Button type="button" onClick={onAddStudent}>Tələbə əlavə et</Button> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StudentCard({
  member,
  canManage,
  canReadStudentDetails,
  onTransfer,
}: {
  member: PlannerStudentDetail;
  canManage: boolean;
  canReadStudentDetails: boolean;
  onTransfer: () => void;
}) {
  return (
    <details className={styles.slotStudentCard}>
      <summary>
        <Avatar name={member.studentName} />
        <span className={styles.slotStudentIdentity}>
          <strong>{member.studentName}</strong>
          <small>{member.studentCode} · {member.program}</small>
        </span>
        {canReadStudentDetails ? (
          <span className={styles.slotStudentContact}>
            <small>{member.phone ?? "Telefon yoxdur"}</small>
            <small>{member.educationLevel ?? "Təhsil səviyyəsi qeyd edilməyib"}</small>
          </span>
        ) : null}
        <span className={styles.slotStudentStatus} data-status={member.lifecycleStatus || "UNKNOWN"}>
          {lifecycleLabels[member.lifecycleStatus] ?? "Tələbə"}
        </span>
      </summary>

      <div className={styles.slotStudentCardBody}>
        {canReadStudentDetails ? (
          <>
            <div className={styles.studentInfoGrid}>
              <InfoItem icon={Phone} label="Telefon" value={member.phone ?? "Qeyd edilməyib"} href={member.phone ? `tel:${member.phone}` : undefined} />
              <InfoItem icon={Mail} label="E-poçt" value={member.email ?? "Qeyd edilməyib"} href={member.email ? `mailto:${member.email}` : undefined} />
              <InfoItem icon={GraduationCap} label="Təhsil səviyyəsi" value={member.educationLevel ?? "Qeyd edilməyib"} />
              <InfoItem icon={UserRound} label="Menecer" value={member.managerName ?? "Təyin edilməyib"} />
              <InfoItem icon={CalendarDays} label="Qeydiyyat tarixi" value={formatInputDate(member.registeredAt)} />
              <InfoItem icon={CalendarDays} label="Slota keçid tarixi" value={formatInputDate(member.assignmentStartedAt)} />
              <InfoItem icon={NotebookTabs} label="Qeydiyyat statusu" value={enrollmentLabels[member.enrollmentStatus] ?? member.enrollmentStatus} />
              <InfoItem
                icon={BookOpenCheck}
                label="Aylıq paket"
                value={`${member.lessonsPerMonth ?? "—"} dərs · ${member.monthlyFee}`}
              />
            </div>

            {member.relatedContacts.length ? (
              <div className={styles.relatedContacts}>
                <strong>Valideyn və əlaqəli şəxslər</strong>
                <div>
                  {member.relatedContacts.map((contact) => (
                    <span key={contact.id}>
                      <b>{contact.name}</b>
                      <small>
                        {contact.relationshipType}
                        {contact.isPrimaryContact ? " · Əsas əlaqə" : ""}
                        {contact.isPayer ? " · Ödəyici" : ""}
                      </small>
                      {contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : null}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className={styles.studentNotes}>
              <strong>Qeyd</strong>
              <p>{member.notes ?? "Tələbə haqqında əlavə qeyd yoxdur."}</p>
            </div>
          </>
        ) : null}

        <div className={styles.studentCardActions}>
          {canReadStudentDetails ? (
            <Link href={`/students/${member.studentId}`} className={styles.studentProfileLink}>
              <ExternalLink /> Profil və redaktə
            </Link>
          ) : null}
          {canManage ? (
            <Button type="button" variant="outline" onClick={onTransfer}>
              <ArrowRightLeft data-icon="inline-start" /> Transfer et
            </Button>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className={styles.studentInfoItem}>
      <Icon />
      <span><small>{label}</small>{href ? <a href={href}>{value}</a> : <strong>{value}</strong>}</span>
    </div>
  );
}

function JournalHistory({
  history,
  canManageAttendance,
  journalDisabled,
  defaultJournalDate,
  onOpenJournal,
}: {
  history: PlannerWorkspaceData["slotDetail"]["journalHistory"];
  canManageAttendance: boolean;
  journalDisabled: boolean;
  defaultJournalDate: string;
  onOpenJournal: (date: string) => void;
}) {
  return (
    <section className={styles.slotJournalSection}>
      <div className={styles.slotSectionToolbar}>
        <div><h3>Jurnal tarixçəsi</h3><p>Son 12 dərsin davamiyyət qeydləri. Statusa klikləyərək redaktə edə bilərsiniz.</p></div>
        {canManageAttendance ? (
          <Button type="button" onClick={() => onOpenJournal(history[0]?.date ?? defaultJournalDate)} disabled={journalDisabled}>
            <BookOpenCheck data-icon="inline-start" /> Jurnalı aç
          </Button>
        ) : null}
      </div>

      <div className={styles.slotJournalList}>
        {history.map((session) => (
          <article className={styles.slotJournalSession} key={session.id}>
            <header>
              <div>
                <CalendarDays />
                <span><strong>{session.dateLabel}</strong><small>{session.startTime}–{session.endTime}</small></span>
              </div>
              <div className={styles.journalSessionStats}>
                <span data-state="present"><Check /> {session.presentCount} gəldi</span>
                <span data-state="absent"><X /> {session.absentCount} gəlmədi</span>
                {canManageAttendance ? (
                  <button type="button" onClick={() => onOpenJournal(session.date)}>Redaktə et</button>
                ) : null}
              </div>
            </header>
            <div className={styles.journalRecords}>
              {session.records.map((record) => {
                const status = record.attendanceStatus ?? "unmarked";
                return (
                  <div key={record.assignmentId}>
                    <Avatar name={record.studentName} compact />
                    <span><strong>{record.studentName}</strong><small>{record.studentCode} · {record.program}</small></span>
                    {canManageAttendance ? (
                      <button
                        type="button"
                        className={cx(styles.historyStatus, styles[`historyStatus_${status}`])}
                        onClick={() => onOpenJournal(session.date)}
                        aria-label={`${record.studentName} üçün davamiyyət statusunu dəyiş`}
                      >
                        {status === "present" ? <Check /> : status === "absent" ? <X /> : <Clock3 />}
                        {status === "present" ? "Gəldi" : status === "absent" ? "Gəlmədi" : "Qeyd yoxdur"}
                      </button>
                    ) : (
                      <span className={cx(styles.historyStatus, styles[`historyStatus_${status}`])}>
                        {status === "present" ? "Gəldi" : status === "absent" ? "Gəlmədi" : "Qeyd yoxdur"}
                      </span>
                    )}
                    <small className={styles.historyNote}>{record.note || "Qeyd yoxdur"}</small>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
        {!history.length ? (
          <div className={styles.slotDetailEmpty}>
            <NotebookTabs />
            <strong>Jurnal tarixçəsi hələ yaranmayıb</strong>
            <p>İlk davamiyyət saxlanıldıqdan sonra dərs tarixçəsi burada avtomatik görünəcək.</p>
            {canManageAttendance && !journalDisabled ? (
              <Button type="button" onClick={() => onOpenJournal(defaultJournalDate)}>İlk davamiyyəti yaz</Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Avatar({ name, compact = false }: { name: string; compact?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("az"))
    .join("");
  return <span className={cx(styles.avatar, compact && styles.compactAvatar)} aria-hidden="true">{initials}</span>;
}

function formatInputDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}
