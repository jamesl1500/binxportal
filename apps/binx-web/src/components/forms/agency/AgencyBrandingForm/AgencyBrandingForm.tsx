/**
 * AgencyBrandingForm.tsx
 *
 * The branding slice of the agency profile: the logo and cover image
 * (uploaded straight to their own actions via ImageUploadField), plus a
 * tagline and a brand colour that save together through
 * `updateAgencyProfileAction`.
 *
 * @module apps/binx-web/src/components/forms/agency/AgencyBrandingForm/AgencyBrandingForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { AgencyProfile } from "@/lib/agencies";
import { agencyImageUrl } from "@/lib/agencies-client";
import {
  removeAgencyImageAction,
  updateAgencyProfileAction,
  uploadAgencyImageAction,
} from "@/app/(app)/settings/actions";
import ImageUploadField from "@/components/forms/agency/ImageUploadField/ImageUploadField";

import styles from "./AgencyBrandingForm.module.scss";

interface AgencyBrandingFormProps {
  agencyId: string;
  profile: AgencyProfile;
}

const DEFAULT_COLOR = "#0a0a0b";
const HEX = /^#[0-9a-fA-F]{6}$/;

const AgencyBrandingForm = ({ agencyId, profile }: AgencyBrandingFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tagline, setTagline] = useState(profile.tagline ?? "");
  const [color, setColor] = useState(profile.brand_color ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const trimmedColor = color.trim();
    if (trimmedColor && !HEX.test(trimmedColor)) {
      setError("Brand colour must be a hex value like #0a0a0b");
      return;
    }
    startTransition(async () => {
      const result = await updateAgencyProfileAction(agencyId, {
        tagline: tagline.trim() || null,
        brand_color: trimmedColor || null,
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
      <div className={styles.images}>
        <ImageUploadField
          label="Logo"
          hint="Square works best. Shows in the top nav and the agency switcher."
          hasImage={profile.has_logo}
          imageUrl={agencyImageUrl(agencyId, "logo", profile.logo_version)}
          aspect="square"
          onUpload={(file) => {
            const formData = new FormData();
            formData.append("file", file);
            return uploadAgencyImageAction(agencyId, "logo", formData);
          }}
          onRemove={() => removeAgencyImageAction(agencyId, "logo")}
        />
        <ImageUploadField
          label="Cover photo"
          hint="A wide banner image for the agency."
          hasImage={profile.has_cover}
          imageUrl={agencyImageUrl(agencyId, "cover", profile.cover_version)}
          aspect="wide"
          onUpload={(file) => {
            const formData = new FormData();
            formData.append("file", file);
            return uploadAgencyImageAction(agencyId, "cover", formData);
          }}
          onRemove={() => removeAgencyImageAction(agencyId, "cover")}
        />
      </div>

      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="tagline">
            Tagline
          </label>
          <input
            id="tagline"
            className={styles.input}
            maxLength={255}
            placeholder="A short line about what you do"
            value={tagline}
            onChange={(event) => setTagline(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="brandColor">
            Brand colour
          </label>
          <div className={styles.colorRow}>
            <input
              type="color"
              className={styles.swatch}
              aria-label="Pick brand colour"
              value={color || DEFAULT_COLOR}
              onChange={(event) => setColor(event.target.value)}
            />
            <input
              id="brandColor"
              className={styles.input}
              placeholder="#0a0a0b"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
            {color && (
              <button type="button" className={styles.clearColor} onClick={() => setColor("")}>
                Clear
              </button>
            )}
          </div>
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

export default AgencyBrandingForm;
