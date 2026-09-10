/**
 * InvitationsPanel.tsx
 *
 * Outstanding invites for the current agency, plus a collapsible history of
 * accepted / revoked ones. Per pending row: Resend (re-issues the token and
 * reveals a copy-able accept link), Copy link (enabled once a link has been
 * surfaced this session), and Revoke. Only ever rendered for an owner/admin
 * caller — the Invitations page redirects everyone else.
 *
 * @module apps/binx-web/src/components/team/InvitationsPanel/InvitationsPanel.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import {
  getInvitationHistoryAction,
  resendInvitationAction,
  revokeAgencyInvitationAction,
} from "@/app/(app)/team/actions";
import type { AgencyInvitation } from "@/lib/agencies";

import styles from "./InvitationsPanel.module.scss";

interface InvitationsPanelProps {
  agencyId: string;
  invitations: AgencyInvitation[];
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const InvitationsPanel = ({ agencyId, invitations: initialInvitations }: InvitationsPanelProps) => {
  const router = useRouter();
  const [invitations, setInvitations] = useState(initialInvitations);
  // Accept links only exist right after a create/resend — keyed by invitation id.
  const [links, setLinks] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialInvitations.filter((invite) => invite.accept_url).map((invite) => [invite.id, invite.accept_url as string]),
    ),
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<AgencyInvitation[] | null>(null);
  const [isLoadingHistory, startLoadingHistory] = useTransition();

  const handleResend = (invitationId: string) => {
    setBusyId(invitationId);
    startTransition(async () => {
      const result = await resendInvitationAction(agencyId, invitationId);
      setBusyId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.invitation) {
        const updated = result.invitation;
        setInvitations((prev) => prev.map((invite) => (invite.id === invitationId ? updated : invite)));
        if (updated.accept_url) {
          setLinks((prev) => ({ ...prev, [invitationId]: updated.accept_url as string }));
        }
        toast.success(`Invitation re-sent to ${updated.email}`);
      }
    });
  };

  const handleRevoke = (invitationId: string) => {
    setBusyId(invitationId);
    startTransition(async () => {
      const result = await revokeAgencyInvitationAction(agencyId, invitationId);
      setBusyId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setInvitations((prev) => prev.filter((invite) => invite.id !== invitationId));
      if (history) setHistory(null); // force a refetch next time it's opened
      toast.success("Invitation revoked");
      router.refresh();
    });
  };

  const handleCopy = async (invitationId: string) => {
    const link = links[invitationId];
    if (!link) return;
    const ok = await copyToClipboard(link);
    toast[ok ? "success" : "error"](ok ? "Accept link copied" : "Couldn't copy the link");
  };

  const toggleHistory = () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && history === null) {
      startLoadingHistory(async () => {
        const result = await getInvitationHistoryAction(agencyId);
        if (result.error) {
          toast.error(result.error);
          setHistoryOpen(false);
          return;
        }
        // Only the non-pending ones — pending are already in the table above.
        setHistory((result.invitations ?? []).filter((invite) => invite.status !== "pending"));
      });
    }
  };

  return (
    <div className={styles.wrapper}>
      {invitations.length === 0 ? (
        <p className={styles.empty}>No pending invitations.</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.headCell}>Email</th>
                <th className={styles.headCell}>Role</th>
                <th className={styles.headCell}>Invited by</th>
                <th className={styles.headCell}>Sent</th>
                <th className={styles.headCell}>Expires</th>
                <th className={styles.headCell}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((invite) => {
                const isBusy = isPending && busyId === invite.id;
                const link = links[invite.id];
                return (
                  <tr key={invite.id} className={styles.row}>
                    <td className={styles.cell}>
                      <span className={styles.emailText}>{invite.email}</span>
                      {link && (
                        <span className={styles.linkRow}>
                          <code className={styles.linkText}>{link}</code>
                        </span>
                      )}
                    </td>
                    <td className={styles.cell}>
                      <span className={styles.roleBadge}>{capitalize(invite.role)}</span>
                    </td>
                    <td className={styles.cell}>{invite.invited_by_name}</td>
                    <td className={`${styles.cell} ${styles.muted}`}>{formatDate(invite.created_at)}</td>
                    <td className={`${styles.cell} ${styles.muted}`}>
                      {invite.is_expired ? (
                        <span className={styles.expiredBadge}>Expired</span>
                      ) : (
                        formatDate(invite.expires_at)
                      )}
                    </td>
                    <td className={styles.cell}>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() => handleResend(invite.id)}
                          disabled={isBusy}
                        >
                          <RotateCcw aria-hidden="true" /> Resend
                        </button>
                        <button
                          type="button"
                          className={styles.actionButton}
                          onClick={() => handleCopy(invite.id)}
                          disabled={!link}
                          title={link ? "Copy the accept link" : "Resend to generate a link"}
                        >
                          <Copy aria-hidden="true" /> Copy link
                        </button>
                        <button
                          type="button"
                          className={styles.revokeButton}
                          onClick={() => handleRevoke(invite.id)}
                          disabled={isBusy}
                        >
                          <X aria-hidden="true" /> Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.history}>
        <button
          type="button"
          className={styles.historyToggle}
          onClick={toggleHistory}
          aria-expanded={historyOpen}
        >
          {historyOpen ? "Hide" : "Show"} accepted &amp; revoked
        </button>

        {historyOpen && (
          <div className={styles.historyBody}>
            {isLoadingHistory && history === null ? (
              <p className={styles.empty}>Loading…</p>
            ) : history && history.length > 0 ? (
              <ul className={styles.historyList}>
                {history.map((invite) => (
                  <li key={invite.id} className={styles.historyItem}>
                    <span className={styles.emailText}>{invite.email}</span>
                    <span className={styles.roleBadge}>{capitalize(invite.role)}</span>
                    <span className={styles.historyStatus} data-status={invite.status}>
                      {capitalize(invite.status)}
                    </span>
                    <span className={styles.muted}>{formatDate(invite.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>Nothing here yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InvitationsPanel;
