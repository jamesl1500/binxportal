/**
 * page.tsx - Dashboard · Timeline
 *
 * The team timeline: one shared feed where anyone on the team posts updates
 * and the rest comment and react; owners/admins can also pin posts and post
 * announcements that notify everyone. The first page is rendered here, the
 * rest is TimelineFeed's client state.
 *
 * @module apps/binx-web/src/app/(app)/dashboard/timeline/page.tsx
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import TimelineFeed from "@/components/timeline/TimelineFeed/TimelineFeed";
import PageEnter from "@/components/ui/PageEnter/PageEnter";
import { getAgencyMembers, getCurrentAgencyContext } from "@/lib/agencies";
import { getTimelineFeed } from "@/lib/timeline";
import type { MentionableMember } from "@/lib/timeline-client";

export const metadata: Metadata = { title: "Timeline" };

const TimelinePage = async () => {
  const { currentAgency } = await getCurrentAgencyContext();
  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  const [feed, members] = await Promise.all([
    getTimelineFeed(currentAgency.id),
    getAgencyMembers(currentAgency.id).catch(() => []),
  ]);
  const mentionable: MentionableMember[] = members.map((member) => ({
    user_name: member.user_name,
    full_name: member.full_name,
  }));

  return (
    <PageEnter>
      <TimelineFeed agencyId={currentAgency.id} initialFeed={feed} members={mentionable} />
    </PageEnter>
  );
};

export default TimelinePage;
