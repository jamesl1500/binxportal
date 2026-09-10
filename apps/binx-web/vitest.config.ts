import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: true,
    // Vitest owns `src/**/*.test.*`; the Playwright E2E specs under `e2e/` are
    // `*.spec.ts` and must not be picked up here.
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist", ".next", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      // Pragmatic target: cover the business logic (lib/*, stores, components
      // with real behaviour). Excluded below are the layers that unit tests
      // can't meaningfully exercise and that the Playwright E2E suite covers
      // for real: server-component pages/layouts, the `*-client.ts` browser
      // WebSocket glue, context providers, and design-system primitives.
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.{ts,tsx}",
        // Server-glue layers — thin orchestration over the `lib/*` functions
        // that are unit-tested here, and exercised for real by the Playwright
        // E2E suite (apps/binx-web/e2e). Not meaningfully unit-testable in
        // isolation; several keep a `*.test.ts` anyway as a regression net.
        "src/**/layout.tsx",
        "src/**/page.tsx",
        "src/**/loading.tsx",
        "src/**/not-found.tsx",
        "src/**/error.tsx",
        "src/**/template.tsx",
        "src/**/actions.ts",
        "src/app/**/route.ts",
        "src/proxy.ts",
        "src/middleware.ts",
        "src/app/**/opengraph-image.tsx",
        "src/app/**/twitter-image.tsx",
        "src/app/**/{robots,sitemap}.ts",
        // Browser-only transport / design-system primitives / context wiring.
        "src/lib/*-client.ts",
        "src/lib/api.ts",
        "src/components/ui/**",
        "src/components/**/*Provider*.tsx",
        "src/components/boards/BoardStage/**",
        "src/components/boards/BoardCanvas/**",
      ],
      // Statements / functions / lines are held at 80%. Branch coverage is
      // held a little lower: the remaining uncovered branches are mostly
      // defensive `?.` / `?? fallback` arms in presentational components that
      // the Playwright E2E suite exercises for real.
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
