/**
 * ServicesManager.tsx
 *
 * The services catalog on Settings → Services: what the agency sells, with
 * its pricing, that staff pick from when building proposals, invoices and
 * recurring schedules. Owners and admins add, edit, archive and delete;
 * everyone else sees a read-only list. Archived services are hidden behind
 * a toggle. They stay on documents that already used them but drop out of
 * the pickers.
 *
 * Editing a service never changes a saved document: line items copy the
 * name, description and price when the service is picked.
 *
 * @module apps/binx-web/src/components/services/ServicesManager/ServicesManager.tsx
 * @author Binx Portal
 */
"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatMoneyCents } from "@/lib/money";
import {
  PRICING_TYPES,
  PRICING_UNIT_SUFFIX,
  pricingTypeLabel,
  type Service,
} from "@/lib/services-client";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import {
  createServiceAction,
  deleteServiceAction,
  setServiceArchivedAction,
  updateServiceAction,
} from "@/app/(app)/settings/services/actions";

import styles from "./ServicesManager.module.scss";

interface ServicesManagerProps {
  agencyId: string;
  /** Every service, archived ones included. */
  services: Service[];
  currency: string;
  canManage: boolean;
}

interface Draft {
  name: string;
  description: string;
  pricingType: string;
  unitPrice: string; // dollars, as typed
  defaultQuantity: string;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  description: "",
  pricingType: "fixed",
  unitPrice: "",
  defaultQuantity: "1",
};

function draftFrom(service: Service): Draft {
  return {
    name: service.name,
    description: service.description ?? "",
    pricingType: service.pricing_type,
    unitPrice: (service.unit_price_cents / 100).toFixed(2),
    defaultQuantity: String(Number.parseFloat(service.default_quantity) || 1),
  };
}

function toCents(dollars: string): number {
  const n = Number.parseFloat(dollars);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

interface ServiceFormProps {
  initial: Draft;
  currency: string;
  submitLabel: string;
  onSubmit: (draft: Draft) => Promise<boolean>;
  onCancel: () => void;
}

const ServiceForm = ({
  initial,
  currency,
  submitLabel,
  onSubmit,
  onCancel,
}: ServiceFormProps) => {
  const [draft, setDraft] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const quantity = Number.parseFloat(draft.defaultQuantity);
  const canSubmit =
    draft.name.trim() !== "" &&
    draft.unitPrice.trim() !== "" &&
    toCents(draft.unitPrice) >= 0 &&
    Number.isFinite(quantity) &&
    quantity > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      await onSubmit(draft);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.formGrid}>
        <label className={`${styles.field} ${styles.nameField}`}>
          <span className={styles.label}>Name</span>
          <input
            className={styles.input}
            placeholder="e.g. Brand strategy"
            value={draft.name}
            maxLength={255}
            onChange={(event) => set({ name: event.target.value })}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Pricing</span>
          <select
            className={styles.input}
            value={draft.pricingType}
            onChange={(event) => set({ pricingType: event.target.value })}
          >
            {PRICING_TYPES.map((type) => (
              <option key={type} value={type}>
                {pricingTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Price ({currency})</span>
          <input
            className={styles.input}
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={draft.unitPrice}
            onChange={(event) => set({ unitPrice: event.target.value })}
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Default quantity</span>
          <input
            className={styles.input}
            type="number"
            min="0.01"
            step="0.01"
            value={draft.defaultQuantity}
            onChange={(event) => set({ defaultQuantity: event.target.value })}
          />
        </label>
      </div>
      <label className={styles.field}>
        <span className={styles.label}>Description</span>
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={4000}
          placeholder="What's included. Shown to the client under the line on a proposal."
          value={draft.description}
          onChange={(event) => set({ description: event.target.value })}
        />
      </label>
      <div className={styles.formActions}>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className={styles.primary}
          disabled={!canSubmit || saving}
        >
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
};

const ServicesManager = ({
  agencyId,
  services,
  currency,
  canManage,
}: ServicesManagerProps) => {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const active = services.filter((s) => !s.is_archived);
  const archived = services.filter((s) => s.is_archived);
  const visible = showArchived ? [...active, ...archived] : active;

  const toInput = (draft: Draft) => ({
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    pricingType: draft.pricingType,
    unitPriceCents: toCents(draft.unitPrice),
    defaultQuantity: String(Number.parseFloat(draft.defaultQuantity) || 1),
  });

  const handleCreate = async (draft: Draft) => {
    const result = await createServiceAction(agencyId, toInput(draft));
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    toast.success(`Added “${draft.name.trim()}”`);
    setAdding(false);
    return true;
  };

  const handleUpdate = async (serviceId: string, draft: Draft) => {
    const result = await updateServiceAction(
      agencyId,
      serviceId,
      toInput(draft),
    );
    if (result.error) {
      toast.error(result.error);
      return false;
    }
    setEditingId(null);
    return true;
  };

  const handleArchive = async (service: Service, archive: boolean) => {
    setBusyId(service.id);
    try {
      const result = await setServiceArchivedAction(
        agencyId,
        service.id,
        archive,
      );
      if (result.error) toast.error(result.error);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (service: Service) => {
    const ok = await confirm({
      title: `Delete “${service.name}”?`,
      description:
        "Proposals and invoices that already use it keep their lines as they are. To just hide it from the pickers, archive it instead.",
      confirmLabel: "Delete service",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(service.id);
    try {
      const result = await deleteServiceAction(agencyId, service.id);
      if (result.error) toast.error(result.error);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={styles.manager}>
      {dialog}

      {canManage && !adding && (
        <button
          type="button"
          className={styles.primary}
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
        >
          <Plus aria-hidden="true" /> Add service
        </button>
      )}

      {adding && (
        <div className={styles.formCard}>
          <ServiceForm
            initial={EMPTY_DRAFT}
            currency={currency}
            submitLabel="Add service"
            onSubmit={handleCreate}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {services.length === 0 ? (
        <p className={styles.empty}>
          {canManage
            ? "No services yet. Add what you sell once, then pick it when building a proposal or invoice."
            : "No services yet. An owner or admin can add them here."}
        </p>
      ) : (
        <ul className={styles.list}>
          {visible.map((service) =>
            editingId === service.id ? (
              <li key={service.id} className={styles.formCard}>
                <ServiceForm
                  initial={draftFrom(service)}
                  currency={currency}
                  submitLabel="Save changes"
                  onSubmit={(draft) => handleUpdate(service.id, draft)}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li
                key={service.id}
                className={styles.item}
                data-archived={service.is_archived || undefined}
              >
                <div className={styles.itemMain}>
                  <p className={styles.itemName}>
                    {service.name}
                    {service.is_archived && (
                      <span className={styles.archivedTag}>Archived</span>
                    )}
                  </p>
                  {service.description && (
                    <p className={styles.itemDescription}>
                      {service.description}
                    </p>
                  )}
                </div>
                <div className={styles.itemPrice}>
                  <span className={styles.price}>
                    {formatMoneyCents(service.unit_price_cents, currency)}
                    {PRICING_UNIT_SUFFIX[service.pricing_type] ?? ""}
                  </span>
                  <span className={styles.pricing}>
                    {pricingTypeLabel(service.pricing_type)}
                  </span>
                </div>
                {canManage && (
                  <div className={styles.itemActions}>
                    {!service.is_archived && (
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => {
                          setEditingId(service.id);
                          setAdding(false);
                        }}
                        aria-label={`Edit ${service.name}`}
                        title="Edit"
                      >
                        <Pencil aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.iconButton}
                      onClick={() =>
                        handleArchive(service, !service.is_archived)
                      }
                      disabled={busyId === service.id}
                      aria-label={
                        service.is_archived
                          ? `Restore ${service.name}`
                          : `Archive ${service.name}`
                      }
                      title={service.is_archived ? "Restore" : "Archive"}
                    >
                      {service.is_archived ? (
                        <ArchiveRestore aria-hidden="true" />
                      ) : (
                        <Archive aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.danger}`}
                      onClick={() => handleDelete(service)}
                      disabled={busyId === service.id}
                      aria-label={`Delete ${service.name}`}
                      title="Delete"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {archived.length > 0 && (
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived
            ? "Hide archived services"
            : `Show ${archived.length} archived ${archived.length === 1 ? "service" : "services"}`}
        </button>
      )}
    </div>
  );
};

export default ServicesManager;
