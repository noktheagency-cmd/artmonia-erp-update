import { Skeleton } from "@/components/ui/skeleton";

export default function RolePermissionsLoading() {
  return (
    <div className="flex min-h-[70vh] gap-4 p-2">
      <Skeleton className="w-64 rounded-2xl" />
      <Skeleton className="flex-1 rounded-2xl" />
    </div>
  );
}
