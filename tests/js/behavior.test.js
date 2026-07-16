// Headless behaviour test for the vellumwidget runtime: load the built inst bundle into
// a jsdom DOM, drive it with a synthetic payload, simulate hover/click, and
// assert the resulting DOM state (tooltip text, highlight + selection classes).
// Run with: node tests/js/behavior.test.js
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const BUNDLE = path.join(__dirname, "..", "..", "inst", "htmlwidgets", "vellumwidget.js");

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

ok(widgetDef && widgetDef.name === "vellumwidget", "bundle registers the vellumwidget widget");
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
const tip = el.querySelector(".vellumwidget-tip");

ok(!!svgEl, "svg mounted into the widget");
ok(document.getElementById("vellumwidget-style") !== null, "namespaced <style> injected once");

function fire(type, target) {
  const ev = new window.MouseEvent(type, { bubbles: true, clientX: 20, clientY: 20 });
  Object.defineProperty(ev, "target", { value: target, enumerable: true });
  svgEl.dispatchEvent(ev);
}

// --- hover -> tooltip + highlight (hover_group links a and b) ---
fire("pointermove", aPaths[0]);
ok(tip.textContent === "Alpha", "hover shows the element's tooltip text");
ok(tip.classList.contains("vellumwidget-show"), "tooltip becomes visible on hover");
ok(root.classList.contains("vellumwidget-hovering"), "root enters hovering mode (dims others)");
ok(aPaths[0].classList.contains("vellumwidget-hl"), "hovered element is highlighted");
ok(
  bPaths[0].classList.contains("vellumwidget-hl") && bPaths[1].classList.contains("vellumwidget-hl"),
  "all elements sharing the hover_group are highlighted"
);

// --- hover off -> clear ---
fire("pointerleave", svgEl);
ok(!tip.classList.contains("vellumwidget-show"), "tooltip hides on mouseleave");
ok(!root.classList.contains("vellumwidget-hovering"), "hovering mode cleared");
ok(el.querySelectorAll(".vellumwidget-hl").length === 0, "highlight classes cleared");

// --- click -> select. "a" and "b" share hover_group "g1", so a click projects
//     to the whole group (field projection): every path of both keys selects. ---
fire("click", bPaths[0]);
ok(
  bPaths[0].classList.contains("vellumwidget-selected") && bPaths[1].classList.contains("vellumwidget-selected"),
  "click selects every path of the clicked key"
);
ok(aPaths[0].classList.contains("vellumwidget-selected"), "click projects selection across the shared hover_group");

// --- click again -> deselect the whole projected group ---
fire("click", bPaths[0]);
ok(el.querySelectorAll(".vellumwidget-selected").length === 0, "clicking a selected element deselects the group");

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
const ev2 = new window.MouseEvent("pointermove", { bubbles: true });
Object.defineProperty(ev2, "target", { value: el2.querySelector('[data-key="k9"]') });
svg2.dispatchEvent(ev2);
ok(el2.querySelector(".vellumwidget-tip").textContent === "k9", "tooltip defaults to the data key");

// ===================== Phase 4: geometry helpers (pure) =====================
const T = window.__vellumwidgetTest;
ok(!!T, "pure geometry helpers exposed for testing");

ok(T.rectsIntersect({ x0: 0, y0: 0, x1: 2, y1: 2 }, { x0: 1, y0: 1, x1: 3, y1: 3 }), "rectsIntersect: overlap");
ok(!T.rectsIntersect({ x0: 0, y0: 0, x1: 1, y1: 1 }, { x0: 2, y0: 2, x1: 3, y1: 3 }), "rectsIntersect: disjoint");

const els = [
  { key: "a", x0: 0, y0: 0, x1: 10, y1: 10 },
  { key: "b", x0: 50, y0: 50, x1: 60, y1: 60 },
  { key: "c", x0: 5, y0: 5, x1: 15, y1: 15 }
];
ok(
  JSON.stringify(T.brushKeys(els, { x0: -1, y0: -1, x1: 12, y1: 12 }).sort()) === JSON.stringify(["a", "c"]),
  "brushKeys: selects elements intersecting the brush (a, c)"
);
ok(T.brushKeys(els, { x0: 100, y0: 100, x1: 200, y1: 200 }).length === 0, "brushKeys: empty when nothing intersects");

ok(T.nearestKey(els, 55, 55, 100) === "b", "nearestKey: point inside b -> b");
ok(T.nearestKey(els, 200, 200, 5) === null, "nearestKey: nothing within radius -> null");

// ===================== tooltip sanitizer (safe HTML) =====================
ok(T.sanitizeTip("line1<br>line2") === "line1<br>line2", "sanitizeTip: <br> is allowed");
ok(T.sanitizeTip("<b>x</b>") === "<b>x</b>", "sanitizeTip: <b></b> is allowed");
ok(T.sanitizeTip("a & b < c") === "a &amp; b &lt; c", "sanitizeTip: bare &, < are escaped");
ok(
  T.sanitizeTip("<script>alert(1)</script>").indexOf("<script") === -1,
  "sanitizeTip: <script> is neutralised"
);
ok(
  T.sanitizeTip('<span onclick="x()">y</span>').indexOf("<span") === -1,
  "sanitizeTip: a tag carrying attributes stays escaped (no injection)"
);
ok(
  T.sanitizeTip('<img src=x onerror="alert(1)">').indexOf("<img") === -1,
  "sanitizeTip: disallowed tag (img) stays escaped"
);

// tooltip renders as HTML in the DOM (bold + line break)
{
  const elH = document.createElement("div");
  document.body.appendChild(elH);
  const iH = widgetDef.factory(elH, 200, 100);
  iH.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><path data-key="h" d="M10 10h5v5h-5z"/></svg>',
    elements: [{ key: "h", tooltip: "Name: <b>Bob</b><br>Age: 30" }],
    options: { tooltip: true, hover: true }
  });
  fireOn(elH.querySelector("svg"), "pointermove", elH.querySelector('[data-key="h"]'));
  const tipH = elH.querySelector(".vellumwidget-tip");
  ok(tipH.querySelector("b") !== null, "tooltip renders <b> as a real element");
  ok(tipH.innerHTML.indexOf("<br>") !== -1, "tooltip renders <br> as a line break");
}
ok(T.nearestKey(els, 12, 12, 100) === "a" || T.nearestKey(els, 12, 12, 100) === "c", "nearestKey: picks a nearby element");

const vb = T.parseViewBox("0 0 200 100");
ok(vb && vb.w === 200 && vb.h === 100, "parseViewBox parses 'x y w h'");
const zvb = T.zoomViewBox(vb, 2, 100, 50);
ok(zvb.w === 100 && zvb.h === 50, "zoomViewBox halves extent at factor 2");
ok(Math.abs(zvb.x - 50) < 1e-9 && Math.abs(zvb.y - 25) < 1e-9, "zoomViewBox keeps the anchor point fixed");
ok(T.parseViewBox("garbage") === null, "parseViewBox rejects malformed input");

const ub = T.unionBbox(els, { a: true, b: true });
ok(ub.x0 === 0 && ub.y0 === 0 && ub.x1 === 60 && ub.y1 === 60, "unionBbox spans the selected keys");

// ===================== Phase 4: toolbar + zoom DOM wiring =====================
const el3 = document.createElement("div");
document.body.appendChild(el3);
const inst3 = widgetDef.factory(el3, 200, 100);
inst3.renderValue({
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<path data-key="a" d="M0 0h10v10z"/><path data-key="b" d="M50 50h10v10z"/></svg>',
  elements: [
    { key: "a", tooltip: "A", x0: 0, y0: 0, x1: 10, y1: 10 },
    { key: "b", tooltip: "B", x0: 50, y0: 50, x1: 60, y1: 60 }
  ],
  options: {
    tooltip: true, hover: true, select: true, brush: true, zoom: true,
    toolbar: true, nearest: true, selectMode: "multiple"
  }
});
const svg3 = el3.querySelector("svg");
const toolbar = el3.querySelector(".vellumwidget-toolbar");
ok(!!toolbar, "toolbar is rendered");
ok(!!el3.querySelector(".vellumwidget-brush"), "brush overlay element exists");
ok(el3.querySelectorAll(".vellumwidget-toolbar button").length >= 5, "toolbar has the expected buttons");

// mode toggle -> pan
const modeBtn = el3.querySelector('.vellumwidget-toolbar [data-act="mode"]');
ok(!!modeBtn, "mode toggle button present");
modeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(el3.classList.contains("vellumwidget-mode-pan"), "mode toggle switches to pan mode");
modeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(!el3.classList.contains("vellumwidget-mode-pan"), "mode toggle switches back to brush mode");

// wheel zoom shrinks the viewBox; reset restores it
const before = svg3.getAttribute("viewBox");
const wheel = new window.WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true, clientX: 0, clientY: 0 });
Object.defineProperty(wheel, "target", { value: svg3 });
svg3.dispatchEvent(wheel);
const after = T.parseViewBox(svg3.getAttribute("viewBox"));
ok(after && after.w < 200, "wheel zoom-in shrinks the viewBox width");
el3.querySelector('.vellumwidget-toolbar [data-act="reset"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(svg3.getAttribute("viewBox") === before, "reset restores the original viewBox");

// ===================== touch: pinch-zoom + keyboard pan =====================
function firePointer(target, type, id, clientX, clientY, onWindow) {
  const ev = new window.MouseEvent(type, { bubbles: true, clientX: clientX, clientY: clientY });
  Object.defineProperty(ev, "pointerId", { value: id });
  Object.defineProperty(ev, "pointerType", { value: "touch" });
  Object.defineProperty(ev, "target", { value: target });
  (onWindow ? window : target).dispatchEvent(ev);
}
ok(el3.classList.contains("vellumwidget-gesture"), "gesture class set (touch-action:none) when zoom/brush on");
const vbPre = T.parseViewBox(svg3.getAttribute("viewBox"));
// two fingers down 40px apart, then spread to 80px -> zoom in (viewBox shrinks)
firePointer(svg3, "pointerdown", 1, 80, 50);
firePointer(svg3, "pointerdown", 2, 120, 50);
firePointer(svg3, "pointermove", 2, 160, 50, true);
const vbPinch = T.parseViewBox(svg3.getAttribute("viewBox"));
ok(vbPinch.w < vbPre.w, "two-finger spread pinch-zooms in (viewBox shrinks)");
firePointer(svg3, "pointerup", 1, 80, 50, true);
firePointer(svg3, "pointerup", 2, 160, 50, true);

// keyboard: ArrowRight pans the viewBox in +x; 0 resets
const vbBeforeKey = T.parseViewBox(svg3.getAttribute("viewBox"));
el3.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
ok(T.parseViewBox(svg3.getAttribute("viewBox")).x > vbBeforeKey.x, "ArrowRight pans the viewBox right");
el3.dispatchEvent(new window.KeyboardEvent("keydown", { key: "0", bubbles: true }));
ok(svg3.getAttribute("viewBox") === before, "key 0 resets the viewBox");

// ===================== export: copy-PNG button (feature-detected) =====================
// jsdom has no Clipboard API, so the copy button is (correctly) absent. The
// positive path (button present when navigator.clipboard.write + ClipboardItem
// exist) is a trivial feature-detect exercised in real browsers.
ok(!el3.querySelector('.vellumwidget-toolbar [data-act="copy"]'), "copy button absent when the Clipboard API is unavailable");
ok(!!el3.querySelector('.vellumwidget-toolbar [data-act="png"]'), "PNG download button always present");

// ===================== large-N: node cache serves a hover =====================
{
  const N = 4000;
  let svgN = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">';
  const elemsN = [];
  for (let i = 0; i < N; i++) {
    const x = i % 200, y = Math.floor(i / 200);
    svgN += '<path data-key="p' + i + '" d="M' + x + " " + y + 'h1v1z"/>';
    elemsN.push({ key: "p" + i, tooltip: "pt " + i, x0: x, y0: y, x1: x + 1, y1: y + 1 });
  }
  svgN += "</svg>";
  const elN = document.createElement("div");
  document.body.appendChild(elN);
  widgetDef.factory(elN, 200, 200).renderValue({
    svg: svgN, elements: elemsN,
    options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
  });
  const target = elN.querySelector('[data-key="p2500"]');
  fireOn(elN.querySelector("svg"), "pointermove", target);
  ok(target.classList.contains("vellumwidget-hl"), "large-N: hover over a mark highlights it (via node cache)");
  // brushKeys still correct at scale (pure helper unchanged)
  const picked = T.brushKeys(elemsN, { x0: 0.2, y0: 0.2, x1: 1.5, y1: 0.5 });
  ok(picked.indexOf("p0") !== -1 && picked.indexOf("p1") !== -1 && picked.indexOf("p3000") === -1,
    "large-N: brushKeys selects the overlapping marks and excludes far ones");
}

// ===================== styling: widget theme (Option 1) =====================
const elS = document.createElement("div");
document.body.appendChild(elS);
widgetDef.factory(elS, 100, 100).renderValue({
  svg: '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50"><path data-key="a" d="M1 1h9v9z"/></svg>',
  elements: [{ key: "a", x0: 1, y0: 1, x1: 10, y1: 10 }],
  options: {
    tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true,
    nearest: true, selectMode: "multiple",
    style: { hoverColor: "#ff0000", selectedColor: "#00ff00", dimOpacity: 0.5 }
  }
});
ok(elS.style.getPropertyValue("--vellumwidget-dim-opacity") === "0.5", "theme: dim-opacity var set on root");
ok(elS.style.getPropertyValue("--vellumwidget-hl-stroke") === "#ff0000", "theme: hover-stroke var set on root");
ok(elS.style.getPropertyValue("--vellumwidget-selected-stroke") === "#00ff00", "theme: selected-stroke var set on root");
ok(elS.classList.contains("vellumwidget-hc-all"), "theme: hover colour enables the widget-wide hover-stroke rule");

// ===================== styling: per-element grammar (Option 2) =====================
const elP = document.createElement("div");
document.body.appendChild(elP);
widgetDef.factory(elP, 100, 100).renderValue({
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">' +
    '<path data-key="a" d="M1 1h9v9z"/><path data-key="b" d="M20 20h9v9z"/></svg>',
  elements: [
    { key: "a", hover_color: "#123456", selected_color: "#654321", x0: 1, y0: 1, x1: 10, y1: 10 },
    { key: "b", x0: 20, y0: 20, x1: 29, y1: 29 } // no per-element style
  ],
  options: {
    tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true,
    nearest: true, selectMode: "multiple"
  }
});
const pa = elP.querySelector('[data-key="a"]');
const pb2 = elP.querySelector('[data-key="b"]');
ok(pa.style.getPropertyValue("--vellumwidget-hl-stroke") === "#123456", "per-element: hover-stroke var set on the element");
ok(pa.classList.contains("vellumwidget-hc"), "per-element: element opts into the hover-stroke rule");
ok(pa.style.getPropertyValue("--vellumwidget-selected-stroke") === "#654321", "per-element: selected-stroke var set on the element");
ok(pb2.style.getPropertyValue("--vellumwidget-hl-stroke") === "", "per-element: unstyled element gets no override");
ok(!pb2.classList.contains("vellumwidget-hc"), "per-element: unstyled element does not opt into the hover-stroke rule");
ok(!elP.classList.contains("vellumwidget-hc-all"), "per-element: no widget-wide rule when only some elements are styled");

// ===================== linking: own cross-widget bus (Option group) =====================
function mount(opts) {
  const e = document.createElement("div");
  document.body.appendChild(e);
  const inst = widgetDef.factory(e, 100, 100);
  inst.renderValue(opts);
  return e;
}
function fireOn(svg, type, target, extra) {
  const ev = new window.MouseEvent(type, Object.assign({ bubbles: true }, extra || {}));
  Object.defineProperty(ev, "target", { value: target });
  svg.dispatchEvent(ev);
}
const svg2paths =
  '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30" viewBox="0 0 60 30">' +
  '<path data-key="x" d="M1 1h9v9z"/><path data-key="y" d="M40 1h9v9z"/></svg>';

const linkOpts = () => ({
  svg: svg2paths,
  elements: [{ key: "x", x0: 1, y0: 1, x1: 10, y1: 10 }, { key: "y", x0: 40, y0: 1, x1: 49, y1: 10 }],
  options: {
    tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true,
    nearest: true, selectMode: "multiple", group: "L1"
  }
});
const elA = mount(linkOpts());
const elB = mount(linkOpts());
// click "x" in A -> B reflects the same selection (linked by data-key)
fireOn(elA.querySelector("svg"), "click", elA.querySelector('[data-key="x"]'));
ok(elA.querySelector('[data-key="x"]').classList.contains("vellumwidget-selected"), "own bus: local selection applied in A");
ok(elB.querySelector('[data-key="x"]').classList.contains("vellumwidget-selected"), "own bus: selection linked into B");
ok(!elB.querySelector('[data-key="y"]').classList.contains("vellumwidget-selected"), "own bus: only the linked key is selected in B");

// ===================== selection projection by field (hover_group) =====================
const elG = mount({
  svg: svg2paths,
  elements: [
    { key: "x", hover_group: "g", x0: 1, y0: 1, x1: 10, y1: 10 },
    { key: "y", hover_group: "g", x0: 40, y0: 1, x1: 49, y1: 10 }
  ],
  options: { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: true, selectMode: "multiple" }
});
fireOn(elG.querySelector("svg"), "click", elG.querySelector('[data-key="x"]'));
ok(
  elG.querySelector('[data-key="x"]').classList.contains("vellumwidget-selected") &&
    elG.querySelector('[data-key="y"]').classList.contains("vellumwidget-selected"),
  "field projection: clicking one selects the whole hover_group"
);

// ===================== crosstalk bridge (selection + filter) =====================
(function () {
  const chans = {};
  function ch(group, kind) {
    chans[group] = chans[group] || { selection: [], filter: [] };
    return chans[group][kind];
  }
  function Handle(group, kind) {
    this._ls = [];
    ch(group, kind).push(this);
    const self = this;
    this.on = function (t, cb) { self._ls.push(cb); };
    this.set = function (v) {
      ch(group, kind).forEach(function (h) {
        h._ls.forEach(function (cb) { cb({ value: v, sender: self }); });
      });
    };
  }
  window.crosstalk = {
    SelectionHandle: function (g) { Handle.call(this, g, "selection"); },
    FilterHandle: function (g) { Handle.call(this, g, "filter"); },
    _ch: ch
  };
})();

const elC = mount({
  svg: svg2paths,
  elements: [{ key: "x", x0: 1, y0: 1, x1: 10, y1: 10 }, { key: "y", x0: 40, y0: 1, x1: 49, y1: 10 }],
  options: {
    tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true,
    nearest: true, selectMode: "multiple", crosstalk: "G"
  }
});
// local select -> pushed to the crosstalk selection channel
fireOn(elC.querySelector("svg"), "click", elC.querySelector('[data-key="y"]'));
const selVal = window.crosstalk._ch("G", "selection")[0]._ls; // ensure handle exists
ok(window.crosstalk._ch("G", "selection").length >= 1, "crosstalk: widget created a SelectionHandle in the group");
// incoming selection from a peer handle -> applied in the widget
const peerSel = new window.crosstalk.SelectionHandle("G");
peerSel.set(["x"]);
ok(elC.querySelector('[data-key="x"]').classList.contains("vellumwidget-selected"), "crosstalk: incoming selection highlights the key");
ok(!elC.querySelector('[data-key="y"]').classList.contains("vellumwidget-selected"), "crosstalk: incoming selection replaces the prior one");
// incoming filter -> non-matching elements hidden (display-tier cross-filter)
const peerFilt = new window.crosstalk.FilterHandle("G");
peerFilt.set(["x"]);
ok(elC.querySelector('[data-key="y"]').classList.contains("vellumwidget-filtered"), "crosstalk: filter hides the non-matching element");
ok(!elC.querySelector('[data-key="x"]').classList.contains("vellumwidget-filtered"), "crosstalk: filter keeps the matching element");
peerFilt.set(null);
ok(!elC.querySelector('[data-key="y"]').classList.contains("vellumwidget-filtered"), "crosstalk: null filter clears the cross-filter");

// ===================== legend interaction =====================
const elL = mount({
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="90" height="30" viewBox="0 0 90 30">' +
    '<path data-key="p1" d="M1 1h5v5z"/><path data-key="p2" d="M10 1h5v5z"/>' +
    '<path data-key="q1" d="M20 1h5v5z"/>' +
    '<path data-key="legend:color:s" d="M70 1h5v5z"/>' +
    '<path data-key="legend:color:t" d="M70 12h5v5z"/></svg>',
  elements: [
    { key: "p1", legend: ["color:s"], x0: 1, y0: 1, x1: 6, y1: 6 },
    { key: "p2", legend: ["color:s"], x0: 10, y0: 1, x1: 15, y1: 6 },
    { key: "q1", legend: ["color:t"], x0: 20, y0: 1, x1: 25, y1: 6 },
    { key: "legend:color:s", legend_for: "color:s", tooltip: "s", x0: 70, y0: 1, x1: 75, y1: 6 },
    { key: "legend:color:t", legend_for: "color:t", tooltip: "t", x0: 70, y0: 12, x1: 75, y1: 17 }
  ],
  options: { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: false, selectMode: "multiple" }
});
const swatchS = elL.querySelector('[data-key="legend:color:s"]');
ok(!!swatchS, "legend swatch element is present with its colon key");
ok(swatchS.classList.contains("vellumwidget-legend"), "legend swatch is tagged vellumwidget-legend (stays visible on hover)");
// hover the "s" swatch -> its whole series (p1, p2) highlights, but not q1
fireOn(elL.querySelector("svg"), "pointermove", swatchS);
ok(
  elL.querySelector('[data-key="p1"]').classList.contains("vellumwidget-hl") &&
    elL.querySelector('[data-key="p2"]').classList.contains("vellumwidget-hl"),
  "hovering a legend swatch highlights its whole series"
);
ok(!elL.querySelector('[data-key="q1"]').classList.contains("vellumwidget-hl"), "other series is not highlighted");
fireOn(elL.querySelector("svg"), "pointerleave", elL.querySelector("svg"));
// click the "s" swatch -> selects the series
fireOn(elL.querySelector("svg"), "click", swatchS);
ok(
  elL.querySelector('[data-key="p1"]').classList.contains("vellumwidget-selected") &&
    elL.querySelector('[data-key="p2"]').classList.contains("vellumwidget-selected"),
  "clicking a legend swatch selects its whole series"
);
ok(!elL.querySelector('[data-key="q1"]').classList.contains("vellumwidget-selected"), "other series is not selected");

// ===================== accessibility (a11y): SR + keyboard =====================
{
  const elA11y = mount({
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30" viewBox="0 0 60 30">' +
      '<path data-key="x" d="M1 1h9v9z"/><path data-key="y" d="M40 1h9v9z"/></svg>',
    elements: [
      { key: "x", tooltip: "Point <b>X</b>", x0: 1, y0: 1, x1: 10, y1: 10 },
      { key: "y", tooltip: "Point Y", x0: 40, y0: 1, x1: 49, y1: 10 }
    ],
    options: {
      tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true,
      nearest: true, a11y: true, selectMode: "multiple"
    }
  });
  const svgA = elA11y.querySelector("svg");
  const xNode = elA11y.querySelector('[data-key="x"]');
  const yNode = elA11y.querySelector('[data-key="y"]');

  ok(svgA.getAttribute("role") === "graphics-document", "a11y: svg is a graphics-document (not role=img)");
  ok(svgA.getAttribute("aria-roledescription") === "interactive chart", "a11y: svg has an interactive-chart roledescription");
  ok(svgA.getAttribute("aria-label") === "Interactive chart", "a11y: svg gets a generic name when none supplied");
  ok(xNode.getAttribute("role") === "graphics-symbol", "a11y: a mark is a graphics-symbol");
  ok(xNode.getAttribute("aria-label") === "Point X", "a11y: mark aria-label is its tooltip with tags stripped");
  ok(xNode.getAttribute("tabindex") === "0", "a11y: first mark holds the roving tabindex (0)");
  ok(yNode.getAttribute("tabindex") === "-1", "a11y: other marks are -1 (roving tabindex)");

  const live = elA11y.querySelector('[aria-live="polite"]');
  ok(!!live, "a11y: an aria-live announcer is present");
  const table = elA11y.querySelector("table.vellumwidget-data-table");
  ok(!!table, "a11y: a hidden data table is present");
  ok(table.querySelectorAll("tr").length === 3, "a11y: data table has a header + one row per mark");
  ok(table.textContent.indexOf("Point Y") !== -1, "a11y: data table lists a mark's description");

  // focus a mark -> announced, focus ring on
  xNode.dispatchEvent(new window.FocusEvent("focus", { bubbles: false }));
  ok(xNode.classList.contains("vellumwidget-focus"), "a11y: focusing a mark draws the focus ring");
  ok(live.textContent === "Point X", "a11y: focusing a mark announces its label");

  // ArrowRight -> roving tabindex moves to the next mark
  svgA.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  ok(yNode.getAttribute("tabindex") === "0" && xNode.getAttribute("tabindex") === "-1",
    "a11y: ArrowRight moves the roving tabindex to the next mark");
  ok(live.textContent === "Point Y", "a11y: arrow navigation announces the newly focused mark");

  // Enter -> selects the focused mark, announced
  svgA.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok(yNode.classList.contains("vellumwidget-selected"), "a11y: Enter selects the focused mark");
  ok(live.textContent.indexOf("selected") !== -1, "a11y: selection is announced");

  // a11y OFF -> no chart role override, no focusable marks, no table
  const elOff = mount({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" role="img"><path data-key="x" d="M1 1h9v9z"/></svg>',
    elements: [{ key: "x", tooltip: "X", x0: 1, y0: 1, x1: 10, y1: 10 }],
    options: { tooltip: true, hover: true, select: true, a11y: false, selectMode: "multiple" }
  });
  ok(elOff.querySelector("svg").getAttribute("role") === "img", "a11y off: svg role is left untouched");
  ok(elOff.querySelector('[data-key="x"]').getAttribute("tabindex") === null, "a11y off: marks are not focusable");
  ok(!elOff.querySelector("table.vellumwidget-data-table"), "a11y off: no data table is built");

  // as_widget(alt=) must win over vellum's inherited <title>/<desc>: vellum labels
  // the SVG with aria-labelledby, which outranks aria-label, so the widget must
  // drop it for the explicit alt to become the accessible name.
  const elAlt = mount({
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" role="img" aria-labelledby="p-t p-d">' +
      '<title id="p-t">Auto title</title><desc id="p-d">Auto description.</desc>' +
      '<path data-key="x" d="M1 1h9v9z"/></svg>',
    elements: [{ key: "x", tooltip: "X", x0: 1, y0: 1, x1: 10, y1: 10 }],
    options: { tooltip: true, hover: true, select: true, a11y: true, alt: "My explicit alt.", selectMode: "multiple" }
  });
  const svgAlt = elAlt.querySelector("svg");
  ok(svgAlt.getAttribute("aria-label") === "My explicit alt.", "alt: explicit alt becomes the aria-label");
  ok(svgAlt.getAttribute("aria-labelledby") === null, "alt: vellum's aria-labelledby is removed so alt wins the accessible name");

  // roving tabindex skips marks hidden by a cross-filter (vellumwidget-filtered)
  const elF = mount({
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 30">' +
      '<path data-key="a" d="M1 1h9v9z"/><path data-key="b" d="M30 1h9v9z"/><path data-key="c" d="M60 1h9v9z"/></svg>',
    elements: [
      { key: "a", tooltip: "A", x0: 1, y0: 1, x1: 10, y1: 10 },
      { key: "b", tooltip: "B", x0: 30, y0: 1, x1: 39, y1: 10 },
      { key: "c", tooltip: "C", x0: 60, y0: 1, x1: 69, y1: 10 }
    ],
    options: { tooltip: true, hover: true, select: true, a11y: true, selectMode: "multiple" }
  });
  const svgF = elF.querySelector("svg");
  const aN = elF.querySelector('[data-key="a"]');
  const bN = elF.querySelector('[data-key="b"]');
  const cN = elF.querySelector('[data-key="c"]');
  bN.classList.add("vellumwidget-filtered"); // simulate a cross-filter hiding "b"
  aN.dispatchEvent(new window.FocusEvent("focus", { bubbles: false })); // cursor on "a"
  svgF.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  ok(cN.getAttribute("tabindex") === "0" && bN.getAttribute("tabindex") !== "0",
    "a11y: ArrowRight skips a cross-filtered (hidden) mark");
}

// ===================== Shiny read-back (input bindings) =====================
// The bundle reads HTMLWidgets.shinyMode + window.Shiny lazily at emit time, so
// we drive them from the harness. el.id stands in for the Shiny outputId.
const shinyElements = [
  { key: "x", tooltip: "X", x0: 1, y0: 1, x1: 10, y1: 10 },
  { key: "y", tooltip: "Y", x0: 40, y0: 1, x1: 49, y1: 10 }
];
function mountShiny(id, calls) {
  window.Shiny = { setInputValue: (iid, v, o) => calls.push({ id: iid, v: v, o: o }) };
  HTMLWidgets.shinyMode = true;
  const e = document.createElement("div");
  e.id = id;
  document.body.appendChild(e);
  const inst = widgetDef.factory(e, 100, 100);
  inst.renderValue({
    svg: svg2paths,
    elements: shinyElements,
    options: { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: true, selectMode: "multiple" }
  });
  return e;
}
{
  const calls = [];
  const e = mountShiny("myplot", calls);
  const svgE = e.querySelector("svg");
  const last = (name) => calls.filter((c) => c.id === "myplot_" + name).pop();

  ok(!!last("selected") && last("selected").v.length === 0, "shiny: initial render pushes an empty _selected");

  calls.length = 0;
  fireOn(svgE, "click", e.querySelector('[data-key="x"]'));
  ok(last("selected") && JSON.stringify(last("selected").v) === JSON.stringify(["x"]),
    "shiny: clicking a mark pushes _selected = [key]");
  ok(!(last("selected").o && last("selected").o.priority === "event"),
    "shiny: _selected is deduped state (no priority:event)");

  calls.length = 0;
  fireOn(svgE, "click", e.querySelector('[data-key="x"]')); // toggle off
  ok(last("selected") && last("selected").v.length === 0, "shiny: toggling a mark off pushes empty _selected");

  // _click: discrete event, carries the key + priority:"event"
  calls.length = 0;
  fireOn(svgE, "click", e.querySelector('[data-key="y"]'));
  ok(last("click") && last("click").v.key === "y" && last("click").o && last("click").o.priority === "event",
    "shiny: click pushes _click = {key} with priority:event");

  // _hover: deduped, carries the hovered key
  calls.length = 0;
  fireOn(svgE, "pointermove", e.querySelector('[data-key="x"]'));
  ok(last("hover") && last("hover").v === "x", "shiny: hover pushes _hover = key");
  ok(!(last("hover").o && last("hover").o.priority === "event"), "shiny: _hover is deduped (no priority:event)");

  // _brush: a completed brush drag emits {keys, rect} as an event
  calls.length = 0;
  firePointer(svgE, "pointerdown", 1, 5, 5);
  firePointer(svgE, "pointermove", 1, 55, 25, true);
  firePointer(svgE, "pointerup", 1, 55, 25, true);
  ok(last("brush") && Array.isArray(last("brush").v.keys) && typeof last("brush").v.x0 === "number" &&
    last("brush").o && last("brush").o.priority === "event",
    "shiny: brush pushes _brush = {keys, x0..x1} with priority:event");

  HTMLWidgets.shinyMode = false;
  delete window.Shiny;
}
// non-Shiny safety: shinyMode off -> zero Shiny calls even if window.Shiny exists
{
  const calls = [];
  window.Shiny = { setInputValue: (iid, v, o) => calls.push({ id: iid, v: v, o: o }) };
  const e = mount({ svg: svg2paths, elements: shinyElements, options: { select: true } });
  fireOn(e.querySelector("svg"), "click", e.querySelector('[data-key="x"]'));
  ok(calls.length === 0, "shiny: no Shiny calls when shinyMode is off (static / knitr safe)");
  delete window.Shiny;
}

// ===================== server -> client proxy (vellumwidget_proxy) =====================
// The instance exposes `_call(method, args)`, the seam vellumwidget_proxy() drives via
// the "vellumwidget-calls" custom message. Exercise each verb's DOM effect directly.
{
  const eP = document.createElement("div");
  document.body.appendChild(eP);
  const iP = widgetDef.factory(eP, 60, 30);
  iP.renderValue({
    svg: svg2paths, // keys x, y with a 0 0 60 30 viewBox
    elements: [
      { key: "x", x0: 1, y0: 1, x1: 10, y1: 10 },
      { key: "y", x0: 40, y0: 1, x1: 49, y1: 10 }
    ],
    options: { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: true, selectMode: "multiple" }
  });
  const svgP = eP.querySelector("svg");
  const px = eP.querySelector('[data-key="x"]');
  const py = eP.querySelector('[data-key="y"]');
  ok(typeof iP._call === "function", "proxy: instance exposes the _call seam");

  // select -> the given keys become selected (server-driven, no click)
  iP._call("select", ["x"]);
  ok(px.classList.contains("vellumwidget-selected"), "proxy: select() selects the given key");
  ok(!py.classList.contains("vellumwidget-selected"), "proxy: select() leaves other keys unselected");

  // select with a scalar arg (Shiny may auto-unbox a length-1 vector) still works
  iP._call("select", "y");
  ok(py.classList.contains("vellumwidget-selected") && !px.classList.contains("vellumwidget-selected"),
    "proxy: select() accepts a scalar (auto-unboxed) key and replaces the selection");

  // clearSelection -> nothing selected
  iP._call("clearSelection");
  ok(eP.querySelectorAll(".vellumwidget-selected").length === 0, "proxy: clearSelection() clears the selection");

  // filter -> keys not in the show set are marked filtered (display tier)
  iP._call("filter", ["x"]);
  ok(py.classList.contains("vellumwidget-filtered"), "proxy: filter() hides keys outside the show set");
  ok(!px.classList.contains("vellumwidget-filtered"), "proxy: filter() keeps keys in the show set");

  // clearFilter -> filter removed
  iP._call("clearFilter");
  ok(eP.querySelectorAll(".vellumwidget-filtered").length === 0, "proxy: clearFilter() removes the filter");

  // zoom -> the viewBox shrinks to frame the requested key
  const vbFull = svgP.getAttribute("viewBox");
  iP._call("zoom", ["x"]);
  const vbZoom = T.parseViewBox(svgP.getAttribute("viewBox"));
  ok(vbZoom && vbZoom.w < 60, "proxy: zoom() frames the key (viewBox shrinks)");

  // resetZoom -> back to the original view
  iP._call("resetZoom");
  ok(svgP.getAttribute("viewBox") === vbFull, "proxy: resetZoom() restores the original viewBox");

  // zoom with empty keys resets to the full view
  iP._call("zoom", ["x"]);
  iP._call("zoom", []);
  ok(svgP.getAttribute("viewBox") === vbFull, "proxy: zoom([]) resets to the full view");

  // unknown method is ignored (forward-compatible), no throw
  let threw = false;
  try { iP._call("no_such_method", ["x"]); } catch (e) { threw = true; }
  ok(!threw, "proxy: an unknown method is ignored without throwing");
}

// dispatchProxyCall routes a message to the instance resolved by id.
{
  const seen = [];
  const fakeInst = { _call: (m, a) => seen.push({ m: m, a: a }) };
  const find = (id) => (id === "#plot" ? fakeInst : null);
  T.dispatchProxyCall({ id: "plot", method: "select", args: ["a", "b"] }, (id) => find("#" + id));
  ok(seen.length === 1 && seen[0].m === "select" && JSON.stringify(seen[0].a) === '["a","b"]',
    "dispatchProxyCall: routes method+args to the matched instance's _call");
  // unknown id -> no-op (no instance found)
  T.dispatchProxyCall({ id: "missing", method: "select", args: [] }, (id) => find("#" + id));
  ok(seen.length === 1, "dispatchProxyCall: unknown id is a no-op");
  // malformed message -> no-op, no throw
  let dThrew = false;
  try { T.dispatchProxyCall(null, () => null); T.dispatchProxyCall({}, () => null); } catch (e) { dThrew = true; }
  ok(!dThrew, "dispatchProxyCall: a null / id-less message is a safe no-op");
}

// The "vellumwidget-calls" handler is registered once when Shiny is present.
{
  const handlers = {};
  window.Shiny = {
    setInputValue: () => {},
    addCustomMessageHandler: (t, cb) => { handlers[t] = cb; }
  };
  HTMLWidgets.shinyMode = true;
  // The bundle registers at load (before Shiny existed here) and again on render;
  // a render now, with Shiny present, wires the handler up.
  const eH = document.createElement("div");
  eH.id = "plotH";
  document.body.appendChild(eH);
  const iH = widgetDef.factory(eH, 60, 30);
  HTMLWidgets.find = (sel) => (sel === "#plotH" ? iH : null);
  iH.renderValue({
    svg: svg2paths,
    elements: [{ key: "x", x0: 1, y0: 1, x1: 10, y1: 10 }, { key: "y", x0: 40, y0: 1, x1: 49, y1: 10 }],
    options: { select: true, selectMode: "multiple" }
  });
  ok(typeof handlers["vellumwidget-calls"] === "function", "proxy: 'vellumwidget-calls' handler registered under Shiny");
  handlers["vellumwidget-calls"]({ id: "plotH", method: "select", args: ["y"] });
  ok(eH.querySelector('[data-key="y"]').classList.contains("vellumwidget-selected"),
    "proxy: a 'vellumwidget-calls' message drives the resolved widget");
  delete HTMLWidgets.find;
  HTMLWidgets.shinyMode = false;
  delete window.Shiny;
}

// ============ keyed statistical marks (error bars & boxplots) ============
// A statistical mark draws several SVG elements sharing ONE data-key (an error
// bar = vertical bar + two caps; a box = rect + median + whiskers). They must
// hover, tooltip, and select as one unit, and the brush key list must not
// double-count a key that spans several elements.
{
  const eb = document.createElement("div");
  document.body.appendChild(eb);
  const iEb = widgetDef.factory(eb, 200, 100);
  const ebSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1">' +
    '<line data-key="eb1" x1="30" y1="20" x2="30" y2="80"/>' + // bar
    '<line data-key="eb1" x1="25" y1="80" x2="35" y2="80"/>' + // lower cap
    '<line data-key="eb1" x1="25" y1="20" x2="35" y2="20"/>' + // upper cap
    '<line data-key="eb2" x1="90" y1="30" x2="90" y2="70"/>' +
    "</g></svg>";
  iEb.renderValue({
    svg: ebSvg,
    elements: [
      { key: "eb1", tooltip: "Group A", x0: 25, y0: 20, x1: 35, y1: 80 },
      { key: "eb1", tooltip: "Group A", x0: 25, y0: 80, x1: 35, y1: 80 },
      { key: "eb1", tooltip: "Group A", x0: 25, y0: 20, x1: 35, y1: 20 },
      { key: "eb2", tooltip: "Group B", x0: 85, y0: 30, x1: 95, y1: 70 }
    ],
    options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
  });
  const svgEb = eb.querySelector("svg");
  const eb1 = eb.querySelectorAll('[data-key="eb1"]');
  ok(eb1.length === 3, "error bar: three segments share one data-key");

  fireOn(svgEb, "pointermove", eb1[1]); // hover the lower cap
  ok(
    eb1[0].classList.contains("vellumwidget-hl") &&
      eb1[1].classList.contains("vellumwidget-hl") &&
      eb1[2].classList.contains("vellumwidget-hl"),
    "error bar: hovering any segment highlights the whole bar"
  );
  ok(eb.querySelector(".vellumwidget-tip").textContent === "Group A", "error bar: tooltip from the shared key");
  fireOn(svgEb, "pointerleave", svgEb);

  fireOn(svgEb, "click", eb1[2]); // click the upper cap
  ok(
    eb1[0].classList.contains("vellumwidget-selected") && eb1[2].classList.contains("vellumwidget-selected"),
    "error bar: clicking any segment selects the whole bar"
  );

  const TB = window.__vellumwidgetTest;
  const ebEls = [
    { key: "eb1", x0: 25, y0: 20, x1: 35, y1: 80 },
    { key: "eb1", x0: 25, y0: 80, x1: 35, y1: 80 },
    { key: "eb1", x0: 25, y0: 20, x1: 35, y1: 20 },
    { key: "eb2", x0: 85, y0: 30, x1: 95, y1: 70 }
  ];
  const brushed = TB.brushKeys(ebEls, { x0: 0, y0: 0, x1: 200, y1: 100 });
  ok(
    JSON.stringify(brushed.slice().sort()) === JSON.stringify(["eb1", "eb2"]),
    "brushKeys: a key spanning several elements is returned once (no double-count)"
  );
}

{
  const bx = document.createElement("div");
  document.body.appendChild(bx);
  const iBx = widgetDef.factory(bx, 200, 100);
  const bxSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
    '<g data-vellum-panel="panel-1-1">' +
    '<rect data-key="c6" x="20" y="30" width="30" height="40"/>' + // box
    '<line data-key="c6" x1="20" y1="50" x2="50" y2="50"/>' + // median
    '<line data-key="c6" x1="35" y1="10" x2="35" y2="30"/>' + // whisker
    '<circle data-key="c6-out1" cx="35" cy="5" r="2"/>' + // outlier (own key)
    "</g></svg>";
  iBx.renderValue({
    svg: bxSvg,
    elements: [
      { key: "c6", tooltip: "cyl 6", x0: 20, y0: 10, x1: 50, y1: 70 },
      { key: "c6", tooltip: "cyl 6", x0: 20, y0: 50, x1: 50, y1: 50 },
      { key: "c6", tooltip: "cyl 6", x0: 35, y0: 10, x1: 35, y1: 30 },
      { key: "c6-out1", tooltip: "outlier", x0: 33, y0: 3, x1: 37, y1: 7 }
    ],
    options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
  });
  const svgBx = bx.querySelector("svg");
  const box = bx.querySelectorAll('[data-key="c6"]');
  ok(box.length === 3, "boxplot: rect + median + whisker share the category key");
  fireOn(svgBx, "pointermove", box[0]); // hover the rect
  ok(
    box[0].classList.contains("vellumwidget-hl") &&
      box[1].classList.contains("vellumwidget-hl") &&
      box[2].classList.contains("vellumwidget-hl"),
    "boxplot: hovering the box highlights rect + median + whisker together"
  );
  ok(
    !bx.querySelector('[data-key="c6-out1"]').classList.contains("vellumwidget-hl"),
    "boxplot: an outlier (its own key) is not part of the box's highlight"
  );
}

// ============ columnar payload ingestion (Phase 1 wire format) ============
// R now ships `elements` as a columnar object (one array per field) instead of an
// array of per-element records — far cheaper to serialise at large N. The runtime
// decodes it back to the same ElemMeta[] via normalizeElements(); a legacy record
// array (used by the tests above) is still accepted.
{
  const T2 = window.__vellumwidgetTest;
  ok(typeof T2.normalizeElements === "function", "columnar: normalizeElements exposed for testing");

  // n = 1: htmlwidgets auto-unboxes a length-1 column to a scalar; must re-wrap.
  const one = T2.normalizeElements({ key: "a", x0: 1, y0: 2, x1: 3, y1: 4, tooltip: "A" });
  ok(one.length === 1 && one[0].key === "a" && one[0].x0 === 1 && one[0].tooltip === "A",
    "columnar: a single-element (auto-unboxed scalar) payload expands correctly");

  // multi-element: sparse tooltip (null where absent) + ragged legend list-column
  const many = T2.normalizeElements({
    key: ["a", "b", "c"],
    x0: [0, 10, 20], y0: [0, 0, 0], x1: [5, 15, 25], y1: [5, 5, 5],
    tooltip: ["A", null, "C"],
    legend: ["color:s", ["color:s", "color:t"], []]
  });
  ok(many.length === 3, "columnar: expands one ElemMeta per key");
  ok(many[0].tooltip === "A" && many[1].tooltip === undefined && many[2].tooltip === "C",
    "columnar: a null in a column means that element lacks the field");
  ok(many[0].legend === "color:s" && Array.isArray(many[1].legend) && many[1].legend.length === 2,
    "columnar: legend list-column keeps scalar vs multi-series shape");
  ok(many[2].legend === undefined, "columnar: an empty ([]) legend entry is treated as absent");
  ok(T2.brushKeys(many, { x0: -1, y0: -1, x1: 6, y1: 6 }).length === 1,
    "columnar: expanded elements carry usable bboxes for hit-testing");
  ok(T2.normalizeElements([{ key: "z" }]).length === 1, "columnar: a legacy record array is still accepted");
  ok(T2.normalizeElements([]).length === 0 && T2.normalizeElements(null).length === 0,
    "columnar: empty / null payloads yield no elements");

  // integration: renderValue accepts the columnar payload and hover still works
  const elCol = document.createElement("div");
  document.body.appendChild(elCol);
  widgetDef.factory(elCol, 200, 100).renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
      '<path data-key="a" d="M10 10h5v5z"/><path data-key="b" d="M40 10h5v5z"/></svg>',
    elements: { key: ["a", "b"], x0: [10, 40], y0: [10, 10], x1: [15, 45], y1: [15, 15], tooltip: ["Alpha", "Beta"] },
    options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
  });
  fireOn(elCol.querySelector("svg"), "pointermove", elCol.querySelector('[data-key="a"]'));
  ok(elCol.querySelector(".vellumwidget-tip").textContent === "Alpha",
    "columnar: renderValue ingests the columnar payload end-to-end (hover tooltip works)");
}

// ============ Phase 2: spatial index (nearest / brush) ============
// The runtime hit-tests hover (nearest) and brush against a Flatbush index instead
// of an O(n) scan. jsdom has no layout (client->user mapping is degenerate), so we
// drive the index-backed functions directly via the instance `_test` seam with
// explicit user-space coordinates, and cross-check against the pure O(n) helpers
// over the same elements — they must agree.
{
  const T2 = window.__vellumwidgetTest;
  // A grid of marks, shipped columnar (as R now does).
  const M = 2500; // > DIM_OVERLAY_MIN, so this also puts the widget in large-dim mode
  const key = [], x0 = [], y0 = [], x1 = [], y1 = [];
  for (let i = 0; i < M; i++) {
    const gx = (i % 50) * 4, gy = Math.floor(i / 50) * 4;
    key.push("p" + i); x0.push(gx); y0.push(gy); x1.push(gx + 2); y1.push(gy + 2);
  }
  const cols = { key: key, x0: x0, y0: y0, x1: x1, y1: y1 };
  const pureEls = T2.normalizeElements(cols);

  const eIdx = document.createElement("div");
  document.body.appendChild(eIdx);
  const iIdx = widgetDef.factory(eIdx, 200, 200);
  iIdx.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
      '<path data-key="p0" d="M0 0h2v2z"/></svg>',
    elements: cols,
    options: { tooltip: true, hover: true, select: true, brush: true, zoom: true, nearest: true, selectMode: "multiple" }
  });

  ok(iIdx._test && iIdx._test.indexSize() === M, "index: built one entry per bboxed element");
  ok(iIdx._test.largeDim() === true, "index: >DIM_OVERLAY_MIN elements enables large-dim mode");

  // brush: index result === pure result over the same elements (order-insensitive)
  const rect = { x0: -1, y0: -1, x1: 9, y1: 9 };
  const viaIndex = iIdx._test.brushKeysIn(rect).slice().sort();
  const viaPure = T2.brushKeys(pureEls, rect).slice().sort();
  ok(viaIndex.length > 0 && JSON.stringify(viaIndex) === JSON.stringify(viaPure),
    "index: brushKeysIn matches the pure brushKeys over the same region");

  // nearest: index result === pure result
  const nIndex = iIdx._test.nearestKeyAt(101, 101, 1000);
  const nPure = T2.nearestKey(pureEls, 101, 101, 1000);
  ok(nIndex === nPure, "index: nearestKeyAt matches the pure nearestKey");
  ok(iIdx._test.nearestKeyAt(5000, 5000, 3) === null, "index: nearest returns null beyond maxDist");

  // Correct even for a small scene (index still built; queries agree).
  const eSmall = document.createElement("div");
  document.body.appendChild(eSmall);
  const iSmall = widgetDef.factory(eSmall, 100, 100);
  const smallCols = { key: ["a", "b", "c"], x0: [0, 50, 5], y0: [0, 50, 5], x1: [10, 60, 15], y1: [10, 60, 15] };
  iSmall.renderValue({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path data-key="a" d="M0 0h1v1z"/></svg>',
    elements: smallCols,
    options: { hover: true, brush: true, nearest: true, selectMode: "multiple" }
  });
  ok(iSmall._test.largeDim() === false, "index: small scene stays on the CSS-dim path");
  ok(JSON.stringify(iSmall._test.brushKeysIn({ x0: -1, y0: -1, x1: 12, y1: 12 }).slice().sort()) ===
    JSON.stringify(["a", "c"]), "index: small-scene brush matches expected keys");
}

// ============ Phase 2: large-scene hover dims via overlay (O(hovered)) ============
// Above DIM_OVERLAY_MIN, hover must NOT toggle the O(n) `vellumwidget-hovering` dim
// rule; instead the holder is dimmed once and the hovered mark is cloned crisp into
// the overlay layer.
{
  const key = [], x0 = [], y0 = [], x1 = [], y1 = [];
  for (let i = 0; i < 2500; i++) { key.push("k" + i); x0.push(i); y0.push(0); x1.push(i + 1); y1.push(1); }
  const eBig = document.createElement("div");
  document.body.appendChild(eBig);
  const iBig = widgetDef.factory(eBig, 200, 100);
  iBig.renderValue({
    // Only two marks are actually drawn in the SVG; the 2500 elements just push the
    // widget into large-dim mode (the overlay clones whichever hovered node exists).
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">' +
      '<path data-key="k0" d="M10 10h5v5z"/><path data-key="k1" d="M40 10h5v5z"/></svg>',
    elements: { key: key, x0: x0, y0: y0, x1: x1, y1: y1, tooltip: key },
    options: { tooltip: true, hover: true, select: true, selectMode: "multiple" }
  });
  const holderBig = eBig.querySelector(".vellumwidget-svg-holder");
  const dimBig = eBig.querySelector(".vellumwidget-dim-layer");
  ok(!!dimBig, "large-dim: an overlay layer is present");
  fireOn(eBig.querySelector("svg"), "pointermove", eBig.querySelector('[data-key="k0"]'));
  ok(!eBig.classList.contains("vellumwidget-hovering"),
    "large-dim: hover does NOT add the O(n) vellumwidget-hovering dim class");
  ok(holderBig.style.opacity === "0.28", "large-dim: the holder is dimmed once on hover");
  ok(dimBig.childNodes.length === 1, "large-dim: the hovered mark is cloned into the overlay (crisp)");
  fireOn(eBig.querySelector("svg"), "pointerleave", eBig.querySelector("svg"));
  ok(holderBig.style.opacity === "" && dimBig.childNodes.length === 0,
    "large-dim: leaving clears the dim and empties the overlay");
}

console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
