/**
 * FeedbackDate.tsx
 *
 * A feedback timestamp in the *viewer's* timezone. Rendered empty on the
 * server and filled on the client (useSyncExternalStore), the same
 * hydration-safe approach as portal/LocalTime — a server-rendered date would
 * be in the server's zone and could be a day off.
 *
 * @module apps/binx-web/src/components/feedback/FeedbackDate/FeedbackDate.tsx
 * @author Binx Portal
 */
"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function formatFeedbackDate(iso: string, withTime = false): string {
  const date = new Date(iso);
  return withTime
    ? date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

const FeedbackDate = ({
  iso,
  withTime = false,
  className,
}: {
  iso: string;
  withTime?: boolean;
  className?: string;
}) => {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <time dateTime={iso} className={className}>
      {isClient ? formatFeedbackDate(iso, withTime) : null}
    </time>
  );
};

export default FeedbackDate;
