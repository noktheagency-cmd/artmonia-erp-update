"use client";

import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  PhoneCall,
  Presentation,
  Target,
  TrendingDown,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CrmData } from "@/modules/crm/queries";

export function CrmConversionDialog({
  open,
  onOpenChange,
  totalLeads,
  stats,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalLeads: string;
  stats: CrmData["dashboardStats"];
}) {
  const funnel = [
    { label: "Müraciət", value: totalLeads, icon: UsersRound },
    { label: "Əlaqə quruldu", value: stats.contactedCount, icon: PhoneCall },
    { label: "Konsultasiya", value: stats.consultationCount, icon: Presentation },
    { label: "Qeydiyyat", value: stats.salesCount, icon: CheckCircle2 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="crm-modern-dialog crm-conversion-detail-dialog">
        <DialogHeader className="crm-conversion-detail-header">
          <span className="crm-conversion-detail-header-icon" aria-hidden="true">
            <TrendingUp />
          </span>
          <div>
            <DialogTitle>Konversiya detalları</DialogTitle>
            <DialogDescription visible>
              Seçilmiş dövrdə yaranmış {totalLeads} müraciətin nəticəsi.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="crm-conversion-detail-body" data-dialog-scroll-body>
          <section className="crm-conversion-detail-hero" aria-label="Əsas konversiya göstəriciləri">
            <div className="crm-conversion-main-rate">
              <span>Ümumi konversiya</span>
              <strong>{stats.conversionRate}</strong>
              <small>{stats.salesCount} qeydiyyat · {totalLeads} müraciət</small>
            </div>
            <div className="crm-conversion-call-rate">
              <span className="crm-conversion-call-icon" aria-hidden="true"><PhoneCall /></span>
              <div>
                <span>Zəngdən konsultasiyaya keçid</span>
                <strong>{stats.contactToConsultationRate}</strong>
                <small>{stats.consultationCount} konsultasiya · {stats.contactedCount} əlaqə</small>
              </div>
            </div>
          </section>

          <section className="crm-conversion-detail-section" aria-labelledby="crm-conversion-funnel-title">
            <header>
              <div>
                <h3 id="crm-conversion-funnel-title">Satış hunisi</h3>
                <p>Eyni müraciət bir neçə mərhələdə sayılır.</p>
              </div>
              <span>{stats.contactRate} əlaqə faizi</span>
            </header>
            <div className="crm-conversion-funnel" role="list">
              {funnel.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div className="crm-conversion-funnel-item" role="listitem" key={step.label}>
                    <span aria-hidden="true"><Icon /></span>
                    <div>
                      <small>{step.label}</small>
                      <strong>{step.value}</strong>
                    </div>
                    {index < funnel.length - 1 ? <ArrowRight aria-hidden="true" /> : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="crm-conversion-detail-section" aria-labelledby="crm-conversion-results-title">
            <header>
              <div>
                <h3 id="crm-conversion-results-title">{stats.salesCount} qeydiyyatın bölgüsü</h3>
                <p>Birbaşa və konsultasiya ilə qeydiyyat</p>
              </div>
              <span>{stats.consultationToSaleRate} konsultasiya → satış</span>
            </header>
            <div className="crm-conversion-result-grid is-split">
              <ConversionResult icon={Target} label="Birbaşa satış" value={stats.directSales} tone="blue" />
              <ConversionResult icon={CircleDollarSign} label="Konsultasiya ilə satış" value={stats.consultationSales} tone="green" />
            </div>
            <p className="crm-conversion-split-total">
              {stats.directSales} + {stats.consultationSales} = {stats.salesCount}
            </p>
          </section>

          <section className="crm-conversion-detail-section" aria-labelledby="crm-conversion-extra-title">
            <header>
              <div>
                <h3 id="crm-conversion-extra-title">Əlavə</h3>
                <p>Bu rəqəmlər qeydiyyatın hissəsi deyil</p>
              </div>
            </header>
            <div className="crm-conversion-result-grid is-extra">
              <ConversionResult icon={Presentation} label="Sınaq dərsi" value={stats.trialLessonLeads} helper={`${stats.trialLessonCount} dərs`} tone="amber" />
              <ConversionResult icon={TrendingDown} label="İtki faizi" value={stats.lossRate} tone="coral" />
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConversionResult({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: React.ComponentType;
  label: string;
  value: string;
  helper?: string;
  tone: "blue" | "green" | "amber" | "coral";
}) {
  return (
    <article className={`crm-conversion-result is-${tone}`}>
      <span aria-hidden="true"><Icon /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {helper ? <em>{helper}</em> : null}
      </div>
    </article>
  );
}
