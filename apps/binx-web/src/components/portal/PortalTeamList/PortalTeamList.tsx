/**
 * PortalTeamList.tsx
 *
 * The client portal's "My Team" grid: one card per agency person assigned
 * to the client's projects — photo (or initials), name, job title, the
 * projects they're on with their role there, and the contact details they
 * share. Email and phone are tap-to-contact links; when a member shares
 * neither, the card points the client at Messages instead.
 *
 * @module apps/binx-web/src/components/portal/PortalTeamList/PortalTeamList.tsx
 * @author Binx Portal
 */
import Link from "next/link";
import { Mail, MessageSquare, Phone } from "lucide-react";

import type { PortalTeamMember } from "@/lib/portal";
import { portalTeamAvatarUrl } from "@/lib/users-client";
import MessageAvatar from "@/components/messaging/MessageAvatar/MessageAvatar";

import styles from "./PortalTeamList.module.scss";

interface PortalTeamListProps {
  members: PortalTeamMember[];
}

const PortalTeamList = ({ members }: PortalTeamListProps) => (
  <ul className={styles.grid}>
    {members.map((member) => (
      <li key={member.user_id} className={styles.card}>
        <div className={styles.head}>
          <MessageAvatar
            name={member.full_name}
            src={
              member.has_avatar
                ? portalTeamAvatarUrl(member.user_id, member.avatar_version)
                : null
            }
            className={styles.avatar}
          />
          <div className={styles.identity}>
            <h2 className={styles.name}>{member.full_name}</h2>
            {member.job_title && (
              <p className={styles.jobTitle}>{member.job_title}</p>
            )}
          </div>
        </div>

        <div className={styles.block}>
          <span className={styles.label}>Working on</span>
          <ul className={styles.projects}>
            {member.projects.map((project) => (
              <li key={project.id} className={styles.project}>
                <Link
                  href={`/portal/projects/${project.id}`}
                  className={styles.projectLink}
                >
                  {project.name}
                </Link>
                {project.role_name && (
                  <span className={styles.role}>
                    <span
                      className={styles.roleDot}
                      style={{ background: project.role_color ?? undefined }}
                      aria-hidden="true"
                    />
                    {project.role_name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.block}>
          <span className={styles.label}>Contact</span>
          <ul className={styles.contact}>
            {member.email && (
              <li>
                <a href={`mailto:${member.email}`} className={styles.contactLink}>
                  <Mail aria-hidden="true" />
                  {member.email}
                </a>
              </li>
            )}
            {member.phone && (
              <li>
                <a href={`tel:${member.phone}`} className={styles.contactLink}>
                  <Phone aria-hidden="true" />
                  {member.phone}
                </a>
              </li>
            )}
            {!member.email && !member.phone && (
              <li>
                <Link href="/portal/messages" className={styles.contactLink}>
                  <MessageSquare aria-hidden="true" />
                  Reach them in Messages
                </Link>
              </li>
            )}
          </ul>
        </div>
      </li>
    ))}
  </ul>
);

export default PortalTeamList;
