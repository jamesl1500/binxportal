/**
 * loading.tsx - Projects
 *
 * Covers the jump from the project list into a project (and to the New
 * project wizard). Link prefetches stop here rather than rendering each
 * project's layout ahead of time.
 *
 * @module apps/binx-web/src/app/(app)/projects/loading.tsx
 * @author Binx Portal
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="table" />;

export default Loading;
