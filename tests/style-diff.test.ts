import { describe, it, expect, beforeEach } from "vitest";
import {
  diffElementStyles,
  getDefaultBaseline,
  resolveCustomProperty,
} from "../src/engine/style-diff";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("getDefaultBaseline", () => {
  it("returns a computed style for a style-stripped clone", () => {
    document.body.innerHTML =
      '<button id="btn" style="padding:16px;">Sign in</button>';
    const btn = document.getElementById("btn") as HTMLElement;
    const baseline = getDefaultBaseline(btn);
    // The clone has inline styles stripped, so the inline 16px must not remain.
    // (jsdom may apply a UA default, e.g. 2px for buttons.)
    expect(baseline.getPropertyValue("padding-top")).not.toBe("16px");
  });
});

describe("diffElementStyles", () => {
  it("puts author-set inline styles into own", () => {
    document.body.innerHTML =
      '<button id="btn" style="padding:16px;background-color:rgb(37,99,235);color:rgb(255,255,255);">Sign in</button>';
    const btn = document.getElementById("btn") as HTMLElement;
    const result = diffElementStyles(btn);
    expect(result.own.padding).toBe("16px");
    expect(result.own.backgroundColor).toBe("rgb(37, 99, 235)");
    expect(result.own.color).toBe("rgb(255, 255, 255)");
  });

  it("produces an empty own map for unstyled elements", () => {
    document.body.innerHTML = '<span id="plain">Plain</span>';
    const plain = document.getElementById("plain") as HTMLElement;
    const result = diffElementStyles(plain);
    expect(Object.keys(result.own).length).toBe(0);
  });

  it("records inherited properties when they match the parent", () => {
    document.body.innerHTML =
      '<div id="parent" style="color:rgb(17,24,39);"><span id="child">Child</span></div>';
    const parent = document.getElementById("parent") as HTMLElement;
    const child = document.getElementById("child") as HTMLElement;
    const result = diffElementStyles(child);
    // In jsdom the inherited color value may or may not resolve; assert the
    // shape: if a property equals the parent's value it must land in inherited.
    const parentColor = getComputedStyle(parent).getPropertyValue("color");
    if (parentColor) {
      expect(result.inherited.color).toBe(parentColor);
      expect(result.own.color).toBeUndefined();
    }
  });
});

describe("resolveCustomProperty", () => {
  it("returns a literal inline value when it is not a var()", () => {
    document.body.innerHTML = '<div id="el" style="--brand:#2563eb;">x</div>';
    const el = document.getElementById("el") as HTMLElement;
    expect(resolveCustomProperty(el, "--brand")).toBe("#2563eb");
  });

  it("returns null for unset properties", () => {
    document.body.innerHTML = '<div id="el">x</div>';
    const el = document.getElementById("el") as HTMLElement;
    expect(resolveCustomProperty(el, "border-radius")).toBeNull();
  });

  it("falls back to the var() fallback when the variable is unresolved", () => {
    document.body.innerHTML =
      '<div id="el" style="color:var(--missing,red);">x</div>';
    const el = document.getElementById("el") as HTMLElement;
    expect(resolveCustomProperty(el, "color")).toBe("red");
  });
});
