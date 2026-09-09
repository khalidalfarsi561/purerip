import { describe, it, expect, beforeEach } from "vitest";
import { sanitizeAndClone, buildTree } from "../src/engine/dom-traversal";
import { captureInteractiveStates } from "../src/engine/state-recorder";
import { compile } from "../src/engine/react-compiler";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("end-to-end pipeline", () => {
  it("decompiles an inline-styled interactive button into TSX/HTML", async () => {
    document.body.innerHTML =
      '<button id="btn" class="cta" style="padding:16px;background-color:rgb(37,99,235);color:rgb(255,255,255);border-radius:8px;">Get Started</button>';
    const btn = document.getElementById("btn") as HTMLElement;

    const cleaned = sanitizeAndClone(btn);
    const tree = buildTree(cleaned);
    const extraction = await captureInteractiveStates(btn);
    const compiled = compile(tree, extraction);

    // The button label is extracted and wired to an onClick handler.
    expect(compiled.interactive).toBe(true);
    expect(compiled.props.label).toBe("Get Started");
    expect(compiled.tsx).toContain("label?: string;");
    expect(compiled.tsx).toContain("onClick?: () => void;");
    expect(compiled.tsx).toContain("{label}");
    expect(compiled.tsx).toContain("onClick={onClick}");

    // Inline styles are quantized into Tailwind classes. `rgb(255,255,255)`
    // (white) is not a Tailwind v3 named color, so it snaps to zinc-50.
    expect(compiled.tsx).toContain("p-4");
    expect(compiled.tsx).toContain("bg-blue-600");
    expect(compiled.tsx).toContain("text-zinc-50");
    expect(compiled.tsx).toContain("rounded-lg");

    // The root `id` is stripped by sanitization, and the redundant inline
    // `style` is dropped because every style quantized into a class.
    expect(compiled.tsx).not.toContain('id="btn"');
    expect(compiled.tsx).not.toContain("style={{");

    // Pure HTML output keeps the original class attribute and text.
    expect(compiled.html).toContain("class=");
    expect(compiled.html).toContain("cta");
    expect(compiled.html).toContain("Get Started");
  });

  it("returns a valid ExtractionResult with own-style mapping", async () => {
    document.body.innerHTML =
      '<button id="btn" style="padding:24px;background-color:rgb(59,130,246);">Click</button>';
    const btn = document.getElementById("btn") as HTMLElement;

    const extraction = await captureInteractiveStates(btn);

    expect(Array.isArray(extraction.variants)).toBe(true);
    expect(extraction.base.own.padding).toBe("24px");
    expect(extraction.base.own.backgroundColor).toBe("rgb(59, 130, 246)");
    expect(extraction.transition).toBeUndefined();
  });
});
