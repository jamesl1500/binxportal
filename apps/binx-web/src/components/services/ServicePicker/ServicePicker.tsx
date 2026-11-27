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
 * pointing at Settings → Services. Services in categories are grouped under
 * them (alphabetically, uncategorised last); a starting price reads "From".
 *
 * @module apps/binx-web/src/components/services/ServicePicker/ServicePicker.tsx
 * @author Binx Portal
 */
"use client";

import Link from "next/link";

import { formatMoneyCents } from "@/lib/money";
import { type Service, servicePriceLabel } from "@/lib/services-client";

import styles from "./ServicePicker.module.scss";

interface ServicePickerProps {
  /** Active (non-archived) services. */
  services: Service[];
  currency: string;
  onPick: (service: Service) => void;
}

function byCategory(services: Service[]): { name: string | null; services: Service[] }[] {
  const names = [...new Set(services.map((s) => s.category_name).filter((n): n is string => Boolean(n)))].sort(
    (a, b) => a.localeCompare(b),
  );
  const groups = names.map((name) => ({ name, services: services.filter((s) => s.category_name === name) }));
  const rest = services.filter((s) => !s.category_name);
  return rest.length > 0 ? [...groups, { name: null, services: rest }] : groups;
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

  const money = (cents: number) => formatMoneyCents(cents, currency);
  const groups = byCategory(services).length;

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
      {byCategory(services).map((group) => {
        const options = group.services.map((service) => (
          <option key={service.id} value={service.id}>
            {service.name} · {servicePriceLabel(service, money)}
          </option>
        ));
        // Without categories there's nothing to group.
        return group.name || groups > 1 ? (
          <optgroup key={group.name ?? "none"} label={group.name ?? "Other"}>
            {options}
          </optgroup>
        ) : (
          options
        );
      })}
    </select>
  );
};

export default ServicePicker;
