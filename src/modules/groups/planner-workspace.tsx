"use client";

import {
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
  type FormEvent,
} from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronRight,
  CircleMinus,
  Clock3,
  DoorOpen,
  Edit3,
  Plus,
  QrCode,
  RotateCcw,
  Trash2,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormSelect } from "@/components/ui/select";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError } from "@/lib/app-notifications";
import {
  groupWeekdays,
  formatNumericDateAz,
  orderedWeekdays,
  weekdayMeta,
  type GroupWeekdayCode,
} from "@/modules/groups/shared";
import type {
  PlannerJournalMember,
  PlannerSlot,
  PlannerWorkspaceData,
} from "@/modules/groups/planner-queries";
import {
  firstSlotOccurrenceDate,
  minimumAssignmentDate,
  preferredAssignmentDate,
  selectedSlotsFirst,
  slotsForAssignedTeacher,
} from "@/modules/groups/planner-assignment";
import { bakuTimeOptions, buildPlannerTimeAxis } from "@/modules/groups/planner-time";
import { SlotDetailDialog } from "@/modules/groups/slot-detail-dialog";
import { AttendanceQrDialog } from "@/modules/groups/attendance-qr-dialog";
import styles from "./planner.module.css";

type PlannerActions = {
  createSlot: (formData: FormData) => Promise<unknown>;
  updateSlot: (formData: FormData) => Promise<unknown>;
  deleteSlot: (formData: FormData) => Promise<unknown>;
  replaceSchedule: (formData: FormData) => Promise<unknown>;
  saveAttendance: (formData: FormData) => Promise<unknown>;
};

const shiftMeta = {
  morning: { label: "Səhər", value: "MORNING" },
  afternoon: { label: "Günorta", value: "AFTERNOON" },
  evening: { label: "Axşam", value: "EVENING" },
} as const;

type TeacherSlotStyle = CSSProperties & {
  "--slot-accent": string;
  "--slot-accent-strong": string;
  "--slot-surface": string;
  "--slot-surface-end": string;
  "--slot-border": string;
  "--slot-shadow": string;
};

const teacherSlotPalettes: readonly TeacherSlotStyle[] = [
  { "--slot-accent": "#2563eb", "--slot-accent-strong": "#1d4ed8", "--slot-surface": "#edf4ff", "--slot-surface-end": "#fbfdff", "--slot-border": "#bfd3f8", "--slot-shadow": "rgba(37, 99, 235, .14)" },
  { "--slot-accent": "#7c3aed", "--slot-accent-strong": "#6d28d9", "--slot-surface": "#f5f0ff", "--slot-surface-end": "#fdfbff", "--slot-border": "#d9c7f7", "--slot-shadow": "rgba(124, 58, 237, .14)" },
  { "--slot-accent": "#0f9f77", "--slot-accent-strong": "#087a5b", "--slot-surface": "#ebfaf5", "--slot-surface-end": "#fbfffd", "--slot-border": "#b9e6d6", "--slot-shadow": "rgba(15, 159, 119, .14)" },
  { "--slot-accent": "#d97706", "--slot-accent-strong": "#b45309", "--slot-surface": "#fff7e8", "--slot-surface-end": "#fffdf8", "--slot-border": "#f0d29d", "--slot-shadow": "rgba(217, 119, 6, .14)" },
  { "--slot-accent": "#df4f76", "--slot-accent-strong": "#be365d", "--slot-surface": "#fff0f5", "--slot-surface-end": "#fffafd", "--slot-border": "#f3bfd0", "--slot-shadow": "rgba(223, 79, 118, .14)" },
  { "--slot-accent": "#0d9488", "--slot-accent-strong": "#0f766e", "--slot-surface": "#ebfaf9", "--slot-surface-end": "#fbfffe", "--slot-border": "#b5e4df", "--slot-shadow": "rgba(13, 148, 136, .14)" },
  { "--slot-accent": "#4f46e5", "--slot-accent-strong": "#4338ca", "--slot-surface": "#f0f1ff", "--slot-surface-end": "#fcfcff", "--slot-border": "#c9caf8", "--slot-shadow": "rgba(79, 70, 229, .14)" },
  { "--slot-accent": "#e76642", "--slot-accent-strong": "#c94b2c", "--slot-surface": "#fff2ed", "--slot-surface-end": "#fffaf8", "--slot-border": "#f3c4b5", "--slot-shadow": "rgba(231, 102, 66, .14)" },
  { "--slot-accent": "#0284c7", "--slot-accent-strong": "#0369a1", "--slot-surface": "#edf8ff", "--slot-surface-end": "#fbfeff", "--slot-border": "#b9ddf1", "--slot-shadow": "rgba(2, 132, 199, .14)" },
  { "--slot-accent": "#c026d3", "--slot-accent-strong": "#a21caf", "--slot-surface": "#fcf0ff", "--slot-surface-end": "#fffaff", "--slot-border": "#e9c1ef", "--slot-shadow": "rgba(192, 38, 211, .14)" },
  { "--slot-accent": "#6d970f", "--slot-accent-strong": "#52770a", "--slot-surface": "#f5fae9", "--slot-surface-end": "#fdfff9", "--slot-border": "#d5e5ad", "--slot-shadow": "rgba(109, 151, 15, .14)" },
  { "--slot-accent": "#b33c64", "--slot-accent-strong": "#922f51", "--slot-surface": "#fff0f5", "--slot-surface-end": "#fffbfc", "--slot-border": "#eebdce", "--slot-shadow": "rgba(179, 60, 100, .14)" },
];

function teacherColorHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fallbackTeacherSlotStyle(index: number): TeacherSlotStyle {
  const hue = Math.round((index * 137.508) % 360);
  return {
    "--slot-accent": `hsl(${hue} 68% 47%)`,
    "--slot-accent-strong": `hsl(${hue} 63% 35%)`,
    "--slot-surface": `hsl(${hue} 72% 96%)`,
    "--slot-surface-end": `hsl(${hue} 70% 99%)`,
    "--slot-border": `hsl(${hue} 48% 82%)`,
    "--slot-shadow": `hsl(${hue} 55% 40% / .14)`,
  };
}

function buildTeacherSlotStyles(teacherIds: string[]) {
  const result = new Map<string, TeacherSlotStyle>();
  const usedPaletteIndexes = new Set<number>();
  const uniqueTeacherIds = [...new Set(teacherIds)].sort();
  let fallbackIndex = teacherSlotPalettes.length;

  uniqueTeacherIds.forEach((teacherId) => {
    const startingIndex = teacherColorHash(teacherId) % teacherSlotPalettes.length;
    let paletteIndex = startingIndex;

    while (usedPaletteIndexes.has(paletteIndex) && usedPaletteIndexes.size < teacherSlotPalettes.length) {
      paletteIndex = (paletteIndex + 1) % teacherSlotPalettes.length;
    }

    if (usedPaletteIndexes.size < teacherSlotPalettes.length) {
      usedPaletteIndexes.add(paletteIndex);
      result.set(teacherId, teacherSlotPalettes[paletteIndex]);
      return;
    }

    result.set(teacherId, fallbackTeacherSlotStyle(fallbackIndex));
    fallbackIndex += 1;
  });

  return result;
}

export function PlannerWorkspace({
  data,
  actions,
  initialAttendanceOpen = false,
  initialDetailsOpen = false,
}: {
  data: PlannerWorkspaceData;
  actions: PlannerActions;
  initialAttendanceOpen?: boolean;
  initialDetailsOpen?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedSlotId, setSelectedSlotId] = useState(data.selectedSlotId);
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [slotDialogMode, setSlotDialogMode] = useState<"create" | "edit" | null>(null);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentEnrollmentId, setAssignmentEnrollmentId] = useState<string>();
  const [attendanceOpen, setAttendanceOpen] = useState(initialAttendanceOpen);
  const [attendanceQrOpen, setAttendanceQrOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(initialDetailsOpen);

  const teacherSlotStyles = useMemo(
    () => buildTeacherSlotStyles(data.teachers.map((teacher) => teacher.id)),
    [data.teachers],
  );

  const filteredSlots = useMemo(() => {
    return data.slots.filter((slot) => {
      return (
          teacherFilter === "all"
          || (teacherFilter === "unassigned" ? slot.teacherId === null : slot.teacherId === teacherFilter)
        )
        && (shiftFilter === "all" || slot.shift === shiftFilter);
    });
  }, [data.slots, shiftFilter, teacherFilter]);

  const selectedSlot = filteredSlots.find((slot) => slot.id === selectedSlotId)
    ?? filteredSlots[0]
    ?? data.slots.find((slot) => slot.id === selectedSlotId)
    ?? data.slots[0];
  const selectedJournalDisabled = Boolean(
    selectedSlot
    && selectedSlot.id === data.journal.slotId
    && data.journal.date > data.today,
  );
  const times = useMemo(() => buildPlannerTimeAxis(filteredSlots), [filteredSlots]);
  const plannedCount = data.slots.reduce((sum, slot) => sum + slot.assignedCount, 0);
  const openSeats = data.slots.reduce(
    (sum, slot) => sum + Math.max(slot.capacity - slot.assignedCount, 0),
    0,
  );

  function runAction(
    action: () => Promise<unknown>,
    success: string,
    close: () => void,
    onSuccess?: (result: unknown) => void,
  ) {
    startTransition(() => {
      void (async () => {
        try {
          const result = unwrapActionResult(await action());
          onSuccess?.(result);
          close();
          setNotice(success);
          router.refresh();
        } catch (error) {
          setNotice(notifyCaughtError(error, "Əməliyyat tamamlanmadı"));
        }
      })();
    });
  }

  function openAssignment(enrollmentId?: string) {
    setAssignmentEnrollmentId(enrollmentId);
    setAssignmentOpen(true);
  }

  function openSlotDetails(slot: PlannerSlot) {
    setSelectedSlotId(slot.id);
    if (slot.id === data.selectedSlotId) {
      setDetailsOpen(true);
      return;
    }
    router.push(`/groups?slot=${slot.id}&details=1` as Route);
  }

  function closeSlotDetails(slot: PlannerSlot) {
    setDetailsOpen(false);
    router.replace(`/groups?slot=${slot.id}` as Route, { scroll: false });
  }

  function openAttendance(slot: PlannerSlot, date?: string) {
    setDetailsOpen(false);
    const dateParam = date ? `&date=${date}` : "";
    router.push(`/groups?slot=${slot.id}${dateParam}&attendance=1` as Route);
  }

  return (
    <section className={styles.page} aria-busy={pending}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1>Slotlar</h1>
          <p>Dərs vaxtlarını, müəllimləri, tutumu, tələbə planını və davamiyyəti bir yerdən idarə edin.</p>
        </div>
        <div className={styles.headerRight}>
          <Metric icon={CalendarDays} value={data.slots.length} label="slot" />
          <Metric icon={UsersRound} value={plannedCount} label="tələbə təyinatı" />
          <Metric icon={UserPlus} value={openSeats} label="boş yer" />
          {data.canManage ? (
            <Button type="button" onClick={() => setSlotDialogMode("create")}>
              <Plus data-icon="inline-start" /> Yeni slot
            </Button>
          ) : null}
        </div>
      </header>

      {notice ? (
        <div className={styles.notice} role="status">
          <span>{notice}</span>
          <button type="button" aria-label="Bildirişi bağla" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      ) : null}

      <div className={styles.filterBand}>
        <FilterSelect
          label="Müəllim"
          value={teacherFilter}
          onChange={setTeacherFilter}
          options={[
            { value: "unassigned", label: "Müəllim təyin edilməyib" },
            ...data.teachers.map((teacher) => ({ value: teacher.id, label: teacher.name })),
          ]}
        />
        <FilterSelect
          label="Növbə"
          value={shiftFilter}
          onChange={setShiftFilter}
          options={Object.entries(shiftMeta).map(([value, meta]) => ({ value, label: meta.label }))}
        />
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setTeacherFilter("all");
            setShiftFilter("all");
          }}
        >
          <RotateCcw data-icon="inline-start" /> Sıfırla
        </Button>
      </div>

      <div className={styles.workspace}>
        <main className={styles.canvas}>
          {filteredSlots.length ? (
            <div
              className={styles.timetable}
              style={{ "--planner-days": orderedWeekdays.length } as CSSProperties}
            >
              <div className={styles.corner} aria-label="Bakı vaxtı, 24-saat formatı">
                <Clock3 size={16} /><span>Bakı · 24s</span>
              </div>
              {orderedWeekdays.map((day) => (
                <div className={styles.dayHead} key={day}>{weekdayMeta[day].label}</div>
              ))}
              {times.map((time) => (
                <TimeRow
                  key={time}
                  time={time}
                  weekdays={orderedWeekdays}
                  slots={filteredSlots}
                  selectedId={selectedSlot?.id}
                  teacherSlotStyles={teacherSlotStyles}
                  onSelect={openSlotDetails}
                />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <span><CalendarDays size={28} /></span>
              <h2>Uyğun slot tapılmadı</h2>
              <p>Filtrləri sıfırlayın və ya ilk həftəlik dərs slotunu yaradın.</p>
              {data.canManage ? (
                <Button type="button" onClick={() => setSlotDialogMode("create")}>
                  <Plus data-icon="inline-start" /> Yeni slot
                </Button>
              ) : null}
            </div>
          )}
        </main>

        <aside className={styles.inspector}>
          {selectedSlot ? (
            <>
              <div className={styles.inspectorHead}>
                <div>
                  <small>Dərs slotu</small>
                  <h2>{weekdayMeta[selectedSlot.weekday].label} · {shiftMeta[selectedSlot.shift].label}</h2>
                  <p>{selectedSlot.startTime}–{selectedSlot.endTime}</p>
                </div>
              </div>
              <dl className={styles.slotFacts}>
                <div><dt><UserRound size={17} /> Müəllim</dt><dd>{selectedSlot.teacherName}</dd></div>
                <div><dt><DoorOpen size={17} /> Otaq</dt><dd>{selectedSlot.room}</dd></div>
                <div><dt><CalendarDays size={17} /> Başlanğıc</dt><dd>{formatInputDate(selectedSlot.validFrom)}</dd></div>
                <div><dt><UsersRound size={17} /> Tutum</dt><dd>{selectedSlot.assignedCount} / {selectedSlot.capacity}</dd></div>
              </dl>
              <CapacityBar count={selectedSlot.assignedCount} capacity={selectedSlot.capacity} />
              <div className={styles.memberHead}>
                <strong>Tələbələr</strong><span>{selectedSlot.assignedCount}</span>
              </div>
              <div className={styles.memberList}>
                {selectedSlot.members.map((member) => (
                  <button
                    className={styles.member}
                    type="button"
                    onClick={() => data.canManage && openAssignment(member.enrollmentId)}
                    disabled={!data.canManage}
                    key={member.assignmentId}
                  >
                    <Avatar name={member.studentName} />
                    <span><strong>{member.studentName}</strong><small>{member.studentCode} · {member.program}</small></span>
                    {data.canManage ? <ChevronRight size={15} /> : null}
                  </button>
                ))}
                {!selectedSlot.members.length ? (
                  <p className={styles.noMembers}>Bu slota hələ tələbə əlavə edilməyib.</p>
                ) : null}
              </div>
              {data.canManage || data.canManageAttendance ? (
                <div className={styles.inspectorActions}>
                  {data.canManageAttendance ? (
                    <>
                      <Button
                        type="button"
                        onClick={() => setAttendanceQrOpen(true)}
                        disabled={!selectedSlot.teacherId}
                        title={!selectedSlot.teacherId ? "Əvvəlcə slota müəllim təyin edin" : undefined}
                      >
                        <QrCode data-icon="inline-start" /> QR aç
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openAttendance(selectedSlot)}
                        disabled={selectedJournalDisabled || !selectedSlot.teacherId}
                        title={
                          !selectedSlot.teacherId
                            ? "Əvvəlcə slota müəllim təyin edin"
                            : selectedJournalDisabled
                              ? "Slotun ilk dərs tarixi hələ çatmayıb"
                              : undefined
                        }
                      >
                        <BookOpenCheck data-icon="inline-start" /> Davamiyyət
                      </Button>
                    </>
                  ) : null}
                  {data.canManage ? (
                    <>
                      <Button type="button" variant="outline" onClick={() => openAssignment()}>
                        <UserPlus data-icon="inline-start" /> Tələbə planı
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setSlotDialogMode("edit")}>
                        <Edit3 data-icon="inline-start" /> Slotu redaktə et
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.inspectorEmpty}>Detalları görmək üçün slot seçin.</div>
          )}
        </aside>
      </div>

      {detailsOpen && selectedSlot && data.slotDetail.slotId === selectedSlot.id ? (
        <SlotDetailDialog
          key={selectedSlot.id}
          slot={selectedSlot}
          detail={data.slotDetail}
          canManage={data.canManage}
          canManageAttendance={data.canManageAttendance}
          canReadStudentDetails={data.canReadStudentDetails}
          today={data.today}
          defaultJournalDate={data.journal.date}
          onClose={() => closeSlotDetails(selectedSlot)}
          onEditSlot={() => {
            closeSlotDetails(selectedSlot);
            setSlotDialogMode("edit");
          }}
          onAddStudent={() => {
            closeSlotDetails(selectedSlot);
            openAssignment();
          }}
          onTransferStudent={(enrollmentId) => {
            closeSlotDetails(selectedSlot);
            openAssignment(enrollmentId);
          }}
          onOpenJournal={(date) => openAttendance(selectedSlot, date)}
        />
      ) : null}

      {slotDialogMode ? (
        <SlotDialog
          key={`${slotDialogMode}-${selectedSlot?.id ?? "new"}`}
          data={data}
          mode={slotDialogMode}
          slot={slotDialogMode === "edit" ? selectedSlot : undefined}
          pending={pending}
          onClose={() => setSlotDialogMode(null)}
          onSubmit={(formData) => runAction(
            () => slotDialogMode === "edit"
              ? actions.updateSlot(formData)
              : actions.createSlot(formData),
            slotDialogMode === "edit" ? "Slot uğurla yeniləndi." : "Yeni dərs slotu yaradıldı.",
            () => setSlotDialogMode(null),
            (result) => {
              const created = result as { id?: string } | undefined;
              if (created?.id) setSelectedSlotId(created.id);
            },
          )}
          onDelete={slotDialogMode === "edit" && selectedSlot ? () => {
            if (!window.confirm(
              `${weekdayMeta[selectedSlot.weekday].label} ${selectedSlot.startTime} slotu və ona bağlı tələbə planı/davamiyyət tam silinsin?`,
            )) return;
            const formData = new FormData();
            formData.set("slotId", selectedSlot.id);
            runAction(
              () => actions.deleteSlot(formData),
              "Dərs slotu tam silindi.",
              () => {
                setSelectedSlotId("");
                setSlotDialogMode(null);
              },
            );
          } : undefined}
        />
      ) : null}

      {assignmentOpen && selectedSlot ? (
        <AssignmentDialog
          key={`${selectedSlot.id}-${assignmentEnrollmentId ?? "new"}`}
          data={data}
          initialSlot={selectedSlot}
          initialEnrollmentId={assignmentEnrollmentId}
          teacherSlotStyles={teacherSlotStyles}
          pending={pending}
          onClose={() => setAssignmentOpen(false)}
          onSubmit={(formData, hasSlots) => runAction(
            () => actions.replaceSchedule(formData),
            hasSlots ? "Tələbənin həftəlik planı yeniləndi." : "Tələbənin slot planı silindi.",
            () => setAssignmentOpen(false),
          )}
        />
      ) : null}

      {attendanceOpen && selectedSlot && data.canManageAttendance ? (
        <AttendanceDialog
          key={`${data.journal.slotId}-${data.journal.date}`}
          slot={selectedSlot}
          journal={data.journal}
          today={data.today}
          canManageLesson={data.canManage}
          pending={pending}
          onClose={() => {
            setAttendanceOpen(false);
            router.replace(`/groups?slot=${selectedSlot.id}` as Route);
          }}
          onDateChange={(date) => {
            router.replace(`/groups?slot=${selectedSlot.id}&date=${date}&attendance=1` as Route);
          }}
          onSubmit={(formData) => runAction(
            () => actions.saveAttendance(formData),
            "Davamiyyət saxlanıldı.",
            () => {
              setAttendanceOpen(false);
              router.replace(`/groups?slot=${selectedSlot.id}` as Route);
            },
          )}
        />
      ) : null}

      {attendanceQrOpen && selectedSlot && data.canManageAttendance ? (
        <AttendanceQrDialog
          key={`${selectedSlot.id}-${data.today}`}
          slot={selectedSlot}
          date={data.today}
          onClose={() => {
            setAttendanceQrOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof CalendarDays;
  value: number;
  label: string;
}) {
  return (
    <div className={styles.metric}>
      <span><Icon size={17} /></span>
      <div><strong>{value}</strong><small>{label}</small></div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className={styles.filter}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">Bütün {label.toLocaleLowerCase("az")}lər</option>
        {options.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function TimeRow({
  time,
  weekdays,
  slots,
  selectedId,
  teacherSlotStyles,
  onSelect,
}: {
  time: string;
  weekdays: GroupWeekdayCode[];
  slots: PlannerSlot[];
  selectedId?: string;
  teacherSlotStyles: ReadonlyMap<string, TeacherSlotStyle>;
  onSelect: (slot: PlannerSlot) => void;
}) {
  const rowHasSlots = slots.some((slot) => slot.startTime === time);
  return (
    <>
      <div className={cx(styles.timeLabel, !rowHasSlots && styles.emptyTimeLabel)}>{time}</div>
      {weekdays.map((day) => {
        const daySlots = slots.filter((slot) => slot.weekday === day && slot.startTime === time);
        return (
          <div className={cx(styles.cell, !rowHasSlots && styles.emptyTimeCell)} key={`${time}-${day}`}>
            {daySlots.map((slot) => (
              <SlotCard
                slot={slot}
                selected={slot.id === selectedId}
                style={slot.teacherId ? teacherSlotStyles.get(slot.teacherId) : undefined}
                onSelect={onSelect}
                key={slot.id}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

function SlotCard({
  slot,
  selected,
  style,
  onSelect,
}: {
  slot: PlannerSlot;
  selected: boolean;
  style?: TeacherSlotStyle;
  onSelect: (slot: PlannerSlot) => void;
}) {
  const full = slot.assignedCount >= slot.capacity;
  return (
    <button
      className={cx(styles.slot, selected && styles.selectedSlot, full && styles.fullSlot)}
      style={style}
      type="button"
      onClick={() => onSelect(slot)}
      aria-label={`${slot.teacherName}, ${slot.startTime}–${slot.endTime} slotunun detallarını aç`}
    >
      <span className={styles.slotTop}>
        <strong>{shiftMeta[slot.shift].label}</strong>
        <small>{slot.room}</small>
      </span>
      <span className={styles.slotTime}>{slot.startTime}–{slot.endTime}</span>
      <span className={styles.slotTeacherName}>{slot.teacherName}</span>
      <span className={styles.slotMeta}>Başlanğıc: {formatInputDate(slot.validFrom)}</span>
      <span className={styles.slotBottom}>
        <b>{slot.assignedCount} / {slot.capacity}</b>
        <i>
          {slot.members.slice(0, 3).map((member) => (
            <Avatar name={member.studentName} compact key={member.assignmentId} />
          ))}
        </i>
      </span>
      <CapacityBar count={slot.assignedCount} capacity={slot.capacity} />
    </button>
  );
}

function CapacityBar({ count, capacity }: { count: number; capacity: number }) {
  const ratio = capacity ? count / capacity : 0;
  return (
    <span
      className={styles.capacityTrack}
      data-state={ratio >= 1 ? "full" : ratio >= 0.8 ? "busy" : "available"}
    >
      <i style={{ width: `${Math.min(ratio * 100, 100)}%` }} />
    </span>
  );
}

function formatInputDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function Avatar({ name, compact = false }: { name: string; compact?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("az"))
    .join("");
  return (
    <span className={cx(styles.avatar, compact && styles.compactAvatar)} aria-hidden="true">
      {initials}
    </span>
  );
}

function SlotDialog({
  data,
  mode,
  slot,
  pending,
  onClose,
  onSubmit,
  onDelete,
}: {
  data: PlannerWorkspaceData;
  mode: "create" | "edit";
  slot?: PlannerSlot;
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
  onDelete?: () => void;
}) {
  const editing = mode === "edit" && Boolean(slot);
  const room = slot?.room === "Otaq seçilməyib" ? "" : slot?.room;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.slotDialog}>
        <DialogHeader>
          <DialogTitle>{editing ? "Dərs slotunu redaktə et" : "Yeni dərs slotu"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Slot birbaşa yenilənir; ayrıca gizli konteyner və ya slot versiyası yaradılmır."
              : "Günü, vaxtı, müəllimi, otağı və tutumu müəyyən edin."}
          </DialogDescription>
        </DialogHeader>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(new FormData(event.currentTarget));
          }}
        >
          {editing && slot ? <input name="slotId" type="hidden" value={slot.id} /> : null}
          <div className={styles.formGrid}>
            <label>
              <span>Müəllim</span>
              <select name="teacherId" defaultValue={slot?.teacherId ?? ""}>
                <option value="">Müəllim təyin edilməyib</option>
                {data.teachers.map((teacher) => (
                  <option value={teacher.id} key={teacher.id}>{teacher.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Gün</span>
              <select name="weekday" defaultValue={slot?.weekday ?? groupWeekdays.MONDAY}>
                {orderedWeekdays.map((day) => (
                  <option value={day} key={day}>{weekdayMeta[day].label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Növbə</span>
              <select name="shift" defaultValue={slot ? shiftMeta[slot.shift].value : "MORNING"}>
                {Object.values(shiftMeta).map((shift) => (
                  <option value={shift.value} key={shift.value}>{shift.label}</option>
                ))}
              </select>
            </label>
            <TimeSelect label="Başlama · Bakı vaxtı" name="startTime" defaultValue={slot?.startTime ?? "09:00"} />
            <TimeSelect label="Bitmə · Bakı vaxtı" name="endTime" defaultValue={slot?.endTime ?? "10:30"} />
            <label className={styles.fullField}>
              <span>Qrup adı · mobil tətbiqdə görünür</span>
              <input
                name="displayName"
                defaultValue={slot?.displayName ?? ""}
                placeholder="Məsələn: Rəsm – Başlanğıc qrupu"
                maxLength={120}
              />
            </label>
            <label><span>Otaq</span><input name="room" defaultValue={room} placeholder="Məsələn: Rəsm otağı 1" maxLength={80} /></label>
            <label><span>Tutum</span><input name="capacity" type="number" min={1} max={100} defaultValue={slot?.capacity ?? 10} required /></label>
            <label className={styles.fullField}>
              <span>{editing ? "Dəyişiklik tarixi" : "Başlama tarixi"}</span>
              <input name="validFrom" type="date" defaultValue={slot?.validFrom ?? data.today} required />
              <small className={styles.dateHint}>Keçmiş tarix də seçilə bilər.</small>
            </label>
          </div>
          <DialogFooter className={styles.slotDialogFooter}>
            {onDelete ? (
              <Button type="button" variant="destructive" onClick={onDelete} disabled={pending}>
                <Trash2 data-icon="inline-start" /> Slotu sil
              </Button>
            ) : <span />}
            <div className={styles.slotDialogActions}>
              <Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Yadda saxlanılır..." : editing ? "Dəyişiklikləri saxla" : "Slot yarat"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TimeSelect({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: "startTime" | "endTime";
  defaultValue: string;
}) {
  const options = bakuTimeOptions.includes(defaultValue)
    ? bakuTimeOptions
    : [...bakuTimeOptions, defaultValue].toSorted();

  return (
    <label className={styles.timeField}>
      <span>{label}</span>
      <select name={name} defaultValue={defaultValue} required>
        {options.map((time) => <option value={time} key={time}>{time}</option>)}
      </select>
      <small>24-saat formatı · AM/PM yoxdur</small>
    </label>
  );
}

function AssignmentDialog({
  data,
  initialSlot,
  initialEnrollmentId,
  teacherSlotStyles,
  pending,
  onClose,
  onSubmit,
}: {
  data: PlannerWorkspaceData;
  initialSlot: PlannerSlot;
  initialEnrollmentId?: string;
  teacherSlotStyles: ReadonlyMap<string, TeacherSlotStyle>;
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData, hasSlots: boolean) => void;
}) {
  const firstEnrollment = data.enrollments.find((item) => item.id === initialEnrollmentId)
    ?? data.enrollments[0];
  const initialTeacherSlots = slotsForAssignedTeacher(
    data.slots,
    firstEnrollment?.teacherId ?? null,
  );
  const initialTeacherSlotIds = new Set(initialTeacherSlots.map((slot) => slot.id));
  const scheduledSelection = firstEnrollment?.slotIds.filter((slotId) => (
    initialTeacherSlotIds.has(slotId)
  )) ?? [];
  const initialSelection = scheduledSelection.length
    ? scheduledSelection
    : firstEnrollment && initialTeacherSlotIds.has(initialSlot.id) ? [initialSlot.id] : [];
  const [enrollmentId, setEnrollmentId] = useState(firstEnrollment?.id ?? "");
  const [selected, setSelected] = useState<string[]>(initialSelection);
  const [activeWeekday, setActiveWeekday] = useState<GroupWeekdayCode>(() => (
    initialTeacherSlots.find((slot) => initialSelection.includes(slot.id))?.weekday
      ?? initialTeacherSlots[0]?.weekday
      ?? initialSlot.weekday
  ));
  const [validFrom, setValidFrom] = useState(() => (
    preferredAssignmentDate(initialSelection, initialTeacherSlots, data.today)
  ));
  const enrollmentsById = useMemo(
    () => new Map(data.enrollments.map((item) => [item.id, item])),
    [data.enrollments],
  );
  const enrollment = enrollmentsById.get(enrollmentId);
  const enrollmentOptions = useMemo(
    () => data.enrollments.map((item) => ({
      value: item.id,
      label: `${item.studentName} · ${item.studentCode} · ${item.program}`,
      searchText: `${item.studentName} ${item.studentCode} ${item.program} ${item.teacherName ?? ""}`,
    })),
    [data.enrollments],
  );
  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const slotsById = useMemo(() => new Map(data.slots.map((slot) => [slot.id, slot])), [data.slots]);
  const teacherSlots = useMemo(
    () => slotsForAssignedTeacher(data.slots, enrollment?.teacherId ?? null),
    [data.slots, enrollment?.teacherId],
  );
  const activeDaySlots = useMemo(
    () => selectedSlotsFirst(
      teacherSlots.filter((slot) => slot.weekday === activeWeekday),
      selectedIds,
    ),
    [activeWeekday, selectedIds, teacherSlots],
  );
  const selectedCountByDay = useMemo(() => {
    const counts = new Map<GroupWeekdayCode, number>();
    selected.forEach((id) => {
      const weekday = slotsById.get(id)?.weekday;
      if (weekday) counts.set(weekday, (counts.get(weekday) ?? 0) + 1);
    });
    return counts;
  }, [selected, slotsById]);
  function changeEnrollment(value: string) {
    const next = enrollmentsById.get(value);
    const nextTeacherSlots = slotsForAssignedTeacher(data.slots, next?.teacherId ?? null);
    const nextTeacherSlotIds = new Set(nextTeacherSlots.map((slot) => slot.id));
    const nextScheduledSelection = next?.slotIds.filter((slotId) => (
      nextTeacherSlotIds.has(slotId)
    )) ?? [];
    const nextSelection = nextScheduledSelection.length
      ? nextScheduledSelection
      : next && nextTeacherSlotIds.has(initialSlot.id) ? [initialSlot.id] : [];
    setEnrollmentId(value);
    setSelected(nextSelection);
    setActiveWeekday(
      nextTeacherSlots.find((slot) => nextSelection.includes(slot.id))?.weekday
        ?? nextTeacherSlots[0]?.weekday
        ?? initialSlot.weekday,
    );
    setValidFrom(preferredAssignmentDate(nextSelection, nextTeacherSlots, data.today));
  }

  function toggle(slot: PlannerSlot) {
    if (slot.assignedCount >= slot.capacity && !selectedIds.has(slot.id)) return;
    const next = selected.includes(slot.id)
      ? selected.filter((id) => id !== slot.id)
      : [...selected, slot.id];
    setSelected(next);
    setValidFrom(preferredAssignmentDate(next, teacherSlots, data.today));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("slotIds", JSON.stringify(selected));
    onSubmit(formData, selected.length > 0);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.assignmentDialog}>
        <DialogHeader className={styles.assignmentHeader}>
          <DialogTitle>Tələbə slot planı</DialogTitle>
          <DialogDescription>
            Seçilmiş tələbənin müəlliminə aid həftəlik slotları bir ekranda idarə edin.
          </DialogDescription>
        </DialogHeader>

        <form className={styles.assignmentForm} onSubmit={submit}>
          <div className={styles.assignmentBody}>
            <div className={styles.assignmentMain}>
              <div className={styles.studentField}>
                <span>Tələbə</span>
                <FormSelect
                  name="enrollmentId"
                  value={enrollmentId}
                  onValueChange={changeEnrollment}
                  options={enrollmentOptions}
                  placeholder={data.enrollments.length ? "Tələbə seçin" : "Aktiv tələbə tapılmadı"}
                  searchPlaceholder="Tələbə adı, kodu və ya proqram üzrə axtarın..."
                  aria-label="Tələbə seçin"
                  icon={UserRound}
                  searchable
                  required
                  className={styles.studentCombobox}
                  contentClassName={styles.studentDropdown}
                />
              </div>

              {enrollment ? (
                <div
                  className={styles.teacherContext}
                  data-empty={!enrollment.teacherId || undefined}
                  aria-live="polite"
                >
                  <span className={styles.teacherContextIcon}><UserRound /></span>
                  <div>
                    <small>Təyin edilmiş müəllim</small>
                    <strong>{enrollment.teacherName ?? "Müəllim təyin edilməyib"}</strong>
                  </div>
                  <p>
                    {enrollment.teacherId
                      ? "Yalnız bu müəllimin uyğun slotları göstərilir."
                      : "Əvvəlcə Tələbələr bölməsindən müəllim təyin edin."}
                  </p>
                </div>
              ) : null}

              <div className={styles.assignmentSectionHeading}>
                <div>
                  <h3>Həftəlik seçim</h3>
                  <p>Günü seçin, sonra uyğun dərs slotlarını əlavə edin.</p>
                </div>
                <span>{activeDaySlots.length} slot</span>
              </div>
              <div className={styles.weekdayTabs} role="tablist" aria-label="Həftənin günləri">
                {orderedWeekdays.map((day) => {
                  const selectedCount = selectedCountByDay.get(day) ?? 0;
                  return (
                    <button
                      className={cx(styles.weekdayTab, activeWeekday === day && styles.activeWeekdayTab)}
                      type="button"
                      role="tab"
                      aria-selected={activeWeekday === day}
                      aria-controls="weekday-slot-panel"
                      onClick={() => setActiveWeekday(day)}
                      key={day}
                    >
                      <span>{weekdayMeta[day].shortLabel}</span>
                      {selectedCount ? <b>{selectedCount}</b> : null}
                    </button>
                  );
                })}
              </div>
              <div
                className={styles.slotChoiceGrid}
                id="weekday-slot-panel"
                role="tabpanel"
                aria-label={`${weekdayMeta[activeWeekday].label} slotları`}
              >
                {activeDaySlots.map((slot) => {
                  const active = selectedIds.has(slot.id);
                  const full = slot.assignedCount >= slot.capacity;
                  const occurrenceDate = firstSlotOccurrenceDate(validFrom, slot);
                  return (
                    <button
                      className={cx(
                        styles.slotChoice,
                        active && styles.activeChoice,
                        full && !active && styles.disabledChoice,
                      )}
                      style={slot.teacherId ? teacherSlotStyles.get(slot.teacherId) : undefined}
                      type="button"
                      onClick={() => toggle(slot)}
                      key={slot.id}
                      disabled={full && !active}
                      aria-pressed={active}
                      aria-label={`${slot.startTime}–${slot.endTime}, ${slot.teacherName}, ${slot.room}${active ? ", seçilib" : ""}`}
                    >
                      <span className={styles.slotChoiceTop}>
                        <strong>{slot.startTime}–{slot.endTime}</strong>
                        <em className={active ? styles.selectedChoiceLabel : undefined}>
                          {active ? <><Check size={12} /> Seçilib</> : shiftMeta[slot.shift].label}
                        </em>
                      </span>
                      <span className={styles.slotChoiceTeacher}>
                        <UserRound size={14} />
                        <strong>{slot.teacherName}</strong>
                      </span>
                      <span className={styles.slotChoiceDate}>
                        <CalendarDays size={13} />
                        {formatNumericDateAz(occurrenceDate)}
                      </span>
                      <span className={styles.slotChoiceBottom}>
                        <small><DoorOpen size={13} />{slot.room}</small>
                        <b><UsersRound size={13} />{full && !active ? "Dolu" : `${slot.assignedCount} / ${slot.capacity}`}</b>
                      </span>
                    </button>
                  );
                })}
                {activeDaySlots.length ? null : (
                  <span className={styles.emptySlotDay}>
                    <CalendarDays />
                    <strong>
                      {enrollment?.teacherId
                        ? `${enrollment.teacherName} üçün bu gün uyğun slot yoxdur.`
                        : "Tələbəyə müəllim təyin edilməyib."}
                    </strong>
                    <small>
                      {enrollment?.teacherId
                        ? "Digər günləri seçərək müəllimin uyğun vaxtlarına baxın."
                        : "Slot seçimi müəllim təyin edildikdən sonra aktiv olacaq."}
                    </small>
                  </span>
                )}
              </div>
            </div>

            <aside className={styles.assignmentSummary}>
              <h3>Seçilmiş plan</h3>
              <div className={styles.planCount}>
                <span><CalendarDays size={20} /></span>
                <div><strong>{selected.length} dərs / həftə</strong></div>
              </div>
              <div className={styles.summaryDetails}>
                <ul>
                  {selected.map((id) => {
                    const slot = slotsById.get(id);
                    const occurrenceDate = slot ? firstSlotOccurrenceDate(validFrom, slot) : null;
                    return slot ? (
                      <li key={id}>
                        <CalendarDays size={16} />
                        <span>
                          {weekdayMeta[slot.weekday].shortLabel} · {formatNumericDateAz(occurrenceDate!)} · {slot.startTime}–{slot.endTime}
                        </span>
                      </li>
                    ) : null;
                  })}
                </ul>
                {selected.length && enrollment?.teacherName ? (
                  <p><UserRound size={16} /> {enrollment.teacherName}</p>
                ) : <p>Heç bir slot seçilməyib. Plan saxlananda silinəcək.</p>}
              </div>
              <label className={styles.startDateField}>
                <span>Plan üçün ən erkən tarix</span>
                <input
                  name="validFrom"
                  type="date"
                  min={minimumAssignmentDate(selected, teacherSlots)}
                  value={validFrom}
                  onChange={(event) => setValidFrom(event.target.value)}
                  required
                />
                <small className={styles.startDateHint}>
                  Hər slotun real başlanğıc günü yuxarıda avtomatik hesablanır.
                </small>
              </label>
              {enrollment?.lessonsPerMonth ? (
                <div className={styles.packageNote}>
                  <span>Aylıq paket</span><strong>{enrollment.lessonsPerMonth} dərs</strong>
                </div>
              ) : null}
            </aside>
          </div>
          <DialogFooter className={styles.assignmentFooter}>
            <Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button>
            <Button
              type="submit"
              disabled={pending || !enrollmentId || Boolean(enrollment && !enrollment.teacherId)}
              title={enrollment && !enrollment.teacherId ? "Əvvəlcə tələbəyə müəllim təyin edin" : undefined}
            >
              {pending ? "Yadda saxlanılır..." : selected.length ? "Planı yadda saxla" : "Planı sil"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceDialog({
  slot,
  journal,
  today,
  canManageLesson,
  pending,
  onClose,
  onDateChange,
  onSubmit,
}: {
  slot: PlannerSlot;
  journal: PlannerWorkspaceData["journal"];
  today: string;
  canManageLesson: boolean;
  pending: boolean;
  onClose: () => void;
  onDateChange: (date: string) => void;
  onSubmit: (formData: FormData) => void;
}) {
  const [rows, setRows] = useState<PlannerJournalMember[]>(journal.members);
  const [sessionStatus, setSessionStatus] = useState(journal.status);

  function updateRow(
    enrollmentId: string,
    patch: Partial<Pick<PlannerJournalMember, "attendanceStatus" | "note">>,
  ) {
    setRows((current) => current.map((row) => (
      row.enrollmentId === enrollmentId ? { ...row, ...patch } : row
    )));
  }

  function markAll(attendanceStatus: PlannerJournalMember["attendanceStatus"]) {
    setRows((current) => current.map((row) => ({ ...row, attendanceStatus })));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("items", JSON.stringify(rows.map((row) => ({
      enrollmentId: row.enrollmentId,
      status: row.attendanceStatus,
      note: row.note,
    }))));
    onSubmit(formData);
  }

  const presentCount = rows.filter((row) => row.attendanceStatus === "present").length;
  const absentCount = rows.filter((row) => row.attendanceStatus === "absent").length;
  const excusedCount = rows.filter((row) => row.attendanceStatus === "excused").length;
  const unmarkedCount = rows.length - presentCount - absentCount - excusedCount;
  const isFuture = journal.date > today;
  const attendanceDisabled = isFuture || sessionStatus === "CANCELLED";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.attendanceDialog}>
        <DialogHeader>
          <DialogTitle>Davamiyyət · {weekdayMeta[slot.weekday].label}</DialogTitle>
          <DialogDescription>
            {slot.startTime}–{slot.endTime} · {slot.teacherName} · {journal.dateLabel}
          </DialogDescription>
        </DialogHeader>
        <form className={styles.attendanceForm} onSubmit={submit}>
          <input name="slotId" type="hidden" value={slot.id} />
          <section className={styles.attendanceLessonFields} key={journal.date}>
            <label>
              <span>Dərs statusu</span>
              <select
                name="sessionStatus"
                value={sessionStatus}
                disabled={!canManageLesson}
                onChange={(event) => {
                  const next = event.target.value as typeof sessionStatus;
                  setSessionStatus(next);
                  if (next === "CANCELLED") markAll(null);
                }}
              >
                <option value="SCHEDULED">Planlaşdırılıb</option>
                <option value="COMPLETED">Tamamlanıb</option>
                <option value="CANCELLED">Ləğv edilib</option>
                <option value="RESCHEDULED">Vaxtı/otağı dəyişib</option>
              </select>
              {!canManageLesson ? <input type="hidden" name="sessionStatus" value={sessionStatus} /> : null}
            </label>
            <label>
              <span>Başlama saatı</span>
              <input name="sessionStartTime" type="time" defaultValue={journal.startTime} disabled={!canManageLesson} required />
              {!canManageLesson ? <input type="hidden" name="sessionStartTime" value={journal.startTime} /> : null}
            </label>
            <label>
              <span>Bitmə saatı</span>
              <input name="sessionEndTime" type="time" defaultValue={journal.endTime} disabled={!canManageLesson} required />
              {!canManageLesson ? <input type="hidden" name="sessionEndTime" value={journal.endTime} /> : null}
            </label>
            <label>
              <span>Otaq / məkan</span>
              <input name="sessionLocation" defaultValue={journal.location} maxLength={80} disabled={!canManageLesson} placeholder="Məsələn: Studio 2" />
              {!canManageLesson ? <input type="hidden" name="sessionLocation" value={journal.location} /> : null}
            </label>
            <label>
              <span>Dərsin mövzusu</span>
              <input name="title" defaultValue={journal.title} maxLength={160} placeholder="Məsələn: Rəng nəzəriyyəsi" />
            </label>
            <label>
              <span>Dərsin məqsədi</span>
              <textarea name="objective" defaultValue={journal.objective} maxLength={1000} rows={2} placeholder="Bu dərsdə öyrəniləcək mövzu və məqsəd" />
            </label>
            <label>
              <span>Ev tapşırığı</span>
              <input name="homeworkTitle" defaultValue={journal.homework.title} maxLength={160} placeholder="Tapşırıq başlığı" />
            </label>
            <label>
              <span>Tapşırığın izahı</span>
              <textarea name="homeworkDescription" defaultValue={journal.homework.description} maxLength={2000} rows={2} placeholder="Tapşırığın detalları" />
            </label>
            <label>
              <span>Son tarix</span>
              <input name="homeworkDueDate" type="date" defaultValue={journal.homework.dueDate} min={journal.date} />
            </label>
          </section>
          <div className={styles.attendanceToolbar}>
            <label>
              <span>Dərs tarixi</span>
              <input
                name="date"
                type="date"
                value={journal.date}
                min={slot.validFrom}
                onChange={(event) => onDateChange(event.target.value)}
                required
              />
            </label>
            <div className={styles.attendanceToolbarRight}>
              <div className={styles.attendanceStats} aria-label="Davamiyyət xülasəsi">
                <span data-state="present"><b>{presentCount}</b> Gəldi</span>
                <span data-state="absent"><b>{absentCount}</b> Gəlmədi</span>
                <span data-state="excused"><b>{excusedCount}</b> Üzrlü</span>
                <span><b>{unmarkedCount}</b> Statussuz</span>
              </div>
              <div className={styles.attendanceBulkActions} aria-label="Kütləvi status dəyişimi">
                <button type="button" disabled={attendanceDisabled} onClick={() => markAll("present")}><Check /> Hamısı gəldi</button>
                <button type="button" disabled={attendanceDisabled} onClick={() => markAll("absent")}><X /> Hamısı gəlmədi</button>
                <button type="button" disabled={attendanceDisabled} onClick={() => markAll("excused")}><CircleMinus /> Hamısı üzrlü</button>
                <button type="button" disabled={isFuture} onClick={() => markAll(null)}><RotateCcw /> Təmizlə</button>
              </div>
            </div>
          </div>

          <div className={styles.attendanceList}>
            {rows.map((row) => (
              <div className={styles.attendanceRow} key={row.enrollmentId}>
                <Avatar name={row.studentName} />
                <div className={styles.attendanceStudent}>
                  <strong>{row.studentName}</strong>
                  <small>{row.studentCode} · {row.program}</small>
                </div>
                <div className={styles.attendanceMarks}>
                  <button
                    type="button"
                    disabled={attendanceDisabled}
                    data-active={row.attendanceStatus === "present" || undefined}
                    data-state="present"
                    onClick={() => updateRow(row.enrollmentId, { attendanceStatus: "present" })}
                    aria-label={`${row.studentName}: gəldi`}
                  >
                    <Check size={15} /> Gəldi
                  </button>
                  <button
                    type="button"
                    disabled={attendanceDisabled}
                    data-active={row.attendanceStatus === "absent" || undefined}
                    data-state="absent"
                    onClick={() => updateRow(row.enrollmentId, { attendanceStatus: "absent" })}
                    aria-label={`${row.studentName}: gəlmədi`}
                  >
                    <X size={15} /> Gəlmədi
                  </button>
                  <button
                    type="button"
                    disabled={attendanceDisabled}
                    data-active={row.attendanceStatus === "excused" || undefined}
                    data-state="excused"
                    onClick={() => updateRow(row.enrollmentId, { attendanceStatus: "excused" })}
                    aria-label={`${row.studentName}: üzrlü`}
                  >
                    <CircleMinus size={15} /> Üzrlü
                  </button>
                  <button
                    type="button"
                    disabled={isFuture}
                    className={styles.clearMark}
                    onClick={() => updateRow(row.enrollmentId, { attendanceStatus: null })}
                    aria-label={`${row.studentName}: qeydi təmizlə`}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
                <input
                  className={styles.attendanceNote}
                  value={row.note}
                  onChange={(event) => updateRow(row.enrollmentId, { note: event.target.value })}
                  placeholder="Qeyd (istəyə bağlı)"
                  maxLength={500}
                  aria-label={`${row.studentName} üçün qeyd`}
                />
              </div>
            ))}
            {!rows.length ? (
              <div className={styles.emptyAttendance}>
                Bu tarixdə slota təyin edilmiş tələbə yoxdur.
              </div>
            ) : null}
          </div>
          <DialogFooter className={styles.attendanceFooter}>
            <Button type="button" variant="outline" onClick={onClose}>Bağla</Button>
            <Button type="submit" disabled={pending || !rows.length}>
              {pending ? "Saxlanılır..." : "Davamiyyəti saxla"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
