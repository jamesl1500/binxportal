/**
 * PortalContactsPanel.tsx
 *
 * Owner/admin control for who on the client's side has `/portal` access:
 * the current contacts, the pending invites (with resend / revoke and a
 * copy-able accept link), and an invite-by-email form. Modelled on the team
 * page's InvitationsPanel.
 *
 * @module apps/binx-web/src/components/clients/PortalContactsPanel/PortalContactsPanel.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import {
  inviteClientContactAction,
  removeClientContactAction,
  resendClientContactInvitationAction,
  revokeClientContactInvitationAction,
} from "@/app/(app)/clients/[clientId]/settings/actions";
import type { ClientContact, ClientContactInvitation } from "@/lib/clients";

import styles from "./PortalContactsPanel.module.scss";

interface PortalContactsPanelProps {
  agencyId: string;
  clientId: string;
  contacts: ClientContact[];
  invitations: ClientContactInvitation[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const PortalContactsPanel = ({ agencyId, clientId, contacts, invitations }: PortalContactsPanelProps) => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleInvite = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await inviteClientContactAction(agencyId, clientId, trimmed, title.trim() || null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.invitation?.accept_url) {
        setLinks((prev) => ({ ...prev, [result.invitation!.id]: result.invitation!.accept_url as string }));
      }
      toast.success(`Invitation sent to ${trimmed}`);
      setEmail("");
      setTitle("");
      router.refresh();
    });
  };

  const handleResend = (invitationId: string) => {
    setBusyId(invitationId);
    startTransition(async () => {
      const result = await resendClientContactInvitationAction(agencyId, clientId, invitationId);
      setBusyId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.invitation?.accept_url) {
        setLinks((prev) => ({ ...prev, [invitationId]: result.invitation!.accept_url as string }));
      }
      toast.success("Invitation re-sent");
    });
  };

  const handleRevoke = (invitationId: string) => {
    setBusyId(invitationId);
    startTransition(async () => {
      const result = await revokeClientContactInvitationAction(agencyId, clientId, invitationId);
      setBusyId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Invitation revoked");
      router.refresh();
    });
  };

  const handleRemove = (contactId: string, name: string) => {
    setBusyId(contactId);
    startTransition(async () => {
      const result = await removeClientContactAction(agencyId, clientId, contactId);
      setBusyId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${name} removed`);
      router.refresh();
    });
  };

  const handleCopy = async (invitationId: string) => {
    const link = links[invitationId];
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Accept link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <div className={styles.wrap}>
      <form className={styles.inviteForm} onSubmit={handleInvite}>
        <input
          type="email"
          className={styles.input}
          placeholder="contact@client.example"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-label="Contact email"
        />
        <input
          type="text"
          className={styles.input}
          placeholder="Title (optional)"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Contact title"
        />
        <button type="submit" className={styles.invite} disabled={isPending || !email.trim()}>
          Invite
        </button>
      </form>

      {contacts.length > 0 && (
        <ul className={styles.list}>
          {contacts.map((contact) => (
            <li key={contact.id} className={styles.row}>
              <div>
                <p className={styles.name}>
                  {contact.full_name}
                  {contact.is_primary && <span className={styles.badge}>Primary</span>}
                </p>
                <p className={styles.meta}>
                  {contact.email}
                  {contact.title && ` · ${contact.title}`} · joined {formatDate(contact.joined_at)}
                </p>
              </div>
              <button
                type="button"
                className={styles.remove}
                disabled={isPending && busyId === contact.id}
                onClick={() => handleRemove(contact.id, contact.full_name)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {invitations.length > 0 && (
        <div className={styles.pending}>
          <h4 className={styles.pendingHeading}>Pending invitations</h4>
          <ul className={styles.list}>
            {invitations.map((invitation) => {
              const link = links[invitation.id];
              return (
                <li key={invitation.id} className={styles.row}>
                  <div>
                    <p className={styles.name}>{invitation.email}</p>
                    <p className={styles.meta}>
                      invited by {invitation.invited_by_name} ·{" "}
                      {invitation.is_expired ? (
                        <span className={styles.expired}>expired</span>
                      ) : (
                        `expires ${formatDate(invitation.expires_at)}`
                      )}
                    </p>
                    {link && <code className={styles.link}>{link}</code>}
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.action}
                      disabled={isPending && busyId === invitation.id}
                      onClick={() => handleResend(invitation.id)}
                    >
                      <RotateCcw aria-hidden="true" /> Resend
                    </button>
                    <button
                      type="button"
                      className={styles.action}
                      disabled={!link}
                      onClick={() => handleCopy(invitation.id)}
                    >
                      <Copy aria-hidden="true" /> Copy link
                    </button>
                    <button
                      type="button"
                      className={styles.remove}
                      disabled={isPending && busyId === invitation.id}
                      onClick={() => handleRevoke(invitation.id)}
                    >
                      <X aria-hidden="true" /> Revoke
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {contacts.length === 0 && invitations.length === 0 && (
        <p className={styles.empty}>No portal contacts yet. Invite someone to give them portal access.</p>
      )}
    </div>
  );
};

export default PortalContactsPanel;
