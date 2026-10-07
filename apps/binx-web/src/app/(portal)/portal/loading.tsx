/**
 * loading.tsx - Portal
 *
 * Instant fallback when a client moves between portal sections (home,
 * projects, invoices, proposals, …). The portal sidebar stays put.
 *
 * @module apps/binx-web/src/app/(portal)/portal/loading.tsx
 * @author Binx Portal
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="cards" />;

export default Loading;
