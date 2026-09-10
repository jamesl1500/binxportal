/**
 * MemberDetailDrawer.tsx
 *
 * Right-side, full-height drawer for one team member. It shows the full
 * profile the member chose to share (bio, phone, personal job title, contact
 * email, last active, member since) and — for an owner/admin caller — the
 * CRUD controls: change their role, set the job title they hold *at this
 * agency* and internal admin-only notes, and remove them from the agency.
 *
 * Opened by clicking a row in TeamRoster. The two-state open/close pattern
 * (the `member` prop stays non-null through the close transition) mirrors
 * projects/TaskDetailPanel so the content doesn't vanish mid-animation.
 *
 * @module apps/binx-web/src/components/team/MemberDetailDrawer/MemberDetailDrawer.tsx
 * @author Binx.io
 */
"use client";

import { FormEvent, useState, useTransition } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  removeAgencyMemberAction,
  updateAgencyMemberRoleAction,
  updateMemberDetailsAction,
} from "@/app/(app)/team/actions";
import type { AgencyMember, AgencyRole } from "@/lib/agencies";

import styles from "./MemberDetailDrawer.module.scss";

const ROLE_OPTIONS: AgencyRole[] = ["owner", "admin", "member"];

interface MemberDetailDrawerProps {
  agencyId: string;
  member: AgencyMember | null;
  open: boolean;
  canManage: boolean;
  currentUserId: string;
  onOpenChange: (open: boolean) => void;
  onClosed: () => void;
  onMemberUpdated: (member: AgencyMember) => void;
  onMemberRemoved: (memberId: string) => void;
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

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(iso);
}

const MemberDetailDrawer = ({
  agencyId,
  member,
  open,
  canManage,
  currentUserId,
  onOpenChange,
  onClosed,
  onMemberUpdated,
  onMemberRemoved,
}: MemberDetailDrawerProps) => {
  const [title, setTitle] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isSavingDetails, startSavingDetails] = useTransition();
  const [isSavingRole, startSavingRole] = useTransition();
  const [isRemoving, startRemoving] = useTransition();

  // Reseed the editable fields whenever a different member is opened — done
  // during render (React's "adjust state on prop change"), same as
  // TaskDetailPanel. `undefined` so the first non-null member always seeds.
  const [seededMemberId, setSeededMemberId] = useState<string | undefined>(undefined);
  if (member && member.id !== seededMemberId) {
    setSeededMemberId(member.id);
    setTitle(member.title ?? "");
    setAdminNotes(member.admin_notes ?? "");
    setConfirmingRemove(false);
  }

  if (!member) return null;

  const currentMember = member;
  const isSelf = currentMember.user_id === currentUserId;
  const detailsDirty =
    (currentMember.title ?? "") !== title.trim() || (currentMember.admin_notes ?? "") !== adminNotes.trim();

  const handleSaveDetails = (event: FormEvent) => {
    event.preventDefault();
    startSavingDetails(async () => {
      const result = await updateMemberDetailsAction(agencyId, currentMember.id, {
        title: title.trim() || null,
        adminNotes: adminNotes.trim() || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.member) {
        onMemberUpdated(result.member);
        toast.success("Member details saved");
      }
    });
  };

  const handleRoleChange = (role: AgencyRole) => {
    if (role === currentMember.role) return;
    startSavingRole(async () => {
      const result = await updateAgencyMemberRoleAction(agencyId, currentMember.id, role);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.member) {
        onMemberUpdated(result.member);
        toast.success(`${currentMember.full_name} is now ${role === "admin" ? "an" : "a"} ${role}`);
      }
    });
  };

  const handleRemove = () => {
    startRemoving(async () => {
      const result = await removeAgencyMemberAction(agencyId, currentMember.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${currentMember.full_name} was removed from the agency`);
      onMemberRemoved(currentMember.id);
      onOpenChange(false);
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} onOpenChangeComplete={(isOpen) => !isOpen && onClosed()}>
      <Dialog.Portal>
        <Dialog.Backdrop className={styles.backdrop} />
        <Dialog.Popup className={styles.panel} aria-label={`Member: ${currentMember.full_name}`}>
          <div className={styles.header}>
            <span className={styles.eyebrow}>Team member</span>
            <Dialog.Close className={styles.closeButton} aria-label="Close">
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">
              {initials(currentMember.full_name)}
            </span>
            <div>
              <h2 className={styles.name}>
                {currentMember.full_name}
                {isSelf && <span className={styles.youBadge}>You</span>}
                {currentMember.is_verified && (
                  <span className={styles.verified} title="Verified account" aria-label="Verified account">
                    ✓
                  </span>
                )}
              </h2>
              <p className={styles.handle}>@{currentMember.user_name}</p>
              <span className={styles.roleBadge} data-role={currentMember.role}>
                {capitalize(currentMember.role)}
              </span>
            </div>
          </div>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Profile</h3>
            {currentMember.bio ? (
              <p className={styles.bio}>{currentMember.bio}</p>
            ) : (
              <p className={styles.empty}>No bio shared.</p>
            )}
            <dl className={styles.metaList}>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>Personal title</dt>
                <dd className={styles.metaValue}>{currentMember.job_title ?? "—"}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>Email</dt>
                <dd className={styles.metaValue}>{currentMember.email ?? "Hidden"}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>Phone</dt>
                <dd className={styles.metaValue}>{currentMember.phone ?? "Hidden"}</dd>
              </div>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>Last active</dt>
                <dd className={styles.metaValue}>
                  {currentMember.last_active_at ? formatRelative(currentMember.last_active_at) : "Hidden"}
                </dd>
              </div>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>Member since</dt>
                <dd className={styles.metaValue}>{formatDate(currentMember.joined_at)}</dd>
              </div>
            </dl>
          </section>

          {canManage && !isSelf && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Role</h3>
              <select
                className={styles.roleSelect}
                value={currentMember.role}
                disabled={isSavingRole}
                onChange={(event) => handleRoleChange(event.target.value as AgencyRole)}
                aria-label={`Role for ${currentMember.full_name}`}
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {capitalize(role)}
                  </option>
                ))}
              </select>
              <p className={styles.hint}>Admins can manage the roster and settings. Owners can also delete the agency.</p>
            </section>
          )}

          {canManage && !isSelf && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Agency details</h3>
              <form className={styles.detailsForm} onSubmit={handleSaveDetails}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="member-title">
                    Job title at this agency
                  </label>
                  <input
                    id="member-title"
                    className={styles.input}
                    value={title}
                    maxLength={255}
                    placeholder="e.g. Lead Designer"
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="member-notes">
                    Admin notes
                  </label>
                  <textarea
                    id="member-notes"
                    className={styles.textarea}
                    rows={3}
                    value={adminNotes}
                    maxLength={4096}
                    placeholder="Internal — only owners and admins can see this."
                    onChange={(event) => setAdminNotes(event.target.value)}
                  />
                  <p className={styles.hint}>Only owners and admins can see these notes.</p>
                </div>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={isSavingDetails || !detailsDirty}
                >
                  {isSavingDetails ? "Saving…" : "Save details"}
                </button>
              </form>
            </section>
          )}

          {canManage && !isSelf && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Danger zone</h3>
              {confirmingRemove ? (
                <div className={styles.confirmRow}>
                  <p className={styles.confirmText}>Remove {currentMember.full_name} from the agency?</p>
                  <div className={styles.confirmActions}>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={handleRemove}
                      disabled={isRemoving}
                    >
                      {isRemoving ? "Removing…" : "Yes, remove"}
                    </button>
                    <button
                      type="button"
                      className={styles.cancelButton}
                      onClick={() => setConfirmingRemove(false)}
                      disabled={isRemoving}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.removeTrigger}
                  onClick={() => setConfirmingRemove(true)}
                >
                  <Trash2 aria-hidden="true" /> Remove from agency
                </button>
              )}
            </section>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default MemberDetailDrawer;
