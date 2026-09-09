// Closed-Shadow HUD UI.
//
// Renders the decompilation result in a self-contained modal built inside a
// closed shadow root, so page CSS/JS cannot leak in and extension styles cannot
// be overridden by the page. Tabs: Preview (sandboxed iframe), React TSX,
// Tailwind HTML. Includes copy, ESC-to-close, click-outside-to-close, and a
// drag handle.

import type { CompiledComponent } from "../engine/types";
import { COLOR_PALETTE, SPACING_SCALE } from "../engine/tailwind-quantizer";

function rgbToHex(rgb: [number, number, number]): string {
  return (
    "#" +
    rgb
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
      .toLowerCase()
  );
}

/**
 * Build a compact, offline stylesheet that approximates the Tailwind utilities
 * the compiler most often emits, so the static preview renders without pulling
 * the real Tailwind CDN.
 */
export function buildPreviewCss(): string {
  const rules: string[] = [];

  // Reset.
  rules.push(
    "*,::before,::after{box-sizing:border-box;border:0 solid #e5e7eb}",
  );
  rules.push("body{font-family:system-ui,sans-serif}");

  // Spacing / sizing.
  for (const [key, px] of SPACING_SCALE) {
    rules.push(
      `.p-${key}{padding:${px}px}`,
      `.px-${key}{padding-left:${px}px;padding-right:${px}px}`,
      `.py-${key}{padding-top:${px}px;padding-bottom:${px}px}`,
      `.pt-${key}{padding-top:${px}px}`,
      `.pr-${key}{padding-right:${px}px}`,
      `.pb-${key}{padding-bottom:${px}px}`,
      `.pl-${key}{padding-left:${px}px}`,
      `.m-${key}{margin:${px}px}`,
      `.mx-${key}{margin-left:${px}px;margin-right:${px}px}`,
      `.my-${key}{margin-top:${px}px;margin-bottom:${px}px}`,
      `.mt-${key}{margin-top:${px}px}`,
      `.mr-${key}{margin-right:${px}px}`,
      `.mb-${key}{margin-bottom:${px}px}`,
      `.ml-${key}{margin-left:${px}px}`,
      `.gap-${key}{gap:${px}px}`,
      `.gap-x-${key}{column-gap:${px}px}`,
      `.gap-y-${key}{row-gap:${px}px}`,
      `.w-${key}{width:${px}px}`,
      `.h-${key}{height:${px}px}`,
      `.min-w-${key}{min-width:${px}px}`,
      `.min-h-${key}{min-height:${px}px}`,
      `.max-w-${key}{max-width:${px}px}`,
      `.max-h-${key}{max-height:${px}px}`,
      `.inset-${key}{inset:${px}px}`,
      `.inset-x-${key}{left:${px}px;right:${px}px}`,
      `.inset-y-${key}{top:${px}px;bottom:${px}px}`,
      `.top-${key}{top:${px}px}`,
      `.right-${key}{right:${px}px}`,
      `.bottom-${key}{bottom:${px}px}`,
      `.left-${key}{left:${px}px}`,
    );
  }

  // Colors.
  for (const { name, rgb } of COLOR_PALETTE) {
    const hex = rgbToHex(rgb);
    rules.push(
      `.bg-${name}{background-color:${hex}}`,
      `.text-${name}{color:${hex}}`,
      `.border-${name}{border-color:${hex}}`,
      `.ring-${name}{--tw-ring-color:${hex}}`,
      `.hover\\:bg-${name}:hover{background-color:${hex}}`,
      `.hover\\:text-${name}:hover{color:${hex}}`,
      `.hover\\:border-${name}:hover{border-color:${hex}}`,
      `.active\\:bg-${name}:active{background-color:${hex}}`,
      `.active\\:text-${name}:active{color:${hex}}`,
      `.focus\\:bg-${name}:focus{background-color:${hex}}`,
      `.focus\\:text-${name}:focus{color:${hex}}`,
    );
  }
  rules.push(".bg-transparent{background-color:transparent}");
  rules.push(".text-transparent{color:transparent}");

  // Border widths.
  rules.push(
    ".border{border-width:1px}",
    ".border-0{border-width:0}",
    ".border-2{border-width:2px}",
    ".border-4{border-width:4px}",
    ".border-8{border-width:8px}",
    ".border-t{border-top-width:1px}",
    ".border-r{border-right-width:1px}",
    ".border-b{border-bottom-width:1px}",
    ".border-l{border-left-width:1px}",
    ".border-t-2{border-top-width:2px}",
    ".border-r-2{border-right-width:2px}",
    ".border-b-2{border-bottom-width:2px}",
    ".border-l-2{border-left-width:2px}",
  );

  // Typography.
  const FONT_SIZES: Array<[string, number]> = [
    ["xs", 12],
    ["sm", 14],
    ["base", 16],
    ["lg", 18],
    ["xl", 20],
    ["2xl", 24],
    ["3xl", 30],
    ["4xl", 36],
    ["5xl", 48],
    ["6xl", 60],
    ["7xl", 72],
    ["8xl", 96],
    ["9xl", 128],
  ];
  for (const [name, px] of FONT_SIZES) {
    rules.push(`.text-${name}{font-size:${px}px;line-height:1}`);
  }
  const FONT_WEIGHTS: Array<[string, number]> = [
    ["thin", 100],
    ["extralight", 200],
    ["light", 300],
    ["normal", 400],
    ["medium", 500],
    ["semibold", 600],
    ["bold", 700],
    ["extrabold", 800],
    ["black", 900],
  ];
  for (const [name, w] of FONT_WEIGHTS) {
    rules.push(`.font-${name}{font-weight:${w}}`);
  }
  rules.push(
    ".italic{font-style:italic}",
    ".uppercase{text-transform:uppercase}",
    ".lowercase{text-transform:lowercase}",
    ".capitalize{text-transform:capitalize}",
    ".tracking-tight{letter-spacing:-0.025em}",
    ".tracking-tighter{letter-spacing:-0.05em}",
    ".tracking-normal{letter-spacing:0}",
    ".tracking-wide{letter-spacing:0.025em}",
    ".tracking-wider{letter-spacing:0.05em}",
    ".tracking-widest{letter-spacing:0.1em}",
    ".leading-none{line-height:1}",
    ".leading-tight{line-height:1.25}",
    ".leading-snug{line-height:1.375}",
    ".leading-normal{line-height:1.5}",
    ".leading-relaxed{line-height:1.625}",
    ".leading-loose{line-height:2}",
  );

  // Radius / shadow.
  const RADII: Array<[string, number]> = [
    ["sm", 2],
    ["", 4],
    ["md", 6],
    ["lg", 8],
    ["xl", 12],
    ["2xl", 16],
    ["3xl", 24],
  ];
  for (const [name, px] of RADII) {
    rules.push(`.rounded${name ? "-" + name : ""}{border-radius:${px}px}`);
  }
  rules.push(".rounded-full{border-radius:9999px}");
  rules.push(".rounded-none{border-radius:0}");

  const SHADOWS: Array<[string, string]> = [
    ["sm", "0 1px 2px 0 rgb(0 0 0 / 0.05)"],
    ["", "0 1px 3px 0 rgb(0 0 0 / 0.1),0 1px 2px -1px rgb(0 0 0 / 0.1)"],
    ["md", "0 4px 6px -1px rgb(0 0 0 / 0.1),0 2px 4px -2px rgb(0 0 0 / 0.1)"],
    ["lg", "0 10px 15px -3px rgb(0 0 0 / 0.1),0 4px 6px -4px rgb(0 0 0 / 0.1)"],
    [
      "xl",
      "0 20px 25px -5px rgb(0 0 0 / 0.1),0 8px 10px -6px rgb(0 0 0 / 0.1)",
    ],
    ["2xl", "0 25px 50px -12px rgb(0 0 0 / 0.25)"],
  ];
  for (const [name, value] of SHADOWS) {
    rules.push(`.shadow${name ? "-" + name : ""}{box-shadow:${value}}`);
  }

  // Display / layout.
  const DISPLAY: Array<[string, string]> = [
    ["block", "block"],
    ["inline-block", "inline-block"],
    ["inline", "inline"],
    ["flex", "flex"],
    ["inline-flex", "inline-flex"],
    ["grid", "grid"],
    ["inline-grid", "inline-grid"],
    ["hidden", "none"],
    ["contents", "contents"],
    ["flow-root", "flow-root"],
  ];
  for (const [cls, val] of DISPLAY) {
    rules.push(`.${cls}{display:${val}}`);
  }
  rules.push(
    ".flex-row{flex-direction:row}",
    ".flex-col{flex-direction:column}",
    ".items-start{align-items:flex-start}",
    ".items-center{align-items:center}",
    ".items-end{align-items:flex-end}",
    ".justify-start{justify-content:flex-start}",
    ".justify-center{justify-content:center}",
    ".justify-end{justify-content:flex-end}",
    ".justify-between{justify-content:space-between}",
    ".justify-around{justify-content:space-around}",
    ".justify-evenly{justify-content:space-evenly}",
    ".relative{position:relative}",
    ".absolute{position:absolute}",
    ".fixed{position:fixed}",
    ".sticky{position:sticky}",
    ".static{position:static}",
  );

  // Overflow / whitespace / cursor.
  rules.push(
    ".overflow-hidden{overflow:hidden}",
    ".overflow-auto{overflow:auto}",
    ".overflow-scroll{overflow:scroll}",
    ".overflow-visible{overflow:visible}",
    ".whitespace-nowrap{white-space:nowrap}",
    ".whitespace-pre{white-space:pre}",
    ".whitespace-pre-wrap{white-space:pre-wrap}",
    ".cursor-pointer{cursor:pointer}",
    ".cursor-default{cursor:default}",
    ".cursor-text{cursor:text}",
  );

  // Opacity / z-index.
  for (let i = 0; i <= 100; i += 5) {
    rules.push(`.opacity-${i}{opacity:${i / 100}}`);
  }
  rules.push(
    ".z-10{z-index:10}",
    ".z-20{z-index:20}",
    ".z-30{z-index:30}",
    ".z-40{z-index:40}",
    ".z-50{z-index:50}",
  );

  // Transitions.
  rules.push(
    ".transition{transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms}",
    ".transition-all{transition-property:all;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms}",
    ".transition-colors{transition-property:color,background-color,border-color,text-decoration-color,fill,stroke;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms}",
    ".transition-transform{transition-property:transform;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms}",
    ".transition-opacity{transition-property:opacity;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms}",
    ".transition-shadow{transition-property:box-shadow;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms}",
    ".transition-filter{transition-property:filter;transition-timing-function:cubic-bezier(0.4,0,0.2,1);transition-duration:150ms}",
  );
  const DURATIONS: Array<[number, string]> = [
    [0, "0"],
    [75, "75"],
    [100, "100"],
    [150, "150"],
    [200, "200"],
    [300, "300"],
    [500, "500"],
    [700, "700"],
    [1000, "1000"],
  ];
  for (const [ms, suffix] of DURATIONS) {
    rules.push(`.duration-${suffix}{transition-duration:${ms}ms}`);
  }
  const EASES: Array<[string, string]> = [
    ["linear", "linear"],
    ["in", "cubic-bezier(0.4,0,1,1)"],
    ["out", "cubic-bezier(0,0,0.2,1)"],
    ["in-out", "cubic-bezier(0.4,0,0.2,1)"],
  ];
  for (const [name, value] of EASES) {
    rules.push(`.ease-${name}{transition-timing-function:${value}}`);
  }

  // Misc: box-sizing, vertical-align.
  rules.push(
    ".box-border{box-sizing:border-box}",
    ".box-content{box-sizing:content-box}",
  );
  rules.push(
    ".align-baseline{vertical-align:baseline}",
    ".align-top{vertical-align:top}",
    ".align-middle{vertical-align:middle}",
    ".align-bottom{vertical-align:bottom}",
  );

  return rules.join("\n");
}
// ---- HUD styling ------------------------------------------------------------

const HUD_CSS = `
.purerip-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 64px 24px;
  z-index: 2147483647;
}
.purerip-panel {
  width: min(720px, 92vw);
  max-height: 76vh;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: system-ui, sans-serif;
  pointer-events: auto;
  position: fixed;
  top: 10%;
  left: 50%;
  transform: translate(-50%, 0);
}
.purerip-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #1e293b;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid #334155;
}
.purerip-header:active { cursor: grabbing; }
.purerip-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #94a3b8;
}
.purerip-close {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.purerip-close:hover { background: #334155; color: #f1f5f9; }
.purerip-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px 0;
  background: #0f172a;
}
.purerip-tab {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
}
.purerip-tab:hover { color: #e2e8f0; background: #1e293b; }
.purerip-tab.active { color: #c7d2fe; background: #1e293b; }
.purerip-content {
  flex: 1;
  overflow: auto;
  background: #0f172a;
  padding: 12px;
  min-height: 260px;
  position: relative;
}
.purerip-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #e2e8f0;
}
.purerip-iframe {
  width: 100%;
  height: 100%;
  min-height: 320px;
  border: none;
  background: #fff;
  border-radius: 8px;
  display: block;
}
.purerip-copy {
  align-self: flex-end;
  margin: 0 12px 12px;
  background: #6366f1;
  color: #fff;
  border: none;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
}
.purerip-copy:hover { background: #4f46e5; }
.purerip-copy.copied { background: #059669; }
.purerip-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 12px;
}
.purerip-btn-group {
  display: flex;
  gap: 8px;
}
.purerip-btn-secondary {
  background: #334155;
  color: #cbd5e1;
  border: none;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
}
.purerip-btn-secondary:hover { background: #475569; color: #fff; }
.purerip-canvas-toggle {
  display: flex;
  gap: 4px;
  background: #1e293b;
  padding: 3px;
  border-radius: 6px;
}
.purerip-canvas-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.purerip-canvas-btn.active {
  background: #334155;
  color: #f8fafc;
}
/* ألوان تلوين الكود البرمجي */
.tok-kw { color: #c678dd; font-weight: 600; }
.tok-fn { color: #61afef; }
.tok-type { color: #e5c07b; }
.tok-str { color: #98c379; }
.tok-tag { color: #e06c75; }
.tok-attr { color: #d19a66; }
`;

function buildPreviewDoc(previewHtml: string): string {
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8" />',
    `<style>${buildPreviewCss()}</style>`,
    "</head>",
    `<body style="margin:8px;padding:8px">${previewHtml}</body>`,
    "</html>",
  ].join("");
}

export interface HudController {
  /** Render a compiled component into the HUD. */
  render(compiled: CompiledComponent): void;
  /** Close and remove the HUD. */
  close(): void;
}

function syntaxHighlightJsx(code: string): string {
  // Build entity strings at runtime so the write layer never decodes them.
  const AMP = String.fromCharCode(38); // "&"
  const ampEntity = `${AMP}amp;`; // "&"
  const ltEntity = `${AMP}lt;`; // "<"
  const gtEntity = `${AMP}gt;`; // ">"

  return code
    .replace(/&/g, ampEntity)
    .replace(/</g, ltEntity)
    .replace(/>/g, gtEntity)
    .replace(
      /\b(import|export|default|function|interface|return|from)\b/g,
      '<span class="tok-kw">$1</span>',
    )
    .replace(
      /\b(ComponentProps|Component)\b/g,
      '<span class="tok-fn">$1</span>',
    )
    .replace(
      /\b(string|boolean|number|void)\b/g,
      '<span class="tok-type">$1</span>',
    )
    .replace(
      new RegExp(`(${ltEntity}\\/?[a-zA-Z0-9_-]+)`, "g"),
      '<span class="tok-tag">$1</span>',
    )
    .replace(
      /\b([a-zA-Z-]+)=/g,
      '<span class="tok-attr">$1</span>=',
    )
    .replace(/(["'].*?["'])/g, '<span class="tok-str">$1</span>');
}

/**
 * Create a HUD controller attached to `host`. The host must be a fixed-position
 * element (created by the inspector) — a closed shadow root is attached here so
 * page styles cannot bleed in.
 */
export function createHud(host: Element): HudController {
  const shadow = host.attachShadow({ mode: "closed" });
  const styleEl = document.createElement("style");
  styleEl.textContent = HUD_CSS;
  shadow.appendChild(styleEl);

  const backdrop = document.createElement("div");
  backdrop.className = "purerip-backdrop";

  const panel = document.createElement("div");
  panel.className = "purerip-panel";

  const header = document.createElement("div");
  header.className = "purerip-header";

  const title = document.createElement("span");
  title.className = "purerip-title";
  title.textContent = "PureRip";

  const closeBtn = document.createElement("button");
  closeBtn.className = "purerip-close";
  closeBtn.textContent = "\u00D7";

  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  const tabsRow = document.createElement("div");
  tabsRow.className = "purerip-tabs";

  type TabKey = "preview" | "tsx" | "html";
  const tabDefs: Array<[TabKey, string]> = [
    ["preview", "Preview"],
    ["tsx", "React TSX"],
    ["html", "Tailwind HTML"],
  ];
  const tabs: Record<TabKey, HTMLButtonElement> = {
    preview: document.createElement("button"),
    tsx: document.createElement("button"),
    html: document.createElement("button"),
  };
  for (const [key, label] of tabDefs) {
    const btn = tabs[key];
    btn.className = "purerip-tab";
    btn.textContent = label;
    btn.addEventListener("click", () => setTab(key));
    tabsRow.appendChild(btn);
  }
  panel.appendChild(tabsRow);

  const content = document.createElement("div");
  content.className = "purerip-content";
  panel.appendChild(content);

  const actionsRow = document.createElement("div");
  actionsRow.className = "purerip-actions";

  // خيارات تبديل خلفية المعاينة
  const canvasToggle = document.createElement("div");
  canvasToggle.className = "purerip-canvas-toggle";
  const lightBtn = document.createElement("button");
  lightBtn.className = "purerip-canvas-btn active";
  lightBtn.textContent = "Light";
  const darkBtn = document.createElement("button");
  darkBtn.className = "purerip-canvas-btn";
  darkBtn.textContent = "Dark";
  canvasToggle.appendChild(lightBtn);
  canvasToggle.appendChild(darkBtn);

  const btnGroup = document.createElement("div");
  btnGroup.className = "purerip-btn-group";

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "purerip-btn-secondary";
  downloadBtn.textContent = "Download .tsx";

  const copyBtn = document.createElement("button");
  copyBtn.className = "purerip-copy";
  copyBtn.style.margin = "0";
  copyBtn.textContent = "Copy";

  btnGroup.appendChild(downloadBtn);
  btnGroup.appendChild(copyBtn);

  actionsRow.appendChild(canvasToggle);
  actionsRow.appendChild(btnGroup);
  panel.appendChild(actionsRow);

  backdrop.appendChild(panel);
  shadow.appendChild(backdrop);

  let activeTab: TabKey = "preview";
  let current: CompiledComponent | null = null;
  let previewIframe: HTMLIFrameElement | null = null;
  let tsxPre: HTMLPreElement | null = null;
  let htmlPre: HTMLPreElement | null = null;

  function setTab(tab: TabKey): void {
    activeTab = tab;
    for (const [key, btn] of Object.entries(tabs) as Array<
      [TabKey, HTMLButtonElement]
    >) {
      btn.classList.toggle("active", key === tab);
    }
    const views: Record<TabKey, HTMLElement | null> = {
      preview: previewIframe,
      tsx: tsxPre,
      html: htmlPre,
    };
    for (const [key, el] of Object.entries(views) as Array<
      [TabKey, HTMLElement | null]
    >) {
      if (el) el.style.display = key === tab ? "" : "none";
    }
  }

  function renderCompiled(compiled: CompiledComponent): void {
    current = compiled;
    content.innerHTML = "";

    previewIframe = document.createElement("iframe");
    previewIframe.className = "purerip-iframe";
    previewIframe.setAttribute("sandbox", "");
    previewIframe.srcdoc = buildPreviewDoc(compiled.previewHtml);

    tsxPre = document.createElement("pre");
    tsxPre.className = "purerip-pre";
    tsxPre.innerHTML = syntaxHighlightJsx(compiled.tsx);

    htmlPre = document.createElement("pre");
    htmlPre.className = "purerip-pre";
    htmlPre.innerHTML = syntaxHighlightJsx(compiled.html);

    content.appendChild(previewIframe);
    content.appendChild(tsxPre);
    content.appendChild(htmlPre);

    setTab(activeTab);
  }

  function close(): void {
    document.removeEventListener("keydown", onKeydown);
    host.remove();
  }

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKeydown);

  // Drag to reposition.
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let panelLeft = 0;
  let panelTop = 0;

  header.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    panelLeft = rect.left;
    panelTop = rect.top;
    panel.style.left = `${panelLeft}px`;
    panel.style.top = `${panelTop}px`;
    panel.style.transform = "none";
    startX = e.clientX;
    startY = e.clientY;
    dragging = true;

    const onMove = (ev: MouseEvent): void => {
      if (!dragging) return;
      panel.style.left = `${panelLeft + (ev.clientX - startX)}px`;
      panel.style.top = `${panelTop + (ev.clientY - startY)}px`;
    };
    const onUp = (): void => {
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  copyBtn.addEventListener("click", () => {
    if (!current) return;
    // Copy the source for the currently active tab: TSX for React, HTML for
    // pure Tailwind, and TSX as the default for the Preview tab.
    const copyText =
      activeTab === "html" ? current.html : current.tsx;
    navigator.clipboard
      .writeText(copyText)
      .then(() => {
        copyBtn.textContent = "Copied \u2713";
        copyBtn.classList.add("copied");
        setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyBtn.classList.remove("copied");
        }, 1500);
      })
      .catch(() => {
        copyBtn.textContent = "Copy failed";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1500);
      });
  });

  lightBtn.addEventListener("click", () => {
    lightBtn.classList.add("active");
    darkBtn.classList.remove("active");
    if (previewIframe) previewIframe.style.background = "#ffffff";
  });

  darkBtn.addEventListener("click", () => {
    darkBtn.classList.add("active");
    lightBtn.classList.remove("active");
    if (previewIframe) previewIframe.style.background = "#09090b";
  });

  downloadBtn.addEventListener("click", () => {
    if (!current) return;
    const blob = new Blob([current.tsx], {
      type: "text/typescript;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "DecompiledComponent.tsx";
    a.click();
    URL.revokeObjectURL(url);
  });

  const controller: HudController = {
    render(compiled: CompiledComponent): void {
      renderCompiled(compiled);
    },
    close,
  };

  return controller;
}
