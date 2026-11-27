/**
 * ServicePicker.tsx
 *
 * "Add from services" for a line-item editor (proposals, invoices,
 * recurring schedules). Picking a service hands its values to the editor,
 * which fills its empty last line or adds a new one. The values are a copy:
 * the line can still be edited, and later catalog edits never reach it.
 *
 * A native <select> that snaps back to its placeholder after each pick,
 * so the same service can be added twice (e.g. two design sprints).
 * Renders nothing when the catalog is empty, except for a short hint
 * pointing at Settings → Services.
 *
 * @module apps/binx-web/src/components/services/ServicePicker/ServicePicker.tsx
 * @author Binx Portal
 */
"use client";

import Link from "next/link";

import { formatMoneyCents } from "@/lib/money";
import { PRICING_UNIT_SUFFIX, type Service } from "@/lib/services-client";

import styles from "./ServicePicker.module.scss";

interface ServicePickerProps {
  /** Active (non-archived) services. */
  services: Service[];
  currency: string;
  onPick: (service: Service) => void;
}

const ServicePicker = ({ services, currency, onPick }: ServicePickerProps) => {
  if (services.length === 0) {
    return (
      <p className={styles.hint}>
        Sell the same things often?{" "}
        <Link href="/settings/services">Set up your services</Link> to add them
        in one click.
      </p>
    );
  }

  return (
    <select
      className={styles.select}
      value=""
      aria-label="Add from services"
      onChange={(event) => {
        const picked = services.find((s) => s.id === event.target.value);
        if (picked) onPick(picked);
      }}
    >
      <option value="" disabled>
        + Add from services…
      </option>
      {services.map((service) => (
        <option key={service.id} value={service.id}>
          {service.name} ·{" "}
          {formatMoneyCents(service.unit_price_cents, currency)}
          {PRICING_UNIT_SUFFIX[service.pricing_type] ?? ""}
        </option>
      ))}
    </select>
  );
};

export default ServicePicker;
