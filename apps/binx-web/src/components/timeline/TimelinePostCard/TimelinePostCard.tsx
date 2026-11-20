/**
 * TimelinePostCard.tsx
 *
 * One post on the team timeline: author, time and badges (announcement,
 * pinned, edited), the body with @mentions highlighted, the post's
 * reactions, and its comment thread. Authors can edit; authors and
 * owners/admins can delete; owners/admins can pin. Which controls show comes
 * from the `can_*` flags binx-api computes for the viewer — binx-api checks
 * every one again on the request.
 *
 * Every change goes through a server action that returns the updated post,
 * which is handed to `onChange` so the feed swaps it in place.
 *
 * @module apps/binx-web/src/components/timeline/TimelinePostCard/TimelinePostCard.tsx
 */
"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Megaphone, MessageSquare, Pin, SmilePlus, ThumbsUp } from "lucide-react";

import {
  createTimelineCommentAction,
  deleteTimelineCommentAction,
  deleteTimelinePostAction,
  loadTimelineCommentsAction,
  pinTimelinePostAction,
  reactToTimelinePostAction,
  updateTimelineCommentAction,
  updateTimelinePostAction,
} from "@/app/(app)/dashboard/timeline/actions";
import MessageAvatar from "@/components/messaging/MessageAvatar/MessageAvatar";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import MentionTextarea from "@/components/ui/MentionTextarea/MentionTextarea";
import TimelineTime from "@/components/timeline/TimelineTime/TimelineTime";
import {
  COMMENT_MAX_CHARS,
  POST_MAX_CHARS,
  REACTIONS,
  authorAvatarSrc,
  mentionSegments,
  reactionEmoji,
  type TimelineAuthor,
  type MentionableMember,
  type TimelineComment,
  type TimelinePost,
  type TimelineReactionKey,
} from "@/lib/timeline-client";

import styles from "./TimelinePostCard.module.scss";

interface TimelinePostCardProps {
  agencyId: string;
  post: TimelinePost;
  members: MentionableMember[];
  onChange: (post: TimelinePost) => void;
  onDelete: (postId: string) => void;
  highlighted?: boolean;
}

const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin" };

const Body = ({ text, handles }: { text: string; handles: ReadonlySet<string> }) => (
  <p className={styles.body}>
    {mentionSegments(text, handles).map((segment, index) =>
      segment.mention ? (
        <span key={index} className={styles.mention}>
          {segment.text}
        </span>
      ) : (
        segment.text
      ),
    )}
  </p>
);

const AuthorLine = ({ author, createdAt, editedAt }: { author: TimelineAuthor; createdAt: string; editedAt: string | null }) => (
  <div className={styles.authorLine}>
    <span className={styles.authorName}>{author.name}</span>
    {author.role && ROLE_LABELS[author.role] && <span className={styles.role}>{ROLE_LABELS[author.role]}</span>}
    <span className={styles.meta}>
      <TimelineTime iso={createdAt} />
      {editedAt && <span title="Edited"> · edited</span>}
    </span>
  </div>
);

const TimelinePostCard = ({ agencyId, post, members, onChange, onDelete, highlighted = false }: TimelinePostCardProps) => {
  const [isPending, startTransition] = useTransition();
  const { confirm, dialog } = useConfirmDialog();
  const handles = new Set(members.map((member) => member.user_name.toLowerCase()));

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body);
  const [pickerOpen, setPickerOpen] = useState(false);

  // null = only the post's latest few comments (from the feed) are shown.
  const [allComments, setAllComments] = useState<TimelineComment[] | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState("");
  const commentBoxRef = useRef<HTMLDivElement>(null);

  const comments = allComments ?? post.recent_comments;
  const hiddenCount = post.comment_count - comments.length;
  const liked = post.reactions.some((reaction) => reaction.reaction === "like" && reaction.reacted);

  const fail = (error: string) => {
    toast.error(error);
  };

  const savePost = () =>
    startTransition(async () => {
      const result = await updateTimelinePostAction(agencyId, post.id, draft);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      onChange(result.data);
      setEditing(false);
    });

  const removePost = async () => {
    const ok = await confirm({
      title: "Delete this post?",
      description: "It's removed from the timeline for everyone, with its comments and reactions.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteTimelinePostAction(agencyId, post.id);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      onDelete(post.id);
    });
  };

  const togglePin = () =>
    startTransition(async () => {
      const result = await pinTimelinePostAction(agencyId, post.id, !post.pinned);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      onChange(result.data);
    });

  const react = (reaction: TimelineReactionKey, on: boolean) =>
    startTransition(async () => {
      setPickerOpen(false);
      const result = await reactToTimelinePostAction(agencyId, post.id, reaction, on);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      onChange(result.data);
    });

  const showAllComments = () =>
    startTransition(async () => {
      const result = await loadTimelineCommentsAction(agencyId, post.id);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      setAllComments(result.data);
    });

  const addComment = () => {
    if (!commentDraft.trim()) return;
    startTransition(async () => {
      const result = await createTimelineCommentAction(agencyId, post.id, commentDraft);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      setCommentDraft("");
      onChange(result.data.post);
      if (allComments) setAllComments([...allComments, result.data.comment]);
    });
  };

  const saveComment = (commentId: string) =>
    startTransition(async () => {
      const result = await updateTimelineCommentAction(agencyId, commentId, commentEditDraft);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      const swap = (list: TimelineComment[]) => list.map((c) => (c.id === commentId ? result.data : c));
      if (allComments) setAllComments(swap(allComments));
      onChange({ ...post, recent_comments: swap(post.recent_comments) });
      setEditingCommentId(null);
    });

  const removeComment = async (commentId: string) => {
    const ok = await confirm({ title: "Delete this comment?", confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteTimelineCommentAction(agencyId, post.id, commentId);
      if (!result.ok) {
        fail(result.error);
        return;
      }
      if (allComments) setAllComments(allComments.filter((c) => c.id !== commentId));
      onChange(result.data);
    });
  };

  return (
    <article
      id={`post-${post.id}`}
      className={styles.card}
      data-announcement={post.is_announcement}
      data-highlighted={highlighted}
      aria-busy={isPending}
    >
      {dialog}
      <header className={styles.header}>
        <MessageAvatar name={post.author.name} src={authorAvatarSrc(agencyId, post.author)} />
        <div className={styles.headerText}>
          <AuthorLine author={post.author} createdAt={post.created_at} editedAt={post.edited_at} />
          {(post.is_announcement || post.pinned) && (
            <div className={styles.badges}>
              {post.is_announcement && (
                <span className={styles.badge} data-kind="announcement">
                  <Megaphone aria-hidden="true" /> Announcement
                </span>
              )}
              {post.pinned && (
                <span className={styles.badge}>
                  <Pin aria-hidden="true" /> Pinned
                </span>
              )}
            </div>
          )}
        </div>
        <div className={styles.tools}>
          {post.can_edit && !editing && (
            <button type="button" className={styles.textButton} onClick={() => { setDraft(post.body); setEditing(true); }}>
              Edit
            </button>
          )}
          {post.can_pin && (
            <button type="button" className={styles.textButton} onClick={togglePin} disabled={isPending}>
              {post.pinned ? "Unpin" : "Pin"}
            </button>
          )}
          {post.can_delete && (
            <button type="button" className={styles.textButton} data-tone="danger" onClick={removePost} disabled={isPending}>
              Delete
            </button>
          )}
        </div>
      </header>

      {editing ? (
        <div className={styles.editor}>
          <MentionTextarea
            value={draft}
            onChange={setDraft}
            members={members}
            onSubmit={savePost}
            maxLength={POST_MAX_CHARS}
            ariaLabel="Edit your post"
            autoFocus
            minRows={3}
          />
          <div className={styles.editorActions}>
            <button type="button" className={styles.secondary} onClick={() => setEditing(false)} disabled={isPending}>
              Cancel
            </button>
            <button type="button" className={styles.primary} onClick={savePost} disabled={isPending || !draft.trim()}>
              Save
            </button>
          </div>
        </div>
      ) : (
        <Body text={post.body} handles={handles} />
      )}

      {post.reactions.length > 0 && (
        <ul className={styles.reactionSummary} aria-label="Reactions">
          {post.reactions.map((reaction) => (
            <li key={reaction.reaction}>
              <button
                type="button"
                className={styles.reactionChip}
                aria-pressed={reaction.reacted}
                title={reaction.names.join(", ")}
                onClick={() => react(reaction.reaction, !reaction.reacted)}
                disabled={isPending}
              >
                <span aria-hidden="true">{reactionEmoji(reaction.reaction)}</span>
                <span>{reaction.count}</span>
                <span className={styles.srOnly}>
                  {REACTIONS.find((r) => r.key === reaction.reaction)?.label} — {reaction.reacted ? "remove yours" : "add yours"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.actionBar}>
        <button type="button" className={styles.action} aria-pressed={liked} onClick={() => react("like", !liked)} disabled={isPending}>
          <ThumbsUp aria-hidden="true" /> Like
        </button>
        <div className={styles.pickerWrap}>
          <button
            type="button"
            className={styles.action}
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
            disabled={isPending}
          >
            <SmilePlus aria-hidden="true" /> React
          </button>
          {pickerOpen && (
            <div className={styles.picker} role="group" aria-label="Pick a reaction">
              {REACTIONS.map((option) => {
                const mine = post.reactions.some((r) => r.reaction === option.key && r.reacted);
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={styles.pickerOption}
                    aria-pressed={mine}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => react(option.key, !mine)}
                  >
                    {option.emoji}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button
          type="button"
          className={styles.action}
          onClick={() => commentBoxRef.current?.querySelector("textarea")?.focus()}
        >
          <MessageSquare aria-hidden="true" /> Comment
          {post.comment_count > 0 && <span className={styles.count}>{post.comment_count}</span>}
        </button>
      </div>

      <section className={styles.comments} aria-label="Comments">
        {hiddenCount > 0 && (
          <button type="button" className={styles.textButton} onClick={showAllComments} disabled={isPending}>
            View {hiddenCount === 1 ? "1 earlier comment" : `${hiddenCount} earlier comments`}
          </button>
        )}
        {comments.length > 0 && (
          <ul className={styles.commentList}>
            {comments.map((comment) => (
              <li key={comment.id} className={styles.comment}>
                <MessageAvatar name={comment.author.name} src={authorAvatarSrc(agencyId, comment.author)} size="sm" />
                <div className={styles.commentBubble}>
                  <AuthorLine author={comment.author} createdAt={comment.created_at} editedAt={comment.edited_at} />
                  {editingCommentId === comment.id ? (
                    <div className={styles.editor}>
                      <MentionTextarea
                        value={commentEditDraft}
                        onChange={setCommentEditDraft}
                        members={members}
                        onSubmit={() => saveComment(comment.id)}
                        maxLength={COMMENT_MAX_CHARS}
                        ariaLabel="Edit your comment"
                        autoFocus
                      />
                      <div className={styles.editorActions}>
                        <button type="button" className={styles.secondary} onClick={() => setEditingCommentId(null)}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={styles.primary}
                          onClick={() => saveComment(comment.id)}
                          disabled={isPending || !commentEditDraft.trim()}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Body text={comment.body} handles={handles} />
                  )}
                  {editingCommentId !== comment.id && (comment.can_edit || comment.can_delete) && (
                    <div className={styles.commentTools}>
                      {comment.can_edit && (
                        <button
                          type="button"
                          className={styles.textButton}
                          onClick={() => {
                            setCommentEditDraft(comment.body);
                            setEditingCommentId(comment.id);
                          }}
                        >
                          Edit
                        </button>
                      )}
                      {comment.can_delete && (
                        <button
                          type="button"
                          className={styles.textButton}
                          data-tone="danger"
                          onClick={() => removeComment(comment.id)}
                          disabled={isPending}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.commentComposer} ref={commentBoxRef}>
          <MentionTextarea
            value={commentDraft}
            onChange={setCommentDraft}
            members={members}
            onSubmit={addComment}
            placeholder="Write a comment… (@ to mention)"
            maxLength={COMMENT_MAX_CHARS}
            ariaLabel={`Comment on ${post.author.name}'s post`}
            minRows={1}
          />
          <button
            type="button"
            className={styles.primary}
            onClick={addComment}
            disabled={isPending || !commentDraft.trim()}
          >
            Reply
          </button>
        </div>
      </section>
    </article>
  );
};

export default TimelinePostCard;
