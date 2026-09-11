/**
 * api-types.ts
 *
 * Thin alias over the generated OpenAPI schema (`api-schema.d.ts`, produced by
 * `pnpm gen:api` from `apps/binx-api/openapi.json`). The `lib/*` server
 * wrappers pull their request/response types from `Schemas[...]` so a field
 * rename on the API surfaces here as a compile error instead of a runtime bug.
 *
 * Regenerate after any API schema change:  pnpm --filter binx-web gen:api
 *
 * @module apps/binx-web/src/lib/api-types.ts
 */
import type { components, operations, paths } from "@/lib/api-schema";

/** Every Pydantic model the API exposes, keyed by its class name. */
export type Schemas = components["schemas"];

export type { operations, paths };
