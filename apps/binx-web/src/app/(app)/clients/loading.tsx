/**
 * loading.tsx - Clients
 *
 * Covers the jump from the client list into a client (and to new/import),
 * so clicking a row responds immediately instead of waiting on the client
 * layout's fetch. Also keeps prefetching cheap: a list of client links only
 * prefetches up to here, not each client's own layout.
 *
 * @module apps/binx-web/src/app/(app)/clients/loading.tsx
 * @author Binx Portal
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="table" />;

export default Loading;
