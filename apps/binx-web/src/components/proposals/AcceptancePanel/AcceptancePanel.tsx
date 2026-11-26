/**
 * AcceptancePanel.tsx
 *
 * On a fully signed proposal for a lead or client: what accepting it set in
 * motion, step by step, with links. The lead became a client, the signer was
 * invited to the portal, the deposit invoice (and whether it's paid), the
 * project and its kickoff. When a step was blocked (usually a plan limit),
 * it says why and offers a retry, which picks up where it stopped.
 *
 * @module apps/binx-web/src/components/proposals/AcceptancePanel/AcceptancePanel.tsx
 * @author Binx Portal
 */
"use client";

import { useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, Clock } from "lucide-react";
import { toast } from "sonner";

import type { ProposalAcceptance } from "@/lib/proposals";
import { retryProposalAcceptanceAction } from "@/app/(app)/proposals/actions";

import styles from "./AcceptancePanel.module.scss";

interface AcceptancePanelProps {
  agencyId: string;
  proposalId: string;
  acceptance: ProposalAcceptance;
  /** The proposal's settings, to say what's still to come. */
  depositPercent: string | null;
  createsProject: boolean;
}

type StepState = "done" | "waiting" | "todo";

interface Step {
  key: string;
  state: StepState;
  label: React.ReactNode;
}

const ICONS: Record<StepState, React.ReactNode> = {
  done: <CheckCircle2 aria-hidden="true" />,
  waiting: <Clock aria-hidden="true" />,
  todo: <Circle aria-hidden="true" />,
};

const HEADLINES: Record<string, string> = {
  done: "Accepted and set up",
  awaiting_deposit: "Accepted, waiting on the deposit",
  in_progress: "Setting up the client",
  blocked: "Setting up the client needs you",
};

function steps(
  acceptance: ProposalAcceptance,
  depositPercent: string | null,
  createsProject: boolean,
): Step[] {
  const list: Step[] = [];
  if (acceptance.client_id) {
    list.push({
      key: "client",
      state: "done",
      label: (
        <>
          {acceptance.converted_lead ? "Lead converted to the client " : "Client "}
          <Link href={`/clients/${acceptance.client_id}`}>
            {acceptance.client_name ?? "View client"}
          </Link>
        </>
      ),
    });
  } else {
    list.push({ key: "client", state: "todo", label: "Set up the client" });
  }

  list.push(
    acceptance.invited_email
      ? {
          key: "portal",
          state: "done",
          label: `Client portal: ${acceptance.invited_email}`,
        }
      : { key: "portal", state: "todo", label: "Invite the signer to the client portal" },
  );

  if (depositPercent) {
    if (acceptance.deposit_invoice_id) {
      const paid = Boolean(acceptance.deposit_paid_at) || acceptance.deposit_invoice_status === "paid";
      list.push({
        key: "deposit",
        state: paid ? "done" : "waiting",
        label: (
          <>
            Deposit invoice{" "}
            <Link href={`/invoices/${acceptance.deposit_invoice_id}`}>
              {acceptance.deposit_invoice_number ?? "View invoice"}
            </Link>
            {paid ? ", paid" : ", awaiting payment"}
          </>
        ),
      });
    } else {
      list.push({ key: "deposit", state: "todo", label: "Issue the deposit invoice" });
    }
  }

  if (createsProject) {
    if (acceptance.project_id) {
      list.push({
        key: "project",
        state: "done",
        label: (
          <>
            Project{" "}
            <Link href={`/projects/${acceptance.project_id}`}>
              {acceptance.project_name ?? "View project"}
            </Link>
            {acceptance.kickoff_sent_at ? ", kickoff sent" : ""}
          </>
        ),
      });
    } else {
      list.push({
        key: "project",
        state: acceptance.status === "awaiting_deposit" ? "waiting" : "todo",
        label:
          acceptance.status === "awaiting_deposit"
            ? "Project starts when the deposit is paid"
            : "Start the project",
      });
    }
  }
  return list;
}

const AcceptancePanel = ({
  agencyId,
  proposalId,
  acceptance,
  depositPercent,
  createsProject,
}: AcceptancePanelProps) => {
  const [isPending, startTransition] = useTransition();
  const blocked = acceptance.status === "blocked";

  const retry = () =>
    startTransition(async () => {
      const result = await retryProposalAcceptanceAction(agencyId, proposalId);
      if (result.error) {
        toast.error(result.error);
      } else if (result.proposal?.acceptance?.status === "blocked") {
        toast.error(result.proposal.acceptance.blocked_reason ?? "Still blocked");
      }
    });

  return (
    <section
      className={styles.panel}
      data-status={acceptance.status}
      aria-labelledby="acceptance-title"
    >
      <h2 id="acceptance-title" className={styles.title}>
        {HEADLINES[acceptance.status] ?? "Acceptance"}
      </h2>
      {blocked && (
        <div className={styles.blocked}>
          <AlertTriangle aria-hidden="true" />
          <p>{acceptance.blocked_reason}</p>
          <button
            type="button"
            className={styles.retry}
            onClick={retry}
            disabled={isPending}
          >
            {isPending ? "Retrying…" : "Retry setup"}
          </button>
        </div>
      )}
      <ol className={styles.steps}>
        {steps(acceptance, depositPercent, createsProject).map((step) => (
          <li key={step.key} className={styles.step} data-state={step.state}>
            {ICONS[step.state]}
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default AcceptancePanel;
