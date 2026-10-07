/**
 * loading.tsx - App
 *
 * Instant fallback when moving between top-level sections (dashboard →
 * clients, invoices → leads, …). The header stays put; only the content
 * area swaps for a skeleton while the next page renders on the server.
 *
 * @module apps/binx-web/src/app/(app)/loading.tsx
 * @author Binx Portal
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="table" />;

export default Loading;
