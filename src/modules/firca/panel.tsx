"use client";
import { useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Paintbrush,BookOpen,Trophy,MessageSquare,Settings2,RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError,notifySuccess } from "@/lib/app-notifications";
import type { FircaAdminData } from "./admin-queries";
import { reviewHomeworkAction,saveFircaSettingsAction,excludeFircaStudentAction,moderateFircaCommentAction } from "./actions";

const labels={submitted:"Yoxlanılacaq",accepted:"Qəbul edilmiş",rejected:"Düzəlişə qaytarılmış"};
export function FircaPanel({data,status,studentId}:{data:FircaAdminData;status:keyof typeof labels;studentId:string}) {
  const router=useRouter();const [pending,startTransition]=useTransition();const [tab,setTab]=useState(studentId ? "settings" : "homework");
  const [review,setReview]=useState<{id:string;revision:number;status:"accepted"|"rejected"}|null>(null);
  const [moderating,setModerating]=useState<string|null>(null);
  function run(action:()=>Promise<unknown>,success:string) {startTransition(async()=>{try{unwrapActionResult(await action());notifySuccess(success);setReview(null);setModerating(null);router.refresh();}catch(e){notifyCaughtError(e,"Əməliyyat alınmadı.");}});}
  return <div className="firca-page">
    <header className="firca-heading"><span className="firca-mark"><Paintbrush/></span><div><h1>Fırça</h1><p>Hər dərs bir addım, hər səy bir irəliləyiş.</p></div><Button variant="outline" disabled={pending} onClick={()=>router.refresh()}><RefreshCw/> Yenilə</Button></header>
    <div className="firca-metrics"><article><BookOpen/><strong>+{data.settings.attendancePoints}</strong><span>Dərsdə iştirak</span></article><article><Paintbrush/><strong>+{data.settings.homeworkPoints}</strong><span>Qəbul edilmiş tapşırıq</span></article><article><MessageSquare/><strong>+{data.settings.commentPoints}</strong><span>Faydalı rəy · həftədə {data.settings.weeklyCommentLimit} dəfə</span></article></div>
    <nav className="firca-tabs" aria-label="Fırça bölmələri">{[["homework","Tapşırıqlar"],["leaderboard","Bu ayın ən aktivləri"],["comments","Rəylər"],...(data.admin?[["settings","Ayarlar və tarixçə"]]:[])].map(([id,label])=><Button key={id} variant={tab===id?"default":"ghost"} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</Button>)}</nav>
    <section className="firca-surface" aria-busy={pending}>
      {tab==="homework" && <><h2><BookOpen/> Ev tapşırıqları</h2><p>İşi açıb yoxlayın. Qəbul edilən tapşırıq dərs üzrə bir dəfə Fırça qazandırır.</p>
        <div className="firca-tabs">{Object.entries(labels).map(([id,label])=><Link key={id} aria-current={status===id?"page":undefined} href={{pathname:"/firca",query:{status:id}}}>{label}</Link>)}</div>
        {!data.queue.length?<div className="firca-empty">Bu siyahıda tapşırıq yoxdur.</div>:data.queue.map(row=><article className="firca-record" key={row.id}>
          <div><strong>{row.student}</strong><p>{row.lesson} · {row.date}</p>{row.feedback&&<small>{row.feedback}</small>}</div>
          <a href={"/api/firca/submissions/"+row.id+"/file"} target="_blank" rel="noreferrer">İşi aç</a>
          <div className="firca-buttons">{row.status!=="accepted"&&<Button disabled={pending} onClick={()=>setReview({id:row.id,revision:row.revision,status:"accepted"})}>Qəbul et</Button>}
          {row.status!=="rejected"&&<Button variant="outline" disabled={pending} onClick={()=>setReview({id:row.id,revision:row.revision,status:"rejected"})}>Düzəlişə qaytar</Button>}</div>
          {review?.id===row.id&&<form className="firca-review" action={form=>run(()=>reviewHomeworkAction({...review,reason:String(form.get("reason"))}),"Tapşırıq yeniləndi")}>
            <label>Qeyd<textarea name="reason" minLength={3} maxLength={1000} required placeholder={review.status==="accepted"?"İşlə bağlı müəllim qeydi":"Nəyi düzəltmək lazımdır?"}/></label>
            <Button disabled={pending}>Təsdiqlə</Button><Button type="button" variant="ghost" onClick={()=>setReview(null)}>Ləğv et</Button>
          </form>}
        </article>)}<small>Son 50 nəticə göstərilir.</small></>}
      {tab==="leaderboard"&&<><h2><Trophy/> Bu ayın ən aktivləri</h2><p>{data.leaderboard.month} · Bütün akademiya · Bakı vaxtı</p>
        {!data.leaderboard.top.length?<div className="firca-empty">Yarış iştirakçısı yoxdur.</div>:<ol className="firca-ranking">{data.leaderboard.top.map(row=><li key={row.identifier}><span>{row.rank}</span><strong>{row.displayName}</strong><b>{row.points} Fırça</b></li>)}</ol>}
        <small>Sıralama həmin ayın fəaliyyətini göstərir. Rəsm keyfiyyətinin qiymətləndirilməsi deyil.</small></>}
      {tab==="comments"&&<><h2><MessageSquare/> İcma rəyləri</h2><p>Uyğunsuz rəyi qeyd etdikdə ona verilmiş Fırça geri alınır.</p>
        {!data.comments.length?<div className="firca-empty">Hələ rəy yoxdur.</div>:data.comments.map(row=><article className="firca-record" key={row.id}><div><strong>{row.student}</strong><p>{row.body}</p></div>
          {row.moderated?<small>Uyğunsuz qeyd edilib</small>:<Button variant="outline" disabled={pending} onClick={()=>setModerating(row.id)}>Uyğunsuzdur</Button>}
          {moderating===row.id&&<form className="firca-review" action={f=>run(()=>moderateFircaCommentAction({id:row.id,reason:String(f.get("reason"))}),"Rəy yoxlanıldı")}><label>Səbəb<input name="reason" minLength={3} maxLength={500} required/></label><Button disabled={pending}>Təsdiqlə</Button><Button type="button" variant="ghost" onClick={()=>setModerating(null)}>Ləğv et</Button></form>}
        </article>)}</>}
      {tab==="settings"&&data.admin&&<><h2><Settings2/> Fırça ayarları</h2>
        <form className="firca-settings" action={f=>run(()=>saveFircaSettingsAction({enabled:f.get("enabled")==="on",startsAt:data.settings.startsAt ?? (f.get("startsAt")?new Date(String(f.get("startsAt"))+":00+04:00").toISOString():null),minCommentLength:Number(f.get("minCommentLength"))}),"Ayarlar saxlanıldı")}>
          <label className="firca-check"><input type="checkbox" name="enabled" defaultChecked={data.settings.enabled}/> Fırça qazanılması aktivdir</label>
          <label>Başlanğıc tarixi · Bakı<input type="datetime-local" name="startsAt" readOnly={!!data.settings.startsAt} defaultValue={data.settings.startsAt?new Date(new Date(data.settings.startsAt).getTime()+4*3600000).toISOString().slice(0,16):""}/><small>İlk saxlamadan sonra tarix sabit qalır. Köhnə XP bu hesaba daxil edilmir.</small></label>
          <label>Rəy üçün minimum simvol<input type="number" name="minCommentLength" min={1} max={1000} defaultValue={data.settings.minCommentLength} required/><small>Boşluqlar sayılmır.</small></label><Button disabled={pending}>Ayarları saxla</Button>
        </form><h2>Test hesabları və xal tarixçəsi</h2>
        <form method="get" className="firca-settings"><label>Tələbə<select name="student" defaultValue={studentId}><option value="">Tələbə seçin</option>{data.students.map(s=><option key={s.id} value={s.id}>{s.name} · {s.code}{s.excluded?" · Test / yarışdan kənar":""}</option>)}</select></label><Button>Tarixçəni göstər</Button></form>
        {studentId&&data.students.some(s=>s.id===studentId)&&<form className="firca-settings" action={f=>run(()=>excludeFircaStudentAction({studentId,excluded:f.get("excluded")==="on",reason:String(f.get("reason"))}),"Tələbə ayarı saxlanıldı")}>
          <label className="firca-check"><input type="checkbox" name="excluded" defaultChecked={data.students.find(s=>s.id===studentId)?.excluded}/> Test hesabıdır / yarışda iştirak etmir</label><label>Səbəb<input name="reason" minLength={3} maxLength={500} required/></label><Button disabled={pending}>Yadda saxla</Button>
        </form>}
        {data.history&&<><p>Son 50 Fırça əməliyyatı</p>{!data.history.items.length?<div className="firca-empty">Əməliyyat yoxdur.</div>:data.history.items.map(item=><article className="firca-record" key={item.id}><strong>{item.delta>0?"+":""}{item.delta} Fırça</strong><div>{item.reason}<small>{new Date(item.occurredAt).toLocaleString("az-AZ",{timeZone:"Asia/Baku"})}</small></div></article>)}</>}
      </>}
    </section>
  </div>;
}
