/**
 * ErrorIssuePills.tsx
 *
 * An error issue's status, source, and whether it's a regression, as
 * labelled pills. Every pill carries text, so state is never conveyed by
 * colour alone.
 *
 * @module apps/binx-web/src/components/admin/ErrorIssuePills/ErrorIssuePills.tsx
 * @author Binx Portal
 */
import {
  type ErrorIssueRow,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
} from "@/lib/admin-errors-client";

import ui from "../adminUi.module.scss";

export const ErrorIssuePills = ({
  issue,
}: {
  issue: Pick<ErrorIssueRow, "status" | "source" | "level" | "regressed_at">;
}) => (
  <>
    <span className={ui.pill} data-tone={STATUS_TONES[issue.status]}>
      {STATUS_LABELS[issue.status]}
    </span>
    {issue.regressed_at && issue.status === "unresolved" && (
      <span className={ui.pill} data-tone="warn">
        Regressed
      </span>
    )}
    <span className={ui.pill}>{SOURCE_LABELS[issue.source]}</span>
    {issue.level !== "error" && (
      <span
        className={ui.pill}
        data-tone={issue.level === "fatal" ? "bad" : undefined}
      >
        {issue.level === "fatal" ? "Fatal" : "Warning"}
      </span>
    )}
  </>
);
