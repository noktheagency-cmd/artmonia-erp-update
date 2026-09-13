"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { todayInBaku } from "@/modules/groups/shared";
import { loadAttendanceReport } from "./attendance-analytics-action";
import { attendanceStats, attendanceTeachers, consecutiveAbsences, type AttendanceEntry, type AttendanceReport } from "./attendance-analytics";

const percent = (value: number | null) => value === null ? "—" : `${value}%`;
const markLabels = { PRESENT: "İştirak", ABSENT: "Qaib", EXCUSED: "Üzrlü" };

export function AttendanceAnalyticsCard() {
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => `${todayInBaku().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayInBaku);
  const [teacherId, setTeacherId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const request = useRef(0);

  async function load(start: string, end: string) {
    const id = ++request.current;
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
    const today = todayInBaku();
    const id = request.current;
    let active = true;
    void loadAttendanceReport({ from: `${today.slice(0, 7)}-01`, to: today }).then((result) => {
      if (!active || id !== request.current) return;
      if (result.ok) setReport(result.data);
      else setError(result.message);
    }).catch(() => {
      if (active && id === request.current) setError("Serverə qoşulmaq mümkün olmadı. Yenidən cəhd edin.");
    }).finally(() => {
      if (active && id === request.current) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const entries = report?.entries ?? [];
  const totals = attendanceStats(entries);
  const teachers = attendanceTeachers(entries);
  const ranked = teachers.filter((teacher) => teacher.rate !== null);
  const previousRate = report?.previousRate ?? null;
  const delta = totals.rate !== null && previousRate !== null ? totals.rate - previousRate : null;
  const matches = (entry: AttendanceEntry) => (!teacherId || entry.teacherId === teacherId) && (!groupId || entry.groupId === groupId);
  const filtered = entries.filter(matches);
  const filteredStats = attendanceStats(filtered);
  const groups = [...new Map(entries.filter((entry) => !teacherId || entry.teacherId === teacherId).map((entry) => [entry.groupId, entry.group])).entries()];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="students-attendance-card" aria-label="Müəllimlər üzrə davamiyyət — detalları aç">
          <span className="students-attendance-title"><CalendarCheck2 size={22} /><span><strong>Müəllimlər üzrə davamiyyət</strong><small>{report ? `${report.from} — ${report.to}` : "Cari ay"} · Slot dərsləri</small></span><ArrowUpRight size={20} /></span>
          {loading ? <span role="status">Davamiyyət yüklənir…</span> : error ? <span role="alert">{error} Detalları açaraq yenidən cəhd edin.</span> : <>
            <span className="students-attendance-metrics">
              <span><strong>{percent(totals.rate)}</strong><small>Ümumi davamiyyət</small></span>
              <span><strong>{totals.risky}</strong><small>Riskli tələbə</small></span>
              <span><strong>{totals.missingSessions}</strong><small>Qeydi natamam dərs</small></span>
              <span><strong>{percent(totals.completeness)}</strong><small>Qeyd tamlığı</small></span>
            </span>
            <span className="students-attendance-foot"><span>{delta === null ? "Müqayisə üçün məlumat yoxdur" : `${delta > 0 ? "+" : ""}${delta} faiz bəndi · əvvəlki eyni uzunluqlu dövrə görə`}</span><span>Detallara bax →</span></span>
            {ranked.length > 0 && <span className="students-attendance-foot"><span>Ən yüksək: {ranked[ranked.length - 1].name} · {percent(ranked[ranked.length - 1].rate)}</span><span>Ən aşağı: {ranked[0].name} · {percent(ranked[0].rate)}</span></span>}
          </>}
        </button>
      </DialogTrigger>
      <DialogContent className="students-attendance-dialog" onEscapeKeyDown={() => setOpen(false)}>
        <DialogHeader><DialogTitle>Müəllimlər üzrə davamiyyət</DialogTitle><DialogDescription>Bitmiş slot dərsləri üzrə nəzarət. Faiz = iştirak / (iştirak + qaib). Üzrlü və qeyd edilməmiş dərslər faizdən çıxarılır.</DialogDescription></DialogHeader>
        <form className="students-attendance-filters" onSubmit={(event) => { event.preventDefault(); void load(from, to); }}>
          <label>Başlanğıc<input type="date" value={from} max={to} required onChange={(event) => setFrom(event.target.value)} /></label>
          <label>Bitmə<input type="date" value={to} min={from} max={todayInBaku()} required onChange={(event) => setTo(event.target.value)} /></label>
          <Button type="submit" disabled={loading}>{loading ? "Yüklənir…" : "Tətbiq et / Yenilə"}</Button>
        </form>
        {loading ? <p role="status">Davamiyyət yüklənir…</p> : error ? <p role="alert">{error}</p> : report && <>
          <p className="students-attendance-note">Göstərilən dövr: {report.from} — {report.to}. Müqayisə: {report.previousFrom} — {report.previousTo}. Dondurulmuş dövrlər və ləğv edilmiş dərslər daxil deyil.</p>
          <div className="students-attendance-filters">
            <label>Müəllim<select aria-label="Müəllim" value={teacherId} onChange={(event) => { setTeacherId(event.target.value); setGroupId(""); setSelectedTeacher(""); }}><option value="">Bütün müəllimlər</option>{teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label>
            <label>Qrup / slot<select aria-label="Qrup / slot" value={groupId} onChange={(event) => { setGroupId(event.target.value); setSelectedTeacher(""); }}><option value="">Bütün qruplar</option>{groups.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>
          </div>
          <div className="students-attendance-summary">Davamiyyət: <strong>{percent(filteredStats.rate)}</strong> · İştirak: {filteredStats.present} · Qaib: {filteredStats.absent} · Üzrlü: {filteredStats.excused} · Qeydsiz: {filteredStats.missing} · Qeyd tamlığı: {percent(filteredStats.completeness)}</div>
          {filtered.length === 0 ? <p>Bu dövr və filtrlər üçün bitmiş dərs məlumatı yoxdur.</p> : <>
            <div className="students-attendance-table-wrap"><table className="students-attendance-table"><thead><tr><th>Müəllim</th><th>Tələbə</th><th>Davamiyyət</th><th>İştirak / gözlənilən</th><th>Riskli tələbə</th><th>Qeydi natamam dərs</th></tr></thead><tbody>{attendanceTeachers(filtered).map((teacher) => <tr key={teacher.id}><td><button type="button" aria-expanded={selectedTeacher === teacher.id} onClick={() => setSelectedTeacher(selectedTeacher === teacher.id ? "" : teacher.id)}>{teacher.name} →</button></td><td>{teacher.students}</td><td>{percent(teacher.rate)}</td><td>{teacher.present} / {teacher.expected}</td><td>{teacher.risky}</td><td>{teacher.missingSessions}</td></tr>)}</tbody></table></div>
            <p className="students-attendance-note">İştirak / gözlənilən tələbə-dərs sayıdır. Risk: bu dövrün sonunda eyni müəllimlə ardıcıl ən azı 3 qaib. Qeyd edilməmiş və üzrlü dərs ardıcıllığı kəsir.</p>
            {selectedTeacher && <TeacherAttendanceDetail key={`${selectedTeacher}:${groupId}`} entries={filtered.filter((entry) => entry.teacherId === selectedTeacher)} />}
          </>}
        </>}
      </DialogContent>
    </Dialog>
  );
}

function TeacherAttendanceDetail({ entries }: { entries: AttendanceEntry[] }) {
  const [riskOnly, setRiskOnly] = useState(false);
  const [page, setPage] = useState(1);
  const students = [...new Map(entries.map((entry) => [entry.studentId, entry.student])).entries()].map(([id, name]) => {
    const history = entries.filter((entry) => entry.studentId === id).sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    return { id, name, history, streak: consecutiveAbsences(history), stats: attendanceStats(history) };
  }).filter((student) => !riskOnly || student.streak >= 3).sort((a, b) => b.streak - a.streak || a.name.localeCompare(b.name, "az"));
  const groups = [...new Map(entries.map((entry) => [entry.groupId, entry.group])).entries()];
  return <section className="students-attendance-detail">
    <h3>{entries[0]?.teacher} — qruplar və tələbələr</h3>
    <div className="students-attendance-group-list">{groups.map(([id, name]) => <span key={id}>{name}: <strong>{percent(attendanceStats(entries.filter((entry) => entry.groupId === id)).rate)}</strong></span>)}</div>
    <label><input type="checkbox" checked={riskOnly} onChange={(event) => { setRiskOnly(event.target.checked); setPage(1); }} /> Yalnız riskli tələbələr</label>
    {students.length === 0 ? <p>Riskli tələbə yoxdur.</p> : students.slice((page - 1) * 20, page * 20).map((student) => <details key={student.id} className="students-attendance-student"><summary>{student.name} · {percent(student.stats.rate)} · {student.stats.absent} qaib · ardıcıl {student.streak} qaib</summary><p>Son iştirak: {student.history.find((entry) => entry.status === "PRESENT")?.date ?? "Seçilmiş dövrdə yoxdur"} · <Link href={`/students/${student.id}`}>Tələbə profilini aç →</Link></p><ul>{student.history.map((entry) => <li key={`${entry.sessionId}:${entry.enrollmentId}`}>{entry.date} · {entry.time} · {entry.group} — <strong>{entry.status ? markLabels[entry.status] : "Qeyd edilməyib"}</strong></li>)}</ul></details>)}
    {students.length > 20 && <div className="students-attendance-pagination"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Əvvəlki</Button><span>{page} / {Math.ceil(students.length / 20)}</span><Button disabled={page * 20 >= students.length} onClick={() => setPage(page + 1)}>Növbəti</Button></div>}
  </section>;
}
