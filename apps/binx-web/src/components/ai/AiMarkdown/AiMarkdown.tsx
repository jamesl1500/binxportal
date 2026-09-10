/**
 * AiMarkdown.tsx
 *
 * Renders a Claude response as formatted markdown (bold, bullet/numbered
 * lists, headings, links, ...) instead of raw ``**text**``/``- item``
 * syntax. Shared by AiBriefingCard and AiModal's assistant bubbles — every
 * AI feature that shows model-written prose rather than an editable draft
 * (the drafting cards use a plain `<textarea>` instead, since those are
 * meant to be copy/pasted as-is).
 *
 * @module apps/binx-web/src/components/ai/AiMarkdown/AiMarkdown.tsx
 * @author Binx.io
 */
"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./AiMarkdown.module.scss";

interface AiMarkdownProps {
  content: string;
  className?: string;
}

const AiMarkdown = ({ content, className }: AiMarkdownProps) => (
  <div className={className ? `${styles.markdown} ${className}` : styles.markdown}>
    <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
  </div>
);

export default AiMarkdown;
