/**
 * LeadPortalCard.tsx
 *
 * The lead portal on a lead's page: a branded page to share with the lead
 * before they're a client, holding the proposals they've been sent, a
 * welcome note, and a question thread with the team. Turn it on (Starter
 * plan and up), copy or open its link, edit the note, reset the link, turn it
 * off, and reply to questions (replies are emailed to the lead).
 *
 * @module apps/binx-web/src/components/leads/LeadPortalCard/LeadPortalCard.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import type { LeadPortal } from "@/lib/lead-portal";
import {
  disableLeadPortalAction,
  enableLeadPortalAction,
  replyInLeadPortalAction,
  resetLeadPortalLinkAction,
} from "@/app/(app)/leads/portal-actions";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";

import styles from "./LeadPortalCard.module.scss";

interface LeadPortalCardProps {
  agencyId: string;
  leadId: string;
  leadName: string;
  portal: LeadPortal;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const LeadPortalCard = ({ agencyId, leadId, leadName, portal }: LeadPortalCardProps) => {
  const [welcome, setWelcome] = useState(portal.welcome_message ?? "");
  const [reply, setReply] = useState("");
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { confirm, dialog } = useConfirmDialog();

  const run = (action: () => Promise<{ error?: string; needsUpgrade?: boolean }>, ok?: string) =>
    startTransition(async () => {
      const result = await action();
      if (result.needsUpgrade) setNeedsUpgrade(true);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (ok) toast.success(ok);
    });

  const copy = async () => {
    if (!portal.url) return;
    try {
      await navigator.clipboard.writeText(portal.url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const resetLink = async () => {
    const ok = await confirm({
      title: "Reset the link?",
      description: `The current link stops working at once. Send ${leadName} the new one.`,
      confirmLabel: "Reset link",
    });
    if (ok) run(() => resetLeadPortalLinkAction(agencyId, leadId), "New link ready");
  };

  if (!portal.enabled) {
    return (
      <section className={styles.card} aria-labelledby="lead-portal-title">
        {dialog}
        <h2 id="lead-portal-title" className={styles.title}>
          Lead portal
        </h2>
        <p className={styles.muted}>
          A branded page for {leadName}: their proposals, a note from you, and
          a place to ask questions before they sign.
        </p>
        <label className={styles.field}>
          <span className={styles.label}>Welcome note (optional)</span>
          <textarea
            className={styles.textarea}
            rows={3}
            maxLength={4000}
            value={welcome}
            placeholder={`Hi! Everything for ${leadName} is here.`}
            onChange={(event) => setWelcome(event.target.value)}
          />
        </label>
        {needsUpgrade && (
          <p className={styles.upgrade}>
            Lead portals are on the Starter plan and above.{" "}
            <Link href="/settings/plan">See plans</Link>
          </p>
        )}
        <button
          type="button"
          className={styles.primary}
          disabled={isPending}
          onClick={() => run(() => enableLeadPortalAction(agencyId, leadId, welcome || null), "Lead portal is on")}
        >
          Turn on lead portal
        </button>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="lead-portal-title">
      {dialog}
      <div className={styles.head}>
        <h2 id="lead-portal-title" className={styles.title}>
          Lead portal
        </h2>
        <span className={styles.badge}>On</span>
      </div>
      <div className={styles.linkRow}>
        <code className={styles.link} title={portal.url ?? ""}>
          {portal.url}
        </code>
        <button type="button" className={styles.iconButton} onClick={copy} aria-label="Copy the link">
          <Copy aria-hidden="true" />
        </button>
        <a
          className={styles.iconButton}
          href={portal.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          aria-label="Open the lead portal"
        >
          <ExternalLink aria-hidden="true" />
        </a>
      </div>
      <p className={styles.muted}>
        {portal.last_viewed_at ? `Last opened ${when(portal.last_viewed_at)}` : "Not opened yet"}
      </p>

      <label className={styles.field}>
        <span className={styles.label}>Welcome note</span>
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={4000}
          value={welcome}
          onChange={(event) => setWelcome(event.target.value)}
        />
      </label>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          disabled={isPending || welcome === (portal.welcome_message ?? "")}
          onClick={() => run(() => enableLeadPortalAction(agencyId, leadId, welcome || null), "Saved")}
        >
          Save note
        </button>
        <button type="button" className={styles.textButton} disabled={isPending} onClick={resetLink}>
          Reset link
        </button>
        <button
          type="button"
          className={styles.textButton}
          disabled={isPending}
          onClick={() => run(() => disableLeadPortalAction(agencyId, leadId), "Lead portal is off")}
        >
          Turn off
        </button>
      </div>

      <h3 className={styles.subtitle}>Questions</h3>
      {portal.messages.length === 0 ? (
        <p className={styles.muted}>No questions yet.</p>
      ) : (
        <ol className={styles.thread}>
          {portal.messages.map((message) => (
            <li key={message.id} className={styles.message} data-author={message.author_kind}>
              <p className={styles.messageMeta}>
                {message.author_name} · {when(message.created_at)}
              </p>
              <p className={styles.messageBody}>{message.body}</p>
            </li>
          ))}
        </ol>
      )}
      <form
        className={styles.replyForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (!reply.trim()) return;
          run(async () => {
            const result = await replyInLeadPortalAction(agencyId, leadId, reply);
            if (!result.error) setReply("");
            return result;
          }, "Reply sent");
        }}
      >
        <label className={styles.srOnly} htmlFor="lead-portal-reply">
          Reply to {leadName}
        </label>
        <textarea
          id="lead-portal-reply"
          className={styles.textarea}
          rows={2}
          maxLength={4000}
          placeholder={`Reply to ${leadName}. They'll get it by email.`}
          value={reply}
          onChange={(event) => setReply(event.target.value)}
        />
        <button type="submit" className={styles.primary} disabled={isPending || !reply.trim()}>
          Send reply
        </button>
      </form>
    </section>
  );
};

export default LeadPortalCard;
