/**
 * ClientBrandingForm.tsx
 *
 * The branding slice of a client's portal settings: a logo (uploaded
 * straight to its own actions via ImageUploadField), a primary and accent
 * colour, and a welcome message — all saved together through
 * `updateClientBrandingAction`. Structurally identical to
 * AgencyBrandingForm; unset here just means the portal falls back to the
 * agency's own branding (see client_portal/service.py::portal_client_read).
 *
 * @module apps/binx-web/src/components/forms/clients/ClientBrandingForm/ClientBrandingForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ClientBranding } from "@/lib/clients";
import { clientLogoUrl } from "@/lib/clients-client";
import {
  removeClientLogoAction,
  updateClientBrandingAction,
  uploadClientLogoAction,
} from "@/app/(app)/clients/actions";
import ImageUploadField from "@/components/forms/agency/ImageUploadField/ImageUploadField";

import styles from "./ClientBrandingForm.module.scss";

interface ClientBrandingFormProps {
  agencyId: string;
  clientId: string;
  branding: ClientBranding;
}

const DEFAULT_COLOR = "#0a0a0b";
const HEX = /^#[0-9a-fA-F]{6}$/;

const ClientBrandingForm = ({ agencyId, clientId, branding }: ClientBrandingFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [primaryColor, setPrimaryColor] = useState(branding.primary_color ?? "");
  const [accentColor, setAccentColor] = useState(branding.accent_color ?? "");
  const [welcomeMessage, setWelcomeMessage] = useState(branding.welcome_message ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const trimmedPrimary = primaryColor.trim();
    const trimmedAccent = accentColor.trim();
    if (trimmedPrimary && !HEX.test(trimmedPrimary)) {
      setError("Primary colour must be a hex value like #0a0a0b");
      return;
    }
    if (trimmedAccent && !HEX.test(trimmedAccent)) {
      setError("Accent colour must be a hex value like #0a0a0b");
      return;
    }
    startTransition(async () => {
      const result = await updateClientBrandingAction(agencyId, clientId, {
        primary_color: trimmedPrimary || null,
        accent_color: trimmedAccent || null,
        welcome_message: welcomeMessage.trim() || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <div className={styles.wrapper}>
      <ImageUploadField
        label="Logo"
        hint="Square works best. Shows in the portal header for this client's contacts."
        hasImage={branding.has_logo}
        imageUrl={clientLogoUrl(agencyId, clientId, branding.logo_version)}
        aspect="square"
        onUpload={(file) => {
          const formData = new FormData();
          formData.append("file", file);
          return uploadClientLogoAction(agencyId, clientId, formData);
        }}
        onRemove={() => removeClientLogoAction(agencyId, clientId)}
      />

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="primaryColor">
            Primary colour
          </label>
          <div className={styles.colorRow}>
            <input
              type="color"
              className={styles.swatch}
              aria-label="Pick primary colour"
              value={primaryColor || DEFAULT_COLOR}
              onChange={(event) => setPrimaryColor(event.target.value)}
            />
            <input
              id="primaryColor"
              className={styles.input}
              placeholder="#0a0a0b"
              value={primaryColor}
              onChange={(event) => setPrimaryColor(event.target.value)}
            />
            {primaryColor && (
              <button type="button" className={styles.clearColor} onClick={() => setPrimaryColor("")}>
                Clear
              </button>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="accentColor">
            Accent colour
          </label>
          <div className={styles.colorRow}>
            <input
              type="color"
              className={styles.swatch}
              aria-label="Pick accent colour"
              value={accentColor || DEFAULT_COLOR}
              onChange={(event) => setAccentColor(event.target.value)}
            />
            <input
              id="accentColor"
              className={styles.input}
              placeholder="#0a0a0b"
              value={accentColor}
              onChange={(event) => setAccentColor(event.target.value)}
            />
            {accentColor && (
              <button type="button" className={styles.clearColor} onClick={() => setAccentColor("")}>
                Clear
              </button>
            )}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="welcomeMessage">
            Welcome message
          </label>
          <textarea
            id="welcomeMessage"
            className={styles.textarea}
            rows={3}
            maxLength={500}
            placeholder="A short line shown on this client's portal overview page"
            value={welcomeMessage}
            onChange={(event) => setWelcomeMessage(event.target.value)}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {saved && <p className={styles.success}>Branding saved.</p>}

        <button type="submit" className={styles.submit} disabled={isPending}>
          {isPending ? "Saving…" : "Save branding"}
        </button>
      </form>
    </div>
  );
};

export default ClientBrandingForm;
