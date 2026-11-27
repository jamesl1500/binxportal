/**
 * ProposalTemplatesList.tsx
 *
 * The agency's proposal templates: what each holds (its proposal title,
 * packages, starting price and documents) and how often it's used, with
 * "Use" (a new proposal prefilled from it), "Edit" and "Delete".
 *
 * @module apps/binx-web/src/components/proposals/ProposalTemplatesList/ProposalTemplatesList.tsx
 * @author Binx Portal
 */
"use client";

import { useTransition } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import type { ProposalTemplateSummary } from "@/lib/proposal-templates";
import { formatMoneyCents } from "@/lib/money";
import { proposalPriceLabel } from "@/lib/proposals-client";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { deleteTemplateAction } from "@/app/(app)/proposals/templates/actions";

import styles from "./ProposalTemplatesList.module.scss";

interface ProposalTemplatesListProps {
  agencyId: string;
  templates: ProposalTemplateSummary[];
}

function usedLabel(template: ProposalTemplateSummary): string {
  if (template.use_count === 0 || !template.last_used_at) return "Not used yet";
  const last = new Date(template.last_used_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${template.use_count} ${template.use_count === 1 ? "proposal" : "proposals"}, last ${last}`;
}

const ProposalTemplatesList = ({ agencyId, templates }: ProposalTemplatesListProps) => {
  const [isPending, startTransition] = useTransition();
  const { confirm, dialog } = useConfirmDialog();

  const remove = async (template: ProposalTemplateSummary) => {
    const ok = await confirm({
      title: `Delete ${template.name}?`,
      description: "Proposals already made from it keep everything, including their documents.",
      confirmLabel: "Delete template",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteTemplateAction(agencyId, template.id);
      if (result.error) toast.error(result.error);
      else toast.success("Template deleted");
    });
  };

  if (templates.length === 0) {
    return (
      <div className={styles.empty}>
        <p>
          No templates yet. Save any proposal as a template from its page, or
          build one here, then start new proposals from it in a click.
        </p>
        <Link href="/proposals/templates/new" className={styles.primary}>
          New template
        </Link>
      </div>
    );
  }

  return (
    <>
      <ul className={styles.list}>
        {templates.map((template) => (
          <li key={template.id} className={styles.item}>
            <div className={styles.main}>
              <Link href={`/proposals/templates/${template.id}`} className={styles.name}>
                {template.name}
              </Link>
              {template.description && <p className={styles.description}>{template.description}</p>}
              <p className={styles.meta}>
                <span>{template.title}</span>
                <span>
                  {template.line_count} {template.line_count === 1 ? "line" : "lines"}
                </span>
                {template.package_names.length > 0 && (
                  <span>Packages: {template.package_names.join(", ")}</span>
                )}
                {template.attachment_count > 0 && (
                  <span className={styles.docs}>
                    <FileText aria-hidden="true" />
                    {template.attachment_count}
                  </span>
                )}
              </p>
              <p className={styles.used}>{usedLabel(template)}</p>
            </div>
            <div className={styles.side}>
              <span className={styles.price}>
                {proposalPriceLabel(template, (cents) => formatMoneyCents(cents, template.currency))}
              </span>
              <div className={styles.actions}>
                <Link
                  href={`/proposals/new?template=${template.id}`}
                  className={styles.primary}
                  aria-label={`Use ${template.name}`}
                >
                  Use
                </Link>
                <Link
                  href={`/proposals/templates/${template.id}`}
                  className={styles.ghost}
                  aria-label={`Edit ${template.name}`}
                >
                  Edit
                </Link>
                <button
                  type="button"
                  className={styles.ghostDanger}
                  disabled={isPending}
                  onClick={() => remove(template)}
                  aria-label={`Delete ${template.name}`}
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {dialog}
    </>
  );
};

export default ProposalTemplatesList;
