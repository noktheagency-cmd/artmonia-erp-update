import { Skeleton } from "@/components/ui/skeleton";

export default function StudentDetailLoading() {
  return <section className="page-stack" aria-label="TÉ™lÉ™bÉ™ mÉ™lumatlarÄ± yÃ¼klÉ™nir"><Skeleton className="h-5 w-40" /><Skeleton className="h-36 rounded-2xl" /><div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-24 rounded-2xl" />)}</div><div className="grid gap-4 lg:grid-cols-[1fr_360px]"><Skeleton className="h-[420px] rounded-2xl" /><Skeleton className="h-[420px] rounded-2xl" /></div></section>;
}
