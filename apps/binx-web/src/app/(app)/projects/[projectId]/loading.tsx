/**
 * loading.tsx - Project
 *
 * Shown while switching a project's tabs (overview, board, canvas, files,
 * time, …); the project header and tab bar stay in place.
 *
 * @module apps/binx-web/src/app/(app)/projects/[projectId]/loading.tsx
 * @author Binx Portal
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="cards" header={false} />;

export default Loading;
