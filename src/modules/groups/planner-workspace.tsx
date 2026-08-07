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
  Clock3,
  DoorOpen,
  Edit3,
  Plus,
  RotateCcw,
  Search,
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
  orderedWeekdays,
  weekdayMeta,
  type GroupWeekdayCode,
} from "@/modules/groups/shared";
import type {
  PlannerJournalMember,
  PlannerSlot,
  PlannerWorkspaceData,
} from "@/modules/groups/planner-queries";
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

export function PlannerWorkspace({
  data,
  actions,
  initialAttendanceOpen = false,
}: {
  data: PlannerWorkspaceData;
  actions: PlannerActions;
  initialAttendanceOpen?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedSlotId, setSelectedSlotId] = useState(data.selectedSlotId);
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [slotDialogMode, setSlotDialogMode] = useState<"create" | "edit" | null>(null);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentEnrollmentId, setAssignmentEnrollmentId] = useState<string>();
  const [attendanceOpen, setAttendanceOpen] = useState(initialAttendanceOpen);

  const filteredSlots = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("az");
    return data.slots.filter((slot) => {
      const text = `${slot.teacherName} ${slot.room} ${weekdayMeta[slot.weekday].label} ${shiftMeta[slot.shift].label}`
        .toLocaleLowerCase("az");
      return (!needle || text.includes(needle))
        && (teacherFilter === "all" || slot.teacherId === teacherFilter)
        && (shiftFilter === "all" || slot.shift === shiftFilter);
    });
  }, [data.slots, query, shiftFilter, teacherFilter]);

  const selectedSlot = filteredSlots.find((slot) => slot.id === selectedSlotId)
    ?? filteredSlots[0]
    ?? data.slots.find((slot) => slot.id === selectedSlotId)
    ?? data.slots[0];
  const times = [...new Set(filteredSlots.map((slot) => slot.startTime))].toSorted();
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

  function openAttendance(slot: PlannerSlot) {
    router.push(`/groups?slot=${slot.id}&attendance=1` as Route);
  }

  return (
    <section className={styles.page} aria-busy={pending}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1>Slotlar</h1>
          <p>Dərs vaxtlarını, müəllimləri, tutumu, tələbə planını və davamiyyəti bir yerdən idarə edin.</p>
        </div>
        <div className={styles.headerRight}>
          <Metric icon={CalendarDays} value={data.slots.length} label="aktiv slot" />
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
        <label className={styles.search}>
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Müəllim, otaq, gün və ya növbə axtar..."
          />
        </label>
        <FilterSelect
          label="Müəllim"
          value={teacherFilter}
          onChange={setTeacherFilter}
          options={data.teachers.map((teacher) => ({ value: teacher.id, label: teacher.name }))}
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
            setQuery("");
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
              <div className={styles.corner}><Clock3 size={16} /><span>Saat</span></div>
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
                  onSelect={setSelectedSlotId}
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
                    <Button type="button" onClick={() => openAttendance(selectedSlot)}>
                      <BookOpenCheck data-icon="inline-start" /> Davamiyyət
                    </Button>
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
              `${weekdayMeta[selectedSlot.weekday].label} ${selectedSlot.startTime} slotu silinsin?`,
            )) return;
            const formData = new FormData();
            formData.set("slotId", selectedSlot.id);
            runAction(
              () => actions.deleteSlot(formData),
              "Dərs slotu silindi.",
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
  onSelect,
}: {
  time: string;
  weekdays: GroupWeekdayCode[];
  slots: PlannerSlot[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className={styles.timeLabel}>{time}</div>
      {weekdays.map((day) => {
        const daySlots = slots.filter((slot) => slot.weekday === day && slot.startTime === time);
        return (
          <div className={styles.cell} key={`${time}-${day}`}>
            {daySlots.map((slot) => (
              <SlotCard
                slot={slot}
                selected={slot.id === selectedId}
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
  onSelect,
}: {
  slot: PlannerSlot;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const full = slot.assignedCount >= slot.capacity;
  return (
    <button
      className={cx(styles.slot, selected && styles.selectedSlot, full && styles.fullSlot)}
      type="button"
      onClick={() => onSelect(slot.id)}
    >
      <span className={styles.slotTop}>
        <strong>{shiftMeta[slot.shift].label}</strong>
        <small>{slot.room}</small>
      </span>
      <span className={styles.slotTime}>{slot.startTime}–{slot.endTime}</span>
      <span className={styles.slotTeacher}>{slot.teacherName}</span>
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
              ? "Dəyişiklik seçilən tarixdən tətbiq olunur və əvvəlki versiya tarixçədə saxlanılır."
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
              <select name="teacherId" defaultValue={slot?.teacherId} required>
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
            <label><span>Başlama</span><input name="startTime" type="time" defaultValue={slot?.startTime ?? "09:00"} required /></label>
            <label><span>Bitmə</span><input name="endTime" type="time" defaultValue={slot?.endTime ?? "10:30"} required /></label>
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
              <Button type="submit" disabled={pending || !data.teachers.length}>
                {pending ? "Yadda saxlanılır..." : editing ? "Dəyişiklikləri saxla" : "Slot yarat"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentDialog({
  data,
  initialSlot,
  initialEnrollmentId,
  pending,
  onClose,
  onSubmit,
}: {
  data: PlannerWorkspaceData;
  initialSlot: PlannerSlot;
  initialEnrollmentId?: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData, hasSlots: boolean) => void;
}) {
  const firstEnrollment = data.enrollments.find((item) => item.id === initialEnrollmentId)
    ?? data.enrollments[0];
  const [enrollmentId, setEnrollmentId] = useState(firstEnrollment?.id ?? "");
  const [selected, setSelected] = useState<string[]>(() => {
    if (firstEnrollment?.slotIds.length) return firstEnrollment.slotIds;
    return firstEnrollment ? [initialSlot.id] : [];
  });
  const enrollment = data.enrollments.find((item) => item.id === enrollmentId);
  const enrollmentOptions = useMemo(
    () => data.enrollments.map((item) => ({
      value: item.id,
      label: `${item.studentName} · ${item.studentCode} · ${item.program}`,
      searchText: `${item.studentName} ${item.studentCode} ${item.program}`,
    })),
    [data.enrollments],
  );
  const selectedIds = useMemo(() => new Set(selected), [selected]);
  const slotsById = useMemo(() => new Map(data.slots.map((slot) => [slot.id, slot])), [data.slots]);
  const selectedTeachers = useMemo(
    () => [...new Set(selected.map((id) => slotsById.get(id)?.teacherName).filter(Boolean))],
    [selected, slotsById],
  );

  function changeEnrollment(value: string) {
    const next = data.enrollments.find((item) => item.id === value);
    setEnrollmentId(value);
    setSelected(next?.slotIds.length ? next.slotIds : [initialSlot.id]);
  }

  function toggle(slot: PlannerSlot) {
    if (slot.assignedCount >= slot.capacity && !selectedIds.has(slot.id)) return;
    setSelected((current) => current.includes(slot.id)
      ? current.filter((id) => id !== slot.id)
      : [...current, slot.id]);
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
            Tələbənin bütün həftəlik slotlarını bir ekranda əlavə edin, dəyişin və ya silin.
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

              <div className={styles.assignmentSectionHeading}><h3>Həftəlik seçim</h3></div>
              <div className={styles.slotChoiceGrid}>
                {orderedWeekdays.map((day) => (
                  <div className={styles.slotDay} key={day}>
                    <strong>{weekdayMeta[day].shortLabel}</strong>
                    {data.slots.filter((slot) => slot.weekday === day).map((slot) => {
                      const active = selectedIds.has(slot.id);
                      const full = slot.assignedCount >= slot.capacity;
                      return (
                        <button
                          className={cx(
                            styles.slotChoice,
                            active && styles.activeChoice,
                            full && !active && styles.disabledChoice,
                          )}
                          type="button"
                          onClick={() => toggle(slot)}
                          key={slot.id}
                          disabled={full && !active}
                          aria-pressed={active}
                        >
                          <span>{shiftMeta[slot.shift].label}</span>
                          <small><Clock3 size={13} />{slot.startTime}–{slot.endTime}</small>
                          <b><UsersRound size={13} />{full && !active ? "Dolu" : `${slot.assignedCount} / ${slot.capacity}`}</b>
                          {active ? <Check className={styles.slotChoiceCheck} size={16} /> : null}
                        </button>
                      );
                    })}
                    {data.slots.some((slot) => slot.weekday === day) ? null : (
                      <span className={styles.emptySlotDay}>Slot yoxdur</span>
                    )}
                  </div>
                ))}
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
                    return slot ? (
                      <li key={id}>
                        <CalendarDays size={16} />
                        <span>{weekdayMeta[slot.weekday].shortLabel} {slot.startTime}–{slot.endTime}</span>
                      </li>
                    ) : null;
                  })}
                </ul>
                {selectedTeachers.length ? (
                  <p><UserRound size={16} /> {selectedTeachers.join(", ")}</p>
                ) : <p>Heç bir slot seçilməyib. Plan saxlananda silinəcək.</p>}
              </div>
              <label className={styles.startDateField}>
                <span>Başlama tarixi</span>
                <input name="validFrom" type="date" defaultValue={data.today} required />
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
            <Button type="submit" disabled={pending || !enrollmentId}>
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
  pending,
  onClose,
  onDateChange,
  onSubmit,
}: {
  slot: PlannerSlot;
  journal: PlannerWorkspaceData["journal"];
  today: string;
  pending: boolean;
  onClose: () => void;
  onDateChange: (date: string) => void;
  onSubmit: (formData: FormData) => void;
}) {
  const [rows, setRows] = useState<PlannerJournalMember[]>(journal.members);

  function updateRow(
    membershipId: string,
    patch: Partial<Pick<PlannerJournalMember, "attendanceStatus" | "note">>,
  ) {
    setRows((current) => current.map((row) => (
      row.membershipId === membershipId ? { ...row, ...patch } : row
    )));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("items", JSON.stringify(rows.map((row) => ({
      membershipId: row.membershipId,
      status: row.attendanceStatus,
      note: row.note,
    }))));
    onSubmit(formData);
  }

  const presentCount = rows.filter((row) => row.attendanceStatus === "present").length;
  const absentCount = rows.filter((row) => row.attendanceStatus === "absent").length;
  const unmarkedCount = rows.length - presentCount - absentCount;

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
          <div className={styles.attendanceToolbar}>
            <label>
              <span>Dərs tarixi</span>
              <input
                name="date"
                type="date"
                value={journal.date}
                max={today}
                onChange={(event) => onDateChange(event.target.value)}
                required
              />
            </label>
            <div className={styles.attendanceStats} aria-label="Davamiyyət xülasəsi">
              <span data-state="present"><b>{presentCount}</b> İştirak</span>
              <span data-state="absent"><b>{absentCount}</b> Qayıb</span>
              <span><b>{unmarkedCount}</b> Qeyd edilməyib</span>
            </div>
          </div>

          <div className={styles.attendanceList}>
            {rows.map((row) => (
              <div className={styles.attendanceRow} key={row.membershipId}>
                <Avatar name={row.studentName} />
                <div className={styles.attendanceStudent}>
                  <strong>{row.studentName}</strong>
                  <small>{row.studentCode} · {row.program}</small>
                </div>
                <div className={styles.attendanceMarks}>
                  <button
                    type="button"
                    data-active={row.attendanceStatus === "present" || undefined}
                    data-state="present"
                    onClick={() => updateRow(row.membershipId, { attendanceStatus: "present" })}
                    aria-label={`${row.studentName}: iştirak edir`}
                  >
                    <Check size={15} /> İştirak
                  </button>
                  <button
                    type="button"
                    data-active={row.attendanceStatus === "absent" || undefined}
                    data-state="absent"
                    onClick={() => updateRow(row.membershipId, { attendanceStatus: "absent" })}
                    aria-label={`${row.studentName}: qayıb`}
                  >
                    <X size={15} /> Qayıb
                  </button>
                  <button
                    type="button"
                    className={styles.clearMark}
                    onClick={() => updateRow(row.membershipId, { attendanceStatus: null })}
                    aria-label={`${row.studentName}: qeydi təmizlə`}
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
                <input
                  className={styles.attendanceNote}
                  value={row.note}
                  onChange={(event) => updateRow(row.membershipId, { note: event.target.value })}
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
