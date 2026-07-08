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
fire("pointermove", aPaths[0]);
ok(tip.textContent === "Alpha", "hover shows the element's tooltip text");
ok(tip.classList.contains("gloss-show"), "tooltip becomes visible on hover");
ok(root.classList.contains("gloss-hovering"), "root enters hovering mode (dims others)");
ok(aPaths[0].classList.contains("gloss-hl"), "hovered element is highlighted");
ok(
  bPaths[0].classList.contains("gloss-hl") && bPaths[1].classList.contains("gloss-hl"),
  "all elements sharing the hover_group are highlighted"
);

// --- hover off -> clear ---
fire("pointerleave", svgEl);
ok(!tip.classList.contains("gloss-show"), "tooltip hides on mouseleave");
ok(!root.classList.contains("gloss-hovering"), "hovering mode cleared");
ok(el.querySelectorAll(".gloss-hl").length === 0, "highlight classes cleared");

// --- click -> select. "a" and "b" share hover_group "g1", so a click projects
//     to the whole group (field projection): every path of both keys selects. ---
fire("click", bPaths[0]);
ok(
  bPaths[0].classList.contains("gloss-selected") && bPaths[1].classList.contains("gloss-selected"),
  "click selects every path of the clicked key"
);
ok(aPaths[0].classList.contains("gloss-selected"), "click projects selection across the shared hover_group");

// --- click again -> deselect the whole projected group ---
fire("click", bPaths[0]);
ok(el.querySelectorAll(".gloss-selected").length === 0, "clicking a selected element deselects the group");

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
ok(el2.querySelector(".gloss-tip").textContent === "k9", "tooltip defaults to the data key");

// ===================== Phase 4: geometry helpers (pure) =====================
const T = window.__glossTest;
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
  const tipH = elH.querySelector(".gloss-tip");
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
const toolbar = el3.querySelector(".gloss-toolbar");
ok(!!toolbar, "toolbar is rendered");
ok(!!el3.querySelector(".gloss-brush"), "brush overlay element exists");
ok(el3.querySelectorAll(".gloss-toolbar button").length >= 5, "toolbar has the expected buttons");

// mode toggle -> pan
const modeBtn = el3.querySelector('.gloss-toolbar [data-act="mode"]');
ok(!!modeBtn, "mode toggle button present");
modeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(el3.classList.contains("gloss-mode-pan"), "mode toggle switches to pan mode");
modeBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(!el3.classList.contains("gloss-mode-pan"), "mode toggle switches back to brush mode");

// wheel zoom shrinks the viewBox; reset restores it
const before = svg3.getAttribute("viewBox");
const wheel = new window.WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true, clientX: 0, clientY: 0 });
Object.defineProperty(wheel, "target", { value: svg3 });
svg3.dispatchEvent(wheel);
const after = T.parseViewBox(svg3.getAttribute("viewBox"));
ok(after && after.w < 200, "wheel zoom-in shrinks the viewBox width");
el3.querySelector('.gloss-toolbar [data-act="reset"]').dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
ok(svg3.getAttribute("viewBox") === before, "reset restores the original viewBox");

// ===================== touch: pinch-zoom + keyboard pan =====================
function firePointer(target, type, id, clientX, clientY, onWindow) {
  const ev = new window.MouseEvent(type, { bubbles: true, clientX: clientX, clientY: clientY });
  Object.defineProperty(ev, "pointerId", { value: id });
  Object.defineProperty(ev, "pointerType", { value: "touch" });
  Object.defineProperty(ev, "target", { value: target });
  (onWindow ? window : target).dispatchEvent(ev);
}
ok(el3.classList.contains("gloss-gesture"), "gesture class set (touch-action:none) when zoom/brush on");
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
ok(!el3.querySelector('.gloss-toolbar [data-act="copy"]'), "copy button absent when the Clipboard API is unavailable");
ok(!!el3.querySelector('.gloss-toolbar [data-act="png"]'), "PNG download button always present");

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
  ok(target.classList.contains("gloss-hl"), "large-N: hover over a mark highlights it (via node cache)");
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
ok(elS.style.getPropertyValue("--gloss-dim-opacity") === "0.5", "theme: dim-opacity var set on root");
ok(elS.style.getPropertyValue("--gloss-hl-stroke") === "#ff0000", "theme: hover-stroke var set on root");
ok(elS.style.getPropertyValue("--gloss-selected-stroke") === "#00ff00", "theme: selected-stroke var set on root");
ok(elS.classList.contains("gloss-hc-all"), "theme: hover colour enables the widget-wide hover-stroke rule");

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
ok(pa.style.getPropertyValue("--gloss-hl-stroke") === "#123456", "per-element: hover-stroke var set on the element");
ok(pa.classList.contains("gloss-hc"), "per-element: element opts into the hover-stroke rule");
ok(pa.style.getPropertyValue("--gloss-selected-stroke") === "#654321", "per-element: selected-stroke var set on the element");
ok(pb2.style.getPropertyValue("--gloss-hl-stroke") === "", "per-element: unstyled element gets no override");
ok(!pb2.classList.contains("gloss-hc"), "per-element: unstyled element does not opt into the hover-stroke rule");
ok(!elP.classList.contains("gloss-hc-all"), "per-element: no widget-wide rule when only some elements are styled");

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
ok(elA.querySelector('[data-key="x"]').classList.contains("gloss-selected"), "own bus: local selection applied in A");
ok(elB.querySelector('[data-key="x"]').classList.contains("gloss-selected"), "own bus: selection linked into B");
ok(!elB.querySelector('[data-key="y"]').classList.contains("gloss-selected"), "own bus: only the linked key is selected in B");

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
  elG.querySelector('[data-key="x"]').classList.contains("gloss-selected") &&
    elG.querySelector('[data-key="y"]').classList.contains("gloss-selected"),
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
ok(elC.querySelector('[data-key="x"]').classList.contains("gloss-selected"), "crosstalk: incoming selection highlights the key");
ok(!elC.querySelector('[data-key="y"]').classList.contains("gloss-selected"), "crosstalk: incoming selection replaces the prior one");
// incoming filter -> non-matching elements hidden (display-tier cross-filter)
const peerFilt = new window.crosstalk.FilterHandle("G");
peerFilt.set(["x"]);
ok(elC.querySelector('[data-key="y"]').classList.contains("gloss-filtered"), "crosstalk: filter hides the non-matching element");
ok(!elC.querySelector('[data-key="x"]').classList.contains("gloss-filtered"), "crosstalk: filter keeps the matching element");
peerFilt.set(null);
ok(!elC.querySelector('[data-key="y"]').classList.contains("gloss-filtered"), "crosstalk: null filter clears the cross-filter");

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
ok(swatchS.classList.contains("gloss-legend"), "legend swatch is tagged gloss-legend (stays visible on hover)");
// hover the "s" swatch -> its whole series (p1, p2) highlights, but not q1
fireOn(elL.querySelector("svg"), "pointermove", swatchS);
ok(
  elL.querySelector('[data-key="p1"]').classList.contains("gloss-hl") &&
    elL.querySelector('[data-key="p2"]').classList.contains("gloss-hl"),
  "hovering a legend swatch highlights its whole series"
);
ok(!elL.querySelector('[data-key="q1"]').classList.contains("gloss-hl"), "other series is not highlighted");
fireOn(elL.querySelector("svg"), "pointerleave", elL.querySelector("svg"));
// click the "s" swatch -> selects the series
fireOn(elL.querySelector("svg"), "click", swatchS);
ok(
  elL.querySelector('[data-key="p1"]').classList.contains("gloss-selected") &&
    elL.querySelector('[data-key="p2"]').classList.contains("gloss-selected"),
  "clicking a legend swatch selects its whole series"
);
ok(!elL.querySelector('[data-key="q1"]').classList.contains("gloss-selected"), "other series is not selected");

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
  const table = elA11y.querySelector("table.gloss-data-table");
  ok(!!table, "a11y: a hidden data table is present");
  ok(table.querySelectorAll("tr").length === 3, "a11y: data table has a header + one row per mark");
  ok(table.textContent.indexOf("Point Y") !== -1, "a11y: data table lists a mark's description");

  // focus a mark -> announced, focus ring on
  xNode.dispatchEvent(new window.FocusEvent("focus", { bubbles: false }));
  ok(xNode.classList.contains("gloss-focus"), "a11y: focusing a mark draws the focus ring");
  ok(live.textContent === "Point X", "a11y: focusing a mark announces its label");

  // ArrowRight -> roving tabindex moves to the next mark
  svgA.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  ok(yNode.getAttribute("tabindex") === "0" && xNode.getAttribute("tabindex") === "-1",
    "a11y: ArrowRight moves the roving tabindex to the next mark");
  ok(live.textContent === "Point Y", "a11y: arrow navigation announces the newly focused mark");

  // Enter -> selects the focused mark, announced
  svgA.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  ok(yNode.classList.contains("gloss-selected"), "a11y: Enter selects the focused mark");
  ok(live.textContent.indexOf("selected") !== -1, "a11y: selection is announced");

  // a11y OFF -> no chart role override, no focusable marks, no table
  const elOff = mount({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" role="img"><path data-key="x" d="M1 1h9v9z"/></svg>',
    elements: [{ key: "x", tooltip: "X", x0: 1, y0: 1, x1: 10, y1: 10 }],
    options: { tooltip: true, hover: true, select: true, a11y: false, selectMode: "multiple" }
  });
  ok(elOff.querySelector("svg").getAttribute("role") === "img", "a11y off: svg role is left untouched");
  ok(elOff.querySelector('[data-key="x"]').getAttribute("tabindex") === null, "a11y off: marks are not focusable");
  ok(!elOff.querySelector("table.gloss-data-table"), "a11y off: no data table is built");

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
}

console.log(failures === 0 ? "\nALL PASS" : "\n" + failures + " FAILURE(S)");
process.exit(failures === 0 ? 0 : 1);
