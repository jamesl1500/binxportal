/**
 * TimelineTime.tsx
 *
 * "5m" / "2h" / "3d" for a post or comment, with the full local date and
 * time on hover. Rendered in the browser only: the server doesn't know the
 * viewer's clock or timezone, and a server/client mismatch inside the
 * dashboard's Suspense boundary would make React drop clicks while it
 * re-renders (see the LocalTime component for the same pattern).
 *
 * @module apps/binx-web/src/components/timeline/TimelineTime/TimelineTime.tsx
 */
"use client";

import { useSyncExternalStore } from "react";

import { relativeTime } from "@/lib/notifications-client";

const subscribe = () => () => {};

const TimelineTime = ({ iso, className }: { iso: string; className?: string }) => {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <time
      dateTime={iso}
      className={className}
      title={isClient ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : undefined}
    >
      {isClient ? relativeTime(iso) : null}
    </time>
  );
};

export default TimelineTime;
