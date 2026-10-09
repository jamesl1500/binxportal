/**
 * sentry-sdk-client.ts
 *
 * The only place the browser bundle touches `@sentry/nextjs`. Loaded with a
 * dynamic `import()` from lib/sentry-client.ts; naming the three functions
 * we use here (rather than importing the package namespace dynamically)
 * lets the bundler tree-shake the rest of the SDK out of that lazy chunk.
 *
 * @module apps/binx-web/src/lib/sentry-sdk-client.ts
 * @author Binx Portal
 */
export {
  captureException,
  captureRouterTransitionStart,
  init,
} from "@sentry/nextjs";
