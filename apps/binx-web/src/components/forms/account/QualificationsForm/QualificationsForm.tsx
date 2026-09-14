/**
 * QualificationsForm.tsx
 *
 * Skills, work experience, and education, saved together as one submit —
 * the "Skills & Experience" tab on /profile. Composes SkillsInput,
 * ExperienceEntryList, and EducationEntryList, each controlled from local
 * state seeded by the initial profile data.
 *
 * @module apps/binx-web/src/components/forms/account/QualificationsForm/QualificationsForm.tsx
 * @author Binx.io
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateQualificationsAction } from "@/app/(app)/profile/actions";
import type { EducationEntry, ExperienceEntry, UserProfileData } from "@/lib/users";
import EducationEntryList from "@/components/forms/account/EducationEntryList/EducationEntryList";
import ExperienceEntryList from "@/components/forms/account/ExperienceEntryList/ExperienceEntryList";
import SkillsInput from "@/components/forms/account/SkillsInput/SkillsInput";

import styles from "./QualificationsForm.module.scss";

interface QualificationsFormProps {
  profile: UserProfileData;
}

const QualificationsForm = ({ profile }: QualificationsFormProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [skills, setSkills] = useState<string[]>(profile.skills);
  const [experience, setExperience] = useState<ExperienceEntry[]>(profile.experience);
  const [education, setEducation] = useState<EducationEntry[]>(profile.education);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateQualificationsAction({ skills, experience, education });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Skills</h2>
        <p className={styles.sectionSubtitle}>
          What you&apos;re good at — shown on your teammate profile so others know your capabilities.
        </p>
        <SkillsInput value={skills} onChange={setSkills} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Experience</h2>
        <p className={styles.sectionSubtitle}>Your work history, most relevant first.</p>
        <ExperienceEntryList value={experience} onChange={setExperience} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Education</h2>
        <p className={styles.sectionSubtitle}>Degrees, certifications, and where you studied.</p>
        <EducationEntryList value={education} onChange={setEducation} />
      </section>

      {error && <p className={styles.formError}>{error}</p>}
      {saved && <p className={styles.formSuccess}>Saved.</p>}

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
};

export default QualificationsForm;
