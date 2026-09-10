/**
 * InviteMemberForm.tsx
 *
 * Invites someone to the current agency by email. On success, resets itself
 * and calls `router.refresh()` so the Pending invitations table (a sibling
 * server-rendered section, not lifted state) picks up the new invite without
 * a full navigation.
 *
 * @module apps/binx-web/src/components/forms/agency/InviteMemberForm/InviteMemberForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { inviteMemberAction } from "@/app/(app)/team/actions";

import styles from "./InviteMemberForm.module.scss";

const inviteSchema = z.object({
  email: z.email("Enter a valid email address"),
  role: z.enum(["admin", "member"]),
});

type InviteValues = z.infer<typeof inviteSchema>;

interface InviteMemberFormProps {
  agencyId: string;
}

const InviteMemberForm = ({ agencyId }: InviteMemberFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "member" },
  });

  const onSubmit = (values: InviteValues) => {
    setFormError(null);
    setSuccessMessage(null);
    const email = values.email.trim();

    startTransition(async () => {
      const result = await inviteMemberAction(agencyId, email, values.role);

      if (result.error) {
        setFormError(result.error);
        return;
      }

      setSuccessMessage(`Invitation sent to ${email}.`);
      reset();
      router.refresh();
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="invite-email">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            autoComplete="email"
            placeholder="teammate@example.com"
            className={styles.input}
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
          {errors.email && <p className={styles.error}>{errors.email.message}</p>}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="invite-role">
            Role
          </label>
          <select id="invite-role" className={styles.select} {...register("role")}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <button type="submit" className={styles.submit} disabled={isPending}>
          {isPending ? "Sending…" : "Send invite"}
        </button>
      </div>

      {formError && <p className={styles.formError}>{formError}</p>}
      {successMessage && <p className={styles.formSuccess}>{successMessage}</p>}
    </form>
  );
};

export default InviteMemberForm;
