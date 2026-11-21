import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Skeleton className="mb-2 h-3.5 w-24" />
        <Skeleton className="mb-1.5 h-8 w-64" />
        <Skeleton className="h-4 w-44" />
      </div>

      <Card className="border-t-4 border-t-green">
        <Skeleton className="mb-2 h-3.5 w-36" />
        <Skeleton className="mb-6 h-10 w-48" />

        <div className="mb-6 flex flex-wrap gap-4 border-y border-line py-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-32" />
        </div>

        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Recently added">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Card>

        <Card title="Recent expenses">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </Card>

        <Card title="This month by category">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        </Card>

        <Card title="Monthly spending">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        </Card>
      </div>
    </div>
  );
}
