import { Skeleton } from "@/components/ui/skeleton";

export default function WorkshopsLoading() {
  return <section className="page-stack" aria-label="Workshoplar yÃ¼klÉ™nir"><Skeleton className="h-20 rounded-2xl" /><Skeleton className="h-14 rounded-2xl" /><div className="grid gap-4 lg:grid-cols-[1fr_340px]"><div className="grid gap-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div><Skeleton className="h-[460px] rounded-2xl" /></div></section>;
}
