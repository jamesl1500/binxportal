/**
 * loading.tsx - Settings
 *
 * Shown while switching agency-settings tabs; the settings header and tab
 * bar stay in place.
 *
 * @module apps/binx-web/src/app/(app)/settings/loading.tsx
 * @author Binx Portal
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="form" header={false} />;

export default Loading;
