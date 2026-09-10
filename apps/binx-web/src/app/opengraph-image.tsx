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

import { SITE } from "@/lib/site";

export const alt = SITE.ogImageAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
          <div style={{ width: "44px", height: "44px", borderRadius: "8px", background: "#f5f5f6" }} />
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
          binx.io
        </div>
      </div>
    ),
    size,
  );
}
