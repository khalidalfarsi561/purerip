// Highlight overlay helper.
//
// Builds the small closed-shadow overlay that draws a box around the currently
// hovered element. The overlay is `pointer-events: none`, so the page keeps
// receiving mouse events until the user clicks to pick an element.

export interface OverlayController {
  /** Position/size the highlight box and optionally show a label. */
  showAt(
    x: number,
    y: number,
    width: number,
    height: number,
    labelText?: string,
  ): void;
  /** Hide the highlight box. */
  hide(): void;
}

/**
 * Create a highlight overlay inside the given (closed) shadow root.
 * Only the overlay container is appended — the caller owns the shadow root.
 */
export function createOverlay(shadowRoot: ShadowRoot): OverlayController {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed; inset:0; pointer-events:none; z-index:999999;";

  const box = document.createElement("div");
  box.style.cssText = [
    "position:absolute;",
    "top:0;",
    "left:0;",
    "border:2px solid #6366f1;",
    "border-radius:3px;",
    "background:rgba(99,102,241,0.10);",
    "pointer-events:none;",
    "box-sizing:border-box;",
    "display:none;",
  ].join("");

  const label = document.createElement("div");
  label.style.cssText = [
    "position:absolute;",
    "top:0;",
    "left:0;",
    "background:#6366f1;",
    "color:#fff;",
    "font:600 11px/1 system-ui,sans-serif;",
    "padding:2px 6px;",
    "border-radius:3px;",
    "white-space:nowrap;",
    "pointer-events:none;",
    "display:none;",
    "z-index:1;",
  ].join("");

  host.appendChild(box);
  host.appendChild(label);
  shadowRoot.appendChild(host);

  return {
    showAt(x, y, width, height, labelText = "") {
      box.style.transform = `translate(${x}px, ${y}px)`;
      box.style.width = `${width}px`;
      box.style.height = `${height}px`;
      box.style.display = "block";

      label.style.transform = `translate(${x}px, ${Math.max(0, y - 22)}px)`;
      label.textContent = labelText;
      label.style.display = labelText ? "block" : "none";
    },
    hide() {
      box.style.display = "none";
      label.style.display = "none";
    },
  };
}
