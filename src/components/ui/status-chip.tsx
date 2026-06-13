import { cx } from "@/components/ui/cx";

type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

export function StatusChip({
  tone = "neutral",
  children,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
}) {
  return <span className={cx("status-chip", `status-${tone}`)}>{children}</span>;
}
