/**
 * loading.tsx - Dashboard
 *
 * Shown while switching between the Overview / My work / Pulse tabs — the
 * greeting and tab bar (rendered by the dashboard layout) stay in place.
 *
 * @module apps/binx-web/src/app/(app)/dashboard/loading.tsx
 * @author Binx Portal
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="cards" header={false} />;

export default Loading;
