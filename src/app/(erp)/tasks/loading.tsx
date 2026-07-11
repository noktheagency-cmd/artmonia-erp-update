import { Skeleton } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return <section className="page-stack" aria-label="Tasklar yÃ¼klÉ™nir"><div className="flex items-center justify-between"><div><Skeleton className="h-8 w-36" /><Skeleton className="mt-2 h-4 w-80 max-w-full" /></div><Skeleton className="h-10 w-32" /></div><div className="grid gap-3 md:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)}</div><Skeleton className="h-12 rounded-2xl" /><div className="grid gap-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)}</div></section>;
}
