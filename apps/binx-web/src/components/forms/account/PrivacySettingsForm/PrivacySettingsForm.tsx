/**
 * PrivacySettingsForm.tsx
 *
 * A table of privacy preferences for the account settings page. Mirrors
 * NotificationSettingsForm's row layout, but one row (profile visibility) is
 * a select rather than a toggle. "Save changes" submits every field together
 * via the `updatePrivacySettingsAction` server action.
 *
 * @module apps/binx-web/src/components/forms/account/PrivacySettingsForm/PrivacySettingsForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { Switch } from "@base-ui/react/switch";

import { updatePrivacySettingsAction } from "@/app/(app)/account/actions";
import type { PrivacySettings } from "@/lib/users";

import styles from "./PrivacySettingsForm.module.scss";

interface PrivacySettingsFormProps {
  settings: PrivacySettings;
}

type ToggleKey = Exclude<keyof PrivacySettings, "profile_visibility">;

interface ToggleRow {
  key: ToggleKey;
  label: string;
  description: string;
}

const TOGGLE_ROWS: ToggleRow[] = [
  {
    key: "show_email_to_team",
    label: "Show email to team",
    description: "Let agency teammates see your email address on your profile.",
  },
  {
    key: "show_phone_to_team",
    label: "Show phone number to team",
    description: "Let agency teammates see your phone number on your profile.",
  },
  {
    key: "activity_status_visible",
    label: "Show activity status",
    description: "Let teammates see when you were last active.",
  },
  {
    key: "analytics_opt_out",
    label: "Opt out of usage analytics",
    description: "Stop sharing anonymous product-usage data that helps us improve Binx.",
  },
];

const PrivacySettingsForm = ({ settings }: PrivacySettingsFormProps) => {
  const [values, setValues] = useState(settings);
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const clearMessages = () => {
    setFormError(null);
    setSuccessMessage(null);
  };

  const handleToggle = (key: ToggleKey) => (checked: boolean) => {
    clearMessages();
    setValues((prev) => ({ ...prev, [key]: checked }));
  };

  const handleVisibilityChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    clearMessages();
    setValues((prev) => ({ ...prev, profile_visibility: event.target.value as PrivacySettings["profile_visibility"] }));
  };

  const handleSave = () => {
    clearMessages();

    startTransition(async () => {
      const result = await updatePrivacySettingsAction(values);

      if (result.error) {
        setFormError(result.error);
      } else {
        setSuccessMessage("Privacy settings saved.");
      }
    });
  };

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <tbody>
          <tr className={styles.row}>
            <td className={styles.info}>
              <p className={styles.label}>Profile visibility</p>
              <p className={styles.description}>Who can see your full profile details, including your bio.</p>
            </td>
            <td className={styles.control}>
              <select
                className={styles.select}
                value={values.profile_visibility}
                onChange={handleVisibilityChange}
                aria-label="Profile visibility"
              >
                <option value="team">Team</option>
                <option value="private">Private</option>
              </select>
            </td>
          </tr>

          {TOGGLE_ROWS.map((row) => (
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

      {formError && <p className={styles.formError}>{formError}</p>}
      {successMessage && <p className={styles.formSuccess}>{successMessage}</p>}

      <button type="button" className={styles.submit} onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
};

export default PrivacySettingsForm;
