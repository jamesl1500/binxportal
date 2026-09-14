/**
 * AppearanceForm.tsx
 *
 * A single accent-color preference for the signed-in user's own view of the
 * staff portal — recolors primary buttons, active tabs, and links. Same hex
 * picker + text input pattern as AgencyBrandingForm's brand colour field.
 * Applied app-wide via --app-accent, set server-side in (app)/layout.tsx.
 *
 * @module apps/binx-web/src/components/forms/account/AppearanceForm/AppearanceForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateAppearanceAction } from "@/app/(app)/profile/actions";
import type { AppearanceSettings } from "@/lib/users";

import styles from "./AppearanceForm.module.scss";

interface AppearanceFormProps {
  settings: AppearanceSettings;
}

const DEFAULT_COLOR = "#0a0a0b";
const HEX = /^#[0-9a-fA-F]{6}$/;

const AppearanceForm = ({ settings }: AppearanceFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [color, setColor] = useState(settings.accent_color ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = (nextColor: string | null) => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateAppearanceAction(nextColor);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = color.trim();
    if (trimmed && !HEX.test(trimmed)) {
      setError("Accent color must be a hex value like #2563eb");
      return;
    }
    save(trimmed || null);
  };

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="accentColor">
          Accent color
        </label>
        <p className={styles.hint}>
          Recolors primary buttons, active tabs, and links across the app — just for your own view.
        </p>
        <div className={styles.colorRow}>
          <input
            type="color"
            className={styles.swatch}
            aria-label="Pick accent color"
            value={color || DEFAULT_COLOR}
            onChange={(event) => setColor(event.target.value)}
          />
          <input
            id="accentColor"
            className={styles.input}
            placeholder="#2563eb"
            value={color}
            onChange={(event) => setColor(event.target.value)}
          />
          {color && (
            <button
              type="button"
              className={styles.clearColor}
              onClick={() => {
                setColor("");
                save(null);
              }}
            >
              Reset to default
            </button>
          )}
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {saved && <p className={styles.success}>Saved.</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </button>
    </form>
  );
};

export default AppearanceForm;
