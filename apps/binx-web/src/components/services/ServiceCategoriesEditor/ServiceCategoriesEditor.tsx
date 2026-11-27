/**
 * ServiceCategoriesEditor.tsx
 *
 * The catalog's categories ("Branding", "Web", "Retainers") for owners and
 * admins: add, rename (in place) and delete. Deleting one leaves its
 * services uncategorised.
 *
 * @module apps/binx-web/src/components/services/ServiceCategoriesEditor/ServiceCategoriesEditor.tsx
 * @author Binx Portal
 */
"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { ServiceCategory } from "@/lib/services-client";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
} from "@/app/(app)/settings/services/actions";

import styles from "./ServiceCategoriesEditor.module.scss";

interface ServiceCategoriesEditorProps {
  agencyId: string;
  categories: ServiceCategory[];
}

const ServiceCategoriesEditor = ({ agencyId, categories }: ServiceCategoriesEditorProps) => {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const result = await createCategoryAction(agencyId, name.trim());
      if (result.error) toast.error(result.error);
      else setName("");
    } finally {
      setBusy(false);
    }
  };

  const rename = async (category: ServiceCategory, next: string) => {
    if (!next.trim() || next.trim() === category.name) return;
    const result = await renameCategoryAction(agencyId, category.id, next.trim());
    if (result.error) toast.error(result.error);
  };

  const remove = async (category: ServiceCategory) => {
    const ok = await confirm({
      title: `Delete the ${category.name} category?`,
      description:
        category.service_count > 0
          ? `Its ${category.service_count} ${category.service_count === 1 ? "service stays" : "services stay"} in the catalog, without a category.`
          : "It has no services.",
      confirmLabel: "Delete category",
      tone: "danger",
    });
    if (!ok) return;
    const result = await deleteCategoryAction(agencyId, category.id);
    if (result.error) toast.error(result.error);
  };

  return (
    <section className={styles.editor} aria-labelledby="service-categories">
      {dialog}
      <h3 id="service-categories" className={styles.title}>
        Categories
      </h3>
      {categories.length > 0 && (
        <ul className={styles.list}>
          {categories.map((category) => (
            <li key={category.id} className={styles.item}>
              <input
                className={styles.name}
                defaultValue={category.name}
                maxLength={80}
                aria-label={`Rename ${category.name}`}
                onBlur={(event) => rename(category, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
              <span className={styles.count}>
                {category.service_count} {category.service_count === 1 ? "service" : "services"}
              </span>
              <button
                type="button"
                className={styles.delete}
                onClick={() => remove(category)}
                aria-label={`Delete ${category.name}`}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className={styles.addForm} onSubmit={add}>
        <input
          className={styles.name}
          placeholder="e.g. Branding"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          aria-label="New category"
        />
        <button type="submit" className={styles.addButton} disabled={!name.trim() || busy}>
          <Plus aria-hidden="true" /> Add category
        </button>
      </form>
    </section>
  );
};

export default ServiceCategoriesEditor;
