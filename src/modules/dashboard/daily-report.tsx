"use client";

import { useState, useTransition } from "react";
import { ArrowUpRight, CalendarDays, ChartNoAxesCombined, CheckCheck, ChevronRight, CirclePause, LoaderCircle, UsersRound, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { filterDailyReport } from "./daily-report-actions";
import type { DailyReportData } from "./daily-report-query";
import "./daily-report.css";

const dayLabels = ["Bu gün", "Dünən", "2 gün əvvəl"];
const dateLabel = (date: string) => date.split("-").reverse().join(".");

export function DailyReport({ data }: { data: DailyReportData }) {
  const [report, setReport] = useState(data);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function selectDate(date: string) {
    if (pending || date === report.date) return;
    setSelected(null);
    setError("");
    startTransition(async () => {
      try {
        const result = await filterDailyReport(date);
        if (result.ok) setReport(result.data);
        else setError(result.message);
      } catch {
        setError("Hesabat yüklənmədi. Tarixi yenidən seçərək cəhd edin.");
      }
    });
  }

  const groups = [
    { title: "Lead və əlaqə", icon: UsersRound, tone: "blue", value: report.leads, unit: "yeni lead", detail: `${report.contacted} əlaqə quruldu`, badge: `${report.leads - report.contacted} cavabsız`, description: "Seçilən gün daxil olan lead-lər. Əlaqə həmin günün sonunadək CRM-də əlaqə və ya sonrakı satış mərhələsinə keçidlə müəyyən edilir. Cavabsız: əlaqəsi qeydə alınmayan yeni lead-lər.", metrics: [["Yeni lead", report.leads], ["Əlaqə", report.contacted], ["Cavabsız / əlaqə qeydi yoxdur", report.leads - report.contacted]] },
    { title: "Konsultasiya və sınaq", icon: CalendarDays, tone: "violet", value: report.scheduled, unit: "görüş təyin edilib", detail: `${report.attended} baş tutdu`, badge: `${report.noShow} gəlmədi`, description: "CRM profilində seçilən gün üçün qeydə alınmış konsultasiya və sınaqların hazırkı nəticələri. Ləğv edilənlər daxil deyil. Əvvəlki xatırlatmalar avtomatik görüş nəticəsi sayılmır.", metrics: [["Təyin edildi", report.scheduled], ["Baş tutdu", report.attended], ["Gəlmədi", report.noShow], ["Nəticə gözlənilir", report.pending]] },
    { title: "Satış və ödəniş", icon: Wallet, tone: "green", value: report.sales, unit: "satış bağlanıb", detail: `${report.payments} AZN`, badge: "toplanan ödəniş", description: "Seçilən günün qeydiyyatları və mövcud satış qaydasına uyğun ödənişli aktiv qayıdışlar. Ödəniş: həmin gün faktiki ödənilmiş bütün tələbə ödənişləri; yalnız yeni satışlarla məhdudlaşmır. Test tələbələri daxil deyil.", metrics: [["Satış", report.sales], ["Toplanan ödəniş", `${report.payments} AZN`]] },
    { title: "Follow-up", icon: CheckCheck, tone: "amber", value: report.completed, unit: "əlaqə tamamlanıb", detail: `${report.overdue} gecikmiş`, badge: `${report.tomorrow} növbəti günə`, description: "Edildi: seçilən gün tamamlanmış CRM follow-up tapşırıqları. Gecikmiş və növbəti gün göstəriciləri hazırda açıq olan, seçilən günün sonunadək yaradılmış lead-lərin cari əlaqə planını göstərir; tarixi vəziyyətin surəti deyil. Tarixi olmayan lead-lər sayılmır.", metrics: [["Edildi", report.completed], ["Seçilən gündən əvvəl / hazırda açıq", report.overdue], ["Növbəti gün üçün / cari plan", report.tomorrow]] },
    { title: "Tələbə statusları", icon: CirclePause, tone: "rose", value: report.frozen + report.stopped, unit: "status keçidi", detail: `${report.frozen} donduran`, badge: `${report.stopped} dayandıran`, description: "Status tarixçəsinə əsasən seçilən gün qüvvəyə minən dəyişikliklər. Hər tələbə hər göstəricidə bir dəfə sayılır; eyni gün hər iki keçidi edən tələbə hər ikisində görünür. Test tələbələri daxil deyil.", metrics: [["Donduran", report.frozen], ["Dayandıran", report.stopped]] },
  ];
  const active = selected === null ? null : groups[selected];
  const ActiveIcon = active?.icon;

  return (
    <section className="owner-dashboard-panel daily-report" aria-labelledby="daily-report-title">
      <header className="daily-report-header">
        <div className="daily-report-heading">
          <span className="daily-report-mark" aria-hidden="true"><ChartNoAxesCombined size={23} /></span>
          <div><span className="daily-report-eyebrow">KOMANDANIN GÜNLÜK NƏTİCƏLƏRİ</span><h2 id="daily-report-title">Gün sonu satış hesabatı</h2><p>Bütün komanda <span aria-hidden="true">·</span> Bakı vaxtı</p></div>
        </div>
        <div className="daily-report-filter" role="group" aria-label="Hesabat günü — son 3 gün">
          {report.availableDates.map((date, index) => <button type="button" key={date} aria-pressed={date === report.date} disabled={pending} onClick={() => selectDate(date)}>
            <span>{dayLabels[index]}</span><small>{dateLabel(date).slice(0, 5)}</small>
          </button>)}
        </div>
      </header>
      <div className="daily-report-period"><span><CalendarDays size={14} aria-hidden="true" />{dateLabel(report.date)}</span><span role="status">{pending ? <><LoaderCircle className="daily-report-spinner" size={14} aria-hidden="true" />Yüklənir…</> : "Yalnız son 3 gün"}</span></div>
      {error ? <p className="daily-report-error" role="alert">{error}</p> : null}
      <div className="daily-report-grid" aria-busy={pending}>
        {groups.map((group, index) => {
          const Icon = group.icon;
          return <button type="button" className={`daily-report-card daily-report-${group.tone}`} key={group.title} disabled={pending} onClick={() => setSelected(index)} aria-haspopup="dialog" aria-label={`${group.title} — ${dateLabel(report.date)}: detalları aç`}>
            <span className="daily-report-card-top"><span className="daily-report-icon"><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span><ArrowUpRight className="daily-report-arrow" size={17} aria-hidden="true" /></span>
            <span className="daily-report-card-title">{group.title}</span>
            <span className="daily-report-main"><strong>{group.value}</strong><span>{group.unit}</span></span>
            <span className="daily-report-card-bottom"><strong>{group.detail}</strong><span>{group.badge}</span></span>
          </button>;
        })}
      </div>
      <footer className="daily-report-footer">Göstəriciyə klikləyərək detallara baxın <ChevronRight size={14} aria-hidden="true" /></footer>
      <Dialog open={active !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className={`daily-report-dialog daily-report-${active?.tone ?? "blue"}`} onEscapeKeyDown={() => setSelected(null)}>
          <DialogHeader>
            <span className="daily-report-dialog-icon" aria-hidden="true">{ActiveIcon ? <ActiveIcon size={24} /> : null}</span>
            <span className="daily-report-eyebrow">{dateLabel(report.date)} · GÜNLÜK HESABAT</span>
            <DialogTitle>{active?.title}</DialogTitle><DialogDescription>{active?.description}</DialogDescription>
          </DialogHeader>
          <dl className="daily-report-metrics">{active?.metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </DialogContent>
      </Dialog>
    </section>
  );
}
