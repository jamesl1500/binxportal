/**
 * ProposalAuditTrail.tsx
 *
 * The staff view of a sent proposal's history: when it was sent, each time
 * it was opened (once per browser per half hour), and when it was signed or
 * declined, with the IP and browser behind each. Also shows the document's
 * fingerprint, the hash a signature is tied to. Read-only; times in UTC,
 * matching the signing certificate.
 *
 * @module apps/binx-web/src/components/proposals/ProposalAuditTrail/ProposalAuditTrail.tsx
 * @author Binx Portal
 */
import type { ProposalEvent } from "@/lib/proposals";
import { utcStamp } from "@/components/proposals/SigningCertificate/SigningCertificate";

import styles from "./ProposalAuditTrail.module.scss";

interface ProposalAuditTrailProps {
  events: ProposalEvent[];
  documentHash: string | null;
}

const LABELS: Record<string, string> = {
  sent: "Sent",
  viewed: "Opened",
  signed: "Signed",
  countersigned: "Countersigned",
  declined: "Declined",
  // What accepting it set up (binx-api proposals/acceptance.py).
  client_created: "Became a client",
  portal_invited: "Invited to the portal",
  deposit_invoiced: "Deposit invoiced",
  deposit_paid: "Deposit paid",
  project_created: "Project started",
  kickoff_sent: "Kickoff sent",
  retainer_scheduled: "Monthly billing started",
  options_chosen: "Options chosen",
  acceptance_blocked: "Setup blocked",
};

const ProposalAuditTrail = ({ events, documentHash }: ProposalAuditTrailProps) => (
  <section className={styles.panel} aria-labelledby="proposal-history">
    <div className={styles.head}>
      <h2 id="proposal-history" className={styles.title}>
        History
      </h2>
      {documentHash && (
        <p className={styles.fingerprint}>
          Document fingerprint <code>{documentHash}</code>
        </p>
      )}
    </div>
    {events.length === 0 ? (
      <p className={styles.empty}>Nothing recorded yet.</p>
    ) : (
      <ol className={styles.list}>
        {events.map((event, index) => (
          <li key={index} className={styles.item} data-kind={event.kind}>
            <span className={styles.kind}>{LABELS[event.kind] ?? event.kind}</span>
            <div className={styles.body}>
              <p className={styles.line}>
                {event.actor_label ?? "Someone"}
                {event.detail ? ` · ${event.detail}` : ""}
              </p>
              <p className={styles.meta}>
                {utcStamp(event.occurred_at)}
                {event.ip_address ? ` · ${event.ip_address}` : ""}
                {event.user_agent ? ` · ${event.user_agent}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>
    )}
  </section>
);

export default ProposalAuditTrail;
