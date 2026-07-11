import { Skeleton } from "@/components/ui/skeleton";

export default function HrLoading() {
  return <section className="hr-command" aria-label="HR yüklənir"><header className="hr-command-header"><div><Skeleton className="h-8 w-56" /><Skeleton className="mt-2 h-3 w-96 max-w-full" /></div><Skeleton className="h-10 w-40" /></header><Skeleton className="h-14 w-full rounded-2xl" /><div className="hr-kpi-grid">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-24 rounded-2xl" key={index} />)}</div><div className="hr-analytics-grid"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div></section>;
}
