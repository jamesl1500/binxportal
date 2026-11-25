/**
 * services-client.ts
 *
 * Client-safe slice of the services catalog: the shape, the pricing-type
 * labels, and how a service turns into a line item. Kept out of
 * `lib/services.ts` so Client Components (the catalog manager, the line-item
 * pickers) can import it without pulling in `next/headers` via `lib/auth.ts`.
 *
 * @module apps/binx-web/src/lib/services-client.ts
 * @author Binx Portal
 */
import type { Schemas } from "@/lib/api-types";

export type Service = Schemas["ServiceRead"];

/** Keep in sync with binx-api's services/models.py pricing_types. */
export const PRICING_TYPES = ["fixed", "hourly", "monthly"] as const;
export type PricingType = (typeof PRICING_TYPES)[number];

export const PRICING_TYPE_LABELS: Record<string, string> = {
  fixed: "Fixed price",
  hourly: "Hourly",
  monthly: "Monthly",
};

/** The short suffix after a price: "$150 / hr", "$2,000 / mo". */
export const PRICING_UNIT_SUFFIX: Record<string, string> = {
  fixed: "",
  hourly: " / hr",
  monthly: " / mo",
};

export function pricingTypeLabel(type: string): string {
  return PRICING_TYPE_LABELS[type] ?? type;
}

/** What a line-item editor fills in when a service is picked. Values are a
 * copy: later catalog edits never reach a saved document. */
export interface ServiceLineValues {
  serviceId: string;
  description: string;
  details: string;
  quantity: string;
  unitPrice: string; // dollars, as the editors' price inputs hold it
}

/** "1.00" -> "1", "2.50" -> "2.5" — how a person would type it. */
function quantityInput(quantity: string): string {
  const n = Number.parseFloat(quantity);
  return Number.isFinite(n) ? String(n) : "1";
}

export function lineValuesFromService(service: Service): ServiceLineValues {
  return {
    serviceId: service.id,
    description: service.name,
    details: service.description ?? "",
    quantity: quantityInput(service.default_quantity),
    unitPrice: (service.unit_price_cents / 100).toFixed(2),
  };
}
