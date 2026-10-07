/**
 * loading.tsx - Portal project
 *
 * Shown while switching a portal project's tabs; the project header and
 * tab bar stay in place.
 *
 * @module apps/binx-web/src/app/(portal)/portal/projects/[projectId]/loading.tsx
 * @author Binx Portal
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="cards" header={false} />;

export default Loading;
