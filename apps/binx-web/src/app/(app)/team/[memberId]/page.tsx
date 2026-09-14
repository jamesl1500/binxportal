/**
 * page.tsx - Team · Member Profile
 *
 * A teammate's full profile: cover + avatar, bio, skills, work experience,
 * education, and the contact info they chose to share — so others on the
 * team can understand who they are and what they're capable of, beyond the
 * admin-focused MemberDetailDrawer on /team. Deliberately outside the
 * (roster) route group's layout (Members/Invitations tabs) — this is a
 * detail page, not another roster tab.
 *
 * @module apps/binx-web/src/app/(app)/team/[memberId]/page.tsx
 * @author Binx.io
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAgencyMember, getCurrentAgencyContext } from "@/lib/agencies";
import { AuthApiError, getCurrentUser } from "@/lib/auth";
import MemberProfile from "@/components/team/MemberProfile/MemberProfile";

import styles from "./page.module.scss";

interface MemberProfilePageProps {
  params: Promise<{ memberId: string }>;
}

export async function generateMetadata({ params }: MemberProfilePageProps): Promise<Metadata> {
  const { memberId } = await params;
  try {
    const { currentAgency } = await getCurrentAgencyContext();
    if (!currentAgency) return {};
    const member = await getAgencyMember(currentAgency.id, memberId);
    return { title: member.full_name };
  } catch {
    return {};
  }
}

const MemberProfilePage = async ({ params }: MemberProfilePageProps) => {
  const { memberId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { currentAgency } = await getCurrentAgencyContext();

  if (!currentAgency) {
    redirect("/onboarding/two");
  }

  let member;
  try {
    member = await getAgencyMember(currentAgency.id, memberId);
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const canManage = currentAgency.role === "owner" || currentAgency.role === "admin";

  return (
    <div>
      <span className={styles.eyebrow}>Team</span>
      <h1 className={styles.title}>View Team Member</h1>

      <div className={styles.topRow}>
        <Link href="/team" className={styles.backLink}>
          ← Back to team
        </Link>
        {canManage && (
          <Link href="/team" className={styles.manageLink}>
            Manage role & title
          </Link>
        )}
      </div>

      <MemberProfile agencyId={currentAgency.id} member={member} isSelf={member.user_id === user.id} />
    </div>
  );
};

export default MemberProfilePage;
