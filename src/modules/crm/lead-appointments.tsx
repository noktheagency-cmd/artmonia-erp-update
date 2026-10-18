"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { listAppointments, saveAppointment } from "./appointment-actions";
import { appointmentKindLabels, appointmentOutcomeLabels } from "./appointment-policy";
import { dailyReportWindow } from "@/modules/dashboard/daily-report-policy";
type Appointment={id:string;plannedAt:string;occurredAt:string|null;kind:string;outcome:string;teacherId:string|null;isLegacy:boolean;previousId:string|null};
const dateTime=(value:string)=>{const local=new Date(new Date(value).getTime()+4*3600000).toISOString();return {date:local.slice(0,10),time:local.slice(11,16)};};
export function LeadAppointments({leadId}:{leadId:string}) {
 const router=useRouter(),[expanded,setExpanded]=useState(false),[rows,setRows]=useState<Appointment[]>([]),[teachers,setTeachers]=useState<{id:string;fullName:string}[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const [key,setKey]=useState(()=>crypto.randomUUID()),[id,setId]=useState(""),[date,setDate]=useState(()=>dailyReportWindow().date),[time,setTime]=useState("12:00"),[kind,setKind]=useState("CONSULTATION"),[outcome,setOutcome]=useState("SCHEDULED"),[teacher,setTeacher]=useState(""),[actualDate,setActualDate]=useState(()=>dailyReportWindow().date),[actualTime,setActualTime]=useState("12:00");
 async function load(){const r=await listAppointments(leadId);if(r.ok){setRows(r.data.rows);setTeachers(r.data.teachers);}else setMessage(r.message);}
 async function toggle(){setExpanded(!expanded);if(!expanded){setBusy(true);try{await load();}catch{setMessage("Görüşlər yüklənmədi.");}finally{setBusy(false);}}}
 function fresh(){setId("");setKey(crypto.randomUUID());setOutcome("SCHEDULED");setKind("CONSULTATION");}
 async function save(form:FormData){if(busy)return;setBusy(true);setMessage("");try{const r=await saveAppointment(form);if(!r.ok){setMessage(r.message);return;}fresh();setMessage("Görüş saxlanıldı.");await load();router.refresh();}catch{setMessage("Görüş saxlanılmadı.");}finally{setBusy(false);}}
 return <section className="crm-dialog-section"><Button type="button" variant="secondary" onClick={toggle} aria-expanded={expanded}>Görüş (konsultasiya + sınaq)</Button>{expanded?<div style={{maxHeight:440,overflowY:"auto",paddingTop:12}}>
  <p className="crm-dialog-hint">Əsas hesabatda bir görüş axınıdır (BK-16). Sınaq yalnız müəllim təyin ediləndə seçilir.</p>
  <Button type="button" variant="outline" onClick={fresh} disabled={busy}>Yeni görüş</Button>
  <form action={save} className="crm-dialog-fields">
   <input name="leadId" type="hidden" value={leadId}/><input name="appointmentId" type="hidden" value={id}/><input name="idempotencyKey" type="hidden" value={key}/>
   <label className="form-field"><span>{outcome==="RESCHEDULED"?"Yeni plan tarixi":"Plan tarixi"}</span><DatePicker required name="date" aria-label="Görüş plan tarixi" value={date} onValueChange={setDate}/></label>
   <label className="form-field"><span>Plan saatı</span><Input name="time" type="time" value={time} onChange={e=>setTime(e.target.value)} required/></label>
   <label className="form-field"><span>Görüş tipi</span><FormSelect name="kind" value={kind} onValueChange={setKind} options={Object.entries(appointmentKindLabels).map(([value,label])=>({value,label}))}/></label>
   <label className="form-field"><span>Nəticə</span><FormSelect name="outcome" value={outcome} onValueChange={setOutcome} options={Object.entries(appointmentOutcomeLabels).filter(([value])=>id||value==="SCHEDULED").map(([value,label])=>({value,label}))}/></label>
   <label className="form-field"><span>Müəllim</span><FormSelect name="teacherId" value={teacher} onValueChange={setTeacher} emptyLabel="Seçilməyib" options={teachers.map(t=>({value:t.id,label:t.fullName}))} required={outcome==="ATTENDED"&&kind==="TRIAL"}/></label>
   {outcome==="ATTENDED"||outcome==="NO_SHOW"?<><label className="form-field"><span>Faktiki tarix</span><DatePicker name="occurredDate" aria-label="Faktiki görüş tarixi" value={actualDate} onValueChange={setActualDate} required/></label><label className="form-field"><span>Faktiki saat</span><Input name="occurredTime" type="time" value={actualTime} onChange={e=>setActualTime(e.target.value)} required/></label></>:null}
   <label className="form-field"><span>Səbəb / qeyd</span><Input name="reason" maxLength={500} required={outcome==="CANCELLED"||outcome==="RESCHEDULED"}/></label><Button type="submit" disabled={busy}>{busy?"Saxlanılır…":"Yadda saxla"}</Button>
  </form><p role="status">{message}</p><p>Son 30 görüş. Təxirə salınmış görüşün əvvəlki tarixi saxlanılır.</p>
  <div style={{display:"grid",gap:8}}>{rows.map(row=><Button key={row.id} type="button" variant="secondary" disabled={busy||row.outcome!=="SCHEDULED"} style={{height:"auto",whiteSpace:"normal",padding:8}} onClick={()=>{const p=dateTime(row.plannedAt);setId(row.id);setDate(p.date);setTime(p.time);setKind(row.kind);setOutcome(row.outcome);setTeacher(row.teacherId??"");setKey(crypto.randomUUID());const a=dateTime(row.occurredAt??new Date().toISOString());setActualDate(a.date);setActualTime(a.time);}}>{dateTime(row.plannedAt).date+" "+dateTime(row.plannedAt).time} · {appointmentKindLabels[row.kind as keyof typeof appointmentKindLabels]??row.kind} · {appointmentOutcomeLabels[row.outcome as keyof typeof appointmentOutcomeLabels]}{row.previousId?" · yeni tarix":""}{row.isLegacy?" · köhnə qeyd":""}</Button>)}</div>
 </div>:null}</section>;
}
