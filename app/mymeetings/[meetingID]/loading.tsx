import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col space-y-4">
      {/* Breadcrumb & Meeting Title */}
      <Skeleton className="h-6 w-full max-w-[400px] rounded" />
      <div className="space-y-2">
        <Skeleton className="h-10 w-full max-w-[600px] rounded-lg" />{" "}
        {/* Meeting Title */}
        <div className="flex space-x-2">
          <Skeleton className="h-4 w-24 rounded" /> {/* Breadcrumb Item */}
          <Skeleton className="h-4 w-24 rounded" /> {/* Breadcrumb Item */}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2">
        <Skeleton className="h-10 w-32 rounded-md" /> {/* Tab */}
        <Skeleton className="h-10 w-32 rounded-md" /> {/* Tab */}
        <Skeleton className="h-10 w-32 rounded-md" /> {/* Tab */}
      </div>

      {/* Content Area */}
      <div className="flex-grow space-y-3">
        <Skeleton className="h-60 w-full rounded-lg" />{" "}
        {/* Main Content Area */}
        <Skeleton className="h-60 w-full md:w-1/2 rounded-lg" />{" "}
        {/* Chat Section */}
      </div>
    </div>
  );
}
