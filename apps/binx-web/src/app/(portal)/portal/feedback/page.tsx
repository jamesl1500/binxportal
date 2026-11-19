/**
 * page.tsx - Portal feedback
 *
 * A client's own product feedback and the Binx team's replies — where the
 * "we replied" email links to. Feedback here is about the portal itself and
 * goes to Binx, not the agency; the subtitle says so.
 *
 * @module apps/binx-web/src/app/(portal)/portal/feedback/page.tsx
 * @author Binx Portal
 */
import type { Metadata } from "next";

import { getMyFeedback } from "@/lib/feedback";
import { getPortalContext } from "@/lib/portal";
import FeedbackHistory from "@/components/feedback/FeedbackHistory/FeedbackHistory";
import SendFeedbackButton from "@/components/feedback/SendFeedbackButton/SendFeedbackButton";
import PortalPageHeader from "@/components/portal/PortalPageHeader/PortalPageHeader";

import sharedStyles from "../page.module.scss";

export const metadata: Metadata = { title: "Your feedback" };

const PortalFeedbackPage = async () => {
  const [context, items] = await Promise.all([
    getPortalContext(),
    getMyFeedback().catch(() => []),
  ]);
  const agencyName = context?.agency.name ?? "your agency";

  return (
    <div className={sharedStyles.page}>
      <PortalPageHeader
        eyebrow="Feedback"
        title="Your feedback"
        subtitle={`Ideas, bugs and kind words about this portal go to Binx, the team that builds it. For anything about your projects, message ${agencyName}.`}
        actions={items.length > 0 ? <SendFeedbackButton /> : undefined}
      />
      <FeedbackHistory items={items} />
    </div>
  );
};

export default PortalFeedbackPage;
