import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function FinancePage() {
  return (
    <ModulePlaceholder
      title="Maliyyə əməliyyatları"
      description="Ödənişlər, borclar, avans bölgüsü, geri qaytarma və aylıq bağlanış üçün iş sahəsi."
      metrics={[
        { label: "Ödənişlər", value: "Ledger", helper: "Qəbz və metodlar", tone: "success" },
        { label: "Gecikən borc", value: "Aging", helper: "Müddət üzrə nəzarət", tone: "warning" },
        { label: "Təsdiq", value: "Owner + Finance", helper: "Refund və düzəlişlər", tone: "info" },
      ]}
      items={[
        { label: "Ödəniş ledger-i", value: "Cədvəl strukturu hazırdır" },
        { label: "Borcların yaşlanması", value: "Finance data layer sonrası" },
        { label: "Avans bölgüsü", value: "Seçilən faktura qaydasına görə" },
        { label: "Audit izi", value: "Kritik əməliyyatlarda məcburi" },
      ]}
    />
  );
}
