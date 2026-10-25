"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, CalendarPlus, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSelect } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { currentBakuMonthStart } from "@/modules/shared/creation-date-policy";
import { currentBakuDateValue } from "@/lib/baku-date";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import { GuestLessonFields } from "./guest-lesson-fields";
import { bookSingleLessonAction, markSingleLessonAction, paySingleLessonAction } from "./single-lesson-actions";

export type SingleLessonViewData = {
  q: string; selectedStudent: string; page: number; hasNext: boolean; status: string;
  teachers: Array<{value:string;label:string}>; programs: Array<{value:string;label:string}>;
  rows: Array<{isTestData?:boolean;id:string;studentId:string;code:string;student:string;teacher:string;teacherId:string;program:string;programId:string;date:string;time:string;duration:number;room:string;price:string;status:string;paid:boolean;canMark:boolean;canPay:boolean;canBook:boolean}>;
};
type Row = SingleLessonViewData["rows"][number];
const statusNames: Record<string, string> = {RESERVED:"Planlaşdırılıb",ATTENDED:"Gəldi",ABSENT:"Gəlmədi",CANCELLED:"Ləğv edilib",NEW:"Dərs təyin edilməyib"};

function GuestLessonFilters({ q, status, student }: { q: string; status: string; student: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filters, setFilters] = useState({ q, status, sourceQ: q, sourceStatus: status });
  // Sync history/server changes without replacing text typed during a pending navigation.
  if (q !== filters.sourceQ || status !== filters.sourceStatus) {
    setFilters({ q: filters.q === filters.sourceQ ? q : filters.q,
      status: filters.status === filters.sourceStatus ? status : filters.status,
      sourceQ: q, sourceStatus: status });
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function apply(nextQ: string, nextStatus: string, delay = 0) {
    if (timer.current) clearTimeout(timer.current);
    const navigate = () => {
      const params = new URLSearchParams();
      if (nextQ.trim()) params.set("q", nextQ.trim());
      if (nextStatus !== "ALL") params.set("status", nextStatus);
      if (student) params.set("student", student);
      const query = params.toString();
      startTransition(() => router.replace(("/students/single-lessons" + (query ? "?" + query : "")) as Route, { scroll: false }));
    };
    if (delay) timer.current = setTimeout(navigate, delay);
    else navigate();
  }

  return <form className="guest-ledger-toolbar" role="search" aria-label="Qonaq dərs filtrləri"
    onSubmit={event => { event.preventDefault(); apply(filters.q, filters.status); }}>
    <div className="guest-search"><Search size={17} aria-hidden="true"/><Input name="q" value={filters.q}
      onChange={event => { const value = event.target.value; setFilters(current => ({ ...current, q: value })); apply(value, filters.status, 300); }}
      placeholder="Ad, kod və ya telefon" aria-label="Qonaq dərs axtar" maxLength={80}/></div>
    <div className="guest-status-filter"><FormSelect name="status" value={filters.status}
      onValueChange={value => { setFilters(current => ({ ...current, status: value })); apply(filters.q, value); }}
      aria-label="Davamiyyət filtri" options={[{value:"ALL",label:"Bütün qeydlər"},{value:"RESERVED",label:"Planlaşdırılıb"},{value:"ATTENDED",label:"Gəldi"},{value:"ABSENT",label:"Gəlmədi"},{value:"CANCELLED",label:"Ləğv edilib"}]}/></div>
    <span className="sr-only" role="status">{pending ? "Nəticələr yenilənir" : ""}</span>
  </form>;
}

export function SingleLessonView({ data }: { data: SingleLessonViewData }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Row | null>(null);
  const [mode, setMode] = useState<"detail" | "book" | "pay">("detail");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState("");
  function open(row: Row, nextMode: typeof mode = "detail") { setSelected(row); setMode(nextMode); setRequestId(crypto.randomUUID()); }
  async function run(action: (form: FormData) => Promise<unknown>, form: FormData, message: string) {
    if (busy) return;
    setBusy(true); form.set("requestId",requestId);
    try { unwrapActionResult(await action(form)); notifySuccess(message); setSelected(null); router.refresh(); }
    catch (error) { notifyCaughtError(error, "Əməliyyat alınmadı."); }
    finally { setBusy(false); }
  }
  function pageHref(page: number) { const p = new URLSearchParams({q:data.q,status:data.status,page:String(page)}); if(data.selectedStudent)p.set("student",data.selectedStudent); return ("/students/single-lessons?"+p) as Route; }
  return <section className="guest-lessons-page">
    <header className="guest-lessons-heading"><div><Link href="/students" className="guest-back"><ArrowLeft size={15}/>Tələbələr</Link><h1>Qonaq dərslər</h1><p>Hər gəliş ayrıca. Yeni tarix təyin etmək üçün tələbənin adına klikləyin.</p></div></header>
    <section className="guest-ledger" aria-label="Qonaq dərs jurnalı">
      <GuestLessonFilters key={data.selectedStudent} q={data.q} status={data.status} student={data.selectedStudent}/>
      <div className="guest-ledger-scroll"><table className="guest-ledger-table"><thead><tr><th>Tələbə</th><th>Dərs / müəllim</th><th>Gəliş vaxtı</th><th>Davamiyyət</th><th>Ödəniş</th><th><span className="sr-only">Əməliyyat</span></th></tr></thead><tbody>
        {data.rows.map(row => <tr key={row.id}>
          <th scope="row"><button type="button" className="guest-student-link" onClick={()=>open(row)}><strong>{row.student}</strong><span>{row.code} <span className="guest-lesson-badge">Qonaq dərs</span>{row.isTestData ? <span className="guest-test-badge">Test</span> : null}</span></button></th>
          <td><strong>{row.program || "—"}</strong><small>{row.teacher || "Müəllim seçilməyib"}</small></td>
          <td><strong>{row.date ? row.date.split("-").reverse().join(".") : "—"}</strong><small>{row.time}{row.duration ? " · "+row.duration+" dəq." : ""}{row.room ? " · "+row.room : ""}</small></td>
          <td><span className={"guest-status guest-status-"+row.status.toLowerCase()}>{statusNames[row.status]}</span></td>
          <td><strong>{row.price ? row.price+" AZN" : "—"}</strong><small className={row.paid ? "guest-paid" : ""}>{row.paid ? "Ödənilib" : ["ABSENT","CANCELLED","NEW"].includes(row.status) ? "—" : "Ödənilməyib"}</small></td>
          <td><button type="button" className="guest-row-action" onClick={()=>open(row)} aria-label={row.student+": dərs əməliyyatları"}><ChevronRight size={18}/></button></td>
        </tr>)}
        {!data.rows.length ? <tr><td colSpan={6} className="guest-empty">Uyğun qonaq dərs tapılmadı.<small>İlk qeydiyyatı Yeni tələbə və ya Follow-up pəncərəsində edin.</small></td></tr> : null}
      </tbody></table></div>
      <footer className="guest-ledger-footer"><span>Səhifə {data.page}</span><div>{data.page>1 ? <Link href={pageHref(data.page-1)}>Əvvəlki</Link> : null}{data.hasNext ? <Link href={pageHref(data.page+1)}>Növbəti</Link> : null}</div></footer>
    </section>
    <Dialog open={Boolean(selected)} onOpenChange={value=>{if(!value&&!busy)setSelected(null);}}><DialogContent className="guest-lesson-dialog"><DialogHeader><DialogTitle>{mode==="book" ? "Yeni gəliş təyin et" : mode==="pay" ? "Qonaq dərsin ödənişi" : selected?.student}</DialogTitle><DialogDescription>{selected?.code} · {mode==="detail" ? "Qonaq dərs — aylıq paket və satış deyil" : selected?.student}</DialogDescription></DialogHeader>
      {selected && mode==="detail" ? <div className="guest-lesson-detail">
        {selected.date ? <p><strong>{selected.date.split("-").reverse().join(".")} · {selected.time}</strong><br/>{selected.program} · {selected.teacher}<br/>{statusNames[selected.status]} · {selected.price} AZN · {selected.paid ? "Ödənilib" : "Ödənilməyib"}</p> : null}
        {selected.canMark && selected.status==="RESERVED" ? <form className="guest-dialog-actions" action={form=>run(markSingleLessonAction,form,"Davamiyyət saxlanıldı")}><input type="hidden" name="lessonId" value={selected.id}/><Button name="status" value="ATTENDED" disabled={busy || selected.date>currentBakuDateValue()}>Gəldi</Button><Button variant="outline" name="status" value="ABSENT" disabled={busy || selected.date>currentBakuDateValue()}>Gəlmədi</Button>{!selected.paid ? <Button variant="ghost" name="status" value="CANCELLED" disabled={busy}>Ləğv et</Button> : null}</form> : null}
        <div className="guest-dialog-actions">{selected.canPay && !selected.paid && ["RESERVED","ATTENDED"].includes(selected.status) ? <Button onClick={()=>setMode("pay")}>Ödənişi qəbul et</Button> : null}{selected.canBook ? <Button variant="outline" onClick={()=>setMode("book")}><CalendarPlus size={16}/>Yeni gəliş təyin et</Button> : null}</div>
        <Link href={('/students/'+selected.studentId) as Route} className="guest-back">Tələbə profilinə keç<ChevronRight size={14}/></Link>
      </div> : null}
      {selected && mode==="book" ? <form action={form=>run(bookSingleLessonAction,form,"Qonaq dərs təyin edildi")}><input type="hidden" name="studentId" value={selected.studentId}/><GuestLessonFields booking programs={data.programs} teachers={data.teachers} defaults={{programId:selected.programId,teacherId:selected.teacherId,price:selected.price,time:selected.time,duration:selected.duration || 120,room:selected.room}}/><div className="guest-dialog-actions"><Button type="button" variant="ghost" disabled={busy} onClick={()=>setMode("detail")}>Geri</Button><Button type="submit" disabled={busy}>{busy?"Saxlanılır…":"Dərsi təyin et"}</Button></div></form> : null}
      {selected && mode==="pay" ? <form action={form=>run(paySingleLessonAction,form,"Qonaq dərsin ödənişi saxlanıldı")}><input type="hidden" name="lessonId" value={selected.id}/><p className="guest-payment-amount">{selected.price} <span>AZN</span></p><div className="guest-lesson-fields"><label className="form-field"><span>Ödəniş tarixi</span><DatePicker name="paidDate" minValue={currentBakuMonthStart()} maxValue={currentBakuDateValue()} defaultValue={currentBakuDateValue()} required allowClear={false}/></label><label className="form-field"><span>Metod</span><FormSelect name="method" defaultValue="CASH" options={[{value:"CASH",label:"Nağd"},{value:"CARD",label:"Kart"},{value:"BANK_TRANSFER",label:"Köçürmə"}]}/></label></div><div className="guest-dialog-actions"><Button type="button" variant="ghost" disabled={busy} onClick={()=>setMode("detail")}>Geri</Button><Button type="submit" disabled={busy}>{busy?"Saxlanılır…":"Ödənişi qəbul et"}</Button></div></form> : null}
    </DialogContent></Dialog>
  </section>;
}
