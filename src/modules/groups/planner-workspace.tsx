"use client";

import { useMemo, useState, useTransition, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  DoorOpen,
  Edit3,
  Plus,
  RotateCcw,
  Search,
  UserPlus,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cx } from "@/components/ui/cx";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import {
  groupWeekdays,
  orderedWeekdays,
  weekdayMeta,
  type GroupWeekdayCode,
} from "@/modules/groups/shared";
import type { PlannerSlot, PlannerWorkspaceData } from "@/modules/groups/planner-queries";
import styles from "./planner.module.css";

type PlannerActions = {
  createSlot: (formData: FormData) => Promise<unknown>;
  updateSlot: (formData: FormData) => Promise<unknown>;
  replaceSchedule: (formData: FormData) => Promise<unknown>;
};

const shiftMeta = {
  morning: { label: "Səhər", value: "MORNING" },
  afternoon: { label: "Günorta", value: "AFTERNOON" },
  evening: { label: "Axşam", value: "EVENING" },
} as const;

export function PlannerWorkspace({
  data,
  actions,
}: {
  data: PlannerWorkspaceData;
  actions: PlannerActions;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedSlotId, setSelectedSlotId] = useState(data.slots[0]?.id ?? "");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [slotDialogMode, setSlotDialogMode] = useState<"create" | "edit" | null>(null);
  const [assignmentOpen, setAssignmentOpen] = useState(false);

  const filteredSlots = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("az");
    return data.slots.filter((slot) => {
      const text = `${slot.groupCode} ${slot.teacherName} ${slot.room}`.toLocaleLowerCase("az");
      return (!needle || text.includes(needle))
        && (teacherFilter === "all" || slot.teacherId === teacherFilter)
        && (groupFilter === "all" || slot.groupId === groupFilter)
        && (shiftFilter === "all" || slot.shift === shiftFilter);
    });
  }, [data.slots, groupFilter, query, shiftFilter, teacherFilter]);

  const selectedSlot = data.slots.find((slot) => slot.id === selectedSlotId)
    ?? filteredSlots[0]
    ?? data.slots[0];
  const weekdays = useMemo(() => {
    const base = orderedWeekdays.filter((day) => weekdayMeta[day].index >= 1 && weekdayMeta[day].index <= 5);
    const weekend = orderedWeekdays.filter((day) => weekdayMeta[day].index === 0 || weekdayMeta[day].index === 6);
    return [...base, ...weekend.filter((day) => filteredSlots.some((slot) => slot.weekday === day))];
  }, [filteredSlots]);
  const times = [...new Set(filteredSlots.map((slot) => slot.startTime))].toSorted();
  const plannedCount = data.slots.reduce((sum, slot) => sum + slot.assignedCount, 0);
  const openSeats = data.slots.reduce((sum, slot) => sum + Math.max(slot.capacity - slot.assignedCount, 0), 0);

  function runAction(action: () => Promise<unknown>, success: string, close: () => void) {
    startTransition(() => {
      void (async () => {
        try {
          unwrapActionResult(await action());
          close();
          setNotice(success);
          router.refresh();
        } catch (error) {
          setNotice(notifyCaughtError(error, "Əməliyyat tamamlanmadı"));
        }
      })();
    });
  }

  return (
    <section className={styles.page} aria-busy={pending}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1>Həftəlik planlayıcı</h1>
          <p>Dərs slotlarını, tutumu və tələbə cədvəllərini bir baxışda idarə edin.</p>
        </div>
        <div className={styles.headerRight}>
          <Metric icon={CalendarDays} value={data.slots.length} label="aktiv slot" />
          <Metric icon={UsersRound} value={plannedCount} label="planlaşdırılmış iştirak" />
          <Metric icon={UserPlus} value={openSeats} label="boş yer" />
          {data.canManage ? (
            <Button className={styles.primaryButton} type="button" onClick={() => setSlotDialogMode("create")}>
              <Plus data-icon="inline-start" /> Yeni slot
            </Button>
          ) : null}
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Qruplar bölməsi">
        <button className={styles.activeTab} type="button">Planlayıcı</button>
        <button type="button" onClick={() => router.push("/groups?tab=groups" as Route)}>Qruplar</button>
        <button type="button" onClick={() => router.push("/groups?tab=journal" as Route)}>Bu gün / Jurnal</button>
        <button type="button" onClick={() => setNotice("Dəyişiklik tarixçəsi audit jurnalı ilə növbəti mərhələdə birləşdiriləcək.")}>Tarixçə</button>
      </nav>

      {notice ? (
        <div className={styles.notice} role="status">
          <span>{notice}</span>
          <button type="button" aria-label="Bildirişi bağla" onClick={() => setNotice("")}><X size={15} /></button>
        </div>
      ) : null}

      <div className={styles.filterBand}>
        <label className={styles.search}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Qrup, müəllim və ya otaq axtar..." /></label>
        <FilterSelect label="Qrup" value={groupFilter} onChange={setGroupFilter} options={data.groups.map((group) => ({ value: group.id, label: group.code }))} />
        <FilterSelect label="Müəllim" value={teacherFilter} onChange={setTeacherFilter} options={data.teachers.map((teacher) => ({ value: teacher.id, label: teacher.name }))} />
        <FilterSelect label="Növbə" value={shiftFilter} onChange={setShiftFilter} options={Object.entries(shiftMeta).map(([value, meta]) => ({ value, label: meta.label }))} />
        <Button type="button" variant="ghost" onClick={() => { setQuery(""); setGroupFilter("all"); setTeacherFilter("all"); setShiftFilter("all"); }}>
          <RotateCcw data-icon="inline-start" /> Sıfırla
        </Button>
      </div>

      <div className={styles.workspace}>
        <main className={styles.canvas}>
          {filteredSlots.length ? (
            <div className={styles.timetable} style={{ "--planner-days": weekdays.length } as CSSProperties}>
              <div className={styles.corner}><Clock3 size={16} /><span>Saat</span></div>
              {weekdays.map((day) => <div className={styles.dayHead} key={day}>{weekdayMeta[day].label}</div>)}
              {times.map((time) => (
                <TimeRow
                  key={time}
                  time={time}
                  weekdays={weekdays}
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
              {data.canManage ? <Button className={styles.primaryButton} type="button" onClick={() => setSlotDialogMode("create")}><Plus data-icon="inline-start" /> Yeni slot</Button> : null}
            </div>
          )}
        </main>

        <aside className={styles.inspector}>
          {selectedSlot ? (
            <>
              <div className={styles.inspectorHead}>
                <div>
                  <small>{selectedSlot.groupCode}</small>
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
              <div className={styles.memberHead}><strong>Tələbələr</strong><span>{selectedSlot.assignedCount}</span></div>
              <div className={styles.memberList}>
                {selectedSlot.members.slice(0, 8).map((member) => (
                  <div className={styles.member} key={member.assignmentId}>
                    <Avatar name={member.studentName} />
                    <div><strong>{member.studentName}</strong><small>{member.studentCode} · {member.program}</small></div>
                    <ChevronRight size={15} />
                  </div>
                ))}
                {!selectedSlot.members.length ? <p className={styles.noMembers}>Bu slota hələ tələbə əlavə edilməyib.</p> : null}
              </div>
              {data.canManage ? (
                <div className={styles.inspectorActions}>
                  <Button className={styles.primaryButton} type="button" onClick={() => setAssignmentOpen(true)} disabled={selectedSlot.assignedCount >= selectedSlot.capacity}>
                    <UserPlus data-icon="inline-start" /> Tələbə əlavə et
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setSlotDialogMode("edit")}>
                    <Edit3 data-icon="inline-start" /> Slotu redaktə et
                  </Button>
                </div>
              ) : null}
            </>
          ) : <div className={styles.inspectorEmpty}>Detalları görmək üçün slot seçin.</div>}
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
            async () => {
              const result = unwrapActionResult(
                slotDialogMode === "edit"
                  ? await actions.updateSlot(formData)
                  : await actions.createSlot(formData),
              ) as { id: string };
              setSelectedSlotId(result.id);
            },
            slotDialogMode === "edit" ? "Slot uğurla yeniləndi." : "Yeni dərs slotu yaradıldı.",
            () => setSlotDialogMode(null)
          )}
        />
      ) : null}
      {assignmentOpen && selectedSlot ? (
        <AssignmentDialog
          data={data}
          initialSlot={selectedSlot}
          pending={pending}
          onClose={() => setAssignmentOpen(false)}
          onSubmit={(formData) => runAction(() => actions.replaceSchedule(formData), "Tələbənin həftəlik planı yeniləndi.", () => setAssignmentOpen(false))}
        />
      ) : null}
    </section>
  );
}

function Metric({ icon: Icon, value, label }: { icon: typeof CalendarDays; value: number; label: string }) {
  return <div className={styles.metric}><span><Icon size={17} /></span><div><strong>{value}</strong><small>{label}</small></div></div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className={styles.filter}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="all">Bütün {label.toLocaleLowerCase("az")}lər</option>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>;
}

function TimeRow({ time, weekdays, slots, selectedId, onSelect }: { time: string; weekdays: GroupWeekdayCode[]; slots: PlannerSlot[]; selectedId?: string; onSelect: (id: string) => void }) {
  return <>
    <div className={styles.timeLabel}>{time}</div>
    {weekdays.map((day) => {
      const daySlots = slots.filter((slot) => slot.weekday === day && slot.startTime === time);
      return <div className={styles.cell} key={`${time}-${day}`}>
        {daySlots.map((slot) => <SlotCard slot={slot} selected={slot.id === selectedId} onSelect={onSelect} key={slot.id} />)}
      </div>;
    })}
  </>;
}

function SlotCard({ slot, selected, onSelect }: { slot: PlannerSlot; selected: boolean; onSelect: (id: string) => void }) {
  const full = slot.assignedCount >= slot.capacity;
  return <button className={cx(styles.slot, selected && styles.selectedSlot, full && styles.fullSlot)} type="button" onClick={() => onSelect(slot.id)}>
    <span className={styles.slotTop}><strong>{shiftMeta[slot.shift].label}</strong><small>{slot.groupCode}</small></span>
    <span className={styles.slotTime}>{slot.startTime}–{slot.endTime}</span>
    <span className={styles.slotTeacher}>{slot.teacherName}</span>
    <span className={styles.slotBottom}><b>{slot.assignedCount} / {slot.capacity}</b><i>{slot.members.slice(0, 3).map((member) => <Avatar name={member.studentName} compact key={member.assignmentId} />)}</i></span>
    <CapacityBar count={slot.assignedCount} capacity={slot.capacity} />
  </button>;
}

function CapacityBar({ count, capacity }: { count: number; capacity: number }) {
  const ratio = capacity ? count / capacity : 0;
  return <span className={styles.capacityTrack} data-state={ratio >= 1 ? "full" : ratio >= .8 ? "busy" : "available"}><i style={{ width: `${Math.min(ratio * 100, 100)}%` }} /></span>;
}

function Avatar({ name, compact = false }: { name: string; compact?: boolean }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("az")).join("");
  return <span className={cx(styles.avatar, compact && styles.compactAvatar)} aria-hidden="true">{initials}</span>;
}

function SlotDialog({
  data,
  mode,
  slot,
  pending,
  onClose,
  onSubmit,
}: {
  data: PlannerWorkspaceData;
  mode: "create" | "edit";
  slot?: PlannerSlot;
  pending: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const firstGroup = data.groups[0];
  const editing = mode === "edit" && Boolean(slot);
  const room = slot?.room === "Otaq seçilməyib" ? "" : slot?.room;
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className={styles.slotDialog}><DialogHeader><DialogTitle>{editing ? "Dərs slotunu redaktə et" : "Yeni dərs slotu"}</DialogTitle><DialogDescription>{editing ? "Dəyişiklik seçilən tarixdən tətbiq olunur və əvvəlki versiya tarixçədə saxlanılır." : "Həftəlik vaxtı, müəllimi və tutumu müəyyən edin."}</DialogDescription></DialogHeader>
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }}>
      {editing && slot ? <input name="slotId" type="hidden" value={slot.id} /> : null}
      <div className={styles.formGrid}>
        <label>
          <span>Qrup</span>
          {editing && slot ? (
            <>
              <input name="groupId" type="hidden" value={slot.groupId} />
              <select defaultValue={slot.groupId} disabled>{data.groups.map((group) => <option value={group.id} key={group.id}>{group.code}</option>)}</select>
            </>
          ) : (
            <select name="groupId" required>{data.groups.map((group) => <option value={group.id} key={group.id}>{group.code}</option>)}</select>
          )}
        </label>
        <label><span>Müəllim</span><select name="teacherId" defaultValue={slot?.teacherId} required>{data.teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label>
        <label><span>Gün</span><select name="weekday" defaultValue={slot?.weekday ?? groupWeekdays.MONDAY}>{orderedWeekdays.map((day) => <option value={day} key={day}>{weekdayMeta[day].label}</option>)}</select></label>
        <label><span>Növbə</span><select name="shift" defaultValue={slot ? shiftMeta[slot.shift].value : "MORNING"}>{Object.values(shiftMeta).map((shift) => <option value={shift.value} key={shift.value}>{shift.label}</option>)}</select></label>
        <label><span>Başlama</span><input name="startTime" type="time" defaultValue={slot?.startTime ?? "09:00"} required /></label>
        <label><span>Bitmə</span><input name="endTime" type="time" defaultValue={slot?.endTime ?? "10:30"} required /></label>
        <label><span>Otaq</span><input name="room" defaultValue={room} placeholder="Məsələn: Rəsm otağı 1" maxLength={80} /></label>
        <label><span>Tutum</span><input name="capacity" type="number" min={1} max={100} defaultValue={slot?.capacity ?? firstGroup?.capacity ?? 10} required /></label>
        <label className={styles.fullField}><span>{editing ? "Dəyişiklik tarixi" : "Başlama tarixi"}</span><input name="validFrom" type="date" min={data.today} defaultValue={data.today} required /></label>
      </div>
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button><Button className={styles.primaryButton} type="submit" disabled={pending || !data.groups.length || !data.teachers.length}>{pending ? "Yadda saxlanılır..." : editing ? "Dəyişiklikləri saxla" : "Slot yarat"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}

function AssignmentDialog({ data, initialSlot, pending, onClose, onSubmit }: { data: PlannerWorkspaceData; initialSlot: PlannerSlot; pending: boolean; onClose: () => void; onSubmit: (formData: FormData) => void }) {
  const members = data.memberships.filter((member) => member.groupId === initialSlot.groupId);
  const slots = data.slots.filter((slot) => slot.groupId === initialSlot.groupId);
  const [membershipId, setMembershipId] = useState(members[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>([initialSlot.id]);
  const member = members.find((item) => item.id === membershipId);
  function toggle(slot: PlannerSlot) {
    if (slot.assignedCount >= slot.capacity && !selected.includes(slot.id)) return;
    setSelected((current) => current.includes(slot.id) ? current.filter((id) => id !== slot.id) : [...current, slot.id]);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("slotIds", JSON.stringify(selected));
    onSubmit(formData);
  }
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className={styles.assignmentDialog}><DialogHeader className={styles.assignmentHeader}><DialogTitle>Tələbəni cədvələ əlavə et</DialogTitle><DialogDescription>Bir tələbə üçün bir və ya bir neçə həftəlik slot seçin.</DialogDescription></DialogHeader>
    <form onSubmit={submit}>
      <div className={styles.assignmentBody}>
        <div className={styles.assignmentMain}>
          <label className={styles.studentSelect}><span>Tələbə</span><select name="membershipId" value={membershipId} onChange={(event) => setMembershipId(event.target.value)} required>{members.map((item) => <option value={item.id} key={item.id}>{item.studentName} · {item.studentCode} · {item.program}</option>)}</select></label>
          <h3>Həftəlik seçim</h3>
          <div className={styles.slotChoiceGrid}>
            {orderedWeekdays.filter((day) => slots.some((slot) => slot.weekday === day)).map((day) => <div key={day}><strong>{weekdayMeta[day].shortLabel}</strong>{slots.filter((slot) => slot.weekday === day).map((slot) => {
              const active = selected.includes(slot.id);
              const full = slot.assignedCount >= slot.capacity;
              return <button className={cx(styles.slotChoice, active && styles.activeChoice, full && !active && styles.disabledChoice)} type="button" onClick={() => toggle(slot)} key={slot.id} disabled={full && !active}><span>{shiftMeta[slot.shift].label}</span><small>{slot.startTime}–{slot.endTime}</small><b>{full ? "Dolu" : `${slot.assignedCount} / ${slot.capacity}`}</b>{active ? <Check size={17} /> : null}</button>;
            })}</div>)}
          </div>
        </div>
        <aside className={styles.assignmentSummary}>
          <h3>Seçilmiş plan</h3>
          <div className={styles.planCount}><CalendarDays size={20} /><strong>{selected.length} dərs / həftə</strong></div>
          <ul>{selected.map((id) => { const slot = slots.find((item) => item.id === id); return slot ? <li key={id}><i /><span>{weekdayMeta[slot.weekday].shortLabel} {slot.startTime}–{slot.endTime}</span></li> : null; })}</ul>
          {initialSlot ? <p><UserRound size={16} /> {initialSlot.teacherName}</p> : null}
          <label><span>Başlama tarixi</span><input name="validFrom" type="date" defaultValue={data.today} required /></label>
          {member?.lessonsPerMonth ? <div className={styles.packageNote}>Aylıq paket: {member.lessonsPerMonth} dərs</div> : null}
        </aside>
      </div>
      <DialogFooter className={styles.assignmentFooter}><Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button><Button className={styles.primaryButton} type="submit" disabled={pending || !membershipId || !selected.length}>Cədvələ əlavə et</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
