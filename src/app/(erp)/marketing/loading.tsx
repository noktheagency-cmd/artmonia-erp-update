import { Skeleton } from "@/components/ui/skeleton";

export default function MarketingLoading() {
  return <section className="page-stack marketing-redesign" aria-label="Marketing yüklənir"><div className="marketing-topbar"><Skeleton className="h-10 w-72" /><Skeleton className="h-10 w-40" /></div><Skeleton className="h-14 w-full rounded-2xl" /><div className="marketing-overview-grid">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-28 rounded-2xl" key={index} />)}</div><div className="marketing-analytics-grid"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div></section>;
}
