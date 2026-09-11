/**
 * opengraph-image.tsx
 *
 * The default social share card for the whole site (marketing routes inherit
 * it; authenticated routes are noindex so it doesn't matter there). Rendered
 * with next/og — flexbox + the default font only, no network fonts, so it
 * builds anywhere.
 *
 * @module apps/binx-web/src/app/opengraph-image.tsx
 * @author Binx.io
 */
import { ImageResponse } from "next/og";

import { SITE, SITE_URL } from "@/lib/site";

export const alt = SITE.ogImageAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same mark as components/BinxMark/BinxMark.tsx (public/binx-mark-mono.svg),
// inlined here too — next/og's Satori renderer doesn't load external assets
// or resolve currentColor the way a browser does, so the fill is hardcoded
// to match this card's palette instead.
const BRAND_HOST = new URL(SITE_URL).host;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          background: "#0b0b0c",
          color: "#f5f5f6",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <svg width="44" height="44" viewBox="0 0 512 512">
            <path
              fill="#f5f5f6"
              fillRule="evenodd"
              d="M 139.72 114.64 H 276.52 A 66.12 66.12 0 0 1 276.52 246.88 H 139.72 Z M 139.72 246.88 H 297.04 A 75.24 75.24 0 0 1 297.04 397.36 H 139.72 Z M 198.45 173.37 H 261.84 A 22.07 22.07 0 0 1 261.84 217.51 H 198.45 Z M 198.45 276.25 H 282.36 A 31.19 31.19 0 0 1 282.36 338.63 H 198.45 Z"
            />
          </svg>
          <div style={{ fontSize: "34px", letterSpacing: "0.02em" }}>{SITE.name}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div style={{ fontSize: "72px", lineHeight: 1.05, maxWidth: "900px", letterSpacing: "-0.02em" }}>
            The operating system for creative agencies.
          </div>
          <div style={{ fontSize: "30px", color: "rgba(245,245,246,0.6)", maxWidth: "820px" }}>
            Leads, clients, projects, invoicing and a live client portal — in one calm workspace.
          </div>
        </div>

        <div
          style={{
            fontSize: "22px",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(245,245,246,0.5)",
          }}
        >
          {BRAND_HOST}
        </div>
      </div>
    ),
    size,
  );
}
