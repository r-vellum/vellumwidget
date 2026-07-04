// Headless behaviour test for the gloss runtime: load the built inst bundle into
// a jsdom DOM, drive it with a synthetic payload, simulate hover/click, and
// assert the resulting DOM state (tooltip text, highlight + selection classes).
// Run with: node tests/js/behavior.test.js
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const BUNDLE = path.join(__dirname, "..", "..", "inst", "htmlwidgets", "gloss.js");

let failures = 0;
function ok(cond, msg) {
  if (cond) {
    console.log("  ok  - " + msg);
  } else {
    failures++;
    console.log("  FAIL- " + msg);
  }
}

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  pretendToBeVisual: true
});
const { window } = dom;
global.window = window;
global.document = window.document;

// Capture the widget definition the bundle registers.
let widgetDef = null;
const HTMLWidgets = { widget: (def) => (widgetDef = def) };
window.HTMLWidgets = HTMLWidgets;

// Load the bundle with the browser globals it expects injected as locals (the
// bundle is a strict-mode IIFE referencing bare `HTMLWidgets`/`window`/`document`).
const code = fs.readFileSync(BUNDLE, "utf8");
new Function("HTMLWidgets", "window", "document", code)(HTMLWidgets, window, window.document);

ok(widgetDef && widgetDef.name === "gloss", "bundle registers the gloss widget");
ok(typeof widgetDef.factory === "function", "widget exposes a factory");

// Mount an instance.
const el = document.createElement("div");
document.body.appendChild(el);
const inst = widgetDef.factory(el, 400, 300);

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
  '<g data-vellum-panel="panel-1-1">' +
  '<path data-key="a" d="M10 10h5v5h-5z"/>' +
  '<path data-key="b" d="M40 10h5v5h-5z"/>' +
  '<path data-key="b" d="M40 10h5v5h-5z"/>' + // same datum drawn twice (fill+stroke)
  '<rect x="0" y="0" width="200" height="100" fill="none"/>' + // un-keyed decoration
  "</g></svg>";

inst.renderValue({
  svg: svg,
  elements: [
    { key: "a", tooltip: "Alpha", hover_group: "g1" },
    { key: "b", tooltip: "Beta", hover_group: "g1" }
  ],
  options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
});

const root = el;
const svgEl = el.querySelector("svg");
const aPaths = el.querySelectorAll('[data-key="a"]');
const bPaths = el.querySelectorAll('[data-key="b"]');
const tip = el.querySelector(".gloss-tip");

ok(!!svgEl, "svg mounted into the widget");
ok(document.getElementById("gloss-style") !== null, "namespaced <style> injected once");

function fire(type, target) {
  const ev = new window.MouseEvent(type, { bubbles: true, clientX: 20, clientY: 20 });
  Object.defineProperty(ev, "target", { value: target, enumerable: true });
  svgEl.dispatchEvent(ev);
}

// --- hover -> tooltip + highlight (hover_group links a and b) ---
fire("mousemove", aPaths[0]);
ok(tip.textContent === "Alpha", "hover shows the element's tooltip text");
ok(tip.classList.contains("gloss-show"), "tooltip becomes visible on hover");
ok(root.classList.contains("gloss-hovering"), "root enters hovering mode (dims others)");
ok(aPaths[0].classList.contains("gloss-hl"), "hovered element is highlighted");
ok(
  bPaths[0].classList.contains("gloss-hl") && bPaths[1].classList.contains("gloss-hl"),
  "all elements sharing the hover_group are highlighted"
);

// --- hover off -> clear ---
fire("mouseleave", svgEl);
ok(!tip.classList.contains("gloss-show"), "tooltip hides on mouseleave");
ok(!root.classList.contains("gloss-hovering"), "hovering mode cleared");
ok(el.querySelectorAll(".gloss-hl").length === 0, "highlight classes cleared");

// --- click -> select (both paths of the same key get selected) ---
fire("click", bPaths[0]);
ok(
  bPaths[0].classList.contains("gloss-selected") && bPaths[1].classList.contains("gloss-selected"),
  "click selects every element with the clicked key"
);
ok(!aPaths[0].classList.contains("gloss-selected"), "other keys are not selected");

// --- click again -> deselect (multiple mode toggles) ---
fire("click", bPaths[0]);
ok(el.querySelectorAll(".gloss-selected").length === 0, "clicking a selected element deselects it");

// --- tooltip falls back to the key when no tooltip text is provided ---
const el2 = document.createElement("div");
document.body.appendChild(el2);
const inst2 = widgetDef.factory(el2, 100, 100);
inst2.renderValue({
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><path data-key="k9" d="M1 1h2v2z"/></svg>',
  elements: [{ key: "k9" }],
  options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
});
const svg2 = el2.querySelector("svg");
const ev2 = new window.MouseEvent("mousemove", { bubbles: true });
Object.defineProperty(ev2, "target", { value: el2.querySelector('[data-key="k9"]') });
svg2.dispatchEvent(ev2);
ok(el2.querySelector(".gloss-tip").textContent === "k9", "tooltip defaults to the data key");

console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
