import { describe, it, expect, beforeEach } from "vitest";
import {
  sanitizeAndClone,
  buildTree,
  isVoidElement,
  elementMatchesInteractiveRoles,
} from "../src/engine/dom-traversal";
import type { NormalNode } from "../src/engine/types";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("isVoidElement", () => {
  it("recognizes HTML void elements", () => {
    expect(isVoidElement("img")).toBe(true);
    expect(isVoidElement("br")).toBe(true);
    expect(isVoidElement("input")).toBe(true);
    expect(isVoidElement("hr")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isVoidElement("IMG")).toBe(true);
    expect(isVoidElement("Br")).toBe(true);
  });

  it("returns false for non-void elements", () => {
    expect(isVoidElement("div")).toBe(false);
    expect(isVoidElement("span")).toBe(false);
    expect(isVoidElement("button")).toBe(false);
  });
});

describe("elementMatchesInteractiveRoles", () => {
  it("matches buttons, links with href, form controls", () => {
    const btn = document.createElement("button");
    expect(elementMatchesInteractiveRoles(btn)).toBe(true);

    const a = document.createElement("a");
    expect(elementMatchesInteractiveRoles(a)).toBe(false);
    a.setAttribute("href", "#");
    expect(elementMatchesInteractiveRoles(a)).toBe(true);

    const input = document.createElement("input");
    expect(elementMatchesInteractiveRoles(input)).toBe(true);

    const select = document.createElement("select");
    expect(elementMatchesInteractiveRoles(select)).toBe(true);
  });

  it("matches ARIA roles and contenteditable", () => {
    const div = document.createElement("div");
    div.setAttribute("role", "button");
    expect(elementMatchesInteractiveRoles(div)).toBe(true);

    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(elementMatchesInteractiveRoles(editable)).toBe(true);
  });
});

describe("sanitizeAndClone", () => {
  it("strips scripts, styles, comments and disallowed tags", () => {
    document.body.innerHTML = `
      <div id="root">
        <script>alert('x')</script>
        <style>.a { color: red; }</style>
        <noscript>no</noscript>
        <!-- comment -->
        <button>Sign in</button>
      </div>
    `;
    const root = document.getElementById("root") as HTMLElement;
    const cleaned = sanitizeAndClone(root);
    expect(cleaned.querySelector("script")).toBeNull();
    expect(cleaned.querySelector("style")).toBeNull();
    expect(cleaned.querySelector("noscript")).toBeNull();
    expect(cleaned.querySelector("button")).not.toBeNull();
    const hasComment = Array.from(cleaned.childNodes).some(
      (n) => n.nodeType === Node.COMMENT_NODE,
    );
    expect(hasComment).toBe(false);
  });

  it("strips inline handlers, ids and data-* attributes", () => {
    document.body.innerHTML = `
      <div id="root">
        <button onclick="evil()" id="btn" data-x="1" data-test="yes">Sign in</button>
      </div>
    `;
    const root = document.getElementById("root") as HTMLElement;
    const cleaned = sanitizeAndClone(root);
    const btn = cleaned.querySelector("button") as HTMLElement;
    expect(btn.hasAttribute("onclick")).toBe(false);
    expect(btn.hasAttribute("id")).toBe(false);
    expect(btn.hasAttribute("data-x")).toBe(false);
    expect(btn.hasAttribute("data-test")).toBe(false);
  });

  it("keeps tabindex on interactive elements but strips it otherwise", () => {
    document.body.innerHTML = `
      <div id="root">
        <button tabindex="0">Interactive</button>
        <span tabindex="0">Not interactive</span>
      </div>
    `;
    const root = document.getElementById("root") as HTMLElement;
    const cleaned = sanitizeAndClone(root);
    const btn = cleaned.querySelector("button") as HTMLElement;
    const span = cleaned.querySelector("span") as HTMLElement;
    expect(btn.getAttribute("tabindex")).toBe("0");
    expect(span.hasAttribute("tabindex")).toBe(false);
  });

  it("does not mutate the live element", () => {
    document.body.innerHTML = `
      <div id="root">
        <button onclick="evil()" id="btn">Sign in</button>
      </div>
    `;
    const root = document.getElementById("root") as HTMLElement;
    const btnLive = root.querySelector("button") as HTMLElement;
    sanitizeAndClone(root);
    expect(btnLive.hasAttribute("onclick")).toBe(true);
    expect(btnLive.hasAttribute("id")).toBe(true);
  });
});

describe("buildTree", () => {
  it("coalesces adjacent whitespace text nodes", () => {
    const el = document.createElement("div");
    el.innerHTML = "Hello   <span>World</span>   Again";
    const tree = buildTree(el);
    expect(tree.children.length).toBe(3);
    expect(tree.children[0].kind).toBe("text");
    expect(tree.children[0].text).toBe("Hello");
    expect(tree.children[1].tag).toBe("span");
    expect(tree.children[2].kind).toBe("text");
    expect(tree.children[2].text).toBe("Again");
  });

  it("caps the number of emitted nodes", () => {
    const el = document.createElement("div");
    for (let i = 0; i < 250; i++) {
      el.appendChild(document.createElement("span"));
    }
    const tree = buildTree(el, { maxNodes: 200 });
    // Root counts as one node; 199 children fit within the 200 cap.
    expect(tree.children.length).toBe(199);
  });

  it("caps the nesting depth", () => {
    let cur = document.createElement("div");
    const rootEl = cur;
    for (let i = 0; i < 20; i++) {
      const child = document.createElement("div");
      cur.appendChild(child);
      cur = child;
    }
    const tree = buildTree(rootEl, { maxDepth: 3 });
    const depthOfLeaf = (node: NormalNode, d: number): number =>
      node.children.length === 0 ? d : depthOfLeaf(node.children[0], d + 1);
    expect(depthOfLeaf(tree, 0)).toBe(3);
  });

  it("marks interactive elements with a styleNote", () => {
    const el = document.createElement("button");
    el.textContent = "Sign in";
    const tree = buildTree(el);
    expect(tree.styleNote).toBe("interactive");
  });
});
