/**
 * PortalGreeting.tsx
 *
 * "Good morning, Priya" — the time of day has to come from the *viewer's*
 * clock, not the server's, so the server renders a neutral "Welcome back"
 * and the browser swaps in the time-of-day greeting right after hydration
 * (useSyncExternalStore's server snapshot keeps the two renders matching).
 *
 * @module apps/binx-web/src/components/portal/PortalGreeting/PortalGreeting.tsx
 * @author Binx Portal
 */
"use client";

import { useSyncExternalStore } from "react";

import { greetingFor } from "@/lib/portal-insights";

const subscribe = () => () => {};
const getHour = () => new Date().getHours();
const getServerHour = () => null;

const PortalGreeting = ({ name }: { name: string }) => {
  const hour = useSyncExternalStore(subscribe, getHour, getServerHour);
  const greeting = hour === null ? "Welcome back" : greetingFor(hour);
  return (
    <>
      {greeting}, {name}
    </>
  );
};

export default PortalGreeting;
