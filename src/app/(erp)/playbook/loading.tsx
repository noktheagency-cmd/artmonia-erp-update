import { Skeleton } from "@/components/ui/skeleton";

export default function PlaybookLoading() {
  return <section className="page-stack" aria-label="Playbook yÃ¼klÉ™nir"><Skeleton className="h-20 rounded-2xl" /><div className="grid gap-4 md:grid-cols-[280px_1fr]"><Skeleton className="h-[520px] rounded-2xl" /><div className="grid content-start gap-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24 rounded-2xl" />)}</div></div></section>;
}
