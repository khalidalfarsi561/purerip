// Content-script inspector / picker.
//
// On activation (Alt+Shift+X, toolbar action, or a background message) it
// creates a closed-shadow highlight overlay, tracks the cursor, and on click
// runs the decompilation pipeline: sanitize → buildTree → style diff → state
// capture → compile → render in the HUD.

import { sanitizeAndClone, buildTree } from "../engine/dom-traversal";
import { captureInteractiveStates } from "../engine/state-recorder";
import { compile } from "../engine/react-compiler";
import type { CompiledComponent } from "../engine/types";
import { createOverlay, type OverlayController } from "./dom-overlay";
import { createHud, type HudController } from "./shadow-dom-ui";

let active = false;
let pipelineRunning = false;
let overlayHost: HTMLElement | null = null;
let overlay: OverlayController | null = null;
let hudHost: HTMLElement | null = null;
let hud: HudController | null = null;
let rafId = 0;

function ensureOverlay(): void {
  if (overlayHost) return;
  overlayHost = document.createElement("div");
  overlayHost.style.cssText =
    "position:fixed; inset:0; pointer-events:none; z-index:2147483646;";
  const shadow = overlayHost.attachShadow({ mode: "closed" });
  overlay = createOverlay(shadow);
  document.documentElement.appendChild(overlayHost);
}

function tagLabel(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const cls =
    typeof el.className === "string" && el.className.trim()
      ? el.className.trim().split(/\s+/)[0]
      : "";
  return cls ? `${tag}.${cls}` : tag;
}

function updateOverlay(x: number, y: number): void {
  const el = document.elementFromPoint(x, y);
  if (!el || !(el instanceof HTMLElement)) {
    overlay?.hide();
    return;
  }
  if (overlayHost && (el === overlayHost || overlayHost.contains(el))) return;
  if (hudHost && (el === hudHost || hudHost.contains(el))) return;
  const rect = el.getBoundingClientRect();
  overlay?.showAt(rect.left, rect.top, rect.width, rect.height, tagLabel(el));
}

function onMouseMove(e: MouseEvent): void {
  if (!active || pipelineRunning) return;
  if (rafId) return;
  const x = e.clientX;
  const y = e.clientY;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    updateOverlay(x, y);
  });
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    deactivatePicker();
    hud?.close();
    hud = null;
    if (hudHost) {
      hudHost.remove();
      hudHost = null;
    }
  }
}

function onClick(e: MouseEvent): void {
  if (!active || pipelineRunning) return;
  const target = e.target as Element | null;
  if (!target) return;
  if (overlayHost && (target === overlayHost || overlayHost.contains(target)))
    return;
  if (hudHost && (target === hudHost || hudHost.contains(target))) return;

  e.preventDefault();
  e.stopPropagation();
  void runPipeline(target as HTMLElement);
}

async function runPipeline(el: HTMLElement): Promise<void> {
  pipelineRunning = true;
  overlay?.hide();
  try {
    const cleaned = sanitizeAndClone(el);
    const tree = buildTree(cleaned);
    const extraction = await captureInteractiveStates(el);
    const compiled: CompiledComponent = compile(tree, extraction);
    showHud(compiled);
  } catch (err) {
    console.error("PureRip pipeline failed:", err);
  } finally {
    pipelineRunning = false;
  }
}

function showHud(compiled: CompiledComponent): void {
  if (!hudHost) {
    hudHost = document.createElement("div");
    hudHost.style.cssText =
      "position:fixed; inset:0; pointer-events:none; z-index:2147483647;";
    hud = createHud(hudHost);
  }
  if (!hudHost.isConnected) {
    document.documentElement.appendChild(hudHost);
  }
  hud?.render(compiled);
  // Stop the live picker — the HUD stays open and manages its own ESC.
  deactivatePicker();
}

/** Activate the element picker overlay. */
export function activatePicker(): void {
  if (active) return;
  active = true;
  ensureOverlay();
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeydown, true);
}

/** Deactivate the element picker and tear down the overlay. */
export function deactivatePicker(): void {
  if (!active) return;
  active = false;
  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("keydown", onKeydown, true);
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  overlay?.hide();
  if (overlayHost) {
    overlayHost.remove();
    overlayHost = null;
  }
  overlay = null;
}

// Register the background message handler exactly once per isolated world
// (guards against repeated content-script injection).
interface BootFlag {
  __pureripBooted?: boolean;
}
const g = globalThis as BootFlag;
if (!g.__pureripBooted) {
  g.__pureripBooted = true;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === "PURERIP_ACTIVATE") {
      activatePicker();
      sendResponse({ ok: true });
    }
    // Return true to keep the response channel open for async sendResponse.
    return true;
  });
}
