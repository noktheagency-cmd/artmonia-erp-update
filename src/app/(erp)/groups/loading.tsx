import { Skeleton } from "@/components/ui/skeleton";

export default function GroupsLoading() {
  return <section aria-label="Qruplar yüklənir"><div className="mb-4 flex items-center justify-between"><div><Skeleton className="h-8 w-40" /><Skeleton className="mt-2 h-3 w-80 max-w-full" /></div><Skeleton className="h-10 w-36" /></div><Skeleton className="mb-3 h-14 w-full rounded-2xl" /><div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-24 rounded-2xl" key={index} />)}</div><div className="grid grid-cols-1 gap-3 md:grid-cols-[320px_1fr]"><Skeleton className="h-[460px] rounded-2xl" /><Skeleton className="h-[460px] rounded-2xl" /></div></section>;
}
