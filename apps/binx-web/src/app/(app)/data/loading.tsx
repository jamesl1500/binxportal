/**
 * loading.tsx - Import & export
 *
 * Lets the jump from the Import & export page into an import wizard respond
 * immediately (and lets those links prefetch), same as every other section.
 *
 * @module apps/binx-web/src/app/(app)/data/loading.tsx
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="cards" />;

export default Loading;
