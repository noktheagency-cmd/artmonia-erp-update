"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCourseSales, cancelCourseSale } from "./course-sale-actions";
type Sale={id:string;kind:string;status:string;date:string;reason:string|null};
export function CourseSalesPanel({studentId}:{studentId:string}) {
 const [open,setOpen]=useState(false),[rows,setRows]=useState<Sale[]>([]),[canCancel,setCanCancel]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),router=useRouter();
 async function load(){const r=await listCourseSales(studentId);if(r.ok){setRows(r.data.rows);setCanCancel(r.data.canCancel);}else setMessage(r.message);}
 async function toggle(){setOpen(!open);if(!open){setBusy(true);try{await load();}catch{setMessage("Satışlar yüklənmədi.");}finally{setBusy(false);}}}
 async function cancel(form:FormData){setBusy(true);try{const r=await cancelCourseSale(form);if(r.ok){setMessage("Satış ləğv edildi. Pul qeydi saxlanıldı.");await load();router.refresh();}else setMessage(r.message);}catch{setMessage("Ləğv edilmədi.");}finally{setBusy(false);}}
 return <div><Button type="button" variant="secondary" onClick={toggle} aria-expanded={open}>Qəbul satışları</Button>{open?<div><p>Beh ilk dövr tam ödənənədək ləğv edilə bilər. Pul kassada və tarixçədə qalır.</p><p role="status">{message}</p>{rows.length===0&&!busy?<p>Təsdiqlənmiş satış yoxdur.</p>:null}{rows.map(s=><div key={s.id}><p>{s.date} · {s.kind==="NEW"?"Yeni qəbul":"Qayıdış"} · {s.status==="DEPOSIT"?"Beh":s.status==="COMPLETE"?"Tam ödəniş":"Ləğv"}{s.reason?" · "+s.reason:""}</p>{canCancel&&s.status==="DEPOSIT"?<form action={cancel}><input name="saleId" type="hidden" value={s.id}/><Input aria-label="Satışın ləğv səbəbi" name="reason" minLength={3} maxLength={500} placeholder="Ləğv səbəbi" required/><Button type="submit" variant="secondary" disabled={busy}>Beh satışını ləğv et</Button></form>:null}</div>)}</div>:null}</div>;
}
