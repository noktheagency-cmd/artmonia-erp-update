import { Skeleton } from "@/components/ui/skeleton";

export default function HrStaffProfileLoading() {
  return <section className="page-stack" aria-label="Əməkdaş profili yüklənir"><Skeleton className="h-8 w-40" /><Skeleton className="h-48 rounded-2xl" /><div className="grid gap-4 lg:grid-cols-[1fr_330px]"><Skeleton className="h-[520px] rounded-2xl" /><Skeleton className="h-[420px] rounded-2xl" /></div></section>;
}
