/**
 * MemberProfile.tsx
 *
 * The teammate profile page's body: cover + avatar, name/title/role, bio,
 * skills, a work-experience timeline (most recent first), an education
 * list, and the contact info the member chose to share — all read-only
 * display, sibling to the editable QualificationsForm on /profile.
 *
 * @module apps/binx-web/src/components/team/MemberProfile/MemberProfile.tsx
 * @author Binx.io
 */
import type { AgencyMember } from "@/lib/agencies";
import { memberImageUrl } from "@/lib/users-client";

import styles from "./MemberProfile.module.scss";

interface MemberProfileProps {
  agencyId: string;
  member: AgencyMember;
  isSelf: boolean;
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function yearRange(startYear: number | null, endYear: number | null): string {
  if (startYear === null) return endYear === null ? "" : String(endYear);
  return `${startYear} – ${endYear === null ? "Present" : endYear}`;
}

const MemberProfile = ({ agencyId, member, isSelf }: MemberProfileProps) => {
  // "Present" (null end_year) sorts as the most recent.
  const experience = [...member.experience].sort((a, b) => (b.end_year ?? Infinity) - (a.end_year ?? Infinity));

  return (
    <div className={styles.wrapper}>
      <div
        className={styles.cover}
        data-has-cover={member.has_cover}
        style={
          member.has_cover
            ? { backgroundImage: `url(${memberImageUrl(agencyId, member.id, "cover", member.cover_version)})` }
            : undefined
        }
      >
        {/* A cover photo can be any color — this scrim guarantees the name/
            handle sitting on top of it (below) stay readable regardless. */}
        {member.has_cover && <div className={styles.coverOverlay} aria-hidden="true" />}
      </div>

      <div className={styles.identity} data-has-cover={member.has_cover}>
        {member.has_avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.avatar}
            src={memberImageUrl(agencyId, member.id, "avatar", member.avatar_version)}
            alt=""
          />
        ) : (
          <span className={styles.avatar} aria-hidden="true">
            {initials(member.full_name)}
          </span>
        )}

        <div className={styles.identityText}>
          <h2 className={styles.name}>
            {member.full_name}
            {isSelf && <span className={styles.youBadge}>You</span>}
            {member.is_verified && (
              <span className={styles.verified} title="Verified account" aria-label="Verified account">
                ✓
              </span>
            )}
          </h2>
          <p className={styles.handle}>
            @{member.user_name}
            {member.title && <span> · {member.title}</span>}
          </p>
          <span className={styles.roleBadge} data-role={member.role}>
            {capitalize(member.role)}
          </span>
        </div>
      </div>

      {member.bio && <p className={styles.bio}>{member.bio}</p>}

      {member.skills.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Skills</h2>
          <div className={styles.skills}>
            {member.skills.map((skill) => (
              <span key={skill} className={styles.skillChip}>
                {skill}
              </span>
            ))}
          </div>
        </section>
      )}

      {experience.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Experience</h2>
          <ul className={styles.timeline}>
            {experience.map((entry) => (
              <li key={entry.id} className={styles.timelineItem}>
                <p className={styles.timelineTitle}>{entry.title}</p>
                <p className={styles.timelineSubtitle}>
                  {entry.organization} · {yearRange(entry.start_year, entry.end_year)}
                </p>
                {entry.description && <p className={styles.timelineDescription}>{entry.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {member.education.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Education</h2>
          <ul className={styles.timeline}>
            {member.education.map((entry) => (
              <li key={entry.id} className={styles.timelineItem}>
                <p className={styles.timelineTitle}>{entry.degree}</p>
                <p className={styles.timelineSubtitle}>
                  {entry.school}
                  {entry.field_of_study ? ` · ${entry.field_of_study}` : ""}
                  {(entry.start_year || entry.end_year) && ` · ${yearRange(entry.start_year, entry.end_year)}`}
                </p>
                {entry.description && <p className={styles.timelineDescription}>{entry.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Contact</h2>
        <dl className={styles.metaList}>
          <div className={styles.metaItem}>
            <dt className={styles.metaLabel}>Personal title</dt>
            <dd className={styles.metaValue}>{member.job_title ?? "—"}</dd>
          </div>
          <div className={styles.metaItem}>
            <dt className={styles.metaLabel}>Email</dt>
            <dd className={styles.metaValue}>{member.email ?? "Hidden"}</dd>
          </div>
          <div className={styles.metaItem}>
            <dt className={styles.metaLabel}>Phone</dt>
            <dd className={styles.metaValue}>{member.phone ?? "Hidden"}</dd>
          </div>
          <div className={styles.metaItem}>
            <dt className={styles.metaLabel}>Member since</dt>
            <dd className={styles.metaValue}>{formatDate(member.joined_at)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
};

export default MemberProfile;
