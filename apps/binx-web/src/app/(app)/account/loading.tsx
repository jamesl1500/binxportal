/**
 * loading.tsx - Account
 *
 * Shown while switching account tabs; the account header and tab bar stay
 * in place.
 *
 * @module apps/binx-web/src/app/(app)/account/loading.tsx
 * @author Binx Portal
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="form" header={false} />;

export default Loading;
