"use client";

import {
  CheckCircle2,
  CircleDollarSign,
  PhoneCall,
  Presentation,
  RefreshCcw,
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

export type CrmConversionFunnelStep = "leads" | "contacted" | "consultation" | "registered";
export type CrmConversionNavTarget =
  | { kind: "funnel"; step: CrmConversionFunnelStep }
  | { kind: "breakdown"; key: "direct" | "consultation" | "return" | "trial" | "lost" };

export function CrmConversionDialog({
  open,
  onOpenChange,
  totalLeads,
  stats,
  onNavigate,
  onFunnelStepSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalLeads: string;
  stats: CrmData["dashboardStats"];
  onNavigate?: (target: CrmConversionNavTarget) => void;
  /** @deprecated Prefer onNavigate */
  onFunnelStepSelect?: (step: CrmConversionFunnelStep) => void;
}) {
  const select = (target: CrmConversionNavTarget) => {
    if (onNavigate) {
      onNavigate(target);
      return;
    }
    if (target.kind === "funnel") onFunnelStepSelect?.(target.step);
  };

  const funnel: Array<{
    key: CrmConversionFunnelStep;
    label: string;
    value: string;
    icon: typeof UsersRound;
  }> = [
    { key: "leads", label: "Müraciət", value: totalLeads, icon: UsersRound },
    { key: "contacted", label: "Əlaqə", value: stats.contactedCount, icon: PhoneCall },
    { key: "consultation", label: "Konsultasiya", value: stats.consultationCount, icon: Presentation },
    { key: "registered", label: "Qeydiyyat", value: stats.salesCount, icon: CheckCircle2 },
  ];

  const breakdown: Array<{
    key: "direct" | "consultation" | "return" | "trial" | "lost";
    label: string;
    value: string;
    tone: "blue" | "green" | "violet" | "amber" | "coral";
    icon: typeof Target;
  }> = [
    {
      key: "consultation",
      label: "Qeydiyyat",
      value: stats.consultationSales,
      tone: "green",
      icon: CircleDollarSign,
    },
    {
      key: "direct",
      label: "Birbaşa satış",
      value: stats.directSales,
      tone: "blue",
      icon: Target,
    },
    {
      key: "return",
      label: "Qayıdış",
      value: stats.returnSales,
      tone: "violet",
      icon: RefreshCcw,
    },
    {
      key: "trial",
      label: "Sınaq dərsi",
      value: stats.trialLessonLeads,
      tone: "amber",
      icon: Presentation,
    },
    {
      key: "lost",
      label: "İtki faizi",
      value: stats.lossRate,
      tone: "coral",
      icon: TrendingDown,
    },
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
              {totalLeads} müraciət · {stats.contactRate} əlaqə faizi · {stats.periodSalesTotal} ödənişli satış
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="crm-conversion-detail-body">
          <section className="crm-conversion-detail-hero" aria-label="Əsas konversiya göstəriciləri">
            <button
              type="button"
              className="crm-conversion-main-rate"
              onClick={() => select({ kind: "funnel", step: "registered" })}
              aria-label={`Ümumi konversiya ${stats.conversionRate}. Qeydiyyat siyahısını aç`}
            >
              <span>Ümumi konversiya</span>
              <strong>{stats.conversionRate}</strong>
              <small>{stats.salesCount} slot gözləyən qeydiyyat / {totalLeads} müraciət</small>
            </button>
            <div className="crm-conversion-side-rates">
              <button
                type="button"
                className="crm-conversion-side-rate"
                onClick={() => select({ kind: "funnel", step: "consultation" })}
                aria-label={`Zəngdən konsultasiya ${stats.contactToConsultationRate}. Konsultasiya siyahısını aç`}
              >
                <span>Zəngdən konsultasiya</span>
                <strong>{stats.contactToConsultationRate}</strong>
              </button>
              <button
                type="button"
                className="crm-conversion-side-rate"
                onClick={() => select({ kind: "breakdown", key: "consultation" })}
                aria-label={`Konsultasiyadan satış ${stats.consultationToSaleRate}`}
              >
                <span>Konsultasiyadan satış</span>
                <strong>{stats.consultationToSaleRate}</strong>
              </button>
            </div>
          </section>

          <section className="crm-conversion-detail-section crm-conversion-funnel-section" aria-labelledby="crm-conversion-funnel-title">
            <header>
              <h3 id="crm-conversion-funnel-title">Konversiya yolu</h3>
            </header>
            <div className="crm-conversion-funnel" role="list">
              {funnel.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div className="crm-conversion-funnel-step" key={step.key}>
                    {index > 0 ? <span className="crm-conversion-funnel-connector" aria-hidden="true" /> : null}
                    <button
                      type="button"
                      className="crm-conversion-funnel-item"
                      role="listitem"
                      onClick={() => select({ kind: "funnel", step: step.key })}
                      aria-label={`${step.label}: ${step.value}. Detallı siyahını aç`}
                    >
                      <span aria-hidden="true"><Icon /></span>
                      <strong>{step.value}</strong>
                      <small>{step.label}</small>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="crm-conversion-detail-section crm-conversion-breakdown" aria-label="Satış bölgüsü">
            <header className="crm-conversion-breakdown-head">
              <h3>Satış bölgüsü</h3>
            </header>
            <div className="crm-conversion-breakdown-grid">
              {breakdown.map((item) => (
                <ConversionResult
                  key={item.key}
                  icon={item.icon}
                  label={item.label}
                  value={item.value}
                  tone={item.tone}
                  onClick={() => select({ kind: "breakdown", key: item.key })}
                />
              ))}
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
  tone,
  onClick,
}: {
  icon: React.ComponentType;
  label: string;
  value: string;
  tone: "blue" | "green" | "violet" | "amber" | "coral";
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`crm-conversion-result is-${tone}`}
      onClick={onClick}
      aria-label={`${label}: ${value}. Detallı siyahını aç`}
    >
      <span className="crm-conversion-result-icon" aria-hidden="true"><Icon /></span>
      <small>{label}</small>
      <strong>{value}</strong>
    </button>
  );
}
