/**
 * UserActionsPanel.tsx
 *
 * The account actions support needs when someone writes in: send a password
 * reset, resend or skip email verification, sign them out everywhere,
 * deactivate/reactivate the account, and grant/remove Binx admin access.
 * Anything disruptive asks first. Every action lands in the admin audit
 * trail *and* in the person's own security history.
 *
 * You can't deactivate or demote yourself — the buttons are hidden here and
 * binx-api refuses it too.
 *
 * @module apps/binx-web/src/components/admin/UserActionsPanel/UserActionsPanel.tsx
 * @author Binx Portal
 */
"use client";

import { useState, useTransition } from "react";

import { type AdminActionState, userAction } from "@/app/(app)/admin/actions";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import type { UserAction } from "@/lib/admin";

import ui from "../adminUi.module.scss";
import styles from "./UserActionsPanel.module.scss";

interface UserActionsPanelProps {
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  isVerified: boolean;
  isAdmin: boolean;
  isSelf: boolean;
  activeSessions: number;
}

const UserActionsPanel = ({
  userId,
  name,
  email,
  isActive,
  isVerified,
  isAdmin,
  isSelf,
  activeSessions,
}: UserActionsPanelProps) => {
  const [result, setResult] = useState<AdminActionState>({});
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const { confirm, dialog } = useConfirmDialog();

  const run = (action: UserAction, extra?: string) =>
    startTransition(async () =>
      setResult(await userAction(userId, action, extra)),
    );

  const ask = async (
    action: UserAction,
    title: string,
    description: string,
    confirmLabel: string,
    tone: "default" | "danger" = "default",
  ) => {
    if (await confirm({ title, description, confirmLabel, tone })) {
      run(action, action === "deactivate" ? reason : undefined);
    }
  };

  return (
    <div className={`${ui.stack} ${ui.tight}`}>
      <section className={styles.group} aria-label="Access">
        <h3 className={styles.heading}>Access</h3>
        <button
          type="button"
          className={ui.button}
          disabled={isPending || !isActive}
          onClick={() => run("password-reset")}
        >
          Send password reset
        </button>
        {!isVerified && (
          <>
            <button
              type="button"
              className={ui.button}
              disabled={isPending}
              onClick={() => run("resend-verification")}
            >
              Resend verification email
            </button>
            <button
              type="button"
              className={ui.button}
              disabled={isPending}
              onClick={() =>
                ask(
                  "verify",
                  `Mark ${email} as verified?`,
                  "Only do this once you're sure they own the address — they'll be able to sign in straight away.",
                  "Mark verified",
                )
              }
            >
              Mark email verified
            </button>
          </>
        )}
        <button
          type="button"
          className={ui.button}
          disabled={isPending}
          onClick={() =>
            ask(
              "sign-out",
              `Sign ${name} out everywhere?`,
              `Ends their ${activeSessions} active session${activeSessions === 1 ? "" : "s"}. Open tabs stop working within 30 minutes and they'll need to sign in again.`,
              "Sign out everywhere",
            )
          }
        >
          Sign out everywhere
        </button>
      </section>

      {!isSelf && (
        <section className={styles.group} aria-label="Account status">
          <h3 className={styles.heading}>Account status</h3>
          {isActive ? (
            <>
              <label className={ui.field}>
                Reason (optional, kept in the audit log)
                <input
                  className={ui.input}
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="e.g. Left the agency — requested by the owner"
                />
              </label>
              <button
                type="button"
                className={ui.danger}
                disabled={isPending}
                onClick={() =>
                  ask(
                    "deactivate",
                    `Deactivate ${name}'s account?`,
                    "They're locked out immediately — every session stops working and they can't sign in. Their data and memberships are kept, and you can reactivate later.",
                    "Deactivate",
                    "danger",
                  )
                }
              >
                Deactivate account
              </button>
            </>
          ) : (
            <button
              type="button"
              className={ui.button}
              disabled={isPending}
              onClick={() => run("reactivate")}
            >
              Reactivate account
            </button>
          )}
        </section>
      )}

      {!isSelf && (
        <section className={styles.group} aria-label="Binx admin">
          <h3 className={styles.heading}>Binx admin</h3>
          <button
            type="button"
            className={isAdmin ? ui.danger : ui.button}
            disabled={isPending}
            onClick={() =>
              isAdmin
                ? ask(
                    "remove-admin",
                    `Remove ${name}'s admin access?`,
                    "They'll lose access to this console straight away.",
                    "Remove access",
                    "danger",
                  )
                : ask(
                    "make-admin",
                    `Make ${name} a Binx admin?`,
                    "They'll be able to see every agency and user on the platform and take these same actions. Only grant this to the Binx team.",
                    "Grant admin access",
                  )
            }
          >
            {isAdmin ? "Remove admin access" : "Make Binx admin"}
          </button>
        </section>
      )}

      <p role="status" aria-live="polite" className={ui.status}>
        {result.message && <span className={ui.notice}>{result.message}</span>}
        {result.error && <span className={ui.error}>{result.error}</span>}
      </p>
      {dialog}
    </div>
  );
};

export default UserActionsPanel;
