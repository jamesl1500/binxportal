/**
 * ErrorStatusActions.tsx
 *
 * Resolve / Ignore / Reopen for one error issue. Resolving is a claim that
 * it's fixed: if it happens again, binx-api reopens it and flags it as a
 * regression. Ignoring keeps counting it but takes it off the open list and
 * the sidebar badge.
 *
 * @module apps/binx-web/src/components/admin/ErrorStatusActions/ErrorStatusActions.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";

import {
  type ErrorStatusState,
  setIssueStatusAction,
} from "@/app/(app)/admin/errors/actions";
import type { IssueStatus } from "@/lib/admin-errors-client";

import ui from "../adminUi.module.scss";

interface ErrorStatusActionsProps {
  issueId: string;
  status: IssueStatus;
}

const ErrorStatusActions = ({ issueId, status }: ErrorStatusActionsProps) => {
  const [result, setResult] = useState<ErrorStatusState>({});
  const [isPending, startTransition] = useTransition();

  const set = (next: IssueStatus) =>
    startTransition(async () =>
      setResult(await setIssueStatusAction(issueId, next)),
    );

  return (
    <div className={`${ui.stack} ${ui.tight}`}>
      <div className={ui.filters}>
        {status !== "resolved" && (
          <button
            type="button"
            className={`${ui.button} ${ui.primary}`}
            disabled={isPending}
            onClick={() => set("resolved")}
          >
            Resolve
          </button>
        )}
        {status !== "ignored" && (
          <button
            type="button"
            className={ui.button}
            disabled={isPending}
            onClick={() => set("ignored")}
          >
            Ignore
          </button>
        )}
        {status !== "unresolved" && (
          <button
            type="button"
            className={ui.button}
            disabled={isPending}
            onClick={() => set("unresolved")}
          >
            Reopen
          </button>
        )}
      </div>
      <p className={`${ui.sub} ${ui.status}`}>
        {status === "resolved"
          ? "If it happens again it reopens as a regression."
          : status === "ignored"
            ? "Still counted, but off the open list and the badge."
            : "Resolve once a fix is deployed. It reopens if it comes back."}
      </p>
      <div aria-live="polite">
        {result.message && <p className={ui.notice}>{result.message}</p>}
        {result.error && (
          <p className={ui.error} role="alert">
            {result.error}
          </p>
        )}
      </div>
    </div>
  );
};

export default ErrorStatusActions;
