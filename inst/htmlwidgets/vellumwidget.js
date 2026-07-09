// Generated from srcts/index.ts by esbuild — do not edit by hand.
"use strict";
(() => {
  // srcts/index.ts
  function rectsIntersect(a, b) {
    return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
  }
  function distToBbox(x, y, b) {
    const dx = Math.max(b.x0 - x, 0, x - b.x1);
    const dy = Math.max(b.y0 - y, 0, y - b.y1);
    return Math.sqrt(dx * dx + dy * dy);
  }
  function hasBbox(e) {
    return typeof e.x0 === "number" && typeof e.y0 === "number";
  }
  function brushKeys(elems, brush) {
    const out = [];
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (hasBbox(e) && rectsIntersect(e, brush)) out.push(e.key);
    }
    return out;
  }
  function nearestKey(elems, x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (!hasBbox(e)) continue;
      const d = distToBbox(x, y, e);
      if (d <= bestD) {
        bestD = d;
        best = e.key;
      }
    }
    return best;
  }
  function zoomViewBox(vb, factor, cx, cy) {
    const w = vb.w / factor;
    const h = vb.h / factor;
    return { x: cx - (cx - vb.x) / factor, y: cy - (cy - vb.y) / factor, w, h };
  }
  function parseViewBox(s) {
    if (!s) return null;
    const p = s.trim().split(/[ ,]+/).map(Number);
    if (p.length !== 4 || p.some((n) => !isFinite(n))) return null;
    return { x: p[0], y: p[1], w: p[2], h: p[3] };
  }
  function fmtViewBox(vb) {
    return vb.x + " " + vb.y + " " + vb.w + " " + vb.h;
  }
  function unionBbox(elems, keys) {
    let out = null;
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (!hasBbox(e) || !keys[e.key]) continue;
      if (!out) out = { x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1 };
      else {
        out.x0 = Math.min(out.x0, e.x0);
        out.y0 = Math.min(out.y0, e.y0);
        out.x1 = Math.max(out.x1, e.x1);
        out.y1 = Math.max(out.y1, e.y1);
      }
    }
    return out;
  }
  var STYLE_ID = "vellumwidget-style";
  var VELLUMWIDGET_CSS = `
.vellumwidget-root { position: relative; display: inline-block; max-width: 100%; }
.vellumwidget-root .vellumwidget-svg-holder svg { max-width: 100%; height: auto; display: block; }
.vellumwidget-gesture .vellumwidget-svg-holder svg { touch-action: none; }
.vellumwidget-root.vellumwidget-mode-pan .vellumwidget-svg-holder svg { cursor: grab; }
.vellumwidget-root.vellumwidget-panning .vellumwidget-svg-holder svg { cursor: grabbing; }
.vellumwidget-root [data-key] { cursor: pointer; }
[data-key].vellumwidget-filtered { display: none; }
.vellumwidget-hovering [data-key]:not(.vellumwidget-legend) { opacity: var(--vellumwidget-dim-opacity, 0.28); }
.vellumwidget-hovering [data-key].vellumwidget-hl { opacity: 1; }
/* Optional hover stroke, opt-in per element (.vellumwidget-hc) or widget-wide
   (.vellumwidget-hc-all on the root). Never applied to a mark that has no hover colour,
   so a bordered shape is not clobbered on hover. Colour resolves from the nearest
   --vellumwidget-hl-stroke (element var overrides the root var). */
.vellumwidget-hc-all [data-key].vellumwidget-hl, [data-key].vellumwidget-hc.vellumwidget-hl {
  stroke: var(--vellumwidget-hl-stroke); stroke-width: var(--vellumwidget-hl-width, 2px); paint-order: stroke fill;
}
[data-key].vellumwidget-selected {
  stroke: var(--vellumwidget-selected-stroke, #111827);
  stroke-width: var(--vellumwidget-selected-width, 1.4px); paint-order: stroke fill;
}
/* Keyboard focus ring on the currently-traversed mark (a11y). */
[data-key].vellumwidget-focus {
  stroke: var(--vellumwidget-focus-stroke, #2563eb);
  stroke-width: var(--vellumwidget-focus-width, 2.5px); paint-order: stroke fill;
}
[data-key]:focus { outline: none; }
[data-key]:focus-visible { outline: 2px solid var(--vellumwidget-focus-stroke, #2563eb); outline-offset: 1px; }
/* Visually-hidden but exposed to assistive technology (live region + data table). */
.vellumwidget-sr-only {
  position: absolute !important; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden; border: 0;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
.vellumwidget-tip {
  position: absolute; left: 0; top: 0; pointer-events: none; z-index: 20;
  background: var(--vellumwidget-tip-bg, rgba(17,24,39,0.94)); color: var(--vellumwidget-tip-fg, #fff);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  font-size: var(--vellumwidget-tip-fontsize, 12px); line-height: 1.45;
  padding: 5px 8px; border-radius: 5px; white-space: pre-wrap;
  max-width: var(--vellumwidget-tip-maxwidth, 320px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  opacity: 0; transition: opacity 0.08s ease; will-change: transform;
}
.vellumwidget-tip.vellumwidget-show { opacity: 1; }
.vellumwidget-brush {
  position: absolute; pointer-events: none; z-index: 15;
  border: 1px solid #2563eb; background: rgba(37,99,235,0.12); display: none;
}
.vellumwidget-toolbar {
  position: absolute; top: 6px; right: 6px; z-index: 25; display: flex; gap: 2px;
  padding: 3px; border-radius: 6px; background: rgba(255,255,255,0.82);
  box-shadow: 0 1px 4px rgba(0,0,0,0.18); opacity: 0; transition: opacity 0.12s;
}
.vellumwidget-root:hover .vellumwidget-toolbar { opacity: 1; }
.vellumwidget-toolbar button {
  border: 0; background: transparent; cursor: pointer; border-radius: 4px;
  font: 13px/1 system-ui, sans-serif; padding: 4px 6px; color: #111827;
}
.vellumwidget-toolbar button:hover { background: rgba(0,0,0,0.08); }
.vellumwidget-toolbar button.vellumwidget-active { background: rgba(37,99,235,0.18); }
@media (prefers-color-scheme: dark) {
  .vellumwidget-tip { background: var(--vellumwidget-tip-bg, rgba(243,244,246,0.96)); color: var(--vellumwidget-tip-fg, #111827); }
  [data-key].vellumwidget-selected { stroke: var(--vellumwidget-selected-stroke, #f9fafb); }
  .vellumwidget-toolbar { background: rgba(31,41,55,0.9); }
  .vellumwidget-toolbar button { color: #f3f4f6; }
  .vellumwidget-toolbar button:hover { background: rgba(255,255,255,0.12); }
}
`;
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = VELLUMWIDGET_CSS;
    document.head.appendChild(s);
  }
  function cssEscape(value) {
    const anyCss = window.CSS;
    if (anyCss && typeof anyCss.escape === "function") return anyCss.escape(value);
    return value.replace(/["\\\]\[#.:;,()>~+*^$|=@!%&{}\/\s]/g, "\\$&");
  }
  var TIP_TAGS = ["b", "i", "em", "strong", "br", "span"];
  function sanitizeTip(s) {
    let out = String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    for (const t of TIP_TAGS) {
      out = out.replace(new RegExp("&lt;" + t + "&gt;", "gi"), "<" + t + ">").replace(new RegExp("&lt;/" + t + "&gt;", "gi"), "</" + t + ">").replace(new RegExp("&lt;" + t + "\\s*/&gt;", "gi"), "<" + t + ">");
    }
    return out;
  }
  function stripTags(s) {
    return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
  function keyOf(target) {
    const el = target;
    if (!el || typeof el.closest !== "function") return null;
    const hit = el.closest("[data-key]");
    return hit ? hit.getAttribute("data-key") : null;
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  var DRAG_THRESHOLD = 3;
  var vellumwidgetBus = {};
  function busJoin(group, m) {
    (vellumwidgetBus[group] = vellumwidgetBus[group] || []).push(m);
  }
  function busPublish(group, sender, keys) {
    const members = vellumwidgetBus[group] || [];
    for (let i = 0; i < members.length; i++) {
      if (members[i].token !== sender) members[i].onSelect(keys);
    }
  }
  function getCrosstalk() {
    return window.crosstalk || null;
  }
  HTMLWidgets.widget({
    name: "vellumwidget",
    type: "output",
    factory: function(el) {
      ensureStyle();
      el.classList.add("vellumwidget-root");
      const tip = document.createElement("div");
      tip.className = "vellumwidget-tip";
      const brushBox = document.createElement("div");
      brushBox.className = "vellumwidget-brush";
      let holder = null;
      let svgEl = null;
      let toolbarEl = null;
      let meta = {};
      let groups = {};
      let legendIndex = {};
      let elements = [];
      let selected = {};
      let nodesByKey = {};
      let hoverRAF = 0;
      let opts = {
        tooltip: true,
        hover: true,
        select: true,
        brush: true,
        zoom: true,
        toolbar: true,
        nearest: true,
        a11y: true,
        selectMode: "multiple"
      };
      let liveRegion = null;
      let tableEl = null;
      let focusables = [];
      let focusIdx = -1;
      let vb0 = null;
      let vb = null;
      let mode = "brush";
      let lastBrush = null;
      const selfToken = {};
      let group = null;
      let joined = false;
      let ctSel = null;
      let ctFilt = null;
      function toUser(clientX, clientY) {
        if (svgEl && typeof svgEl.getScreenCTM === "function") {
          const ctm = svgEl.getScreenCTM();
          if (ctm && typeof svgEl.createSVGPoint === "function") {
            const p = svgEl.createSVGPoint();
            p.x = clientX;
            p.y = clientY;
            const u = p.matrixTransform(ctm.inverse());
            return { x: u.x, y: u.y };
          }
        }
        const r = (svgEl || el).getBoundingClientRect();
        const view = vb || { x: 0, y: 0, w: r.width || 1, h: r.height || 1 };
        const fx = r.width ? (clientX - r.left) / r.width : 0;
        const fy = r.height ? (clientY - r.top) / r.height : 0;
        return { x: view.x + fx * view.w, y: view.y + fy * view.h };
      }
      function elementsForKey(k) {
        const cached = nodesByKey[k];
        if (cached) return cached;
        if (!holder) return [];
        return Array.prototype.slice.call(holder.querySelectorAll('[data-key="' + cssEscape(k) + '"]'));
      }
      function addClassForKeys(keys, cls) {
        for (let i = 0; i < keys.length; i++) {
          const nodes = elementsForKey(keys[i]);
          for (let j = 0; j < nodes.length; j++) nodes[j].classList.add(cls);
        }
      }
      function clearClass(cls) {
        if (!holder) return;
        const nodes = holder.querySelectorAll("." + cls);
        for (let i = 0; i < nodes.length; i++) nodes[i].classList.remove(cls);
      }
      function linkedKeys(k) {
        const m = meta[k];
        if (m && m.legend_for != null) return (legendIndex[m.legend_for] || []).concat([k]);
        const g = m && m.hover_group;
        return g && groups[g] ? groups[g] : [k];
      }
      function setHover(k) {
        if (!opts.hover) return;
        el.classList.add("vellumwidget-hovering");
        clearClass("vellumwidget-hl");
        addClassForKeys(linkedKeys(k), "vellumwidget-hl");
      }
      function showTip(clientX, clientY, k) {
        const m = meta[k];
        tip.innerHTML = sanitizeTip(m && m.tooltip || k);
        const box = el.getBoundingClientRect();
        tip.style.transform = "translate(" + Math.round(clientX - box.left) + "px," + Math.round(clientY - box.top) + "px) translate(-50%, calc(-100% - 12px))";
        tip.classList.add("vellumwidget-show");
      }
      function hideTip() {
        tip.classList.remove("vellumwidget-show");
      }
      function clearHover() {
        el.classList.remove("vellumwidget-hovering");
        clearClass("vellumwidget-hl");
        hideTip();
        shinyInput("hover", null);
      }
      function shinyInput(event, value, opts2) {
        const hw = HTMLWidgets;
        const sh = window.Shiny;
        if (hw.shinyMode && sh && sh.setInputValue && el.id) {
          sh.setInputValue(el.id + "_" + event, value, opts2);
        }
      }
      function refreshSelected() {
        clearClass("vellumwidget-selected");
        for (const k in selected) if (selected[k]) addClassForKeys([k], "vellumwidget-selected");
      }
      function selectedKeys() {
        return Object.keys(selected).filter((k) => selected[k]);
      }
      function broadcast() {
        const keys = selectedKeys();
        if (group) busPublish(group, selfToken, keys);
        if (ctSel) ctSel.set(keys);
        shinyInput("selected", keys);
      }
      function toggleSelect(k) {
        const ks = linkedKeys(k);
        if (opts.selectMode === "single") {
          const allOn = ks.every((x) => selected[x]) && selectedKeys().length === ks.length;
          selected = {};
          if (!allOn) ks.forEach((x) => selected[x] = true);
        } else {
          const turnOn = !ks.every((x) => selected[x]);
          ks.forEach((x) => selected[x] = turnOn);
        }
        refreshSelected();
        broadcast();
      }
      function setSelection(keys) {
        selected = {};
        for (let i = 0; i < keys.length; i++) selected[keys[i]] = true;
        refreshSelected();
        broadcast();
      }
      function clearSelection() {
        selected = {};
        refreshSelected();
        broadcast();
      }
      function applyLinkedSelection(keys) {
        selected = {};
        for (let i = 0; i < keys.length; i++) selected[keys[i]] = true;
        refreshSelected();
        shinyInput("selected", selectedKeys());
      }
      function applyFilter(showKeys) {
        clearClass("vellumwidget-filtered");
        if (showKeys == null) return;
        const show = {};
        for (let i = 0; i < showKeys.length; i++) show[showKeys[i]] = true;
        for (let i = 0; i < elements.length; i++) {
          const key = elements[i].key;
          if (!show[key]) addClassForKeys([key], "vellumwidget-filtered");
        }
      }
      function setupLinking() {
        if (joined) return;
        joined = true;
        if (group) busJoin(group, { token: selfToken, onSelect: applyLinkedSelection });
        const ct = getCrosstalk();
        if (opts.crosstalk && ct) {
          ctSel = new ct.SelectionHandle(opts.crosstalk);
          ctFilt = new ct.FilterHandle(opts.crosstalk);
          ctSel.on("change", function(e) {
            if (e.sender !== ctSel) applyLinkedSelection(e.value || []);
          });
          ctFilt.on("change", function(e) {
            applyFilter(e.value);
          });
        }
      }
      function applyViewBox() {
        if (svgEl && vb) svgEl.setAttribute("viewBox", fmtViewBox(vb));
      }
      function resetZoom() {
        if (vb0) {
          vb = { x: vb0.x, y: vb0.y, w: vb0.w, h: vb0.h };
          applyViewBox();
        }
      }
      function zoomTo(rect, pad = 0.05) {
        if (!vb) return;
        const w = Math.max(rect.x1 - rect.x0, 1e-6);
        const h = Math.max(rect.y1 - rect.y0, 1e-6);
        const px = w * pad;
        const py = h * pad;
        vb = { x: rect.x0 - px, y: rect.y0 - py, w: w + 2 * px, h: h + 2 * py };
        applyViewBox();
      }
      function positionBrush(x, y, w, h) {
        brushBox.style.left = x + "px";
        brushBox.style.top = y + "px";
        brushBox.style.width = w + "px";
        brushBox.style.height = h + "px";
        brushBox.style.display = "block";
      }
      function hideBrush() {
        brushBox.style.display = "none";
      }
      let down = null;
      let dragging = "";
      let movedDuringDrag = false;
      const pointers = /* @__PURE__ */ new Map();
      let pinchDist = 0;
      function hoverAt(k, clientX, clientY) {
        if (k == null) {
          clearHover();
          return;
        }
        shinyInput("hover", k);
        setHover(k);
        if (opts.tooltip) showTip(clientX, clientY, k);
      }
      function onHoverMove(ev) {
        if (down || pinchDist > 0) return;
        const k = keyOf(ev.target);
        if (k != null) {
          if (hoverRAF) {
            cancelAnimationFrame(hoverRAF);
            hoverRAF = 0;
          }
          hoverAt(k, ev.clientX, ev.clientY);
          return;
        }
        if (!opts.nearest || !elements.length) {
          clearHover();
          return;
        }
        const cx = ev.clientX;
        const cy = ev.clientY;
        if (hoverRAF) return;
        hoverRAF = requestAnimationFrame(function() {
          hoverRAF = 0;
          const u = toUser(cx, cy);
          const rad = vb ? vb.w * 0.02 : 8;
          hoverAt(nearestKey(elements, u.x, u.y, rad), cx, cy);
        });
      }
      function onDragMove(ev) {
        if (pointers.has(ev.pointerId)) {
          pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
        }
        if (pinchDist > 0 && pointers.size >= 2 && vb) {
          const pts = Array.from(pointers.values());
          const d = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
          if (d > 0) {
            const u = toUser((pts[0].cx + pts[1].cx) / 2, (pts[0].cy + pts[1].cy) / 2);
            vb = zoomViewBox(vb, d / pinchDist, u.x, u.y);
            applyViewBox();
            pinchDist = d;
          }
          return;
        }
        if (!down) return;
        if (!dragging) {
          if (Math.abs(ev.clientX - down.cx) + Math.abs(ev.clientY - down.cy) <= DRAG_THRESHOLD) return;
          dragging = mode === "pan" && opts.zoom ? "pan" : opts.brush ? "brush" : "";
          if (dragging === "pan") el.classList.add("vellumwidget-panning");
          if (dragging === "") return;
          movedDuringDrag = true;
        }
        if (dragging === "brush") {
          const box = el.getBoundingClientRect();
          positionBrush(
            Math.min(down.cx, ev.clientX) - box.left,
            Math.min(down.cy, ev.clientY) - box.top,
            Math.abs(ev.clientX - down.cx),
            Math.abs(ev.clientY - down.cy)
          );
        } else if (dragging === "pan" && vb) {
          const u = toUser(ev.clientX, ev.clientY);
          vb.x -= u.x - down.ux;
          vb.y -= u.y - down.uy;
          applyViewBox();
          const u2 = toUser(ev.clientX, ev.clientY);
          down.ux = u2.x;
          down.uy = u2.y;
        }
      }
      function onDown(ev) {
        if (ev.pointerType === "mouse" && ev.button !== 0) return;
        pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
        window.addEventListener("pointermove", onDragMove);
        window.addEventListener("pointerup", onDragUp);
        window.addEventListener("pointercancel", onDragUp);
        if (pointers.size >= 2 && opts.zoom) {
          const pts = Array.from(pointers.values());
          pinchDist = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
          down = null;
          dragging = "";
          hideBrush();
          el.classList.remove("vellumwidget-panning");
          return;
        }
        const u = toUser(ev.clientX, ev.clientY);
        down = { cx: ev.clientX, cy: ev.clientY, ux: u.x, uy: u.y };
        dragging = "";
        movedDuringDrag = false;
      }
      function onDragUp(ev) {
        pointers.delete(ev.pointerId);
        const wasPinch = pinchDist > 0;
        if (pointers.size < 2) pinchDist = 0;
        if (pointers.size === 0) {
          window.removeEventListener("pointermove", onDragMove);
          window.removeEventListener("pointerup", onDragUp);
          window.removeEventListener("pointercancel", onDragUp);
        }
        if (wasPinch) {
          down = null;
          dragging = "";
          el.classList.remove("vellumwidget-panning");
          hideBrush();
          return;
        }
        if (dragging === "brush" && down) {
          const p1 = toUser(down.cx, down.cy);
          const p2 = toUser(ev.clientX, ev.clientY);
          const rect = {
            x0: Math.min(p1.x, p2.x),
            y0: Math.min(p1.y, p2.y),
            x1: Math.max(p1.x, p2.x),
            y1: Math.max(p1.y, p2.y)
          };
          lastBrush = rect;
          const hitKeys = brushKeys(elements, rect);
          if (opts.select) setSelection(hitKeys);
          shinyInput("brush", { keys: hitKeys, x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 }, { priority: "event" });
          hideBrush();
        }
        el.classList.remove("vellumwidget-panning");
        down = null;
        dragging = "";
      }
      function onClick(ev) {
        if (movedDuringDrag) {
          movedDuringDrag = false;
          return;
        }
        const k = keyOf(ev.target);
        shinyInput("click", { key: k }, { priority: "event" });
        if (k != null) {
          if (opts.select) toggleSelect(k);
        } else {
          clearSelection();
          lastBrush = null;
        }
      }
      function onWheel(ev) {
        if (!opts.zoom || !vb) return;
        ev.preventDefault();
        const u = toUser(ev.clientX, ev.clientY);
        const factor = ev.deltaY < 0 ? 1.2 : 1 / 1.2;
        vb = zoomViewBox(vb, factor, u.x, u.y);
        applyViewBox();
      }
      function onKey(ev) {
        if (ev.key === "Escape") {
          clearSelection();
          clearHover();
          clearClass("vellumwidget-focus");
          hideBrush();
          lastBrush = null;
          if (markFocused() && typeof el.focus === "function") el.focus();
          focusIdx = -1;
          return;
        }
        if (opts.a11y && markFocused()) {
          const k = focusables[focusIdx].key;
          if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
            focusRoving(focusIdx + 1);
            ev.preventDefault();
            return;
          }
          if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
            focusRoving(focusIdx - 1);
            ev.preventDefault();
            return;
          }
          if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
            if (opts.select) toggleSelect(k);
            announce(a11yLabel(k) + (selected[k] ? ", selected" : ", not selected"));
            ev.preventDefault();
            return;
          }
        }
        if (!opts.zoom || !vb) return;
        if (ev.key === "0") {
          resetZoom();
          ev.preventDefault();
          return;
        }
        const dx = vb.w * 0.12;
        const dy = vb.h * 0.12;
        const cx = vb.x + vb.w / 2;
        const cy = vb.y + vb.h / 2;
        let handled = true;
        switch (ev.key) {
          case "ArrowLeft":
            vb.x -= dx;
            break;
          case "ArrowRight":
            vb.x += dx;
            break;
          case "ArrowUp":
            vb.y -= dy;
            break;
          case "ArrowDown":
            vb.y += dy;
            break;
          case "+":
          case "=":
            vb = zoomViewBox(vb, 1.2, cx, cy);
            break;
          case "-":
          case "_":
            vb = zoomViewBox(vb, 1 / 1.2, cx, cy);
            break;
          default:
            handled = false;
        }
        if (handled) {
          applyViewBox();
          ev.preventDefault();
        }
      }
      function setMode(m) {
        mode = m;
        el.classList.toggle("vellumwidget-mode-pan", m === "pan");
        if (toolbarEl) {
          const b = toolbarEl.querySelector('[data-act="mode"]');
          if (b) {
            b.textContent = m === "pan" ? "\u270B" : "\u25AD";
            b.title = m === "pan" ? "Pan mode (click to brush-select)" : "Brush-select mode (click to pan)";
            b.classList.toggle("vellumwidget-active", m === "pan");
          }
        }
      }
      function exportName() {
        const n = opts.export && opts.export.filename;
        return n && String(n).length ? String(n) : "plot";
      }
      function exportScale() {
        const s = opts.export && opts.export.scale;
        return s && s > 0 ? s : 1;
      }
      function saveSvg() {
        if (!svgEl) return;
        const s = new XMLSerializer().serializeToString(svgEl);
        download(new Blob([s], { type: "image/svg+xml;charset=utf-8" }), exportName() + ".svg");
      }
      function toCanvas(then, fail) {
        if (!svgEl) return fail();
        const s = new XMLSerializer().serializeToString(svgEl);
        const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml;charset=utf-8" }));
        const img = new Image();
        img.onload = function() {
          const k = exportScale();
          const canvas = document.createElement("canvas");
          canvas.width = Math.round((vb0 ? vb0.w : img.width) * k);
          canvas.height = Math.round((vb0 ? vb0.h : img.height) * k);
          const ctx = canvas.getContext("2d");
          URL.revokeObjectURL(url);
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            then(canvas);
          } else {
            fail();
          }
        };
        img.onerror = function() {
          URL.revokeObjectURL(url);
          fail();
        };
        img.src = url;
      }
      function savePng() {
        toCanvas(
          function(canvas) {
            canvas.toBlob(function(b) {
              if (b) download(b, exportName() + ".png");
            });
          },
          saveSvg
          // canvas tainted / unsupported -> fall back to SVG
        );
      }
      function canCopy() {
        const nav = navigator;
        return !!(nav.clipboard && nav.clipboard.write && typeof ClipboardItem !== "undefined");
      }
      function copyPng() {
        if (!canCopy()) return;
        toCanvas(
          function(canvas) {
            canvas.toBlob(function(b) {
              if (!b) return;
              const nav = navigator;
              nav.clipboard.write([new ClipboardItem({ "image/png": b })]).catch(function() {
              });
            });
          },
          function() {
          }
        );
      }
      function toggleFullscreen() {
        const anyEl = el;
        const anyDoc = document;
        if (anyDoc.fullscreenElement) {
          if (anyDoc.exitFullscreen) anyDoc.exitFullscreen();
        } else if (anyEl.requestFullscreen) {
          anyEl.requestFullscreen();
        }
      }
      function zoomToSelection() {
        const rect = lastBrush || unionBbox(elements, selected);
        if (rect) zoomTo(rect);
      }
      function buildToolbar() {
        if (toolbarEl) {
          toolbarEl.remove();
          toolbarEl = null;
        }
        if (!opts.toolbar) return;
        const bar = document.createElement("div");
        bar.className = "vellumwidget-toolbar";
        const btn = (act, label, title, fn) => {
          const b = document.createElement("button");
          b.setAttribute("data-act", act);
          b.textContent = label;
          b.title = title;
          b.addEventListener("click", function(e) {
            e.stopPropagation();
            fn();
          });
          bar.appendChild(b);
          return b;
        };
        if (opts.brush && opts.zoom) btn("mode", "\u25AD", "Brush-select mode (click to pan)", () => setMode(mode === "brush" ? "pan" : "brush"));
        if (opts.zoom) {
          btn("zoomsel", "\u2316", "Zoom to selection", zoomToSelection);
          btn("reset", "\u27F2", "Reset zoom", resetZoom);
        }
        btn("svg", "SVG", "Download SVG", saveSvg);
        btn("png", "PNG", "Download PNG", savePng);
        if (canCopy()) btn("copy", "\u29C9", "Copy PNG to clipboard", copyPng);
        btn("full", "\u26F6", "Fullscreen", toggleFullscreen);
        el.appendChild(bar);
        toolbarEl = bar;
      }
      function applyStyling() {
        const s = opts.style || {};
        const setRoot = (name, v) => {
          if (v != null && v !== "") el.style.setProperty(name, String(v));
          else el.style.removeProperty(name);
        };
        setRoot("--vellumwidget-dim-opacity", s.dimOpacity);
        setRoot("--vellumwidget-selected-stroke", s.selectedColor);
        setRoot("--vellumwidget-tip-bg", s.tipBg);
        setRoot("--vellumwidget-tip-fg", s.tipFg);
        setRoot("--vellumwidget-tip-fontsize", s.tipFontSize);
        setRoot("--vellumwidget-tip-maxwidth", s.tipMaxWidth);
        if (s.hoverColor != null && s.hoverColor !== "") {
          el.style.setProperty("--vellumwidget-hl-stroke", s.hoverColor);
          el.classList.add("vellumwidget-hc-all");
        } else {
          el.style.removeProperty("--vellumwidget-hl-stroke");
          el.classList.remove("vellumwidget-hc-all");
        }
        for (let i = 0; i < elements.length; i++) {
          const e = elements[i];
          if (e.hover_color == null && e.selected_color == null && e.legend_for == null) continue;
          const nodes = elementsForKey(e.key);
          for (let j = 0; j < nodes.length; j++) {
            const n = nodes[j];
            if (e.hover_color != null) {
              n.style.setProperty("--vellumwidget-hl-stroke", e.hover_color);
              n.classList.add("vellumwidget-hc");
            }
            if (e.selected_color != null) {
              n.style.setProperty("--vellumwidget-selected-stroke", e.selected_color);
            }
            if (e.legend_for != null) n.classList.add("vellumwidget-legend");
          }
        }
      }
      function a11yLabel(k) {
        const m = meta[k];
        return m && m.tooltip ? stripTags(m.tooltip) : k;
      }
      function focusLabel(k) {
        return a11yLabel(k) + (selected[k] ? ", selected" : "");
      }
      function announce(msg) {
        if (liveRegion && liveRegion.textContent !== msg) liveRegion.textContent = msg;
      }
      function showMarkFocus(i) {
        focusIdx = i;
        const k = focusables[i].key;
        clearClass("vellumwidget-focus");
        addClassForKeys([k], "vellumwidget-focus");
        setHover(k);
        announce(focusLabel(k));
      }
      function onMarkFocus(ev) {
        const k = keyOf(ev.target);
        if (k == null) return;
        const i = focusables.findIndex((f) => f.key === k);
        if (i >= 0) showMarkFocus(i);
      }
      function onMarkBlur(ev) {
        const to = keyOf(ev.relatedTarget);
        if (to == null) {
          focusIdx = -1;
          clearClass("vellumwidget-focus");
        }
      }
      function focusRoving(i) {
        if (!focusables.length) return;
        const dir = i < focusIdx ? -1 : 1;
        if (i < 0) i = 0;
        if (i >= focusables.length) i = focusables.length - 1;
        while (focusables[i] && focusables[i].node.classList.contains("vellumwidget-filtered")) {
          i += dir;
          if (i < 0 || i >= focusables.length) return;
        }
        if (focusIdx >= 0 && focusables[focusIdx]) {
          focusables[focusIdx].node.setAttribute("tabindex", "-1");
        }
        const f = focusables[i];
        f.node.setAttribute("tabindex", "0");
        showMarkFocus(i);
        const n = f.node;
        if (typeof n.focus === "function") n.focus();
      }
      function markFocused() {
        return opts.a11y && focusIdx >= 0 && !!focusables[focusIdx];
      }
      function buildDataTable() {
        if (tableEl) {
          tableEl.remove();
          tableEl = null;
        }
        if (!opts.a11y || !elements.length) return;
        const tbl = document.createElement("table");
        tbl.className = "vellumwidget-sr-only vellumwidget-data-table";
        const cap = document.createElement("caption");
        cap.textContent = "Data table";
        tbl.appendChild(cap);
        const head = document.createElement("tr");
        const h1 = document.createElement("th");
        h1.setAttribute("scope", "col");
        h1.textContent = "Item";
        const h2 = document.createElement("th");
        h2.setAttribute("scope", "col");
        h2.textContent = "Description";
        head.appendChild(h1);
        head.appendChild(h2);
        tbl.appendChild(head);
        const seen = {};
        for (let i = 0; i < elements.length; i++) {
          const k = elements[i].key;
          if (seen[k]) continue;
          seen[k] = true;
          const tr = document.createElement("tr");
          const th = document.createElement("th");
          th.setAttribute("scope", "row");
          th.textContent = k;
          const td = document.createElement("td");
          td.textContent = a11yLabel(k);
          tr.appendChild(th);
          tr.appendChild(td);
          tbl.appendChild(tr);
        }
        el.appendChild(tbl);
        tableEl = tbl;
      }
      function setupA11y() {
        focusables = [];
        focusIdx = -1;
        if (!opts.a11y || !svgEl) {
          buildDataTable();
          return;
        }
        svgEl.setAttribute("role", "graphics-document");
        svgEl.setAttribute("aria-roledescription", "interactive chart");
        if (opts.alt) {
          svgEl.removeAttribute("aria-labelledby");
          svgEl.setAttribute("aria-label", opts.alt);
        } else if (!svgEl.getAttribute("aria-labelledby") && !svgEl.getAttribute("aria-label")) {
          svgEl.setAttribute("aria-label", "Interactive chart");
        }
        if (!liveRegion) {
          liveRegion = document.createElement("div");
          liveRegion.className = "vellumwidget-sr-only";
          liveRegion.setAttribute("role", "status");
          liveRegion.setAttribute("aria-live", "polite");
          el.appendChild(liveRegion);
        } else {
          liveRegion.textContent = "";
        }
        const seen = {};
        for (let i = 0; i < elements.length; i++) {
          const k = elements[i].key;
          if (seen[k]) continue;
          const nodes = nodesByKey[k];
          if (!nodes || !nodes.length) continue;
          seen[k] = true;
          const node = nodes[0];
          node.setAttribute("role", "graphics-symbol");
          node.setAttribute("tabindex", "-1");
          node.setAttribute("aria-label", a11yLabel(k));
          node.addEventListener("focus", onMarkFocus);
          node.addEventListener("blur", onMarkBlur);
          focusables.push({ key: k, node });
        }
        if (focusables.length) focusables[0].node.setAttribute("tabindex", "0");
        buildDataTable();
      }
      function wire(svg) {
        svg.addEventListener("pointermove", onHoverMove);
        svg.addEventListener("pointerleave", clearHover);
        svg.addEventListener("pointerdown", onDown);
        svg.addEventListener("click", onClick);
        if (opts.zoom) svg.addEventListener("wheel", onWheel, { passive: false });
        if (opts.zoom || opts.brush) el.classList.add("vellumwidget-gesture");
        el.setAttribute("tabindex", "0");
        el.addEventListener("keydown", onKey);
      }
      return {
        renderValue: function(x) {
          opts = Object.assign(
            { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: true, a11y: true, selectMode: "multiple" },
            x.options || {}
          );
          elements = x.elements || [];
          meta = {};
          groups = {};
          legendIndex = {};
          selected = {};
          lastBrush = null;
          mode = "brush";
          group = opts.group || null;
          for (let i = 0; i < elements.length; i++) {
            const e = elements[i];
            meta[e.key] = e;
            if (e.hover_group != null) (groups[e.hover_group] = groups[e.hover_group] || []).push(e.key);
            if (e.legend != null) {
              const series = Array.isArray(e.legend) ? e.legend : [e.legend];
              for (let s = 0; s < series.length; s++) {
                (legendIndex[series[s]] = legendIndex[series[s]] || []).push(e.key);
              }
            }
          }
          if (!holder) {
            holder = document.createElement("div");
            holder.className = "vellumwidget-svg-holder";
            el.appendChild(holder);
            el.appendChild(brushBox);
            el.appendChild(tip);
          }
          holder.innerHTML = x.svg;
          svgEl = holder.querySelector("svg");
          nodesByKey = {};
          if (holder) {
            const keyed = holder.querySelectorAll("[data-key]");
            for (let i = 0; i < keyed.length; i++) {
              const k = keyed[i].getAttribute("data-key");
              if (k != null) (nodesByKey[k] = nodesByKey[k] || []).push(keyed[i]);
            }
          }
          if (svgEl) {
            vb0 = parseViewBox(svgEl.getAttribute("viewBox"));
            if (!vb0) {
              const w = parseFloat(svgEl.getAttribute("width") || "0");
              const h = parseFloat(svgEl.getAttribute("height") || "0");
              if (w && h) vb0 = { x: 0, y: 0, w, h };
            }
            vb = vb0 ? { x: vb0.x, y: vb0.y, w: vb0.w, h: vb0.h } : null;
            wire(svgEl);
            buildToolbar();
            setMode("brush");
            applyStyling();
            setupA11y();
            setupLinking();
            shinyInput("selected", selectedKeys());
          }
        },
        resize: function() {
        }
      };
    }
  });
  window.__vellumwidgetTest = {
    rectsIntersect,
    distToBbox,
    brushKeys,
    nearestKey,
    zoomViewBox,
    parseViewBox,
    fmtViewBox,
    unionBbox,
    sanitizeTip
  };
})();
