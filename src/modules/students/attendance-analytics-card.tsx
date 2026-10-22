"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DatePicker } from "@/components/ui/date-picker";
import { RetentionAnalyticsPanel } from "./retention-analytics-panel";
import { retentionInput, localizeAttendanceGroup, type RetentionOptions } from "./retention-analytics";
import { ArrowLeft, ArrowUpRight, CalendarCheck2, CheckCheck, ChevronRight, CircleHelp, RefreshCw, ShieldAlert, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormSelect } from "@/components/ui/select";
import { todayInBaku } from "@/modules/groups/shared";
import { loadAttendanceReport } from "./attendance-analytics-action";
import { attendanceStats, attendanceTeachers, consecutiveAbsences, isAtRiskStreak, riskyStudentIds, type AttendanceEntry, type AttendanceReport } from "./attendance-analytics";

const percent = (value: number | null) => value === null ? "—" : `${value}%`;
const markLabels = { PRESENT: "İştirak", ABSENT: "Qaib", EXCUSED: "Üzrlü" };

export function AttendanceAnalyticsCard() {
  const searchParams = useSearchParams();
  const today = todayInBaku();
  const requestedPeriod = retentionInput.safeParse({ from: searchParams.get("attendanceFrom"), to: searchParams.get("attendanceTo") });
  const initialFrom = requestedPeriod.success && requestedPeriod.data.to <= today ? requestedPeriod.data.from : `${today.slice(0, 7)}-01`;
  const initialTo = requestedPeriod.success && requestedPeriod.data.to <= today ? requestedPeriod.data.to : today;
  const [appliedPeriod, setAppliedPeriod] = useState({ from: initialFrom, to: initialTo });
  const [retentionOptions, setRetentionOptions] = useState<RetentionOptions>({ teachers: [], groups: [] });
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(searchParams.get("attendance") === "1");
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [teacherId, setTeacherId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const request = useRef(0);

  async function load(start: string, end: string) {
    const id = ++request.current;
    setAppliedPeriod({ from: start, to: end });
    setTeacherId(""); setGroupId(""); setSelectedTeacher("");
    setLoading(true);
    setError("");
    try {
      const result = await loadAttendanceReport({ from: start, to: end });
      if (id !== request.current) return;
      if (!result.ok) { setError(result.message); return; }
      setReport(result.data);
      setTeacherId(""); setGroupId(""); setSelectedTeacher("");
    } catch {
      if (id === request.current) setError("Serverə qoşulmaq mümkün olmadı. Yenidən cəhd edin.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  useEffect(() => {
    const id = request.current;
    let active = true;
    void loadAttendanceReport({ from: initialFrom, to: initialTo }).then((result) => {
      if (!active || id !== request.current) return;
      if (result.ok) setReport(result.data);
      else setError(result.message);
    }).catch(() => {
      if (active && id === request.current) setError("Serverə qoşulmaq mümkün olmadı. Yenidən cəhd edin.");
    }).finally(() => {
      if (active && id === request.current) setLoading(false);
    });
    return () => { active = false; };
  }, [initialFrom, initialTo]);

  const entries = report?.entries ?? [];
  const totals = attendanceStats(entries);
  const teachers = attendanceTeachers(entries);
  const ranked = teachers.filter((teacher) => teacher.rate !== null);
  const previousRate = report?.previousRate ?? null;
  const delta = totals.rate !== null && previousRate !== null ? totals.rate - previousRate : null;
  const matches = (entry: AttendanceEntry) => (!teacherId || entry.teacherId === teacherId) && (!groupId || entry.groupId === groupId);
  const filtered = entries.filter(matches);
  const filteredStats = attendanceStats(filtered);
  const teacherOptions = [...new Map([...teachers, ...retentionOptions.teachers].map((teacher) => [teacher.id, teacher])).values()];
  const groups = [...new Map([
    ...entries.filter((entry) => !teacherId || entry.teacherId === teacherId).map((entry) => [entry.groupId, localizeAttendanceGroup(entry.group)] as const),
    ...retentionOptions.groups.filter((group) => !teacherId || group.teacherId === teacherId).map((group) => [group.id, group.name] as const),
  ]).entries()];
  const riskyIds = riskyStudentIds(filtered);
  const riskyStudentsHref = `/students?tab=list&ids=${riskyIds.length ? riskyIds.join(",") : "none"}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="students-analytics-card students-attendance-card" aria-label="Retention and Churn Rate — detalları aç">
          <span className="students-attendance-title"><span className="students-attendance-icon"><CalendarCheck2 size={20} /></span><span className="students-attendance-heading"><strong>Retention and Churn Rate</strong><small>Müəllimlər üzrə iştirak göstəricisi</small></span><ArrowUpRight className="students-attendance-arrow" size={18} /></span>
          {loading ? <span role="status">Davamiyyət yüklənir…</span> : error ? <span role="alert">{error} Detalları açaraq yenidən cəhd edin.</span> : <>
            <span className="students-attendance-body">
              <span className="students-attendance-gauge">
                <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="students-attendance-track" cx="60" cy="60" r="50" /><circle className="students-attendance-progress" cx="60" cy="60" r="50" pathLength="100" strokeDasharray={`${totals.rate ?? 0} 100`} /></svg>
                <span><strong>{percent(totals.rate)}</strong><small>iştirak</small></span>
              </span>
              <span className="students-attendance-metrics">
                <span><small><i className="is-risk" />Riskli tələbə</small><strong>{totals.risky}</strong></span>
                <span><small><i className="is-missing" />Natamam dərs</small><strong>{totals.missingSessions}</strong></span>
                <span><small><i className="is-complete" />Qeyd tamlığı</small><strong>{percent(totals.completeness)}</strong></span>
              </span>
            </span>
            <span className="students-attendance-foot"><span className="students-attendance-change" data-direction={delta !== null && delta < 0 ? "down" : "up"}>{delta === null ? "Müqayisə yoxdur" : `${delta > 0 ? "+" : ""}${delta} faiz bəndi`}</span><span>{report ? `${report.from.slice(8)}.${report.from.slice(5, 7)} — ${report.to.slice(8)}.${report.to.slice(5, 7)}.${report.to.slice(0, 4)}` : "Cari ay"}</span></span>
            {ranked.length > 0 && <span className="students-attendance-ranking"><span><small>Ən yüksək</small><span title={ranked[ranked.length - 1].name}>{ranked[ranked.length - 1].name}</span><strong>{percent(ranked[ranked.length - 1].rate)}</strong></span><span><small>Ən aşağı</small><span title={ranked[0].name}>{ranked[0].name}</span><strong>{percent(ranked[0].rate)}</strong></span></span>}
          </>}
        </button>
      </DialogTrigger>
      <DialogContent className="students-attendance-dialog" onEscapeKeyDown={() => {
        if (!document.querySelector(".students-attendance-dialog .date-picker-trigger.is-open")) setOpen(false);
      }}>
        <DialogHeader className="attendance-dialog-header">
          <span className="attendance-dialog-eyebrow"><CalendarCheck2 size={16} /> TƏLƏBƏ ANALİTİKASI</span>
          <DialogTitle>Tələbələrin saxlanması və itkisi</DialogTitle>
          <DialogDescription visible>Seçilmiş dövr üzrə itki, saxlanma və davamiyyət.</DialogDescription>
        </DialogHeader>
        <div className="attendance-dialog-scroll">
          <form className="students-attendance-filters" onSubmit={(event) => { event.preventDefault(); void load(from, to); }}>
            <label>Başlanğıc<DatePicker name="attendanceFrom" aria-label="Başlanğıc tarixi" value={from} maxValue={to} allowClear={false} onValueChange={setFrom} /></label>
            <label>Bitmə<DatePicker name="attendanceTo" aria-label="Bitmə tarixi" value={to} maxValue={todayInBaku()} allowClear={false} onValueChange={setTo} /></label>
            <label>Müəllim
              <FormSelect
                name="attendanceTeacher"
                aria-label="Müəllim"
                disabled={loading}
                value={teacherId || "all"}
                onValueChange={(value) => { setTeacherId(value === "all" ? "" : value); setGroupId(""); setSelectedTeacher(""); setShowRisky(false); }}
                emptyLabel="Bütün müəllimlər"
                emptyValue="all"
                searchable
                searchPlaceholder="Müəllim axtar..."
                options={teacherOptions.map((teacher) => ({ value: teacher.id, label: teacher.name }))}
              />
            </label>
            <label>Qrup / dərs vaxtı
              <FormSelect
                name="attendanceGroup"
                aria-label="Qrup / dərs vaxtı"
                disabled={loading}
                value={groupId || "all"}
                onValueChange={(value) => { setGroupId(value === "all" ? "" : value); setSelectedTeacher(""); setShowRisky(false); }}
                emptyLabel="Bütün qruplar"
                emptyValue="all"
                searchable
                searchPlaceholder="Qrup axtar..."
                options={groups.map(([id, name]) => ({ value: id, label: name }))}
              />
            </label>
            <Button className="attendance-apply" type="submit" disabled={loading}><RefreshCw size={15} />{loading ? "Yüklənir…" : "Yenilə"}</Button>
          </form>
          <RetentionAnalyticsPanel key={`${appliedPeriod.from}:${appliedPeriod.to}:${teacherId}:${groupId}`} from={appliedPeriod.from} to={appliedPeriod.to} teacherId={teacherId} groupId={groupId} onOptions={setRetentionOptions} />
          {loading ? <div className="attendance-state" role="status"><RefreshCw size={26} /><strong>Davamiyyət yüklənir…</strong><span>Göstəricilər hazırlanır.</span></div> : error ? <div className="attendance-state is-error" role="alert"><ShieldAlert size={26} /><strong>Məlumat yüklənmədi</strong><span>{error}</span><Button variant="outline" onClick={() => void load(from, to)}>Yenidən cəhd et</Button></div> : report && <>
            <section className="attendance-block" aria-label="Davamiyyət">
              <div className="attendance-section-heading">
                <div><h3>Davamiyyət</h3><p>{displayDate(report.from)} — {displayDate(report.to)}</p></div>
                <span>{filteredStats.students} tələbə · {attendanceTeachers(filtered).length} müəllim</span>
              </div>
              <div className="attendance-kpis">
                <div className="attendance-kpi is-primary"><span><CalendarCheck2 size={17} />Ümumi davamiyyət</span><strong>{percent(filteredStats.rate)}</strong><small>{filteredStats.present} iştirak / {filteredStats.present + filteredStats.absent} dərs</small></div>
                <Link href={riskyStudentsHref} className="attendance-kpi is-action" onClick={() => setOpen(false)} aria-label="Riskli tələbələri siyahıda göstər">
                  <span><ShieldAlert size={17} />Riskli tələbə</span>
                  <strong>{filteredStats.risky}</strong>
                  <small className="attendance-kpi-action">Ətraflı <ChevronRight size={14} /></small>
                </Link>
                <div className="attendance-kpi"><span><UsersRound size={17} />Natamam dərs</span><strong>{filteredStats.missingSessions}</strong><small>{filteredStats.missing} tələbə üçün qeyd yoxdur</small></div>
                <div className="attendance-kpi"><span><CheckCheck size={17} />Qeyd tamlığı</span><strong>{percent(filteredStats.completeness)}</strong><small>{filteredStats.excused} üzrlü · {filteredStats.absent} qaib</small></div>
              </div>
            </section>
            {filtered.length === 0 ? <div className="attendance-state"><CalendarCheck2 size={28} /><strong>Hələ dərs məlumatı yoxdur</strong><span>Bu dövr və filtrlər üçün bitmiş dərs məlumatı yoxdur.</span></div> : selectedTeacher ? <div className="attendance-block">
              <button type="button" className="attendance-back" onClick={() => setSelectedTeacher("")}><ArrowLeft size={16} /> Bütün müəllimlərə qayıt</button>
              <TeacherAttendanceDetail key={`${selectedTeacher}:${groupId}`} entries={filtered.filter((entry) => entry.teacherId === selectedTeacher)} />
            </div> : <section className="attendance-teacher-section attendance-block">
              <div className="attendance-section-heading"><div><h3>Müəllimlər</h3><p>Detallar üçün müəllimi seçin</p></div><span>{attendanceTeachers(filtered).length} müəllim</span></div>
              <div className="students-attendance-table-wrap"><table className="students-attendance-table">
                <thead><tr><th>Müəllim</th><th>Davamiyyət</th><th>İştirak / gözlənilən</th><th>Riskli tələbə</th><th>Natamam dərs</th></tr></thead>
                <tbody>{attendanceTeachers(filtered).map((teacher) => <tr key={teacher.id}>
                  <td><button type="button" className="attendance-teacher-name" onClick={() => setSelectedTeacher(teacher.id)} aria-label={`${teacher.name} — tələbələrə bax`}><span className="attendance-avatar" aria-hidden="true">{initials(teacher.name)}</span><span><strong>{teacher.name}</strong><small>{teacher.students} tələbə</small></span><ChevronRight size={16} /></button></td>
                  <td><span className="attendance-rate"><strong>{percent(teacher.rate)}</strong><span aria-hidden="true"><i style={{ width: `${teacher.rate ?? 0}%` }} /></span></span></td>
                  <td>{teacher.present}<span className="attendance-muted"> / {teacher.expected}</span></td>
                  <td><span className={`attendance-badge ${teacher.risky ? "is-risk" : "is-neutral"}`}>{teacher.risky ? `${teacher.risky} tələbə` : "Yoxdur"}</span></td>
                  <td>{teacher.missingSessions || <span className="attendance-muted">—</span>}</td>
                </tr>)}</tbody>
              </table></div>
            </section>}
            <details className="attendance-method">
              <summary><CircleHelp size={15} />Göstəricilər necə hesablanır?</summary>
              <div>
                <p><strong>Saxlanma və itki.</strong> Tələbə itkisi = seçilmiş dövrdə donduran və ya dayandıran unikal tələbələr / dövrün sonunadək qeydiyyatdan keçən tələbələr. İmtina edənlər daxil deyil. Bu panel satış KPI-sı deyil.</p>
                <p><strong>Davamiyyət.</strong> İştirak / (iştirak + qaib). Üzrlü və qeyd edilməmiş dərslər faizdən çıxarılır.</p>
                <p><strong>Risk.</strong> Dövrün sonunda eyni müəllimlə ardıcıl ən azı 3 qaib; tələbənin cari statusu aktiv qalmalıdır. Dayandırılmış, dondurulmuş, imtina və tamamlanmış tələbələr riskə düşmür.</p>
                <p>Müqayisə dövrü: {displayDate(report.previousFrom)} — {displayDate(report.previousTo)}.</p>
              </div>
            </details>
          </>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TeacherAttendanceDetail({ entries }: { entries: AttendanceEntry[] }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [riskOnly, setRiskOnly] = useState(false);
  const [page, setPage] = useState(1);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);
  const students = [...new Map(entries.map((entry) => [entry.studentId, entry.student])).entries()].map(([id, name]) => {
    const history = entries.filter((entry) => entry.studentId === id).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    const streak = consecutiveAbsences(history);
    return { id, name, history, lastPresent: history.find((entry) => entry.status === "PRESENT")?.date, streak, atRisk: isAtRiskStreak(history), stats: attendanceStats(history) };
  }).filter((student) => !riskOnly || student.atRisk).sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name, "az"));
  const groups = [...new Map(entries.map((entry) => [entry.groupId, entry.group])).entries()];
  return <section className="students-attendance-detail">
    <div className="attendance-section-heading"><div><h3 ref={headingRef} tabIndex={-1}>{entries[0]?.teacher}</h3><p>Qruplar və tələbələrin iştirak tarixçəsi</p></div><span>{students.length} tələbə</span></div>
    <div className="students-attendance-group-list">{groups.map(([id, name]) => <span key={id}>{localizeAttendanceGroup(name)}<strong>{percent(attendanceStats(entries.filter((entry) => entry.groupId === id)).rate)}</strong></span>)}</div>
    <label className="attendance-risk-toggle"><input type="checkbox" checked={riskOnly} onChange={(event) => { setRiskOnly(event.target.checked); setPage(1); }} /><ShieldAlert size={15} /> Yalnız riskli tələbələr</label>
    {students.length === 0 ? <div className="attendance-state"><CheckCheck size={26} /><strong>Riskli tələbə yoxdur.</strong></div> : students.slice((page - 1) * 20, page * 20).map((student) => <details key={student.id} className="students-attendance-student">
      <summary><span className="attendance-avatar" aria-hidden="true">{initials(student.name)}</span><span className="attendance-student-name"><strong>{student.name}</strong><small>{student.stats.absent} qaib · ardıcıl {student.streak} qaib</small></span><span className={`attendance-badge ${student.atRisk ? "is-risk" : "is-neutral"}`}>{percent(student.stats.rate)}</span><ChevronRight size={16} /></summary>
      <div className="attendance-student-history"><div className="attendance-history-heading"><span>Son iştirak: <strong>{student.lastPresent ? displayDate(student.lastPresent) : "Seçilmiş dövrdə yoxdur"}</strong></span><Link href={`/students/${student.id}`}>Tələbə profilini aç <ArrowUpRight size={14} /></Link></div>
        <ul>{student.history.map((entry) => <li key={`${entry.sessionId}:${entry.enrollmentId}`}><span><strong>{displayDate(entry.date)}</strong><small>{entry.time} · {localizeAttendanceGroup(entry.group)}</small></span><span className="attendance-badge" data-mark={entry.status ?? "UNKNOWN"}>{entry.status ? markLabels[entry.status] : "Qeyd edilməyib"}</span></li>)}</ul>
      </div>
    </details>)}
    {students.length > 20 && <div className="students-attendance-pagination"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Əvvəlki</Button><span>{page} / {Math.ceil(students.length / 20)}</span><Button variant="outline" disabled={page * 20 >= students.length} onClick={() => setPage(page + 1)}>Növbəti</Button></div>}
  </section>;
}

function displayDate(date: string) {
  return date.split("-").reverse().join(".");
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
}
