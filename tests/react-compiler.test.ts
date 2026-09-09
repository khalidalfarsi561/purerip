import { describe, it, expect, beforeEach } from "vitest";
import {
  attrToJsx,
  isVoid,
  sanitizeJsxText,
  extractTextAndProps,
  compile,
  dedupeDirectionalClasses,
} from "../src/engine/react-compiler";
import type { ExtractionResult, NormalNode } from "../src/engine/types";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("attrToJsx", () => {
  it("maps HTML attributes to React JSX attribute names", () => {
    expect(attrToJsx("class")).toBe("className");
    expect(attrToJsx("for")).toBe("htmlFor");
    expect(attrToJsx("tabindex")).toBe("tabIndex");
    expect(attrToJsx("readonly")).toBe("readOnly");
    expect(attrToJsx("maxlength")).toBe("maxLength");
    expect(attrToJsx("colspan")).toBe("colSpan");
    expect(attrToJsx("contenteditable")).toBe("contentEditable");
    expect(attrToJsx("autocomplete")).toBe("autoComplete");
    expect(attrToJsx("srcset")).toBe("srcSet");
  });

  it("maps SVG attributes", () => {
    expect(attrToJsx("stroke-width")).toBe("strokeWidth");
    expect(attrToJsx("stroke-linecap")).toBe("strokeLinecap");
    expect(attrToJsx("stroke-linejoin")).toBe("strokeLinejoin");
    expect(attrToJsx("fill-rule")).toBe("fillRule");
    expect(attrToJsx("clip-rule")).toBe("clipRule");
    expect(attrToJsx("stroke-miterlimit")).toBe("strokeMiterlimit");
    expect(attrToJsx("xlink:href")).toBe("xlinkHref");
    expect(attrToJsx("viewBox")).toBe("viewBox");
  });
});

describe("isVoid", () => {
  it("recognizes void elements", () => {
    expect(isVoid("img")).toBe(true);
    expect(isVoid("input")).toBe(true);
    expect(isVoid("br")).toBe(true);
    expect(isVoid("hr")).toBe(true);
    expect(isVoid("div")).toBe(false);
    expect(isVoid("span")).toBe(false);
  });
});

describe("sanitizeJsxText", () => {
  it("escapes JSX-sensitive literal characters", () => {
    // Build the expected entity strings at runtime so the write layer never
    // decodes them as HTML entities in the source.
    const AMP = String.fromCharCode(38); // "&"
    expect(sanitizeJsxText("Hello {world} <tag>")).toBe(
      `Hello ${AMP}#123;world${AMP}#125; ${AMP}lt;tag>`,
    );
  });
});

describe("dedupeDirectionalClasses", () => {
  it("drops longhands that a shorthand already covers", () => {
    const classes = [
      "py-5",
      "px-2",
      "pb-5",
      "pl-2",
      "pr-2",
      "pt-5",
      "gap-5",
      "gap-x-5",
    ];
    expect(dedupeDirectionalClasses(classes)).toEqual([
      "py-5",
      "px-2",
      "gap-5",
    ]);
  });

  it("keeps a longhand that overrides a shorthand with a different value", () => {
    expect(dedupeDirectionalClasses(["p-4", "pt-6"])).toEqual(["p-4", "pt-6"]);
  });

  it("keeps unrelated utilities", () => {
    const classes = ["flex", "rounded-lg", "bg-blue-600"];
    expect(dedupeDirectionalClasses(classes)).toEqual(classes);
  });
});

describe("extractTextAndProps", () => {
  it("extracts button label and onClick", () => {
    const btn: NormalNode = {
      kind: "element",
      tag: "button",
      props: {},
      children: [
        {
          kind: "text",
          tag: "#text",
          props: {},
          children: [],
          text: "  Get Started  ",
        },
      ],
      styleNote: "interactive",
    };
    const result = extractTextAndProps(btn);
    expect(result.propName).toBe("label");
    expect(result.props.label).toBe("Get Started");
    expect(result.interactive).toBe(true);
    expect(result.jsx).toContain("{label}");
    expect(result.jsx).toContain("onClick={onClick}");
  });

  it("extracts heading title", () => {
    const h1: NormalNode = {
      kind: "element",
      tag: "h1",
      props: {},
      children: [
        {
          kind: "text",
          tag: "#text",
          props: {},
          children: [],
          text: "Welcome",
        },
      ],
    };
    const result = extractTextAndProps(h1);
    expect(result.propName).toBe("title");
    expect(result.props.title).toBe("Welcome");
    expect(result.interactive).toBe(false);
  });

  it("converts SVG attributes in the emitted JSX", () => {
    const svg: NormalNode = {
      kind: "element",
      tag: "svg",
      props: { viewBox: "0 0 24 24", "stroke-width": "2" },
      children: [],
    };
    const result = extractTextAndProps(svg);
    expect(result.jsx).toContain('viewBox="0 0 24 24"');
    expect(result.jsx).toContain('strokeWidth="2"');
  });

  it("renders void elements self-closing", () => {
    const container: NormalNode = {
      kind: "element",
      tag: "div",
      props: {},
      children: [
        { kind: "element", tag: "br", props: {}, children: [] },
        { kind: "element", tag: "img", props: { src: "x.png" }, children: [] },
      ],
    };
    const result = extractTextAndProps(container);
    expect(result.jsx).toContain("<br />");
    expect(result.jsx).toContain('<img src="x.png" />');
  });
});

describe("compile", () => {
  it("produces TSX, pure HTML and preview HTML for an interactive button", () => {
    document.body.innerHTML =
      '<button id="btn" style="padding:16px;background-color:rgb(37,99,235);">Sign in</button>';
    const btn = document.getElementById("btn") as HTMLElement;

    const tree: NormalNode = {
      kind: "element",
      tag: "button",
      props: {},
      children: [
        {
          kind: "text",
          tag: "#text",
          props: {},
          children: [],
          text: "Sign in",
        },
      ],
      styleNote: "interactive",
    };

    const extraction: ExtractionResult = {
      base: {
        element: btn,
        own: { padding: "16px", backgroundColor: "rgb(37,99,235)" },
        inherited: {},
      },
      variants: [],
      transition: undefined,
    };

    const compiled = compile(tree, extraction);

    // TSX output.
    expect(compiled.tsx).toContain("import React from 'react';");
    expect(compiled.tsx).toContain("export default function Component(");
    expect(compiled.tsx).toContain("export interface ComponentProps");
    expect(compiled.tsx).toContain("label?: string;");
    expect(compiled.tsx).toContain("onClick?: () => void;");
    expect(compiled.tsx).toContain('className="');
    expect(compiled.tsx).toContain("p-4");
    expect(compiled.tsx).toContain("bg-blue-600");
    expect(compiled.tsx).toContain("{label}");
    expect(compiled.tsx).toContain("onClick={onClick}");

    // Pure Tailwind HTML.
    expect(compiled.html).toContain("class=");
    expect(compiled.html).toContain("p-4");
    expect(compiled.html).toContain("bg-blue-600");
    expect(compiled.html).toContain("Sign in");

    // Preview HTML is sanitized markup for the preview tab.
    expect(typeof compiled.previewHtml).toBe("string");
    expect(compiled.previewHtml).toContain("Sign in");
  });

  it("strips original author classes and emits only quantized tokens", () => {
    document.body.innerHTML =
      '<button id="btn" style="padding:8px;">Continue</button>';
    const btn = document.getElementById("btn") as HTMLElement;

    const tree: NormalNode = {
      kind: "element",
      tag: "button",
      props: { class: "btn-primary" },
      children: [
        {
          kind: "text",
          tag: "#text",
          props: {},
          children: [],
          text: "Continue",
        },
      ],
      styleNote: "interactive",
    };

    const extraction: ExtractionResult = {
      base: {
        element: btn,
        own: { padding: "8px" },
        inherited: {},
      },
      variants: [],
      transition: undefined,
    };

    const compiled = compile(tree, extraction);
    expect(compiled.tsx).toContain("p-2");
    // Original author classes are stripped — only clean Tailwind tokens remain.
    expect(compiled.tsx).not.toContain("btn-primary");
    expect(compiled.tsx).toContain('className="p-2"');
  });

  it("recursively quantizes child elements and strips their raw author classes", () => {
    document.body.innerHTML = [
      '<div id="card" style="padding:20px;background-color:rgb(24,24,27);gap:20px;display:flex;">',
      '  <button class="btn" style="padding:16px;">Get Started</button>',
      '  <span class="label" style="font-size:14px;">Hello</span>',
      "</div>",
    ].join("");
    const card = document.getElementById("card") as HTMLElement;

    const tree: NormalNode = {
      kind: "element",
      tag: "div",
      props: {},
      children: [
        {
          kind: "element",
          tag: "button",
          props: { class: "btn" },
          children: [
            {
              kind: "text",
              tag: "#text",
              props: {},
              children: [],
              text: "Get Started",
            },
          ],
        },
        {
          kind: "element",
          tag: "span",
          props: { class: "label" },
          children: [
            {
              kind: "text",
              tag: "#text",
              props: {},
              children: [],
              text: "Hello",
            },
          ],
        },
      ],
    };

    const extraction: ExtractionResult = {
      base: {
        element: card,
        own: {
          padding: "20px",
          backgroundColor: "rgb(24,24,27)",
          gap: "20px",
          display: "flex",
        },
        inherited: {},
      },
      variants: [],
      transition: undefined,
    };

    const compiled = compile(tree, extraction);

    // Root styles quantized, shorthands deduped.
    expect(compiled.tsx).toContain("flex");
    expect(compiled.tsx).toContain("gap-5");
    expect(compiled.tsx).toContain("p-5");
    expect(compiled.tsx).toContain("bg-zinc-900");

    // Child button: original `btn` stripped, padding quantized to `p-4`.
    expect(compiled.tsx).toContain('className="p-4"');
    expect(compiled.tsx).not.toContain('className="btn"');

    // Child span: original `label` stripped, font-size quantized to `text-sm`.
    expect(compiled.tsx).toContain('className="text-sm"');
    expect(compiled.tsx).not.toContain('className="label"');
  });
});
