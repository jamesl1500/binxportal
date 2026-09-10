/**
 * NotificationSettingsForm.tsx
 *
 * A table of notification toggles for the account settings page. Each row
 * is a preference (label + description + a Base UI Switch); "Save changes"
 * submits every toggle together via the `updateNotificationSettingsAction`
 * server action — there's no per-toggle autosave.
 *
 * @module apps/binx-web/src/components/forms/account/NotificationSettingsForm/NotificationSettingsForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { Switch } from "@base-ui/react/switch";

import { updateNotificationSettingsAction } from "@/app/(app)/account/actions";
import type { NotificationSettings } from "@/lib/users";

import styles from "./NotificationSettingsForm.module.scss";

interface NotificationSettingsFormProps {
  settings: NotificationSettings;
}

interface SettingRow {
  key: keyof NotificationSettings;
  label: string;
  description: string;
}

interface SettingGroup {
  heading: string;
  hint: string;
  rows: SettingRow[];
}

const GROUPS: SettingGroup[] = [
  {
    heading: "Email",
    hint: "Choose which emails you'd like to receive.",
    rows: [
      {
        key: "email_product_updates",
        label: "Product updates",
        description: "New features and improvements to Binx.",
      },
      {
        key: "email_client_activity",
        label: "Client activity",
        description: "When a client uploads a file, leaves a comment, or updates a request.",
      },
      {
        key: "email_team_mentions",
        label: "Team mentions",
        description: "When a teammate @mentions you.",
      },
      {
        key: "email_weekly_digest",
        label: "Weekly digest",
        description: "A summary of your agency's activity, every Monday morning.",
      },
      {
        key: "email_security_alerts",
        label: "Security alerts",
        description: "Sign-ins from a new device or location.",
      },
    ],
  },
  {
    heading: "In-app",
    hint: "Which notifications show up in the bell and on the Notifications page.",
    rows: [
      {
        key: "inapp_team",
        label: "Team",
        description: "When an invitation you sent is accepted.",
      },
      {
        key: "inapp_invoicing",
        label: "Invoicing",
        description: "When an invoice you drafted is issued, or a payment is recorded.",
      },
      {
        key: "inapp_projects",
        label: "Projects",
        description: "When you're added to a project or assigned a task.",
      },
      {
        key: "inapp_messages",
        label: "Mentions",
        description: "When a teammate @mentions you in a conversation.",
      },
    ],
  },
];

const NotificationSettingsForm = ({ settings }: NotificationSettingsFormProps) => {
  const [values, setValues] = useState(settings);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleToggle = (key: keyof NotificationSettings) => (checked: boolean) => {
    setFormError(null);
    setSuccessMessage(null);
    setValues((prev) => ({ ...prev, [key]: checked }));
  };

  const handleSave = () => {
    setFormError(null);
    setSuccessMessage(null);

    startTransition(async () => {
      const result = await updateNotificationSettingsAction(values);

      if (result.error) {
        setFormError(result.error);
      } else {
        setSuccessMessage("Notification settings saved.");
      }
    });
  };

  return (
    <div className={styles.wrapper}>
      {GROUPS.map((group) => (
        <div key={group.heading} className={styles.group}>
          <p className={styles.groupHeading}>{group.heading}</p>
          <p className={styles.groupHint}>{group.hint}</p>
          <table className={styles.table}>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.key} className={styles.row}>
                  <td className={styles.info}>
                    <p className={styles.label}>{row.label}</p>
                    <p className={styles.description}>{row.description}</p>
                  </td>
                  <td className={styles.control}>
                    <Switch.Root
                      checked={values[row.key]}
                      onCheckedChange={handleToggle(row.key)}
                      className={styles.switch}
                      aria-label={row.label}
                    >
                      <Switch.Thumb className={styles.thumb} />
                    </Switch.Root>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {formError && <p className={styles.formError}>{formError}</p>}
      {successMessage && <p className={styles.formSuccess}>{successMessage}</p>}

      <button type="button" className={styles.submit} onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
};

export default NotificationSettingsForm;
