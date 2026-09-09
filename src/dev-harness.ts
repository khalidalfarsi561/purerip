// Dev harness for manual engine testing.
//
// Runs the PureRip engine on the `#target` element and prints the compiled TSX
// into `#output`. Only used by the Vite dev server (`npm run dev`).

import { sanitizeAndClone, buildTree } from "./engine/dom-traversal";
import { captureInteractiveStates } from "./engine/state-recorder";
import { compile } from "./engine/react-compiler";

const target = document.getElementById("target") as HTMLElement | null;
const output = document.getElementById("output") as HTMLPreElement | null;

let running = false;

async function run(): Promise<void> {
  if (!target || !output || running) return;
  running = true;
  output.textContent = "Running...";
  try {
    const cleaned = sanitizeAndClone(target);
    const tree = buildTree(cleaned);
    const extraction = await captureInteractiveStates(target);
    const compiled = compile(tree, extraction);
    output.textContent = compiled.tsx;
    console.log("PureRip compiled:", compiled);
  } catch (err) {
    output.textContent = `Error: ${String(err)}`;
    console.error("PureRip harness error:", err);
  } finally {
    running = false;
  }
}

target?.addEventListener("click", () => {
  void run();
});
