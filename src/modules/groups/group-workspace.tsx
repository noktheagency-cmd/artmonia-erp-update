"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Edit3,
  GraduationCap,
  Gauge,
  Layers3,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  Search,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cx } from "@/components/ui/cx";
import type {
  GroupMemberView,
  GroupView,
  GroupWorkspaceData,
  JournalMemberView,
} from "@/modules/groups/queries";
import { groupWeekdays, orderedWeekdays, weekdayMeta, type GroupWeekdayCode } from "@/modules/groups/shared";
import { ExportDialog } from "@/modules/exports/export-dialog";
import styles from "./groups.module.css";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";

type GroupsTab = "groups" | "journal";
type GroupActions = {
  createGroup: (formData: FormData) => Promise<unknown>;
  updateGroup: (formData: FormData) => Promise<unknown>;
  archiveGroup: (formData: FormData) => Promise<unknown>;
  addMember: (formData: FormData) => Promise<unknown>;
  changeTeacher: (formData: FormData) => Promise<unknown>;
  endMembership: (formData: FormData) => Promise<unknown>;
  saveAttendance: (formData: FormData) => Promise<unknown>;
};

export function GroupWorkspace({
  data,
  activeTab,
  actions,
}: {
  data: GroupWorkspaceData;
  activeTab: GroupsTab;
  actions: GroupActions;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [occupancyFilter, setOccupancyFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [groupDialog, setGroupDialog] = useState<"create" | "edit" | null>(null);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [teacherMember, setTeacherMember] = useState<GroupMemberView | null>(null);
  const selectedGroup = data.groups.find((group) => group.id === data.selectedGroupId) ?? data.groups[0];
  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("az");
    return data.groups.filter((group) => {
      const matchesText = !needle || [group.code, group.scheduleLabel, ...group.members.map((member) => member.studentName)]
        .join(" ")
        .toLocaleLowerCase("az")
        .includes(needle);
      const matchesTeacher = teacherFilter === "all" || group.members.some((member) => member.teacherId === teacherFilter);
      const ratio = group.capacity ? group.memberCount / group.capacity : 0;
      const matchesOccupancy = occupancyFilter === "all" || (occupancyFilter === "available" ? ratio < 1 : occupancyFilter === "full" ? ratio >= 1 : ratio >= .75);
      return matchesText && matchesTeacher && matchesOccupancy;
    });
  }, [data.groups, occupancyFilter, query, teacherFilter]);
  const totalStudents = data.groups.reduce((sum, group) => sum + group.memberCount, 0);
  const totalCapacity = data.groups.reduce((sum, group) => sum + group.capacity, 0);

  function navigate(tab: GroupsTab, groupId = selectedGroup?.id, date = data.journal.date) {
    const params = new URLSearchParams({ tab });
    if (groupId) params.set("group", groupId);
    if (tab === "journal" && date) params.set("date", date);
    router.push(`/groups?${params.toString()}` as Route);
  }

  function runAction(action: () => Promise<unknown>, success: string) {
    startTransition(() => {
      void (async () => {
        try {
          unwrapActionResult(await action());
          setNotice(success);
          router.refresh();
        } catch (error) {
          setNotice(notifyCaughtError(error, "Əməliyyat tamamlanmadı"));
        }
      })();
    });
  }

  function endMembership(member: GroupMemberView) {
    if (!window.confirm(`${member.studentName} qrupdan çıxarılsın? Status və billing dəyişməyəcək.`)) return;
    const formData = new FormData();
    formData.set("membershipId", member.id);
    runAction(() => actions.endMembership(formData), "Tələbənin qrup üzvlüyü bitirildi.");
  }

  return (
    <section className={styles.page} aria-busy={isPending}>
      <header className={styles.header}>
        <div>
          <h1>{activeTab === "groups" ? "Qruplar" : "Jurnal"}</h1>
          <p>
            {activeTab === "groups"
              ? "Qrupları, həftəlik cədvəli və tələbə bölgüsünü bir mərkəzdən idarə edin."
              : "Seçilmiş qrup üzrə davamiyyəti sürətli və aydın şəkildə qeyd edin."}
          </p>
        </div>
        <div className={styles.headerActions}>
          {data.permissions.canExport ? (
              <ExportDialog
                key={`groups-export-${activeTab}-${data.selectedGroupId}-${data.journal.date}`}
                module="groups"
                initialDataset={activeTab === "journal" ? "journal" : "roster"}
              resultCount={activeTab === "groups" ? data.groups.reduce((total, group) => total + group.members.length, 0) : data.journal.members.length}
              filters={{ group: data.selectedGroupId, date: data.journal.date, tab: activeTab }}
              previewRows={activeTab === "groups" ? data.groups.flatMap((group) => group.members.map((member) => ({ group: group.code, capacity: `${group.memberCount} / ${group.capacity}`, schedule: group.scheduleLabel, studentCode: member.studentCode, student: member.studentName, program: member.program, teacher: member.teacherName, joinedAt: member.joinedAt, status: member.lifecycleStatus }))) : data.journal.members.map((member) => ({ group: selectedGroup?.code ?? "-", date: data.journal.dateLabel, schedule: data.journal.scheduleLabel, studentCode: member.studentCode, student: member.studentName, program: member.program, teacher: member.teacherName, attendance: member.attendanceStatus ?? "", note: member.note }))}
            />
          ) : null}
          {data.permissions.canManageGroups && activeTab === "groups" ? (
            <Button type="button" onClick={() => setGroupDialog("create")}><Plus data-icon="inline-start" /> Qrup yarat</Button>
          ) : null}
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Qruplar bölməsi">
        <button type="button" onClick={() => router.push("/groups?tab=planner" as Route)}>
          Planlayıcı
        </button>
        <button className={activeTab === "groups" ? styles.activeTab : ""} type="button" onClick={() => navigate("groups")}>
          Qruplar
        </button>
        <button className={activeTab === "journal" ? styles.activeTab : ""} type="button" onClick={() => navigate("journal")}>
          Jurnal
        </button>
      </nav>

      {notice ? (
        <div className={styles.notice} role="status">
          <span>{notice}</span>
          <button type="button" aria-label="Bildirişi bağla" onClick={() => setNotice("")}><X size={15} /></button>
        </div>
      ) : null}

      {activeTab === "groups" ? <>
        <div className={styles.filterBand}>
          <label className={styles.searchBox}><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Qrup və ya tələbə axtar..." /></label>
          <select aria-label="Müəllim üzrə filtr" value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}><option value="all">Bütün müəllimlər</option>{data.teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select>
          <select aria-label="Doluluq üzrə filtr" value={occupancyFilter} onChange={(event) => setOccupancyFilter(event.target.value)}><option value="all">Bütün doluluqlar</option><option value="available">Yeri olan</option><option value="busy">75%+ dolu</option><option value="full">Tam dolu</option></select>
          <Button type="button" variant="ghost" onClick={() => { setQuery(""); setTeacherFilter("all"); setOccupancyFilter("all"); }}><RotateCcw data-icon="inline-start" /> Təmizlə</Button><span>{filteredGroups.length} nəticə</span>
        </div>
        <div className={styles.kpiGrid}>
          <GroupKpi icon={Layers3} label="Qruplar" value={data.groups.length} helper="Aktiv qrup" tone="blue" />
          <GroupKpi icon={UsersRound} label="Tələbələr" value={totalStudents} helper="Qruplara bölünüb" tone="green" />
          <GroupKpi icon={GraduationCap} label="Ümumi tutum" value={totalCapacity} helper={`${Math.max(totalCapacity - totalStudents, 0)} boş yer`} tone="violet" />
          <GroupKpi icon={Gauge} label="Doluluq" value={`${totalCapacity ? Math.round(totalStudents / totalCapacity * 100) : 0}%`} helper="Orta istifadə" tone="amber" />
        </div>
      </> : null}

      {activeTab === "groups" ? (
        <div className={styles.groupsWorkspace}>
          <aside className={styles.groupListPanel}>
            <div className={styles.listHeading}>
              <strong>Bütün qruplar</strong>
              <span>{filteredGroups.length}</span>
            </div>
            <div className={styles.groupList}>
              {filteredGroups.length ? filteredGroups.map((group, index) => (
                <button
                  key={group.id}
                  type="button"
                  className={cx(styles.groupRow, group.id === selectedGroup?.id && styles.selectedGroup)}
                  data-accent={index % 5}
                  onClick={() => navigate("groups", group.id)}
                >
                  <span className={styles.groupAccent} />
                  <span className={styles.groupRowMain}>
                    <strong>{group.code}</strong>
                    <small>{group.scheduleLabel || "Cədvəl yoxdur"}</small>
                  </span>
                  <span className={styles.capacityMini}>
                    <small>{group.memberCount} / {group.capacity} yer</small>
                    <i><b style={{ width: `${Math.min((group.memberCount / group.capacity) * 100, 100)}%` }} /></i>
                  </span>
                  <ChevronRight size={16} />
                </button>
              )) : <EmptyState title="Qrup tapılmadı" description="Axtarış sözünü dəyişin və ya yeni qrup yaradın." />}
            </div>
          </aside>

          <main className={styles.groupDetailPanel}>
            {selectedGroup ? (
              <>
                <div className={styles.groupDetailHeader}>
                  <div>
                    <h2>{selectedGroup.code}</h2>
                    <div className={styles.groupMeta}>
                      <span><Clock3 size={16} /> {selectedGroup.scheduleLabel}</span>
                      <span><UsersRound size={16} /> {selectedGroup.memberCount} / {selectedGroup.capacity} yer</span>
                    </div>
                  </div>
                  {data.permissions.canManageGroups ? (
                    <div className={styles.headerActions}>
                      <Button variant="outline" type="button" onClick={() => setGroupDialog("edit")}>
                        <Edit3 data-icon="inline-start" /> Redaktə et
                      </Button>
                      <Button type="button" onClick={() => setMemberDialogOpen(true)} disabled={selectedGroup.memberCount >= selectedGroup.capacity}>
                        <Plus data-icon="inline-start" /> Tələbə əlavə et
                      </Button>
                    </div>
                  ) : null}
                </div>
                <GroupRoster
                  group={selectedGroup}
                  canManage={data.permissions.canManageGroups}
                  pending={isPending}
                  onChangeTeacher={setTeacherMember}
                  onEndMembership={endMembership}
                />
              </>
            ) : (
              <EmptyState
                title={data.actorMode === "teacher" ? "Sizə qrup assign edilməyib" : "İlk qrupu yaradın"}
                description={data.actorMode === "teacher" ? "Administrator tələbələri sizə assign etdikdən sonra qruplar burada görünəcək." : "Qrup kodunu, capacity və həftəlik cədvəli qeyd etməklə başlayın."}
              />
            )}
          </main>
        </div>
      ) : (
        <JournalView data={data} group={selectedGroup} pending={isPending} onNavigate={navigate} onNotice={setNotice} saveAction={actions.saveAttendance} />
      )}

      {groupDialog ? (
        <GroupFormDialog
          mode={groupDialog}
          group={groupDialog === "edit" ? selectedGroup : undefined}
          pending={isPending}
          onClose={() => setGroupDialog(null)}
          onSubmit={(formData) => {
            startTransition(() => {
              void (async () => {
                try {
                  if (groupDialog === "create") {
                    const created = unwrapActionResult(
                      await actions.createGroup(formData),
                    ) as { id: string };
                    setGroupDialog(null);
                    router.push(`/groups?tab=groups&group=${created.id}` as Route);
                    setNotice("Qrup yaradıldı.");
                  } else {
                    unwrapActionResult(await actions.updateGroup(formData));
                    setGroupDialog(null);
                    setNotice("Qrup yeniləndi.");
                    router.refresh();
                  }
                } catch (error) {
                  setNotice(notifyCaughtError(error, "Qrup saxlanmadı", "Qrup saxlanmadı"));
                }
              })();
            });
          }}
          onArchive={selectedGroup ? () => {
            if (!window.confirm(`${selectedGroup.code} qrupu arxivlənsin?`)) return;
            const formData = new FormData();
            formData.set("groupId", selectedGroup.id);
            runAction(() => actions.archiveGroup(formData), "Qrup arxivləndi.");
            setGroupDialog(null);
          } : undefined}
        />
      ) : null}

      {memberDialogOpen && selectedGroup ? (
        <MemberDialog
          group={selectedGroup}
          data={data}
          pending={isPending}
          onClose={() => setMemberDialogOpen(false)}
          onSubmit={(formData) => {
            runAction(() => actions.addMember(formData), "Tələbə qrupa əlavə edildi.");
            setMemberDialogOpen(false);
          }}
        />
      ) : null}

      {teacherMember ? (
        <TeacherDialog
          member={teacherMember}
          teachers={data.teachers}
          pending={isPending}
          onClose={() => setTeacherMember(null)}
          onSubmit={(formData) => {
            runAction(() => actions.changeTeacher(formData), "Müəllim təyinatı yeniləndi.");
            setTeacherMember(null);
          }}
        />
      ) : null}
    </section>
  );
}

function GroupKpi({ icon: Icon, label, value, helper, tone }: { icon: typeof Layers3; label: string; value: number | string; helper: string; tone: string }) { return <article className={styles.kpi} data-tone={tone}><span><Icon size={18} /></span><div><small>{label}</small><strong>{value}</strong><p>{helper}</p></div></article>; }

function GroupRoster({
  group,
  canManage,
  pending,
  onChangeTeacher,
  onEndMembership,
}: {
  group: GroupView;
  canManage: boolean;
  pending: boolean;
  onChangeTeacher: (member: GroupMemberView) => void;
  onEndMembership: (member: GroupMemberView) => void;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.rosterTable}>
        <thead><tr><th>Tələbə</th><th>Proqram</th><th>Müəllim</th><th>Status</th><th>Qoşulma tarixi</th>{canManage ? <th aria-label="Əməliyyatlar" /> : null}</tr></thead>
        <tbody>
          {group.members.length ? group.members.map((member) => (
            <tr key={member.id}>
              <td><PersonCell name={member.studentName} code={member.studentCode} /></td>
              <td>{member.program}</td>
              <td><span className={styles.teacherName}><UserRound size={15} /> {member.teacherName}</span></td>
              <td><span className={cx(styles.status, statusClass(member.lifecycleStatus))}>{member.lifecycleStatus}</span></td>
              <td>{formatCompactDate(member.joinedAt)}</td>
              {canManage ? (
                <td>
                  <details className={styles.rowMenu}>
                    <summary aria-label={`${member.studentName} əməliyyatları`}><MoreHorizontal size={18} /></summary>
                    <div>
                      <button type="button" disabled={pending} onClick={() => onChangeTeacher(member)}>Müəllimi dəyiş</button>
                      <button type="button" disabled={pending} onClick={() => onEndMembership(member)}>Qrupdan çıxar</button>
                    </div>
                  </details>
                </td>
              ) : null}
            </tr>
          )) : <tr><td colSpan={canManage ? 6 : 5}><EmptyState title="Qrup hələ boşdur" description="Capacity daxilində ilk tələbəni əlavə edin." /></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function JournalView({
  data,
  group,
  pending,
  onNavigate,
  onNotice,
  saveAction,
}: {
  data: GroupWorkspaceData;
  group?: GroupView;
  pending: boolean;
  onNavigate: (tab: GroupsTab, groupId?: string, date?: string) => void;
  onNotice: (notice: string) => void;
  saveAction: GroupActions["saveAttendance"];
}) {
  const router = useRouter();
  const [savePending, startSaveTransition] = useTransition();
  const initialDraft = useMemo(() => Object.fromEntries(data.journal.members.map((member) => [member.id, { status: member.attendanceStatus, note: member.note }])), [data.journal.members]);
  const [draft, setDraft] = useState<Record<string, { status: "present" | "absent" | null; note: string }>>(initialDraft);
  const changedItems = data.journal.members.filter((member) => {
    const current = draft[member.id];
    return current && (current.status !== member.attendanceStatus || current.note !== member.note);
  });

  function setStatus(member: JournalMemberView, status: "present" | "absent") {
    setDraft((current) => ({
      ...current,
      [member.id]: {
        ...(current[member.id] ?? { note: member.note }),
        status: current[member.id]?.status === status ? null : status,
      },
    }));
  }

  function moveDate(direction: -1 | 1) {
    if (!group) return;
    const next = findScheduledDate(data.journal.date, group, direction, data.journal.today);
    if (next) onNavigate("journal", group.id, next);
  }

  function save() {
    if (!group || !changedItems.length) return;
    const formData = new FormData();
    formData.set("groupId", group.id);
    formData.set("date", data.journal.date);
    formData.set("items", JSON.stringify(changedItems.map((member) => ({ membershipId: member.id, ...draft[member.id] }))));
    startSaveTransition(() => {
      void (async () => {
        try {
          unwrapActionResult(await saveAction(formData));
          onNotice("Jurnal saxlanıldı.");
          router.refresh();
        } catch (error) {
          onNotice(notifyCaughtError(error, "Jurnalı saxlamaq mümkün olmadı", "Jurnal saxlanmadı"));
        }
      })();
    });
  }

  return (
    <div className={styles.journalWorkspace}>
      <div className={styles.journalControls}>
        <button type="button" aria-label="Əvvəlki dərs günü" onClick={() => moveDate(-1)}><ArrowLeft size={20} /></button>
        <label className={styles.dateControl}><CalendarDays size={18} /><input type="date" max={data.journal.today} value={data.journal.date} onChange={(event) => onNavigate("journal", group?.id, event.target.value)} /><strong>{data.journal.dateLabel}</strong></label>
        <button type="button" aria-label="Növbəti dərs günü" onClick={() => moveDate(1)}><ArrowRight size={20} /></button>
        <label className={styles.selectControl}><span>Qrup</span><select value={group?.id ?? ""} onChange={(event) => onNavigate("journal", event.target.value)}>{data.groups.map((item) => <option value={item.id} key={item.id}>{item.code}</option>)}</select></label>
        <div className={styles.contextControl}><Clock3 size={18} /><span>{data.journal.scheduleLabel}</span></div>
        <div className={styles.contextControl}><UserRound size={18} /><span>{data.actorMode === "teacher" ? "Mənim tələbələrim" : "Bütün müəllimlər"}</span></div>
      </div>

      <section className={styles.attendancePanel}>
        <div className={styles.attendanceHeader}>
          <div className={styles.attendanceIcon}><UsersRound size={22} /></div>
          <div><h2>Davamiyyət</h2><p><strong>{data.journal.members.length}</strong> tələbə · <em>{data.journal.presentCount} gəldi</em> · <b>{data.journal.absentCount} gəlmədi</b> · {data.journal.unmarkedCount} qeyd olunmayıb</p></div>
        </div>
        <div className={styles.tableWrap}>
          <table className={cx(styles.rosterTable, styles.attendanceTable)}>
            <thead><tr><th>#</th><th>Tələbə</th><th>Proqram</th><th>Müəllim</th><th>Davamiyyət</th><th>Qeyd</th></tr></thead>
            <tbody>
              {data.journal.members.length ? data.journal.members.map((member, index) => {
                const current = draft[member.id] ?? { status: member.attendanceStatus, note: member.note };
                return (
                  <tr key={member.id}>
                    <td>{index + 1}</td>
                    <td><PersonCell name={member.studentName} code={member.studentCode} /></td>
                    <td>{member.program}</td>
                    <td>{member.teacherName}</td>
                    <td><div className={styles.attendanceToggle}>
                      <button type="button" className={current.status === "present" ? styles.presentActive : ""} onClick={() => setStatus(member, "present")} disabled={!data.permissions.canManageAttendance || pending}><Check size={16} /> Gəldi</button>
                      <button type="button" className={current.status === "absent" ? styles.absentActive : ""} onClick={() => setStatus(member, "absent")} disabled={!data.permissions.canManageAttendance || pending}><X size={16} /> Gəlmədi</button>
                    </div></td>
                    <td><input className={styles.noteInput} aria-label={`${member.studentName} üçün qeyd`} value={current.note} maxLength={500} placeholder="Qeyd" disabled={!data.permissions.canManageAttendance || pending} onChange={(event) => setDraft((state) => ({ ...state, [member.id]: { ...current, note: event.target.value } }))} /></td>
                  </tr>
                );
              }) : <tr><td colSpan={6}><EmptyState title="Bu tarix üçün tələbə yoxdur" description="Qrup üzvlüklərini və seçilmiş dərs gününü yoxlayın." /></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className={styles.saveBar}>
        <div><strong>{changedItems.length ? `${changedItems.length} dəyişiklik yadda saxlanmayıb` : "Bütün dəyişikliklər saxlanılıb"}</strong><span>Jurnalı yadda saxlamağı unutmayın.</span></div>
        <div>
          <Button type="button" variant="outline" onClick={() => setDraft(initialDraft)} disabled={!changedItems.length || pending || savePending}><RotateCcw data-icon="inline-start" /> Qeydi təmizlə</Button>
          <Button type="button" onClick={save} disabled={!changedItems.length || pending || savePending}><Save data-icon="inline-start" /> Jurnalı saxla</Button>
        </div>
      </div>
    </div>
  );
}

function GroupFormDialog({ mode, group, pending, onClose, onSubmit, onArchive }: { mode: "create" | "edit"; group?: GroupView; pending: boolean; onClose: () => void; onSubmit: (formData: FormData) => void; onArchive?: () => void }) {
  const initialSchedules = new Map(group?.schedules.map((item) => [item.weekday, { selected: true, startTime: item.startTime, endTime: item.endTime }]) ?? []);
  const firstSchedule = group?.schedules[0];
  const allSame = group ? new Set(group.schedules.map((item) => `${item.startTime}-${item.endTime}`)).size <= 1 : true;
  const [code, setCode] = useState(group?.code ?? "");
  const [capacity, setCapacity] = useState(String(group?.capacity ?? 12));
  const [sameTime, setSameTime] = useState(allSame);
  const [commonStart, setCommonStart] = useState(firstSchedule?.startTime ?? "11:00");
  const [commonEnd, setCommonEnd] = useState(firstSchedule?.endTime ?? "14:00");
  const defaultWeekdays = new Set<GroupWeekdayCode>([groupWeekdays.TUESDAY, groupWeekdays.WEDNESDAY, groupWeekdays.THURSDAY]);
  const [days, setDays] = useState<Record<string, { selected: boolean; startTime: string; endTime: string }>>(() => Object.fromEntries(orderedWeekdays.map((weekday) => [weekday, initialSchedules.get(weekday) ?? { selected: mode === "create" && defaultWeekdays.has(weekday), startTime: commonStart, endTime: commonEnd }])));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const schedules = orderedWeekdays.filter((weekday) => days[weekday].selected).map((weekday) => ({ weekday, startTime: sameTime ? commonStart : days[weekday].startTime, endTime: sameTime ? commonEnd : days[weekday].endTime }));
    const formData = new FormData();
    if (group) formData.set("groupId", group.id);
    formData.set("code", code);
    formData.set("capacity", capacity);
    formData.set("schedules", JSON.stringify(schedules));
    onSubmit(formData);
  }

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className={styles.dialog}><DialogHeader><DialogTitle>{mode === "create" ? "Yeni qrup yarat" : `${group?.code} qrupunu redaktə et`}</DialogTitle><DialogDescription>Qrup kodunu, capacity-ni və həftəlik dərs intervalını qeyd edin.</DialogDescription></DialogHeader><form onSubmit={submit} className={styles.formStack}>
    <div className={styles.twoColumns}><label><span>Qrup kodu</span><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="H1" required maxLength={24} /></label><label><span>Capacity</span><input type="number" min={1} max={500} value={capacity} onChange={(event) => setCapacity(event.target.value)} required /></label></div>
    <label className={styles.switchRow}><input type="checkbox" checked={sameTime} onChange={(event) => setSameTime(event.target.checked)} /><span><strong>Bütün günlərə eyni saat</strong><small>Söndürdükdə hər gün üçün ayrıca interval verə bilərsiniz.</small></span></label>
    {sameTime ? <div className={styles.twoColumns}><label><span>Başlama</span><input type="time" value={commonStart} onChange={(event) => setCommonStart(event.target.value)} /></label><label><span>Bitmə</span><input type="time" value={commonEnd} onChange={(event) => setCommonEnd(event.target.value)} /></label></div> : null}
    <div className={styles.scheduleEditor}>{orderedWeekdays.map((weekday) => { const value = days[weekday]; return <div className={cx(styles.scheduleRow, value.selected && styles.scheduleSelected)} key={weekday}><button type="button" onClick={() => setDays((state) => ({ ...state, [weekday]: { ...value, selected: !value.selected } }))}>{value.selected ? <Check size={16} /> : null}{weekdayMeta[weekday].label}</button>{!sameTime && value.selected ? <><input type="time" value={value.startTime} onChange={(event) => setDays((state) => ({ ...state, [weekday]: { ...value, startTime: event.target.value } }))} /><span>–</span><input type="time" value={value.endTime} onChange={(event) => setDays((state) => ({ ...state, [weekday]: { ...value, endTime: event.target.value } }))} /></> : null}</div>; })}</div>
    <DialogFooter className={styles.dialogFooter}>{onArchive ? <Button type="button" variant="outline" onClick={onArchive}><Archive data-icon="inline-start" /> Arxivlə</Button> : <span />}<div><Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button><Button type="submit" disabled={pending}>{mode === "create" ? "Qrup yarat" : "Yadda saxla"}</Button></div></DialogFooter>
  </form></DialogContent></Dialog>;
}

function MemberDialog({ group, data, pending, onClose, onSubmit }: { group: GroupView; data: GroupWorkspaceData; pending: boolean; onClose: () => void; onSubmit: (formData: FormData) => void }) {
  const [enrollmentId, setEnrollmentId] = useState(data.enrollmentOptions[0]?.id ?? "");
  const enrollment = data.enrollmentOptions.find((item) => item.id === enrollmentId);
  const [teacherId, setTeacherId] = useState(enrollment?.currentTeacherId || data.teachers[0]?.id || "");
  const capacityRatio = group.capacity > 0 ? Math.min(100, Math.round((group.memberCount / group.capacity) * 100)) : 0;
  const enrollmentOptions = data.enrollmentOptions.map((item) => ({
    value: item.id,
    label: `${item.studentName} · ${item.studentCode} · ${item.program}`,
    searchText: `${item.studentName} ${item.studentCode} ${item.program} ${item.lifecycleStatus}`,
  }));
  const teacherOptions = data.teachers.map((teacher) => ({ value: teacher.id, label: teacher.name }));
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const formData = new FormData(); formData.set("groupId", group.id); formData.set("enrollmentId", enrollmentId); formData.set("teacherId", teacherId); onSubmit(formData); }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className={cx(styles.smallDialog, styles.memberDialog)}>
      <div className={styles.memberHero}>
        <div className={styles.memberHeroIcon}><GraduationCap size={24} /></div>
        <DialogHeader className={styles.memberDialogHeader}>
          <DialogTitle>{group.code} qrupuna tələbə əlavə et</DialogTitle>
          <DialogDescription>Tələbəni və dərsi aparacaq müəllimi seçin.</DialogDescription>
        </DialogHeader>
        <div className={styles.memberCapacity}>
          <div><span>Qrup doluluğu</span><strong>{group.memberCount} / {group.capacity}</strong></div>
          <i aria-hidden="true"><b style={{ width: `${capacityRatio}%` }} /></i>
        </div>
      </div>

      <form className={styles.memberForm} onSubmit={submit}>
        <div className={styles.memberField}>
          <div className={styles.memberFieldHeading}>
            <span><Search size={15} /></span>
            <div><strong>Tələbə / enrollment</strong><small>Ad, kod və ya proqram üzrə axtarın</small></div>
          </div>
          <FormSelect
            name="enrollmentId"
            options={enrollmentOptions}
            value={enrollmentId}
            onValueChange={(id) => {
              const next = data.enrollmentOptions.find((item) => item.id === id);
              setEnrollmentId(id);
              setTeacherId(next?.currentTeacherId || data.teachers[0]?.id || "");
            }}
            placeholder="Tələbə seçin"
            searchPlaceholder="Tələbə, kod və ya proqram axtar..."
            aria-label="Tələbə və enrollment seçimi"
            searchable
            className={styles.memberSelect}
            contentClassName={styles.memberSelectMenu}
            disabled={enrollmentOptions.length === 0}
            required
          />
        </div>

        {enrollment ? <div className={styles.memberSelectionSummary}>
          <div className={styles.memberAvatar}>{enrollment.studentName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>
          <div className={styles.memberSelectionMain}><strong>{enrollment.studentName}</strong><span>{enrollment.studentCode}</span></div>
          <div className={styles.memberSelectionMeta}><span>{enrollment.program}</span><small>{enrollment.lifecycleStatus}</small></div>
          <Check size={18} />
        </div> : <div className={styles.memberEmptyState}>Qrupa əlavə edilə bilən tələbə tapılmadı.</div>}

        <div className={styles.memberField}>
          <div className={styles.memberFieldHeading}>
            <span><UserRound size={15} /></span>
            <div><strong>Müəllim</strong><small>Bu qrup üzvlüyü üçün məsul müəllimi təyin edin</small></div>
          </div>
          <FormSelect
            name="teacherId"
            options={teacherOptions}
            value={teacherId}
            onValueChange={setTeacherId}
            placeholder="Müəllim seçin"
            searchPlaceholder="Müəllim axtar..."
            aria-label="Müəllim seçimi"
            searchable={teacherOptions.length > 6}
            className={styles.memberSelect}
            contentClassName={styles.memberSelectMenu}
            disabled={teacherOptions.length === 0}
            required
          />
        </div>

        <DialogFooter className={styles.memberDialogFooter}>
          <Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button>
          <Button type="submit" disabled={pending || !enrollmentId || !teacherId}><Plus data-icon="inline-start" /> Tələbə əlavə et</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}

function TeacherDialog({ member, teachers, pending, onClose, onSubmit }: { member: GroupMemberView; teachers: GroupWorkspaceData["teachers"]; pending: boolean; onClose: () => void; onSubmit: (formData: FormData) => void }) {
  const [teacherId, setTeacherId] = useState(member.teacherId);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const formData = new FormData(); formData.set("membershipId", member.id); formData.set("teacherId", teacherId); onSubmit(formData); }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className={styles.smallDialog}><DialogHeader><DialogTitle>Müəllimi dəyiş</DialogTitle><DialogDescription>{member.studentName} üçün yeni müəllim enrollment və qrup üzvlüyündə birlikdə saxlanacaq.</DialogDescription></DialogHeader><form className={styles.formStack} onSubmit={submit}><label><span>Müəllim</span><select value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label><DialogFooter><Button type="button" variant="outline" onClick={onClose}>Ləğv et</Button><Button type="submit" disabled={pending || teacherId === member.teacherId}>Yadda saxla</Button></DialogFooter></form></DialogContent></Dialog>;
}

function PersonCell({ name, code }: { name: string; code: string }) { return <div className={styles.personCell}><span>{initials(name)}</span><div><strong>{name}</strong><small>{code}</small></div></div>; }
function EmptyState({ title, description }: { title: string; description: string }) { return <div className={styles.empty}><UsersRound size={28} /><strong>{title}</strong><p>{description}</p></div>; }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase("az")).join(""); }
function formatCompactDate(value: string) { const [year, month, day] = value.split("-"); return `${day}.${month}.${year}`; }
function statusClass(status: string) { return status === "Aktiv" ? styles.statusActive : status === "Borc" ? styles.statusDebt : status === "Dondurulub" ? styles.statusFrozen : styles.statusNeutral; }
function findScheduledDate(date: string, group: GroupView, direction: -1 | 1, today: string) { const allowed = new Set(group.schedules.map((item) => item.weekday)); const cursor = new Date(`${date}T00:00:00.000Z`); for (let step = 1; step <= 21; step += 1) { const candidate = new Date(cursor); candidate.setUTCDate(cursor.getUTCDate() + step * direction); const value = candidate.toISOString().slice(0, 10); const weekday = [groupWeekdays.SUNDAY, groupWeekdays.MONDAY, groupWeekdays.TUESDAY, groupWeekdays.WEDNESDAY, groupWeekdays.THURSDAY, groupWeekdays.FRIDAY, groupWeekdays.SATURDAY][candidate.getUTCDay()]; if (value <= today && allowed.has(weekday)) return value; } return null; }
