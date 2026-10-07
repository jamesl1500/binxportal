/**
 * loading.tsx - Profile
 *
 * Shown while switching profile tabs; the profile header and tab bar stay
 * in place.
 *
 * @module apps/binx-web/src/app/(app)/profile/loading.tsx
 * @author Binx Portal
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="form" header={false} />;

export default Loading;
