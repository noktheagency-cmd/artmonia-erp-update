"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, ChartNoAxesCombined, CheckCheck, ChevronDown, CirclePause, LoaderCircle, UsersRound, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSelect } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { filterDailyReport, loadDailyReportDetails } from "./daily-report-actions";
import type { DailyReportData, DailyReportDetail } from "./daily-report-query";
import type { DetailKind } from "./daily-report-sql";
import { formFilterString } from "@/modules/shared/form-values";
import "./daily-report.css";

const dayLabels = ["Bu gün","Dünən","2 gün əvvəl"];
const dateLabel=(date:string)=>date.split("-").reverse().join(".");
const moneyLabel=(value:string)=>`${value} AZN`;
const translations: Record<string,string> = { TALKED:"Danışıldı",ANSWERED_NO_TALK:"Açdı, danışılmadı",UNANSWERED:"Cavab vermədi",WHATSAPP_SENT:"Yazıldı",WHATSAPP_REPLIED:"Cavab verdi",PHONE:"Telefon",WHATSAPP:"WhatsApp",IN_PERSON:"Üzbəüz",OTHER:"Digər",MEETING:"Görüş",CONSULTATION:"Konsultasiya",TRIAL:"Sınaq",SCHEDULED:"Təyin edilib",ATTENDED:"Gəldi",NO_SHOW:"Gəlmədi",CANCELLED:"Ləğv edilib",RESCHEDULED:"Təxirə salınıb",NEW:"Yeni qəbul",RETURN:"Qayıdış",DIRECT:"Birbaşa",DEPOSIT:"Beh",COMPLETE:"Tamamlanıb",ADMISSION:"Qəbul ödənişi",INITIAL_BALANCE:"İlk dövrün qalığı",RENEWAL:"Davam ödənişi",ONE_OFF:"Qonaq dərs",UNCLASSIFIED:"Bölgüsü təsdiqlənməyib",REPLANNED:"Yenidən planlandı",FROZEN:"Dondurulub",STOPPED:"Dayandırılıb",ACTIVE:"Aktiv",SLOT_WAITING:"Slot gözləyir",CALL:"Zəng",APPOINTMENT:"Görüş",CRM:"CRM",FOLLOW_UP:"Follow-up",PAYMENT_REMINDER:"Ödəniş xatırlatması",TRIAL_LESSON_REMINDER:"Sınaq dərsi xatırlatması",TRIAL_LESSON:"Sınaq dərsi" };
const detailLabel=(text:string)=>text.replace(/\b[A-Z][A-Z_]+\b/g, code=>translations[code]??code);
const detailTokens=(description:string)=>description.split(" · ").map(part=>detailLabel(part.trim())).filter(Boolean);
const chipTone=(label:string)=>{
 const t=label.toLocaleLowerCase("az");
 if(/azn|edil|danış|baş tut|tamam|qəbul ödə|davam ödə|birdəfəlik/.test(t))return "green";
 if(/gecik|cavab verm|gəlmə|dondur|dayandır|ləğv/.test(t))return "rose";
 if(/növbəti|təyin|plan:/.test(t))return "blue";
 if(/təxir|yenidən|sınaq|konsultasiya|follow-up|xatırlat/.test(t))return "amber";
 if(/yeni lead|zəng|telefon|whatsapp/.test(t))return "violet";
 return "slate";
};
const formatDetailAt=(at:string)=>new Intl.DateTimeFormat("az-AZ",{timeZone:"Asia/Baku",dateStyle:"short",timeStyle:"short"}).format(new Date(at));
function detailHref(kind: DetailKind) {
 // Dashboard detail rows route to the relevant module. Record-specific routes
 // are used only where this report row ID is the actual student ID.
 switch (kind) {
  case "leads":
  case "contacts":
   return "/crm";
  case "appointments":
   return "/bookings";
  case "sales":
  case "sales_new":
  case "sales_direct":
  case "sales_return":
  case "statuses":
   return "/students";
  case "payments":
   return "/finance";
  case "work":
   return "/crm";
  default:
   return "/dashboard";
 }
}

function DetailRow({row,kind}:{row:DailyReportDetail;kind:DetailKind}) {
 const tokens=detailTokens(row.description);
 return <Link href={detailHref(kind)} className="daily-report-detail-item daily-report-detail-link">
  <span className="daily-report-detail-row">
   <strong className="daily-report-detail-name">{row.name}</strong>
   <time className="daily-report-detail-time" dateTime={row.at}>{formatDetailAt(row.at)}</time>
   {tokens.map((token,index)=><span key={index} className={"daily-report-chip daily-report-chip-"+chipTone(token)}>{token}</span>)}
   <ArrowUpRight size={15} aria-hidden="true" className="daily-report-detail-open"/>
  </span>
 </Link>;
}
// type AccordionSection = {kind:DetailKind;label:string;count:number;detail?:string};
type AccordionSection = {kind:DetailKind;label:string;count:number;detail?:string;children?:AccordionSection[]};
type Group = {title:string;icon:typeof UsersRound;tone:string;value:number|string;unit:string;detail:string;badge:string;sections:AccordionSection[]};
export function DailyReport({data}:{data:DailyReportData}) {
 const [report,setReport]=useState(data), [from,setFrom]=useState(data.from), [to,setTo]=useState(data.to), [manager,setManager]=useState(data.managerId??"");
 const [selected,setSelected]=useState<number|null>(null), [error,setError]=useState(""), [pending,startTransition]=useTransition();
 const [details,setDetails]=useState<DailyReportDetail[]>([]),[kind,setKind]=useState<DetailKind>("leads"),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[detailBusy,setDetailBusy]=useState(false),[detailError,setDetailError]=useState("");
 const [openSection,setOpenSection]=useState<DetailKind|null>(null);
 const [openParent,setOpenParent]=useState<DetailKind|null>(null);
 const request = useRef(0);
 const groups:Group[]=[
 {title:"Lead və əlaqə",icon:UsersRound,tone:"blue",value:report.leads+report.contactOps,unit:"lead və əlaqə",detail:report.contacted+" nəfərlə danışıldı",badge:report.unanswered+" cavabsız · "+report.unworked+" işlənməyib",sections:[
  {kind:"leads",label:"Yeni lead",count:report.leads},
  {kind:"contacts",label:"Əlaqə",count:report.contactOps,detail:report.contacted+" danışıldı"},
 ]},
 {title:"Görüş",icon:CalendarDays,tone:"violet",value:report.scheduled,unit:"bu dövrə planlı görüş",detail:report.attended+" baş tutdu",badge:report.noShow+" gəlmədi · "+report.rescheduled+" təxirə salındı",sections:[
  {kind:"appointments",label:"Görüş",count:report.scheduled,detail:report.attended+" baş tutdu"},
 ]},
 {title: "Satış və ödəniş", icon: Wallet, tone: "green", value: report.sales, unit: "bugünkü satış sayı", detail: moneyLabel(report.turnover), badge: "gündəlik dövriyyə", sections: [
    {kind:"sales",label:"Satış",count:report.sales,detail:moneyLabel(report.salesAmount),children:[
        {kind:"sales_new",label:"Yeni satış",count:report.crmNewSales,detail:moneyLabel(report.crmNewSalesAmount)},
        {kind:"sales_direct",label:"Birbaşa satış",count:report.directNewSales,detail:moneyLabel(report.directNewSalesAmount)},
        {kind:"sales_return",label:"Qayıdış",count:report.returnSales,detail:moneyLabel(report.returnSalesAmount)},
    ]},
  {kind:"payments",label:"Ödəniş",count:report.paymentCount,detail:moneyLabel(report.payments)},
 ]},
 {title:"Follow-up",icon:CheckCheck,tone:"amber",value:report.completed,unit:"iş yerinə yetirilib",detail:report.overdue+" gecikmiş",badge:report.tomorrow+" növbəti günə",sections:[
  {kind:"work",label:"İş",count:report.completed+report.overdue+report.tomorrow,detail:report.completed+" edildi · "+report.overdue+" gecikmiş"},
 ]},
 {title:"Tələbə statusları",icon:CirclePause,tone:"rose",value:report.frozen+report.stopped,unit:"status göstəricisi",detail:report.frozen+" donduran",badge:report.stopped+" dayandıran",sections:[
  {kind:"statuses",label:"Status",count:report.frozen+report.stopped,detail:report.frozen+" donduran · "+report.stopped+" dayandıran"},
 ]},
 ];
 const active=selected===null?null:groups[selected],ActiveIcon=active?.icon;
 async function fetchDetails(nextKind:DetailKind,nextPage=0) {
  const current = ++request.current;
  setDetailBusy(true);setDetailError("");setDetails([]);
  try { const result=await loadDailyReportDetails({from:report.from,to:report.to,managerId:report.managerId},nextKind,nextPage);
   if(current!==request.current)return;
   if(result.ok){setDetails(result.data.rows);setPage(nextPage);setHasMore(result.data.hasMore);setKind(nextKind);}else setDetailError(result.message);
  }catch{if(current===request.current)setDetailError("Detallar yüklənmədi.");}finally{if(current===request.current)setDetailBusy(false);}
 }
 function openGroup(index:number) {
  ++request.current;
  setSelected(index);
  setOpenSection(null);setDetails([]);setDetailError("");setPage(0);setHasMore(false);setDetailBusy(false);
  setKind(groups[index].sections[0]?.kind??"leads");
 }
 function toggleSection(next:DetailKind) {
  if(openSection===next){
   ++request.current;
   setOpenSection(null);setDetails([]);setDetailBusy(false);setDetailError("");
   return;
  }
  setOpenSection(next);
  void fetchDetails(next);
 }
 function toggleParent(next:DetailKind) {
    ++request.current;
    setOpenSection(null);setDetails([]);setDetailBusy(false);setDetailError("");
    setOpenParent(current=>current===next?null:next);
   }
 function apply(nextFrom=from,nextTo=to) {
  ++request.current;setSelected(null);setOpenSection(null);setError("");startTransition(async()=>{
   try{const result=await filterDailyReport({from:nextFrom,to:nextTo,managerId:manager||undefined});
    if(result.ok){setReport(result.data);setFrom(result.data.from);setTo(result.data.to);}else setError(result.message);
   }catch{setError("Hesabat yüklənmədi.");}
  });
 }
 const detailList=(
  <>
   {detailError?<p role="alert">{detailError}</p>:null}
   {detailBusy?<p role="status">Yüklənir…</p>:(
    <>
     <div className="daily-report-detail-list">
      {details.length===0?<p className="daily-report-detail-empty">Əməliyyat qeydi yoxdur.</p>:details.map(row=><DetailRow key={row.id} row={row} kind={kind}/>)}
     </div>
     {page>0||hasMore?(
      <div className="daily-report-detail-tabs">
       <Button type="button" variant="secondary" disabled={page===0} onClick={()=>void fetchDetails(kind,page-1)}>Əvvəlki</Button>
       <span>{page+1}</span>
       <Button type="button" variant="secondary" disabled={!hasMore||page>=199} onClick={()=>void fetchDetails(kind,page+1)}>Növbəti</Button>
      </div>
     ):null}
    </>
   )}
  </>
 );
 const renderSection=(section:AccordionSection,nested=false)=>{
    const open=openSection===section.kind;
    return <div key={section.kind} className={"daily-report-accordion-item"+(open?" is-open":"")+(nested?" is-nested":"")}>
     <button type="button" className="daily-report-accordion-trigger" aria-expanded={open} onClick={()=>toggleSection(section.kind)}>
      <span className="daily-report-accordion-label">{section.label}</span>
      <span className="daily-report-accordion-stats"><strong>{section.count}</strong>{section.detail?<span>{section.detail}</span>:null}</span>
      <ChevronDown size={18} className="daily-report-accordion-chevron" aria-hidden="true"/>
     </button>
     {open?<div className="daily-report-accordion-panel">{detailList}</div>:null}
    </div>;
   };
   const renderGroup=(section:AccordionSection)=>{
    if(!section.children)return renderSection(section);
    const open=openParent===section.kind, visible=section.children.filter(child=>child.count>0);
    return <div key={section.kind} className={"daily-report-accordion-item"+(open?" is-open":"")}>
     <button type="button" className="daily-report-accordion-trigger" aria-expanded={open} onClick={()=>toggleParent(section.kind)}>
      <span className="daily-report-accordion-label">{section.label}</span>
      <span className="daily-report-accordion-stats"><strong>{section.count}</strong>{section.detail?<span>{section.detail}</span>:null}</span>
      <ChevronDown size={18} className="daily-report-accordion-chevron" aria-hidden="true"/>
     </button>
     {open?<div className="daily-report-accordion-panel daily-report-accordion-nested">
      {visible.length===0?<p className="daily-report-detail-empty">Bu dövrdə satış yoxdur.</p>:visible.map(child=>renderSection(child,true))}
     </div>:null}
    </div>;
   };
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
  <div className="daily-report-grid" aria-busy={pending}>{groups.map((group,index)=>{const Icon=group.icon;return <button type="button" className={"daily-report-card daily-report-"+group.tone} key={group.title} disabled={pending} onClick={()=>openGroup(index)} aria-haspopup="dialog" aria-label={group.title+" — detalları aç"}><span className="daily-report-card-top"><span className="daily-report-icon"><Icon size={19}/></span><ArrowUpRight size={17}/></span><span className="daily-report-card-title">{group.title}</span><span className="daily-report-main"><strong>{group.value}</strong><span>{group.unit}</span></span><span className="daily-report-card-bottom"><strong>{group.detail}</strong><span>{group.badge}</span></span></button>;})}</div>
  <Dialog open={active!==null} onOpenChange={open=>{if(!open){setSelected(null);setOpenSection(null);}}}>
   <DialogContent className={"daily-report-dialog daily-report-"+(active?.tone??"blue")}>
    <DialogHeader>
     <span className="daily-report-dialog-icon">{ActiveIcon?<ActiveIcon size={24}/>:null}</span>
     <DialogTitle>{active?.title}</DialogTitle>
    </DialogHeader>
    <div className="daily-report-accordions">
     {/* {active?.sections.map(section=>{
      const open=openSection===section.kind;
      return <div key={section.kind} className={"daily-report-accordion-item"+(open?" is-open":"")}>
       <button type="button" className="daily-report-accordion-trigger" aria-expanded={open} onClick={()=>toggleSection(section.kind)}>
        <span className="daily-report-accordion-label">{section.label}</span>
        <span className="daily-report-accordion-stats"><strong>{section.count}</strong>{section.detail?<span>{section.detail}</span>:null}</span>
        <ChevronDown size={18} className="daily-report-accordion-chevron" aria-hidden="true"/>
       </button>
       {open?<div className="daily-report-accordion-panel">{detailList}</div>:null}
      </div>;
     })} */}
    {active?.sections.map(renderGroup)}
    </div>
   </DialogContent>
  </Dialog>
 </section>;
}
