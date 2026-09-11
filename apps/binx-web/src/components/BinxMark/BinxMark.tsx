/**
 * BinxMark.tsx
 *
 * The "B" brand mark, inline — not `next/image`/`<img>`, because the glyph
 * fills with `currentColor` so it always matches the surrounding text color
 * (works unstyled in both themes, in an ink-on-cream header and a
 * cream-on-ink one alike). An `<img src="/binx-mark-mono.svg">` can't do
 * that — an externally-loaded SVG doesn't inherit CSS from the page that
 * embeds it. Source: public/binx-mark-mono.svg.
 *
 * @module apps/binx-web/src/components/BinxMark/BinxMark.tsx
 * @author Binx.io
 */
interface BinxMarkProps {
  className?: string;
}

const BinxMark = ({ className }: BinxMarkProps) => (
  <svg viewBox="0 0 512 512" role="img" aria-label="Binx" className={className}>
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M 139.72 114.64 H 276.52 A 66.12 66.12 0 0 1 276.52 246.88 H 139.72 Z M 139.72 246.88 H 297.04 A 75.24 75.24 0 0 1 297.04 397.36 H 139.72 Z M 198.45 173.37 H 261.84 A 22.07 22.07 0 0 1 261.84 217.51 H 198.45 Z M 198.45 276.25 H 282.36 A 31.19 31.19 0 0 1 282.36 338.63 H 198.45 Z"
    />
  </svg>
);

export default BinxMark;
