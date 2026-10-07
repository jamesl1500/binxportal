/**
 * loading.tsx - Client
 *
 * Shown while switching a client's tabs; the client header and tab bar
 * (from the client layout) stay in place.
 *
 * @module apps/binx-web/src/app/(app)/clients/[clientId]/loading.tsx
 * @author Binx Portal
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="table" header={false} />;

export default Loading;
