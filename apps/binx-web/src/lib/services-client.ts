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
export type ServiceCategory = Schemas["ServiceCategoryRead"];
export type ServiceAttachment = Schemas["ServiceAttachmentRead"];

/** binx-api services/models.py MAX_SERVICE_ATTACHMENTS / SERVICE_ATTACHMENT_TYPES. */
export const MAX_SERVICE_ATTACHMENTS = 10;
export const SERVICE_ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";

/** A service's price as the catalog and pickers show it: "From $2,500.00 / mo". */
export function servicePriceLabel(
  service: Pick<Service, "unit_price_cents" | "pricing_type" | "is_starting_price">,
  format: (cents: number) => string,
): string {
  const price = `${format(service.unit_price_cents)}${PRICING_UNIT_SUFFIX[service.pricing_type] ?? ""}`;
  return service.is_starting_price ? `From ${price}` : price;
}

/** Where a service file is shown or downloaded from (the web app's proxy). */
export function serviceAttachmentHref(
  agencyId: string,
  serviceId: string,
  attachmentId: string,
  { inline = false }: { inline?: boolean } = {},
): string {
  return `/api/services/${agencyId}/${serviceId}/attachments/${attachmentId}${inline ? "?inline=1" : ""}`;
}

/** Services grouped by category, in category order, uncategorised last. */
export function groupServices<T extends Pick<Service, "category_id" | "category_name">>(
  services: T[],
  categories: Pick<ServiceCategory, "id" | "name">[],
): { id: string | null; name: string | null; services: T[] }[] {
  const groups = categories
    .map((category) => ({
      id: category.id as string | null,
      name: category.name as string | null,
      services: services.filter((s) => s.category_id === category.id),
    }))
    .filter((group) => group.services.length > 0);
  const known = new Set(categories.map((c) => c.id));
  const rest = services.filter((s) => !s.category_id || !known.has(s.category_id));
  if (rest.length > 0) groups.push({ id: null, name: null, services: rest });
  return groups;
}

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
  /** Monthly services become monthly lines on a proposal (a retainer);
   * invoice editors ignore it. */
  billing: "one_time" | "monthly";
  /** The service's price is where it starts: the editor nudges an adjustment. */
  startingPrice: boolean;
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
    billing: service.pricing_type === "monthly" ? "monthly" : "one_time",
    startingPrice: service.is_starting_price ?? false,
  };
}
