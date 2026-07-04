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
  var STYLE_ID = "gloss-style";
  var GLOSS_CSS = `
.gloss-root { position: relative; display: inline-block; max-width: 100%; }
.gloss-root .gloss-svg-holder svg { max-width: 100%; height: auto; display: block; }
.gloss-root.gloss-mode-pan .gloss-svg-holder svg { cursor: grab; }
.gloss-root.gloss-panning .gloss-svg-holder svg { cursor: grabbing; }
.gloss-root [data-key] { cursor: pointer; }
.gloss-hovering [data-key] { opacity: var(--gloss-dim-opacity, 0.28); }
.gloss-hovering [data-key].gloss-hl { opacity: 1; }
/* Optional hover stroke, opt-in per element (.gloss-hc) or widget-wide
   (.gloss-hc-all on the root). Never applied to a mark that has no hover colour,
   so a bordered shape is not clobbered on hover. Colour resolves from the nearest
   --gloss-hl-stroke (element var overrides the root var). */
.gloss-hc-all [data-key].gloss-hl, [data-key].gloss-hc.gloss-hl {
  stroke: var(--gloss-hl-stroke); stroke-width: var(--gloss-hl-width, 2px); paint-order: stroke fill;
}
[data-key].gloss-selected {
  stroke: var(--gloss-selected-stroke, #111827);
  stroke-width: var(--gloss-selected-width, 1.4px); paint-order: stroke fill;
}
.gloss-tip {
  position: absolute; left: 0; top: 0; pointer-events: none; z-index: 20;
  background: rgba(17,24,39,0.94); color: #fff;
  font: 12px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  padding: 5px 8px; border-radius: 5px; white-space: pre-wrap; max-width: 320px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  opacity: 0; transition: opacity 0.08s ease; will-change: transform;
}
.gloss-tip.gloss-show { opacity: 1; }
.gloss-brush {
  position: absolute; pointer-events: none; z-index: 15;
  border: 1px solid #2563eb; background: rgba(37,99,235,0.12); display: none;
}
.gloss-toolbar {
  position: absolute; top: 6px; right: 6px; z-index: 25; display: flex; gap: 2px;
  padding: 3px; border-radius: 6px; background: rgba(255,255,255,0.82);
  box-shadow: 0 1px 4px rgba(0,0,0,0.18); opacity: 0; transition: opacity 0.12s;
}
.gloss-root:hover .gloss-toolbar { opacity: 1; }
.gloss-toolbar button {
  border: 0; background: transparent; cursor: pointer; border-radius: 4px;
  font: 13px/1 system-ui, sans-serif; padding: 4px 6px; color: #111827;
}
.gloss-toolbar button:hover { background: rgba(0,0,0,0.08); }
.gloss-toolbar button.gloss-active { background: rgba(37,99,235,0.18); }
@media (prefers-color-scheme: dark) {
  .gloss-tip { background: rgba(243,244,246,0.96); color: #111827; }
  [data-key].gloss-selected { stroke: var(--gloss-selected-stroke, #f9fafb); }
  .gloss-toolbar { background: rgba(31,41,55,0.9); }
  .gloss-toolbar button { color: #f3f4f6; }
  .gloss-toolbar button:hover { background: rgba(255,255,255,0.12); }
}
`;
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = GLOSS_CSS;
    document.head.appendChild(s);
  }
  function cssEscape(value) {
    const anyCss = window.CSS;
    if (anyCss && typeof anyCss.escape === "function") return anyCss.escape(value);
    return value.replace(/["\\\]\[#.:;,()>~+*^$|=@!%&{}\/\s]/g, "\\$&");
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
  HTMLWidgets.widget({
    name: "gloss",
    type: "output",
    factory: function(el) {
      ensureStyle();
      el.classList.add("gloss-root");
      const tip = document.createElement("div");
      tip.className = "gloss-tip";
      const brushBox = document.createElement("div");
      brushBox.className = "gloss-brush";
      let holder = null;
      let svgEl = null;
      let toolbarEl = null;
      let meta = {};
      let groups = {};
      let elements = [];
      let selected = {};
      let opts = {
        tooltip: true,
        hover: true,
        select: true,
        brush: true,
        zoom: true,
        toolbar: true,
        nearest: true,
        selectMode: "multiple"
      };
      let vb0 = null;
      let vb = null;
      let mode = "brush";
      let lastBrush = null;
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
      function highlightKeys(k) {
        const g = meta[k] && meta[k].hover_group;
        return g && groups[g] ? groups[g] : [k];
      }
      function setHover(k) {
        if (!opts.hover) return;
        el.classList.add("gloss-hovering");
        clearClass("gloss-hl");
        addClassForKeys(highlightKeys(k), "gloss-hl");
      }
      function showTip(clientX, clientY, k) {
        const m = meta[k];
        tip.textContent = m && m.tooltip || k;
        const box = el.getBoundingClientRect();
        tip.style.transform = "translate(" + Math.round(clientX - box.left) + "px," + Math.round(clientY - box.top) + "px) translate(-50%, calc(-100% - 12px))";
        tip.classList.add("gloss-show");
      }
      function hideTip() {
        tip.classList.remove("gloss-show");
      }
      function clearHover() {
        el.classList.remove("gloss-hovering");
        clearClass("gloss-hl");
        hideTip();
      }
      function refreshSelected() {
        clearClass("gloss-selected");
        for (const k in selected) if (selected[k]) addClassForKeys([k], "gloss-selected");
      }
      function toggleSelect(k) {
        if (opts.selectMode === "single") {
          const onlyThis = selected[k] && Object.keys(selected).filter((x) => selected[x]).length === 1;
          selected = {};
          if (!onlyThis) selected[k] = true;
        } else {
          selected[k] = !selected[k];
        }
        refreshSelected();
      }
      function setSelection(keys) {
        selected = {};
        for (let i = 0; i < keys.length; i++) selected[keys[i]] = true;
        refreshSelected();
      }
      function clearSelection() {
        selected = {};
        refreshSelected();
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
      function onHoverMove(ev) {
        if (down) return;
        let k = keyOf(ev.target);
        if (k == null && opts.nearest && elements.length) {
          const u = toUser(ev.clientX, ev.clientY);
          const rad = vb ? vb.w * 0.02 : 8;
          k = nearestKey(elements, u.x, u.y, rad);
        }
        if (k == null) {
          clearHover();
          return;
        }
        setHover(k);
        if (opts.tooltip) showTip(ev.clientX, ev.clientY, k);
      }
      function onDragMove(ev) {
        if (!down) return;
        if (!dragging) {
          if (Math.abs(ev.clientX - down.cx) + Math.abs(ev.clientY - down.cy) <= DRAG_THRESHOLD) return;
          dragging = mode === "pan" && opts.zoom ? "pan" : opts.brush ? "brush" : "";
          if (dragging === "pan") el.classList.add("gloss-panning");
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
        if (ev.button !== 0) return;
        const u = toUser(ev.clientX, ev.clientY);
        down = { cx: ev.clientX, cy: ev.clientY, ux: u.x, uy: u.y };
        dragging = "";
        movedDuringDrag = false;
        window.addEventListener("mousemove", onDragMove);
        window.addEventListener("mouseup", onDragUp);
      }
      function onDragUp(ev) {
        window.removeEventListener("mousemove", onDragMove);
        window.removeEventListener("mouseup", onDragUp);
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
          if (opts.select) setSelection(brushKeys(elements, rect));
          hideBrush();
        }
        el.classList.remove("gloss-panning");
        down = null;
        dragging = "";
      }
      function onClick(ev) {
        if (movedDuringDrag) {
          movedDuringDrag = false;
          return;
        }
        const k = keyOf(ev.target);
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
          hideBrush();
          lastBrush = null;
        }
      }
      function setMode(m) {
        mode = m;
        el.classList.toggle("gloss-mode-pan", m === "pan");
        if (toolbarEl) {
          const b = toolbarEl.querySelector('[data-act="mode"]');
          if (b) {
            b.textContent = m === "pan" ? "\u270B" : "\u25AD";
            b.title = m === "pan" ? "Pan mode (click to brush-select)" : "Brush-select mode (click to pan)";
            b.classList.toggle("gloss-active", m === "pan");
          }
        }
      }
      function saveSvg() {
        if (!svgEl) return;
        const s = new XMLSerializer().serializeToString(svgEl);
        download(new Blob([s], { type: "image/svg+xml;charset=utf-8" }), "plot.svg");
      }
      function savePng() {
        if (!svgEl) return;
        const s = new XMLSerializer().serializeToString(svgEl);
        const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml;charset=utf-8" }));
        const img = new Image();
        img.onload = function() {
          const canvas = document.createElement("canvas");
          canvas.width = vb0 ? vb0.w : img.width;
          canvas.height = vb0 ? vb0.h : img.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(function(b) {
              if (b) download(b, "plot.png");
            });
          }
          URL.revokeObjectURL(url);
        };
        img.onerror = function() {
          URL.revokeObjectURL(url);
          saveSvg();
        };
        img.src = url;
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
        bar.className = "gloss-toolbar";
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
        setRoot("--gloss-dim-opacity", s.dimOpacity);
        setRoot("--gloss-selected-stroke", s.selectedColor);
        if (s.hoverColor != null && s.hoverColor !== "") {
          el.style.setProperty("--gloss-hl-stroke", s.hoverColor);
          el.classList.add("gloss-hc-all");
        } else {
          el.style.removeProperty("--gloss-hl-stroke");
          el.classList.remove("gloss-hc-all");
        }
        for (let i = 0; i < elements.length; i++) {
          const e = elements[i];
          if (e.hover_color == null && e.selected_color == null) continue;
          const nodes = elementsForKey(e.key);
          for (let j = 0; j < nodes.length; j++) {
            const n = nodes[j];
            if (e.hover_color != null) {
              n.style.setProperty("--gloss-hl-stroke", e.hover_color);
              n.classList.add("gloss-hc");
            }
            if (e.selected_color != null) {
              n.style.setProperty("--gloss-selected-stroke", e.selected_color);
            }
          }
        }
      }
      function wire(svg) {
        svg.addEventListener("mousemove", onHoverMove);
        svg.addEventListener("mouseleave", clearHover);
        svg.addEventListener("mousedown", onDown);
        svg.addEventListener("click", onClick);
        if (opts.zoom) svg.addEventListener("wheel", onWheel, { passive: false });
        el.setAttribute("tabindex", "0");
        el.addEventListener("keydown", onKey);
      }
      return {
        renderValue: function(x) {
          opts = Object.assign(
            { tooltip: true, hover: true, select: true, brush: true, zoom: true, toolbar: true, nearest: true, selectMode: "multiple" },
            x.options || {}
          );
          elements = x.elements || [];
          meta = {};
          groups = {};
          selected = {};
          lastBrush = null;
          mode = "brush";
          for (let i = 0; i < elements.length; i++) {
            const e = elements[i];
            meta[e.key] = e;
            if (e.hover_group != null) (groups[e.hover_group] = groups[e.hover_group] || []).push(e.key);
          }
          if (!holder) {
            holder = document.createElement("div");
            holder.className = "gloss-svg-holder";
            el.appendChild(holder);
            el.appendChild(brushBox);
            el.appendChild(tip);
          }
          holder.innerHTML = x.svg;
          svgEl = holder.querySelector("svg");
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
          }
        },
        resize: function() {
        }
      };
    }
  });
  window.__glossTest = {
    rectsIntersect,
    distToBbox,
    brushKeys,
    nearestKey,
    zoomViewBox,
    parseViewBox,
    fmtViewBox,
    unionBbox
  };
})();
