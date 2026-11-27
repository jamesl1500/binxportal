/**
 * AcceptancePanel.tsx
 *
 * On a fully signed proposal for a lead or client: what accepting it set in
 * motion, step by step, with links. The lead became a client, the signer was
 * invited to the portal, the deposit invoice (and whether it's paid), the
 * project and its kickoff, and the monthly billing of any monthly lines. When a step was blocked (usually a plan limit),
 * it says why and offers a retry, which picks up where it stopped.
 *
 * The setup runs just after the signature is saved (binx-api
 * proposals/completion.py), so a page loaded in that moment shows it in
 * progress; the panel re-fetches the page for a short while until it's done.
 *
 * @module apps/binx-web/src/components/proposals/AcceptancePanel/AcceptancePanel.tsx
 * @author Binx Portal
 */
"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  /** The monthly lines' total, formatted ("$2,500.00 / mo"); null when the
   * proposal has none. */
  monthlyLabel?: string | null;
}

type StepState = "done" | "waiting" | "todo";

// While the setup runs: a refresh every 1.5 s, for up to 30 s.
const POLL_INTERVAL_MS = 1500;
const POLL_LIMIT = 20;

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

function formatDay(day: string): string {
  // A calendar date ("2026-12-03"): read as local, not UTC midnight.
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
}

function retainerStep(
  acceptance: ProposalAcceptance,
  monthlyLabel: string,
): Step {
  if (acceptance.retainer_schedule_id) {
    return {
      key: "retainer",
      state: "done",
      label: (
        <>
          Monthly billing of {monthlyLabel},{" "}
          <Link href="/invoices/recurring">
            {acceptance.retainer_next_run_date
              ? `next invoice ${formatDay(acceptance.retainer_next_run_date)}`
              : "paused"}
          </Link>
        </>
      ),
    };
  }
  const waiting = acceptance.status === "awaiting_deposit";
  return {
    key: "retainer",
    state: waiting ? "waiting" : "todo",
    label: waiting
      ? "Monthly billing starts when the deposit is paid"
      : "Start the monthly billing",
  };
}

function steps(
  acceptance: ProposalAcceptance,
  depositPercent: string | null,
  createsProject: boolean,
  monthlyLabel: string | null,
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
  if (monthlyLabel) list.push(retainerStep(acceptance, monthlyLabel));
  return list;
}

const AcceptancePanel = ({
  agencyId,
  proposalId,
  acceptance,
  depositPercent,
  createsProject,
  monthlyLabel = null,
}: AcceptancePanelProps) => {
  const [isPending, startTransition] = useTransition();
  const blocked = acceptance.status === "blocked";
  const router = useRouter();
  const settingUp = acceptance.status === "in_progress";

  useEffect(() => {
    if (!settingUp) return;
    let polls = 0;
    const timer = window.setInterval(() => {
      polls += 1;
      if (polls > POLL_LIMIT) {
        window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [settingUp, router]);

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
        {steps(acceptance, depositPercent, createsProject, monthlyLabel).map(
          (step) => (
          <li key={step.key} className={styles.step} data-state={step.state}>
            {ICONS[step.state]}
            <span>{step.label}</span>
          </li>
          ),
        )}
      </ol>
    </section>
  );
};

export default AcceptancePanel;
