/**
 * loading.tsx - Team roster
 *
 * Shown while switching between the Members and Invitations tabs; the team
 * header and tab bar stay in place.
 *
 * @module apps/binx-web/src/app/(app)/team/(roster)/loading.tsx
 * @author Binx Portal
 */
import PageSkeleton from "@/components/ui/PageSkeleton/PageSkeleton";

const Loading = () => <PageSkeleton variant="table" header={false} />;

export default Loading;
