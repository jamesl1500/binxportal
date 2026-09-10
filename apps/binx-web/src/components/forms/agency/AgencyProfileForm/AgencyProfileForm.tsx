/**
 * AgencyProfileForm.tsx
 *
 * The "about" slice of the agency profile: a description, founding details,
 * contact information, and social links. Full-replace of its own fields via
 * `updateAgencyProfileAction` (other forms own the branding and policy slices).
 *
 * @module apps/binx-web/src/components/forms/agency/AgencyProfileForm/AgencyProfileForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import type { AgencyProfile } from "@/lib/agencies";
import { updateAgencyProfileAction } from "@/app/(app)/settings/actions";

import styles from "./AgencyProfileForm.module.scss";

const nextYear = new Date().getFullYear() + 1;

const schema = z.object({
  about: z.string().trim().max(8192).optional().or(z.literal("")),
  foundedYear: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || (/^\d{4}$/.test(value) && Number(value) >= 1800 && Number(value) <= nextYear),
      "Enter a 4-digit year",
    ),
  headquarters: z.string().trim().max(255).optional().or(z.literal("")),
  contactEmail: z.string().trim().email("Enter a valid email").max(255).optional().or(z.literal("")),
  contactPhone: z.string().trim().max(32).optional().or(z.literal("")),
  website: z.string().trim().max(2048).optional().or(z.literal("")),
  address: z.string().trim().max(2048).optional().or(z.literal("")),
  linkedinUrl: z.string().trim().max(2048).optional().or(z.literal("")),
  twitterUrl: z.string().trim().max(2048).optional().or(z.literal("")),
  instagramUrl: z.string().trim().max(2048).optional().or(z.literal("")),
  facebookUrl: z.string().trim().max(2048).optional().or(z.literal("")),
});

type Values = z.infer<typeof schema>;

interface AgencyProfileFormProps {
  agencyId: string;
  profile: AgencyProfile;
}

const AgencyProfileForm = ({ agencyId, profile }: AgencyProfileFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      about: profile.about ?? "",
      foundedYear: profile.founded_year ? String(profile.founded_year) : "",
      headquarters: profile.headquarters ?? "",
      contactEmail: profile.contact_email ?? "",
      contactPhone: profile.contact_phone ?? "",
      website: profile.website ?? "",
      address: profile.address ?? "",
      linkedinUrl: profile.linkedin_url ?? "",
      twitterUrl: profile.twitter_url ?? "",
      instagramUrl: profile.instagram_url ?? "",
      facebookUrl: profile.facebook_url ?? "",
    },
  });

  const onSubmit = (values: Values) => {
    setFormError(null);
    setSaved(false);
    const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

    startTransition(async () => {
      const result = await updateAgencyProfileAction(agencyId, {
        about: clean(values.about),
        founded_year: values.foundedYear && values.foundedYear.trim() ? Number(values.foundedYear) : null,
        headquarters: clean(values.headquarters),
        contact_email: clean(values.contactEmail),
        contact_phone: clean(values.contactPhone),
        website: clean(values.website),
        address: clean(values.address),
        linkedin_url: clean(values.linkedinUrl),
        twitter_url: clean(values.twitterUrl),
        instagram_url: clean(values.instagramUrl),
        facebook_url: clean(values.facebookUrl),
      });
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="about">
          About
        </label>
        <textarea id="about" className={styles.textarea} rows={5} {...register("about")} />
        {errors.about && <p className={styles.error}>{errors.about.message}</p>}
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="foundedYear">
            Founded
          </label>
          <input id="foundedYear" type="number" className={styles.input} placeholder="Year" {...register("foundedYear")} />
          {errors.foundedYear && <p className={styles.error}>{errors.foundedYear.message}</p>}
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="headquarters">
            Headquarters
          </label>
          <input id="headquarters" className={styles.input} placeholder="City, Country" {...register("headquarters")} />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="contactEmail">
            Contact email
          </label>
          <input id="contactEmail" type="email" className={styles.input} {...register("contactEmail")} />
          {errors.contactEmail && <p className={styles.error}>{errors.contactEmail.message}</p>}
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="contactPhone">
            Contact phone
          </label>
          <input id="contactPhone" type="tel" className={styles.input} {...register("contactPhone")} />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="website">
            Website
          </label>
          <input id="website" className={styles.input} placeholder="https://" {...register("website")} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="address">
            Address
          </label>
          <input id="address" className={styles.input} {...register("address")} />
        </div>
      </div>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Social links</legend>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="linkedinUrl">
              LinkedIn
            </label>
            <input id="linkedinUrl" className={styles.input} placeholder="https://" {...register("linkedinUrl")} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="twitterUrl">
              X / Twitter
            </label>
            <input id="twitterUrl" className={styles.input} placeholder="https://" {...register("twitterUrl")} />
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="instagramUrl">
              Instagram
            </label>
            <input id="instagramUrl" className={styles.input} placeholder="https://" {...register("instagramUrl")} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="facebookUrl">
              Facebook
            </label>
            <input id="facebookUrl" className={styles.input} placeholder="https://" {...register("facebookUrl")} />
          </div>
        </div>
      </fieldset>

      {formError && <p className={styles.error}>{formError}</p>}
      {saved && <p className={styles.success}>Agency details saved.</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving…" : "Save details"}
      </button>
    </form>
  );
};

export default AgencyProfileForm;
