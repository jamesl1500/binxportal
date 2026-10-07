/**
 * loading.tsx - Portal messages
 *
 * Covers opening a conversation from the portal inbox (each conversation is
 * its own server-rendered page).
 *
 * @module apps/binx-web/src/app/(portal)/portal/messages/loading.tsx
 * @author Binx Portal
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="split" />;

export default Loading;
