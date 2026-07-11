import { ModulePlaceholder } from "@/components/ui/module-placeholder";
import { requireErpActor } from "@/server/auth/actor";

export default async function ReportsPage() {
  await requireErpActor("report.read");
  return (
    <ModulePlaceholder
      title="Hesabatlar və eksport"
      description="İcazəli Excel/PDF eksportları, KPI uzlaşdırması və saxlanmış baxışlar üçün iş sahəsi."
      metrics={[
        { label: "Eksportlar", value: "Excel/PDF", helper: "Role əsaslı icazə", tone: "info" },
        { label: "KPI uzlaşması", value: "Views", helper: "Dashboard mənbələri ilə", tone: "success" },
        { label: "Audit", value: "Aktiv", helper: "Eksport tarixçəsi", tone: "warning" },
      ]}
      items={[
        { label: "Satış və CRM hesabatı", value: "Filterli eksport" },
        { label: "Tələbə və balans hesabatı", value: "Maliyyə qaydaları ilə" },
        { label: "HR performans hesabatı", value: "Aylıq nəticələr" },
        { label: "Saxlanmış baxışlar", value: "P1 mərhələsi" },
      ]}
    />
  );
}
