import "@testing-library/jest-dom/vitest";

// jsdom implements neither the Pointer Capture API nor scrollIntoView; several
// components (the collaboration canvas especially) call them on pointer/effect
// paths. No-op them so those handlers can run under test.
if (typeof Element !== "undefined") {
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => {};
}
