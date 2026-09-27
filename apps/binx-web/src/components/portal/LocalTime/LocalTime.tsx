/**
 * LocalTime.tsx
 *
 * A meeting-style timestamp ("Today, 3:00 PM") in the *viewer's* timezone.
 * The server can't know it, so the server render leaves the text empty and
 * the browser fills it in right after hydration — useSyncExternalStore's
 * server snapshot keeps the two renders matching.
 *
 * @module apps/binx-web/src/components/portal/LocalTime/LocalTime.tsx
 * @author Binx.io
 */
"use client";

import { useSyncExternalStore } from "react";

import { formatMeetingTime } from "@/lib/portal-insights";

const subscribe = () => () => {};

const LocalTime = ({ iso, className }: { iso: string; className?: string }) => {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <time dateTime={iso} className={className}>
      {isClient ? formatMeetingTime(iso, new Date()) : null}
    </time>
  );
};

export default LocalTime;
