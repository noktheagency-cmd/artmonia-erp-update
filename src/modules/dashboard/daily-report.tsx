"use client";
import { useRef, useState, useTransition } from "react";
import { ArrowUpRight, CalendarDays, ChartNoAxesCombined, CheckCheck, ChevronRight, CirclePause, LoaderCircle, UsersRound, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { filterDailyReport, loadDailyReportDetails } from "./daily-report-actions";
import type { DailyReportData, DailyReportDetail } from "./daily-report-query";
import type { DetailKind } from "./daily-report-sql";
import { SalesSourceSplit } from "./sales-source-split";
import { formFilterString } from "@/modules/shared/form-values";
import "./daily-report.css";

const dayLabels = ["Bu gün","Dünən","2 gün əvvəl"];
const dateLabel=(date:string)=>date.split("-").reverse().join(".");
const translations: Record<string,string> = { TALKED:"Danışıldı",ANSWERED_NO_TALK:"Açdı, danışılmadı",UNANSWERED:"Cavab vermədi",WHATSAPP_SENT:"Yazıldı",WHATSAPP_REPLIED:"Cavab verdi",PHONE:"Telefon",WHATSAPP:"WhatsApp",IN_PERSON:"Üzbəüz",OTHER:"Digər",MEETING:"Görüş",CONSULTATION:"Konsultasiya",TRIAL:"Sınaq",SCHEDULED:"Təyin edilib",ATTENDED:"Baş tutdu",NO_SHOW:"Gəlmədi",CANCELLED:"Ləğv edilib",RESCHEDULED:"Təxirə salınıb",NEW:"Yeni qəbul",RETURN:"Qayıdış",DIRECT:"Birbaşa",DEPOSIT:"Beh",COMPLETE:"Tamamlanıb",ADMISSION:"Qəbul ödənişi",INITIAL_BALANCE:"İlk dövrün qalığı",RENEWAL:"Davam ödənişi",ONE_OFF:"Birdəfəlik dərs",UNCLASSIFIED:"Bölgüsü təsdiqlənməyib",REPLANNED:"Yenidən planlandı",FROZEN:"Dondurulub",STOPPED:"Dayandırılıb",ACTIVE:"Aktiv",SLOT_WAITING:"Slot gözləyir",CALL:"Zəng",APPOINTMENT:"Görüş",CRM:"CRM" };
const detailLabel=(text:string)=>text.replace(/\b[A-Z][A-Z_]+\b/g, code=>translations[code]??code);
type Group = {title:string;icon:typeof UsersRound;tone:string;value:number;unit:string;detail:string;badge:string;description:string;metrics:[string,string|number][];kinds:DetailKind[]};
export function DailyReport({data}:{data:DailyReportData}) {
 const [report,setReport]=useState(data), [from,setFrom]=useState(data.from), [to,setTo]=useState(data.to), [manager,setManager]=useState(data.managerId??"");
 const [selected,setSelected]=useState<number|null>(null), [error,setError]=useState(""), [pending,startTransition]=useTransition();
 const [details,setDetails]=useState<DailyReportDetail[]>([]),[kind,setKind]=useState<DetailKind>("leads"),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[detailBusy,setDetailBusy]=useState(false),[detailError,setDetailError]=useState("");
 const request = useRef(0);
 async function fetchDetails(nextKind:DetailKind,nextPage=0) {
  const current = ++request.current;
  setDetailBusy(true);setDetailError("");setDetails([]);
  try { const result=await loadDailyReportDetails({from:report.from,to:report.to,managerId:report.managerId},nextKind,nextPage);
   if(current!==request.current)return;
   if(result.ok){setDetails(result.data.rows);setPage(nextPage);setHasMore(result.data.hasMore);setKind(nextKind);}else setDetailError(result.message);
  }catch{if(current===request.current)setDetailError("Detallar yüklənmədi.");}finally{if(current===request.current)setDetailBusy(false);}
 }
 function apply(nextFrom=from,nextTo=to) {
  ++request.current;setSelected(null);setError("");startTransition(async()=>{
   try{const result=await filterDailyReport({from:nextFrom,to:nextTo,managerId:manager||undefined});
    if(result.ok){setReport(result.data);setFrom(result.data.from);setTo(result.data.to);}else setError(result.message);
   }catch{setError("Hesabat yüklənmədi.");}
  });
 }
 const groups:Group[]=[
 {title:"Lead və əlaqə",icon:UsersRound,tone:"blue",value:report.leads,unit:"yeni şəxs",detail:report.contacted+" nəfərlə danışıldı",badge:report.unanswered+" cavabsız · "+report.unworked+" işlənməyib",description:"Əlaqə yalnız faktiki danışıq qeydinə əsaslanır. Cavabsız: cəhd olub, dövr ərzində danışıq olmayıb. İşlənməyib: yeni şəxs üzrə həmin dövrdə heç bir cəhd yoxdur. Əlaqə meneceri faktiki işi edən şəxsdir.",metrics:[["Yeni şəxslər",report.leads],["Danışılan şəxslər",report.contacted],["Yeni lead üzrə danışıq",report.newContacted],["Əvvəlki lead üzrə danışıq",report.oldContacted],["Əlaqə əməliyyatları",report.contactOps],["Cavabsız şəxslər",report.unanswered],["İşlənməmiş yeni şəxslər",report.unworked]],kinds:["leads","contacts"]},
 {title:"Görüş",icon:CalendarDays,tone:"violet",value:report.scheduled,unit:"bu dövrə planlı görüş",detail:report.attended+" baş tutdu",badge:report.noShow+" gəlmədi · "+report.rescheduled+" təxirə salındı",description:"Konsultasiya və sınaq vahid görüş axınıdır; növ yalnız Ətraflıda görünür. Baş tutdu / gəlmədi faktiki tarix üzrədir.",metrics:[["Bu dövrdə yeni təyin edildi",report.appointmentCreated],["Bu dövrə planlı görüşlər",report.scheduled],["Planlı şəxslər",report.appointmentPeople],["Faktiki iştirak (görüş)",report.attended],["Gəlmədi",report.noShow],["Təxirə salındı",report.rescheduled],["Ləğv edildi",report.appointmentCancelled],["Faktiki vaxtı bilinməyən köhnə nəticə",report.legacyAppointments],["Ətraflı — konsultasiya növü",report.consultations],["Ətraflı — sınaq növü",report.trials]],kinds:["appointments"]},
 {title:"Satış və ödəniş",icon:Wallet,tone:"green",value:report.sales,unit:"uyğun satış",detail:report.payments+" AZN",badge:"faktiki daxil olan pul",description:"",metrics:[],kinds:["sales","payments"]},
 {title:"Follow-up",icon:CheckCheck,tone:"amber",value:report.completed,unit:"iş yerinə yetirilib",detail:report.overdue+" gecikmiş",badge:report.tomorrow+" növbəti günə",description:"Edildi danışıq demək deyil: cavabsız cəhd də görülmüş işdir. Gecikmə dövrün sonundakı açıq planlardan hesablanır. Yenidən planlanan gecikmiş işlər tarixçədə ayrıca qalır. Köhnə planların keçmiş vəziyyəti təxmin edilmir.",metrics:[["Yerinə yetirilmiş işlər",report.completed],["Dövrün sonunda gecikmiş",report.overdue],["Gecikib yenidən planlanan",report.overdueReplanned],["Növbəti günə",report.tomorrow]],kinds:["work"]},
 {title:"Tələbə statusları",icon:CirclePause,tone:"rose",value:report.frozen+report.stopped,unit:"status göstəricisi",detail:report.frozen+" donduran",badge:report.stopped+" dayandıran",description:"Qüvvəyə minmə tarixi üzrə status tarixçəsi. Hər tələbə hər göstəricidə bir dəfə sayılır. Eyni tələbə hər iki keçidi edibsə, hər ikisində görünür. Test tələbələri hesablanmır.",metrics:[["Donduran",report.frozen],["Dayandıran",report.stopped]],kinds:["statuses"]}
 ];
 const active=selected===null?null:groups[selected],ActiveIcon=active?.icon;
 const kindLabels:Record<DetailKind,string>={leads:"Yeni lead-lər",contacts:"Əlaqə əməliyyatları",appointments:"Görüşlər",sales:"Satışlar",payments:"Ödənişlər",work:"İş tarixçəsi",statuses:"Status keçidləri"};
 return <section className="owner-dashboard-panel daily-report" aria-labelledby="daily-report-title">
  <header className="daily-report-header"><div className="daily-report-heading"><span className="daily-report-mark" aria-hidden="true"><ChartNoAxesCombined size={23}/></span><div><span className="daily-report-eyebrow">KOMANDANIN GÜNLÜK NƏTİCƏLƏRİ</span><h2 id="daily-report-title">Gün sonu satış hesabatı</h2><p>Bakı vaxtı · {report.managers.find(m=>m.id===report.managerId)?.name??"Bütün komanda"}</p></div></div>
  <div className="daily-report-filter" role="group" aria-label="Sürətli tarix seçimi">{report.availableDates.map((date,index)=><button type="button" key={date} aria-pressed={date===report.from&&date===report.to} disabled={pending} onClick={()=>apply(date,date)}><span>{dayLabels[index]}</span><small>{dateLabel(date).slice(0,5)}</small></button>)}</div></header>
  <form className="daily-report-range" onSubmit={e=>{e.preventDefault();apply();}}>
   <label><span>Başlanğıc</span><DatePicker name="reportFrom" aria-label="Hesabatın başlanğıcı" value={from} onValueChange={setFrom} required/></label>
   <label><span>Son tarix</span><DatePicker name="reportTo" aria-label="Hesabatın son tarixi" value={to} onValueChange={setTo} maxValue={report.availableDates[0]} required/></label>
   <label><span>Menecer</span><FormSelect name="reportManager" aria-label="Hesabat meneceri" value={manager} onValueChange={value=>setManager(formFilterString(value))} emptyLabel="Bütün komanda" options={report.managers.map(m=>({value:m.id,label:m.name}))}/></label><Button type="submit" disabled={pending}>Göstər</Button>
  </form>
  <div className="daily-report-period"><span><CalendarDays size={14}/>{dateLabel(report.from)}{report.from!==report.to?" — "+dateLabel(report.to):""}</span><span role="status">{pending?<><LoaderCircle size={14}/>Yüklənir…</>:"Ən çox 31 günlük aralıq"}</span></div>
  <p className="daily-report-history-note">Faktiki əlaqə və satış tarixçəsi yeni qeydlərdən başlayır. Köhnə qeydiyyatlar avtomatik satış sayılmır.</p>
  {error?<p className="daily-report-error" role="alert">{error}</p>:null}
  <div className="daily-report-grid" aria-busy={pending}>{groups.map((group,index)=>{const Icon=group.icon;return <button type="button" className={"daily-report-card daily-report-"+group.tone} key={group.title} disabled={pending} onClick={()=>{setSelected(index);void fetchDetails(group.kinds[0]);}} aria-haspopup="dialog" aria-label={group.title+" — detalları aç"}><span className="daily-report-card-top"><span className="daily-report-icon"><Icon size={19}/></span><ArrowUpRight size={17}/></span><span className="daily-report-card-title">{group.title}</span><span className="daily-report-main"><strong>{group.value}</strong><span>{group.unit}</span></span><span className="daily-report-card-bottom"><strong>{group.detail}</strong><span>{group.badge}</span></span></button>;})}</div>
  <SalesSourceSplit
    crmSales={report.crmSales}
    directSales={report.directSales}
    newSales={report.newSales}
    returnSales={report.returnSales}
  />
  <footer className="daily-report-footer">Rəqəmə klikləyərək əməliyyatlara baxın <ChevronRight size={14}/></footer>
  <Dialog open={active!==null} onOpenChange={open=>{if(!open)setSelected(null);}}><DialogContent className={"daily-report-dialog daily-report-"+(active?.tone??"blue")}><DialogHeader><span className="daily-report-dialog-icon">{ActiveIcon?<ActiveIcon size={24}/>:null}</span><DialogTitle>{active?.title}</DialogTitle>{active?.description?<DialogDescription>{active.description}</DialogDescription>:null}</DialogHeader>
   {active?.title==="Satış və ödəniş"?(
    <>
     <h3 className="daily-report-metric-heading">Satışın mənbəyi</h3>
     <dl className="daily-report-metrics">
      {([["CRM",report.crmSales],["Birbaşa",report.directSales],["Yeni qəbul",report.newSales],["Qayıdış",report.returnSales]] as const).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
     </dl>
     <h3 className="daily-report-metric-heading">Ödənişin istiqaməti</h3>
     <dl className="daily-report-metrics">
      {([["Qəbul ödənişi",report.deposit+" AZN"],["İlk dövrün qalığı",report.balance+" AZN"],["Davam ödənişi",report.renewal+" AZN"],["Birdəfəlik dərs",report.oneOff+" AZN"],["Digər / workshop",report.other+" AZN"],["Bölgüsü təsdiqlənməmiş pul",report.unclassified+" AZN"]] as const).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
     </dl>
    </>
   ):(
    <dl className="daily-report-metrics">{active?.metrics.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
   )}
   <div className="daily-report-detail-tabs">{active?.kinds.map(k=><Button key={k} type="button" variant={kind===k?"default":"secondary"} disabled={detailBusy} onClick={()=>void fetchDetails(k)}>{kindLabels[k]}</Button>)}</div>
   {detailError?<p role="alert">{detailError}</p>:null}{detailBusy?<p role="status">Yüklənir…</p>:<><div className="daily-report-detail-list">{details.length===0?<p>Əməliyyat qeydi yoxdur.</p>:details.map(row=><article key={row.id}><strong>{row.name}</strong><small>{new Intl.DateTimeFormat("az-AZ",{timeZone:"Asia/Baku",dateStyle:"short",timeStyle:"short"}).format(new Date(row.at))}</small><p>{detailLabel(row.description)}</p></article>)}</div><div className="daily-report-detail-tabs"><Button type="button" variant="secondary" disabled={page===0} onClick={()=>void fetchDetails(kind,page-1)}>Əvvəlki</Button><span>{page+1}</span><Button type="button" variant="secondary" disabled={!hasMore||page>=199} onClick={()=>void fetchDetails(kind,page+1)}>Növbəti</Button></div></>}
  </DialogContent></Dialog>
 </section>;
}
