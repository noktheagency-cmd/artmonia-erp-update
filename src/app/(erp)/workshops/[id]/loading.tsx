import { Skeleton } from "@/components/ui/skeleton";

export default function WorkshopDetailLoading() {
  return <section className="page-stack" aria-label="Workshop mÉ™lumatlarÄ± yÃ¼klÉ™nir"><Skeleton className="h-5 w-44" /><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-12 rounded-2xl" /><div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}</div><Skeleton className="h-[360px] rounded-2xl" /></section>;
}
