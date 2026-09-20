"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DailyReportData } from "./daily-report-query";
import "./daily-report.css";

export function DailyReport({ data }: { data: DailyReportData }) {
  const [selected, setSelected] = useState<number | null>(null);
  const groups = [
    { title: "Yeni lead və əlaqə", summary: `${data.leads} lead · ${data.contacted} əlaqə`, description: "Bu gün daxil olan lead-lər. Əlaqə CRM-də əlaqə və ya sonrakı satış mərhələsinə keçidlə müəyyən edilir. Cavabsız: əlaqəsi qeydə alınmayan yeni lead-lər.", metrics: [["Yeni lead", data.leads], ["Əlaqə", data.contacted], ["Cavabsız / əlaqə qeydi yoxdur", data.leads - data.contacted]] },
    { title: "Konsultasiya və sınaq", summary: `${data.scheduled} təyin · ${data.attended} baş tutdu`, description: "CRM profilində bu gün üçün ayrıca qeydə alınmış konsultasiya və sınaqlar. Ləğv edilənlər daxil deyil. Əvvəlki xatırlatmalar avtomatik görüş nəticəsi sayılmır.", metrics: [["Bu günə təyin", data.scheduled], ["Baş tutdu", data.attended], ["Gəlmədi", data.noShow], ["Nəticə gözlənilir", data.pending]] },
    { title: "Satış və ödəniş", summary: `${data.sales} satış · ${data.payments} AZN`, description: "Bugünkü qeydiyyatlar və mövcud satış qaydasına uyğun ödənişli aktiv qayıdışlar. Ödəniş: bu gün faktiki ödənilmiş bütün tələbə ödənişləri; yalnız yeni satışlarla məhdudlaşmır. Test tələbələri daxil deyil.", metrics: [["Satış", data.sales], ["Toplanan ödəniş", `${data.payments} AZN`]] },
    { title: "Follow-up", summary: `${data.completed} edildi · ${data.overdue} gecikmiş`, description: "Edildi: bu gün tamamlanmış CRM follow-up tapşırıqları. Gecikmiş: əlaqə tarixi bu gündən əvvəl olan açıq lead-lər. Sabah üçün: sabaha əlaqəsi planlanan açıq lead-lər. Tarixi olmayan lead-lər sayılmır.", metrics: [["Edildi", data.completed], ["Gecikmiş", data.overdue], ["Sabah üçün", data.tomorrow]] },
    { title: "Donduran və dayandıran", summary: `${data.frozen} donduran · ${data.stopped} dayandıran`, description: "Status tarixçəsinə əsasən bu gün qüvvəyə minən dəyişikliklər. Hər tələbə hər göstəricidə bir dəfə sayılır. Test tələbələri daxil deyil.", metrics: [["Donduran", data.frozen], ["Dayandıran", data.stopped]] },
  ];
  const active = selected === null ? null : groups[selected];
  return (
    <section className="owner-dashboard-panel daily-report" aria-labelledby="daily-report-title">
      <div className="owner-dashboard-panel-head"><div><h2 id="daily-report-title">Gün sonu satış hesabatı</h2><p>{data.date.split("-").reverse().join(".")} · Bakı vaxtı · Bütün komanda</p></div></div>
      <div className="daily-report-grid">
        {groups.map((group, index) => <button type="button" className="daily-report-card" key={group.title} onClick={() => setSelected(index)} aria-haspopup="dialog">
          <span>{group.title}<ArrowUpRight size={17} aria-hidden="true" /></span><strong>{group.summary}</strong><small>Detalları aç</small>
        </button>)}
      </div>
      <Dialog open={active !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="daily-report-dialog" onEscapeKeyDown={() => setSelected(null)}>
          <DialogHeader><DialogTitle>{active?.title}</DialogTitle><DialogDescription>{data.date.split("-").reverse().join(".")} · {active?.description}</DialogDescription></DialogHeader>
          <dl className="daily-report-metrics">{active?.metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </DialogContent>
      </Dialog>
    </section>
  );
}
