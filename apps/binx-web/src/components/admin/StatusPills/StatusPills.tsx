/**
 * StatusPills.tsx
 *
 * Small labelled pills for an agency's plan state or a user's account state,
 * shared by the console's lists and detail pages. Every pill carries text,
 * so state is never conveyed by colour alone.
 *
 * @module apps/binx-web/src/components/admin/StatusPills/StatusPills.tsx
 * @author Binx Portal
 */
import type { AdminAgencyRow, AdminUserRow } from "@/lib/admin-client";

import ui from "../adminUi.module.scss";

export const AgencyPills = ({
  agency,
}: {
  agency: Pick<
    AdminAgencyRow,
    "plan_name" | "trialing" | "subscription_status" | "deletion_scheduled_for"
  >;
}) => (
  <>
    {agency.deletion_scheduled_for && (
      <span className={ui.pill} data-tone="bad">
        Scheduled for deletion
      </span>
    )}
    <span
      className={ui.pill}
      data-tone={agency.plan_name === "Free" ? undefined : "accent"}
    >
      {agency.plan_name}
    </span>
    {agency.trialing && (
      <span className={ui.pill} data-tone="warn">
        Trial
      </span>
    )}
    {agency.subscription_status === "past_due" && (
      <span className={ui.pill} data-tone="bad">
        Past due
      </span>
    )}
    {agency.subscription_status === "canceled" && (
      <span className={ui.pill}>Canceled</span>
    )}
  </>
);

export const UserPills = ({
  user,
}: {
  user: Pick<
    AdminUserRow,
    "role" | "is_active" | "is_verified" | "agencies" | "portals"
  >;
}) => (
  <>
    {!user.is_active && (
      <span className={ui.pill} data-tone="bad">
        Deactivated
      </span>
    )}
    {!user.is_verified && (
      <span className={ui.pill} data-tone="warn">
        Unverified
      </span>
    )}
    {user.role === "admin" && (
      <span className={ui.pill} data-tone="accent">
        Binx admin
      </span>
    )}
    {user.agencies > 0 && <span className={ui.pill}>Staff</span>}
    {user.portals > 0 && <span className={ui.pill}>Portal client</span>}
  </>
);
