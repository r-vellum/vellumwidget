// Generated from srcts/index.ts by esbuild — do not edit by hand.
"use strict";
(() => {
  // srcts/css.ts
  var STYLE_ID = "vellumwidget-style";
  var VELLUMWIDGET_CSS = `
.vellumwidget-root { position: relative; display: inline-block; max-width: 100%; }
/* The stage shrink-wraps the base svg in BOTH dimensions (inline-block sizes to
   content), so its box equals the svg's rendered box. The absolute overlays below
   fill THIS box, not the root's \u2014 the root can be taller AND wider than the svg
   (htmlwidgets stamps an explicit height; a fluid layout can stretch the width),
   and sizing the overlays to the root would letterbox their viewBox and shift
   every ring (down if the root is taller, sideways if it is wider). */
.vellumwidget-root .vellumwidget-stage { position: relative; display: inline-block; }
.vellumwidget-root .vellumwidget-svg-holder svg { max-width: 100%; height: auto; display: block; }
.vellumwidget-gesture .vellumwidget-svg-holder svg { touch-action: none; }
.vellumwidget-root.vellumwidget-mode-pan .vellumwidget-svg-holder svg { cursor: grab; }
.vellumwidget-root.vellumwidget-panning .vellumwidget-svg-holder svg { cursor: grabbing; }
.vellumwidget-root [data-key] { cursor: pointer; }
[data-key].vellumwidget-filtered { display: none; }
/* Legend click-to-hide / -mute (independent of the crosstalk cross-filter above,
   so the two never clobber each other). hidden removes the series' marks; muted
   keeps them but fades them right back; legend-off dims the toggled-off swatch
   so the legend shows which series are on. */
[data-key].vellumwidget-legend-hidden { display: none; }
[data-key].vellumwidget-legend-muted { opacity: 0.12; }
[data-key].vellumwidget-legend.vellumwidget-legend-off { opacity: 0.4; }
.vellumwidget-hovering [data-key]:not(.vellumwidget-legend) { opacity: var(--vellumwidget-dim-opacity, 0.28); }
.vellumwidget-hovering [data-key].vellumwidget-hl { opacity: 1; }
/* Conditional encoding (condition()): a non-member of an active selection with no
   explicit if_false is dimmed to the theme's dim opacity (the spotlight). An
   explicit if_false colour is applied inline (see applyConditions()). */
[data-key].vellumwidget-cond-dim { opacity: var(--vellumwidget-dim-opacity, 0.28); }
/* Large-scene hover: instead of the CSS rule above restyling every keyed node
   (O(n) per hover), the whole plot is dimmed once via the holder's opacity and the
   hovered marks are re-drawn crisp in this overlay (O(hovered)). See setHover(). */
.vellumwidget-root .vellumwidget-svg-holder { transition: none; }
/* Crisp-zoom point layer: above the base image, below the overlay rings. Never
   intercepts hit-testing (that stays on the base svg). Hidden until zoomed in. */
.vellumwidget-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 2; display: none;
}
/* Blend runs (VW-32): a run with a blend mode is a canvas of its own stacked
   over the marks canvas (inline mix-blend-mode), the marks after it on the
   next one up. While any is shown the stage isolates the blending, so it
   mixes with the widget's own furniture and marks, not the page. */
.vellumwidget-canvas-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 2; display: none;
}
.vellumwidget-root .vellumwidget-stage.vellumwidget-blend-iso { isolation: isolate; }
/* Paint-order split (VW-21): the furniture drawn after the marks (a reference
   line or annotation added after the points), over the marks canvas and under
   the re-ticked labels and rings. Never a pointer target, so picking still
   reaches the marks beneath. */
.vellumwidget-above-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 2; overflow: hidden;
}
.vellumwidget-dim-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 5; overflow: visible;
}
/* Continuous colorbar filter: an overlay on the gradient bar. The dim rects cover
   the out-of-range ends; the handles are draggable. Out-of-range marks fade. */
.vellumwidget-colorbar-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 6; overflow: visible;
}
.vellumwidget-cb-dim { fill: var(--vellumwidget-wash, rgba(255,255,255,0.66)); pointer-events: none; }
.vellumwidget-cb-handle {
  fill: #ffffff; stroke: #2563eb; stroke-width: 1.5px; pointer-events: auto;
}
.vellumwidget-root.vellumwidget-cb-v .vellumwidget-cb-handle { cursor: ns-resize; }
.vellumwidget-root.vellumwidget-cb-h .vellumwidget-cb-handle { cursor: ew-resize; }
[data-key].vellumwidget-colorfiltered { opacity: var(--vellumwidget-colorfilter-opacity, 0.12); }
/* Crosshair guide rule(s) for unified hover \u2014 above the base image / canvas,
   below the highlight rings so a highlighted mark still reads on top. */
.vellumwidget-crosshair-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 4; overflow: visible;
}
/* Axis-aware zoom: re-ticked axis LABELS overlay (gridlines are drawn inside the
   base svg's panel, under the marks). Pinned to the fixed base coordinate space. */
.vellumwidget-retick-layer {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; z-index: 3; overflow: visible;
}
.vellumwidget-crosshair-line {
  stroke: var(--vellumwidget-crosshair-stroke, var(--vellumwidget-ink-soft, rgba(75,85,99,0.85)));
  stroke-width: 1px; stroke-dasharray: 4 3;
}
/* Raster-mode feedback rings (hover / selection), drawn on the overlay since the
   marks are a base image with no per-element nodes. Colours reuse the same CSS
   variables as the SVG-mode highlight/selection so theming carries over. */
.vellumwidget-fb-hov { fill: none; stroke: var(--vellumwidget-hl-stroke, #2563eb); stroke-width: 2px; }
.vellumwidget-fb-sel { fill: none; stroke: var(--vellumwidget-selected-stroke, var(--vellumwidget-ink, #111827)); stroke-width: 1.6px; }
/* Optional hover stroke, opt-in per element (.vellumwidget-hc) or widget-wide
   (.vellumwidget-hc-all on the root). Never applied to a mark that has no hover colour,
   so a bordered shape is not clobbered on hover. Colour resolves from the nearest
   --vellumwidget-hl-stroke (element var overrides the root var).
   The rings use paint-order: normal (stroke over fill), so the whole ring shows
   whether a keyed mark is one element carrying both fill and stroke (newer
   vellum) or a fill followed by a fill="none" stroke twin (older vellum).
   Painting the stroke under the fill, a single element's fill would hide the inner
   half of the ring. */
.vellumwidget-hc-all [data-key].vellumwidget-hl, [data-key].vellumwidget-hc.vellumwidget-hl {
  stroke: var(--vellumwidget-hl-stroke); stroke-width: var(--vellumwidget-hl-width, 2px); paint-order: normal;
}
/* Selection / crosshair ink (--vellumwidget-ink*) is set on the root from the
   plot's own background, not the OS colour scheme (VW-20). */
[data-key].vellumwidget-selected {
  stroke: var(--vellumwidget-selected-stroke, var(--vellumwidget-ink, #111827));
  stroke-width: var(--vellumwidget-selected-width, 1.4px); paint-order: normal;
}
/* Keyboard focus ring on the currently-traversed mark (a11y). */
[data-key].vellumwidget-focus {
  stroke: var(--vellumwidget-focus-stroke, #2563eb);
  stroke-width: var(--vellumwidget-focus-width, 2.5px); paint-order: normal;
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
/* Sticky tooltip: accepts pointer events so links/buttons inside it are usable. */
.vellumwidget-tip.vellumwidget-tip-sticky { pointer-events: auto; }
.vellumwidget-brush {
  position: absolute; pointer-events: none; z-index: 15;
  border: 1px solid #2563eb; background: rgba(37,99,235,0.12); display: none;
}
/* Overview navigator: a full-width strip below the plot (a squashed mini-render
   of the whole scene) with a draggable/resizable window marking the visible x-range. */
.vellumwidget-nav {
  position: relative; width: 100%; margin-top: 4px; box-sizing: border-box;
  border: 1px solid rgba(0,0,0,0.12); border-radius: 4px; overflow: hidden;
  background: rgba(0,0,0,0.02); touch-action: none; user-select: none;
}
.vellumwidget-nav-mini { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; opacity: 0.85; }
.vellumwidget-nav-mini svg { width: 100%; height: 100%; display: block; }
/* The two regions outside the window are dimmed; the window itself is clear. */
.vellumwidget-nav-window {
  position: absolute; top: 0; bottom: 0; z-index: 2; cursor: grab;
  border-left: 1px solid #2563eb; border-right: 1px solid #2563eb;
  background: rgba(37,99,235,0.10); box-shadow: 0 0 0 100vmax rgba(0,0,0,0.12);
}
.vellumwidget-nav-window.vellumwidget-nav-grabbing { cursor: grabbing; }
.vellumwidget-nav-handle {
  position: absolute; top: 0; bottom: 0; width: 8px; z-index: 3; cursor: ew-resize;
  background: #2563eb; opacity: 0.35;
}
.vellumwidget-nav-handle-l { left: -1px; }
.vellumwidget-nav-handle-r { right: -1px; }
@media (prefers-color-scheme: dark) {
  .vellumwidget-nav { border-color: rgba(255,255,255,0.18); background: rgba(255,255,255,0.03); }
}
.vellumwidget-root.vellumwidget-mode-lasso .vellumwidget-svg-holder svg { cursor: crosshair; }
.vellumwidget-lasso {
  fill: rgba(37,99,235,0.10); stroke: #2563eb; stroke-width: 1px; stroke-dasharray: 4 3;
}
/* The persistent band of an active interval selection (select_interval()). */
.vellumwidget-interval {
  fill: rgba(37,99,235,0.10); stroke: #2563eb; stroke-width: 1px;
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
  var STATE_SEL = [
    "vellumwidget-cond-dim",
    "vellumwidget-colorfiltered",
    "vellumwidget-legend-muted",
    "vellumwidget-legend-off",
    "vellumwidget-selected",
    "vellumwidget-filtered",
    "vellumwidget-legend-hidden"
  ].map((c) => "[data-key]." + c).join(", ");
  function cssVar(cs, name, fallback) {
    const v = cs ? cs.getPropertyValue(name).trim() : "";
    return v || fallback;
  }
  function inlineStateStyles(live, clone) {
    const a = live.querySelectorAll(STATE_SEL);
    const b = clone.querySelectorAll(STATE_SEL);
    if (a.length !== b.length) return;
    for (let i = 0; i < a.length; i++) {
      const n = a[i], c = b[i], cl = n.classList;
      if (cl.contains("vellumwidget-filtered") || cl.contains("vellumwidget-legend-hidden")) {
        c.style.display = "none";
        continue;
      }
      let cs = null;
      try {
        cs = window.getComputedStyle(n);
      } catch (e) {
        cs = null;
      }
      if (!n.style.opacity) {
        let op = "";
        if (cl.contains("vellumwidget-legend-off") && cl.contains("vellumwidget-legend")) op = "0.4";
        else if (cl.contains("vellumwidget-colorfiltered")) op = cssVar(cs, "--vellumwidget-colorfilter-opacity", "0.12");
        else if (cl.contains("vellumwidget-cond-dim")) op = n.style.getPropertyValue("--vellumwidget-dim-opacity").trim() || cssVar(cs, "--vellumwidget-dim-opacity", "0.28");
        else if (cl.contains("vellumwidget-legend-muted")) op = "0.12";
        if (op) c.style.opacity = op;
      }
      if (cl.contains("vellumwidget-selected")) {
        c.style.stroke = cssVar(cs, "--vellumwidget-selected-stroke", cssVar(cs, "--vellumwidget-ink", "#111827"));
        c.style.strokeWidth = cssVar(cs, "--vellumwidget-selected-width", "1.4px");
        c.style.setProperty("paint-order", "normal");
      }
    }
  }

  // srcts/dom.ts
  function keyOf(target) {
    const el = target;
    if (!el || typeof el.closest !== "function") return null;
    const hit = el.closest("[data-key]");
    return hit ? hit.getAttribute("data-key") : null;
  }
  function vellumIdOf(target) {
    const el = target;
    if (!el || typeof el.closest !== "function") return null;
    const hit = el.closest("[data-vellum-id]");
    return hit ? hit.getAttribute("data-vellum-id") : null;
  }
  function sourceTable(prov, id) {
    const name = prov.sourceOf && prov.sourceOf[id] || "plot";
    const tbl = name !== "plot" && prov.sources ? prov.sources[name] : void 0;
    if (!tbl) return { source: "plot", fields: prov.fields, values: prov.values };
    const fields = Array.isArray(tbl.fields) ? tbl.fields : tbl.fields == null ? [] : [tbl.fields];
    return { source: name, fields, values: tbl.values };
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

  // srcts/elements.ts
  function asColumn(v) {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }
  function b64bytes(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function dlColumn(c) {
    const n = c ? c.n || 0 : 0;
    const make = (len) => {
      const t = c ? c.type : "u32";
      return t === "f32" ? new Float32Array(len) : t === "u8" ? new Uint8Array(len) : t === "u16" ? new Uint16Array(len) : new Uint32Array(len);
    };
    if (!c || !n) return make(0);
    if (c.const != null) {
      const a = make(n);
      a.fill(c.const);
      return a;
    }
    if (c.seq != null) {
      const s = asColumn(c.seq), a = make(n);
      for (let i = 0; i < n; i++) a[i] = s[0] + s[1] * i;
      return a;
    }
    if (c.rle != null) {
      const v = asColumn(c.rle.values), l = asColumn(c.rle.lengths), a = make(n);
      let o = 0;
      for (let i = 0; i < v.length; i++) {
        a.fill(v[i], o, o + l[i]);
        o += l[i];
      }
      return a;
    }
    const bytes = b64bytes(c.data || "");
    if (c.step != null) {
      const w = c.type === "u8" ? 1 : c.type === "u16" ? 2 : 3;
      const lo = Number(c.lo) || 0, step = Number(c.step), a = new Float32Array(n);
      if (w === 1) for (let i = 0; i < n; i++) a[i] = lo + bytes[i] * step;
      else if (w === 2) for (let i = 0, p = 0; i < n; i++, p += 2) a[i] = lo + (bytes[p] | bytes[p + 1] << 8) * step;
      else for (let i = 0, p = 0; i < n; i++, p += 3) a[i] = lo + (bytes[p] | bytes[p + 1] << 8 | bytes[p + 2] << 16) * step;
      return a;
    }
    if (c.bits) {
      const k = Number(c.bits), a = make(n);
      let pos = 0;
      if (k <= 24) {
        const mask = (1 << k) - 1;
        for (let i = 0; i < n; i++, pos += k) {
          const o = pos >> 3;
          a[i] = (bytes[o] | bytes[o + 1] << 8 | bytes[o + 2] << 16 | bytes[o + 3] << 24) >>> (pos & 7) & mask;
        }
        return a;
      }
      for (let i = 0; i < n; i++) {
        let v = 0;
        for (let b = 0; b < k; b++, pos++) if (bytes[pos >> 3] & 1 << (pos & 7)) v += 2 ** b;
        a[i] = v;
      }
      return a;
    }
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (c.type === "f32") return new Float32Array(buf, 0, n);
    if (c.type === "u16") return new Uint16Array(buf, 0, n);
    if (c.type === "u32") return new Uint32Array(buf, 0, n);
    return new Uint8Array(buf, 0, n);
  }
  function decodeDeltas(db, dx, dv, json) {
    if (db == null) return asColumn(json);
    const d = Float64Array.from(dlColumn(db)), at = asColumn(dx), val = asColumn(dv);
    for (let k = 0; k < at.length; k++) d[at[k]] = val[k];
    return d;
  }
  var KEY_INT = /(0|[1-9][0-9]{0,14})$/;
  function decodeTemplate(o, n, keys) {
    const tpl = asColumn(o.tpl).map((p) => asColumn(p).map(String));
    const tc = dlColumn(o.tc);
    const keyW = [];
    const streams = asColumn(o.tn).map((st, j) => {
      if (st === "key") return null;
      const s = st;
      if (s.key != null) {
        const wc = typeof s.w === "object" ? dlColumn(s.w) : null, w0 = Number(s.w) || 0;
        let k = 0;
        keyW[j] = wc ? () => wc[k++] : () => w0;
        return null;
      }
      let out2;
      if (s.d != null || s.db != null) {
        const d = decodeDeltas(s.db, s.dx, s.dv, s.d);
        out2 = new Array(d.length);
        let run = 0;
        for (let i = 0; i < d.length; i++) {
          run += d[i];
          out2[i] = String(run);
        }
      } else if (s.vb != null) {
        out2 = Array.from(dlColumn(s.vb), String);
      } else {
        out2 = asColumn(s.v).map(String);
      }
      if (s.w != null) {
        const wc = typeof s.w === "object" ? dlColumn(s.w) : null, w0 = Number(s.w);
        for (let i = 0; i < out2.length; i++) {
          const w = wc ? wc[i] : w0;
          if (out2[i].length < w) out2[i] = "0".repeat(w - out2[i].length) + out2[i];
        }
      }
      return out2;
    });
    const at = new Array(streams.length).fill(0);
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const c = tc[i];
      if (!c || c > tpl.length) {
        out[i] = null;
        continue;
      }
      const parts = tpl[c - 1];
      let s = parts[0];
      for (let j = 1; j < parts.length; j++) {
        const st = streams[j - 1];
        let num = "";
        if (st === null) {
          const m = keys && keys[i] != null ? KEY_INT.exec(keys[i]) : null;
          num = m ? m[1] : "";
          const pw = keyW[j - 1];
          if (pw) {
            const w = pw(i);
            if (num.length < w) num = "0".repeat(w - num.length) + num;
          }
        } else if (st) {
          num = st[at[j - 1]++];
        }
        s += num + parts[j];
      }
      out[i] = s;
    }
    return out;
  }
  function decodeColumn(v, n, keys) {
    if (v == null) return null;
    if (typeof v === "object" && !Array.isArray(v)) {
      if (v.tpl !== void 0 && v.tc !== void 0) {
        return decodeTemplate(v, n, keys);
      }
      const o = v;
      if (o.levels !== void 0 && o.cb !== void 0) {
        const levels = asColumn(o.levels);
        const cb = dlColumn(o.cb);
        const out = new Array(n);
        for (let i = 0; i < n; i++) {
          const c = cb[i];
          out[i] = c ? levels[c - 1] : null;
        }
        return out;
      }
      if (o.at !== void 0 && o.v !== void 0) {
        const at = asColumn(o.at);
        const vals = asColumn(o.v);
        const out = new Array(n).fill(null);
        for (let i = 0; i < at.length; i++) out[at[i]] = vals[i];
        return out;
      }
      if (o.levels !== void 0 && o.rv !== void 0 && o.rl !== void 0) {
        const levels = asColumn(o.levels);
        const rv = asColumn(o.rv), rl = asColumn(o.rl);
        const out = new Array(n);
        let k = 0;
        for (let r = 0; r < rv.length; r++) {
          const val = rv[r] < 0 ? null : levels[rv[r]];
          for (let m = 0; m < rl[r]; m++) out[k++] = val;
        }
        return out;
      }
      if (o.levels !== void 0 && o.codes !== void 0) {
        const levels = asColumn(o.levels);
        const codes = asColumn(o.codes);
        const out = new Array(codes.length);
        for (let i = 0; i < codes.length; i++) {
          const c = codes[i];
          out[i] = c == null ? null : levels[c];
        }
        return out;
      }
    }
    return asColumn(v);
  }
  function decodeKeys(v) {
    if (v != null && typeof v === "object" && !Array.isArray(v) && ("delta" in v || "db" in v)) {
      const o = v;
      const delta = decodeDeltas(o.db, o.dx, o.dv, o.delta);
      const at = asColumn(o.at), other = asColumn(o.v);
      const pre = o.pre != null ? decodeColumn(o.pre, delta.length) : null;
      const n = delta.length + at.length;
      const out = new Array(n);
      let j = 0, a = 0, run = 0;
      for (let i = 0; i < n; i++) {
        if (a < at.length && at[a] === i) {
          out[i] = String(other[a++]);
          continue;
        }
        const p = pre ? pre[j] : null;
        run += delta[j++];
        out[i] = (p == null ? "" : p) + String(run);
      }
      return out;
    }
    return asColumn(v).map(String);
  }
  function decodeBbox(b) {
    const n = Number(b.n) || 0;
    const lo = asColumn(b.lo).map(Number);
    const ux = dlColumn(b.x0), uy = dlColumn(b.y0);
    const uw = dlColumn(b.w), uh = dlColumn(b.h);
    const x0 = new Array(n), y0 = new Array(n);
    const x1 = new Array(n), y1 = new Array(n);
    for (let i = 0; i < n; i++) {
      const gx = lo[0] + ux[i], gy = lo[1] + uy[i];
      x0[i] = gx / 100;
      y0[i] = gy / 100;
      x1[i] = (gx + lo[2] + uw[i]) / 100;
      y1[i] = (gy + lo[3] + uh[i]) / 100;
    }
    const na = asColumn(b.na);
    for (let k = 0; k < na.length; k++) {
      const i = na[k];
      x0[i] = y0[i] = x1[i] = y1[i] = null;
    }
    if (b.ex) {
      const at = asColumn(b.ex.at), ex0 = asColumn(b.ex.x0), ey0 = asColumn(b.ex.y0);
      const ex1 = asColumn(b.ex.x1), ey1 = asColumn(b.ex.y1);
      for (let k = 0; k < at.length; k++) {
        const i = at[k];
        x0[i] = ex0[k];
        y0[i] = ey0[k];
        x1[i] = ex1[k];
        y1[i] = ey1[k];
      }
    }
    return { x0, y0, x1, y1 };
  }
  function normalizeElements(raw) {
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw;
    const c = raw;
    const key = decodeKeys(c.key);
    const n = key.length;
    if (!n) return [];
    const col = (f) => decodeColumn(c[f], n, key);
    const bb = c.bbox ? decodeBbox(c.bbox) : null;
    const x0 = bb ? bb.x0 : col("x0") || [];
    const y0 = bb ? bb.y0 : col("y0") || [];
    const x1 = bb ? bb.x1 : col("x1") || [];
    const y1 = bb ? bb.y1 : col("y1") || [];
    const mark = col("mark");
    const tooltip = col("tooltip");
    const hoverGroup = col("hover_group");
    const hoverColor = col("hover_color");
    const selectedColor = col("selected_color");
    const legendFor = col("legend_for");
    const legend = col("legend");
    const filterValue = col("filter_value");
    const cond = col("cond");
    const condValue = [];
    if (c.cond_value && typeof c.cond_value === "object") {
      for (const t in c.cond_value) {
        const v = decodeColumn(c.cond_value[t], n, key);
        if (v) condValue.push([t, v]);
      }
    }
    const filt = col("filt");
    const join = col("join");
    const source = col("source");
    const target = col("target");
    const ivNum = ["ix", "ixh", "iy", "iyh"].map(
      (f) => [f, col(f)]
    );
    const ixd = col("ixd");
    const iyd = col("iyd");
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
      const e = { key: String(key[i]) };
      if (mark && mark[i] != null) e.mark = String(mark[i]);
      if (typeof x0[i] === "number") e.x0 = x0[i];
      if (typeof y0[i] === "number") e.y0 = y0[i];
      if (typeof x1[i] === "number") e.x1 = x1[i];
      if (typeof y1[i] === "number") e.y1 = y1[i];
      if (tooltip && tooltip[i] != null) e.tooltip = String(tooltip[i]);
      if (hoverGroup && hoverGroup[i] != null) e.hover_group = String(hoverGroup[i]);
      if (hoverColor && hoverColor[i] != null) e.hover_color = String(hoverColor[i]);
      if (selectedColor && selectedColor[i] != null) e.selected_color = String(selectedColor[i]);
      if (legendFor && legendFor[i] != null) e.legend_for = String(legendFor[i]);
      if (legend) {
        const v = legend[i];
        if (v != null && !(Array.isArray(v) && v.length === 0)) e.legend = v;
      }
      if (filterValue && typeof filterValue[i] === "number") e.filter_value = filterValue[i];
      if (cond) {
        const v = cond[i];
        if (v != null && !(Array.isArray(v) && v.length === 0)) {
          e.cond = Array.isArray(v) ? v : [String(v)];
        }
      }
      for (let t = 0; t < condValue.length; t++) {
        const v = condValue[t][1][i];
        if (v != null) (e.cond_value = e.cond_value || {})[condValue[t][0]] = String(v);
      }
      if (filt) {
        const v = filt[i];
        if (v != null && !(Array.isArray(v) && v.length === 0)) {
          e.filt = Array.isArray(v) ? v : [String(v)];
        }
      }
      if (join && join[i] != null) e.join = String(join[i]);
      if (source && source[i] != null) e.source = String(source[i]);
      if (target && target[i] != null) e.target = String(target[i]);
      for (let f = 0; f < ivNum.length; f++) {
        const col2 = ivNum[f][1];
        if (col2 && typeof col2[i] === "number") e[ivNum[f][0]] = col2[i];
      }
      if (ixd && ixd[i] != null) e.ixd = String(ixd[i]);
      if (iyd && iyd[i] != null) e.iyd = String(iyd[i]);
      out[i] = e;
    }
    return out;
  }
  function normalizePanels(raw) {
    if (raw == null) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  // srcts/dlist.ts
  var DL_POINT = 0;
  var DL_RECT = 1;
  var DL_PATH = 2;
  var DL_FLAG_PICK = 16;
  var DL_FLAG_BLEND = 32;
  var BLEND_MODES = {
    multiply: true,
    screen: true,
    overlay: true,
    darken: true,
    lighten: true,
    "color-dodge": true,
    "color-burn": true,
    "hard-light": true,
    "soft-light": true,
    difference: true,
    exclusion: true,
    hue: true,
    saturation: true,
    color: true,
    luminosity: true
  };
  var u32 = (a) => a instanceof Uint32Array ? a : Uint32Array.from(a);
  var f32 = (a) => a instanceof Float32Array ? a : Float32Array.from(a);
  var u8 = (a) => a instanceof Uint8Array ? a : Uint8Array.from(a);
  function isNa(s) {
    return s == null || s === "NA" || s === "";
  }
  function opaqueHex(s) {
    return s == null || !/^#[0-9a-fA-F]{8}$/.test(s) || /ff$/i.test(s);
  }
  function decodeDisplayList(raw, elemKeys) {
    if (!raw || raw.format !== "vellum-display-list" || raw.version !== 1 && raw.version !== 2 || !raw.record) return null;
    const given = raw.keys_given != null ? Number(raw.keys_given) : -1;
    if (given >= 0 && (!elemKeys || elemKeys.length !== given)) return null;
    const n = raw.n || 0;
    const kind = u8(dlColumn(raw.record.kind));
    const pt = raw.point, rc = raw.rect, pa = raw.path;
    const dl = {
      n,
      kind,
      paint: u32(dlColumn(raw.record.paint)),
      key: u32(dlColumn(raw.record.key)),
      flags: u8(dlColumn(raw.record.flags)),
      clip: u32(dlColumn(raw.record.clip)),
      panel: u32(dlColumn(raw.record.panel)),
      row: new Uint32Array(n),
      bx0: new Float32Array(n),
      by0: new Float32Array(n),
      bx1: new Float32Array(n),
      by1: new Float32Array(n),
      cx: f32(dlColumn(pt.cx)),
      cy: f32(dlColumn(pt.cy)),
      r: f32(dlColumn(pt.r)),
      shape: u8(dlColumn(pt.shape)),
      rx: f32(dlColumn(rc.x)),
      ry: f32(dlColumn(rc.y)),
      rw: f32(dlColumn(rc.w)),
      rh: f32(dlColumn(rc.h)),
      xy: f32(dlColumn(pa.xy)),
      runOff: u32(dlColumn(pa.run_offset)),
      pathOff: u32(dlColumn(pa.path_offset)),
      closed: u8(dlColumn(pa.closed)),
      evenodd: u8(dlColumn(pa.evenodd)),
      paints: [],
      clips: [],
      keys: [],
      panels: asColumn(raw.panels).map(String),
      exact: true,
      group: raw.record.group ? u32(dlColumn(raw.record.group)) : new Uint32Array(n),
      run: raw.record.run ? u32(dlColumn(raw.record.run)) : new Uint32Array(n),
      nRuns: Number(raw.runs) || 0,
      covered: true,
      runImgs: null,
      runHref: null,
      runW: 0,
      runH: 0,
      runBlend: null,
      blendRuns: false,
      gradients: [],
      groups: [],
      cpXy: new Float32Array(0),
      cpRunOff: new Uint32Array(0),
      cpPathOff: new Uint32Array(0),
      cpEvenodd: new Uint8Array(0)
    };
    if (dl.group.length !== n) dl.group = new Uint32Array(n);
    if (dl.run.length !== n) {
      dl.run = new Uint32Array(n);
      dl.nRuns = 0;
    }
    if (raw.run_blend != null && dl.nRuns > 0) {
      const rb = asColumn(raw.run_blend).map((m) => m == null ? "" : String(m));
      if (rb.length === dl.nRuns) {
        dl.runBlend = rb;
        for (let r = 0; r < rb.length; r++) {
          if (rb[r] === "normal") continue;
          if (BLEND_MODES[rb[r]]) dl.blendRuns = true;
          else dl.covered = false;
        }
      }
    }
    const k = raw.keys;
    let own;
    if (k && typeof k === "object" && !Array.isArray(k) && "type" in k) {
      const kc = dlColumn(k);
      own = new Array(kc.length);
      for (let i = 0; i < kc.length; i++) own[i] = String(kc[i]);
    } else {
      own = asColumn(raw.keys).map(String);
    }
    dl.keys = given >= 0 && elemKeys ? own.length ? elemKeys.concat(own) : elemKeys.slice() : own;
    const P = raw.paints;
    const fill = asColumn(P.fill), stroke = asColumn(P.stroke), sw = asColumn(P.stroke_width);
    const dash = asColumn(P.dash), cap = asColumn(P.linecap), join = asColumn(P.linejoin);
    const fg = P.fill_gradient != null ? asColumn(P.fill_gradient) : [];
    const np = Math.max(fill.length, stroke.length, sw.length, cap.length, join.length, fg.length);
    for (let i = 0; i < np; i++) {
      const f = isNa(fill[i]) ? null : String(fill[i]);
      const s = isNa(stroke[i]) ? null : String(stroke[i]);
      const d = isNa(dash[i]) ? null : String(dash[i]).split(",").map(Number).filter((x) => isFinite(x));
      dl.paints.push({
        fill: f,
        stroke: s,
        width: Number(sw[i]) || 0,
        dash: d && d.length ? d : null,
        cap: cap[i] || "butt",
        join: join[i] || "miter",
        opaque: opaqueHex(f) && opaqueHex(s),
        grad: Number(fg[i]) || 0
      });
    }
    if (raw.clips) {
      const x0 = asColumn(raw.clips.x0), y0 = asColumn(raw.clips.y0), x1 = asColumn(raw.clips.x1), y1 = asColumn(raw.clips.y1);
      const ps = raw.clips.path_start != null ? asColumn(raw.clips.path_start) : [];
      const pn = raw.clips.path_n != null ? asColumn(raw.clips.path_n) : [];
      for (let i = 0; i < x0.length; i++) dl.clips.push({ x0: x0[i], y0: y0[i], x1: x1[i], y1: y1[i], ps: Number(ps[i]) || 0, pn: Number(pn[i]) || 0 });
    }
    const G = raw.gradients;
    if (G && G.type != null) {
      const col = (v) => asColumn(v).map(Number);
      const ty = asColumn(G.type), x1 = col(G.x1), y1 = col(G.y1), x2 = col(G.x2), y2 = col(G.y2), r1 = col(G.r1), r2 = col(G.r2);
      const a = col(G.a), b = col(G.b), c = col(G.c), d = col(G.d), e = col(G.e), f = col(G.f);
      const so = col(G.stop_offset), sp = col(G.stop_pos), sc = asColumn(G.stop_color).map(String);
      for (let i = 0; i < ty.length; i++) {
        const stops = [];
        for (let k2 = so[i]; k2 < so[i + 1]; k2++) stops.push({ o: sp[k2], c: sc[k2] });
        dl.gradients.push({
          radial: ty[i] === "radial",
          x1: x1[i],
          y1: y1[i],
          x2: x2[i],
          y2: y2[i],
          r1: r1[i],
          r2: r2[i],
          m: [a[i], b[i], c[i], d[i], e[i], f[i]],
          stops
        });
      }
    }
    if (raw.groups && raw.groups.alpha != null) {
      const al = asColumn(raw.groups.alpha), par = asColumn(raw.groups.parent);
      for (let i = 0; i < al.length; i++) dl.groups.push({ alpha: Number(al[i]), parent: Number(par[i]) || 0 });
    }
    if (raw.clip_paths) {
      dl.cpXy = f32(dlColumn(raw.clip_paths.xy));
      dl.cpRunOff = u32(dlColumn(raw.clip_paths.run_offset));
      dl.cpPathOff = u32(dlColumn(raw.clip_paths.path_offset));
      dl.cpEvenodd = u8(dlColumn(raw.clip_paths.evenodd));
    }
    for (let i = 0; i < dl.paints.length; i++) if (dl.paints[i].grad > dl.gradients.length) dl.paints[i].grad = -1;
    let ip = 0, ir = 0, ih = 0;
    for (let i = 0; i < n; i++) {
      if (dl.flags[i] & ~DL_FLAG_PICK) dl.exact = false;
      const pg = dl.paints[dl.paint[i]];
      if (pg && pg.grad < 0 || dl.group[i] > dl.groups.length) {
        dl.flags[i] |= 1;
        dl.exact = false;
      }
      if (dl.flags[i] & ~DL_FLAG_PICK && !(dl.run[i] > 0 && dl.run[i] <= dl.nRuns)) dl.covered = false;
      if (dl.flags[i] & DL_FLAG_BLEND && !dl.runBlend) dl.covered = false;
      const kd = kind[i];
      if (kd === DL_POINT) {
        const j = ip++, r = dl.r[j];
        dl.row[i] = j;
        dl.bx0[i] = dl.cx[j] - r;
        dl.bx1[i] = dl.cx[j] + r;
        dl.by0[i] = dl.cy[j] - r;
        dl.by1[i] = dl.cy[j] + r;
      } else if (kd === DL_RECT) {
        const j = ir++;
        dl.row[i] = j;
        const x = dl.rx[j], y = dl.ry[j], w = dl.rw[j], h = dl.rh[j];
        dl.bx0[i] = Math.min(x, x + w);
        dl.bx1[i] = Math.max(x, x + w);
        dl.by0[i] = Math.min(y, y + h);
        dl.by1[i] = Math.max(y, y + h);
      } else {
        const j = ih++;
        dl.row[i] = j;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const v0 = dl.runOff[dl.pathOff[j]], v1 = dl.runOff[dl.pathOff[j + 1]];
        for (let v = v0; v < v1; v++) {
          const x = dl.xy[2 * v], y = dl.xy[2 * v + 1];
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
        dl.bx0[i] = x0;
        dl.by0[i] = y0;
        dl.bx1[i] = x1;
        dl.by1[i] = y1;
      }
    }
    return dl;
  }
  function attachRuns(dl, imgs, hrefs, w, h) {
    if (!dl.covered || !dl.nRuns || imgs.length !== dl.nRuns || !(w > 0 && h > 0)) return false;
    dl.runImgs = imgs;
    dl.runHref = hrefs;
    dl.runW = w;
    dl.runH = h;
    dl.exact = true;
    return true;
  }
  function fillBboxes(elements, dl) {
    const box = {};
    for (let i = 0; i < dl.n; i++) {
      const k = dl.keys[dl.key[i]];
      if (k == null || !isFinite(dl.bx0[i])) continue;
      const b = box[k];
      if (!b) box[k] = [dl.bx0[i], dl.by0[i], dl.bx1[i], dl.by1[i]];
      else {
        if (dl.bx0[i] < b[0]) b[0] = dl.bx0[i];
        if (dl.by0[i] < b[1]) b[1] = dl.by0[i];
        if (dl.bx1[i] > b[2]) b[2] = dl.bx1[i];
        if (dl.by1[i] > b[3]) b[3] = dl.by1[i];
      }
    }
    let filled = 0;
    for (let i = 0; i < elements.length; i++) {
      const e = elements[i];
      if (e.x0 != null && e.y0 != null && e.x1 != null && e.y1 != null) continue;
      const b = box[e.key];
      if (!b) continue;
      e.x0 = b[0];
      e.y0 = b[1];
      e.x1 = b[2];
      e.y1 = b[3];
      filled++;
    }
    return filled;
  }
  var S3 = 0.8660254037844386;
  var MARKER = {
    1: [-1, -1, 1, -1, 1, 1, -1, 1],
    2: [0, -1, S3, 0.5, -S3, 0.5],
    3: [0, -1, 1, 0, 0, 1, -1, 0],
    6: [0, 1, S3, -0.5, -S3, -0.5],
    7: function() {
      const o = [];
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 === 0 ? 1 : 0.382;
        o.push(rad * Math.cos(a), rad * Math.sin(a));
      }
      return o;
    }()
  };
  function markerRing(shape) {
    return MARKER[shape];
  }
  function isLineGlyph(shape) {
    return shape === 4 || shape === 5;
  }
  function tracePoint(ctx, shape, x, y, r) {
    if (shape === 0 || !MARKER[shape] && !isLineGlyph(shape)) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, 6.283185307179586);
      return;
    }
    if (shape === 4) {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      return;
    }
    if (shape === 5) {
      const d = r * Math.SQRT1_2;
      ctx.moveTo(x - d, y - d);
      ctx.lineTo(x + d, y + d);
      ctx.moveTo(x - d, y + d);
      ctx.lineTo(x + d, y - d);
      return;
    }
    const m = MARKER[shape];
    ctx.moveTo(x + m[0] * r, y + m[1] * r);
    for (let i = 2; i < m.length; i += 2) ctx.lineTo(x + m[i] * r, y + m[i + 1] * r);
    ctx.closePath();
  }
  function traceShape(ctx, dl, i, A) {
    const j = dl.row[i];
    if (dl.kind[i] === DL_RECT) {
      const x0 = A.ax * dl.rx[j] + A.bx, y0 = A.ay * dl.ry[j] + A.by;
      ctx.rect(x0, y0, A.ax * dl.rw[j], A.ay * dl.rh[j]);
      return;
    }
    const r0 = dl.pathOff[j], r1 = dl.pathOff[j + 1], closed = dl.closed[j] === 1;
    for (let run = r0; run < r1; run++) {
      const v0 = dl.runOff[run], v1 = dl.runOff[run + 1];
      for (let v = v0; v < v1; v++) {
        const x = A.ax * dl.xy[2 * v] + A.bx, y = A.ay * dl.xy[2 * v + 1] + A.by;
        if (v === v0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (closed) ctx.closePath();
    }
  }
  function traceClipPath(ctx, dl, shape, A) {
    for (let run = dl.cpPathOff[shape]; run < dl.cpPathOff[shape + 1]; run++) {
      const v0 = dl.cpRunOff[run], v1 = dl.cpRunOff[run + 1];
      for (let v = v0; v < v1; v++) {
        const x = A.ax * dl.cpXy[2 * v] + A.bx, y = A.ay * dl.cpXy[2 * v + 1] + A.by;
        if (v === v0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
  }
  function fillGradient(ctx, g, A, rule, override) {
    ctx.save();
    ctx.setTransform(A.ax, 0, 0, A.ay, A.bx, A.by);
    ctx.transform(g.m[0], g.m[1], g.m[2], g.m[3], g.m[4], g.m[5]);
    let paint;
    if (override) paint = override;
    else {
      const cg = g.radial ? ctx.createRadialGradient(g.x1, g.y1, g.r1, g.x2, g.y2, g.r2) : ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2);
      for (let k = 0; k < g.stops.length; k++) cg.addColorStop(Math.min(1, Math.max(0, g.stops[k].o)), g.stops[k].c);
      paint = cg;
    }
    ctx.fillStyle = paint;
    ctx.fill(rule);
    ctx.restore();
  }

  // srcts/tooltip.ts
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

  // srcts/features/a11y.ts
  function a11yFeature(ws) {
    function a11yLabel(k) {
      const m = ws.meta[k];
      return m && m.tooltip ? stripTags(m.tooltip) : k;
    }
    function focusLabel(k) {
      return a11yLabel(k) + (ws.selected[k] ? ", selected" : "");
    }
    function announce(msg) {
      if (ws.liveRegion && ws.liveRegion.textContent !== msg) ws.liveRegion.textContent = msg;
    }
    function showMarkFocus(i) {
      ws.focusIdx = i;
      const k = ws.focusables[i].key;
      ws.fx.clearClass("vellumwidget-focus");
      ws.fx.addClassForKeys([k], "vellumwidget-focus");
      ws.fx.setHover(k);
      announce(focusLabel(k));
    }
    function onMarkFocus(ev) {
      const k = keyOf(ev.target);
      if (k == null) return;
      const i = ws.focusables.findIndex((f) => f.key === k);
      if (i >= 0) showMarkFocus(i);
    }
    function onMarkBlur(ev) {
      const to = keyOf(ev.relatedTarget);
      if (to == null) {
        ws.focusIdx = -1;
        ws.fx.clearClass("vellumwidget-focus");
      }
    }
    function focusRoving(i) {
      if (!ws.focusables.length) return;
      const dir = i < ws.focusIdx ? -1 : 1;
      if (i < 0) i = 0;
      if (i >= ws.focusables.length) i = ws.focusables.length - 1;
      while (ws.focusables[i] && ws.fx.inert(ws.focusables[i].key)) {
        i += dir;
        if (i < 0 || i >= ws.focusables.length) return;
      }
      if (ws.focusIdx >= 0 && ws.focusables[ws.focusIdx]) {
        ws.focusables[ws.focusIdx].node.setAttribute("tabindex", "-1");
      }
      const f = ws.focusables[i];
      f.node.setAttribute("tabindex", "0");
      showMarkFocus(i);
      const n = f.node;
      if (typeof n.focus === "function") n.focus();
    }
    function markFocused() {
      return ws.opts.a11y && ws.focusIdx >= 0 && !!ws.focusables[ws.focusIdx];
    }
    function buildDataTable() {
      if (ws.tableEl) {
        ws.tableEl.remove();
        ws.tableEl = null;
      }
      if (!ws.opts.a11y || !ws.elements.length) return;
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
      for (let i = 0; i < ws.elements.length; i++) {
        const k = ws.elements[i].key;
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
      ws.el.appendChild(tbl);
      ws.tableEl = tbl;
    }
    function setupA11y() {
      ws.focusables = [];
      ws.focusIdx = -1;
      if (!ws.opts.a11y || !ws.svgEl) {
        buildDataTable();
        return;
      }
      if (ws.fx.ringMode()) {
        ws.svgEl.removeAttribute("aria-roledescription");
        ws.svgEl.setAttribute("role", "img");
        if (ws.opts.alt) {
          ws.svgEl.removeAttribute("aria-labelledby");
          ws.svgEl.setAttribute("aria-label", ws.opts.alt);
        } else if (!ws.svgEl.getAttribute("aria-labelledby") && !ws.svgEl.getAttribute("aria-label")) {
          ws.svgEl.setAttribute("aria-label", "Chart");
        }
        return;
      }
      ws.svgEl.setAttribute("role", "graphics-document");
      ws.svgEl.setAttribute("aria-roledescription", "interactive chart");
      if (ws.opts.alt) {
        ws.svgEl.removeAttribute("aria-labelledby");
        ws.svgEl.setAttribute("aria-label", ws.opts.alt);
      } else if (!ws.svgEl.getAttribute("aria-labelledby") && !ws.svgEl.getAttribute("aria-label")) {
        ws.svgEl.setAttribute("aria-label", "Interactive chart");
      }
      if (!ws.liveRegion) {
        ws.liveRegion = document.createElement("div");
        ws.liveRegion.className = "vellumwidget-sr-only";
        ws.liveRegion.setAttribute("role", "status");
        ws.liveRegion.setAttribute("aria-live", "polite");
        ws.el.appendChild(ws.liveRegion);
      } else {
        ws.liveRegion.textContent = "";
      }
      const seen = {};
      const keys = ws.rasterMode ? ws.detailKeys : ws.elements.map((e) => e.key);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (seen[k]) continue;
        const nodes = ws.nodesByKey[k];
        if (!nodes || !nodes.length) continue;
        seen[k] = true;
        const node = nodes[0];
        node.setAttribute("role", "graphics-symbol");
        node.setAttribute("tabindex", "-1");
        node.setAttribute("aria-label", a11yLabel(k));
        node.addEventListener("focus", onMarkFocus);
        node.addEventListener("blur", onMarkBlur);
        ws.focusables.push({ key: k, node });
      }
      if (ws.focusables.length) ws.focusables[0].node.setAttribute("tabindex", "0");
      if (ws.rasterMode) {
        if (ws.tableEl) {
          ws.tableEl.remove();
          ws.tableEl = null;
        }
      } else buildDataTable();
    }
    return { a11yLabel, announce, focusRoving, markFocused, setupA11y };
  }

  // srcts/geometry.ts
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
  function isRoundMark(mark) {
    return mark === "point" || mark === "points" || mark === "circle" || mark === "circles";
  }
  function distToSegment2(x, y, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (ax + t * vx), dy = y - (ay + t * vy);
    return dx * dx + dy * dy;
  }
  function distToGeom(x, y, g, gx, gy, box) {
    const at = g.at, n = g.n;
    if (n <= 0) return Infinity;
    if (g.kind === "point") {
      const dx = x - gx[at], dy = y - gy[at];
      const d = Math.sqrt(dx * dx + dy * dy);
      const r = box ? Math.min(box.x1 - box.x0, box.y1 - box.y0) / 2 : 0;
      return d > r ? d - r : 0;
    }
    if (n === 1) {
      const dx = x - gx[at], dy = y - gy[at];
      return Math.sqrt(dx * dx + dy * dy);
    }
    if (g.kind === "rect" || g.kind === "text" || g.kind === "roundrect") {
      return distToBbox(x, y, {
        x0: Math.min(gx[at], gx[at + 1]),
        x1: Math.max(gx[at], gx[at + 1]),
        y0: Math.min(gy[at], gy[at + 1]),
        y1: Math.max(gy[at], gy[at + 1])
      });
    }
    const closed = g.kind === "polygon" || g.kind === "path" || g.kind === "hexagon" || g.kind === "sector";
    const rings = g.rings || [n];
    let best = Infinity;
    let cross = 0;
    let wind = 0;
    let ra = at;
    for (let r = 0; r < rings.length; r++) {
      const rn = rings[r] | 0;
      if (rn <= 0) continue;
      if (closed && rn >= 3) {
        for (let i = 0, j = rn - 1; i < rn; j = i++) {
          const xi = gx[ra + i], yi = gy[ra + i];
          const xj = gx[ra + j], yj = gy[ra + j];
          if (yi > y !== yj > y) {
            if (x < (xj - xi) * (y - yi) / (yj - yi) + xi) cross++;
            const side = (xi - xj) * (y - yj) - (x - xj) * (yi - yj);
            if (yi > yj) {
              if (side > 0) wind++;
            } else if (side < 0) wind--;
          }
        }
      }
      for (let i = 1; i < rn; i++) {
        const d2 = distToSegment2(x, y, gx[ra + i - 1], gy[ra + i - 1], gx[ra + i], gy[ra + i]);
        if (d2 < best) best = d2;
      }
      if (closed && rn >= 3) {
        const d2 = distToSegment2(x, y, gx[ra + rn - 1], gy[ra + rn - 1], gx[ra], gy[ra]);
        if (d2 < best) best = d2;
      }
      ra += rn;
    }
    if (closed && (g.evenodd ? (cross & 1) === 1 : wind !== 0)) return 0;
    return Math.sqrt(best);
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
  function mul6(m, n) {
    return [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5]
    ];
  }
  function parseTransformList(t) {
    const s = (t || "").trim();
    if (!s) return null;
    const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
    let m = [1, 0, 0, 1, 0, 0];
    let any = false, rest = s, f;
    while ((f = re.exec(s)) !== null) {
      rest = rest.replace(f[0], "");
      const v = f[2].trim() === "" ? [] : f[2].trim().split(/[\s,]+/).map(Number);
      if (v.some((x) => !isFinite(x))) return null;
      let n;
      switch (f[1]) {
        case "matrix":
          if (v.length !== 6) return null;
          n = [v[0], v[1], v[2], v[3], v[4], v[5]];
          break;
        case "translate":
          if (v.length < 1 || v.length > 2) return null;
          n = [1, 0, 0, 1, v[0], v.length > 1 ? v[1] : 0];
          break;
        case "scale":
          if (v.length < 1 || v.length > 2) return null;
          n = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0];
          break;
        case "rotate": {
          if (v.length !== 1 && v.length !== 3) return null;
          const r = v[0] * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
          const cx = v.length === 3 ? v[1] : 0, cy = v.length === 3 ? v[2] : 0;
          n = [co, si, -si, co, cx - co * cx + si * cy, cy - si * cx - co * cy];
          break;
        }
        case "skewX":
          if (v.length !== 1) return null;
          n = [1, 0, Math.tan(v[0] * Math.PI / 180), 1, 0, 0];
          break;
        case "skewY":
          if (v.length !== 1) return null;
          n = [1, Math.tan(v[0] * Math.PI / 180), 0, 1, 0, 0];
          break;
        default:
          return null;
      }
      m = mul6(m, n);
      any = true;
    }
    if (!any || rest.replace(/[\s,]/g, "") !== "") return null;
    return m;
  }
  function applyAffine6(m, x, y) {
    return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
  }

  // srcts/features/constants.ts
  var DIM_OVERLAY_MIN = 2e3;
  var OVERLAY_MARK_CAP = 2e3;
  var PICK_CANDIDATES = 256;
  var LIVE_DRAW_MAX = 5e4;
  var SETTLE_MS = 120;
  var DEFAULT_MAX_ZOOM = 100;
  var SVGNS = "http://www.w3.org/2000/svg";
  var TIP_MULTI_CAP = 30;
  var MODE_ICON = { brush: "\u25AD", lasso: "\u25CC", pan: "\u270B" };
  var MODE_LABEL = { brush: "brush-select", lasso: "lasso-select", pan: "pan" };
  var RUN_BOX_PAD = 2;

  // srcts/scales.ts
  var INVERTIBLE = { identity: true, log10: true, sqrt: true, reverse: true };
  var GLYPH_MARKS = { point: true, circle: true, hexagon: true, sector: true };
  function canInvert(ax) {
    return !!ax && INVERTIBLE[ax.transform] === true;
  }
  function nativeToData(ax, nv) {
    switch (ax.transform) {
      case "log10":
        return Math.pow(10, nv);
      case "sqrt":
        return nv * nv;
      case "reverse":
        return nv;
      // identity map; the reversal is the decreasing domain
      default:
        return nv;
    }
  }
  function pxToDataX(p, px) {
    const ax = p.x;
    if (!canInvert(ax) || p.px1 === p.px0) return null;
    const nv = ax.native_lo + (px - p.px0) / (p.px1 - p.px0) * (ax.native_hi - ax.native_lo);
    return nativeToData(ax, nv);
  }
  function pxToDataY(p, py) {
    const ax = p.y;
    if (!canInvert(ax) || p.py1 === p.py0) return null;
    const frac = (py - p.py0) / (p.py1 - p.py0);
    const nv = ax.native_hi + frac * (ax.native_lo - ax.native_hi);
    return nativeToData(ax, nv);
  }
  function selEncodings(sel) {
    const enc = sel.encodings != null ? asColumn(sel.encodings) : [];
    const out = enc.filter((e) => e === "x" || e === "y");
    if (out.length) return out;
    if (sel.on === "x" || sel.on === "y") return [sel.on];
    return ["x", "y"];
  }
  function axisForEncoding(p, enc) {
    if (p.x && p.x.aes === enc) return { ax: p.x, horizontal: true };
    if (p.y && p.y.aes === enc) return { ax: p.y, horizontal: false };
    if (p.x && p.x.aes || p.y && p.y.aes) return null;
    if (enc === "x" && p.x) return { ax: p.x, horizontal: true };
    if (enc === "y" && p.y) return { ax: p.y, horizontal: false };
    return null;
  }
  function intervalRangeOf(p, rect, encs) {
    const out = { panel: p.name };
    for (let i = 0; i < encs.length; i++) {
      const enc = encs[i];
      const hit = axisForEncoding(p, enc);
      if (!hit) return null;
      const a = hit.horizontal ? pxToDataX(p, rect.x0) : pxToDataY(p, rect.y0);
      const b = hit.horizontal ? pxToDataX(p, rect.x1) : pxToDataY(p, rect.y1);
      if (a == null || b == null || !isFinite(a) || !isFinite(b)) return null;
      const ch = { lo: Math.min(a, b), hi: Math.max(a, b) };
      if (hit.ax.type === "discrete") {
        const levels = hit.ax.levels != null ? asColumn(hit.ax.levels) : [];
        if (!levels.length) return null;
        ch.levels = [];
        for (let k = 0; k < levels.length; k++) {
          const pos = k + 1;
          if (pos >= ch.lo && pos <= ch.hi) ch.levels.push(String(levels[k]));
        }
      }
      out[enc] = ch;
    }
    return out;
  }
  function inInterval(e, r) {
    const chans = [["x", r.x], ["y", r.y]];
    let tested = false;
    for (let i = 0; i < chans.length; i++) {
      const enc = chans[i][0], ch = chans[i][1];
      if (!ch) continue;
      tested = true;
      if (ch.levels) {
        const v = enc === "x" ? e.ixd : e.iyd;
        if (v == null || ch.levels.indexOf(v) < 0) return false;
      } else {
        const lo = enc === "x" ? e.ix : e.iy;
        if (typeof lo !== "number" || !isFinite(lo)) return false;
        const hi0 = enc === "x" ? e.ixh : e.iyh;
        const hi = typeof hi0 === "number" && isFinite(hi0) ? hi0 : lo;
        if (hi < ch.lo || lo > ch.hi) return false;
      }
    }
    return tested;
  }
  function intervalKeys(elems, r) {
    const out = [];
    const seen = {};
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (!seen[e.key] && inInterval(e, r)) {
        seen[e.key] = true;
        out.push(e.key);
      }
    }
    return out;
  }

  // srcts/ticks.ts
  function niceTicks(lo, hi, count) {
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo || count < 1) return [];
    const step0 = (hi - lo) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) {
      out.push(Math.round(v / step) * step);
    }
    return out;
  }
  function fmtTick(v, step) {
    if (v === 0) return "0";
    const decimals = Math.min(20, Math.max(0, -Math.floor(Math.log10(Math.abs(step)) + 1e-9)));
    let s = v.toFixed(decimals);
    if (s.indexOf(".") >= 0) s = s.replace(/\.?0+$/, "");
    return s;
  }
  function dataToNative(ax, d) {
    switch (ax.transform) {
      case "log10":
        return Math.log10(d);
      case "sqrt":
        return Math.sqrt(d);
      default:
        return d;
    }
  }
  function fmtRNum(vals) {
    let dec = 0;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (!isFinite(v) || v === 0) continue;
      const target = Number(v.toPrecision(7));
      let d = 0;
      while (d < 15 && Math.abs(Number(v.toFixed(d)) - target) > Math.abs(target) * 1e-9) d++;
      if (d > dec) dec = d;
    }
    return vals.map(function(v) {
      return isFinite(v) ? v.toFixed(dec) : String(v);
    });
  }
  function logTicks(lo, hi, n) {
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return { ticks: [], linear: false };
    const need = Math.max(2, n - 2);
    const p0 = Math.ceil(lo - 1e-9), p1 = Math.floor(hi + 1e-9);
    if (p1 - p0 + 1 >= need) {
      const by = Math.floor((hi - lo) / n) + 1;
      const out = [];
      for (let k = Math.ceil(p0 / by) * by; k <= p1; k += by) {
        out.push({ n: k, d: Number(Math.pow(10, k).toPrecision(12)) });
      }
      if (out.length >= need || by === 1) return { ticks: out, linear: false };
    }
    const sets = [[1, 3], [1, 2, 5], [1, 2, 3, 5], [1, 2, 3, 4, 5, 6, 7, 8, 9]];
    for (let s = 0; s < sets.length; s++) {
      const out = [];
      for (let k = Math.floor(lo) - 1; k <= Math.ceil(hi); k++) {
        for (let j = 0; j < sets[s].length; j++) {
          const m = sets[s][j];
          const nv = k + Math.log10(m);
          if (nv < lo - 1e-9 || nv > hi + 1e-9) continue;
          out.push({ n: nv, d: Number((m * Math.pow(10, k)).toPrecision(12)) });
        }
      }
      if (out.length >= need) return { ticks: out, linear: false };
    }
    const dlo = Math.pow(10, lo), dhi = Math.pow(10, hi);
    const lin = niceTicks(dlo, dhi, n).filter(function(d) {
      return d > 0;
    }).map(function(d) {
      return { n: Math.log10(d), d };
    });
    return { ticks: lin, linear: true };
  }
  var MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  var WDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function pad2(v) {
    return v < 10 ? "0" + v : String(v);
  }
  function strftimeUTC(fmt, ms) {
    const d = new Date(ms);
    if (isNaN(d.getTime())) return "";
    return fmt.replace(/%([a-zA-Z%])/g, function(_m, c) {
      switch (c) {
        case "Y":
          return String(d.getUTCFullYear());
        case "y":
          return pad2((d.getUTCFullYear() % 100 + 100) % 100);
        case "m":
          return pad2(d.getUTCMonth() + 1);
        case "d":
          return pad2(d.getUTCDate());
        case "e":
          return (d.getUTCDate() < 10 ? " " : "") + d.getUTCDate();
        case "H":
          return pad2(d.getUTCHours());
        case "I":
          return pad2((d.getUTCHours() + 11) % 12 + 1);
        case "p":
          return d.getUTCHours() < 12 ? "AM" : "PM";
        case "M":
          return pad2(d.getUTCMinutes());
        case "S":
          return pad2(d.getUTCSeconds());
        case "b":
        case "h":
          return MONTHS[d.getUTCMonth()].slice(0, 3);
        case "B":
          return MONTHS[d.getUTCMonth()];
        case "a":
          return WDAYS[d.getUTCDay()].slice(0, 3);
        case "A":
          return WDAYS[d.getUTCDay()];
        case "j": {
          const doy = Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1;
          return (doy < 10 ? "00" : doy < 100 ? "0" : "") + doy;
        }
        case "%":
          return "%";
        default:
          return "%" + c;
      }
    });
  }
  function fmtRank(fmt) {
    if (/%S/.test(fmt)) return 0;
    if (/%M/.test(fmt)) return 1;
    if (/%[HIp]/.test(fmt)) return 2;
    if (/%[deja]|%A/.test(fmt)) return 3;
    if (/%[mbBh]/.test(fmt)) return 4;
    return 5;
  }
  var TIME_FORMATS = [
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%H:%M:%S",
    "%H:%M",
    "%b %d %H:%M",
    "%Y-%m-%d",
    "%Y/%m/%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%d.%m.%Y",
    "%m/%d",
    "%d/%m",
    "%b %d",
    "%d %b",
    "%b %d %Y",
    "%d %b %Y",
    "%B %d",
    "%d %B",
    "%B %d, %Y",
    "%e %b",
    "%Y-%m",
    "%b %Y",
    "%B %Y",
    "%b %y",
    "%m/%Y",
    "%b",
    "%B",
    "%Y",
    "%y"
  ];
  var TZ_OFFSETS = function() {
    const out = [0];
    for (let q = 1; q <= 56; q++) out.push(q * 9e5, -q * 9e5);
    return out;
  }();
  var timeFmtCache = /* @__PURE__ */ new WeakMap();
  var tzFormatters = {};
  function zoneOffset(tz, ms) {
    let f = tzFormatters[tz];
    if (f === void 0) {
      try {
        f = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour12: false,
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "numeric",
          second: "numeric"
        });
      } catch (e) {
        f = null;
      }
      tzFormatters[tz] = f;
    }
    if (!f || !isFinite(ms)) return null;
    const parts = f.formatToParts(new Date(ms));
    const get = (t) => {
      for (let i = 0; i < parts.length; i++) if (parts[i].type === t) return Number(parts[i].value);
      return NaN;
    };
    const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
    return isFinite(wall) ? wall - Math.floor(ms / 1e3) * 1e3 : null;
  }
  function browserZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch (e) {
      return null;
    }
  }
  function allZones() {
    const I = Intl;
    try {
      return typeof I.supportedValuesOf === "function" ? I.supportedValuesOf("timeZone") : [];
    } catch (e) {
      return [];
    }
  }
  function detectTimeFormat(ax) {
    const hit = timeFmtCache.get(ax);
    if (hit) return hit;
    const breaks = asColumn(ax.breaks), labels = asColumn(ax.labels).map(String);
    const unitMs = ax.time_unit === "second" ? 1e3 : 864e5;
    let info = { fmt: null, off: 0 };
    if (breaks.length && breaks.length === labels.length) {
      const ms = breaks.map(function(b) {
        return Number(b) * unitMs;
      });
      const lab = labels.map(function(l) {
        return l.trim();
      });
      if (ax.time_unit !== "second") {
        for (let f = 0; f < TIME_FORMATS.length; f++) {
          let all = true;
          for (let i = 0; i < ms.length && all; i++) all = strftimeUTC(TIME_FORMATS[f], ms[i]) === lab[i];
          if (all) {
            info = { fmt: TIME_FORMATS[f], off: 0 };
            break;
          }
        }
      } else {
        for (let f = 0; f < TIME_FORMATS.length; f++) {
          const r = detectZone(TIME_FORMATS[f], ms, lab);
          if (r) {
            info = r;
            break;
          }
        }
      }
    }
    timeFmtCache.set(ax, info);
    return info;
  }
  function detectZone(fmt, ms, lab) {
    const DAY = 864e5;
    const ok = [];
    for (let i = 0; i < ms.length; i++) {
      const set = {};
      let any = false;
      for (let o = 0; o < TZ_OFFSETS.length; o++) {
        if (strftimeUTC(fmt, ms[i] + TZ_OFFSETS[o]) === lab[i]) {
          set[TZ_OFFSETS[o]] = true;
          any = true;
        }
      }
      if (!any) return null;
      ok.push(set);
    }
    const fits = (i, o) => ok[i][o] === true;
    let fixed = null;
    for (let o = 0; o < TZ_OFFSETS.length && fixed === null; o++) {
      let all = true;
      for (let i = 0; i < ms.length && all; i++) all = fits(i, TZ_OFFSETS[o]);
      if (all) fixed = TZ_OFFSETS[o];
    }
    const midnights = (offs) => {
      let c = 0;
      for (let i = 0; i < ms.length; i++) if (((ms[i] + offs[i]) % DAY + DAY) % DAY === 0) c++;
      return c;
    };
    const zoneOffs = (tz) => {
      const out = [];
      for (let i = 0; i < ms.length; i++) {
        const o = zoneOffset(tz, ms[i]);
        if (o === null || !fits(i, o)) return null;
        out.push(o);
      }
      return out;
    };
    let best = null, bestScore = -1;
    const own = browserZone();
    if (own) {
      const zo = zoneOffs(own);
      if (zo) {
        best = { fmt, off: zo[0], tz: own };
        bestScore = midnights(zo);
      }
    }
    if (fixed !== null) {
      const sc = midnights(ms.map(function() {
        return fixed;
      }));
      if (sc > bestScore) {
        best = { fmt, off: fixed };
        bestScore = sc;
      }
    }
    const dayLevel = fmtRank(fmt) >= 3;
    if (fixed === null || dayLevel && bestScore < ms.length) {
      const zones = allZones();
      for (let z = 0; z < zones.length; z++) {
        if (zones[z] === own) continue;
        const zo = zoneOffs(zones[z]);
        if (!zo) continue;
        const sc = midnights(zo);
        if (sc > bestScore) {
          best = { fmt, off: zo[0], tz: zones[z] };
          bestScore = sc;
        }
        if (bestScore === ms.length) break;
      }
    }
    return best;
  }
  var TIME_STEPS = function() {
    const s = 1e3, mi = 60 * s, h = 60 * mi, d = 24 * h;
    const out = [];
    [1, 2, 5, 10, 15, 30].forEach(function(k) {
      out.push({ rank: 0, ms: k * s });
    });
    [1, 2, 5, 10, 15, 30].forEach(function(k) {
      out.push({ rank: 1, ms: k * mi });
    });
    [1, 3, 6, 12].forEach(function(k) {
      out.push({ rank: 2, ms: k * h });
    });
    [1, 2, 7].forEach(function(k) {
      out.push({ rank: 3, ms: k * d });
    });
    [1, 2, 3, 6].forEach(function(k) {
      out.push({ rank: 4, ms: k * 30.4375 * d, mo: k });
    });
    [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1e3].forEach(function(k) {
      out.push({ rank: 5, ms: k * 365.25 * d, yr: k });
    });
    return out;
  }();
  function timeTicks(ax, lo, hi, n) {
    if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return [];
    const isDate = ax.time_unit !== "second";
    const unitMs = isDate ? 864e5 : 1e3;
    const info = detectTimeFormat(ax);
    const off = info.off;
    const tz = !isDate && info.tz ? info.tz : null;
    const offAt = (t) => {
      if (!tz) return off;
      const o = zoneOffset(tz, t);
      return o === null ? off : o;
    };
    const slo = lo * unitMs + offAt(lo * unitMs), shi = hi * unitMs + offAt(hi * unitMs);
    const span = shi - slo;
    let step = null;
    for (let i = 0; i < TIME_STEPS.length; i++) {
      const st = TIME_STEPS[i];
      if (isDate && st.rank < 3) continue;
      if (span / st.ms <= n) {
        step = st;
        break;
      }
    }
    if (!step) {
      const yrs = span / (365.25 * 864e5);
      const raw = yrs / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
      const k = (raw / mag < 2 ? 2 : raw / mag < 5 ? 5 : 10) * mag;
      step = { rank: 5, ms: k * 365.25 * 864e5, yr: k };
    }
    const walls = [];
    if (step.yr) {
      const y0 = new Date(slo).getUTCFullYear(), y1 = new Date(shi).getUTCFullYear();
      for (let y = Math.ceil(y0 / step.yr) * step.yr; y <= y1; y += step.yr) walls.push(Date.UTC(y, 0, 1));
    } else if (step.mo) {
      const a = new Date(slo), b = new Date(shi);
      let mIdx = a.getUTCFullYear() * 12 + a.getUTCMonth();
      mIdx = Math.ceil(mIdx / step.mo) * step.mo;
      const mEnd = b.getUTCFullYear() * 12 + b.getUTCMonth();
      for (; mIdx <= mEnd; mIdx += step.mo) walls.push(Date.UTC(Math.floor(mIdx / 12), mIdx % 12, 1));
    } else {
      const origin = step.ms === 7 * 864e5 ? 4 * 864e5 : 0;
      for (let t = Math.ceil((slo - origin) / step.ms - 1e-9) * step.ms + origin; t <= shi + 1e-6; t += step.ms) {
        walls.push(t);
      }
    }
    const defFmt = step.rank >= 5 ? "%Y" : step.rank === 4 ? "%Y-%m" : step.rank === 3 ? "%Y-%m-%d" : step.rank === 0 ? "%H:%M:%S" : "%H:%M";
    const useStatic = info.fmt != null && fmtRank(info.fmt) <= step.rank;
    const out = [];
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (w < slo - 1e-6 || w > shi + 1e-6) continue;
      let fmt = useStatic ? info.fmt : defFmt;
      if (!useStatic && step.rank <= 2 && w % 864e5 === 0) fmt = "%Y-%m-%d";
      let inst = w - off;
      if (tz) {
        inst = w - offAt(w - offAt(w));
        if (inst + offAt(inst) !== w) continue;
      }
      out.push({ n: inst / unitMs, label: strftimeUTC(fmt, w) });
    }
    return out;
  }
  var NICE_TRANSFORMS = { identity: true, reverse: true, sqrt: true };
  function hasStaticBreaks(ax) {
    const b = asColumn(ax.breaks), l = asColumn(ax.labels);
    return b.length > 0 && b.length === l.length;
  }
  function axisRetickable(ax) {
    if (!ax) return true;
    if (ax.type === "discrete" || ax.type === "binned") return hasStaticBreaks(ax);
    if (ax.time_unit === "day" || ax.time_unit === "second") return true;
    if (ax.transform === "log10") return true;
    if (ax.type === "continuous" && NICE_TRANSFORMS[ax.transform]) return true;
    return hasStaticBreaks(ax);
  }
  function axisTicks(ax, lo, hi, n) {
    if (!(hi > lo)) return [];
    const statics = function() {
      const b = asColumn(ax.breaks), l = asColumn(ax.labels);
      const tol = (hi - lo) * 1e-6;
      const out = [];
      for (let i = 0; i < b.length && i < l.length; i++) {
        const v = Number(b[i]);
        if (isFinite(v) && v >= lo - tol && v <= hi + tol) out.push({ n: v, label: String(l[i]) });
      }
      return out;
    };
    if (ax.type === "discrete" || ax.type === "binned") return statics();
    if (ax.time_unit === "day" || ax.time_unit === "second") return timeTicks(ax, lo, hi, n);
    if (ax.transform === "log10") {
      const lt = logTicks(lo, hi, n), t = lt.ticks;
      const step = t.length > 1 ? t[1].d - t[0].d : 1;
      const labs = lt.linear ? t.map(function(x) {
        return fmtTick(x.d, step);
      }) : fmtRNum(t.map(function(x) {
        return x.d;
      }));
      return t.map(function(x, i) {
        return { n: x.n, label: labs[i] };
      });
    }
    if (NICE_TRANSFORMS[ax.transform]) {
      const sq = ax.transform === "sqrt";
      const a = nativeToData(ax, sq ? Math.max(lo, 0) : lo), b = nativeToData(ax, sq ? Math.max(hi, 0) : hi);
      const dlo = Math.min(a, b), dhi = Math.max(a, b);
      const ticks = niceTicks(dlo, dhi, n);
      const step = ticks.length > 1 ? ticks[1] - ticks[0] : dhi - dlo;
      return ticks.map(function(d) {
        return { n: dataToNative(ax, d), label: fmtTick(d, step) };
      });
    }
    return statics();
  }
  function parseSecLabels(labels) {
    if (labels.length < 2) return null;
    const NUM = /[-+\u2212]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:[eE][-+]?\d+)?/;
    let prefix = null, suffix = null, comma = false;
    const vals = [];
    for (let i = 0; i < labels.length; i++) {
      const t = labels[i].trim();
      const re = new RegExp(NUM.source, "g");
      let m = null, hit = null;
      while ((m = re.exec(t)) !== null) {
        if (/\d/.test(m[0])) {
          hit = m;
          break;
        }
        re.lastIndex = m.index + 1;
      }
      if (!hit) return null;
      const pre = t.slice(0, hit.index), suf = t.slice(hit.index + hit[0].length);
      if (/\d/.test(pre) || /\d/.test(suf)) return null;
      if (prefix === null) {
        prefix = pre;
        suffix = suf;
      } else if (pre !== prefix || suf !== suffix) return null;
      if (hit[0].indexOf(",") >= 0) comma = true;
      const v = Number(hit[0].replace(/,/g, "").replace("\u2212", "-"));
      if (!isFinite(v)) return null;
      vals.push(v);
    }
    return { vals, prefix: prefix || "", suffix: suffix || "", comma };
  }
  function secAxisMap(native, labels) {
    const parsed = parseSecLabels(labels);
    if (!parsed || native.length !== parsed.vals.length) return null;
    const idx = native.map(function(_, i) {
      return i;
    }).filter(function(i) {
      return isFinite(native[i]);
    });
    idx.sort(function(a, b) {
      return native[a] - native[b];
    });
    const n = idx.map(function(i) {
      return native[i];
    });
    const v = idx.map(function(i) {
      return parsed.vals[i];
    });
    if (n.length < 2) return null;
    const up = v[1] > v[0];
    for (let i = 1; i < n.length; i++) {
      if (!(n[i] > n[i - 1])) return null;
      if (up ? !(v[i] > v[i - 1]) : !(v[i] < v[i - 1])) return null;
    }
    const k = (v[n.length - 1] - v[0]) / (n[n.length - 1] - n[0]);
    const span = Math.abs(v[n.length - 1] - v[0]) || 1;
    let linear = true;
    for (let i = 1; i < n.length - 1 && linear; i++) linear = Math.abs(v[0] + k * (n[i] - n[0]) - v[i]) <= 1e-6 * span;
    return { n, v, linear, prefix: parsed.prefix, suffix: parsed.suffix, comma: parsed.comma };
  }
  function interp(xs, ys, x) {
    const m = xs.length;
    const asc = xs[m - 1] > xs[0];
    let j = 1;
    while (j < m - 1 && (asc ? x > xs[j] : x < xs[j])) j++;
    const x0 = xs[j - 1], x1 = xs[j];
    return ys[j - 1] + (ys[j] - ys[j - 1]) * (x - x0) / (x1 - x0);
  }
  function secForward(m, native) {
    if (m.linear) {
      const L = m.n.length - 1;
      return m.v[0] + (m.v[L] - m.v[0]) * (native - m.n[0]) / (m.n[L] - m.n[0]);
    }
    return interp(m.n, m.v, native);
  }
  function secInverse(m, value) {
    if (m.linear) {
      const L = m.n.length - 1;
      return m.n[0] + (m.n[L] - m.n[0]) * (value - m.v[0]) / (m.v[L] - m.v[0]);
    }
    return interp(m.v, m.n, value);
  }
  function secTicks(m, lo, hi, count) {
    const a = secForward(m, lo), b = secForward(m, hi);
    const vals = niceTicks(Math.min(a, b), Math.max(a, b), count);
    if (!vals.length) return [];
    const step = vals.length > 1 ? Math.abs(vals[1] - vals[0]) : Math.abs(vals[0]) || 1;
    const out = [];
    for (let i = 0; i < vals.length; i++) {
      let s = fmtTick(vals[i], step);
      if (m.comma) {
        const neg = s.charAt(0) === "-";
        const body = neg ? s.slice(1) : s;
        const dot = body.indexOf(".");
        const int = dot < 0 ? body : body.slice(0, dot);
        s = (neg ? "-" : "") + int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (dot < 0 ? "" : body.slice(dot));
      }
      out.push({ n: secInverse(m, vals[i]), label: m.prefix + s + m.suffix });
    }
    return out;
  }

  // srcts/viewbox.ts
  function zoomViewBox(vb, factor, cx, cy) {
    const w = vb.w / factor;
    const h = vb.h / factor;
    return { x: cx - (cx - vb.x) / factor, y: cy - (cy - vb.y) / factor, w, h };
  }
  function zoomCap(maxZoom) {
    return typeof maxZoom === "number" && isFinite(maxZoom) && maxZoom >= 1 ? maxZoom : 0;
  }
  var CAP_EPS = 1e-9;
  function clampZoomFactor(vb, vb0, factor, maxZoom) {
    const cap = zoomCap(maxZoom);
    if (!cap || !(factor > 1) || !(vb0.w > 0) || !(vb0.h > 0)) return factor;
    const room = Math.min(vb.w * cap / vb0.w, vb.h * cap / vb0.h);
    if (!(room > 1 + CAP_EPS)) return 1;
    return Math.min(factor, room);
  }
  function zoomViewBoxCapped(vb, vb0, factor, cx, cy, maxZoom) {
    const f = vb0 ? clampZoomFactor(vb, vb0, factor, maxZoom) : factor;
    return f === 1 ? vb : zoomViewBox(vb, f, cx, cy);
  }
  function clampViewBox(vb, vb0, maxZoom) {
    const cap = zoomCap(maxZoom);
    if (!cap || !vb0 || !(vb0.w > 0) || !(vb0.h > 0)) return vb;
    const wMin = vb0.w / cap, hMin = vb0.h / cap;
    const narrowW = vb.w < wMin * (1 - CAP_EPS), narrowH = vb.h < hMin * (1 - CAP_EPS);
    if (!narrowW && !narrowH) return vb;
    const out = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
    if (narrowW) {
      out.x = vb.x + vb.w / 2 - wMin / 2;
      out.w = wMin;
    }
    if (narrowH) {
      out.y = vb.y + vb.h / 2 - hMin / 2;
      out.h = hMin;
    }
    return out;
  }
  function atMaxZoom(vb, vb0, maxZoom) {
    const cap = zoomCap(maxZoom);
    if (!cap || !vb0) return false;
    return vb.w <= vb0.w / cap * (1 + CAP_EPS) || vb.h <= vb0.h / cap * (1 + CAP_EPS);
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
  function isZoomedIn(vb, vb0) {
    return vb.w < vb0.w * 0.999 || vb.h < vb0.h * 0.999;
  }
  function userToCanvas(vb, cw, ch, x, y) {
    return { px: (x - vb.x) / vb.w * cw, py: (y - vb.y) / vb.h * ch };
  }
  function viewToPan(vb, vb0) {
    const sx = vb.w ? vb0.w / vb.w : 1;
    const sy = vb.h ? vb0.h / vb.h : 1;
    return { sx, sy, tx: vb0.x - vb.x * sx, ty: vb0.y - vb.y * sy };
  }
  function panToView(vb, vb0, x, y) {
    const t = viewToPan(vb, vb0);
    return { x: t.sx ? vb.x + (x - vb0.x) / t.sx : x, y: t.sy ? vb.y + (y - vb0.y) / t.sy : y };
  }
  function conjugatePan(t, ax, bx, ay, by) {
    return { sx: t.sx, sy: t.sy, tx: ax * t.tx + bx * (1 - t.sx), ty: ay * t.ty + by * (1 - t.sy) };
  }

  // srcts/features/axisZoom.ts
  function axisZoomFeature(ws) {
    function setupAxisZoom() {
      for (let i = 0; i < ws.azPanels.length; i++) {
        const g = ws.azPanels[i].grid;
        if (g && g.parentNode) g.parentNode.removeChild(g);
      }
      ws.azPanels = [];
      ws.panGroup = null;
      ws.axisZoomActive = false;
      ws.anchorPanel = null;
      if (ws.retickLayer) {
        ws.retickLayer.remove();
        ws.retickLayer = null;
      }
      if (!ws.opts.axisZoom || ws.rasterMode && ws.marksLayer !== "pans" || !ws.svgEl || !ws.vb0 || !ws.stage || !ws.panels.length) return;
      for (let i = 0; i < ws.panels.length; i++) {
        if (!axisRetickable(ws.panels[i].x) || !axisRetickable(ws.panels[i].y)) return;
      }
      if (!ws.svgEl.querySelector('[data-vellum-panel^="axis-x"] text, [data-vellum-panel^="axis-y"] text')) return;
      const pans = ws.svgEl.querySelectorAll("[data-vellum-pan]");
      for (let i = 0; i < pans.length; i++) {
        const nm = pans[i].getAttribute("data-vellum-pan");
        if (!ws.panels.some(function(p) {
          return p.name === nm;
        })) return;
      }
      const ref = ws.panels[0];
      const rw = ref.px1 - ref.px0, rh = ref.py1 - ref.py0;
      if (!rw || !rh) return;
      const found = [];
      for (let i = 0; i < ws.panels.length; i++) {
        const p = ws.panels[i];
        const pan = ws.svgEl.querySelector('[data-vellum-pan="' + cssEscape(p.name) + '"]');
        const outer = ws.svgEl.querySelector('[data-vellum-panel="' + cssEscape(p.name) + '"]');
        if (!pan || !outer) return;
        const ax = (p.px1 - p.px0) / rw, ay = (p.py1 - p.py0) / rh;
        if (!(ax > 0) || !(ay > 0)) return;
        const mirror = ws.aboveEl ? ws.aboveEl.querySelector('[data-vellum-pan="' + cssEscape(p.name) + '"]') : null;
        found.push({
          p,
          pan,
          mirror,
          outer,
          grid: null,
          ax,
          bx: p.px0 - ax * ref.px0,
          ay,
          by: p.py0 - ay * ref.py0,
          xLab: null,
          yLab: null,
          x2Lab: null,
          y2Lab: null,
          x2Map: null,
          y2Map: null,
          xTick: null,
          yTick: null
        });
      }
      ws.azPanels = found;
      ws.panGroup = found[0].pan;
      ws.axisZoomActive = true;
      scrapeAxisStyle();
      scrapeAxisAnchors();
      scrapeAxisTitles();
      hideStaticAxes();
      for (let i = 0; i < ws.azPanels.length; i++) {
        const a = ws.azPanels[i];
        adoptFurniture(a);
        const g = document.createElementNS(SVGNS, "g");
        g.setAttribute("class", "vellumwidget-retick-grid");
        a.outer.insertBefore(g, a.pan);
        a.grid = g;
      }
      ws.retickLayer = document.createElementNS(SVGNS, "svg");
      ws.retickLayer.setAttribute("class", "vellumwidget-retick-layer");
      ws.retickLayer.setAttribute("aria-hidden", "true");
      ws.retickLayer.setAttribute("viewBox", fmtViewBox(ws.vb0));
      ws.stage.appendChild(ws.retickLayer);
      applyPanTransforms();
      setupConstantMarks();
      setupConstantFurniture();
      retick();
    }
    function applyPanTransforms() {
      if (!ws.vb0) return;
      for (let i = 0; i < ws.azPanels.length; i++) {
        const t = ws.fx.azT(ws.azPanels[i]);
        ws.azPanels[i].pan.setAttribute("transform", ws.fx.fmtPan(t));
        setPanScaleVars(ws.azPanels[i].pan, t);
        const m = ws.azPanels[i].mirror;
        if (m) {
          m.setAttribute("transform", ws.fx.fmtPan(t));
          setPanScaleVars(m, t);
        }
      }
    }
    function setPanScaleVars(g, t) {
      g.style.setProperty("--vw-ix", String(t.sx ? 1 / t.sx : 1));
      g.style.setProperty("--vw-iy", String(t.sy ? 1 / t.sy : 1));
    }
    function setupConstantMarks() {
      if (!ws.axisZoomActive || ws.opts.zoomMarks === "scale" || !ws.panGroup) return;
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (!e.mark) continue;
        const nodes = ws.nodesByKey[e.key];
        if (!nodes) continue;
        const glyph = GLYPH_MARKS[e.mark] === true;
        for (let j = 0; j < nodes.length; j++) {
          const node = nodes[j];
          if (!ws.azPanels.some(function(a) {
            return a.pan.contains(node);
          })) continue;
          if (glyph) {
            node.style.setProperty("transform-box", "fill-box");
            node.style.setProperty("transform-origin", "center");
            const place = transAsCss(node);
            node.style.setProperty(
              "transform",
              (place ? place + " " : "") + "scale(var(--vw-ix,1),var(--vw-iy,1))"
            );
          } else {
            node.setAttribute("vector-effect", "non-scaling-stroke");
          }
        }
      }
    }
    function setupConstantFurniture() {
      if (!ws.axisZoomActive || ws.opts.zoomMarks === "scale") return;
      for (let i = 0; i < ws.azPanels.length; i++) {
        const a = ws.azPanels[i];
        constantFurnitureIn(a.pan);
        if (a.mirror) constantFurnitureIn(a.mirror);
      }
    }
    const SHAPES = { path: true, line: true, polyline: true, polygon: true, rect: true, circle: true, ellipse: true };
    function constantFurnitureIn(pan) {
      const all = pan.querySelectorAll("*");
      for (let i = 0; i < all.length; i++) {
        const n = all[i];
        const tag = n.tagName.toLowerCase();
        if (tag === "text") {
          constantText(n);
          continue;
        }
        if (!SHAPES[tag]) continue;
        if (n.closest('.vellumwidget-detail, [role="grid"]')) continue;
        if (n.style.getPropertyValue("transform")) continue;
        if (!n.closest("[data-key]") && inGlyphLayer(n)) {
          n.style.setProperty("transform-box", "fill-box");
          n.style.setProperty("transform-origin", "center");
          const place = transAsCss(n);
          n.style.setProperty("transform", (place ? place + " " : "") + "scale(var(--vw-ix,1),var(--vw-iy,1))");
        } else {
          n.setAttribute("vector-effect", "non-scaling-stroke");
        }
      }
    }
    function inGlyphLayer(n) {
      const g = n.closest("[data-vellum-id]");
      const m = g ? /^layer-\d+-([a-z0-9_]+)-g\d+/.exec(g.getAttribute("data-vellum-id") || "") : null;
      return !!m && GLYPH_MARKS[m[1]] === true;
    }
    function constantText(n) {
      if (n.style.getPropertyValue("transform")) return;
      const own = (n.getAttribute("transform") || "").trim();
      if (own && !parseTransformList(own)) return;
      const A = anchorThrough(n);
      const X = A.x, Y = A.y;
      if (!isFinite(X) || !isFinite(Y)) return;
      const place = transAsCss(n);
      n.style.setProperty("transform-box", "view-box");
      n.style.setProperty("transform-origin", "0px 0px");
      n.style.setProperty(
        "transform",
        "translate(" + X + "px," + Y + "px) scale(var(--vw-ix,1),var(--vw-iy,1)) translate(" + -X + "px," + -Y + "px)" + (place ? " " + place : "")
      );
    }
    function transAsCss(node) {
      const t = (node.getAttribute("transform") || "").trim();
      const m = parseTransformList(t);
      if (!m) return "";
      if (/^(\s*translate\([^)]*\)\s*)+$/.test(t)) return "translate(" + m[4] + "px," + m[5] + "px)";
      return "matrix(" + m.join(",") + ")";
    }
    function anchorThrough(node) {
      const x = parseFloat(node.getAttribute("x") || "") || 0, y = parseFloat(node.getAttribute("y") || "") || 0;
      const m = parseTransformList(node.getAttribute("transform"));
      return m ? applyAffine6(m, x, y) : { x, y };
    }
    function rotationOf(node) {
      const m = parseTransformList(node.getAttribute("transform"));
      if (!m) return 0;
      const r = Math.atan2(m[1], m[0]) * 180 / Math.PI;
      return Math.abs(r) < 1e-6 ? 0 : Math.round(r * 1e6) / 1e6;
    }
    function scrapeAxisStyle() {
      if (!ws.svgEl) return;
      const xText = ws.svgEl.querySelector('[data-vellum-panel^="axis-x"] text, [data-vellum-panel^="axis-y"] text');
      if (xText) {
        ws.axisStyle.textFill = xText.getAttribute("fill") || ws.axisStyle.textFill;
        ws.axisStyle.fontFamily = xText.getAttribute("font-family") || ws.axisStyle.fontFamily;
        const fs = parseFloat(xText.getAttribute("font-size") || "");
        if (fs) ws.axisStyle.fontSize = fs;
      }
      const grid = ws.svgEl.querySelector('[role="grid"] path, [role="grid"] line');
      if (grid) {
        ws.axisStyle.gridStroke = grid.getAttribute("stroke") || ws.axisStyle.gridStroke;
        const sw = parseFloat(grid.getAttribute("stroke-width") || "");
        if (sw) ws.axisStyle.gridWidth = sw;
      }
    }
    function scrapeAxisAnchors() {
      if (!ws.svgEl) return;
      const groups = ws.svgEl.querySelectorAll('[data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]');
      for (let g = 0; g < groups.length; g++) {
        const gname = groups[g].getAttribute("data-vellum-panel") || "";
        const isX = /^axis-x/.test(gname);
        const isSec = /^axis-[xy]2-/.test(gname);
        const texts = groups[g].querySelectorAll("text");
        if (!texts.length) continue;
        let sx = 0, sy = 0, n = 0, gap = 0;
        let first = null;
        const along = [], labs = [];
        for (let i = 0; i < texts.length; i++) {
          const at = anchorThrough(texts[i]);
          const x = at.x, y = at.y;
          along.push(isX ? x : y);
          labs.push(texts[i].textContent || "");
          if (!first) first = { x, y };
          else if (isX && !gap && y - first.y > 1) gap = y - first.y;
          sx += x;
          sy += y;
          n++;
        }
        if (!first || !n) continue;
        const mx = sx / n, my = sy / n;
        let best = null, bestD = Infinity;
        for (let i = 0; i < ws.azPanels.length; i++) {
          const p = ws.azPanels[i].p;
          let d;
          if (isX) {
            const slack = (p.px1 - p.px0) / 4;
            if (mx < p.px0 - slack || mx > p.px1 + slack) continue;
            d = first.y >= p.py1 - 1 ? first.y - p.py1 : first.y <= p.py0 + 1 ? p.py0 - first.y : Infinity;
          } else {
            const slack = (p.py1 - p.py0) / 4;
            if (my < p.py0 - slack || my > p.py1 + slack) continue;
            d = first.x <= p.px0 + 1 ? p.px0 - first.x : first.x >= p.px1 - 1 ? first.x - p.px1 : Infinity;
          }
          if (d < bestD) {
            bestD = d;
            best = ws.azPanels[i];
          }
        }
        if (!best) continue;
        const t0 = texts[0];
        const rot = rotationOf(t0);
        const anchor = {
          pos: isX ? first.y : first.x,
          // x labels centre on their tick (vellum centres wrapped lines itself, with
          // a start anchor and per-line offsets, so its anchor isn't reusable there).
          anchor: isX && !rot ? "middle" : t0.getAttribute("text-anchor") || (isX ? "middle" : "end"),
          baseline: t0.getAttribute("dominant-baseline") || (isX ? "text-before-edge" : "central"),
          gap: rot ? 0 : gap,
          rot
        };
        if (!isX && !rot) {
          let w0 = 0;
          for (let i = 0; i < texts.length; i++) w0 = Math.max(w0, labelWidth(texts[i]));
          anchor.w0 = w0;
        }
        if (isSec) {
          const p = best.p;
          const sc = isX ? p.x : p.y;
          if (!sc || isX && (t0.getAttribute("text-anchor") || "middle") !== "middle") continue;
          const k = isX ? (sc.native_hi - sc.native_lo) / (p.px1 - p.px0) : (sc.native_hi - sc.native_lo) / (p.py1 - p.py0);
          if (!isFinite(k) || !k) continue;
          const native = along.map(function(v) {
            return isX ? sc.native_lo + (v - p.px0) * k : sc.native_hi - (v - p.py0) * k;
          });
          const map = secAxisMap(native, labs);
          if (!map) continue;
          if (isX && !best.x2Lab) {
            best.x2Lab = anchor;
            best.x2Map = map;
          }
          if (!isX && !best.y2Lab) {
            best.y2Lab = anchor;
            best.y2Map = map;
          }
          continue;
        }
        if (isX && !best.xLab) best.xLab = anchor;
        if (!isX && !best.yLab) best.yLab = anchor;
      }
    }
    function scrapeAxisTitles() {
      if (!ws.svgEl || !ws.vb0) return;
      const vb0 = ws.vb0;
      const groups = ws.svgEl.querySelectorAll('[data-vellum-panel^="axis-title-y"]');
      const titles = [];
      for (let g = 0; g < groups.length; g++) {
        const node = groups[g].querySelector("text");
        if (!node) continue;
        const at = anchorThrough(node);
        const fs = parseFloat(node.getAttribute("font-size") || "") || ws.axisStyle.fontSize;
        const half = rotationOf(node) ? fs / 2 : labelWidth(node) / 2;
        const sec = /^axis-title-y2/.test(groups[g].getAttribute("data-vellum-panel") || "");
        const room = sec ? vb0.x + vb0.w - (at.x + half) : at.x - half - vb0.x;
        titles.push({
          t: { node, orig: node.getAttribute("transform"), room: Math.max(0, room), dir: sec ? 1 : -1, need: 0, shift: 0 },
          x: at.x,
          y: at.y
        });
      }
      if (!titles.length) return;
      for (let i = 0; i < ws.azPanels.length; i++) {
        const a = ws.azPanels[i];
        const labs = [a.yLab, a.y2Lab];
        for (let j = 0; j < labs.length; j++) {
          const lab = labs[j];
          if (!lab || lab.w0 === void 0) continue;
          const dir = lab.anchor === "end" ? -1 : lab.anchor === "start" ? 1 : 0;
          if (!dir) continue;
          let best = null, bestD = Infinity;
          for (let k = 0; k < titles.length; k++) {
            const c = titles[k];
            if (c.t.dir !== dir || (c.x - lab.pos) * dir <= 0) continue;
            const dy = c.y < a.p.py0 ? a.p.py0 - c.y : c.y > a.p.py1 ? c.y - a.p.py1 : 0;
            const d = Math.abs(c.x - lab.pos) + dy;
            if (d < bestD) {
              bestD = d;
              best = c.t;
            }
          }
          lab.title = best;
        }
      }
    }
    function labelWidth(t) {
      const f = t.getComputedTextLength;
      if (typeof f === "function") {
        try {
          const w = f.call(t);
          if (w > 0) return w;
        } catch (e) {
        }
      }
      const fs = parseFloat(t.getAttribute("font-size") || "") || ws.axisStyle.fontSize;
      return (t.textContent || "").length * 0.6 * fs;
    }
    function placeAxisTitles() {
      const seen = [];
      for (let i = 0; i < ws.azPanels.length; i++) {
        const labs = [ws.azPanels[i].yLab, ws.azPanels[i].y2Lab];
        for (let j = 0; j < labs.length; j++) {
          const t = labs[j] && labs[j].title;
          if (t && seen.indexOf(t) < 0) seen.push(t);
        }
      }
      for (let i = 0; i < seen.length; i++) {
        const t = seen[i];
        const shift = Math.min(t.room, Math.max(0, t.need));
        t.need = 0;
        if (Math.abs(shift - t.shift) < 0.01) continue;
        t.shift = shift;
        if (shift > 0) {
          t.node.setAttribute("transform", "translate(" + t.dir * shift + " 0)" + (t.orig ? " " + t.orig : ""));
        } else if (t.orig !== null) {
          t.node.setAttribute("transform", t.orig);
        } else {
          t.node.removeAttribute("transform");
        }
      }
    }
    function noteLabelWidth(lab, w) {
      if (lab.title && lab.w0 !== void 0) lab.title.need = Math.max(lab.title.need, w - lab.w0);
    }
    function hideStaticAxes() {
      if (!ws.svgEl) return;
      const grids = ws.svgEl.querySelectorAll('[role="grid"]');
      for (let i = 0; i < grids.length; i++) grids[i].style.display = "none";
      const axes = ws.svgEl.querySelectorAll('[data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]');
      for (let i = 0; i < axes.length; i++) {
        const kids = axes[i].children;
        let line = false;
        for (let j = 0; j < kids.length; j++) if (isAxisLine(kids[j])) line = true;
        if (!line) {
          axes[i].style.display = "none";
          continue;
        }
        for (let j = 0; j < kids.length; j++) {
          if (!isAxisLine(kids[j])) kids[j].style.display = "none";
        }
      }
    }
    function isAxisLine(n) {
      if (n.tagName.toLowerCase() !== "path") return false;
      const s = pathSegments(n.getAttribute("d") || "");
      return s !== null && s.length === 1 && (s[0][0] === s[0][2] || s[0][1] === s[0][3]);
    }
    function pathSegments(d) {
      const re = /M\s*([-\d.eE]+)[\s,]+([-\d.eE]+)\s*L\s*([-\d.eE]+)[\s,]+([-\d.eE]+)\s*/g;
      const out = [];
      let m, end = 0;
      const t = d.trim();
      while ((m = re.exec(t)) !== null) {
        if (m.index !== end) return null;
        const v = [+m[1], +m[2], +m[3], +m[4]];
        if (!v.every(isFinite)) return null;
        out.push(v);
        end = re.lastIndex;
      }
      return end === t.length && out.length ? out : null;
    }
    function adoptFurniture(a) {
      const p = a.p;
      const kids = Array.prototype.slice.call(a.pan.children);
      const near = function(v, w) {
        return Math.abs(v - w) < 0.5;
      };
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i];
        if (c.hasAttribute("data-vellum-id") || c.hasAttribute("data-key")) break;
        const role = c.getAttribute("role");
        if (role === "grid") continue;
        const tag = c.tagName.toLowerCase();
        if (i === 0 && !role && (tag === "path" || tag === "rect")) {
          c.setAttribute("data-vw-panel-bg", "");
          a.outer.insertBefore(c, a.pan);
          continue;
        }
        if (role !== "presentation" || tag !== "g") break;
        const paths = c.children;
        let tick = null, isX = false;
        for (let j = 0; j < paths.length && paths.length; j++) {
          const segs = pathSegments(paths[j].getAttribute("d") || "");
          if (!segs) {
            tick = null;
            break;
          }
          for (let k = 0; k < segs.length; k++) {
            const s = segs[k];
            let edge = null, len = 0, vx = false;
            if (s[0] === s[2]) {
              vx = true;
              len = Math.abs(s[3] - s[1]);
              edge = near(s[1], p.py1) || near(s[3], p.py1) ? "bottom" : near(s[1], p.py0) || near(s[3], p.py0) ? "top" : null;
            } else if (s[1] === s[3]) {
              len = Math.abs(s[2] - s[0]);
              edge = near(s[0], p.px0) || near(s[2], p.px0) ? "left" : near(s[0], p.px1) || near(s[2], p.px1) ? "right" : null;
            }
            if (!edge || !(len > 0) || tick && tick.edge !== edge) {
              tick = null;
              break;
            }
            if (!tick) {
              isX = vx;
              tick = {
                stroke: paths[j].getAttribute("stroke") || ws.axisStyle.textFill,
                width: parseFloat(paths[j].getAttribute("stroke-width") || "") || 1,
                len,
                edge
              };
            } else if (len > tick.len) tick.len = len;
          }
          if (!tick) break;
        }
        if (!tick) break;
        c.style.display = "none";
        if (isX) {
          if (!a.xTick || tick.len > a.xTick.len) a.xTick = tick;
        } else if (!a.yTick || tick.len > a.yTick.len) a.yTick = tick;
      }
    }
    function tickLine(ts, at, p) {
      const l = document.createElementNS(SVGNS, "line");
      let x1 = at, x2 = at, y1 = at, y2 = at;
      if (ts.edge === "bottom") {
        y1 = p.py1;
        y2 = p.py1 - ts.len;
      } else if (ts.edge === "top") {
        y1 = p.py0;
        y2 = p.py0 + ts.len;
      } else if (ts.edge === "left") {
        x1 = p.px0;
        x2 = p.px0 + ts.len;
      } else {
        x1 = p.px1;
        x2 = p.px1 - ts.len;
      }
      l.setAttribute("x1", String(x1));
      l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2));
      l.setAttribute("y2", String(y2));
      l.setAttribute("stroke", ts.stroke);
      l.setAttribute("stroke-width", String(ts.width));
      l.setAttribute("class", "vellumwidget-retick-tick");
      return l;
    }
    function gridLine(x1, y1, x2, y2) {
      const l = document.createElementNS(SVGNS, "line");
      l.setAttribute("x1", String(x1));
      l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2));
      l.setAttribute("y2", String(y2));
      l.setAttribute("stroke", ws.axisStyle.gridStroke);
      l.setAttribute("stroke-width", String(ws.axisStyle.gridWidth));
      return l;
    }
    function axisLabel(text, x, y, anchor, baseline, rot) {
      const t = document.createElementNS(SVGNS, "text");
      t.setAttribute("x", String(x));
      t.setAttribute("y", String(y));
      t.setAttribute("fill", ws.axisStyle.textFill);
      t.setAttribute("font-family", ws.axisStyle.fontFamily);
      t.setAttribute("font-size", String(ws.axisStyle.fontSize));
      t.setAttribute("text-anchor", anchor);
      t.setAttribute("dominant-baseline", baseline);
      if (rot) t.setAttribute("transform", "rotate(" + rot + " " + x + " " + y + ")");
      t.textContent = text;
      return t;
    }
    function wrapLabel(t, text, x, gap) {
      const sp = text.indexOf(" ");
      if (sp < 0) return;
      t.textContent = "";
      const parts = [text.slice(0, sp), text.slice(sp + 1)];
      for (let i = 0; i < parts.length; i++) {
        const ts = document.createElementNS(SVGNS, "tspan");
        ts.setAttribute("x", String(x));
        if (i > 0) ts.setAttribute("dy", String(gap));
        ts.textContent = parts[i];
        t.appendChild(ts);
      }
    }
    function retick() {
      if (!ws.axisZoomActive || !ws.vb || !ws.vb0 || !ws.retickLayer) return;
      while (ws.retickLayer.firstChild) ws.retickLayer.removeChild(ws.retickLayer.firstChild);
      for (let i = 0; i < ws.azPanels.length; i++) retickPanel(ws.azPanels[i]);
      placeAxisTitles();
    }
    function retickPanel(a) {
      const p = a.p, grid = a.grid, layer = ws.retickLayer;
      if (!grid || !layer) return;
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      const t = ws.fx.azT(a);
      const ticks_ = [];
      if (p.x && p.px1 !== p.px0) {
        const ax = p.x;
        const k = (ax.native_hi - ax.native_lo) / (p.px1 - p.px0);
        const nA = ax.native_lo + ((p.px0 - t.tx) / t.sx - p.px0) * k;
        const nB = ax.native_lo + ((p.px1 - t.tx) / t.sx - p.px0) * k;
        const ticks = axisTicks(ax, Math.min(nA, nB), Math.max(nA, nB), 5);
        for (let i = 0; i < ticks.length; i++) {
          const px = p.px0 + (ticks[i].n - ax.native_lo) / k;
          const sx = t.sx * px + t.tx;
          if (!isFinite(sx) || sx < p.px0 - 0.5 || sx > p.px1 + 0.5) continue;
          grid.appendChild(gridLine(sx, p.py0, sx, p.py1));
          if (a.xTick) ticks_.push(tickLine(a.xTick, sx, p));
          if (a.xLab) {
            const lab = axisLabel(ticks[i].label, sx, a.xLab.pos, a.xLab.anchor, a.xLab.baseline, a.xLab.rot);
            if (a.xLab.gap > 0) wrapLabel(lab, ticks[i].label, sx, a.xLab.gap);
            layer.appendChild(lab);
          }
        }
        if (a.x2Lab && a.x2Map) {
          const st = secTicks(a.x2Map, Math.min(nA, nB), Math.max(nA, nB), 5);
          for (let i = 0; i < st.length; i++) {
            const sx = t.sx * (p.px0 + (st[i].n - ax.native_lo) / k) + t.tx;
            if (!isFinite(sx) || sx < p.px0 - 0.5 || sx > p.px1 + 0.5) continue;
            layer.appendChild(axisLabel(st[i].label, sx, a.x2Lab.pos, a.x2Lab.anchor, a.x2Lab.baseline, a.x2Lab.rot));
          }
        }
      }
      if (p.y && p.py1 !== p.py0) {
        const ay = p.y;
        const k = (ay.native_hi - ay.native_lo) / (p.py1 - p.py0);
        const nA = ay.native_hi - ((p.py0 - t.ty) / t.sy - p.py0) * k;
        const nB = ay.native_hi - ((p.py1 - t.ty) / t.sy - p.py0) * k;
        const ticks = axisTicks(ay, Math.min(nA, nB), Math.max(nA, nB), 5);
        for (let i = 0; i < ticks.length; i++) {
          const py = p.py0 + (ay.native_hi - ticks[i].n) / k;
          const sy = t.sy * py + t.ty;
          if (!isFinite(sy) || sy < p.py0 - 0.5 || sy > p.py1 + 0.5) continue;
          grid.appendChild(gridLine(p.px0, sy, p.px1, sy));
          if (a.yTick) ticks_.push(tickLine(a.yTick, sy, p));
          if (a.yLab) {
            const lab = axisLabel(ticks[i].label, a.yLab.pos, sy, a.yLab.anchor, a.yLab.baseline, a.yLab.rot);
            layer.appendChild(lab);
            noteLabelWidth(a.yLab, labelWidth(lab));
          }
        }
        if (a.y2Lab && a.y2Map) {
          const st = secTicks(a.y2Map, Math.min(nA, nB), Math.max(nA, nB), 5);
          for (let i = 0; i < st.length; i++) {
            const sy = t.sy * (p.py0 + (ay.native_hi - st[i].n) / k) + t.ty;
            if (!isFinite(sy) || sy < p.py0 - 0.5 || sy > p.py1 + 0.5) continue;
            const lab = axisLabel(st[i].label, a.y2Lab.pos, sy, a.y2Lab.anchor, a.y2Lab.baseline, a.y2Lab.rot);
            layer.appendChild(lab);
            noteLabelWidth(a.y2Lab, labelWidth(lab));
          }
        }
      }
      for (let i = 0; i < ticks_.length; i++) grid.appendChild(ticks_[i]);
    }
    return { setupAxisZoom, applyPanTransforms, retick };
  }

  // srcts/features/markState.ts
  var MS_DIM = 1;
  var MS_HIDDEN = 2;
  var MS_MUTED = 4;
  var DIM_DEFAULT = 0.28;
  var MUTED_ALPHA = 0.12;
  var ALPHA_CODE = 2147483648;
  function dimAlphaOf(ws, k) {
    const a = ws.msAlpha;
    const i = a ? a[k] : 0;
    return i ? ws.msAlphaPal[i - 1] : ws.msDimAlpha;
  }
  function markStateFeature(ws) {
    let forDl = null;
    let keyIdx = /* @__PURE__ */ new Map();
    let tagIds = {};
    let paletteIdx = {};
    let alphaIdx = {};
    function sync() {
      const dl = ws.dl;
      if (!dl) {
        forDl = null;
        ws.msFlags = ws.msColor = ws.msCond = null;
        ws.msAlpha = null;
        ws.msActive = false;
        return false;
      }
      if (forDl === dl) return true;
      forDl = dl;
      keyIdx = /* @__PURE__ */ new Map();
      for (let i = 0; i < dl.keys.length; i++) if (!keyIdx.has(dl.keys[i])) keyIdx.set(dl.keys[i], i);
      tagIds = {};
      paletteIdx = {};
      alphaIdx = {};
      ws.msPalette = [];
      ws.msAlphaPal = [];
      ws.msAlpha = new Uint16Array(dl.keys.length);
      ws.msFlags = new Uint8Array(dl.keys.length);
      ws.msColor = new Uint32Array(dl.keys.length);
      ws.msCond = new Uint32Array(dl.keys.length);
      ws.msActive = false;
      return true;
    }
    function keyIds(keys) {
      sync();
      const out = new Int32Array(keys.length);
      for (let i = 0; i < keys.length; i++) {
        const v = keyIdx.get(keys[i]);
        out[i] = v == null ? -1 : v;
      }
      return out;
    }
    function condStatesBegin() {
      if (!sync() || !ws.msCond) return false;
      ws.msCond.fill(0);
      return true;
    }
    function colorCode(color) {
      if (color == null) return 1;
      let p = paletteIdx[color];
      if (p == null) {
        p = paletteIdx[color] = ws.msPalette.length;
        ws.msPalette.push(color);
      }
      return p + 2;
    }
    function alphaCode(a) {
      const s = String(a);
      let p = alphaIdx[s];
      if (p == null) {
        if (ws.msAlphaPal.length >= 65535) return ALPHA_CODE + ws.msAlphaPal.length - 1;
        p = alphaIdx[s] = ws.msAlphaPal.length;
        ws.msAlphaPal.push(a);
      }
      return ALPHA_CODE + p;
    }
    function condStateSet(tag, tagged, members, active, look, colors) {
      const cond = ws.msCond;
      if (!cond || !ws.dl) return;
      let ids = tagIds[tag];
      if (!ids) ids = tagIds[tag] = keyIds(tagged);
      const code = look.kind === "color" ? colorCode(look.color) : look.kind === "alpha" ? alphaCode(look.alpha) : look.kind === "dim" ? 1 : 0;
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (id < 0) continue;
        if (!active || members[tagged[i]]) {
          cond[id] = 0;
          continue;
        }
        const own = colors ? colors[i] : null;
        cond[id] = own != null ? colorCode(own) : code;
      }
    }
    function updateMarkStates() {
      if (!ws.rasterMode || !sync() || !ws.msFlags || !ws.msColor || !ws.msCond) return;
      const flags = ws.msFlags, color = ws.msColor, cond = ws.msCond, alpha = ws.msAlpha;
      flags.fill(0);
      color.fill(0);
      if (alpha) alpha.fill(0);
      let active = false;
      for (let k = 0; k < cond.length; k++) {
        const c = cond[k];
        if (!c) continue;
        active = true;
        if (c === 1) flags[k] = MS_DIM;
        else if (c >= ALPHA_CODE) {
          flags[k] = MS_DIM;
          if (alpha) alpha[k] = c - ALPHA_CODE + 1;
        } else color[k] = c - 1;
      }
      const hide = function(set) {
        for (const key in set) {
          if (!set[key]) continue;
          const id = keyIdx.get(key);
          if (id != null) {
            flags[id] |= MS_HIDDEN;
            active = true;
          }
        }
      };
      hide(ws.filteredKeySet);
      hide(ws.hiddenKeySet);
      if (ws.fx.legendPolicy() === "mute") {
        for (const s in ws.legendOff) {
          if (!ws.legendOff[s]) continue;
          const members = ws.legendIndex[s] || [];
          for (let i = 0; i < members.length; i++) {
            const id = keyIdx.get(members[i]);
            if (id != null) {
              flags[id] |= MS_MUTED;
              active = true;
            }
          }
        }
      }
      ws.msActive = active;
      ws.msDimAlpha = dimAlpha();
      ws.fx.restyleRuns();
      if (ws.fx.ringMode()) ws.fx.drawPoints(true);
    }
    function dimAlpha() {
      try {
        const v = parseFloat(getComputedStyle(ws.el).getPropertyValue("--vellumwidget-dim-opacity"));
        return isFinite(v) && v >= 0 && v <= 1 ? v : DIM_DEFAULT;
      } catch (e) {
        return DIM_DEFAULT;
      }
    }
    return { condStatesBegin, condStateSet, updateMarkStates, keyIds };
  }

  // srcts/raise.ts
  function boundary(dl, a, b) {
    return dl.panel[a] !== dl.panel[b] || dl.group[a] !== dl.group[b] || dl.kind[a] !== dl.kind[b] || dl.flags[a] !== 0 || dl.flags[b] !== 0 || dl.run[a] > 0 || dl.run[b] > 0;
  }
  function raisedOrder(dl, member) {
    const n = dl.n;
    let out = null;
    let s = 0;
    for (let i = 1; i <= n; i++) {
      if (i < n && !boundary(dl, i - 1, i)) continue;
      let seenMember = false, moves = false;
      for (let j = s; j < i; j++) {
        if (member[dl.key[j]]) seenMember = true;
        else if (seenMember) {
          moves = true;
          break;
        }
      }
      if (moves) {
        if (!out) {
          out = new Uint32Array(n);
          for (let j = 0; j < s; j++) out[j] = j;
        }
        let w = s;
        for (let j = s; j < i; j++) if (!member[dl.key[j]]) out[w++] = j;
        for (let j = s; j < i; j++) if (member[dl.key[j]]) out[w++] = j;
      } else if (out) {
        for (let j = s; j < i; j++) out[j] = j;
      }
      s = i;
    }
    return out;
  }

  // srcts/features/raise.ts
  var SEG_END = "vw-seg-end";
  function raiseFeature(ws) {
    let raised = [];
    let marked = /* @__PURE__ */ new WeakSet();
    let segEnd = /* @__PURE__ */ new WeakMap();
    let layerLast = /* @__PURE__ */ new WeakMap();
    const LAYER_RE = /^layer-(\d+)-/;
    function plainGroup(e) {
      if (e.tagName.toLowerCase() !== "g") return false;
      for (let i = 0; i < e.attributes.length; i++) {
        const a = e.attributes[i].name;
        if (a !== "data-vellum-id" && a !== "role" && a !== "class") return false;
      }
      return true;
    }
    function lastOfLayer(p) {
      const hit = layerLast.get(p);
      if (hit) return hit;
      let last = p;
      const e = p;
      const m = e.nodeType === 1 && e.getAttribute("data-vellum-id") ? LAYER_RE.exec(e.getAttribute("data-vellum-id")) : null;
      if (m && plainGroup(e)) {
        for (let s = e.nextSibling; s; s = s.nextSibling) {
          if (s.nodeType !== 1) continue;
          const se = s, id = se.getAttribute("data-vellum-id") || "";
          const sm = LAYER_RE.exec(id);
          if (!sm || sm[1] !== m[1] || !plainGroup(se)) break;
          last = s;
        }
      }
      layerLast.set(p, last);
      return last;
    }
    function markParent(p) {
      if (marked.has(p)) return;
      marked.add(p);
      const kids = Array.prototype.slice.call(p.childNodes);
      let run = [], tag = "";
      const close = function(before) {
        if (!run.length) return;
        let end = null;
        if (before) {
          end = document.createComment(SEG_END);
          p.insertBefore(end, before);
        }
        for (let i = 0; i < run.length; i++) segEnd.set(run[i], end);
        run = [];
      };
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        const keyed = k.nodeType === 1 && k.hasAttribute("data-key");
        if (k.nodeType !== 1) continue;
        if (keyed && (!run.length || k.tagName === tag)) {
          run.push(k);
          tag = k.tagName;
          continue;
        }
        close(k);
        if (keyed) {
          run.push(k);
          tag = k.tagName;
        }
      }
      close(null);
    }
    function restore() {
      for (let i = raised.length - 1; i >= 0; i--) {
        const r = raised[i];
        if (r.home.parentNode) r.home.parentNode.replaceChild(r.node, r.home);
      }
      raised = [];
    }
    function raiseSelected() {
      restore();
      if (ws.fx.ringMode()) return;
      const keys = ws.fx.selectedKeys();
      if (!keys.length) return;
      const nodes = [];
      for (let i = 0; i < keys.length; i++) {
        const ns = ws.fx.elementsForKey(keys[i]);
        for (let j = 0; j < ns.length; j++) if (ns[j].parentNode) nodes.push(ns[j]);
      }
      if (!nodes.length) return;
      nodes.sort((a, b) => a === b ? 0 : a.compareDocumentPosition(b) & 4 ? -1 : 1);
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i], p = n.parentNode;
        markParent(p);
        let tp = p, end = segEnd.has(n) ? segEnd.get(n) : null;
        if (end === null) tp = lastOfLayer(p);
        if (end && end.parentNode !== p) continue;
        let nx = n.nextSibling;
        while (nx && nx.nodeType !== 1 && nx !== end) nx = nx.nextSibling;
        if (tp === p && nx === end) continue;
        if (tp !== p) end = null;
        const home = document.createComment("vw-home");
        p.replaceChild(home, n);
        tp.insertBefore(n, end);
        raised.push({ node: n, home });
      }
    }
    let cacheDl = null, cacheRev = -1, cacheOrd = null;
    function raiseOrder(dl) {
      if (cacheDl === dl && cacheRev === ws.selRev) return cacheOrd;
      cacheDl = dl;
      cacheRev = ws.selRev;
      cacheOrd = null;
      const keys = ws.fx.selectedKeys();
      if (!keys.length) return null;
      const ids = ws.fx.keyIds(keys);
      const member = new Uint8Array(dl.keys.length);
      for (let i = 0; i < ids.length; i++) if (ids[i] >= 0) member[ids[i]] = 1;
      cacheOrd = raisedOrder(dl, member);
      return cacheOrd;
    }
    return { raiseSelected, raiseOrder };
  }

  // srcts/features/runStyle.ts
  var ATLAS_GAP = 4;
  var ATLAS_MAX = 4e3;
  var CACHE_PER_RUN = 4;
  function runStyleFeature(ws) {
    let forDl = null;
    let keyIdx = /* @__PURE__ */ new Map();
    let runKeys = [];
    let svgs = [];
    let docs = [];
    let cache = [];
    let cur = [];
    let want = [];
    let geos = [];
    let geoDl = null;
    let svgBroken = [];
    let splits = [];
    function sync() {
      const dl = ws.dl;
      if (!dl || !dl.runImgs || !ws.runSvg) {
        forDl = null;
        return false;
      }
      if (forDl === dl) return true;
      forDl = dl;
      svgs = ws.runSvg;
      keyIdx = /* @__PURE__ */ new Map();
      for (let i = 0; i < dl.keys.length; i++) if (!keyIdx.has(dl.keys[i])) keyIdx.set(dl.keys[i], i);
      const sets = [];
      for (let r = 0; r < dl.nRuns; r++) sets.push({});
      for (let i = 0; i < dl.n; i++) {
        const r = dl.run[i];
        if (r > 0 && r <= dl.nRuns) sets[r - 1][dl.key[i]] = true;
      }
      runKeys = sets.map((s) => Uint32Array.from(Object.keys(s).map(Number)));
      docs = [];
      cache = [];
      cur = [];
      want = [];
      geos = [];
      splits = [];
      return true;
    }
    function sigOf(r) {
      if (!ws.msActive || !ws.msFlags || !ws.msColor) return "";
      const flags = ws.msFlags, color = ws.msColor, ids = runKeys[r];
      let s = "";
      for (let q = 0; q < ids.length; q++) {
        const k = ids[q], f = flags[k], c = color[k];
        if (f || c) s += k + ":" + f + ":" + (c ? ws.msPalette[c - 1] : "") + (f & MS_DIM ? ":" + dimAlphaOf(ws, k) : "") + ";";
      }
      return s ? s + "@" + ws.msDimAlpha : "";
    }
    function docFor(r) {
      if (docs[r] !== void 0) return docs[r];
      let el = null;
      try {
        const W = window;
        const d = new W.DOMParser().parseFromString(svgs[r] || "", "image/svg+xml");
        el = d.documentElement && d.documentElement.nodeName === "svg" && !d.getElementsByTagName("parsererror").length ? d.documentElement : null;
      } catch (e) {
        el = null;
      }
      docs[r] = el;
      return el;
    }
    function styleNode(n, k) {
      const flags = ws.msFlags, color = ws.msColor, pal = ws.msPalette;
      if (!flags || !color) return true;
      const f = flags[k], c = color[k];
      if (f & MS_HIDDEN) return false;
      let st = n.getAttribute("style") || "";
      if (c) {
        const col = pal[c - 1];
        const fa = n.getAttribute("fill"), sa = n.getAttribute("stroke");
        if (fa && fa !== "none") st += ";fill:" + col;
        if (sa && sa !== "none") st += ";stroke:" + col;
      }
      if (f & MS_DIM) st += ";opacity:" + dimAlphaOf(ws, k);
      else if (f & MS_MUTED) st += ";opacity:" + MUTED_ALPHA;
      if (st) n.setAttribute("style", st.replace(/^;/, ""));
      return true;
    }
    function pngScale(r) {
      const dl = ws.dl;
      const png = dl.runImgs[r];
      return png && png.naturalWidth > 0 && dl.runW > 0 ? png.naturalWidth / dl.runW : 2;
    }
    function rasterise(svg, w, h, k, done) {
      const dl = ws.dl;
      svg.setAttribute("width", String(Math.round(w * k)));
      svg.setAttribute("height", String(Math.round(h * k)));
      let text = "";
      try {
        const W = window;
        text = new W.XMLSerializer().serializeToString(svg);
      } catch (e) {
        return null;
      }
      const href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text);
      const img = document.createElement("img");
      const s = { img, href, ready: false };
      img.onload = function() {
        s.ready = true;
        if (ws.dl !== dl) return;
        done(s);
      };
      img.onerror = function() {
        s.failed = true;
        if (ws.dl !== dl) return;
        done(s);
      };
      img.src = href;
      return s;
    }
    function rasterRun(r, drop, done) {
      const dl = ws.dl, root = docFor(r);
      if (!root) return null;
      const svg = root.cloneNode(true);
      const nodes = Array.prototype.slice.call(svg.querySelectorAll("[data-key]"));
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const k = keyIdx.get(n.getAttribute("data-key") || "");
        if (k == null) continue;
        if (drop && drop[k] || !styleNode(n, k)) {
          if (n.parentNode) n.parentNode.removeChild(n);
        }
      }
      return rasterise(svg, dl.runW, dl.runH, pngScale(r), done);
    }
    function closure(g, seed, among) {
      const inn = [];
      const out = [];
      for (let q = 0; q < seed.length; q++) if (!inn[seed[q]]) {
        inn[seed[q]] = true;
        out.push(seed[q]);
      }
      for (let grew = true; grew; ) {
        grew = false;
        for (let j = 0; j < g.k.length; j++) {
          if (inn[j] || !among(j)) continue;
          for (let q = 0; q < out.length; q++) {
            const i = out[q];
            if (g.x0[j] < g.x1[i] && g.x1[j] > g.x0[i] && g.y0[j] < g.y1[i] && g.y1[j] > g.y0[i]) {
              inn[j] = true;
              out.push(j);
              grew = true;
              break;
            }
          }
        }
      }
      return out;
    }
    function makePatch(r, sig) {
      const g = geoOf(r);
      const flags = ws.msFlags, color = ws.msColor;
      const touched = [];
      for (let j = 0; j < g.k.length; j++) if (flags[g.k[j]] || color[g.k[j]]) touched.push(j);
      if (!touched.length) return { parts: [], patch: null };
      const region = closure(g, touched, () => true);
      const cut = [];
      let draw = false;
      for (let q = 0; q < region.length; q++) {
        const j = region[q];
        cut.push(g.x0[j], g.y0[j], g.x1[j], g.y1[j]);
        if (!(flags[g.k[j]] & MS_HIDDEN)) draw = true;
      }
      const patch = { cut, fill: null };
      if (!draw) return { parts: [], patch };
      const f = rasterRun(r, null, function(s) {
        if (s.failed || want[r] !== sig) return;
        cur[r] = patch;
        refresh();
      });
      if (!f) return { parts: [], patch: null };
      patch.fill = { img: f.img, href: f.href };
      return { parts: [f], patch };
    }
    let rebuilding = false;
    function refresh() {
      if (ws.markTier === "detail") {
        if (rebuilding) return;
        rebuilding = true;
        try {
          ws.fx.evalTier();
        } finally {
          rebuilding = false;
        }
      } else if (ws.fx.ringMode()) {
        ws.fx.drawPoints(true);
      }
    }
    function restyleRuns() {
      if (!sync()) return false;
      const dl = ws.dl;
      let changed = false, sigChanged = false;
      for (let r = 0; r < dl.nRuns; r++) {
        const sig = sigOf(r);
        if (want[r] !== sig) sigChanged = true;
        want[r] = sig;
        if (!sig) {
          if (cur[r]) {
            cur[r] = null;
            changed = true;
          }
          continue;
        }
        const list = cache[r] || (cache[r] = []);
        let hit = null;
        for (let q = 0; q < list.length; q++) if (list[q].sig === sig) {
          hit = list[q];
          break;
        }
        if (!hit) {
          const m = makePatch(r, sig);
          hit = { sig, parts: m.parts, patch: m.patch };
          list.push(hit);
          if (list.length > CACHE_PER_RUN) list.shift();
        }
        if (hit.parts.every((p) => !p || p.ready) && cur[r] !== hit.patch) {
          cur[r] = hit.patch;
          changed = true;
        }
      }
      if ((changed || sigChanged && splitInDetail) && ws.markTier === "detail") refresh();
      return changed;
    }
    let splitInDetail = false;
    function anchorOf(n) {
      const t = n.tagName.toLowerCase() === "text" ? n : n.querySelector("text");
      if (!t) return null;
      const x = parseFloat(t.getAttribute("x") || "") || 0, y = parseFloat(t.getAttribute("y") || "") || 0;
      const tr = (t.getAttribute("transform") || "").trim();
      if (!tr) return { x, y };
      const m = parseTransformList(tr);
      if (!m) return null;
      const A = applyAffine6(m, x, y);
      return isFinite(A.x) && isFinite(A.y) ? A : null;
    }
    function geoOf(r) {
      if (geos[r]) return geos[r];
      const dl = ws.dl;
      const at = {};
      const g = { k: [], p: [], x0: [], y0: [], x1: [], y1: [], cst: [], ax: [], ay: [], iso: [], nCst: 0 };
      for (let i = 0; i < dl.n; i++) {
        if (dl.run[i] !== r + 1) continue;
        const k = dl.key[i];
        let j = at[k];
        if (j === void 0) {
          j = at[k] = g.k.length;
          g.k.push(k);
          g.p.push(dl.panel[i] <= dl.panels.length ? dl.panel[i] : 0);
          g.x0.push(dl.bx0[i]);
          g.y0.push(dl.by0[i]);
          g.x1.push(dl.bx1[i]);
          g.y1.push(dl.by1[i]);
        } else {
          g.x0[j] = Math.min(g.x0[j], dl.bx0[i]);
          g.y0[j] = Math.min(g.y0[j], dl.by0[i]);
          g.x1[j] = Math.max(g.x1[j], dl.bx1[i]);
          g.y1[j] = Math.max(g.y1[j], dl.by1[i]);
        }
      }
      const root = ws.runSvg ? docFor(r) : null;
      const nodeOf = {};
      if (root) {
        const nodes = root.querySelectorAll("[data-key]");
        for (let i = 0; i < nodes.length; i++) {
          const kk = nodes[i].getAttribute("data-key") || "";
          if (!nodeOf[kk]) nodeOf[kk] = nodes[i];
        }
      }
      for (let j = 0; j < g.k.length; j++) {
        g.x0[j] -= RUN_BOX_PAD;
        g.y0[j] -= RUN_BOX_PAD;
        g.x1[j] += RUN_BOX_PAD;
        g.y1[j] += RUN_BOX_PAD;
        const key = dl.keys[g.k[j]];
        const e = ws.meta[key];
        const mark = e && e.mark ? e.mark : "";
        const text = mark === "text";
        const c = (text || GLYPH_MARKS[mark] === true) && g.p[j] > 0 && isFinite(g.x0[j]) && g.x1[j] > g.x0[j] && g.y1[j] > g.y0[j];
        g.cst.push(c);
        let ax = (g.x0[j] + g.x1[j]) / 2, ay = (g.y0[j] + g.y1[j]) / 2;
        if (c && text && nodeOf[key]) {
          const a = anchorOf(nodeOf[key]);
          if (a) {
            ax = a.x;
            ay = a.y;
          }
        }
        g.ax.push(ax);
        g.ay.push(ay);
        if (c) g.nCst++;
      }
      const ord = g.k.map((_, j) => j).sort((a, b) => g.x0[a] - g.x0[b]);
      const iso = g.k.map(() => true);
      for (let a = 0; a < ord.length; a++) {
        const i = ord[a];
        for (let b = a + 1; b < ord.length; b++) {
          const j = ord[b];
          if (g.x0[j] >= g.x1[i]) break;
          if (g.y0[j] < g.y1[i] && g.y1[j] > g.y0[i]) {
            iso[i] = false;
            iso[j] = false;
          }
        }
      }
      g.iso = iso;
      geos[r] = g;
      return g;
    }
    function atlasOf(r, g, js, done) {
      const dl = ws.dl, root = docFor(r);
      if (!root) return null;
      const want_ = {};
      for (let q = 0; q < js.length; q++) want_[dl.keys[g.k[js[q]]]] = q;
      let wmax = 0;
      for (let q = 0; q < js.length; q++) wmax = Math.max(wmax, g.x1[js[q]] - g.x0[js[q]]);
      const W = Math.max(512, Math.ceil(wmax) + 2 * ATLAS_GAP);
      const cx = [], cy = [];
      let x = ATLAS_GAP, y = ATLAS_GAP, rowH = 0;
      for (let q = 0; q < js.length; q++) {
        const j = js[q], w = g.x1[j] - g.x0[j], h = g.y1[j] - g.y0[j];
        if (x + w + ATLAS_GAP > W) {
          x = ATLAS_GAP;
          y += rowH + ATLAS_GAP;
          rowH = 0;
        }
        cx.push(x);
        cy.push(y);
        x += Math.ceil(w) + ATLAS_GAP;
        rowH = Math.max(rowH, Math.ceil(h));
      }
      const H = y + rowH + ATLAS_GAP;
      const NS = "http://www.w3.org/2000/svg";
      const doc = root.ownerDocument;
      const svg = doc.createElementNS(NS, "svg");
      svg.setAttribute("xmlns", NS);
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      const defs = root.querySelectorAll("defs");
      for (let i = 0; i < defs.length; i++) svg.appendChild(defs[i].cloneNode(true));
      const nodes = root.querySelectorAll("[data-key]");
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const q = want_[n.getAttribute("data-key") || ""];
        if (q === void 0) continue;
        const j = js[q];
        const copy = n.cloneNode(true);
        if (!styleNode(copy, g.k[j])) continue;
        let top = copy;
        for (let up = n.parentNode; up && up !== root; up = up.parentNode) {
          if (up.nodeType !== 1 || up.tagName.toLowerCase() === "defs") break;
          const sh = up.cloneNode(false);
          sh.appendChild(top);
          top = sh;
        }
        const cell = doc.createElementNS(NS, "g");
        cell.setAttribute("transform", "translate(" + (cx[q] - g.x0[j]) + " " + (cy[q] - g.y0[j]) + ")");
        cell.appendChild(top);
        svg.appendChild(cell);
      }
      const ks = Math.max(2, pngScale(r));
      const s = rasterise(svg, W, H, ks, done);
      return s ? { s, w: W, h: H, cx, cy, ks } : null;
    }
    let pngCopies = [];
    function pngCanvas(r) {
      const dl = ws.dl, img = dl.runImgs[r];
      if (pngCopies[r]) return pngCopies[r];
      const im = img;
      const w = im.naturalWidth || 0, h = im.naturalHeight || 0;
      const c = w > 0 && h > 0 ? document.createElement("canvas") : null;
      const x = c && typeof c.getContext === "function" ? c.getContext("2d") : null;
      if (!c || !x) return img;
      c.width = w;
      c.height = h;
      x.drawImage(im, 0, 0);
      pngCopies[r] = c;
      return c;
    }
    function runSplit(r1) {
      sync();
      const dl = ws.dl;
      if (!dl || !dl.runImgs || !dl.runHref) return null;
      if (geoDl !== dl) {
        geoDl = dl;
        geos = [];
        splits = [];
        svgBroken = [];
        pngCopies = [];
      }
      const r = r1 - 1;
      if (r < 0 || r >= dl.nRuns) return null;
      const g = geoOf(r);
      if (!g.nCst) return null;
      const sig = forDl === dl ? sigOf(r) : "";
      const hit = splits[r];
      if (hit && hit.parts.some((s) => !!s && !!s.failed)) {
        svgBroken[r] = true;
        splits[r] = void 0;
      } else if (hit && hit.sig === sig) return hit.parts.every((s) => !s || s.ready) ? hit.split : null;
      const flags = ws.msActive ? ws.msFlags : null, color = ws.msActive ? ws.msColor : null;
      const hasSvg = forDl === dl && !svgBroken[r] && !!docFor(r);
      const png = pngCanvas(r), pngHref = dl.runHref[r] || "";
      const marks = [], atl = [], atlAt = [];
      const cut = [];
      const isCst = {};
      let restAny = false;
      for (let j = 0; j < g.k.length; j++) {
        const k = g.k[j], f = flags ? flags[k] : 0, c = color ? color[k] : 0;
        if (!g.cst[j]) {
          restAny = true;
          continue;
        }
        isCst[k] = true;
        cut.push(g.x0[j], g.y0[j], g.x1[j], g.y1[j]);
        const m = {
          k,
          p: g.p[j],
          x0: g.x0[j],
          y0: g.y0[j],
          x1: g.x1[j],
          y1: g.y1[j],
          ax: g.ax[j],
          ay: g.ay[j],
          src: png,
          href: pngHref,
          atlas: false,
          fw: dl.runW,
          fh: dl.runH,
          sx: g.x0[j],
          sy: g.y0[j],
          ks: pngScale(r)
        };
        if (f & MS_HIDDEN) m.src = null;
        else if (hasSvg && (!g.iso[j] || f || c) && atl.length < ATLAS_MAX) {
          atlAt.push(marks.length);
          atl.push(j);
        }
        marks.push(m);
      }
      const parts = [];
      const split = { marks, rest: null };
      const entry = { sig, parts, split };
      splits[r] = entry;
      const redraw = function() {
        if (ws.dl === dl && splits[r] === entry) refresh();
      };
      if (atl.length) {
        const a = atlasOf(r, g, atl, redraw);
        if (a) {
          parts.push(a.s);
          for (let q = 0; q < atl.length; q++) {
            const m = marks[atlAt[q]];
            m.src = a.s.img;
            m.href = a.s.href;
            m.atlas = true;
            m.fw = a.w;
            m.fh = a.h;
            m.sx = a.cx[q];
            m.sy = a.cy[q];
            m.ks = a.ks;
          }
        }
      }
      let rest = null;
      if (restAny) {
        rest = { cut: cut.slice(), fill: null };
        if (hasSvg) {
          const meets = function(j) {
            for (let q = 0; q < cut.length; q += 4) {
              if (g.x0[j] < cut[q + 2] && g.x1[j] > cut[q] && g.y0[j] < cut[q + 3] && g.y1[j] > cut[q + 1]) return true;
            }
            return false;
          };
          const seed = [];
          for (let j = 0; j < g.k.length; j++) {
            if (g.cst[j]) continue;
            const k = g.k[j];
            if (flags && flags[k] || color && color[k] || meets(j)) seed.push(j);
          }
          const region = closure(g, seed, (j) => !g.cst[j]);
          let draw = false;
          for (let q = 0; q < region.length; q++) {
            const j = region[q];
            rest.cut.push(g.x0[j], g.y0[j], g.x1[j], g.y1[j]);
            if (!(flags && flags[g.k[j]] & MS_HIDDEN)) draw = true;
          }
          if (draw) {
            const f = rasterRun(r, isCst, redraw);
            if (f) {
              parts.push(f);
              rest.fill = { img: f.img, href: f.href };
            }
          }
        }
      }
      split.rest = rest;
      return parts.every((s) => !s || s.ready) ? split : null;
    }
    function runPatch(r) {
      const dl = ws.dl;
      if (!dl || !dl.runImgs || forDl !== dl) return null;
      return cur[r - 1] || null;
    }
    function runStyled() {
      const dl = ws.dl;
      const out = [];
      if (!dl) return out;
      for (let r = 0; r < dl.nRuns; r++) out.push(forDl === dl && !!cur[r]);
      return out;
    }
    function markSplitInDetail(on) {
      splitInDetail = on;
    }
    let keyRun = null;
    let keyRunDl = null;
    function constAnchor(key) {
      if (!sync()) return null;
      const dl = ws.dl;
      const id = keyIdx.get(key);
      if (id == null) return null;
      if (!keyRun || keyRunDl !== dl) {
        keyRun = /* @__PURE__ */ new Map();
        keyRunDl = dl;
        for (let r2 = 0; r2 < runKeys.length; r2++) {
          const ids = runKeys[r2];
          for (let q = 0; q < ids.length; q++) if (!keyRun.has(ids[q])) keyRun.set(ids[q], r2);
        }
      }
      const r = keyRun.get(id);
      if (r == null) return null;
      const g = geoOf(r);
      for (let j = 0; j < g.k.length; j++) {
        if (g.k[j] === id) return g.cst[j] ? { x: g.ax[j], y: g.ay[j] } : null;
      }
      return null;
    }
    return { restyleRuns, runPatch, runStyled, runSplit, markSplitInDetail, constAnchor };
  }
  function runSvgsOf(svg, n) {
    if (svg == null) return null;
    const a = asColumn(svg).map(String);
    return a.length === n ? a : null;
  }

  // srcts/features/detail.ts
  var DETAIL_DEFAULT = 3e3;
  function detailFeature(ws) {
    let timer = 0;
    function ringMode() {
      return ws.rasterMode && ws.markTier !== "detail";
    }
    function enterAt() {
      const v = ws.opts.detailMarks;
      return v == null ? DETAIL_DEFAULT : v;
    }
    function scheduleTier() {
      if (timer) clearTimeout(timer);
      timer = 0;
      if (!ws.rasterMode || !ws.dl) return;
      timer = window.setTimeout(function() {
        timer = 0;
        evalTier();
      }, SETTLE_MS);
    }
    function zoomed() {
      if (!ws.vb || !ws.vb0) return false;
      if (ws.axisZoomActive && ws.azPanels.length) {
        return ws.azPanels.some(function(a) {
          const t = ws.fx.azT(a);
          return t.sx > 1.0001 || t.sy > 1.0001;
        });
      }
      return isZoomedIn(ws.vb, ws.vb0);
    }
    function visibleRecords(dl, cap) {
      const out = [];
      const np = dl.panels.length;
      const T = [null];
      for (let p = 1; p <= np; p++) {
        const a = ws.axisZoomActive ? ws.azPanels.filter((q) => q.p.name === dl.panels[p - 1])[0] : null;
        if (a) {
          const t = ws.fx.azT(a);
          T.push({ sx: t.sx, sy: t.sy, tx: t.tx, ty: t.ty, r: [a.p.px0, a.p.py0, a.p.px1, a.p.py1] });
        } else T.push(null);
      }
      const vb = ws.vb;
      for (let i = 0; i < dl.n; i++) {
        let x0 = dl.bx0[i], x1 = dl.bx1[i], y0 = dl.by0[i], y1 = dl.by1[i];
        const t = dl.panel[i] <= np ? T[dl.panel[i]] : null;
        if (t) {
          x0 = t.sx * x0 + t.tx;
          x1 = t.sx * x1 + t.tx;
          y0 = t.sy * y0 + t.ty;
          y1 = t.sy * y1 + t.ty;
          if (x1 < t.r[0] || x0 > t.r[2] || y1 < t.r[1] || y0 > t.r[3]) continue;
        } else if (ws.axisZoomActive) {
          if (x1 < ws.vb0.x || x0 > ws.vb0.x + ws.vb0.w || y1 < ws.vb0.y || y0 > ws.vb0.y + ws.vb0.h) continue;
        } else if (x1 < vb.x || x0 > vb.x + vb.w || y1 < vb.y || y0 > vb.y + vb.h) continue;
        out.push(i);
        if (out.length > cap) return null;
      }
      return out;
    }
    function evalTier() {
      const dl = ws.dl;
      const enter = enterAt();
      if (!ws.rasterMode || !dl || !dl.exact || !(enter > 0) || !ws.svgEl) {
        if (ws.markTier === "detail") leaveDetail();
        if (ws.rasterMode) ws.markTier = zoomed() ? "mid" : "overview";
        return;
      }
      if (!zoomed()) {
        if (ws.markTier === "detail") leaveDetail();
        ws.markTier = "overview";
        return;
      }
      const exit = Math.round(enter * 1.5);
      const vis = visibleRecords(dl, ws.markTier === "detail" ? exit : enter - 1);
      if (vis == null) {
        if (ws.markTier === "detail") leaveDetail();
        ws.markTier = "mid";
        return;
      }
      buildDetail(dl, vis);
    }
    function splitHex(c) {
      if (/^#[0-9a-fA-F]{8}$/.test(c)) {
        const a = parseInt(c.slice(7, 9), 16) / 255;
        return [c.slice(0, 7), a >= 1 ? null : String(Math.round(a * 1e3) / 1e3)];
      }
      return [c, null];
    }
    let defsSeq = 0;
    function gradRef(D, dl, gi) {
      if (D.grads[gi]) return D.grads[gi];
      const g = dl.gradients[gi - 1];
      const id = D.pre + "g" + gi;
      const e = document.createElementNS(SVGNS, g.radial ? "radialGradient" : "linearGradient");
      e.setAttribute("id", id);
      e.setAttribute("gradientUnits", "userSpaceOnUse");
      e.setAttribute("gradientTransform", "matrix(" + g.m.join(" ") + ")");
      if (g.radial) {
        e.setAttribute("cx", String(g.x2));
        e.setAttribute("cy", String(g.y2));
        e.setAttribute("r", String(g.r2));
        e.setAttribute("fx", String(g.x1));
        e.setAttribute("fy", String(g.y1));
        e.setAttribute("fr", String(g.r1));
      } else {
        e.setAttribute("x1", String(g.x1));
        e.setAttribute("y1", String(g.y1));
        e.setAttribute("x2", String(g.x2));
        e.setAttribute("y2", String(g.y2));
      }
      for (let k = 0; k < g.stops.length; k++) {
        const st = document.createElementNS(SVGNS, "stop");
        const c = splitHex(g.stops[k].c);
        st.setAttribute("offset", String(g.stops[k].o));
        st.setAttribute("stop-color", c[0]);
        if (c[1] != null) st.setAttribute("stop-opacity", c[1]);
        e.appendChild(st);
      }
      D.el.appendChild(e);
      return D.grads[gi] = id;
    }
    function clipRef(D, dl, ci) {
      if (D.clips[ci]) return D.clips[ci];
      const c = dl.clips[ci - 1];
      const ids = [];
      for (let q = 0; q <= c.pn; q++) ids.push(D.pre + "c" + ci + "-" + q);
      for (let q = 0; q <= c.pn; q++) {
        const cp = document.createElementNS(SVGNS, "clipPath");
        cp.setAttribute("id", ids[q]);
        cp.setAttribute("clipPathUnits", "userSpaceOnUse");
        if (q < c.pn) {
          const sh = c.ps + q;
          let d = "";
          for (let run = dl.cpPathOff[sh]; run < dl.cpPathOff[sh + 1]; run++) {
            for (let v = dl.cpRunOff[run]; v < dl.cpRunOff[run + 1]; v++) {
              d += (v === dl.cpRunOff[run] ? "M" : "L") + dl.cpXy[2 * v] + " " + dl.cpXy[2 * v + 1];
            }
            d += "Z";
          }
          const path = document.createElementNS(SVGNS, "path");
          path.setAttribute("d", d);
          if (dl.cpEvenodd[sh] === 1) path.setAttribute("clip-rule", "evenodd");
          cp.appendChild(path);
          cp.setAttribute("clip-path", "url(#" + ids[q + 1] + ")");
        } else {
          const r = document.createElementNS(SVGNS, "rect");
          r.setAttribute("x", String(c.x0));
          r.setAttribute("y", String(c.y0));
          r.setAttribute("width", String(Math.max(0, c.x1 - c.x0)));
          r.setAttribute("height", String(Math.max(0, c.y1 - c.y0)));
          cp.appendChild(r);
        }
        D.el.appendChild(cp);
      }
      return D.clips[ci] = ids[0];
    }
    function nodeFor(dl, i, D) {
      const j = dl.row[i], kd = dl.kind[i];
      let n;
      let glyph = false;
      if (kd === DL_POINT) {
        const sh = dl.shape[j], cx = dl.cx[j], cy = dl.cy[j], r = dl.r[j];
        glyph = true;
        if (sh === 0 || !isLineGlyph(sh) && !markerRing(sh)) {
          n = document.createElementNS(SVGNS, "circle");
          n.setAttribute("cx", String(cx));
          n.setAttribute("cy", String(cy));
          n.setAttribute("r", String(r));
        } else {
          n = document.createElementNS(SVGNS, "path");
          let d = "";
          if (sh === 4) d = "M" + cx + " " + (cy - r) + "V" + (cy + r) + "M" + (cx - r) + " " + cy + "H" + (cx + r);
          else if (sh === 5) {
            const q = r * Math.SQRT1_2;
            d = "M" + (cx - q) + " " + (cy - q) + "L" + (cx + q) + " " + (cy + q) + "M" + (cx - q) + " " + (cy + q) + "L" + (cx + q) + " " + (cy - q);
          } else {
            const m = markerRing(sh);
            for (let k = 0; k < m.length; k += 2) d += (k ? "L" : "M") + (cx + m[k] * r) + " " + (cy + m[k + 1] * r);
            d += "Z";
          }
          n.setAttribute("d", d);
        }
      } else if (kd === DL_RECT) {
        n = document.createElementNS(SVGNS, "rect");
        const x = dl.rx[j], y = dl.ry[j], w = dl.rw[j], h = dl.rh[j];
        n.setAttribute("x", String(Math.min(x, x + w)));
        n.setAttribute("y", String(Math.min(y, y + h)));
        n.setAttribute("width", String(Math.abs(w)));
        n.setAttribute("height", String(Math.abs(h)));
      } else {
        n = document.createElementNS(SVGNS, "path");
        let d = "";
        const closed = dl.closed[j] === 1;
        for (let run = dl.pathOff[j]; run < dl.pathOff[j + 1]; run++) {
          for (let v = dl.runOff[run]; v < dl.runOff[run + 1]; v++) {
            d += (v === dl.runOff[run] ? "M" : "L") + dl.xy[2 * v] + " " + dl.xy[2 * v + 1];
          }
          if (closed) d += "Z";
        }
        n.setAttribute("d", d);
        if (dl.evenodd[j] === 1) n.setAttribute("fill-rule", "evenodd");
      }
      const pt = dl.paints[dl.paint[i]];
      const fillable = kd !== 2 || dl.closed[j] === 1;
      if (pt.grad > 0 && D && fillable) {
        n.setAttribute("fill", "url(#" + gradRef(D, dl, pt.grad) + ")");
      } else if (pt.fill && fillable && !(kd === DL_POINT && isLineGlyph(dl.shape[j]))) {
        const f = splitHex(pt.fill);
        n.setAttribute("fill", f[0]);
        if (f[1] != null) n.setAttribute("fill-opacity", f[1]);
      } else n.setAttribute("fill", "none");
      if (pt.stroke && pt.width > 0) {
        const s = splitHex(pt.stroke);
        n.setAttribute("stroke", s[0]);
        if (s[1] != null) n.setAttribute("stroke-opacity", s[1]);
        n.setAttribute("stroke-width", String(pt.width));
        if (pt.dash) n.setAttribute("stroke-dasharray", pt.dash.join(" "));
        n.setAttribute("stroke-linecap", pt.cap);
        n.setAttribute("stroke-linejoin", pt.join);
      }
      n.setAttribute("data-key", dl.keys[dl.key[i]]);
      const ci = dl.clip[i];
      if (D && ci > 0 && dl.clips[ci - 1] && dl.clips[ci - 1].pn > 0) n.setAttribute("clip-path", "url(#" + clipRef(D, dl, ci) + ")");
      if (ws.axisZoomActive) {
        if (glyph && ws.opts.zoomMarks !== "scale") {
          n.style.setProperty("transform-box", "fill-box");
          n.style.setProperty("transform-origin", "center");
          n.style.setProperty("transform", "scale(var(--vw-ix,1),var(--vw-iy,1))");
        } else n.setAttribute("vector-effect", "non-scaling-stroke");
      }
      return n;
    }
    function dropNodes() {
      for (let i = 0; i < ws.detailGroups.length; i++) ws.detailGroups[i].remove();
      ws.detailGroups = [];
      for (let i = 0; i < ws.detailKeys.length; i++) {
        const k = ws.detailKeys[i], nodes = ws.nodesByKey[k];
        if (!nodes) continue;
        const keep = nodes.filter((n) => !n.closest || !n.closest(".vellumwidget-detail"));
        if (keep.length) ws.nodesByKey[k] = keep;
        else delete ws.nodesByKey[k];
      }
      ws.detailKeys = [];
    }
    function buildDetail(dl, vis) {
      const svg = ws.svgEl;
      dropNodes();
      const groups = {};
      const groupFor = function(p) {
        if (groups[p]) return groups[p];
        const g = document.createElementNS(SVGNS, "g");
        g.setAttribute("class", "vellumwidget-detail");
        const name = p > 0 ? dl.panels[p - 1] : null;
        const host = name && svg.querySelector('[data-vellum-pan="' + cssEscape(name) + '"]') || svg;
        host.appendChild(g);
        ws.detailGroups.push(g);
        groups[p] = g;
        return g;
      };
      let D;
      if (dl.gradients.length || dl.groups.length || dl.cpPathOff.length > 1 || dl.runHref) {
        const el = document.createElementNS(SVGNS, "defs");
        el.setAttribute("class", "vellumwidget-detail");
        svg.insertBefore(el, svg.firstChild);
        ws.detailGroups.push(el);
        D = { el, pre: "vw-detail" + ++defsSeq + "-", grads: {}, clips: {} };
      }
      const chains = {};
      const hostFor = function(p, grp) {
        const root = groupFor(p);
        if (!dl.groups.length) return root;
        const want = [];
        for (let q = grp; q > 0 && want.length < 64; q = dl.groups[q - 1] ? dl.groups[q - 1].parent : 0) want.unshift(q);
        const st = chains[p] || (chains[p] = []);
        let k = 0;
        while (k < st.length && k < want.length && st[k].g === want[k]) k++;
        st.length = k;
        while (st.length < want.length) {
          const g = document.createElementNS(SVGNS, "g");
          g.setAttribute("opacity", String(dl.groups[want[st.length] - 1].alpha));
          (st.length ? st[st.length - 1].el : root).appendChild(g);
          st.push({ g: want[st.length], el: g });
        }
        return st.length ? st[st.length - 1].el : root;
      };
      const runIds = {};
      const placed = {};
      const panHost = [false];
      for (let p = 1; p <= dl.panels.length; p++) {
        panHost.push(!!svg.querySelector('[data-vellum-pan="' + cssEscape(dl.panels[p - 1]) + '"]'));
      }
      const anyPan = panHost.some((h) => h);
      const rootClip = function(r) {
        if (!anyPan || !D) return null;
        const id = D.pre + "runclip" + r;
        if (D.el.querySelector("#" + id)) return id;
        const cp = document.createElementNS(SVGNS, "clipPath");
        cp.setAttribute("id", id);
        cp.setAttribute("clipPathUnits", "userSpaceOnUse");
        for (let i = 0; i < dl.n; i++) {
          if (dl.run[i] !== r) continue;
          const p = dl.panel[i] <= dl.panels.length ? dl.panel[i] : 0;
          if (panHost[p]) continue;
          const rc = document.createElementNS(SVGNS, "rect");
          rc.setAttribute("x", String(dl.bx0[i] - RUN_BOX_PAD));
          rc.setAttribute("y", String(dl.by0[i] - RUN_BOX_PAD));
          rc.setAttribute("width", String(dl.bx1[i] - dl.bx0[i] + 2 * RUN_BOX_PAD));
          rc.setAttribute("height", String(dl.by1[i] - dl.by0[i] + 2 * RUN_BOX_PAD));
          cp.appendChild(rc);
        }
        D.el.appendChild(cp);
        return id;
      };
      const cstPanel = function(p) {
        if (!panHost[p] || !ws.axisZoomActive || ws.opts.zoomMarks === "scale") return false;
        return ws.azPanels.some((a) => a.p.name === dl.panels[p - 1]);
      };
      const constAt = {};
      const counter = function(el, ax, ay) {
        const st = el.style;
        st.setProperty("transform-box", "view-box");
        st.setProperty("transform-origin", "0px 0px");
        st.setProperty("transform", "translate(" + ax + "px," + ay + "px) scale(var(--vw-ix,1),var(--vw-iy,1)) translate(" + -ax + "px," + -ay + "px)");
      };
      const imgDef = function(id, href, w, h) {
        if (!D.el.querySelector("#" + id)) {
          const im = document.createElementNS(SVGNS, "image");
          im.setAttribute("id", id);
          im.setAttribute("x", "0");
          im.setAttribute("y", "0");
          im.setAttribute("width", String(w));
          im.setAttribute("height", String(h));
          im.setAttribute("preserveAspectRatio", "none");
          im.setAttribute("href", href);
          D.el.appendChild(im);
        }
        return id;
      };
      const rectsInto = function(el, cut, fill) {
        for (let q = 0; q < cut.length; q += 4) {
          const rc = document.createElementNS(SVGNS, "rect");
          rc.setAttribute("x", String(cut[q]));
          rc.setAttribute("y", String(cut[q + 1]));
          rc.setAttribute("width", String(cut[q + 2] - cut[q]));
          rc.setAttribute("height", String(cut[q + 3] - cut[q + 1]));
          if (fill) rc.setAttribute("fill", fill);
          el.appendChild(rc);
        }
      };
      const patchInto = function(g, r, R, tag) {
        const u = document.createElementNS(SVGNS, "use");
        u.setAttribute("href", "#" + imgDef(D.pre + "runpng" + r, dl.runHref[r - 1], dl.runW, dl.runH));
        if (R.cut.length) {
          const mid = D.pre + "runcut" + tag + r;
          if (!D.el.querySelector("#" + mid)) {
            const mk = document.createElementNS(SVGNS, "mask");
            mk.setAttribute("id", mid);
            mk.setAttribute("maskUnits", "userSpaceOnUse");
            mk.setAttribute("x", "0");
            mk.setAttribute("y", "0");
            mk.setAttribute("width", String(dl.runW));
            mk.setAttribute("height", String(dl.runH));
            rectsInto(mk, [0, 0, dl.runW, dl.runH], "#fff");
            rectsInto(mk, R.cut, "#000");
            D.el.appendChild(mk);
          }
          u.setAttribute("mask", "url(#" + mid + ")");
        }
        g.appendChild(u);
        if (R.fill) {
          const f = document.createElementNS(SVGNS, "use");
          f.setAttribute("href", "#" + imgDef(D.pre + "runfill" + tag + r, R.fill.href, dl.runW, dl.runH));
          const cid = D.pre + "runin" + tag + r;
          if (!D.el.querySelector("#" + cid)) {
            const c = document.createElementNS(SVGNS, "clipPath");
            c.setAttribute("id", cid);
            c.setAttribute("clipPathUnits", "userSpaceOnUse");
            rectsInto(c, R.cut);
            D.el.appendChild(c);
          }
          f.setAttribute("clip-path", "url(#" + cid + ")");
          g.appendChild(f);
        }
      };
      let usedSplit = false;
      const placeSplit = function(p, r, sp) {
        const g = document.createElementNS(SVGNS, "g");
        g.setAttribute("class", "vellumwidget-detail-run vellumwidget-detail-split");
        g.setAttribute("data-run", String(r));
        const mode = dl.runBlend ? dl.runBlend[r - 1] : "normal";
        if (mode && mode !== "normal") g.style.setProperty("mix-blend-mode", mode);
        const cp = ws.fx.panelClip(dl.panels[p - 1]);
        if (cp) g.setAttribute("clip-path", cp);
        if (sp.rest) patchInto(g, r, sp.rest, "s");
        for (let q = 0; q < sp.marks.length; q++) {
          const m = sp.marks[q];
          if (m.p !== p) continue;
          constAt[m.k] = { ax: m.ax, ay: m.ay };
          if (!m.src) continue;
          const id = m.atlas ? imgDef(D.pre + "atlas" + r, m.href, m.fw, m.fh) : imgDef(D.pre + "runpng" + r, m.href, m.fw, m.fh);
          const w = m.x1 - m.x0, h = m.y1 - m.y0;
          const box = document.createElementNS(SVGNS, "svg");
          box.setAttribute("x", String(m.x0));
          box.setAttribute("y", String(m.y0));
          box.setAttribute("width", String(w));
          box.setAttribute("height", String(h));
          box.setAttribute("viewBox", m.sx + " " + m.sy + " " + w + " " + h);
          box.setAttribute("preserveAspectRatio", "none");
          const u = document.createElementNS(SVGNS, "use");
          u.setAttribute("href", "#" + id);
          box.appendChild(u);
          const cg = document.createElementNS(SVGNS, "g");
          cg.setAttribute("class", "vellumwidget-detail-const");
          counter(cg, m.ax, m.ay);
          cg.appendChild(box);
          g.appendChild(cg);
        }
        groupFor(p).appendChild(g);
        if (chains[p]) chains[p].length = 0;
      };
      const placeRun = function(p, r) {
        const tag = (panHost[p] ? p : "root") + ":" + r;
        if (placed[tag] || !D || !dl.runHref) return;
        placed[tag] = true;
        const cp0 = cstPanel(p);
        if (cp0) usedSplit = true;
        const sp = cp0 ? ws.fx.runSplit(r) : null;
        if (sp) {
          placeSplit(p, r, sp);
          return;
        }
        const patch = ws.fx.runPatch(r);
        let u;
        if (patch) {
          u = document.createElementNS(SVGNS, "g");
          u.setAttribute("class", "vellumwidget-detail-run vellumwidget-detail-patch");
          u.setAttribute("data-run", String(r));
          patchInto(u, r, patch, "p");
        } else {
          if (!runIds[r]) {
            const im = document.createElementNS(SVGNS, "image");
            runIds[r] = D.pre + "run" + r;
            im.setAttribute("id", runIds[r]);
            im.setAttribute("x", "0");
            im.setAttribute("y", "0");
            im.setAttribute("width", String(dl.runW));
            im.setAttribute("height", String(dl.runH));
            im.setAttribute("preserveAspectRatio", "none");
            im.setAttribute("data-run", String(r));
            im.setAttribute("href", dl.runHref[r - 1] || "");
            D.el.appendChild(im);
          }
          u = document.createElementNS(SVGNS, "use");
          u.setAttribute("class", "vellumwidget-detail-run");
          u.setAttribute("href", "#" + runIds[r]);
        }
        const mode = dl.runBlend ? dl.runBlend[r - 1] : "normal";
        if (mode && mode !== "normal") u.style.setProperty("mix-blend-mode", mode);
        if (!panHost[p]) {
          const cid = rootClip(r);
          if (cid) u.setAttribute("clip-path", "url(#" + cid + ")");
        } else {
          const cp = ws.fx.panelClip(dl.panels[p - 1]);
          if (cp) u.setAttribute("clip-path", cp);
        }
        groupFor(p).appendChild(u);
        if (chains[p]) chains[p].length = 0;
      };
      let order = vis;
      if (dl.runImgs) {
        const firsts = {}, extra = [];
        for (let i = 0; i < dl.n; i++) {
          if (!(dl.run[i] > 0)) continue;
          const tag = dl.panel[i] + ":" + dl.run[i];
          if (!firsts[tag]) {
            firsts[tag] = true;
            extra.push(i);
          }
        }
        if (extra.length) {
          const all = {};
          for (let v = 0; v < vis.length; v++) all[vis[v]] = true;
          for (let e = 0; e < extra.length; e++) all[extra[e]] = true;
          order = Object.keys(all).map(Number).sort((a, b) => a - b);
        }
      }
      const visSet = {};
      for (let v = 0; v < vis.length; v++) visSet[vis[v]] = true;
      const seen = {};
      for (let v = 0; v < order.length; v++) {
        const i = order[v];
        if (dl.runImgs && dl.run[i] > 0) {
          const p = dl.panel[i] <= dl.panels.length ? dl.panel[i] : 0;
          placeRun(p, dl.run[i]);
          if (!visSet[i] || dl.flags[i] & DL_FLAG_PICK) continue;
          const n2 = nodeFor(dl, i);
          n2.setAttribute("fill", "#000");
          n2.setAttribute("fill-opacity", "0");
          n2.removeAttribute("stroke");
          n2.removeAttribute("stroke-opacity");
          n2.removeAttribute("stroke-dasharray");
          n2.setAttribute("class", "vellumwidget-detail-proxy");
          const ca = constAt[dl.key[i]];
          if (ca) counter(n2, ca.ax, ca.ay);
          groupFor(p).appendChild(n2);
          const k2 = dl.keys[dl.key[i]];
          (ws.nodesByKey[k2] = ws.nodesByKey[k2] || []).push(n2);
          if (!seen[k2]) {
            seen[k2] = true;
            ws.detailKeys.push(k2);
          }
          continue;
        }
        if (dl.flags[i]) continue;
        const n = nodeFor(dl, i, D);
        hostFor(dl.panel[i] <= dl.panels.length ? dl.panel[i] : 0, dl.group[i]).appendChild(n);
        const k = dl.keys[dl.key[i]];
        (ws.nodesByKey[k] = ws.nodesByKey[k] || []).push(n);
        if (!seen[k]) {
          seen[k] = true;
          ws.detailKeys.push(k);
        }
      }
      ws.fx.markSplitInDetail(usedSplit);
      const was = ws.markTier;
      ws.markTier = "detail";
      ws.calib = null;
      ws.hoverSig = "";
      ws.fx.hideCanvas();
      ws.fx.showMarksLayer(false);
      ws.fx.clearGroup(ws.selGroup);
      ws.fx.clearGroup(ws.hovGroup);
      ws.fx.refreshSelected();
      ws.fx.applyLegend();
      for (let i = 0; i < ws.detailKeys.length; i++) {
        if (ws.filteredKeySet[ws.detailKeys[i]]) ws.fx.addClassForKeys([ws.detailKeys[i]], "vellumwidget-filtered");
      }
      if (ws.hovering && ws.lastHoverKeys.length) ws.fx.addClassForKeys(ws.lastHoverKeys, "vellumwidget-hl");
      ws.fx.setupA11y();
      if (was !== "detail") ws.fx.announce(ws.detailKeys.length + " marks in view");
    }
    function leaveDetail() {
      if (ws.markTier !== "detail") return;
      dropNodes();
      ws.fx.markSplitInDetail(false);
      ws.markTier = "mid";
      ws.calib = null;
      ws.hoverSig = "";
      ws.el.classList.remove("vellumwidget-hovering");
      ws.fx.refreshSelected();
      ws.fx.setupA11y();
      ws.fx.showMarksLayer(true);
      ws.fx.drawPoints();
    }
    return { scheduleTier, evalTier, ringMode, leaveDetail };
  }

  // srcts/binds.ts
  var UNIT_SECONDS = { day: 86400, second: 1 };
  function channelToNative(ch, src, dst) {
    if (dst.type === "discrete") {
      if (!ch.levels) return null;
      const levels = dst.levels != null ? asColumn(dst.levels).map(String) : [];
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < ch.levels.length; i++) {
        const k = levels.indexOf(String(ch.levels[i]));
        if (k < 0) continue;
        lo = Math.min(lo, k + 1 - 0.5);
        hi = Math.max(hi, k + 1 + 0.5);
      }
      return isFinite(lo) && isFinite(hi) ? [lo, hi] : null;
    }
    if (ch.levels) return null;
    let a = ch.lo, b = ch.hi;
    const su = src && src.time_unit ? UNIT_SECONDS[src.time_unit] : void 0;
    const du = dst.time_unit ? UNIT_SECONDS[dst.time_unit] : void 0;
    if (su && du && su !== du) {
      a = a * su / du;
      b = b * su / du;
    }
    const na = dataToNative(dst, a), nb = dataToNative(dst, b);
    if (!isFinite(na) || !isFinite(nb) || na === nb) return null;
    return [Math.min(na, nb), Math.max(na, nb)];
  }
  function boundPan(p, t, b, maxZoom) {
    const out = { sx: t.sx, sy: t.sy, tx: t.tx, ty: t.ty };
    const cap = typeof maxZoom === "number" && isFinite(maxZoom) && maxZoom >= 1 ? maxZoom : 0;
    const capped = (d0, d1, span) => {
      if (!cap || Math.abs(d1 - d0) * cap >= Math.abs(span)) return [d0, d1];
      const mid = (d0 + d1) / 2, half = Math.abs(span) / cap / 2 * (d1 >= d0 ? 1 : -1);
      return [mid - half, mid + half];
    };
    if (b.h && p.x && p.px1 !== p.px0 && p.x.native_hi !== p.x.native_lo) {
      const ax = p.x;
      const rising = ax.native_hi > ax.native_lo;
      const [d0, d1] = capped(rising ? b.h[0] : b.h[1], rising ? b.h[1] : b.h[0], ax.native_hi - ax.native_lo);
      const k = (p.px1 - p.px0) / (ax.native_hi - ax.native_lo);
      const k2 = (p.px1 - p.px0) / (d1 - d0);
      out.sx = k2 / k;
      out.tx = p.px0 * (1 - out.sx) + (ax.native_lo - d0) * k2;
    }
    if (b.v && p.y && p.py1 !== p.py0 && p.y.native_hi !== p.y.native_lo) {
      const ay = p.y;
      const rising = ay.native_hi > ay.native_lo;
      const [d0, d1] = capped(rising ? b.v[0] : b.v[1], rising ? b.v[1] : b.v[0], ay.native_hi - ay.native_lo);
      const k = (p.py1 - p.py0) / (ay.native_hi - ay.native_lo);
      const k2 = (p.py1 - p.py0) / (d1 - d0);
      out.sy = k2 / k;
      out.ty = p.py0 * (1 - out.sy) + (d1 - ay.native_hi) * k2;
    }
    return out;
  }
  function sameBounds(a, b) {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    const eq = (x, y) => !x && !y || !!x && !!y && Math.abs(x[0] - y[0]) < 1e-9 && Math.abs(x[1] - y[1]) < 1e-9;
    for (let i = 0; i < ka.length; i++) {
      const p = a[ka[i]], q = b[ka[i]];
      if (!q || !eq(p.h, q.h) || !eq(p.v, q.v)) return false;
    }
    return true;
  }

  // srcts/features/bindScales.ts
  function isScalesBound(sel) {
    return sel.kind === "interval" && sel.bind === "scales";
  }
  function bindScalesFeature(ws) {
    function cellZoom() {
      const ix = ws.interactions;
      if (!ws.axisZoomActive || !ix) return false;
      const binds = ix.binds ? asColumn(ix.binds) : [];
      const sels = ix.selections ? asColumn(ix.selections).filter(isScalesBound) : [];
      if (!binds.length && !sels.length) return false;
      let first;
      for (let i = 0; i < ws.azPanels.length; i++) {
        const c = ws.azPanels[i].p.cell;
        if (c == null) return false;
        if (first === void 0) first = c;
        else if (c !== first) return true;
      }
      return false;
    }
    function activeCell() {
      if (ws.activeCell != null) return ws.activeCell;
      const c = ws.azPanels.length ? ws.azPanels[0].p.cell : null;
      return c == null ? null : c;
    }
    function viewFor(a) {
      const c = a.p.cell;
      if (c == null || c === activeCell() || !cellZoom()) return ws.vb;
      return ws.cellViews[c] || ws.vb0;
    }
    function copyVb(v) {
      return { x: v.x, y: v.y, w: v.w, h: v.h };
    }
    function focusCell(cell) {
      if (cell == null || !cellZoom()) return;
      const cur = activeCell();
      if (cell === cur || !ws.vb0) return;
      if (cur != null && ws.vb) ws.cellViews[cur] = copyVb(ws.vb);
      const next = ws.cellViews[cell];
      ws.vb = next ? copyVb(next) : copyVb(ws.vb0);
      delete ws.cellViews[cell];
      ws.activeCell = cell;
    }
    function focusCellAt(clientX, clientY) {
      if (!cellZoom()) return;
      const u = ws.fx.toUser(clientX, clientY);
      const a = ws.fx.azNearest(u.x, u.y);
      if (a) focusCell(a.p.cell);
    }
    function anyCellZoomed() {
      if (!ws.vb0) return false;
      for (const c in ws.cellViews) if (isZoomedIn(ws.cellViews[c], ws.vb0)) return true;
      return false;
    }
    function viewOfPanel(p) {
      const az = ws.azPanels.filter((q) => q.p.name === p.name)[0];
      return az ? viewFor(az) : ws.vb;
    }
    function inCells(p, cells) {
      if (!cells || !cells.length) return true;
      return p.cell != null && cells.indexOf(p.cell) >= 0;
    }
    function panelByName(name) {
      for (let i = 0; i < ws.panels.length; i++) if (ws.panels[i].name === name) return ws.panels[i];
      return null;
    }
    function boundT(a, t) {
      const b = ws.scaleBinds[a.p.name];
      return b ? boundPan(a.p, t, b, ws.opts.maxZoom) : t;
    }
    function applyScaleBinds() {
      const ix = ws.interactions;
      if (!ix || !ix.binds || !ws.panels.length || ws.bindGuard) return;
      const next = {};
      const by = {};
      const binds = asColumn(ix.binds);
      for (let i = 0; i < binds.length; i++) {
        const bd = binds[i];
        const iv = ws.intervals[bd.selection];
        const r = iv && iv.range;
        const ch = r ? r[bd.aes] : void 0;
        if (!r || !ch) continue;
        const src = panelByName(r.panel);
        const srcAx = src ? axisForEncoding(src, bd.aes) : null;
        const cells = bd.cell != null ? [bd.cell] : null;
        for (let j = 0; j < ws.panels.length; j++) {
          const p = ws.panels[j];
          if (p.name === r.panel || !inCells(p, cells)) continue;
          const hit = axisForEncoding(p, bd.aes);
          if (!hit) continue;
          const dom = channelToNative(ch, srcAx ? srcAx.ax : void 0, hit.ax);
          if (!dom) continue;
          const b = next[p.name] || (next[p.name] = {});
          if (hit.horizontal) b.h = dom;
          else b.v = dom;
          by[p.name] = bd.selection;
        }
      }
      if (sameBounds(next, ws.scaleBinds)) return;
      ws.scaleBinds = next;
      ws.scaleBoundBy = by;
      if (!ws.axisZoomActive) return;
      ws.bindGuard = true;
      try {
        ws.fx.applyViewBox();
      } finally {
        ws.bindGuard = false;
      }
    }
    function visibleRect(p) {
      if (!ws.vb || !ws.vb0) return null;
      let a, b;
      const az = ws.azPanels.filter((q) => q.p.name === p.name)[0];
      if (ws.axisZoomActive && az) {
        const t = ws.fx.azT(az);
        if (!t.sx || !t.sy) return null;
        a = { x: (p.px0 - t.tx) / t.sx, y: (p.py0 - t.ty) / t.sy };
        b = { x: (p.px1 - t.tx) / t.sx, y: (p.py1 - t.ty) / t.sy };
      } else {
        a = panToView(ws.vb, ws.vb0, p.px0, p.py0);
        b = panToView(ws.vb, ws.vb0, p.px1, p.py1);
      }
      return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
    }
    function syncScaleSelections() {
      const ix = ws.interactions;
      if (!ix || !ix.selections || ws.bindGuard) return;
      const sels = asColumn(ix.selections).filter(isScalesBound);
      if (!sels.length) return;
      let changed = false;
      for (let i = 0; i < sels.length; i++) {
        const sel = sels[i];
        const cells = sel.cells != null ? asColumn(sel.cells) : null;
        let src = null;
        for (let j = 0; j < ws.panels.length && !src; j++) {
          const p = ws.panels[j];
          if (inCells(p, cells) && ws.scaleBoundBy[p.name] !== sel.name) src = p;
        }
        const prev = ws.intervals[sel.name];
        const v = src ? viewOfPanel(src) : null;
        const zoomed = !!v && !!ws.vb0 && isZoomedIn(v, ws.vb0);
        const rect = zoomed && src ? visibleRect(src) : null;
        const r = rect && src ? intervalRangeOf(src, rect, selEncodings(sel)) : null;
        if (!r) {
          if (prev) {
            delete ws.intervals[sel.name];
            changed = true;
          }
          continue;
        }
        const same = prev && prev.range && JSON.stringify(prev.range) === JSON.stringify(r);
        if (same) continue;
        ws.intervals[sel.name] = { keys: intervalKeys(ws.elements, r), range: r };
        changed = true;
      }
      if (changed) ws.fx.reevaluateInteractions();
    }
    return { applyScaleBinds, syncScaleSelections, boundT, viewFor, focusCell, focusCellAt, anyCellZoomed };
  }

  // srcts/features/colorbar.ts
  function colorbarFeature(ws) {
    function cbPos(v) {
      const cb = ws.colorbar;
      const t = cb.hi === cb.lo ? 0 : (v - cb.lo) / (cb.hi - cb.lo);
      if (cb.orientation === "h") {
        const f2 = cb.reverse ? 1 - t : t;
        return cb.x0 + f2 * (cb.x1 - cb.x0);
      }
      const f = cb.reverse ? t : 1 - t;
      return cb.y0 + f * (cb.y1 - cb.y0);
    }
    function cbValueAt(pos) {
      const cb = ws.colorbar;
      if (cb.orientation === "h") {
        let f2 = cb.x1 === cb.x0 ? 0 : (pos - cb.x0) / (cb.x1 - cb.x0);
        const t2 = cb.reverse ? 1 - f2 : f2;
        return cb.lo + t2 * (cb.hi - cb.lo);
      }
      let f = cb.y1 === cb.y0 ? 0 : (pos - cb.y0) / (cb.y1 - cb.y0);
      const t = cb.reverse ? f : 1 - f;
      return cb.lo + t * (cb.hi - cb.lo);
    }
    function cbRect(x, y, w, h, cls) {
      const r = document.createElementNS(SVGNS, "rect");
      r.setAttribute("x", String(x));
      r.setAttribute("y", String(y));
      r.setAttribute("width", String(Math.max(0, w)));
      r.setAttribute("height", String(Math.max(0, h)));
      r.setAttribute("class", cls);
      return r;
    }
    function drawColorbarControl() {
      if (!ws.colorbarLayer) return;
      while (ws.colorbarLayer.firstChild) ws.colorbarLayer.removeChild(ws.colorbarLayer.firstChild);
      if (!ws.colorbar || !ws.colorRange) return;
      const cb = ws.colorbar;
      const pa = cbPos(ws.colorRange.a);
      const pb = cbPos(ws.colorRange.b);
      const lo = Math.min(pa, pb);
      const hi = Math.max(pa, pb);
      const mkHandle = (pos, which) => {
        const H = 4;
        const r = cb.orientation === "h" ? cbRect(pos - H / 2, cb.y0 - 2, H, cb.y1 - cb.y0 + 4, "vellumwidget-cb-handle") : cbRect(cb.x0 - 2, pos - H / 2, cb.x1 - cb.x0 + 4, H, "vellumwidget-cb-handle");
        r.setAttribute("vector-effect", "non-scaling-stroke");
        r.setAttribute("data-cb", which);
        return r;
      };
      if (cb.orientation === "h") {
        ws.colorbarLayer.appendChild(cbRect(cb.x0, cb.y0, lo - cb.x0, cb.y1 - cb.y0, "vellumwidget-cb-dim"));
        ws.colorbarLayer.appendChild(cbRect(hi, cb.y0, cb.x1 - hi, cb.y1 - cb.y0, "vellumwidget-cb-dim"));
      } else {
        ws.colorbarLayer.appendChild(cbRect(cb.x0, cb.y0, cb.x1 - cb.x0, lo - cb.y0, "vellumwidget-cb-dim"));
        ws.colorbarLayer.appendChild(cbRect(cb.x0, hi, cb.x1 - cb.x0, cb.y1 - hi, "vellumwidget-cb-dim"));
      }
      ws.colorbarLayer.appendChild(mkHandle(pa, "a"));
      ws.colorbarLayer.appendChild(mkHandle(pb, "b"));
    }
    function applyColorFilter() {
      ws.fx.clearClass("vellumwidget-colorfiltered");
      ws.colorHiddenSet = {};
      if (!ws.colorbar || !ws.colorRange) {
        ws.fx.shinyInput("colorfilter", null);
        return;
      }
      const a = ws.colorRange.a;
      const b = ws.colorRange.b;
      const full = a <= ws.colorbar.lo + 1e-9 && b >= ws.colorbar.hi - 1e-9;
      if (!full) {
        const outKeys = [];
        for (let i = 0; i < ws.elements.length; i++) {
          const e = ws.elements[i];
          if (typeof e.filter_value === "number" && (e.filter_value < a || e.filter_value > b) && !ws.colorHiddenSet[e.key]) {
            ws.colorHiddenSet[e.key] = true;
            outKeys.push(e.key);
          }
        }
        ws.fx.addClassForKeys(outKeys, "vellumwidget-colorfiltered");
      }
      ws.fx.shinyInput("colorfilter", full ? null : [a, b]);
    }
    function setColorRange(a, b) {
      ws.calib = null;
      if (!ws.colorbar) return;
      const lo = ws.colorbar.lo, hi = ws.colorbar.hi;
      a = Math.min(hi, Math.max(lo, a));
      b = Math.min(hi, Math.max(lo, b));
      ws.colorRange = { a: Math.min(a, b), b: Math.max(a, b) };
      drawColorbarControl();
      applyColorFilter();
    }
    function buildColorbar() {
      if (ws.colorbarLayer) {
        ws.colorbarLayer.remove();
        ws.colorbarLayer = null;
      }
      ws.colorHiddenSet = {};
      ws.colorRange = null;
      ws.el.classList.remove("vellumwidget-cb-v", "vellumwidget-cb-h");
      if (!ws.colorbar || ws.rasterMode || !ws.stage) return;
      ws.colorbarLayer = document.createElementNS(SVGNS, "svg");
      ws.colorbarLayer.setAttribute("class", "vellumwidget-colorbar-layer");
      ws.colorbarLayer.setAttribute("aria-hidden", "true");
      if (ws.vb0) ws.colorbarLayer.setAttribute("viewBox", fmtViewBox(ws.vb0));
      ws.stage.appendChild(ws.colorbarLayer);
      ws.el.classList.add(ws.colorbar.orientation === "h" ? "vellumwidget-cb-h" : "vellumwidget-cb-v");
      ws.colorRange = { a: ws.colorbar.lo, b: ws.colorbar.hi };
      drawColorbarControl();
      wireColorbar();
    }
    function wireColorbar() {
      if (!ws.colorbarLayer) return;
      let dragWhich = "";
      const onMove = (ev) => {
        if (!dragWhich || !ws.colorbar || !ws.colorRange) return;
        const u = ws.fx.toUser(ev.clientX, ev.clientY);
        const v = cbValueAt(ws.colorbar.orientation === "h" ? u.x : u.y);
        if (dragWhich === "a") setColorRange(v, ws.colorRange.b);
        else setColorRange(ws.colorRange.a, v);
      };
      const onUp = () => {
        dragWhich = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      ws.colorbarLayer.addEventListener("pointerdown", function(ev) {
        const w = ev.target.getAttribute && ev.target.getAttribute("data-cb");
        if (w !== "a" && w !== "b") return;
        ev.preventDefault();
        ev.stopPropagation();
        dragWhich = w;
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      });
      ws.colorbarLayer.addEventListener("dblclick", function(ev) {
        if (!ws.colorbar) return;
        ev.preventDefault();
        setColorRange(ws.colorbar.lo, ws.colorbar.hi);
      });
    }
    return { setColorRange, buildColorbar };
  }

  // srcts/features/coords.ts
  function coordsFeature(ws) {
    function currentViewBox() {
      if (ws.vb) return ws.axisZoomActive && ws.vb0 ? ws.vb0 : ws.vb;
      const parsed = ws.svgEl ? parseViewBox(ws.svgEl.getAttribute("viewBox")) : null;
      if (parsed) return parsed;
      const r = (ws.svgEl || ws.el).getBoundingClientRect();
      return { x: 0, y: 0, w: r.width || 1, h: r.height || 1 };
    }
    function toUser(clientX, clientY) {
      const r = (ws.svgEl || ws.el).getBoundingClientRect();
      const view = currentViewBox();
      const fx = r.width ? (clientX - r.left) / r.width : 0;
      const fy = r.height ? (clientY - r.top) / r.height : 0;
      return { x: view.x + fx * view.w, y: view.y + fy * view.h };
    }
    function toView(clientX, clientY) {
      const u = toUser(clientX, clientY);
      if (ws.axisZoomActive && ws.vb && ws.vb0) return azBaseToScene(u.x, u.y);
      return u;
    }
    function toAnchor(clientX, clientY) {
      const u = toUser(clientX, clientY);
      if (!ws.axisZoomActive || !ws.vb || !ws.vb0) return u;
      const a = ws.anchorPanel || azNearest(u.x, u.y);
      if (!a) return panToView(ws.vb, ws.vb0, u.x, u.y);
      return panToView(ws.vb, ws.vb0, (u.x - a.bx) / a.ax, (u.y - a.by) / a.ay);
    }
    function azNearest(x, y) {
      let best = null, bestD = Infinity;
      for (let i = 0; i < ws.azPanels.length; i++) {
        const p = ws.azPanels[i].p;
        const dx = x < p.px0 ? p.px0 - x : x > p.px1 ? x - p.px1 : 0;
        const dy = y < p.py0 ? p.py0 - y : y > p.py1 ? y - p.py1 : 0;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = ws.azPanels[i];
        }
      }
      return best;
    }
    function azT(a) {
      return ws.fx.boundT(a, conjugatePan(viewToPan(ws.fx.viewFor(a) || ws.vb0, ws.vb0), a.ax, a.bx, a.ay, a.by));
    }
    function azBaseToScene(x, y) {
      const a = azNearest(x, y);
      if (!a) return ws.vb && ws.vb0 ? panToView(ws.vb, ws.vb0, x, y) : { x, y };
      const t = azT(a);
      return { x: t.sx ? (x - t.tx) / t.sx : x, y: t.sy ? (y - t.ty) / t.sy : y };
    }
    function azMulti() {
      return ws.axisZoomActive && ws.azPanels.length > 1 && !!ws.vb0;
    }
    function fmtPan(t) {
      return "matrix(" + t.sx + " 0 0 " + t.sy + " " + t.tx + " " + t.ty + ")";
    }
    function calibGroups() {
      if (!ws.svgEl) return null;
      const r = ws.svgEl.getBoundingClientRect();
      if (ws.calib && ws.calib.w === r.width && ws.calib.h === r.height) return ws.calib;
      ws.calib = buildCalib(r);
      return ws.calib;
    }
    function panelOfScene(x, y) {
      for (let i = 0; i < ws.panels.length; i++) {
        const p = ws.panels[i];
        if (x >= p.px0 && x <= p.px1 && y >= p.py0 && y <= p.py1) return i;
      }
      return -1;
    }
    function buildCalib(r) {
      const nGroups = Math.max(1, ws.panels.length);
      const ext = [];
      for (let g = 0; g < nGroups; g++) ext.push([null, null, null, null]);
      const all = [null, null, null, null];
      const cxOf = (e) => (e.x0 + e.x1) / 2;
      const cyOf = (e) => (e.y0 + e.y1) / 2;
      const take = (q, e) => {
        const cx = cxOf(e), cy = cyOf(e);
        if (!q[0] || cx < cxOf(q[0])) q[0] = e;
        if (!q[1] || cx > cxOf(q[1])) q[1] = e;
        if (!q[2] || cy < cyOf(q[2])) q[2] = e;
        if (!q[3] || cy > cyOf(q[3])) q[3] = e;
      };
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (!hasBbox(e) || e.legend_for != null || ws.fx.inert(e.key)) continue;
        let g = 0;
        if (ws.panels.length) {
          g = panelOfScene(cxOf(e), cyOf(e));
          if (g < 0) continue;
        }
        take(ext[g], e);
        take(all, e);
      }
      const seen = {};
      const scr = (e) => {
        if (e.key in seen) return seen[e.key];
        let out = null;
        const n = ws.fx.elementsForKey(e.key)[0];
        if (n) {
          const b = n.getBoundingClientRect();
          if (b.width || b.height) out = { x: b.left - r.left + b.width / 2, y: b.top - r.top + b.height / 2 };
        }
        seen[e.key] = out;
        return out;
      };
      const axis = (q, lo, hi, isX) => {
        const a = q[lo], b = q[hi];
        if (!a || !b) return null;
        const pa = scr(a), pb = scr(b);
        if (!pa || !pb) return null;
        const da = isX ? pb.x - pa.x : pb.y - pa.y;
        if (Math.abs(da) < 1) return null;
        const sa = isX ? cxOf(a) : cyOf(a);
        const sd = (isX ? cxOf(b) : cyOf(b)) - sa;
        const s = sd / da;
        return { s, o: sa - (isX ? pa.x : pa.y) * s };
      };
      const shared = !azMulti();
      const gx = shared ? axis(all, 0, 1, true) : null;
      const gy = shared ? axis(all, 2, 3, false) : null;
      const groups = [];
      for (let g = 0; g < nGroups; g++) {
        const panel = ws.panels.length ? ws.panels[g] : null;
        let az = null;
        if (panel && ws.axisZoomActive) {
          for (let j = 0; j < ws.azPanels.length; j++) if (ws.azPanels[j].p.name === panel.name) az = ws.azPanels[j];
        }
        const fx = axis(ext[g], 0, 1, true) || gx;
        const fy = axis(ext[g], 2, 3, false) || gy;
        groups.push({ panel, az, fit: fx && fy ? { sx: fx.s, ox: fx.o, sy: fy.s, oy: fy.o } : null });
      }
      return { w: r.width, h: r.height, groups };
    }
    function toClientFit(f, left, top) {
      return { sx: f.sx, ox: f.ox - left * f.sx, sy: f.sy, oy: f.oy - top * f.sy };
    }
    function calibrateXform(clientX, clientY) {
      const c = calibGroups();
      if (!c || !ws.svgEl) return null;
      const r = ws.svgEl.getBoundingClientRect();
      const lx = clientX - r.left, ly = clientY - r.top;
      let best = null, bestD = Infinity;
      for (let g = 0; g < c.groups.length; g++) {
        const G = c.groups[g];
        if (!G.fit) continue;
        if (!G.panel || c.groups.length === 1) {
          best = G.fit;
          break;
        }
        let x = G.fit.ox + lx * G.fit.sx, y = G.fit.oy + ly * G.fit.sy;
        if (G.az) {
          const t = azT(G.az);
          x = t.sx * x + t.tx;
          y = t.sy * y + t.ty;
        }
        const p = G.panel;
        const dx = x < p.px0 ? p.px0 - x : x > p.px1 ? x - p.px1 : 0;
        const dy = y < p.py0 ? p.py0 - y : y > p.py1 ? y - p.py1 : 0;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = G.fit;
          if (d === 0) break;
        }
      }
      return best ? toClientFit(best, r.left, r.top) : null;
    }
    function sceneToClient(x, y) {
      const c = calibGroups();
      if (!c || !ws.svgEl) return null;
      let g = 0;
      if (ws.panels.length) {
        g = panelOfScene(x, y);
        if (g < 0) return null;
      }
      const f = c.groups[g] && c.groups[g].fit;
      if (!f || !f.sx || !f.sy) return null;
      const r = ws.svgEl.getBoundingClientRect();
      return { x: r.left + (x - f.ox) / f.sx, y: r.top + (y - f.oy) / f.sy };
    }
    function clientToScene(clientX, clientY) {
      const f = calibrateXform(clientX, clientY);
      if (!f) return toView(clientX, clientY);
      return { x: f.ox + clientX * f.sx, y: f.oy + clientY * f.sy };
    }
    function panelAt(x, y) {
      for (let i = 0; i < ws.panels.length; i++) {
        const p = ws.panels[i];
        if (x >= p.px0 && x <= p.px1 && y >= p.py0 && y <= p.py1) return p;
      }
      return ws.panels.length === 1 ? ws.panels[0] : null;
    }
    function dataRangeOf(p, dx0, dy0, dx1, dy1) {
      const out = { panel: p.name };
      if (p.x) {
        const a = pxToDataX(p, dx0), b = pxToDataX(p, dx1);
        if (a != null && b != null) out.x = [Math.min(a, b), Math.max(a, b)];
      }
      if (p.y) {
        const a = pxToDataY(p, dy0), b = pxToDataY(p, dy1);
        if (a != null && b != null) out.y = [Math.min(a, b), Math.max(a, b)];
      }
      return out.x || out.y ? out : null;
    }
    function brushDataFields(bb) {
      const p = panelAt((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2);
      if (!p) return {};
      const d = dataRangeOf(p, bb.x0, bb.y0, bb.x1, bb.y1);
      if (!d) return {};
      const f = { panel: d.panel };
      if (d.x) {
        f.x0d = d.x[0];
        f.x1d = d.x[1];
      }
      if (d.y) {
        f.y0d = d.y[0];
        f.y1d = d.y[1];
      }
      return f;
    }
    return { currentViewBox, toUser, toView, toAnchor, azNearest, azT, azMulti, fmtPan, calibrateXform, sceneToClient, clientToScene, panelAt, dataRangeOf, brushDataFields };
  }

  // srcts/types.ts
  function condLook(aes, ifFalse) {
    let v = ifFalse;
    if (Array.isArray(v)) v = v.length === 1 ? v[0] : null;
    if (v == null) return { kind: "dim" };
    if (isColorAes(aes)) return typeof v === "string" && v !== "" ? { kind: "color", color: v } : { kind: "none" };
    if (isAlphaAes(aes)) {
      const a = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
      return isFinite(a) && a >= 0 && a <= 1 ? { kind: "alpha", alpha: a } : { kind: "none" };
    }
    return { kind: "none" };
  }
  function isColorAes(aes) {
    if (aes == null || aes === "") return true;
    return /(^|_)(colou?r|fill|stroke)$/.test(aes);
  }
  function isAlphaAes(aes) {
    return aes != null && /(^|_)(alpha|opacity)$/.test(aes);
  }

  // srcts/features/declarative.ts
  function declarativeFeature(ws) {
    function setupInteractions() {
      ws.condTagElems = {};
      ws.condTagVals = {};
      ws.filtSelElems = {};
      ws.joinOf = {};
      if (!ws.interactions) return;
      const vals = {};
      const any = {};
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (e.cond) {
          for (let t = 0; t < e.cond.length; t++) {
            const tag = e.cond[t];
            (ws.condTagElems[tag] = ws.condTagElems[tag] || []).push(e.key);
            const v = e.cond_value ? e.cond_value[tag] : void 0;
            (vals[tag] = vals[tag] || []).push(v == null ? null : v);
            if (v != null) any[tag] = true;
          }
        }
        if (e.filt) {
          for (let t = 0; t < e.filt.length; t++) {
            (ws.filtSelElems[e.filt[t]] = ws.filtSelElems[e.filt[t]] || []).push(e.key);
          }
        }
        if (e.join != null) ws.joinOf[e.key] = e.join;
      }
      for (const tag in vals) ws.condTagVals[tag] = any[tag] ? vals[tag] : null;
    }
    function selectionMembers(sel) {
      const set = {};
      if (sel.kind === "interval" && sel.region !== "lasso") {
        const iv = ws.intervals[sel.name];
        const ks = iv ? iv.keys : [];
        for (let i = 0; i < ks.length; i++) set[ks[i]] = true;
        return set;
      }
      let keys = sel.on === "hover" ? ws.lastHoverKeys : ws.fx.selectedKeys();
      if (sel.on !== "hover" && sel.expand && sel.expand.mode === "neighbours" && ws.neighbourExpand) {
        const out = [];
        const seen = {};
        for (let i = 0; i < keys.length; i++) {
          const proj = ws.fx.linkedKeys(keys[i]);
          for (let j = 0; j < proj.length; j++) {
            if (!seen[proj[j]]) {
              seen[proj[j]] = true;
              out.push(proj[j]);
            }
          }
        }
        keys = out;
      }
      for (let i = 0; i < keys.length; i++) set[keys[i]] = true;
      return set;
    }
    function styleCondNode(node, look) {
      if (look.kind === "none") return;
      const n = node;
      if (look.kind === "dim" || look.kind === "alpha") {
        node.classList.add("vellumwidget-cond-dim");
        if (look.kind === "alpha") n.style.setProperty("--vellumwidget-dim-opacity", String(look.alpha));
        return;
      }
      const color = look.color;
      const f = node.getAttribute("fill");
      if (f && f !== "none") n.style.fill = color;
      const s = node.getAttribute("stroke");
      if (s && s !== "none") n.style.stroke = color;
    }
    function clearCondNode(node) {
      node.classList.remove("vellumwidget-cond-dim");
      const n = node;
      if (n.style.fill) n.style.fill = "";
      if (n.style.stroke) n.style.stroke = "";
      if (n.style.getPropertyValue("--vellumwidget-dim-opacity")) n.style.removeProperty("--vellumwidget-dim-opacity");
    }
    function applyConditions() {
      if (!ws.interactions || !ws.interactions.conditions) return;
      const ring = ws.fx.ringMode();
      const ms = ws.rasterMode && ws.fx.condStatesBegin();
      if (ring && !ms) return;
      const selByName = {};
      (ws.interactions.selections || []).forEach((s) => selByName[s.name] = s);
      for (let ci = 0; ci < ws.interactions.conditions.length; ci++) {
        const c = ws.interactions.conditions[ci];
        const tag = c.tag || c.selection + ":" + c.aes;
        const tagged = ws.condTagElems[tag] || [];
        const look = condLook(c.aes, c.if_false);
        const vals = isColorAes(c.aes) ? ws.condTagVals[tag] || null : null;
        const sel = selByName[c.selection];
        const members = sel ? selectionMembers(sel) : {};
        const active = Object.keys(members).length > 0 || c.empty === false;
        if (ms) ws.fx.condStateSet(tag, tagged, members, active, look, vals);
        if (ring) continue;
        for (let i = 0; i < tagged.length; i++) {
          const nodes = ws.fx.elementsForKey(tagged[i]);
          const member = !!members[tagged[i]];
          const own = vals ? vals[i] : null;
          const lk = own != null ? { kind: "color", color: own } : look;
          for (let j = 0; j < nodes.length; j++) {
            clearCondNode(nodes[j]);
            if (active && !member) styleCondNode(nodes[j], lk);
          }
        }
      }
    }
    function memberJoins(members) {
      const js = {};
      for (const k in members) js[ws.joinOf[k] != null ? ws.joinOf[k] : k] = true;
      return js;
    }
    function applyFilters() {
      const ix = ws.interactions;
      if (!ix || !ix.filters || !ix.filters.length) return false;
      if (ws.fx.ringMode() && !ws.dl) return false;
      const filters = ix.filters;
      const selByName = {};
      (ix.selections || []).forEach((s) => selByName[s.name] = s);
      const hide = {};
      let restrict = false;
      for (let i = 0; i < filters.length; i++) {
        const selName = filters[i].selection;
        const sel = selByName[selName];
        const members = sel ? selectionMembers(sel) : {};
        const active = Object.keys(members).length > 0 || sel && sel.empty === false;
        if (!active) continue;
        restrict = true;
        const keep = memberJoins(members);
        const targets = ws.filtSelElems[selName] || [];
        for (let t = 0; t < targets.length; t++) {
          const k = targets[t];
          const j = ws.joinOf[k] != null ? ws.joinOf[k] : k;
          if (!keep[j]) hide[k] = true;
        }
      }
      if (!restrict) {
        ws.fx.applyFilter(null);
        return true;
      }
      const show = [];
      for (let i = 0; i < ws.elements.length; i++) {
        if (!hide[ws.elements[i].key]) show.push(ws.elements[i].key);
      }
      ws.fx.applyFilter(show);
      return true;
    }
    function reevaluateInteractions() {
      applyConditions();
      if (!applyFilters() && ws.rasterMode) ws.fx.updateMarkStates();
      ws.fx.applyScaleBinds();
    }
    return { setupInteractions, reevaluateInteractions };
  }

  // srcts/features/highlight.ts
  function highlightFeature(ws) {
    function elementsForKey(k) {
      const cached = ws.nodesByKey[k];
      if (cached) return cached;
      if (!ws.holder || ws.rasterMode) return [];
      return Array.prototype.slice.call(ws.holder.querySelectorAll('[data-key="' + cssEscape(k) + '"]'));
    }
    function addClassForKeys(keys, cls) {
      for (let i = 0; i < keys.length; i++) {
        const nodes = elementsForKey(keys[i]);
        for (let j = 0; j < nodes.length; j++) nodes[j].classList.add(cls);
      }
    }
    function clearClass(cls) {
      if (!ws.holder) return;
      const nodes = ws.holder.querySelectorAll("." + cls);
      for (let i = 0; i < nodes.length; i++) nodes[i].classList.remove(cls);
    }
    function graphNeighbourhood(k, degree, edges) {
      const seen = { [k]: true };
      const out = [k];
      let frontier = [k];
      for (let d = 0; d < degree; d++) {
        const next = [];
        for (let i = 0; i < frontier.length; i++) {
          const u = frontier[i];
          if (edges) {
            const inc = ws.incidentEdges[u] || [];
            for (let j = 0; j < inc.length; j++) {
              if (!seen[inc[j]]) {
                seen[inc[j]] = true;
                out.push(inc[j]);
              }
            }
          }
          const nb = ws.neighbourNodes[u] || [];
          for (let j = 0; j < nb.length; j++) {
            if (!seen[nb[j]]) {
              seen[nb[j]] = true;
              out.push(nb[j]);
              next.push(nb[j]);
            }
          }
        }
        frontier = next;
      }
      return out;
    }
    function linkedKeys(k) {
      const m = ws.meta[k];
      if (m && m.legend_for != null) return (ws.legendIndex[m.legend_for] || []).concat([k]);
      if (ws.neighbourExpand) {
        const ep = ws.edgeEndpoints[k];
        if (ep) return [k, ep[0], ep[1]];
        if (ws.incidentEdges[k] || ws.neighbourNodes[k]) {
          return graphNeighbourhood(k, ws.neighbourExpand.degree, ws.neighbourExpand.edges);
        }
      }
      const g = m && m.hover_group;
      return g && ws.groups[g] ? ws.groups[g] : [k];
    }
    return { elementsForKey, addClassForKeys, clearClass, linkedKeys };
  }

  // srcts/features/hover.ts
  function hoverFeature(ws) {
    function dimOpacityVal() {
      const d = ws.opts.style && ws.opts.style.dimOpacity;
      return d == null || d === "" ? "0.28" : String(d);
    }
    let overlayKeys = [];
    function showHighlightOverlay(keys) {
      if (!ws.holder || !ws.dimLayer) return;
      overlayKeys = keys;
      ws.holder.style.opacity = dimOpacityVal();
      while (ws.dimLayer.firstChild) ws.dimLayer.removeChild(ws.dimLayer.firstChild);
      for (let i = 0; i < keys.length; i++) {
        const nodes = ws.fx.elementsForKey(keys[i]);
        for (let j = 0; j < nodes.length; j++) {
          const c = nodes[j].cloneNode(true);
          c.classList.add("vellumwidget-hl");
          pinScaleVars(c, keys[i]);
          ws.dimLayer.appendChild(azOverlayWrap(c, keys[i]));
        }
      }
    }
    function pinScaleVars(node, key) {
      if (!ws.axisZoomActive || ws.opts.zoomMarks === "scale") return;
      const m = ws.meta[key];
      if (!m || !hasBbox(m)) return;
      const a = ws.fx.azNearest((m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2);
      if (!a) return;
      const t = ws.fx.azT(a);
      const st = node.style;
      st.setProperty("--vw-ix", String(t.sx ? 1 / t.sx : 1));
      st.setProperty("--vw-iy", String(t.sy ? 1 / t.sy : 1));
    }
    function azOverlayWrap(node, key) {
      if (!ws.fx.azMulti()) return node;
      const m = ws.meta[key];
      if (!m || !hasBbox(m)) return node;
      const a = ws.fx.azNearest((m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2);
      if (!a) return node;
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("transform", ws.fx.fmtPan(ws.fx.azT(a)));
      g.appendChild(node);
      return g;
    }
    function refreshHighlightOverlay() {
      if (!overlayKeys.length || !ws.dimLayer || !ws.dimLayer.firstChild) return;
      showHighlightOverlay(overlayKeys);
    }
    function hideHighlightOverlay() {
      overlayKeys = [];
      if (ws.holder) ws.holder.style.opacity = "";
      if (ws.dimLayer) while (ws.dimLayer.firstChild) ws.dimLayer.removeChild(ws.dimLayer.firstChild);
    }
    function crosshairLine(x1, y1, x2, y2) {
      const l = document.createElementNS(SVGNS, "line");
      l.setAttribute("x1", String(x1));
      l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2));
      l.setAttribute("y2", String(y2));
      l.setAttribute("class", "vellumwidget-crosshair-line");
      l.setAttribute("vector-effect", "non-scaling-stroke");
      return l;
    }
    function clearCrosshair() {
      if (!ws.crosshairLayer) return;
      const kids = Array.prototype.slice.call(ws.crosshairLayer.childNodes);
      for (let i = 0; i < kids.length; i++) {
        if (kids[i] !== ws.intervalEl) ws.crosshairLayer.removeChild(kids[i]);
      }
    }
    function drawCrosshair(k, hm) {
      clearCrosshair();
      if (!ws.crosshairLayer) return;
      const m = ws.meta[k];
      if (!m || !hasBbox(m)) return;
      const view = ws.vb || ws.vb0;
      if (!view) return;
      let cx = (m.x0 + m.x1) / 2;
      let cy = (m.y0 + m.y1) / 2;
      let x0 = view.x, x1 = view.x + view.w, y0 = view.y, y1 = view.y + view.h;
      if (ws.fx.azMulti()) {
        const a = ws.fx.azNearest(cx, cy);
        if (a) {
          const t = ws.fx.azT(a);
          cx = t.sx * cx + t.tx;
          cy = t.sy * cy + t.ty;
          x0 = a.p.px0;
          x1 = a.p.px1;
          y0 = a.p.py0;
          y1 = a.p.py1;
        }
      }
      if (hm !== "y") ws.crosshairLayer.appendChild(crosshairLine(cx, y0, cx, y1));
      if (hm !== "x") ws.crosshairLayer.appendChild(crosshairLine(x0, cy, x1, cy));
    }
    function tipDelay() {
      const d = ws.opts.tooltipDelay;
      return typeof d === "number" && d > 0 ? d : 0;
    }
    function markClient(k) {
      const m = ws.meta[k];
      if (!m || !hasBbox(m)) return null;
      const nodes = ws.fx.elementsForKey(k);
      if (nodes.length) {
        const r2 = nodes[0].getBoundingClientRect();
        if (r2.width || r2.height) return { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 };
      }
      const cx = (m.x0 + m.x1) / 2;
      const cy = (m.y0 + m.y1) / 2;
      const c = ws.fx.sceneToClient(cx, cy);
      if (c) return c;
      if (!ws.svgEl) return null;
      const r = ws.svgEl.getBoundingClientRect();
      const view = ws.fx.currentViewBox();
      if (!view.w || !view.h || !r.width || !r.height) return null;
      return {
        x: r.left + (cx - view.x) / view.w * r.width,
        y: r.top + (cy - view.y) / view.h * r.height
      };
    }
    function placeTip(clientX, clientY, anchorKey) {
      const box = ws.el.getBoundingClientRect();
      let ax = clientX - box.left;
      let ay = clientY - box.top;
      if (ws.opts.tooltipFollow === false && anchorKey) {
        const c = markClient(anchorKey);
        if (c) {
          ax = c.x - box.left;
          ay = c.y - box.top;
        }
      }
      const tw = ws.tip.offsetWidth || 0;
      const th = ws.tip.offsetHeight || 0;
      const below = ay - th - 12 < 0;
      if (tw && box.width) ax = Math.max(tw / 2, Math.min(box.width - tw / 2, ax));
      ws.tip.style.transform = "translate(" + Math.round(ax) + "px," + Math.round(ay) + "px) " + (below ? "translate(-50%, 12px)" : "translate(-50%, calc(-100% - 12px))");
    }
    let pendX = 0, pendY = 0;
    function revealTip(build, clientX, clientY, anchorKey) {
      if (ws.tipHideTimer) {
        clearTimeout(ws.tipHideTimer);
        ws.tipHideTimer = 0;
      }
      pendX = clientX;
      pendY = clientY;
      const doShow = () => {
        ws.tipShowTimer = 0;
        build();
        placeTip(pendX, pendY, anchorKey);
        ws.tip.classList.add("vellumwidget-show");
      };
      const d = tipDelay();
      if (d > 0 && !ws.tip.classList.contains("vellumwidget-show")) {
        if (ws.tipShowTimer) clearTimeout(ws.tipShowTimer);
        ws.tipShowTimer = setTimeout(doShow, d);
      } else {
        doShow();
      }
    }
    function showTip(clientX, clientY, k) {
      const m = ws.meta[k];
      revealTip(() => {
        ws.tip.innerHTML = sanitizeTip(m && m.tooltip || k);
      }, clientX, clientY, k);
    }
    function showTipMulti(clientX, clientY, keys) {
      revealTip(() => {
        const rows = [];
        for (let i = 0; i < keys.length && rows.length < TIP_MULTI_CAP; i++) {
          const m = ws.meta[keys[i]];
          rows.push(sanitizeTip(m && m.tooltip || keys[i]));
        }
        if (keys.length > TIP_MULTI_CAP) rows.push("\u2026");
        ws.tip.innerHTML = rows.join("<br>");
      }, clientX, clientY, keys[0] || null);
    }
    function moveTip(clientX, clientY, anchorKey) {
      pendX = clientX;
      pendY = clientY;
      if (ws.tip.classList.contains("vellumwidget-show")) placeTip(clientX, clientY, anchorKey);
    }
    function hideTip() {
      if (ws.tipShowTimer) {
        clearTimeout(ws.tipShowTimer);
        ws.tipShowTimer = 0;
      }
      if (ws.tipHideTimer) {
        clearTimeout(ws.tipHideTimer);
        ws.tipHideTimer = 0;
      }
      ws.tip.classList.remove("vellumwidget-show");
    }
    function scheduleHideTip() {
      if (ws.tipShowTimer) {
        clearTimeout(ws.tipShowTimer);
        ws.tipShowTimer = 0;
      }
      if (ws.opts.tooltipSticky) {
        if (ws.tipHideTimer) clearTimeout(ws.tipHideTimer);
        ws.tipHideTimer = setTimeout(() => {
          ws.tipHideTimer = 0;
          ws.tip.classList.remove("vellumwidget-show");
        }, 260);
      } else {
        ws.tip.classList.remove("vellumwidget-show");
      }
    }
    function clearHover() {
      if (!ws.hovering) return;
      ws.hovering = false;
      ws.hoverSig = "";
      if (ws.rasterMode) ws.fx.clearGroup(ws.hovGroup);
      if (ws.largeDim) hideHighlightOverlay();
      ws.el.classList.remove("vellumwidget-hovering");
      ws.fx.clearClass("vellumwidget-hl");
      clearCrosshair();
      scheduleHideTip();
      ws.fx.shinyInput("hover", null);
      if (ws.lastHoverKeys.length) {
        ws.lastHoverKeys = [];
        ws.fx.reevaluateInteractions();
      }
    }
    return { showHighlightOverlay, hideHighlightOverlay, clearCrosshair, drawCrosshair, showTip, showTipMulti, hideTip, moveTip, clearHover, azOverlayWrap, refreshHighlightOverlay };
  }

  // srcts/features/interval.ts
  function intervalFeature(ws) {
    function rectIntervalSels() {
      const sels = ws.interactions && ws.interactions.selections || [];
      return sels.filter((s) => s.kind === "interval" && s.region !== "lasso" && !isScalesBound(s));
    }
    function scalesIntervals() {
      const keep = {};
      const sels = ws.interactions && ws.interactions.selections || [];
      for (let i = 0; i < sels.length; i++) {
        if (isScalesBound(sels[i]) && ws.intervals[sels[i].name]) keep[sels[i].name] = ws.intervals[sels[i].name];
      }
      return keep;
    }
    function lockRect(p, rect, encs) {
      if (!p) return rect;
      let h = false, v = false;
      for (let i = 0; i < encs.length; i++) {
        const hit = axisForEncoding(p, encs[i]);
        if (hit) {
          if (hit.horizontal) h = true;
          else v = true;
        }
      }
      if (!h && !v) return rect;
      return {
        x0: h ? rect.x0 : Math.min(p.px0, p.px1),
        x1: h ? rect.x1 : Math.max(p.px0, p.px1),
        y0: v ? rect.y0 : Math.min(p.py0, p.py1),
        y1: v ? rect.y1 : Math.max(p.py0, p.py1)
      };
    }
    function applyIntervalBrush(rect) {
      const p = ws.fx.panelAt((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2);
      const sels = rectIntervalSels().filter((s) => {
        const cells = s.cells != null ? asColumn(s.cells) : [];
        return !cells.length || !p || p.cell == null || cells.indexOf(p.cell) >= 0;
      });
      if (!sels.length) return null;
      const eligible = (k) => !ws.hiddenKeySet[k] && !ws.colorHiddenSet[k];
      ws.intervals = scalesIntervals();
      const union = [];
      const seen = {};
      const ranges = {};
      let band = rect;
      for (let i = 0; i < sels.length; i++) {
        const encs = selEncodings(sels[i]);
        const locked = lockRect(p, rect, encs);
        if (i === 0) band = locked;
        const r = p ? intervalRangeOf(p, rect, encs) : null;
        const ks = r ? intervalKeys(ws.elements, r).filter(eligible) : ws.fx.dropInert(ws.fx.brushKeysIn(locked));
        ws.intervals[sels[i].name] = { keys: ks, range: r };
        ranges[sels[i].name] = r;
        for (let j = 0; j < ks.length; j++) {
          if (!seen[ks[j]]) {
            seen[ks[j]] = true;
            union.push(ks[j]);
          }
        }
      }
      const first = sels[0].name;
      const fields = { selection: first };
      const r0 = ranges[first];
      if (r0) {
        const iv = {};
        if (r0.x) iv.x = r0.x.levels ? r0.x.levels : [r0.x.lo, r0.x.hi];
        if (r0.y) iv.y = r0.y.levels ? r0.y.levels : [r0.y.lo, r0.y.hi];
        fields.interval = iv;
      }
      drawIntervalBand(band);
      return { keys: union, band, fields };
    }
    function drawIntervalBand(b) {
      ws.intervalBand = b;
      placeIntervalBand();
    }
    function placeIntervalBand() {
      const sb = ws.intervalBand;
      if (!ws.crosshairLayer || !sb) return;
      let b = sb;
      if (ws.fx.azMulti()) {
        const a = ws.fx.azNearest((sb.x0 + sb.x1) / 2, (sb.y0 + sb.y1) / 2);
        if (a) {
          const t = ws.fx.azT(a);
          const p = a.p;
          b = {
            x0: Math.max(Math.min(p.px0, p.px1), t.sx * sb.x0 + t.tx),
            x1: Math.min(Math.max(p.px0, p.px1), t.sx * sb.x1 + t.tx),
            y0: Math.max(Math.min(p.py0, p.py1), t.sy * sb.y0 + t.ty),
            y1: Math.min(Math.max(p.py0, p.py1), t.sy * sb.y1 + t.ty)
          };
        }
      }
      if (!ws.intervalEl) {
        ws.intervalEl = document.createElementNS(SVGNS, "rect");
        ws.intervalEl.setAttribute("class", "vellumwidget-interval");
        ws.intervalEl.setAttribute("vector-effect", "non-scaling-stroke");
      }
      if (ws.intervalEl.parentNode !== ws.crosshairLayer) ws.crosshairLayer.appendChild(ws.intervalEl);
      ws.intervalEl.setAttribute("x", String(b.x0));
      ws.intervalEl.setAttribute("y", String(b.y0));
      ws.intervalEl.setAttribute("width", String(Math.max(0, b.x1 - b.x0)));
      ws.intervalEl.setAttribute("height", String(Math.max(0, b.y1 - b.y0)));
    }
    function clearIntervals() {
      const keep = scalesIntervals();
      const had = Object.keys(ws.intervals).length > Object.keys(keep).length;
      ws.intervals = keep;
      ws.intervalBand = null;
      if (ws.intervalEl && ws.intervalEl.parentNode) ws.intervalEl.parentNode.removeChild(ws.intervalEl);
      return had;
    }
    return { applyIntervalBrush, placeIntervalBand, clearIntervals };
  }

  // srcts/features/legend.ts
  function legendFeature(ws) {
    function legendPolicy() {
      return ws.opts.legendClick || "select";
    }
    function swatchSeries(k) {
      if (k == null) return null;
      const m = ws.meta[k];
      return m && m.legend_for != null ? m.legend_for : null;
    }
    function applyLegend() {
      ws.calib = null;
      ws.fx.clearClass("vellumwidget-legend-hidden");
      ws.fx.clearClass("vellumwidget-legend-muted");
      ws.fx.clearClass("vellumwidget-legend-off");
      ws.hiddenKeySet = {};
      const pol = legendPolicy();
      if (pol === "select") {
        if (ws.rasterMode) ws.fx.updateMarkStates();
        return;
      }
      const cls = pol === "mute" ? "vellumwidget-legend-muted" : "vellumwidget-legend-hidden";
      for (const s in ws.legendOff) {
        if (!ws.legendOff[s]) continue;
        const members = ws.legendIndex[s] || [];
        ws.fx.addClassForKeys(members, cls);
        if (pol === "hide") for (let i = 0; i < members.length; i++) ws.hiddenKeySet[members[i]] = true;
        ws.fx.addClassForKeys(ws.legendSwatch[s] || [], "vellumwidget-legend-off");
      }
      if (ws.rasterMode) ws.fx.updateMarkStates();
    }
    function legendToggle(series) {
      ws.legendOff[series] = !ws.legendOff[series];
      applyLegend();
    }
    function legendIsolate(series) {
      const all = Object.keys(ws.legendIndex);
      const others = all.filter((s) => s !== series);
      const isolated = !ws.legendOff[series] && others.every((s) => ws.legendOff[s]);
      ws.legendOff = {};
      if (!isolated) for (let i = 0; i < others.length; i++) ws.legendOff[others[i]] = true;
      applyLegend();
    }
    return { legendPolicy, swatchSeries, applyLegend, legendToggle, legendIsolate };
  }

  // srcts/features/navigator.ts
  var NAV_MIN_STROKE = 1;
  function inherited(el, top, attr, prop) {
    for (let n = el; n; n = n === top ? null : n.parentElement) {
      const st = n.style ? n.style.getPropertyValue(prop) : "";
      if (st) return st;
      const a = n.getAttribute(attr);
      if (a !== null && a !== "inherit") return a;
    }
    return null;
  }
  function navStrokes(clone) {
    const shapes = clone.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse");
    for (let i = 0; i < shapes.length; i++) {
      const el = shapes[i];
      const stroke = inherited(el, clone, "stroke", "stroke");
      if (!stroke || stroke === "none" || stroke === "transparent") continue;
      const w = parseFloat(inherited(el, clone, "stroke-width", "stroke-width") || "1");
      const sw = String(Math.max(isFinite(w) ? w : 1, NAV_MIN_STROKE));
      el.setAttribute("vector-effect", "non-scaling-stroke");
      el.setAttribute("stroke-width", sw);
      if (el.style && el.style.getPropertyValue("stroke-width")) el.style.setProperty("stroke-width", sw);
    }
  }
  function navigatorFeature(ws) {
    function navToView(xFrac, wFrac) {
      if (!ws.vb0) return;
      wFrac = Math.min(1, Math.max(0.02, wFrac));
      xFrac = Math.min(1 - wFrac, Math.max(0, xFrac));
      const w = wFrac * ws.vb0.w;
      if (ws.xZoom) {
        ws.vb = { x: ws.vb0.x + xFrac * ws.vb0.w, y: ws.vb0.y, w, h: ws.vb0.h };
      } else {
        const cy = ws.vb ? ws.vb.y + ws.vb.h / 2 : ws.vb0.y + ws.vb0.h / 2;
        const h = wFrac * ws.vb0.h;
        ws.vb = { x: ws.vb0.x + xFrac * ws.vb0.w, y: cy - h / 2, w, h };
      }
      ws.fx.applyViewBox();
    }
    function updateNav() {
      if (!ws.navWindow || !ws.vb || !ws.vb0 || !ws.vb0.w) return;
      const xFrac = (ws.vb.x - ws.vb0.x) / ws.vb0.w;
      const wFrac = ws.vb.w / ws.vb0.w;
      ws.navWindow.style.left = xFrac * 100 + "%";
      ws.navWindow.style.width = wFrac * 100 + "%";
    }
    function buildNavigator() {
      if (ws.navEl) {
        ws.navEl.remove();
        ws.navEl = null;
        ws.navWindow = null;
      }
      if (!ws.opts.navigator || !ws.svgEl || !ws.vb0) return;
      const h = ws.opts.navigatorHeight && ws.opts.navigatorHeight > 0 ? ws.opts.navigatorHeight : 56;
      ws.navEl = document.createElement("div");
      ws.navEl.className = "vellumwidget-nav";
      ws.navEl.style.height = h + "px";
      ws.navEl.setAttribute("aria-hidden", "true");
      const mini = document.createElement("div");
      mini.className = "vellumwidget-nav-mini";
      const clone = ws.svgEl.cloneNode(true);
      clone.setAttribute("viewBox", fmtViewBox(ws.vb0));
      clone.setAttribute("preserveAspectRatio", "none");
      clone.removeAttribute("width");
      clone.removeAttribute("height");
      if (ws.aboveEl) {
        const g = document.createElementNS(SVGNS, "g");
        g.setAttribute("class", "vellumwidget-nav-above");
        for (let c = ws.aboveEl.firstChild; c; c = c.nextSibling) g.appendChild(c.cloneNode(true));
        clone.appendChild(g);
      }
      const defs = clone.querySelectorAll("defs");
      for (let i = 0; i < defs.length; i++) defs[i].remove();
      const uses = clone.querySelectorAll("use.vellumwidget-marks");
      for (let i = 1; i < uses.length; i++) uses[i].remove();
      const clipped = clone.querySelectorAll("[clip-path]");
      for (let i = 0; i < clipped.length; i++) clipped[i].removeAttribute("clip-path");
      const keyed = clone.querySelectorAll("[data-key],[tabindex],[role]");
      for (let i = 0; i < keyed.length; i++) {
        keyed[i].removeAttribute("data-key");
        keyed[i].removeAttribute("tabindex");
        keyed[i].removeAttribute("role");
      }
      clone.removeAttribute("id");
      const ided = clone.querySelectorAll(".vellumwidget-nav-above [id]");
      for (let i = 0; i < ided.length; i++) ided[i].removeAttribute("id");
      navStrokes(clone);
      mini.appendChild(clone);
      ws.navEl.appendChild(mini);
      ws.navWindow = document.createElement("div");
      ws.navWindow.className = "vellumwidget-nav-window";
      const hL = document.createElement("div");
      hL.className = "vellumwidget-nav-handle vellumwidget-nav-handle-l";
      const hR = document.createElement("div");
      hR.className = "vellumwidget-nav-handle vellumwidget-nav-handle-r";
      ws.navWindow.appendChild(hL);
      ws.navWindow.appendChild(hR);
      ws.navEl.appendChild(ws.navWindow);
      ws.el.appendChild(ws.navEl);
      wireNavigator(hL, hR);
      updateNav();
    }
    function wireNavigator(hL, hR) {
      if (!ws.navEl || !ws.navWindow) return;
      let mode = "";
      let startFracX = 0, startFracW = 0, startPointer = 0;
      const stripFrac = (clientX) => {
        const r = ws.navEl.getBoundingClientRect();
        return r.width ? (clientX - r.left) / r.width : 0;
      };
      const onMove = (ev) => {
        if (!mode || !ws.vb0) return;
        const d = stripFrac(ev.clientX) - startPointer;
        if (mode === "pan") navToView(startFracX + d, startFracW);
        else if (mode === "l") {
          const nx = startFracX + d;
          navToView(nx, startFracW + (startFracX - nx));
        } else if (mode === "r") navToView(startFracX, startFracW + d);
      };
      const onUp = (ev) => {
        mode = "";
        ws.navWindow.classList.remove("vellumwidget-nav-grabbing");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (ev && ev.target.releasePointerCapture) {
        }
      };
      const start = (m) => (ev) => {
        if (!ws.vb0) return;
        ev.preventDefault();
        ev.stopPropagation();
        mode = m;
        startFracX = (ws.vb.x - ws.vb0.x) / ws.vb0.w;
        startFracW = ws.vb.w / ws.vb0.w;
        startPointer = stripFrac(ev.clientX);
        if (m === "pan") ws.navWindow.classList.add("vellumwidget-nav-grabbing");
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
      };
      ws.navWindow.addEventListener("pointerdown", start("pan"));
      hL.addEventListener("pointerdown", start("l"));
      hR.addEventListener("pointerdown", start("r"));
    }
    return { navToView, updateNav, buildNavigator };
  }

  // node_modules/flatqueue/index.js
  var FlatQueue = class {
    /**
     * Creates an empty queue. If `capacity` is provided, the queue is backed by fixed-size typed
     * arrays for better performance and memory use, but can't grow beyond `capacity`. `values` uses
     * `ValuesArray` (default `Float64Array`) and `ids` uses `IdsArray` (default `Uint32Array`); pass
     * narrower constructors like `Uint16Array` if your values or ids are known to fit them.
     *
     * @param {number} [capacity]
     * @param {TypedArrayConstructor} [ValuesArray]
     * @param {TypedArrayConstructor} [IdsArray]
     */
    constructor(capacity = Infinity, ValuesArray = Float64Array, IdsArray = Uint32Array) {
      const fixed = capacity !== Infinity;
      this.ids = fixed ? (
        /** @type {T[]} */
        /** @type {unknown} */
        new IdsArray(capacity)
      ) : [];
      this.values = fixed ? (
        /** @type {number[]} */
        /** @type {unknown} */
        new ValuesArray(capacity)
      ) : [];
      this.capacity = capacity;
      this.length = 0;
    }
    /** Removes all items from the queue. */
    clear() {
      this.length = 0;
    }
    /**
     * Adds `item` to the queue with the specified `priority`.
     *
     * `priority` must be a number. Items are sorted and returned from low to high priority. Multiple items
     * with the same priority value can be added to the queue, but there is no guaranteed order between these items.
     *
     * For fixed-capacity queues, throws a `RangeError` if the queue is already full.
     *
     * @param {T} item
     * @param {number} priority
     */
    push(item, priority) {
      if (this.length === this.capacity) throw new RangeError("Queue is at capacity.");
      let pos = this.length++;
      while (pos > 0) {
        const parent = pos - 1 >> 1;
        const parentValue = this.values[parent];
        if (priority >= parentValue) break;
        this.ids[pos] = this.ids[parent];
        this.values[pos] = parentValue;
        pos = parent;
      }
      this.ids[pos] = item;
      this.values[pos] = priority;
    }
    /**
     * Removes and returns the item from the head of this queue, which is one of
     * the items with the lowest priority. If this queue is empty, returns `undefined`.
     */
    pop() {
      if (this.length === 0) return void 0;
      const ids = this.ids, values = this.values, top = ids[0], last = --this.length;
      if (last > 0) {
        const id = ids[last];
        const value = values[last];
        let pos = 0;
        const halfLen = last >> 1;
        while (pos < halfLen) {
          const left = (pos << 1) + 1;
          const right = left + 1;
          const child = left + (+(right < last) & +(values[right] < values[left]));
          if (values[child] >= value) break;
          ids[pos] = ids[child];
          values[pos] = values[child];
          pos = child;
        }
        ids[pos] = id;
        values[pos] = value;
      }
      return top;
    }
    /** Returns the item from the head of this queue without removing it. If this queue is empty, returns `undefined`. */
    peek() {
      return this.length > 0 ? this.ids[0] : void 0;
    }
    /**
     * Returns the priority value of the item at the head of this queue without
     * removing it. If this queue is empty, returns `undefined`.
     */
    peekValue() {
      return this.length > 0 ? this.values[0] : void 0;
    }
    /**
     * Shrinks the internal arrays to `this.length`. No-op for queues with fixed capacity.
     *
     * `pop()` and `clear()` calls don't free memory automatically to avoid unnecessary resize operations.
     * This also means that items that have been added to the queue can't be garbage collected until
     * a new item is pushed in their place, or this method is called.
     */
    shrink() {
      if (Array.isArray(this.ids)) this.ids.length = this.length;
      if (Array.isArray(this.values)) this.values.length = this.length;
    }
  };

  // node_modules/flatbush/index.js
  var ARRAY_TYPES = [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array];
  var VERSION = 3;
  var Flatbush = class _Flatbush {
    /**
     * Recreate a Flatbush index from raw `ArrayBuffer` or `SharedArrayBuffer` data.
     * @param {ArrayBufferLike} data
     * @param {number} [byteOffset=0] byte offset to the start of the Flatbush buffer in the referenced ArrayBuffer.
     * @returns {Flatbush} index
     */
    static from(data, byteOffset = 0) {
      if (byteOffset % 8 !== 0) {
        throw new Error("byteOffset must be 8-byte aligned.");
      }
      if (!data || data.byteLength === void 0 || "buffer" in data) {
        throw new Error("Data must be an instance of ArrayBuffer or SharedArrayBuffer.");
      }
      const [magic, versionAndType] = new Uint8Array(data, byteOffset + 0, 2);
      if (magic !== 251) {
        throw new Error("Data does not appear to be in a Flatbush format.");
      }
      const version = versionAndType >> 4;
      if (version !== VERSION) {
        throw new Error(`Got v${version} data when expected v${VERSION}.`);
      }
      const ArrayType = ARRAY_TYPES[versionAndType & 15];
      if (!ArrayType) {
        throw new Error("Unrecognized array type.");
      }
      const [nodeSize] = new Uint16Array(data, byteOffset + 2, 1);
      const [numItems] = new Uint32Array(data, byteOffset + 4, 1);
      return new _Flatbush(numItems, nodeSize, ArrayType, void 0, data, byteOffset);
    }
    /**
     * Create a Flatbush index that will hold a given number of items.
     * @param {number} numItems
     * @param {number} [nodeSize=16] Size of the tree node (16 by default).
     * @param {TypedArrayConstructor} [ArrayType=Float64Array] The array type used for coordinates storage (`Float64Array` by default).
     * @param {ArrayBufferConstructor | SharedArrayBufferConstructor} [ArrayBufferType=ArrayBuffer] The array buffer type used to store data (`ArrayBuffer` by default).
     * @param {ArrayBufferLike} [data] (Only used internally)
     * @param {number} [byteOffset=0] (Only used internally)
     */
    constructor(numItems, nodeSize = 16, ArrayType = Float64Array, ArrayBufferType = ArrayBuffer, data, byteOffset = 0) {
      if (numItems === void 0) throw new Error("Missing required argument: numItems.");
      if (isNaN(numItems) || numItems <= 0) throw new Error(`Unexpected numItems value: ${numItems}.`);
      this.numItems = +numItems;
      this.nodeSize = Math.min(Math.max(+nodeSize, 2), 65535);
      this.byteOffset = byteOffset;
      let n = numItems;
      let numNodes = n;
      this._levelBounds = [n * 4];
      do {
        n = Math.ceil(n / this.nodeSize);
        numNodes += n;
        this._levelBounds.push(numNodes * 4);
      } while (n !== 1);
      this.ArrayType = ArrayType;
      this.IndexArrayType = numNodes < 16384 ? Uint16Array : Uint32Array;
      const arrayTypeIndex = ARRAY_TYPES.indexOf(ArrayType);
      const nodesByteSize = numNodes * 4 * ArrayType.BYTES_PER_ELEMENT;
      if (arrayTypeIndex < 0) {
        throw new Error(`Unexpected typed array class: ${ArrayType}.`);
      }
      const BoxCtor = ArrayType;
      const IdxCtor = this.IndexArrayType;
      if (data) {
        this.data = data;
        this._boxes = new BoxCtor(data, byteOffset + 8, numNodes * 4);
        this._indices = new IdxCtor(data, byteOffset + 8 + nodesByteSize, numNodes);
        this._pos = numNodes * 4;
        this.minX = this._boxes[this._pos - 4];
        this.minY = this._boxes[this._pos - 3];
        this.maxX = this._boxes[this._pos - 2];
        this.maxY = this._boxes[this._pos - 1];
      } else {
        const data2 = this.data = new ArrayBufferType(8 + nodesByteSize + numNodes * this.IndexArrayType.BYTES_PER_ELEMENT);
        this._boxes = new BoxCtor(data2, 8, numNodes * 4);
        this._indices = new IdxCtor(data2, 8 + nodesByteSize, numNodes);
        this._pos = 0;
        this.minX = Infinity;
        this.minY = Infinity;
        this.maxX = -Infinity;
        this.maxY = -Infinity;
        new Uint8Array(data2, 0, 2).set([251, (VERSION << 4) + arrayTypeIndex]);
        new Uint16Array(data2, 2, 1)[0] = nodeSize;
        new Uint32Array(data2, 4, 1)[0] = numItems;
      }
      this._queue = new FlatQueue();
    }
    /**
     * Add a given rectangle to the index.
     * @param {number} minX
     * @param {number} minY
     * @param {number} maxX
     * @param {number} maxY
     * @returns {number} A zero-based, incremental number that represents the newly added rectangle.
     */
    add(minX, minY, maxX = minX, maxY = minY) {
      const pos = this._pos;
      const index = pos >> 2;
      const boxes = this._boxes;
      this._indices[index] = index;
      boxes[pos] = minX;
      boxes[pos + 1] = minY;
      boxes[pos + 2] = maxX;
      boxes[pos + 3] = maxY;
      this._pos = pos + 4;
      if (minX < this.minX) this.minX = minX;
      if (minY < this.minY) this.minY = minY;
      if (maxX > this.maxX) this.maxX = maxX;
      if (maxY > this.maxY) this.maxY = maxY;
      return index;
    }
    /** Perform indexing of the added rectangles. */
    finish() {
      if (this._pos >> 2 !== this.numItems) {
        throw new Error(`Added ${this._pos >> 2} items when expected ${this.numItems}.`);
      }
      const boxes = this._boxes;
      if (this.numItems <= this.nodeSize) {
        boxes[this._pos++] = this.minX;
        boxes[this._pos++] = this.minY;
        boxes[this._pos++] = this.maxX;
        boxes[this._pos++] = this.maxY;
        return;
      }
      const { numItems, minX, minY, nodeSize, _indices: indices, _levelBounds: levelBounds } = this;
      const width = this.maxX - minX || 1;
      const height = this.maxY - minY || 1;
      const hilbertValues = new Int32Array(numItems);
      const hilbertMax = (1 << 16) - 1;
      const sx = hilbertMax / width;
      const sy = hilbertMax / height;
      for (let i = 0, pos2 = 0; i < numItems; i++) {
        const itemMinX = boxes[pos2++];
        const itemMinY = boxes[pos2++];
        const itemMaxX = boxes[pos2++];
        const itemMaxY = boxes[pos2++];
        const x = sx * ((itemMinX + itemMaxX) / 2 - minX) | 0;
        const y = sy * ((itemMinY + itemMaxY) / 2 - minY) | 0;
        hilbertValues[i] = hilbert(x, y);
      }
      sort(hilbertValues, boxes, indices, 0, numItems - 1, nodeSize);
      let pos = numItems * 4;
      for (let i = 0, readPos = 0; i < levelBounds.length - 1; i++) {
        const end = levelBounds[i];
        while (readPos < end) {
          const nodeIndex = readPos;
          let nodeMinX = boxes[readPos++];
          let nodeMinY = boxes[readPos++];
          let nodeMaxX = boxes[readPos++];
          let nodeMaxY = boxes[readPos++];
          for (let j = 1; j < nodeSize && readPos < end; j++) {
            nodeMinX = Math.min(nodeMinX, boxes[readPos++]);
            nodeMinY = Math.min(nodeMinY, boxes[readPos++]);
            nodeMaxX = Math.max(nodeMaxX, boxes[readPos++]);
            nodeMaxY = Math.max(nodeMaxY, boxes[readPos++]);
          }
          indices[pos >> 2] = nodeIndex;
          boxes[pos++] = nodeMinX;
          boxes[pos++] = nodeMinY;
          boxes[pos++] = nodeMaxX;
          boxes[pos++] = nodeMaxY;
        }
      }
      this._pos = pos;
    }
    /**
     * Search the index by a bounding box.
     * @param {number} minX
     * @param {number} minY
     * @param {number} maxX
     * @param {number} maxY
     * @param {(index: number, x0: number, y0: number, x1: number, y1: number) => boolean} [filterFn] An optional function that is called on every found item; if supplied, only items for which this function returns true will be included in the results array.
     * @returns {number[]} An array of indices of items intersecting or touching the given bounding box.
     */
    search(minX, minY, maxX, maxY, filterFn) {
      if (this._pos !== this._boxes.length) {
        throw new Error("Data not yet indexed - call index.finish().");
      }
      const { _boxes: boxes, _levelBounds: levelBounds, _indices: indices, nodeSize } = this;
      const numItems4 = this.numItems * 4;
      let nodeIndex = boxes.length - 4;
      let level = levelBounds.length - 1;
      const q = [];
      const results = [];
      let contained = false;
      while (nodeIndex !== void 0) {
        const end = Math.min(nodeIndex + nodeSize * 4, levelBounds[level]);
        const isNode = nodeIndex >= numItems4;
        if (contained) {
          this._collectContained(nodeIndex, end, level, numItems4, results, filterFn);
        } else {
          for (let pos = nodeIndex; pos < end; pos += 4) {
            const x0 = boxes[pos];
            if (maxX < x0) continue;
            const y0 = boxes[pos + 1];
            if (maxY < y0) continue;
            const x1 = boxes[pos + 2];
            if (minX > x1) continue;
            const y1 = boxes[pos + 3];
            if (minY > y1) continue;
            const index = indices[pos >> 2] | 0;
            if (isNode) {
              const c = +(minX <= x0 && minY <= y0 && maxX >= x1 && maxY >= y1);
              q.push(index | c, level - 1);
            } else if (filterFn === void 0 || filterFn(index, x0, y0, x1, y1)) {
              results.push(index);
            }
          }
        }
        level = /** @type {number} */
        q.pop();
        nodeIndex = q.pop();
        if (nodeIndex !== void 0) {
          contained = (nodeIndex & 1) === 1;
          nodeIndex &= ~1;
        }
      }
      return results;
    }
    /**
     * Collect all leaves of a subtree that's fully inside the query, skipping intersection tests.
     * Because the tree is packed bottom-up, those leaves occupy one contiguous block of the leaf
     * level, so we skip traversal entirely: descend to the first leaf, then sweep the flat range.
     * @param {number} nodeIndex
     * @param {number} end
     * @param {number} level
     * @param {number} numItems4
     * @param {number[]} results
     * @param {((index: number, x0: number, y0: number, x1: number, y1: number) => boolean) | undefined} filterFn
     */
    _collectContained(nodeIndex, end, level, numItems4, results, filterFn) {
      const boxes = this._boxes;
      const indices = this._indices;
      let pos = nodeIndex;
      for (let l = level; l > 0; l--) pos = indices[pos >> 2];
      const leafEnd = Math.min(pos + (end - nodeIndex) * this.nodeSize ** level, numItems4);
      if (filterFn === void 0) {
        for (; pos < leafEnd; pos += 4) results.push(indices[pos >> 2] | 0);
      } else {
        for (; pos < leafEnd; pos += 4) {
          const index = indices[pos >> 2] | 0;
          if (filterFn(index, boxes[pos], boxes[pos + 1], boxes[pos + 2], boxes[pos + 3])) results.push(index);
        }
      }
    }
    /**
     * Search items in order of distance from the given point.
     * @param {number} x
     * @param {number} y
     * @param {number} [maxResults=Infinity]
     * @param {number} [maxDistance=Infinity]
     * @param {(index: number) => boolean} [filterFn] An optional function for filtering the results.
     * @returns {number[]} An array of indices of items found.
     */
    neighbors(x, y, maxResults = Infinity, maxDistance = Infinity, filterFn) {
      if (this._pos !== this._boxes.length) {
        throw new Error("Data not yet indexed - call index.finish().");
      }
      const { _boxes: boxes, _levelBounds: levelBounds, _indices: indices, _queue: q, nodeSize } = this;
      const numItems4 = this.numItems * 4;
      const nodeSize4 = nodeSize * 4;
      const results = [];
      const maxDistSquared = maxDistance * maxDistance;
      const trackNearest = maxResults === 1;
      let bound = maxDistSquared;
      q.push(boxes.length - 4 << 1, 0);
      while (q.length) {
        const top = q.ids[0];
        if (top & 1) {
          q.pop();
          results.push(top >> 1);
          if (results.length === maxResults) break;
          continue;
        }
        q.pop();
        const nodeIndex = top >> 1;
        const isLeafLevel = nodeIndex < numItems4;
        const end = Math.min(nodeIndex + nodeSize4, upperBound(nodeIndex, levelBounds));
        for (let pos = nodeIndex; pos < end; pos += 4) {
          const minX = boxes[pos];
          const minY = boxes[pos + 1];
          const maxX = boxes[pos + 2];
          const maxY = boxes[pos + 3];
          const dx = Math.max(Math.max(minX - x, x - maxX), 0);
          const dy = Math.max(Math.max(minY - y, y - maxY), 0);
          const dist = dx * dx + dy * dy;
          if (dist > bound) continue;
          const childIndex = indices[pos >> 2] | 0;
          if (isLeafLevel) {
            if (filterFn === void 0 || filterFn(childIndex)) {
              q.push(childIndex << 1 | 1, dist);
              if (trackNearest && dist < bound) bound = dist;
            }
          } else {
            q.push(childIndex << 1, dist);
          }
        }
      }
      q.clear();
      return results;
    }
  };
  function upperBound(value, arr) {
    let i = 0;
    let j = arr.length - 1;
    while (i < j) {
      const m = i + j >> 1;
      if (arr[m] > value) {
        j = m;
      } else {
        i = m + 1;
      }
    }
    return arr[i];
  }
  function sort(values, boxes, indices, left, right, nodeSize) {
    const stack = [left, right];
    while (stack.length) {
      const r = stack.pop() || 0;
      const l = stack.pop() || 0;
      if (r - l <= nodeSize && Math.floor(l / nodeSize) >= Math.floor(r / nodeSize)) continue;
      const a = values[l];
      const b = values[l + r >> 1];
      const c = values[r];
      const pivot = a > b !== a > c ? a : b < a !== b < c ? b : c;
      let i = l - 1;
      let j = r + 1;
      while (true) {
        do
          i++;
        while (values[i] < pivot);
        do
          j--;
        while (values[j] > pivot);
        if (i >= j) break;
        swap(values, boxes, indices, i, j);
      }
      stack.push(l, j, j + 1, r);
    }
  }
  function swap(values, boxes, indices, i, j) {
    const temp = values[i];
    values[i] = values[j];
    values[j] = temp;
    const k = 4 * i;
    const m = 4 * j;
    const a = boxes[k];
    const b = boxes[k + 1];
    const c = boxes[k + 2];
    const d = boxes[k + 3];
    boxes[k] = boxes[m];
    boxes[k + 1] = boxes[m + 1];
    boxes[k + 2] = boxes[m + 2];
    boxes[k + 3] = boxes[m + 3];
    boxes[m] = a;
    boxes[m + 1] = b;
    boxes[m + 2] = c;
    boxes[m + 3] = d;
    const e = indices[i];
    indices[i] = indices[j];
    indices[j] = e;
  }
  function hilbert(x, y) {
    let a = x ^ y;
    let b = 65535 ^ a;
    let c = 65535 ^ (x | y);
    let d = x & (y ^ 65535);
    let A = a | b >> 1;
    let B = a >> 1 ^ a;
    let C = c ^ (c >> 1 ^ b & d >> 1);
    let D = d ^ (a & c >> 1 ^ d >> 1);
    a = A & A >> 2 ^ B & B >> 2;
    b = A & B >> 2 ^ B & (A ^ B) >> 2;
    c = C ^ (A & C >> 2 ^ B & D >> 2);
    d = D ^ (B & C >> 2 ^ (A ^ B) & D >> 2);
    A = a & a >> 4 ^ b & b >> 4;
    B = a & b >> 4 ^ b & (a ^ b) >> 4;
    C = c ^ (a & c >> 4 ^ b & d >> 4);
    D = d ^ (b & c >> 4 ^ (a ^ b) & d >> 4);
    c = C ^ (A & C >> 8 ^ B & D >> 8);
    d = D ^ (B & C >> 8 ^ (A ^ B) & D >> 8);
    c ^= c >> 1;
    d ^= d >> 1;
    a = x ^ y;
    b = d | 65535 ^ (a | c);
    a = (a | a << 8) & 16711935;
    a = (a | a << 4) & 252645135;
    a = (a | a << 2) & 858993459;
    a = (a | a << 1) & 1431655765;
    b = (b | b << 8) & 16711935;
    b = (b | b << 4) & 252645135;
    b = (b | b << 2) & 858993459;
    b = (b | b << 1) & 1431655765;
    return ((b << 1 | a) >>> 0) - 2147483648;
  }

  // srcts/spatial.ts
  function brushKeys(elems, brush) {
    const out = [];
    const seen = {};
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (hasBbox(e) && rectsIntersect(e, brush) && !seen[e.key]) {
        seen[e.key] = true;
        out.push(e.key);
      }
    }
    return out;
  }
  function pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if (yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function lassoKeys(elems, poly) {
    const out = [];
    const seen = {};
    if (poly.length < 3) return out;
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (!hasBbox(e) || seen[e.key]) continue;
      if (pointInPolygon((e.x0 + e.x1) / 2, (e.y0 + e.y1) / 2, poly)) {
        seen[e.key] = true;
        out.push(e.key);
      }
    }
    return out;
  }
  function polyBounds(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < poly.length; i++) {
      if (poly[i].x < x0) x0 = poly[i].x;
      if (poly[i].y < y0) y0 = poly[i].y;
      if (poly[i].x > x1) x1 = poly[i].x;
      if (poly[i].y > y1) y1 = poly[i].y;
    }
    return { x0, y0, x1, y1 };
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
  function nearestSortedIdx(sorted, target) {
    const n = sorted.length;
    if (!n) return -1;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (sorted[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(sorted[lo - 1] - target) <= Math.abs(sorted[lo] - target)) return lo - 1;
    return lo;
  }
  function columnTolerance(sorted) {
    let minGap = Infinity;
    for (let i = 1; i < sorted.length; i++) {
      const g = sorted[i] - sorted[i - 1];
      if (g > 1e-6 && g < minGap) minGap = g;
    }
    return isFinite(minGap) ? minGap / 2 : 1;
  }
  function finite(v) {
    return typeof v === "number" && isFinite(v);
  }
  function isSeriesElem(e) {
    if (e.mark !== "line" && e.mark !== "polygon") return false;
    return finite(e.ixh) && finite(e.ix) && e.ixh !== e.ix || finite(e.iyh) && finite(e.iy) && e.iyh !== e.iy;
  }
  function dropPartialSeries(elems, keys, inside) {
    if (!keys.length) return keys;
    const want = {};
    for (let i = 0; i < keys.length; i++) want[keys[i]] = true;
    const partial = {};
    let any = false;
    for (let i = 0; i < elems.length; i++) {
      const e = elems[i];
      if (!want[e.key] || !isSeriesElem(e)) continue;
      if (!hasBbox(e) || !inside(e)) {
        partial[e.key] = true;
        any = true;
      }
    }
    return any ? keys.filter(function(k) {
      return !partial[k];
    }) : keys;
  }
  function bboxInRect(e, r) {
    return e.x0 >= r.x0 - 0.5 && e.x1 <= r.x1 + 0.5 && e.y0 >= r.y0 - 0.5 && e.y1 <= r.y1 + 0.5;
  }
  function bboxInPolygon(e, poly) {
    return pointInPolygon(e.x0, e.y0, poly) && pointInPolygon(e.x1, e.y0, poly) && pointInPolygon(e.x0, e.y1, poly) && pointInPolygon(e.x1, e.y1, poly);
  }

  // srcts/features/picking.ts
  function pickingFeature(ws) {
    function buildSpatialIndex() {
      ws.spatialIndex = null;
      ws.indexToElem = [];
      let count = 0;
      for (let i = 0; i < ws.elements.length; i++) if (hasBbox(ws.elements[i])) count++;
      if (!count) return;
      const idx = new Flatbush(count);
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (!hasBbox(e)) continue;
        idx.add(e.x0, e.y0, e.x1, e.y1);
        ws.indexToElem.push(i);
      }
      idx.finish();
      ws.spatialIndex = idx;
    }
    function buildGeometry(g) {
      ws.geomByKey = {};
      ws.gx = new Float64Array(0);
      ws.gy = new Float64Array(0);
      ws.haveGeometry = false;
      if (!g) return;
      const keys = asColumn(g.key);
      const kinds = asColumn(g.kind);
      const ns = asColumn(g.n);
      const xs = asColumn(g.x);
      const ys = asColumn(g.y);
      if (xs.length !== ys.length) return;
      const fromList = g.dl === 1 && ws.dl ? listGeometry(keys) : null;
      if (!keys.length && !fromList) return;
      const nv = xs.length + (fromList ? fromList.nv : 0);
      ws.gx = new Float64Array(nv);
      ws.gy = new Float64Array(nv);
      ws.gx.set(xs);
      ws.gy.set(ys);
      const nrs = g.nr != null ? asColumn(g.nr) : null;
      const rls = g.rl != null ? asColumn(g.rl) : null;
      const eos = g.eo != null ? asColumn(g.eo) : null;
      let at = 0, ra = 0;
      for (let i = 0; i < keys.length; i++) {
        const n = ns[i] | 0;
        if (n <= 0 || at + n > xs.length) break;
        const rec = { kind: kinds[i], at, n };
        if (eos && eos[i] === 1) rec.evenodd = true;
        if (nrs && rls) {
          const k = nrs[i] | 0;
          if (k > 1) {
            const lens = [];
            for (let j = 0; j < k; j++) lens.push(rls[ra + j] | 0);
            rec.rings = lens;
          }
          ra += k > 0 ? k : 1;
        }
        (ws.geomByKey[keys[i]] || (ws.geomByKey[keys[i]] = [])).push(rec);
        at += n;
      }
      if (fromList) at = appendListGeometry(fromList.recs, at);
      ws.haveGeometry = at > 0;
    }
    function listGeometry(blockKeys) {
      const dl = ws.dl;
      const inBlock = {};
      for (let i = 0; i < blockKeys.length; i++) inBlock[blockKeys[i]] = true;
      const flagged = {};
      for (let i = 0; i < dl.n; i++) if (dl.flags[i] & 15) flagged[dl.key[i]] = true;
      const recs = [];
      let nv = 0;
      for (let i = 0; i < dl.n; i++) {
        if (dl.kind[i] !== DL_PATH || flagged[dl.key[i]]) continue;
        const k = dl.keys[dl.key[i]];
        if (k == null || inBlock[k]) continue;
        const j = dl.row[i];
        const n = dl.runOff[dl.pathOff[j + 1]] - dl.runOff[dl.pathOff[j]];
        if (n <= 0) continue;
        recs.push(i);
        nv += n;
      }
      return { recs, nv };
    }
    function appendListGeometry(recs, at) {
      const dl = ws.dl;
      for (let r = 0; r < recs.length; r++) {
        const i = recs[r], j = dl.row[i];
        const r0 = dl.pathOff[j], r1 = dl.pathOff[j + 1];
        const v0 = dl.runOff[r0], v1 = dl.runOff[r1];
        for (let v = v0; v < v1; v++) {
          ws.gx[at + v - v0] = dl.xy[2 * v];
          ws.gy[at + v - v0] = dl.xy[2 * v + 1];
        }
        const rec = { kind: dl.closed[j] === 1 ? "polygon" : "line", at, n: v1 - v0 };
        if (r1 - r0 > 1) {
          const lens = [];
          for (let run = r0; run < r1; run++) lens.push(dl.runOff[run + 1] - dl.runOff[run]);
          rec.rings = lens;
        }
        if (dl.evenodd[j] === 1) rec.evenodd = true;
        const k = dl.keys[dl.key[i]];
        (ws.geomByKey[k] || (ws.geomByKey[k] = [])).push(rec);
        at += v1 - v0;
      }
      return at;
    }
    function constBox(e) {
      if (!ws.axisZoomActive || ws.opts.zoomMarks === "scale" || !hasBbox(e)) return null;
      const text = e.mark === "text";
      if (!text && !(e.mark && GLYPH_MARKS[e.mark] === true)) return null;
      let ax = (e.x0 + e.x1) / 2, ay = (e.y0 + e.y1) / 2;
      const a = ws.fx.azNearest(ax, ay);
      if (!a) return null;
      const p = a.p;
      if (ax < p.px0 || ax > p.px1 || ay < p.py0 || ay > p.py1) return null;
      const t = ws.fx.azT(a);
      if (!(t.sx > 0) || !(t.sy > 0) || Math.abs(t.sx - 1) < 1e-9 && Math.abs(t.sy - 1) < 1e-9) return null;
      if (ws.rasterMode && !ws.azPanels.some(function(q) {
        const u = ws.fx.azT(q);
        return u.sx > 1.0001 || u.sy > 1.0001;
      })) return null;
      if (text) {
        const an = textAnchor(e.key);
        if (an) {
          ax = an.x;
          ay = an.y;
        }
      }
      return {
        x0: ax + (e.x0 - ax) / t.sx,
        x1: ax + (e.x1 - ax) / t.sx,
        y0: ay + (e.y0 - ay) / t.sy,
        y1: ay + (e.y1 - ay) / t.sy,
        sx: t.sx,
        sy: t.sy
      };
    }
    function textAnchor(key) {
      if (ws.rasterMode) {
        const r = ws.fx.constAnchor(key);
        if (r) return r;
      }
      const nodes = ws.nodesByKey[key];
      const n = nodes && nodes.length ? nodes[0] : null;
      const t = n ? n.tagName.toLowerCase() === "text" ? n : n.querySelector("text") : null;
      if (!t) return null;
      const x = parseFloat(t.getAttribute("x") || "") || 0, y = parseFloat(t.getAttribute("y") || "") || 0;
      const tr = (t.getAttribute("transform") || "").trim();
      if (!tr) return { x, y };
      const m = parseTransformList(tr);
      return m ? applyAffine6(m, x, y) : null;
    }
    function constGrows() {
      if (!ws.axisZoomActive || ws.opts.zoomMarks === "scale") return false;
      for (let i = 0; i < ws.azPanels.length; i++) {
        const t = ws.fx.azT(ws.azPanels[i]);
        if (t.sx < 1 - 1e-9 || t.sy < 1 - 1e-9) return true;
      }
      return false;
    }
    function distToElem(x, y, e) {
      const cb = constBox(e);
      const box = cb || (hasBbox(e) ? e : null);
      const gs = cb ? null : ws.geomByKey[e.key];
      if (!gs) {
        if (!box) return Infinity;
        if (isRoundMark(e.mark)) {
          const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
          const r = Math.min(box.x1 - box.x0, box.y1 - box.y0) / 2;
          const dx = x - cx, dy = y - cy;
          const d = Math.sqrt(dx * dx + dy * dy);
          return d > r ? d - r : 0;
        }
        return distToBbox(x, y, box);
      }
      let best = Infinity;
      for (let i = 0; i < gs.length; i++) {
        const d = distToGeom(x, y, gs[i], ws.gx, ws.gy, box);
        if (d < best) best = d;
      }
      return best;
    }
    function buildHoverAxis() {
      const cx = [];
      const cy = [];
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (!hasBbox(e)) continue;
        cx.push({ c: (e.x0 + e.x1) / 2, k: e.key });
        cy.push({ c: (e.y0 + e.y1) / 2, k: e.key });
      }
      cx.sort((a, b) => a.c - b.c);
      cy.sort((a, b) => a.c - b.c);
      ws.sortedCx = cx.map((p) => p.c);
      ws.sortedCxKeys = cx.map((p) => p.k);
      ws.sortedCy = cy.map((p) => p.c);
      ws.sortedCyKeys = cy.map((p) => p.k);
      ws.tolX = columnTolerance(ws.sortedCx);
      ws.tolY = columnTolerance(ws.sortedCy);
    }
    function nearestAxisKey(axis, coord) {
      const sorted = axis === "x" ? ws.sortedCx : ws.sortedCy;
      const keys = axis === "x" ? ws.sortedCxKeys : ws.sortedCyKeys;
      const i = nearestSortedIdx(sorted, coord);
      return i >= 0 ? keys[i] : null;
    }
    function columnKeys(primary, axis) {
      const m = ws.meta[primary];
      if (!m || !hasBbox(m)) return [primary];
      const cx = (m.x0 + m.x1) / 2;
      const cy = (m.y0 + m.y1) / 2;
      const SPAN = 1e7;
      const rect = axis === "x" ? { x0: cx - ws.tolX, x1: cx + ws.tolX, y0: -SPAN, y1: SPAN } : { x0: -SPAN, x1: SPAN, y0: cy - ws.tolY, y1: cy + ws.tolY };
      const ks = brushKeysIn(rect);
      return ks.length ? ks : [primary];
    }
    function nearestKeyAt(x, y, maxDist) {
      let best = null;
      let bestD = maxDist;
      const rank = (e) => {
        if (e.source != null && !ws.geomByKey[e.key]) return;
        const d = distToElem(x, y, e);
        if (d <= bestD) {
          bestD = d;
          best = e.key;
        }
      };
      if (ws.spatialIndex && !constGrows()) {
        const ids = ws.spatialIndex.neighbors(x, y, PICK_CANDIDATES, maxDist);
        for (let i = 0; i < ids.length; i++) rank(ws.elements[ws.indexToElem[ids[i]]]);
      } else {
        for (let i = 0; i < ws.elements.length; i++) rank(ws.elements[i]);
      }
      return best;
    }
    function constOutgrows() {
      if (!ws.axisZoomActive || ws.opts.zoomMarks === "scale") return false;
      return ws.azPanels.some(function(a) {
        const t = ws.fx.azT(a);
        return t.sx < 1 || t.sy < 1;
      });
    }
    function candidates(b) {
      if (!ws.spatialIndex || constOutgrows()) {
        const all = new Array(ws.elements.length);
        for (let i = 0; i < all.length; i++) all[i] = i;
        return all;
      }
      return ws.spatialIndex.search(b.x0, b.y0, b.x1, b.y1).map((id) => ws.indexToElem[id]).sort((a, b2) => a - b2);
    }
    function brushKeysIn(rect) {
      const indexed = !!ws.spatialIndex && !constOutgrows();
      const eids = candidates(rect);
      const out = [];
      const seen = {};
      for (let i = 0; i < eids.length; i++) {
        const e = ws.elements[eids[i]];
        if (seen[e.key]) continue;
        const cb = constBox(e);
        if (cb ? !rectsIntersect(cb, rect) : !hasBbox(e) || !indexed && !rectsIntersect(e, rect)) continue;
        seen[e.key] = true;
        out.push(e.key);
      }
      return out;
    }
    function lassoKeysIn(poly) {
      if (poly.length < 3) return [];
      const eids = candidates(polyBounds(poly));
      const out = [];
      const seen = {};
      for (let i = 0; i < eids.length; i++) {
        const e = ws.elements[eids[i]];
        if (seen[e.key] || !hasBbox(e)) continue;
        const b = constBox(e) || e;
        if (pointInPolygon((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, poly)) {
          seen[e.key] = true;
          out.push(e.key);
        }
      }
      return out;
    }
    function brushSelectable(keys, region) {
      const inside = Array.isArray(region) ? function(e) {
        return bboxInPolygon(e, region);
      } : function(e) {
        return bboxInRect(e, region);
      };
      return dropPartialSeries(ws.elements, keys, inside);
    }
    return { buildSpatialIndex, buildGeometry, distToElem, buildHoverAxis, nearestAxisKey, columnKeys, nearestKeyAt, brushKeysIn, lassoKeysIn, brushSelectable, constBox };
  }

  // srcts/features/pointer.ts
  function pointerFeature(ws) {
    function positionBrush(x, y, w, h) {
      ws.brushBox.style.left = x + "px";
      ws.brushBox.style.top = y + "px";
      ws.brushBox.style.width = w + "px";
      ws.brushBox.style.height = h + "px";
      ws.brushBox.style.display = "block";
    }
    function hideBrush() {
      ws.brushBox.style.display = "none";
    }
    function lassoPointsAttr() {
      let s = "";
      for (let i = 0; i < ws.lassoPts.length; i++) s += (i ? " " : "") + ws.lassoPts[i].x + "," + ws.lassoPts[i].y;
      return s;
    }
    function updateLassoPath() {
      if (!ws.crosshairLayer) return;
      if (!ws.lassoEl) {
        ws.lassoEl = document.createElementNS(SVGNS, "polygon");
        ws.lassoEl.setAttribute("class", "vellumwidget-lasso");
        ws.lassoEl.setAttribute("vector-effect", "non-scaling-stroke");
        ws.crosshairLayer.appendChild(ws.lassoEl);
      }
      ws.lassoEl.setAttribute("points", lassoPointsAttr());
      if (ws.fx.azMulti() && ws.anchorPanel) ws.lassoEl.setAttribute("transform", ws.fx.fmtPan(ws.fx.azT(ws.anchorPanel)));
      else ws.lassoEl.removeAttribute("transform");
    }
    function clearLasso() {
      ws.lassoPts = [];
      if (ws.lassoEl && ws.lassoEl.parentNode) ws.lassoEl.parentNode.removeChild(ws.lassoEl);
      ws.lassoEl = null;
    }
    function hoverAt(k, clientX, clientY) {
      if (k != null && ws.fx.inert(k)) k = null;
      if (k == null) {
        ws.fx.clearHover();
        return;
      }
      const hm = ws.opts.hoverMode || "closest";
      const unified = hm === "x" || hm === "y";
      const keys = ws.fx.dropInert(unified ? ws.fx.columnKeys(k, hm) : ws.fx.linkedKeys(k));
      if (!keys.length) {
        ws.fx.clearHover();
        return;
      }
      const sig = hm + "" + k + "" + keys.join("");
      if (sig === ws.hoverSig) {
        if (ws.opts.tooltip) ws.fx.moveTip(clientX, clientY, k);
        return;
      }
      ws.fx.shinyInput("hover", k);
      ws.hovering = true;
      ws.fx.setHoverKeys(keys);
      if (ws.opts.crosshair) ws.fx.drawCrosshair(k, unified ? hm : "closest");
      if (ws.opts.tooltip) {
        if (unified) ws.fx.showTipMulti(clientX, clientY, keys);
        else ws.fx.showTip(clientX, clientY, k);
      }
      ws.hoverSig = sig;
    }
    function onHoverMove(ev) {
      if (ws.down || ws.pinchDist > 0) return;
      const hm = ws.opts.hoverMode || "closest";
      const k = keyOf(ev.target);
      if (k != null) {
        if (ws.hoverRAF) {
          cancelAnimationFrame(ws.hoverRAF);
          ws.hoverRAF = 0;
        }
        hoverAt(k, ev.clientX, ev.clientY);
        return;
      }
      if (!ws.elements.length || hm === "closest" && !ws.opts.nearest) {
        ws.fx.clearHover();
        return;
      }
      const cx = ev.clientX;
      const cy = ev.clientY;
      if (ws.hoverRAF) return;
      ws.hoverRAF = requestAnimationFrame(function() {
        ws.hoverRAF = 0;
        const u = ws.fx.clientToScene(cx, cy);
        let seed;
        if (hm === "x") seed = ws.fx.nearestAxisKey("x", u.x);
        else if (hm === "y") seed = ws.fx.nearestAxisKey("y", u.y);
        else seed = ws.fx.nearestKeyAt(u.x, u.y, ws.vb ? ws.vb.w * 0.02 : 8);
        hoverAt(seed, cx, cy);
      });
    }
    function onDragMove(ev) {
      if (ws.pointers.has(ev.pointerId)) {
        ws.pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
      }
      if (ws.pinchDist > 0 && ws.pointers.size >= 2 && ws.vb) {
        const pts = Array.from(ws.pointers.values());
        const d = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
        if (d > 0) {
          const u = ws.fx.toAnchor((pts[0].cx + pts[1].cx) / 2, (pts[0].cy + pts[1].cy) / 2);
          const next = zoomViewBoxCapped(ws.vb, ws.vb0, d / ws.pinchDist, u.x, u.y, ws.opts.maxZoom);
          ws.pinchDist = d;
          if (next !== ws.vb) {
            ws.vb = next;
            ws.fx.applyViewBox();
          }
        }
        return;
      }
      if (!ws.down) return;
      if (!ws.dragging) {
        if (Math.abs(ev.clientX - ws.down.cx) + Math.abs(ev.clientY - ws.down.cy) <= DRAG_THRESHOLD) return;
        ws.dragging = ws.mode === "pan" && ws.opts.zoom ? "pan" : ws.mode === "lasso" && ws.opts.lasso ? "lasso" : ws.opts.brush ? "brush" : "";
        if (ws.dragging === "pan") ws.el.classList.add("vellumwidget-panning");
        if (ws.dragging === "lasso") ws.lassoPts = [ws.fx.clientToScene(ws.down.cx, ws.down.cy)];
        if (ws.dragging === "") return;
        ws.movedDuringDrag = true;
      }
      if (ws.dragging === "brush") {
        const box = ws.el.getBoundingClientRect();
        positionBrush(
          Math.min(ws.down.cx, ev.clientX) - box.left,
          Math.min(ws.down.cy, ev.clientY) - box.top,
          Math.abs(ev.clientX - ws.down.cx),
          Math.abs(ev.clientY - ws.down.cy)
        );
      } else if (ws.dragging === "lasso" && ws.vb) {
        ws.lassoPts.push(ws.fx.clientToScene(ev.clientX, ev.clientY));
        updateLassoPath();
      } else if (ws.dragging === "pan" && ws.vb) {
        const u = ws.fx.toAnchor(ev.clientX, ev.clientY);
        ws.vb.x -= u.x - ws.down.ux;
        ws.vb.y -= u.y - ws.down.uy;
        ws.fx.applyViewBox();
        const u2 = ws.fx.toAnchor(ev.clientX, ev.clientY);
        ws.down.ux = u2.x;
        ws.down.uy = u2.y;
      }
    }
    function onDown(ev) {
      if (ev.pointerType === "mouse" && ev.button !== 0) return;
      ws.pointers.set(ev.pointerId, { cx: ev.clientX, cy: ev.clientY });
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragUp);
      window.addEventListener("pointercancel", onDragUp);
      if (ws.pointers.size >= 2 && ws.opts.zoom) {
        const pts = Array.from(ws.pointers.values());
        ws.pinchDist = Math.hypot(pts[0].cx - pts[1].cx, pts[0].cy - pts[1].cy);
        ws.down = null;
        ws.dragging = "";
        hideBrush();
        ws.el.classList.remove("vellumwidget-panning");
        return;
      }
      if (ws.axisZoomActive) {
        const pu = ws.fx.toUser(ev.clientX, ev.clientY);
        ws.anchorPanel = ws.fx.azNearest(pu.x, pu.y);
      }
      if (ws.anchorPanel) ws.fx.focusCell(ws.anchorPanel.p.cell);
      const u = ws.fx.toAnchor(ev.clientX, ev.clientY);
      ws.down = { cx: ev.clientX, cy: ev.clientY, ux: u.x, uy: u.y };
      ws.dragging = "";
      ws.movedDuringDrag = false;
    }
    function onDragUp(ev) {
      ws.pointers.delete(ev.pointerId);
      const wasPinch = ws.pinchDist > 0;
      if (ws.pointers.size < 2) ws.pinchDist = 0;
      if (ws.pointers.size === 0) {
        ws.anchorPanel = null;
        window.removeEventListener("pointermove", onDragMove);
        window.removeEventListener("pointerup", onDragUp);
        window.removeEventListener("pointercancel", onDragUp);
      }
      if (wasPinch) {
        ws.down = null;
        ws.dragging = "";
        ws.el.classList.remove("vellumwidget-panning");
        hideBrush();
        ws.fx.reportView();
        return;
      }
      if (ws.dragging === "brush" && ws.down) {
        const p1 = ws.fx.clientToScene(ws.down.cx, ws.down.cy);
        const p2 = ws.fx.clientToScene(ev.clientX, ev.clientY);
        const rect = {
          x0: Math.min(p1.x, p2.x),
          y0: Math.min(p1.y, p2.y),
          x1: Math.max(p1.x, p2.x),
          y1: Math.max(p1.y, p2.y)
        };
        const iv = ws.fx.applyIntervalBrush(rect);
        ws.lastBrush = iv ? iv.band : rect;
        const hitKeys = iv ? iv.keys : ws.fx.dropInert(ws.fx.brushKeysIn(rect));
        if (ws.opts.select) ws.fx.setSelection(ws.fx.brushSelectable(hitKeys, iv ? iv.band : rect));
        else if (iv) ws.fx.reevaluateInteractions();
        ws.fx.shinyInput("brush", Object.assign(
          { keys: hitKeys, x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 },
          ws.fx.brushDataFields(rect),
          iv ? iv.fields : {}
        ), { priority: "event" });
        hideBrush();
      } else if (ws.dragging === "lasso") {
        const poly = ws.lassoPts.slice();
        const hitKeys = ws.fx.dropInert(ws.fx.lassoKeysIn(poly));
        if (poly.length >= 3) {
          const b = polyBounds(poly);
          ws.lastBrush = b;
          if (ws.opts.select) ws.fx.setSelection(ws.fx.brushSelectable(hitKeys, poly));
          ws.fx.shinyInput("brush", Object.assign(
            { keys: hitKeys, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, lasso: true },
            ws.fx.brushDataFields(b)
          ), { priority: "event" });
        }
        clearLasso();
      }
      if (ws.dragging === "pan") ws.fx.reportView();
      ws.el.classList.remove("vellumwidget-panning");
      ws.down = null;
      ws.dragging = "";
    }
    function onClick(ev) {
      if (ws.movedDuringDrag) {
        ws.movedDuringDrag = false;
        return;
      }
      let k = keyOf(ev.target);
      if (k == null && ws.rasterMode && ws.opts.nearest !== false && ws.elements.length) {
        const u = ws.fx.clientToScene(ev.clientX, ev.clientY);
        const rad = ws.vb ? ws.vb.w * 0.02 : 8;
        k = ws.fx.nearestKeyAt(u.x, u.y, rad);
        if (k != null && ws.fx.inert(k)) k = null;
      }
      ws.fx.shinyInput("click", { key: k }, { priority: "event" });
      if (ws.provenance && ws.provenance.on === "click") ws.fx.emitSource(ev.target);
      const series = ws.fx.swatchSeries(k);
      if (series != null && ws.fx.legendPolicy() !== "select") {
        if (!(ev.detail && ev.detail >= 2)) ws.fx.legendToggle(series);
        return;
      }
      if (k != null) {
        if (ws.opts.select) ws.fx.toggleSelect(k);
      } else {
        ws.fx.clearSelection();
        ws.lastBrush = null;
      }
    }
    function onDblClick(ev) {
      const series = ws.fx.swatchSeries(keyOf(ev.target));
      if (series != null && ws.fx.legendPolicy() !== "select") ws.fx.legendIsolate(series);
    }
    function onWheel(ev) {
      if (!ws.opts.zoom || !ws.vb) return;
      ev.preventDefault();
      ws.fx.focusCellAt(ev.clientX, ev.clientY);
      const u = ws.fx.toAnchor(ev.clientX, ev.clientY);
      const factor = ev.deltaY < 0 ? 1.2 : 1 / 1.2;
      const next = zoomViewBoxCapped(ws.vb, ws.vb0, factor, u.x, u.y, ws.opts.maxZoom);
      if (next === ws.vb) return;
      ws.vb = next;
      ws.fx.applyViewBox();
    }
    function onKey(ev) {
      if (ev.key === "Escape") {
        ws.fx.clearSelection();
        ws.fx.clearHover();
        ws.fx.clearClass("vellumwidget-focus");
        hideBrush();
        ws.lastBrush = null;
        if (ws.fx.markFocused() && typeof ws.el.focus === "function") ws.el.focus();
        ws.focusIdx = -1;
        return;
      }
      if (ws.opts.a11y && ws.fx.markFocused()) {
        const k = ws.focusables[ws.focusIdx].key;
        if (ev.key === "ArrowRight" || ev.key === "ArrowDown") {
          ws.fx.focusRoving(ws.focusIdx + 1);
          ev.preventDefault();
          return;
        }
        if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") {
          ws.fx.focusRoving(ws.focusIdx - 1);
          ev.preventDefault();
          return;
        }
        if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
          const series = ws.fx.swatchSeries(k);
          if (series != null && ws.fx.legendPolicy() !== "select") {
            ws.fx.legendToggle(series);
            ws.fx.announce(ws.fx.a11yLabel(k) + (ws.legendOff[series] ? ", hidden" : ", shown"));
          } else {
            if (ws.opts.select) ws.fx.toggleSelect(k);
            ws.fx.announce(ws.fx.a11yLabel(k) + (ws.selected[k] ? ", selected" : ", not selected"));
          }
          ev.preventDefault();
          return;
        }
      }
      if (!ws.opts.zoom || !ws.vb) return;
      if (ev.key === "0") {
        ws.fx.resetZoom();
        ev.preventDefault();
        return;
      }
      const dx = ws.vb.w * 0.12;
      const dy = ws.vb.h * 0.12;
      const cx = ws.vb.x + ws.vb.w / 2;
      const cy = ws.vb.y + ws.vb.h / 2;
      let handled = true;
      switch (ev.key) {
        case "ArrowLeft":
          ws.vb.x -= dx;
          break;
        case "ArrowRight":
          ws.vb.x += dx;
          break;
        case "ArrowUp":
          ws.vb.y -= dy;
          break;
        case "ArrowDown":
          ws.vb.y += dy;
          break;
        case "+":
        case "=": {
          const next = zoomViewBoxCapped(ws.vb, ws.vb0, 1.2, cx, cy, ws.opts.maxZoom);
          if (next === ws.vb) {
            ev.preventDefault();
            return;
          }
          ws.vb = next;
          break;
        }
        case "-":
        case "_":
          ws.vb = zoomViewBoxCapped(ws.vb, ws.vb0, 1 / 1.2, cx, cy, ws.opts.maxZoom);
          break;
        default:
          handled = false;
      }
      if (handled) {
        ws.fx.applyViewBox();
        ev.preventDefault();
      }
    }
    return { clearLasso, onHoverMove, onDown, onClick, onDblClick, onWheel, onKey };
  }

  // srcts/features/proxy.ts
  function proxyFeature(ws) {
    function proxyCall(method, args) {
      const keys = Array.isArray(args) ? args : args == null ? [] : [String(args)];
      switch (method) {
        case "select":
          ws.fx.setSelection(keys);
          break;
        case "clearSelection":
          ws.fx.clearSelection();
          break;
        case "filter":
          ws.fx.applyFilter(keys);
          break;
        case "clearFilter":
          ws.fx.applyFilter(null);
          break;
        case "zoom":
          proxyZoomToKeys(keys);
          break;
        case "resetZoom":
          ws.fx.resetZoom();
          break;
        default:
          break;
      }
    }
    function proxyZoomToKeys(keys) {
      if (!keys.length) {
        ws.fx.resetZoom();
        return;
      }
      const sel = {};
      for (let i = 0; i < keys.length; i++) sel[keys[i]] = true;
      const bb = unionBbox(ws.elements, sel);
      if (bb) ws.fx.zoomTo(bb);
    }
    return { proxyCall };
  }

  // srcts/features/raster.ts
  var ringClipSeq = 0;
  function rasterFeature(ws) {
    function ensureCanvas() {
      if (ws.canvasEl) return;
      ws.canvasEl = document.createElement("canvas");
      ws.canvasEl.className = "vellumwidget-canvas";
      ws.canvasEl.setAttribute("aria-hidden", "true");
      (ws.stage || ws.el).appendChild(ws.canvasEl);
      ws.ctx = typeof ws.canvasEl.getContext === "function" ? ws.canvasEl.getContext("2d") : null;
    }
    function clearPointData() {
      ws.ptCx = ws.ptCy = ws.ptRad = null;
      ws.ptRGB = null;
      ws.ptN = 0;
      ws.ptAllRound = false;
      hideCanvas();
      showMarksLayer(true);
    }
    function sampleBaseRaster(colors) {
      clearPointData();
      if (ws.dl) {
        drawPoints();
        return;
      }
      if (!ws.rasterMode || !ws.svgEl || !ws.vb0) return;
      const imgNode = ws.svgEl.querySelector("image.vellumwidget-marks") || ws.svgEl.querySelector("image");
      const href = imgNode && (imgNode.getAttribute("href") || imgNode.getAttribute("xlink:href"));
      if (!href) return;
      const off = document.createElement("canvas");
      const octx = typeof off.getContext === "function" ? off.getContext("2d") : null;
      if (!octx) return;
      const iw = Math.max(1, Math.round(ws.vb0.w));
      const ih = Math.max(1, Math.round(ws.vb0.h));
      const els = ws.elements;
      const v0 = ws.vb0;
      const img = new Image();
      img.onload = function() {
        if (els !== ws.elements || v0 !== ws.vb0) return;
        off.width = iw;
        off.height = ih;
        octx.drawImage(img, 0, 0, iw, ih);
        let data;
        try {
          data = octx.getImageData(0, 0, iw, ih).data;
        } catch (e) {
          return;
        }
        const cx = [], cy = [], rad = [], rgb = [];
        let allRound = true;
        const known = markColorTable(colors, els.length);
        for (let i = 0; i < els.length; i++) {
          const e = els[i];
          if (!hasBbox(e)) continue;
          const mx = (e.x0 + e.x1) / 2, my = (e.y0 + e.y1) / 2;
          const sx = Math.min(iw - 1, Math.max(0, Math.round(mx)));
          const sy = Math.min(ih - 1, Math.max(0, Math.round(my)));
          const o = (sy * iw + sx) * 4;
          if (data[o + 3] < 8) continue;
          if (!isRoundMark(e.mark)) allRound = false;
          cx.push(mx);
          cy.push(my);
          rad.push(Math.max(e.x1 - e.x0, e.y1 - e.y0) / 2 + 0.5);
          const c = known ? known.pal[known.idx[i]] : null;
          if (c) rgb.push(c[0], c[1], c[2], c[3]);
          else rgb.push(data[o], data[o + 1], data[o + 2], 255);
        }
        ws.ptN = cx.length;
        ws.ptCx = Float64Array.from(cx);
        ws.ptCy = Float64Array.from(cy);
        ws.ptRad = Float64Array.from(rad);
        ws.ptRGB = Uint8Array.from(rgb);
        ws.ptAllRound = allRound && cx.length > 0;
        drawPoints();
      };
      img.onerror = function() {
      };
      img.src = href;
    }
    function markColorTable(colors, n) {
      if (!colors || !colors.idx) return null;
      const idx = dlColumn(colors.idx);
      if (idx.length !== n) return null;
      const pal = [null];
      const src = asColumn(colors.pal);
      for (let k = 0; k < src.length; k++) pal.push(hexRGBA(String(src[k])));
      return { pal, idx };
    }
    function hexRGBA(s) {
      const h = /^#([0-9a-f]+)$/i.exec(s.trim());
      if (!h) return null;
      let v = h[1];
      if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
      if (v.length === 6) v += "ff";
      if (v.length !== 8) return null;
      const out = [0, 2, 4, 6].map(function(k) {
        return parseInt(v.slice(k, k + 2), 16);
      });
      return out.every(isFinite) ? out : null;
    }
    function drawPoints(stateOnly) {
      if (!ws.rasterMode || !ws.canvasEl || !ws.ctx || !ws.vb || !ws.vb0) return;
      if (ws.dl) {
        if (ws.markTier === "detail") {
          hideCanvas();
          showMarksLayer(false);
          return;
        }
        drawList(ws.dl, false, !!stateOnly);
        return;
      }
      const az = ws.axisZoomActive && ws.azPanels.length > 0;
      const zoomed = az ? ws.azPanels.some(function(a) {
        const t = ws.fx.azT(a);
        return t.sx > 1.0001 || t.sy > 1.0001;
      }) : isZoomedIn(ws.vb, ws.vb0);
      if (!zoomed || !ws.ptCx || !ws.ptCy || !ws.ptRad || !ws.ptRGB || !ws.ptN) {
        ws.canvasEl.style.display = "none";
        showMarksLayer(true);
        return;
      }
      const rect = (ws.svgEl || ws.el).getBoundingClientRect();
      const cw = Math.max(1, Math.round(rect.width || ws.vb0.w));
      const ch = Math.max(1, Math.round(rect.height || ws.vb0.h));
      const dpr = window.devicePixelRatio || 1;
      if (ws.canvasEl.width !== cw * dpr || ws.canvasEl.height !== ch * dpr) {
        ws.canvasEl.width = cw * dpr;
        ws.canvasEl.height = ch * dpr;
      }
      ws.canvasEl.style.width = cw + "px";
      ws.canvasEl.style.height = ch + "px";
      ws.canvasEl.style.display = "block";
      const ctx = ws.ctx;
      const W = ws.canvasEl.width, H = ws.canvasEl.height;
      ctx.clearRect(0, 0, W, H);
      const cx = ws.ptCx, cy = ws.ptCy, rad = ws.ptRad, rgb = ws.ptRGB, n = ws.ptN;
      const dot = function(px, py, r, i) {
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.75, r), 0, 6.283185307179586);
        const a = rgb[i * 4 + 3];
        ctx.fillStyle = a === 255 ? "rgb(" + rgb[i * 4] + "," + rgb[i * 4 + 1] + "," + rgb[i * 4 + 2] + ")" : "rgba(" + rgb[i * 4] + "," + rgb[i * 4 + 1] + "," + rgb[i * 4 + 2] + "," + a / 255 + ")";
        ctx.fill();
      };
      if (az) {
        showMarksLayer(!ws.ptAllRound);
        const view = ws.vb0;
        const base = Math.min(W / view.w, H / view.h);
        for (let k = 0; k < ws.azPanels.length; k++) {
          const a = ws.azPanels[k], p = a.p, t = ws.fx.azT(a);
          const c0 = userToCanvas(view, W, H, p.px0, p.py0), c1 = userToCanvas(view, W, H, p.px1, p.py1);
          const rs = ws.opts.zoomMarks === "scale" ? base * Math.min(t.sx, t.sy) : base;
          ctx.save();
          ctx.beginPath();
          ctx.rect(c0.px, c0.py, c1.px - c0.px, c1.py - c0.py);
          ctx.clip();
          for (let i = 0; i < n; i++) {
            const px = cx[i], py = cy[i];
            if (px < p.px0 || px > p.px1 || py < p.py0 || py > p.py1) continue;
            const bx = t.sx * px + t.tx, by = t.sy * py + t.ty;
            if (bx < p.px0 || bx > p.px1 || by < p.py0 || by > p.py1) continue;
            const q = userToCanvas(view, W, H, bx, by);
            dot(q.px, q.py, rad[i] * rs, i);
          }
          ctx.restore();
        }
        return;
      }
      const rScale = Math.min(W / ws.vb.w, H / ws.vb.h);
      const x0 = ws.vb.x, y0 = ws.vb.y, x1 = ws.vb.x + ws.vb.w, y1 = ws.vb.y + ws.vb.h;
      for (let i = 0; i < n; i++) {
        const px = cx[i], py = cy[i];
        if (px < x0 || px > x1 || py < y0 || py > y1) continue;
        const q = userToCanvas(ws.vb, W, H, px, py);
        dot(q.px, q.py, rad[i] * rScale, i);
      }
    }
    function fitCanvas() {
      const c = ws.canvasEl;
      const rect = (ws.svgEl || ws.el).getBoundingClientRect();
      const cw = Math.max(1, Math.round(rect.width || ws.vb0.w));
      const ch = Math.max(1, Math.round(rect.height || ws.vb0.h));
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== cw * dpr || c.height !== ch * dpr) {
        c.width = cw * dpr;
        c.height = ch * dpr;
      }
      c.style.width = cw + "px";
      c.style.height = ch + "px";
      c.style.display = "block";
      return [c.width, c.height];
    }
    let settleTimer = 0;
    function drawList(dl, settled, stateOnly) {
      const ctx = ws.ctx, vb = ws.vb, vb0 = ws.vb0;
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = 0;
      }
      const az = ws.axisZoomActive && ws.azPanels.length > 0;
      const zoomed = az ? ws.azPanels.some(function(a) {
        const t = ws.fx.azT(a);
        return t.sx > 1.0001 || t.sy > 1.0001;
      }) : isZoomedIn(vb, vb0);
      const styled = ws.msActive && !!ws.msFlags && !!ws.msColor;
      const blending = dl.exact && !!dl.runImgs && dl.blendRuns;
      const raising = dl.exact && !!ws.fx.raiseOrder(dl);
      if (!(zoomed || styled && dl.exact || blending || raising) || !dl.n) {
        hideCanvas();
        showMarksLayer(true);
        return;
      }
      const wasShown = ws.canvasEl.style.display === "block";
      const [W, H] = fitCanvas();
      const L = listLayout(dl, W, H);
      if (!settled && dl.n > LIVE_DRAW_MAX) {
        let vis = 0;
        const np = dl.panels.length;
        for (let i = 0; i < dl.n && vis <= LIVE_DRAW_MAX; i++) {
          const A = L.aff[dl.panel[i] <= np ? dl.panel[i] : 0], pc = L.pclip[dl.panel[i] <= np ? dl.panel[i] : 0];
          const x = A.ax * (dl.bx0[i] + dl.bx1[i]) / 2 + A.bx, y = A.ay * (dl.by0[i] + dl.by1[i]) / 2 + A.by;
          if (x < 0 || y < 0 || x > W || y > H) continue;
          if (pc && (x < pc[0] || x > pc[2] || y < pc[1] || y > pc[3])) continue;
          vis++;
        }
        if (vis > LIVE_DRAW_MAX) {
          if (!(stateOnly && wasShown)) {
            hideCanvas();
            showMarksLayer(true);
          }
          settleTimer = window.setTimeout(function() {
            settleTimer = 0;
            if (ws.dl === dl) {
              fitCanvas();
              drawList(dl, true);
            }
          }, SETTLE_MS);
          return;
        }
      }
      showMarksLayer(!dl.exact);
      let used = 0;
      const sink = blending ? {
        next: function(mode) {
          const c = blendLayer(used);
          if (!c) return null;
          const x = typeof c.getContext === "function" ? c.getContext("2d") : null;
          if (!x) return null;
          used++;
          if (c.width !== W || c.height !== H) {
            c.width = W;
            c.height = H;
          }
          c.style.width = ws.canvasEl.style.width;
          c.style.height = ws.canvasEl.style.height;
          c.style.mixBlendMode = mode === "normal" ? "" : mode;
          c.style.display = "block";
          x.setTransform(1, 0, 0, 1, 0, 0);
          x.clearRect(0, 0, W, H);
          return x;
        }
      } : void 0;
      paintList(ctx, dl, W, H, L, styled, sink);
      hideLayers(used);
    }
    const layers = [];
    function blendLayer(k) {
      const base = ws.canvasEl;
      if (!base || !base.parentNode) return null;
      while (layers.length <= k) {
        const c = document.createElement("canvas");
        c.className = "vellumwidget-canvas-layer";
        c.setAttribute("aria-hidden", "true");
        const prev = layers.length ? layers[layers.length - 1] : base;
        base.parentNode.insertBefore(c, prev.nextSibling);
        layers.push(c);
      }
      return layers[k];
    }
    function hideLayers(keep) {
      for (let k = keep; k < layers.length; k++) {
        layers[k].style.display = "none";
        layers[k].style.mixBlendMode = "";
      }
      const stage = ws.stage || ws.el;
      if (stage && stage.classList) stage.classList.toggle("vellumwidget-blend-iso", keep > 0);
    }
    function hideCanvas() {
      if (ws.canvasEl) ws.canvasEl.style.display = "none";
      hideLayers(0);
    }
    function listLayout(dl, W, H) {
      const vb = ws.vb, vb0 = ws.vb0;
      const az = ws.axisZoomActive && ws.azPanels.length > 0;
      const frame = az ? vb0 : vb;
      const q0 = userToCanvas(frame, W, H, 0, 0), q1 = userToCanvas(frame, W, H, 1, 1);
      const kx = q1.px - q0.px, ky = q1.py - q0.py;
      const base = Math.min(W / vb0.w, H / vb0.h);
      const scaleMarks = ws.opts.zoomMarks === "scale";
      const np = dl.panels.length;
      const aff = [], gs = [], pclip = [], cst = [];
      const ident = { ax: kx, bx: q0.px, ay: ky, by: q0.py };
      for (let p = 0; p <= np; p++) {
        let A = ident, g = az && !scaleMarks ? base : kx, c = null;
        const a = az && p > 0 ? ws.azPanels.filter((q) => q.p.name === dl.panels[p - 1])[0] : null;
        if (a) {
          const t = ws.fx.azT(a);
          A = { ax: kx * t.sx, bx: kx * t.tx + q0.px, ay: ky * t.sy, by: ky * t.ty + q0.py };
          g = scaleMarks ? base * Math.min(t.sx, t.sy) : base;
          c = [kx * a.p.px0 + q0.px, ky * a.p.py0 + q0.py, kx * a.p.px1 + q0.px, ky * a.p.py1 + q0.py];
        }
        aff.push(A);
        gs.push(g);
        pclip.push(c);
        let k = false;
        if (a && !scaleMarks) {
          const t = ws.fx.azT(a);
          k = Math.abs(t.sx - 1) > 1e-9 || Math.abs(t.sy - 1) > 1e-9;
        }
        cst.push(k);
      }
      return { aff, gs, pclip, base: az ? base : kx, cst, kx, ky };
    }
    function paintList(ctx0, dl, W, H, L, styled, sink) {
      const aff = L.aff, gs = L.gs, pclip = L.pclip, base = L.base, np = dl.panels.length;
      let ctx = ctx0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const flags = styled ? ws.msFlags : null, recol = styled ? ws.msColor : null, pal = ws.msPalette;
      const dimA = ws.msDimAlpha, am = styled ? ws.msAlpha : null, apal = ws.msAlphaPal;
      let tgt = ctx;
      const open_ = [];
      let curFill = null, curStroke = null, curGrad = 0;
      let curState = -1, curPaint = -1, curOv = 0, curAlpha = 1, open = false, batch = false;
      let curA = aff[0];
      const flush = function() {
        if (!open) return;
        const pt = dl.paints[curPaint];
        if (curGrad > 0) fillGradient(tgt, dl.gradients[curGrad - 1], curA, "nonzero");
        else if (curFill) {
          tgt.fillStyle = curFill;
          tgt.fill();
        }
        if (curStroke && pt.width > 0) tgt.stroke();
        open = false;
      };
      const setPaint = function(pi, ov) {
        const pt = dl.paints[pi];
        tgt.lineWidth = pt.width * base;
        tgt.setLineDash(pt.dash ? pt.dash.map((d) => d * base) : []);
        tgt.lineCap = pt.cap;
        tgt.lineJoin = pt.join;
        const oc = ov ? pal[ov - 1] : null;
        curGrad = pt.grad > 0 && !oc ? pt.grad : 0;
        curFill = pt.grad > 0 ? oc || null : pt.fill && oc ? withAlphaOf(oc, pt.fill) : pt.fill;
        curStroke = pt.stroke && oc ? withAlphaOf(oc, pt.stroke) : pt.stroke;
        if (curStroke) tgt.strokeStyle = curStroke;
      };
      const closeTo = function(keep) {
        while (open_.length > keep) {
          const lay = open_.pop();
          const dst = open_.length ? open_[open_.length - 1].x : ctx;
          dst.save();
          dst.setTransform(1, 0, 0, 1, 0, 0);
          dst.globalAlpha = dl.groups[lay.g - 1].alpha;
          dst.drawImage(lay.c, 0, 0);
          dst.restore();
          layerPool.push(lay.c);
        }
      };
      const enterGroup = function(g) {
        const want = [];
        for (let q = g; q > 0 && want.length < 64; q = dl.groups[q - 1] ? dl.groups[q - 1].parent : 0) want.unshift(q);
        let k = 0;
        while (k < open_.length && k < want.length && open_[k].g === want[k]) k++;
        if (k === open_.length && k === want.length) return;
        flush();
        tgt.restore();
        closeTo(k);
        while (open_.length < want.length) {
          const c = layerPool.pop() || document.createElement("canvas");
          if (c.width !== W || c.height !== H) {
            c.width = W;
            c.height = H;
          }
          const x = typeof c.getContext === "function" ? c.getContext("2d") : null;
          if (!x) break;
          x.setTransform(1, 0, 0, 1, 0, 0);
          x.clearRect(0, 0, W, H);
          open_.push({ g: want[open_.length], c, x });
        }
        tgt = open_.length ? open_[open_.length - 1].x : ctx;
        tgt.save();
        curState = -1;
        curPaint = -1;
        curAlpha = 1;
        tgt.globalAlpha = 1;
      };
      const runImgs = dl.runImgs;
      const drawnRun = [];
      const runPanels = [];
      const runLoose = [];
      const anyPclip = pclip.some((c) => !!c);
      if (runImgs && anyPclip) {
        for (let i = 0; i < dl.n; i++) {
          const r = dl.run[i];
          if (!(r > 0)) continue;
          const p = dl.panel[i] <= np ? dl.panel[i] : 0;
          if (pclip[p]) (runPanels[r] = runPanels[r] || {})[p] = true;
          else (runLoose[r] = runLoose[r] || []).push(dl.bx0[i], dl.by0[i], dl.bx1[i], dl.by1[i]);
        }
      }
      const ownClip = function(p) {
        const pc = pclip[p], A = aff[p];
        const nm = dl.panels[p - 1];
        const pn = ws.panels.filter((q) => q.name === nm)[0];
        if (!pc || !pn) return pc;
        const x0 = Math.max(pc[0], Math.min(A.ax * pn.px0 + A.bx, A.ax * pn.px1 + A.bx));
        const x1 = Math.min(pc[2], Math.max(A.ax * pn.px0 + A.bx, A.ax * pn.px1 + A.bx));
        const y0 = Math.max(pc[1], Math.min(A.ay * pn.py0 + A.by, A.ay * pn.py1 + A.by));
        const y1 = Math.min(pc[3], Math.max(A.ay * pn.py0 + A.by, A.ay * pn.py1 + A.by));
        return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
      };
      let op = "";
      const paintRun = function(r, A, clip, patch) {
        const png = dl.runImgs[r - 1];
        if (!png) return;
        if (!patch || !patch.cut.length) {
          ctx.save();
          clip(ctx);
          ctx.setTransform(A.ax, 0, 0, A.ay, A.bx, A.by);
          ctx.drawImage(png, 0, 0, dl.runW, dl.runH);
          ctx.restore();
          return;
        }
        const cut = patch.cut;
        const lc = layerPool.pop() || document.createElement("canvas");
        if (lc.width !== W || lc.height !== H) {
          lc.width = W;
          lc.height = H;
        }
        const x = typeof lc.getContext === "function" ? lc.getContext("2d") : null;
        if (x) {
          x.setTransform(1, 0, 0, 1, 0, 0);
          x.clearRect(0, 0, W, H);
          x.setTransform(A.ax, 0, 0, A.ay, A.bx, A.by);
          x.drawImage(png, 0, 0, dl.runW, dl.runH);
          for (let q = 0; q < cut.length; q += 4) x.clearRect(cut[q], cut[q + 1], cut[q + 2] - cut[q], cut[q + 3] - cut[q + 1]);
          ctx.save();
          clip(ctx);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(lc, 0, 0);
          ctx.restore();
        }
        layerPool.push(lc);
        if (patch.fill) {
          ctx.save();
          clip(ctx);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.beginPath();
          for (let q = 0; q < cut.length; q += 4) {
            ctx.rect(A.ax * cut[q] + A.bx, A.ay * cut[q + 1] + A.by, A.ax * (cut[q + 2] - cut[q]), A.ay * (cut[q + 3] - cut[q + 1]));
          }
          ctx.clip();
          ctx.setTransform(A.ax, 0, 0, A.ay, A.bx, A.by);
          ctx.drawImage(patch.fill.img, 0, 0, dl.runW, dl.runH);
          ctx.restore();
        }
      };
      const drawSplit = function(r, sp, p, c) {
        const A = aff[p];
        const clipTo = function(x) {
          x.setTransform(1, 0, 0, 1, 0, 0);
          x.beginPath();
          x.rect(c[0], c[1], c[2] - c[0], c[3] - c[1]);
          x.clip();
          if (op) x.globalCompositeOperation = op;
        };
        if (sp.rest) paintRun(r, A, clipTo, sp.rest);
        ctx.save();
        clipTo(ctx);
        const kx = L.kx, ky = L.ky;
        for (let q = 0; q < sp.marks.length; q++) {
          const m = sp.marks[q];
          if (m.p !== p || !m.src) continue;
          const dx = A.ax * m.ax + A.bx + kx * (m.x0 - m.ax), dy = A.ay * m.ay + A.by + ky * (m.y0 - m.ay);
          const dw = kx * (m.x1 - m.x0), dh = ky * (m.y1 - m.y0);
          if (dx > c[2] || dy > c[3] || dx + dw < c[0] || dy + dh < c[1]) continue;
          ctx.drawImage(m.src, m.sx * m.ks, m.sy * m.ks, (m.x1 - m.x0) * m.ks, (m.y1 - m.y0) * m.ks, dx, dy, dw, dh);
        }
        ctx.restore();
      };
      const drawRun = function(r) {
        const patch = ws.fx.runPatch(r);
        const one = function(A, pc, boxes) {
          paintRun(r, A, function(x) {
            x.setTransform(1, 0, 0, 1, 0, 0);
            if (pc) {
              x.beginPath();
              x.rect(pc[0], pc[1], pc[2] - pc[0], pc[3] - pc[1]);
              x.clip();
            }
            if (boxes) {
              x.beginPath();
              for (let q = 0; q < boxes.length; q += 4) {
                const x0 = A.ax * (boxes[q] - RUN_BOX_PAD) + A.bx, y0 = A.ay * (boxes[q + 1] - RUN_BOX_PAD) + A.by;
                x.rect(x0, y0, A.ax * (boxes[q + 2] - boxes[q] + 2 * RUN_BOX_PAD), A.ay * (boxes[q + 3] - boxes[q + 1] + 2 * RUN_BOX_PAD));
              }
              x.clip();
            }
            if (op) x.globalCompositeOperation = op;
          }, patch);
        };
        if (!anyPclip) {
          one(aff[0], null);
          return;
        }
        const hosted = runPanels[r];
        if (hosted) {
          for (let p = 1; p <= np; p++) {
            if (!hosted[p]) continue;
            const c = ownClip(p);
            if (!c) continue;
            const sp = L.cst[p] ? ws.fx.runSplit(r) : null;
            if (sp) drawSplit(r, sp, p, c);
            else one(aff[p], c);
          }
        }
        if (runLoose[r]) one(aff[0], null, runLoose[r]);
      };
      let curGroup = 0;
      tgt.save();
      const ord = ws.fx.raiseOrder(dl);
      for (let q = 0; q < dl.n; q++) {
        const i = ord ? ord[q] : q;
        if (runImgs && dl.run[i] > 0) {
          const r = dl.run[i];
          if (!drawnRun[r]) {
            drawnRun[r] = true;
            if (curGroup !== 0) {
              enterGroup(0);
              curGroup = 0;
            }
            flush();
            tgt.restore();
            const mode = dl.runBlend ? dl.runBlend[r - 1] : "normal";
            const lay = mode !== "normal" && sink ? sink.next(mode) : null;
            if (lay) {
              ctx = lay;
              drawRun(r);
              ctx = sink.next("normal") || lay;
              tgt = ctx;
            } else {
              op = mode !== "normal" ? mode : "";
              drawRun(r);
              op = "";
            }
            tgt.save();
            curState = -1;
            curPaint = -1;
            curAlpha = 1;
            tgt.globalAlpha = 1;
          }
          continue;
        }
        if (dl.flags[i]) continue;
        let ov = 0, alpha = 1;
        if (flags) {
          const k = dl.key[i], f = flags[k];
          if (f & MS_HIDDEN) continue;
          if (f & MS_DIM) alpha = am && am[k] ? apal[am[k] - 1] : dimA;
          else if (f & MS_MUTED) alpha = MUTED_ALPHA;
          ov = recol[k];
        }
        const p = dl.panel[i] <= np ? dl.panel[i] : 0;
        const A = aff[p];
        let x0 = A.ax * dl.bx0[i] + A.bx, x1 = A.ax * dl.bx1[i] + A.bx;
        let y0 = A.ay * dl.by0[i] + A.by, y1 = A.ay * dl.by1[i] + A.by;
        const kd = dl.kind[i];
        if (kd === DL_POINT) {
          const j = dl.row[i], cx = A.ax * dl.cx[j] + A.bx, cy = A.ay * dl.cy[j] + A.by, rr = dl.r[j] * gs[p];
          x0 = cx - rr;
          x1 = cx + rr;
          y0 = cy - rr;
          y1 = cy + rr;
        }
        const pc = pclip[p];
        if (x1 < 0 || y1 < 0 || x0 > W || y0 > H) continue;
        if (pc && (x1 < pc[0] || x0 > pc[2] || y1 < pc[1] || y0 > pc[3])) continue;
        if (dl.group[i] !== curGroup) {
          enterGroup(dl.group[i]);
          curGroup = dl.group[i];
        }
        const st = p * 65536 + dl.clip[i];
        if (st !== curState) {
          flush();
          tgt.restore();
          tgt.save();
          if (pc) {
            tgt.beginPath();
            tgt.rect(pc[0], pc[1], pc[2] - pc[0], pc[3] - pc[1]);
            tgt.clip();
          }
          const cr = dl.clip[i] > 0 ? dl.clips[dl.clip[i] - 1] : null;
          if (cr) {
            const cx0 = A.ax * cr.x0 + A.bx, cy0 = A.ay * cr.y0 + A.by;
            tgt.beginPath();
            tgt.rect(cx0, cy0, A.ax * (cr.x1 - cr.x0), A.ay * (cr.y1 - cr.y0));
            tgt.clip();
            for (let q2 = 0; q2 < cr.pn; q2++) {
              tgt.beginPath();
              traceClipPath(tgt, dl, cr.ps + q2, A);
              tgt.clip(dl.cpEvenodd[cr.ps + q2] === 1 ? "evenodd" : "nonzero");
            }
          }
          curState = st;
          curPaint = -1;
          curAlpha = 1;
          tgt.globalAlpha = 1;
        }
        const pi = dl.paint[i], pt = dl.paints[pi];
        const canBatch = kd !== 2 && !pt.grad && pt.opaque && alpha === 1 && (ov ? isOpaqueHex(pal[ov - 1]) : !pt.fill || !pt.stroke || pt.fill === pt.stroke);
        if (!(open && batch && canBatch && pi === curPaint && ov === curOv)) {
          flush();
          if (pi !== curPaint || ov !== curOv) {
            setPaint(pi, ov);
            curPaint = pi;
            curOv = ov;
          }
          if (alpha !== curAlpha) {
            tgt.globalAlpha = alpha;
            curAlpha = alpha;
          }
          tgt.beginPath();
          open = true;
          batch = canBatch;
        }
        curA = A;
        if (kd === DL_POINT) {
          const j = dl.row[i], sh = dl.shape[j];
          tracePoint(tgt, sh, A.ax * dl.cx[j] + A.bx, A.ay * dl.cy[j] + A.by, dl.r[j] * gs[p]);
        } else if (kd === DL_RECT) {
          traceShape(tgt, dl, i, A);
        } else {
          traceShape(tgt, dl, i, A);
          if (dl.closed[dl.row[i]] === 1) {
            const rule = dl.evenodd[dl.row[i]] === 1 ? "evenodd" : "nonzero";
            if (curGrad > 0) fillGradient(tgt, dl.gradients[curGrad - 1], A, rule);
            else if (curFill) {
              tgt.fillStyle = curFill;
              tgt.fill(rule);
            }
          }
          if (curStroke && pt.width > 0) tgt.stroke();
          open = false;
        }
        if (!batch) flush();
      }
      flush();
      tgt.restore();
      if (open_.length) closeTo(0);
      ctx.globalAlpha = 1;
    }
    const layerPool = [];
    function exportMarksImage(scale) {
      const dl = ws.dl;
      if (!ws.rasterMode || !dl || !dl.exact || !ws.vb || !ws.vb0) return null;
      const vb0 = ws.vb0;
      const az = ws.axisZoomActive && ws.azPanels.length > 0;
      const frame = az ? vb0 : ws.vb;
      let s = Math.max(2, scale || 1);
      const MAX_PX = 32e6;
      if (vb0.w * vb0.h * s * s > MAX_PX) s = Math.sqrt(MAX_PX / (vb0.w * vb0.h));
      const W = Math.max(1, Math.round(vb0.w * s)), H = Math.max(1, Math.round(vb0.h * s));
      const c = document.createElement("canvas");
      const ctx = typeof c.getContext === "function" ? c.getContext("2d") : null;
      if (!ctx) return null;
      c.width = W;
      c.height = H;
      const styled = ws.msActive && !!ws.msFlags && !!ws.msColor;
      const extra = [];
      let failed = false;
      const sink = dl.blendRuns && dl.runImgs ? {
        next: function(mode) {
          const lc = document.createElement("canvas");
          const lx = typeof lc.getContext === "function" ? lc.getContext("2d") : null;
          if (!lx) {
            failed = true;
            return null;
          }
          lc.width = W;
          lc.height = H;
          lx.setTransform(1, 0, 0, 1, 0, 0);
          lx.clearRect(0, 0, W, H);
          extra.push({ c: lc, blend: mode });
          return lx;
        }
      } : void 0;
      if (dl.n) paintList(ctx, dl, W, H, listLayout(dl, W, H), styled, sink);
      if (failed) return null;
      const url = function(cv) {
        let h = "";
        try {
          h = cv.toDataURL("image/png");
        } catch (e) {
          return null;
        }
        return /^data:image\/png/.test(h || "") ? h : null;
      };
      const href = url(c);
      if (!href) return null;
      const out = { href, x: frame.x, y: frame.y, w: frame.w, h: frame.h };
      if (extra.length) {
        out.layers = [];
        for (let k = 0; k < extra.length; k++) {
          const h = url(extra[k].c);
          if (!h) return null;
          out.layers.push({ href: h, blend: extra[k].blend });
        }
      }
      return out;
    }
    function withAlphaOf(c, ref) {
      if (/^#[0-9a-fA-F]{6}$/.test(c) && /^#[0-9a-fA-F]{8}$/.test(ref)) {
        const a = ref.slice(7, 9).toLowerCase();
        return a === "ff" ? c : c + a;
      }
      return c;
    }
    function isOpaqueHex(c) {
      return /^#[0-9a-fA-F]{6}$/.test(c) || /^#[0-9a-fA-F]{8}$/.test(c) && /ff$/i.test(c);
    }
    function showMarksLayer(on) {
      if (!ws.svgEl || !ws.marksLayer) return;
      ws.svgEl.classList.toggle("vellumwidget-marks-off", !on);
      const drawn = ws.svgEl.querySelectorAll("use.vellumwidget-marks, svg > image.vellumwidget-marks");
      for (let i = 0; i < drawn.length; i++) drawn[i].style.visibility = on ? "" : "hidden";
    }
    function ringFor(k, cls) {
      const m = ws.meta[k];
      if (!m || !hasBbox(m)) return null;
      const cb = ws.fx.constBox(m);
      const b = cb || m;
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      const r = Math.max(m.x1 - m.x0, m.y1 - m.y0) / 2 + 2;
      let c;
      if (cb) {
        c = document.createElementNS(SVGNS, "ellipse");
        c.setAttribute("rx", String(r / cb.sx));
        c.setAttribute("ry", String(r / cb.sy));
      } else {
        c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("r", String(r));
      }
      c.setAttribute("cx", String(cx));
      c.setAttribute("cy", String(cy));
      c.setAttribute("class", cls);
      c.setAttribute("vector-effect", "non-scaling-stroke");
      return c;
    }
    function ringClip(g, k, made) {
      if (!ws.axisZoomActive) return null;
      const m = ws.meta[k];
      if (!m || !hasBbox(m)) return null;
      const a = ws.fx.azNearest((m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2);
      if (!a) return null;
      const i = ws.azPanels.indexOf(a);
      if (made[i]) return made[i];
      const t = ws.fx.azT(a), p = a.p;
      if (!(t.sx > 0) || !(t.sy > 0)) return null;
      const id = "vw-ring-" + ++ringClipSeq;
      const cp = document.createElementNS(SVGNS, "clipPath");
      cp.setAttribute("id", id);
      cp.setAttribute("clipPathUnits", "userSpaceOnUse");
      const rc = document.createElementNS(SVGNS, "rect");
      rc.setAttribute("x", String((p.px0 - t.tx) / t.sx));
      rc.setAttribute("y", String((p.py0 - t.ty) / t.sy));
      rc.setAttribute("width", String((p.px1 - p.px0) / t.sx));
      rc.setAttribute("height", String((p.py1 - p.py0) / t.sy));
      cp.appendChild(rc);
      g.appendChild(cp);
      return made[i] = "url(#" + id + ")";
    }
    function drawRings(g, keys, cls) {
      const made = {};
      for (let i = 0; i < keys.length; i++) {
        const c = ringFor(keys[i], cls);
        if (!c) continue;
        const cl = ringClip(g, keys[i], made);
        if (cl) c.setAttribute("clip-path", cl);
        g.appendChild(ws.fx.azOverlayWrap(c, keys[i]));
      }
    }
    function clearGroup(g) {
      if (g) while (g.firstChild) g.removeChild(g.firstChild);
    }
    function drawSelFeedback() {
      clearGroup(ws.selGroup);
      if (!ws.selGroup) return;
      const keys = ws.fx.selectedKeys();
      if (keys.length > OVERLAY_MARK_CAP) return;
      drawRings(ws.selGroup, keys, "vellumwidget-fb-sel");
    }
    function drawHovFeedback(keys) {
      clearGroup(ws.hovGroup);
      if (!ws.hovGroup) return;
      drawRings(ws.hovGroup, keys, "vellumwidget-fb-hov");
    }
    function setHoverKeys(keys) {
      ws.hoverSig = "";
      if (!ws.opts.hover) return;
      ws.hovering = true;
      if (ws.fx.ringMode()) {
        drawHovFeedback(keys);
        if (ws.dl && hoverDriven()) {
          ws.lastHoverKeys = keys;
          ws.fx.reevaluateInteractions();
        }
        return;
      }
      ws.lastHoverKeys = keys;
      ws.fx.clearClass("vellumwidget-hl");
      ws.fx.addClassForKeys(keys, "vellumwidget-hl");
      ws.fx.reevaluateInteractions();
      if (ws.largeDim) ws.fx.showHighlightOverlay(keys);
      else ws.el.classList.add("vellumwidget-hovering");
    }
    function hoverDriven() {
      const ix = ws.interactions;
      if (!ix || !ix.selections) return false;
      const used = {};
      (ix.conditions || []).forEach((c) => used[c.selection] = true);
      (ix.filters || []).forEach((f) => used[f.selection] = true);
      return ix.selections.some((s) => s.on === "hover" && used[s.name]);
    }
    function setHover(k) {
      setHoverKeys(ws.fx.linkedKeys(k));
    }
    return { ensureCanvas, clearPointData, sampleBaseRaster, drawPoints, clearGroup, drawSelFeedback, setHoverKeys, setHover, showMarksLayer, exportMarksImage, hideCanvas };
  }

  // srcts/ink.ts
  function parseColor(s) {
    if (!s) return null;
    const t = s.trim().toLowerCase();
    if (t === "white") return [255, 255, 255, 1];
    if (t === "black") return [0, 0, 0, 1];
    let m = /^#([0-9a-f]{3})$/.exec(t);
    if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16)).concat(1);
    m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(t);
    if (m) {
      const v = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
      return v.concat(m[2] ? parseInt(m[2], 16) / 255 : 1);
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(t);
    if (m) {
      let a = 1;
      if (m[4] != null) a = /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      const v = [+m[1], +m[2], +m[3], a];
      return v.every(isFinite) ? v : null;
    }
    return null;
  }
  function luminance(c) {
    const lin = c.slice(0, 3).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }
  function isDarkBg(c) {
    return luminance(c) < 0.25;
  }
  function opaqueFill(n) {
    if (!n) return null;
    const c = parseColor(n.getAttribute("fill"));
    if (!c || c[3] < 0.5) return null;
    const fo = parseFloat(n.getAttribute("fill-opacity") || "1");
    if (isFinite(fo) && fo < 0.5) return null;
    return c;
  }
  function sceneBackgrounds(svg) {
    let panel = opaqueFill(svg.querySelector("[data-vw-panel-bg]"));
    if (!panel) {
      const pan = svg.querySelector("[data-vellum-pan]");
      const first = pan ? pan.firstElementChild : null;
      if (first && !first.getAttribute("role") && /^(path|rect)$/i.test(first.tagName)) panel = opaqueFill(first);
    }
    let plot = opaqueFill(svg.querySelector('[data-vellum-panel="plot-background"] path, [data-vellum-panel="plot-background"] rect'));
    if (!plot) {
      for (let i = 0; i < svg.children.length && !plot; i++) {
        const c = svg.children[i];
        if (c.tagName.toLowerCase() === "rect") plot = opaqueFill(c);
      }
    }
    return { panel, plot };
  }

  // srcts/shiny.ts
  function dispatchProxyCall(msg, findInstance) {
    if (!msg || msg.id == null) return;
    const inst = findInstance(msg.id);
    if (inst && typeof inst._call === "function") inst._call(msg.method, msg.args);
  }
  function cssEscape2(value) {
    const C = typeof window !== "undefined" ? window.CSS : void 0;
    if (C && typeof C.escape === "function") return C.escape(value);
    return cssEscapePolyfill(value);
  }
  function cssEscapePolyfill(value) {
    const s = String(value);
    const n = s.length;
    let out = "";
    const first = n ? s.charCodeAt(0) : 0;
    for (let i = 0; i < n; i++) {
      const c = s.charCodeAt(i);
      if (c === 0) {
        out += "\uFFFD";
        continue;
      }
      if (c >= 1 && c <= 31 || c === 127 || i === 0 && c >= 48 && c <= 57 || i === 1 && c >= 48 && c <= 57 && first === 45) {
        out += "\\" + c.toString(16) + " ";
        continue;
      }
      if (i === 0 && n === 1 && c === 45) {
        out += "\\" + s.charAt(i);
        continue;
      }
      if (c >= 128 || c === 45 || c === 95 || c >= 48 && c <= 57 || c >= 65 && c <= 90 || c >= 97 && c <= 122) {
        out += s.charAt(i);
        continue;
      }
      out += "\\" + s.charAt(i);
    }
    return out;
  }
  function idSelector(id) {
    return "#" + cssEscape2(String(id));
  }
  function findWidgetById(id) {
    return HTMLWidgets.find ? HTMLWidgets.find(idSelector(id)) : null;
  }
  var proxyHandlerRegistered = false;
  function registerProxyHandler() {
    if (proxyHandlerRegistered) return;
    const sh = window.Shiny;
    if (!sh || typeof sh.addCustomMessageHandler !== "function") return;
    proxyHandlerRegistered = true;
    sh.addCustomMessageHandler("vellumwidget-calls", function(msg) {
      dispatchProxyCall(msg, findWidgetById);
    });
  }

  // srcts/features/render.ts
  var marksSeq = 0;
  var aboveSeq = 0;
  var clipSeq = 0;
  function renderFeature(ws) {
    let clipSvg = null;
    let clipMade = {};
    function panelClip(name) {
      if (!ws.svgEl) return null;
      if (clipSvg !== ws.svgEl) {
        clipSvg = ws.svgEl;
        clipMade = {};
      }
      if (clipMade[name]) return clipMade[name];
      const pan = ws.svgEl.querySelector('[data-vellum-pan="' + cssEscape(name) + '"]');
      if (!pan) return null;
      for (let up = pan.parentNode; up && up !== ws.svgEl; up = up.parentNode) {
        if (!up.hasAttribute || !up.hasAttribute("data-vellum-panel")) continue;
        const c = up.getAttribute("clip-path");
        if (c) return c;
        break;
      }
      const p = ws.panels.filter(function(q) {
        return q.name === name;
      })[0];
      if (!p || !(p.px1 > p.px0) || !(p.py1 > p.py0)) return null;
      let defs = ws.svgEl.querySelector("defs.vellumwidget-clip-defs");
      if (!defs) {
        defs = document.createElementNS(SVGNS, "defs");
        defs.setAttribute("class", "vellumwidget-clip-defs");
        ws.svgEl.insertBefore(defs, ws.svgEl.firstChild);
      }
      const id = "vw-own-" + ++clipSeq;
      const cp = document.createElementNS(SVGNS, "clipPath");
      cp.setAttribute("id", id);
      cp.setAttribute("clipPathUnits", "userSpaceOnUse");
      const rc = document.createElementNS(SVGNS, "rect");
      rc.setAttribute("x", String(p.px0));
      rc.setAttribute("y", String(p.py0));
      rc.setAttribute("width", String(p.px1 - p.px0));
      rc.setAttribute("height", String(p.py1 - p.py0));
      cp.appendChild(rc);
      defs.appendChild(cp);
      return clipMade[name] = "url(#" + id + ")";
    }
    function placeAbove(src) {
      if (!ws.stage) return null;
      const pre = "vw-above" + ++aboveSeq + "-";
      const fixed = src.replace(/<\?xml[^>]*\?>/, "").replace(/(\s)id="([^"]+)"/g, '$1id="' + pre + '$2"').replace(/url\(#([^)]+)\)/g, "url(#" + pre + "$1)").replace(/(\s(?:xlink:)?href)="#([^"]+)"/g, '$1="#' + pre + '$2"');
      const tmp = document.createElement("div");
      tmp.innerHTML = fixed;
      const svg = tmp.querySelector("svg");
      if (!svg) return null;
      const meta = svg.querySelectorAll("title, desc");
      for (let i = 0; i < meta.length; i++) meta[i].remove();
      svg.removeAttribute("role");
      svg.removeAttribute("aria-labelledby");
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("class", "vellumwidget-above-layer");
      const pans = svg.querySelectorAll("[data-vellum-pan][clip-path]");
      for (let i = 0; i < pans.length; i++) {
        const up = pans[i].parentNode;
        if (up && up.hasAttribute("data-vellum-panel") && !up.hasAttribute("clip-path")) {
          up.setAttribute("clip-path", pans[i].getAttribute("clip-path") || "");
          pans[i].removeAttribute("clip-path");
        }
      }
      if (ws.svgEl) svg.setAttribute("viewBox", ws.svgEl.getAttribute("viewBox") || "");
      ws.stage.appendChild(svg);
      return svg;
    }
    function placeMarks(svg, m) {
      const img = document.createElementNS(SVGNS, "image");
      img.setAttribute("class", "vellumwidget-marks");
      img.setAttribute("x", "0");
      img.setAttribute("y", "0");
      img.setAttribute("width", String(m.width));
      img.setAttribute("height", String(m.height));
      img.setAttribute("preserveAspectRatio", "none");
      img.setAttribute("href", m.href);
      const names = asColumn(m.panels);
      const pans = [];
      for (let i = 0; i < names.length; i++) {
        const g = svg.querySelector('[data-vellum-pan="' + cssEscape(names[i]) + '"]');
        if (!g) {
          pans.length = 0;
          break;
        }
        pans.push(g);
      }
      if (!pans.length) {
        svg.appendChild(img);
        return "root";
      }
      const id = "vw-marks-" + ++marksSeq;
      img.setAttribute("id", id);
      const defs = document.createElementNS(SVGNS, "defs");
      defs.setAttribute("class", "vellumwidget-marks-defs");
      defs.appendChild(img);
      svg.insertBefore(defs, svg.firstChild);
      for (let i = 0; i < pans.length; i++) {
        const u = document.createElementNS(SVGNS, "use");
        u.setAttribute("class", "vellumwidget-marks");
        u.setAttribute("href", "#" + id);
        const cp = panelClip(names[i]);
        if (cp) u.setAttribute("clip-path", cp);
        pans[i].appendChild(u);
      }
      return "pans";
    }
    function applyStyling() {
      const s = ws.opts.style || {};
      const setRoot = (name, v) => {
        if (v != null && v !== "") ws.el.style.setProperty(name, String(v));
        else ws.el.style.removeProperty(name);
      };
      setRoot("--vellumwidget-dim-opacity", s.dimOpacity);
      setRoot("--vellumwidget-selected-stroke", s.selectedColor);
      setRoot("--vellumwidget-tip-bg", s.tipBg);
      setRoot("--vellumwidget-tip-fg", s.tipFg);
      setRoot("--vellumwidget-tip-fontsize", s.tipFontSize);
      setRoot("--vellumwidget-tip-maxwidth", s.tipMaxWidth);
      const bg = ws.svgEl ? sceneBackgrounds(ws.svgEl) : { panel: null, plot: null };
      const panelBg = bg.panel || bg.plot, plotBg = bg.plot || bg.panel;
      const darkPanel = !!panelBg && isDarkBg(panelBg);
      ws.el.style.setProperty("--vellumwidget-ink", darkPanel ? "#f9fafb" : "#111827");
      ws.el.style.setProperty("--vellumwidget-ink-soft", darkPanel ? "rgba(209,213,219,0.85)" : "rgba(75,85,99,0.85)");
      ws.el.style.setProperty("--vellumwidget-wash", plotBg && isDarkBg(plotBg) ? "rgba(17,24,39,0.66)" : "rgba(255,255,255,0.66)");
      ws.el.classList.toggle("vellumwidget-dark-panel", darkPanel);
      if (s.hoverColor != null && s.hoverColor !== "") {
        ws.el.style.setProperty("--vellumwidget-hl-stroke", s.hoverColor);
        ws.el.classList.add("vellumwidget-hc-all");
      } else {
        ws.el.style.removeProperty("--vellumwidget-hl-stroke");
        ws.el.classList.remove("vellumwidget-hc-all");
      }
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        if (e.hover_color == null && e.selected_color == null && e.legend_for == null) continue;
        const nodes = ws.fx.elementsForKey(e.key);
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
    function defaultMode() {
      const modes = ws.fx.availableModes();
      const ivs = asColumn(ws.interactions && ws.interactions.selections || []).filter((s) => s.kind === "interval");
      if (ivs.length && ivs.every(isScalesBound) && modes.indexOf("pan") >= 0) return "pan";
      return modes[0] || "brush";
    }
    function wire(svg) {
      svg.addEventListener("pointermove", ws.fx.onHoverMove);
      svg.addEventListener("pointerleave", ws.fx.clearHover);
      svg.addEventListener("pointerdown", ws.fx.onDown);
      svg.addEventListener("click", ws.fx.onClick);
      svg.addEventListener("dblclick", ws.fx.onDblClick);
      if (ws.opts.zoom) svg.addEventListener("wheel", ws.fx.onWheel, { passive: false });
      if (ws.opts.zoom || ws.opts.brush) ws.el.classList.add("vellumwidget-gesture");
      ws.el.setAttribute("tabindex", "0");
      ws.el.addEventListener("keydown", ws.fx.onKey);
    }
    function loadFlagged(f) {
      const dl = ws.dl;
      if (!dl || !dl.covered || !dl.nRuns) return;
      const hrefs = asColumn(f.runs).map(String);
      if (hrefs.length !== dl.nRuns) return;
      ws.runSvg = runSvgsOf(f.svg, dl.nRuns);
      const imgs = [];
      let left = hrefs.length;
      for (let k = 0; k < hrefs.length; k++) {
        const im = document.createElement("img");
        im.onload = function() {
          if (--left > 0 || ws.dl !== dl) return;
          if (attachRuns(dl, imgs, hrefs, Number(f.width), Number(f.height))) {
            ws.fx.restyleRuns();
            ws.fx.drawPoints();
            ws.fx.scheduleTier();
          }
        };
        imgs.push(im);
        im.src = hrefs[k];
      }
    }
    function renderValue(x) {
      ws.opts = Object.assign(
        // Interactive-by-default: hover/select/brush/lasso/zoom and axis-aware
        // zoom are on unless the payload overrides them. (as_widget() no longer
        // exposes these as flags; the defaults live here.)
        { tooltip: true, hover: true, select: true, brush: true, lasso: true, zoom: true, toolbar: true, nearest: true, a11y: true, selectMode: "multiple", hoverMode: "closest", crosshair: false, navigator: false, axisZoom: true, zoomMarks: "fixed", maxZoom: DEFAULT_MAX_ZOOM },
        x.options || {}
      );
      ws.elements = normalizeElements(x.elements);
      ws.dl = x.options && x.options.raster && x.displayList ? decodeDisplayList(x.displayList, ws.elements.map((e) => e.key)) : null;
      ws.runSvg = null;
      if (ws.dl) fillBboxes(ws.elements, ws.dl);
      ws.panels = normalizePanels(x.panels);
      ws.colorbar = x.colorbar || null;
      ws.interactions = x.interactions || null;
      ws.provenance = x.provenance || null;
      ws.condTagElems = {};
      ws.condTagVals = {};
      ws.filtSelElems = {};
      ws.joinOf = {};
      ws.lastHoverKeys = [];
      ws.hoverSig = "";
      ws.calib = null;
      ws.meta = {};
      ws.groups = {};
      ws.incidentEdges = {};
      ws.neighbourNodes = {};
      ws.edgeEndpoints = {};
      ws.neighbourExpand = null;
      ws.legendIndex = {};
      ws.legendSwatch = {};
      ws.legendOff = {};
      ws.hiddenKeySet = {};
      ws.filteredKeySet = {};
      ws.selected = {};
      ws.lastBrush = null;
      ws.intervals = {};
      ws.intervalEl = null;
      ws.intervalBand = null;
      ws.mode = "brush";
      ws.group = ws.opts.group || null;
      for (let i = 0; i < ws.elements.length; i++) {
        const e = ws.elements[i];
        ws.meta[e.key] = e;
        if (e.hover_group != null) (ws.groups[e.hover_group] = ws.groups[e.hover_group] || []).push(e.key);
        if (e.source != null && e.target != null) {
          ws.edgeEndpoints[e.key] = [e.source, e.target];
          (ws.incidentEdges[e.source] = ws.incidentEdges[e.source] || []).push(e.key);
          (ws.incidentEdges[e.target] = ws.incidentEdges[e.target] || []).push(e.key);
          (ws.neighbourNodes[e.source] = ws.neighbourNodes[e.source] || []).push(e.target);
          (ws.neighbourNodes[e.target] = ws.neighbourNodes[e.target] || []).push(e.source);
        }
        if (e.legend != null) {
          const series = Array.isArray(e.legend) ? e.legend : [e.legend];
          for (let s = 0; s < series.length; s++) {
            (ws.legendIndex[series[s]] = ws.legendIndex[series[s]] || []).push(e.key);
          }
        }
        if (e.legend_for != null) (ws.legendSwatch[e.legend_for] = ws.legendSwatch[e.legend_for] || []).push(e.key);
      }
      const sels = ws.interactions && ws.interactions.selections || [];
      for (let i = 0; i < sels.length; i++) {
        const ex = sels[i].expand;
        if (ex && ex.mode === "neighbours") {
          ws.neighbourExpand = {
            degree: Math.max(1, Math.floor(ex.degree || 1)),
            edges: ex.edges !== false
          };
          break;
        }
      }
      if (!ws.holder) {
        ws.stage = document.createElement("div");
        ws.stage.className = "vellumwidget-stage";
        ws.el.appendChild(ws.stage);
        ws.holder = document.createElement("div");
        ws.holder.className = "vellumwidget-svg-holder";
        ws.stage.appendChild(ws.holder);
        ws.dimLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        ws.dimLayer.setAttribute("class", "vellumwidget-dim-layer");
        ws.dimLayer.setAttribute("aria-hidden", "true");
        ws.crosshairLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        ws.crosshairLayer.setAttribute("class", "vellumwidget-crosshair-layer");
        ws.crosshairLayer.setAttribute("aria-hidden", "true");
        ws.stage.appendChild(ws.crosshairLayer);
        ws.stage.appendChild(ws.dimLayer);
        ws.el.appendChild(ws.brushBox);
        ws.el.appendChild(ws.tip);
        ws.tip.addEventListener("pointerenter", function() {
          if (ws.tipHideTimer) {
            clearTimeout(ws.tipHideTimer);
            ws.tipHideTimer = 0;
          }
        });
        ws.tip.addEventListener("pointerleave", function() {
          ws.fx.hideTip();
        });
      }
      if (ws.aboveEl) {
        ws.aboveEl.remove();
        ws.aboveEl = null;
      }
      ws.holder.innerHTML = x.svg;
      ws.markTier = "overview";
      ws.detailGroups = [];
      ws.detailKeys = [];
      ws.svgEl = ws.holder.querySelector("svg");
      ws.marksLayer = ws.svgEl && x.marks && x.options && x.options.raster ? placeMarks(ws.svgEl, x.marks) : null;
      ws.nodesByKey = {};
      if (ws.holder) {
        const keyed = ws.holder.querySelectorAll("[data-key]");
        for (let i = 0; i < keyed.length; i++) {
          const k = keyed[i].getAttribute("data-key");
          if (k != null) (ws.nodesByKey[k] = ws.nodesByKey[k] || []).push(keyed[i]);
        }
      }
      if (ws.svgEl) {
        ws.vb0 = parseViewBox(ws.svgEl.getAttribute("viewBox"));
        if (!ws.vb0) {
          const w = parseFloat(ws.svgEl.getAttribute("width") || "0");
          const h = parseFloat(ws.svgEl.getAttribute("height") || "0");
          if (w && h) ws.vb0 = { x: 0, y: 0, w, h };
        }
        ws.vb = ws.vb0 ? { x: ws.vb0.x, y: ws.vb0.y, w: ws.vb0.w, h: ws.vb0.h } : null;
        ws.cellViews = {};
        ws.activeCell = null;
        ws.fx.hideHighlightOverlay();
        ws.rasterMode = !!ws.opts.raster;
        ws.largeDim = !ws.rasterMode && ws.elements.length > DIM_OVERLAY_MIN;
        ws.selGroup = null;
        ws.hovGroup = null;
        if (ws.rasterMode && ws.dimLayer) {
          ws.selGroup = document.createElementNS(SVGNS, "g");
          ws.hovGroup = document.createElementNS(SVGNS, "g");
          ws.dimLayer.appendChild(ws.selGroup);
          ws.dimLayer.appendChild(ws.hovGroup);
        }
        if (ws.dimLayer && ws.vb0) ws.dimLayer.setAttribute("viewBox", fmtViewBox(ws.vb0));
        if (ws.crosshairLayer && ws.vb0) ws.crosshairLayer.setAttribute("viewBox", fmtViewBox(ws.vb0));
        ws.fx.clearCrosshair();
        if (ws.rasterMode) {
          ws.fx.ensureCanvas();
          ws.fx.sampleBaseRaster(x.markColors);
          if (ws.marksLayer && x.flagged) loadFlagged(x.flagged);
        } else {
          ws.fx.clearPointData();
        }
        if (ws.rasterMode && ws.marksLayer && x.above) ws.aboveEl = placeAbove(x.above);
        ws.fx.buildSpatialIndex();
        ws.fx.buildGeometry(x.geometry);
        ws.fx.buildHoverAxis();
        wire(ws.svgEl);
        ws.fx.buildToolbar();
        ws.fx.buildNavigator();
        ws.fx.buildColorbar();
        ws.fx.setupInteractions();
        ws.fx.setupAxisZoom();
        ws.xZoom = !!ws.opts.navigator && (!ws.rasterMode || ws.marksLayer === "pans");
        ws.fx.applyAspect();
        ws.fx.setMode(defaultMode());
        ws.tip.classList.toggle("vellumwidget-tip-sticky", !!ws.opts.tooltipSticky);
        applyStyling();
        ws.fx.applyLegend();
        ws.fx.setupA11y();
        ws.fx.setupLinking();
        ws.fx.shinyInput("selected", ws.fx.selectedKeys());
        registerProxyHandler();
      }
    }
    function resize() {
      ws.calib = null;
      ws.fx.drawPoints();
    }
    return { renderValue, resize, panelClip };
  }

  // srcts/linking.ts
  var vellumwidgetBus = {};
  function busJoin(group, m) {
    (vellumwidgetBus[group] = vellumwidgetBus[group] || []).push(m);
  }
  function busLeave(group, token) {
    const members = vellumwidgetBus[group];
    if (!members) return;
    const rest = members.filter((m) => m.token !== token);
    if (rest.length) vellumwidgetBus[group] = rest;
    else delete vellumwidgetBus[group];
  }
  function liveMembers(group) {
    const members = vellumwidgetBus[group] || [];
    const live = [];
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      if (m.el && m.el.isConnected === false) {
        if (m.onGone) m.onGone();
        else busLeave(group, m.token);
        continue;
      }
      live.push(m);
    }
    return live;
  }
  function busPublish(group, sender, keys) {
    const members = liveMembers(group);
    for (let i = 0; i < members.length; i++) {
      if (members[i].token !== sender) members[i].onSelect(keys);
    }
  }
  function busPublishView(group, sender, v) {
    const members = liveMembers(group);
    for (let i = 0; i < members.length; i++) {
      if (members[i].token !== sender && members[i].onView) members[i].onView(v);
    }
  }
  var watched = [];
  var observer = null;
  function sweepRemoved() {
    const gone = [];
    watched = watched.filter((w) => {
      if (w.el.isConnected) {
        w.seen = true;
        return true;
      }
      if (!w.seen) return true;
      gone.push(w);
      return false;
    });
    if (!watched.length && observer) {
      observer.disconnect();
      observer = null;
    }
    for (let i = 0; i < gone.length; i++) gone[i].cb();
  }
  function watchRemoval(el, cb) {
    const w = { el, seen: el.isConnected, cb };
    watched.push(w);
    const MO = typeof window !== "undefined" ? window.MutationObserver : void 0;
    if (!observer && MO && typeof document !== "undefined" && document.documentElement) {
      observer = new MO(sweepRemoved);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    return function() {
      watched = watched.filter((x) => x !== w);
      if (!watched.length && observer) {
        observer.disconnect();
        observer = null;
      }
    };
  }
  function getCrosstalk() {
    return window.crosstalk || null;
  }

  // srcts/features/selection.ts
  function selectionFeature(ws) {
    function shinyInput(event, value, opts) {
      const hw = HTMLWidgets;
      const sh = window.Shiny;
      if (hw.shinyMode && sh && sh.setInputValue && ws.el.id) {
        sh.setInputValue(ws.el.id + "_" + event, value, opts);
      }
    }
    function refreshSelected() {
      ws.selRev++;
      ws.fx.raiseSelected();
      if (ws.fx.ringMode()) {
        ws.fx.drawSelFeedback();
        ws.fx.reevaluateInteractions();
        return;
      }
      ws.fx.clearClass("vellumwidget-selected");
      for (const k in ws.selected) if (ws.selected[k]) ws.fx.addClassForKeys([k], "vellumwidget-selected");
      ws.fx.reevaluateInteractions();
    }
    function selectedKeys() {
      return Object.keys(ws.selected).filter((k) => ws.selected[k]);
    }
    function broadcast() {
      const keys = selectedKeys();
      if (ws.group) busPublish(ws.group, ws.selfToken, keys);
      if (ws.ctSel) ws.ctSel.set(keys);
      shinyInput("selected", keys);
    }
    function toggleSelect(k) {
      const ks = ws.fx.linkedKeys(k);
      if (ws.opts.selectMode === "single") {
        const allOn = ks.every((x) => ws.selected[x]) && selectedKeys().length === ks.length;
        ws.selected = {};
        if (!allOn) ks.forEach((x) => ws.selected[x] = true);
      } else {
        const turnOn = !ks.every((x) => ws.selected[x]);
        ks.forEach((x) => ws.selected[x] = turnOn);
      }
      refreshSelected();
      broadcast();
    }
    function setSelection(keys) {
      ws.selected = {};
      for (let i = 0; i < keys.length; i++) ws.selected[keys[i]] = true;
      refreshSelected();
      broadcast();
    }
    function clearSelection() {
      ws.selected = {};
      const hadInterval = ws.fx.clearIntervals();
      refreshSelected();
      broadcast();
      if (hadInterval) shinyInput("brush", null, { priority: "event" });
    }
    function applyLinkedSelection(keys) {
      ws.selected = {};
      for (let i = 0; i < keys.length; i++) ws.selected[keys[i]] = true;
      refreshSelected();
      shinyInput("selected", selectedKeys());
    }
    function applyFilter(showKeys) {
      ws.calib = null;
      ws.fx.clearClass("vellumwidget-filtered");
      ws.filteredKeySet = {};
      if (showKeys != null) {
        const show = {};
        for (let i = 0; i < showKeys.length; i++) show[showKeys[i]] = true;
        for (let i = 0; i < ws.elements.length; i++) {
          const key = ws.elements[i].key;
          if (!show[key]) {
            ws.fx.addClassForKeys([key], "vellumwidget-filtered");
            ws.filteredKeySet[key] = true;
          }
        }
      }
      if (ws.rasterMode) ws.fx.updateMarkStates();
    }
    function inert(k) {
      return !!ws.hiddenKeySet[k] || !!ws.filteredKeySet[k] || !!ws.colorHiddenSet[k];
    }
    function dropInert(keys) {
      return keys.filter((k) => !inert(k));
    }
    function setupLinking() {
      const g = ws.group;
      if (ws.joinedGroup !== g) {
        if (ws.joinedGroup != null) busLeave(ws.joinedGroup, ws.selfToken);
        if (g != null) {
          busJoin(g, {
            token: ws.selfToken,
            onSelect: applyLinkedSelection,
            onView: ws.fx.applyLinkedView,
            el: ws.el,
            onGone: teardownLinking
          });
        }
        ws.joinedGroup = g;
      }
      const ct = getCrosstalk();
      const ctg = ws.opts.crosstalk && ct ? ws.opts.crosstalk : null;
      if (ws.ctGroup !== ctg) {
        closeCrosstalk();
        if (ctg && ct) {
          const sel = new ct.SelectionHandle(ctg);
          const filt = new ct.FilterHandle(ctg);
          ws.ctSel = sel;
          ws.ctFilt = filt;
          sel.on("change", function(e) {
            if (ws.ctSel !== sel) return;
            if (!ws.el.isConnected) {
              teardownLinking();
              return;
            }
            if (e.sender !== sel) applyLinkedSelection(e.value || []);
          });
          filt.on("change", function(e) {
            if (ws.ctFilt !== filt) return;
            if (!ws.el.isConnected) {
              teardownLinking();
              return;
            }
            applyFilter(e.value);
          });
        }
        ws.ctGroup = ctg;
      }
      if ((ws.joinedGroup != null || ws.ctGroup != null) && !ws.unwatchRemoval) {
        ws.unwatchRemoval = watchRemoval(ws.el, teardownLinking);
      }
    }
    function closeCrosstalk() {
      if (ws.ctSel && ws.ctSel.close) ws.ctSel.close();
      if (ws.ctFilt && ws.ctFilt.close) ws.ctFilt.close();
      ws.ctSel = null;
      ws.ctFilt = null;
      ws.ctGroup = null;
    }
    function teardownLinking() {
      if (ws.joinedGroup != null) busLeave(ws.joinedGroup, ws.selfToken);
      ws.joinedGroup = null;
      closeCrosstalk();
      if (ws.unwatchRemoval) {
        ws.unwatchRemoval();
        ws.unwatchRemoval = null;
      }
    }
    return { refreshSelected, shinyInput, selectedKeys, toggleSelect, setSelection, clearSelection, applyFilter, inert, dropInert, setupLinking, teardownLinking };
  }

  // srcts/features/source.ts
  function sourceFeature(ws) {
    function emitSource(target) {
      if (!ws.provenance) return;
      const pid = vellumIdOf(target);
      const raw = pid ? ws.provenance.byId[pid] : void 0;
      const rows = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
      if (!pid || !rows.length) {
        hideSourcePopover();
        return;
      }
      const tbl = sourceTable(ws.provenance, pid);
      ws.fx.shinyInput(
        "source",
        { id: pid, source: tbl.source, rows, fields: tbl.fields },
        { priority: "event" }
      );
      const values = tbl.values ? rows.map((r) => tbl.values[r - 1]).filter(Boolean) : null;
      ws.el.dispatchEvent(
        new window.CustomEvent("vellum:source", {
          detail: { id: pid, source: tbl.source, rows, fields: tbl.fields, values },
          bubbles: true
        })
      );
      if (values) showSourcePopover(target, tbl.fields, values);
    }
    function hideSourcePopover() {
      if (ws.sourcePopover) {
        ws.sourcePopover.remove();
        ws.sourcePopover = null;
      }
    }
    function showSourcePopover(node, fields, values) {
      var _a;
      hideSourcePopover();
      const pop = document.createElement("div");
      pop.className = "vellumwidget-source";
      pop.setAttribute("role", "dialog");
      pop.style.cssText = "position:absolute;z-index:20;max-height:220px;overflow:auto;background:var(--vw-bg,#fff);color:var(--vw-fg,#111);border:1px solid rgba(0,0,0,.2);border-radius:6px;padding:6px 8px;font:11px/1.4 system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.18);max-width:320px;";
      const table = document.createElement("table");
      table.style.borderCollapse = "collapse";
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for (const f of fields) {
        const th = document.createElement("th");
        th.textContent = String(f);
        headRow.appendChild(th);
      }
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement("tbody");
      for (const row of values.slice(0, 12)) {
        const tr = document.createElement("tr");
        for (const f of fields) {
          const td = document.createElement("td");
          td.textContent = String((_a = row[f]) != null ? _a : "");
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      pop.appendChild(table);
      if (values.length > 12) {
        const more = document.createElement("div");
        more.className = "vw-src-more";
        more.textContent = "+" + (values.length - 12) + " more";
        pop.appendChild(more);
      }
      const nb = node.getBoundingClientRect();
      const cb = ws.el.getBoundingClientRect();
      pop.style.left = Math.min(nb.left - cb.left + 8, Math.max(0, cb.width - 220)) + "px";
      pop.style.top = Math.max(0, nb.top - cb.top + 8) + "px";
      ws.el.appendChild(pop);
      ws.sourcePopover = pop;
    }
    return { emitSource };
  }

  // srcts/features/toolbar.ts
  function toolbarFeature(ws) {
    function availableModes() {
      const m = [];
      if (ws.opts.brush) m.push("brush");
      if (ws.opts.lasso) m.push("lasso");
      if (ws.opts.zoom) m.push("pan");
      return m;
    }
    function setMode(m) {
      ws.mode = m;
      ws.el.classList.toggle("vellumwidget-mode-pan", m === "pan");
      ws.el.classList.toggle("vellumwidget-mode-lasso", m === "lasso");
      if (m !== "lasso") ws.fx.clearLasso();
      if (ws.toolbarEl) {
        const b = ws.toolbarEl.querySelector('[data-act="mode"]');
        if (b) {
          const modes = availableModes();
          const next = modes[(modes.indexOf(m) + 1) % modes.length];
          b.textContent = MODE_ICON[m];
          b.title = MODE_LABEL[m][0].toUpperCase() + MODE_LABEL[m].slice(1) + " mode" + (next && next !== m ? " (click for " + MODE_LABEL[next] + ")" : "");
          b.classList.toggle("vellumwidget-active", m !== "brush");
        }
      }
    }
    function cycleMode() {
      const modes = availableModes();
      if (modes.length < 2) return;
      setMode(modes[(modes.indexOf(ws.mode) + 1) % modes.length]);
    }
    function exportName() {
      const n = ws.opts.export && ws.opts.export.filename;
      return n && String(n).length ? String(n) : "plot";
    }
    function exportScale() {
      const s = ws.opts.export && ws.opts.export.scale;
      return s && s > 0 ? s : 1;
    }
    function exportSvgString(strokeK) {
      const svg = ws.svgEl.cloneNode(true);
      inlineStateStyles(ws.svgEl, svg);
      svg.classList.remove("vellumwidget-marks-off");
      const listed = ws.rasterMode ? ws.fx.exportMarksImage(exportScale()) : null;
      if (listed) {
        const old = svg.querySelectorAll(".vellumwidget-marks, .vellumwidget-marks-defs, .vellumwidget-detail");
        for (let i = 0; i < old.length; i++) old[i].remove();
        const parts = [{ href: listed.href, blend: "normal" }].concat(listed.layers || []);
        for (let k = 0; k < parts.length; k++) {
          const img = document.createElementNS(SVGNS, "image");
          img.setAttribute("class", "vellumwidget-marks-export");
          img.setAttribute("x", String(listed.x));
          img.setAttribute("y", String(listed.y));
          img.setAttribute("width", String(listed.w));
          img.setAttribute("height", String(listed.h));
          img.setAttribute("preserveAspectRatio", "none");
          if (parts[k].blend !== "normal") img.setAttribute("style", "mix-blend-mode:" + parts[k].blend);
          img.setAttribute("href", parts[k].href);
          svg.appendChild(img);
        }
      } else {
        const drawn = svg.querySelectorAll(".vellumwidget-marks");
        for (let i = 0; i < drawn.length; i++) drawn[i].style.visibility = "";
      }
      if (ws.aboveEl) {
        const g = document.createElementNS(SVGNS, "g");
        g.setAttribute("class", "vellumwidget-above-export");
        for (let c = ws.aboveEl.firstChild; c; c = c.nextSibling) g.appendChild(c.cloneNode(true));
        svg.appendChild(g);
      }
      if (ws.axisZoomActive && ws.retickLayer) {
        const g = document.createElementNS(SVGNS, "g");
        g.setAttribute("class", "vellumwidget-retick-export");
        for (let c = ws.retickLayer.firstChild; c; c = c.nextSibling) g.appendChild(c.cloneNode(true));
        svg.appendChild(g);
      }
      if (strokeK && strokeK !== 1) {
        const ns = svg.querySelectorAll('[vector-effect="non-scaling-stroke"]');
        for (let i = 0; i < ns.length; i++) {
          const w = parseFloat(ns[i].getAttribute("stroke-width") || "1");
          ns[i].setAttribute("stroke-width", String((isFinite(w) ? w : 1) * strokeK));
          const d = ns[i].getAttribute("stroke-dasharray");
          if (d && d !== "none") {
            ns[i].setAttribute("stroke-dasharray", d.split(/[\s,]+/).filter(Boolean).map((v) => String(parseFloat(v) * strokeK)).join(" "));
          }
        }
      }
      return new XMLSerializer().serializeToString(svg);
    }
    function saveSvg() {
      if (!ws.svgEl) return;
      const s = exportSvgString();
      download(new Blob([s], { type: "image/svg+xml;charset=utf-8" }), exportName() + ".svg");
    }
    function toCanvas(then, fail) {
      if (!ws.svgEl) return fail();
      const s = exportSvgString(exportScale());
      const url = URL.createObjectURL(new Blob([s], { type: "image/svg+xml;charset=utf-8" }));
      const img = new Image();
      img.onload = function() {
        const k = exportScale();
        const canvas = document.createElement("canvas");
        canvas.width = Math.round((ws.vb0 ? ws.vb0.w : img.width) * k);
        canvas.height = Math.round((ws.vb0 ? ws.vb0.h : img.height) * k);
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
      const anyEl = ws.el;
      const anyDoc = document;
      if (anyDoc.fullscreenElement) {
        if (anyDoc.exitFullscreen) anyDoc.exitFullscreen();
      } else if (anyEl.requestFullscreen) {
        anyEl.requestFullscreen();
      }
    }
    function zoomToSelection() {
      const rect = ws.lastBrush || unionBbox(ws.elements, ws.selected);
      if (rect) ws.fx.zoomTo(rect);
    }
    function buildToolbar() {
      if (ws.toolbarEl) {
        ws.toolbarEl.remove();
        ws.toolbarEl = null;
      }
      if (!ws.opts.toolbar) return;
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
      if (availableModes().length >= 2) btn("mode", MODE_ICON[ws.mode], "Drag mode", cycleMode);
      if (ws.opts.zoom) {
        btn("zoomsel", "\u2316", "Zoom to selection", zoomToSelection);
        btn("reset", "\u27F2", "Reset zoom", ws.fx.resetZoom);
      }
      btn("svg", "SVG", "Download SVG", saveSvg);
      btn("png", "PNG", "Download PNG", savePng);
      if (canCopy()) btn("copy", "\u29C9", "Copy PNG to clipboard", copyPng);
      btn("full", "\u26F6", "Fullscreen", toggleFullscreen);
      ws.el.appendChild(bar);
      ws.toolbarEl = bar;
    }
    return { availableModes, setMode, buildToolbar };
  }

  // srcts/features/viewport.ts
  function viewportFeature(ws) {
    function panelRange(i) {
      if (!ws.vb) return null;
      const p = ws.panels[i];
      if (ws.axisZoomActive && ws.vb0) {
        let a, b;
        const az = ws.azPanels.filter(function(q) {
          return q.p.name === p.name;
        })[0];
        if (az) {
          const t = ws.fx.azT(az);
          if (!t.sx || !t.sy) return null;
          a = { x: (p.px0 - t.tx) / t.sx, y: (p.py0 - t.ty) / t.sy };
          b = { x: (p.px1 - t.tx) / t.sx, y: (p.py1 - t.ty) / t.sy };
        } else {
          a = panToView(ws.vb, ws.vb0, p.px0, p.py0);
          b = panToView(ws.vb, ws.vb0, p.px1, p.py1);
        }
        return ws.fx.dataRangeOf(p, a.x, a.y, b.x, b.y);
      }
      let x0 = ws.vb.x, y0 = ws.vb.y, x1 = ws.vb.x + ws.vb.w, y1 = ws.vb.y + ws.vb.h;
      if (ws.panels.length > 1) {
        x0 = Math.max(x0, p.px0);
        y0 = Math.max(y0, p.py0);
        x1 = Math.min(x1, p.px1);
        y1 = Math.min(y1, p.py1);
        if (x1 <= x0 || y1 <= y0) return null;
      }
      return ws.fx.dataRangeOf(p, x0, y0, x1, y1);
    }
    function reportView() {
      if (!ws.vb) return;
      const payload = {
        x: ws.vb.x,
        y: ws.vb.y,
        w: ws.vb.w,
        h: ws.vb.h,
        // Per-cell zoom (VW-18): `x`..`h` are the active cell's view; zoomed if any cell is.
        zoomed: ws.vb0 ? isZoomedIn(ws.vb, ws.vb0) || ws.fx.anyCellZoomed() : false
      };
      if (ws.axisZoomActive && Object.keys(ws.scaleBinds).length) payload.bound = Object.assign({}, ws.scaleBoundBy);
      if (ws.panels.length) {
        const per = {};
        for (let i = 0; i < ws.panels.length; i++) per[ws.panels[i].name] = panelRange(i);
        payload.panels = per;
        if (ws.panels.length === 1) {
          const d = per[ws.panels[0].name];
          if (d) payload.data = d;
        }
      }
      ws.fx.shinyInput("zoom", payload);
      ws.fx.syncScaleSelections();
      if (ws.group && ws.vb0 && !ws.receivingView && ws.vb0.w && ws.vb0.h) {
        busPublishView(ws.group, ws.selfToken, {
          x: (ws.vb.x - ws.vb0.x) / ws.vb0.w,
          y: (ws.vb.y - ws.vb0.y) / ws.vb0.h,
          w: ws.vb.w / ws.vb0.w,
          h: ws.vb.h / ws.vb0.h
        });
      }
    }
    function applyLinkedView(v) {
      if (!ws.vb0) return;
      let next = {
        x: ws.vb0.x + v.x * ws.vb0.w,
        y: ws.vb0.y + v.y * ws.vb0.h,
        w: v.w * ws.vb0.w,
        h: v.h * ws.vb0.h
      };
      if (!(next.w > 0) || !(next.h > 0)) return;
      next = clampViewBox(next, ws.vb0, ws.opts.maxZoom);
      if (ws.vb && Math.abs(next.x - ws.vb.x) < 1e-6 && Math.abs(next.y - ws.vb.y) < 1e-6 && Math.abs(next.w - ws.vb.w) < 1e-6 && Math.abs(next.h - ws.vb.h) < 1e-6) return;
      ws.receivingView = true;
      ws.vb = next;
      applyViewBox();
      ws.receivingView = false;
    }
    function applyAspect() {
      const par = ws.xZoom && !ws.axisZoomActive ? "none" : "xMidYMid meet";
      if (ws.svgEl) ws.svgEl.setAttribute("preserveAspectRatio", par);
      if (ws.dimLayer) ws.dimLayer.setAttribute("preserveAspectRatio", par);
      if (ws.crosshairLayer) ws.crosshairLayer.setAttribute("preserveAspectRatio", par);
      if (ws.colorbarLayer) ws.colorbarLayer.setAttribute("preserveAspectRatio", par);
      if (ws.aboveEl) ws.aboveEl.setAttribute("preserveAspectRatio", par);
    }
    function applyViewBox() {
      ws.calib = null;
      ws.hoverSig = "";
      if (ws.xZoom && ws.vb && ws.vb0) {
        ws.vb.y = ws.vb0.y;
        ws.vb.h = ws.vb0.h;
      }
      if (ws.vb) ws.vb = clampViewBox(ws.vb, ws.vb0, ws.opts.maxZoom);
      if (ws.vb) ws.el.classList.toggle("vellumwidget-zoom-max", atMaxZoom(ws.vb, ws.vb0, ws.opts.maxZoom));
      if (ws.axisZoomActive && ws.panGroup && ws.vb && ws.vb0) {
        ws.fx.applyPanTransforms();
        if (ws.svgEl) ws.svgEl.setAttribute("viewBox", fmtViewBox(ws.vb0));
        ws.fx.retick();
      } else if (ws.svgEl && ws.vb) {
        ws.svgEl.setAttribute("viewBox", fmtViewBox(ws.vb));
      }
      if (ws.aboveEl && ws.svgEl) ws.aboveEl.setAttribute("viewBox", ws.svgEl.getAttribute("viewBox") || "");
      const overlayVb = ws.fx.azMulti() ? ws.vb0 : ws.vb;
      if (ws.dimLayer && overlayVb) ws.dimLayer.setAttribute("viewBox", fmtViewBox(overlayVb));
      if (ws.crosshairLayer && overlayVb) ws.crosshairLayer.setAttribute("viewBox", fmtViewBox(overlayVb));
      ws.fx.placeIntervalBand();
      if (ws.largeDim) ws.fx.refreshHighlightOverlay();
      if (ws.rasterMode && ws.axisZoomActive) ws.fx.drawSelFeedback();
      if (ws.colorbarLayer && (ws.vb || ws.vb0)) {
        ws.colorbarLayer.setAttribute("viewBox", fmtViewBox(ws.axisZoomActive && ws.vb0 ? ws.vb0 : ws.vb));
      }
      ws.fx.drawPoints();
      ws.fx.scheduleTier();
      ws.fx.updateNav();
      if (ws.dragging !== "pan" && ws.pinchDist === 0) reportView();
    }
    function resetZoom() {
      if (ws.vb0) {
        ws.cellViews = {};
        ws.vb = { x: ws.vb0.x, y: ws.vb0.y, w: ws.vb0.w, h: ws.vb0.h };
        applyViewBox();
      }
    }
    function zoomTo(rect, pad = 0.05) {
      if (!ws.vb) return;
      if (ws.fx.azMulti()) {
        const a = ws.fx.azNearest((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2);
        if (a) {
          ws.fx.focusCell(a.p.cell);
          rect = {
            x0: (rect.x0 - a.bx) / a.ax,
            x1: (rect.x1 - a.bx) / a.ax,
            y0: (rect.y0 - a.by) / a.ay,
            y1: (rect.y1 - a.by) / a.ay
          };
        }
      }
      const w = Math.max(rect.x1 - rect.x0, 1e-6);
      const h = Math.max(rect.y1 - rect.y0, 1e-6);
      const px = w * pad;
      const py = h * pad;
      ws.vb = clampViewBox({ x: rect.x0 - px, y: rect.y0 - py, w: w + 2 * px, h: h + 2 * py }, ws.vb0, ws.opts.maxZoom);
      applyViewBox();
    }
    return { reportView, applyLinkedView, applyAspect, applyViewBox, resetZoom, zoomTo };
  }

  // srcts/state.ts
  function createState(el) {
    return {
      el,
      fx: {},
      tip: document.createElement("div"),
      brushBox: document.createElement("div"),
      holder: null,
      stage: null,
      svgEl: null,
      toolbarEl: null,
      navEl: null,
      navWindow: null,
      colorbar: null,
      colorbarLayer: null,
      interactions: null,
      provenance: null,
      condTagElems: {},
      condTagVals: {},
      filtSelElems: {},
      joinOf: {},
      lastHoverKeys: [],
      hoverSig: "",
      hovering: false,
      calib: null,
      colorRange: null,
      colorHiddenSet: {},
      meta: {},
      groups: {},
      incidentEdges: {},
      neighbourNodes: {},
      edgeEndpoints: {},
      neighbourExpand: null,
      legendIndex: {},
      legendSwatch: {},
      legendOff: {},
      hiddenKeySet: {},
      filteredKeySet: {},
      elements: [],
      panels: [],
      selected: {},
      selRev: 0,
      nodesByKey: {},
      hoverRAF: 0,
      spatialIndex: null,
      indexToElem: [],
      geomByKey: {},
      gx: new Float64Array(0),
      gy: new Float64Array(0),
      haveGeometry: false,
      largeDim: false,
      dimLayer: null,
      crosshairLayer: null,
      sortedCx: [],
      sortedCxKeys: [],
      sortedCy: [],
      sortedCyKeys: [],
      tolX: 1,
      tolY: 1,
      rasterMode: false,
      marksLayer: null,
      aboveEl: null,
      dl: null,
      markTier: "overview",
      msFlags: null,
      msColor: null,
      msCond: null,
      msPalette: [],
      msAlpha: null,
      msAlphaPal: [],
      msActive: false,
      msDimAlpha: 0.28,
      runSvg: null,
      detailGroups: [],
      detailKeys: [],
      selGroup: null,
      hovGroup: null,
      canvasEl: null,
      ctx: null,
      ptCx: null,
      ptCy: null,
      ptRad: null,
      ptRGB: null,
      ptN: 0,
      ptAllRound: false,
      opts: {
        tooltip: true,
        hover: true,
        select: true,
        brush: true,
        lasso: true,
        zoom: true,
        toolbar: true,
        nearest: true,
        a11y: true,
        selectMode: "multiple",
        hoverMode: "closest",
        crosshair: false,
        navigator: false
      },
      liveRegion: null,
      tableEl: null,
      focusables: [],
      focusIdx: -1,
      vb0: null,
      vb: null,
      azPanels: [],
      panGroup: null,
      axisZoomActive: false,
      retickLayer: null,
      anchorPanel: null,
      xZoom: false,
      axisStyle: {
        // presentation scraped from vellum's own axis/grid nodes so the re-tick matches the theme
        textFill: "#333333",
        fontFamily: "sans-serif",
        fontSize: 12,
        gridStroke: "#ffffff",
        gridWidth: 1
      },
      mode: "brush",
      lastBrush: null,
      intervals: {},
      scaleBinds: {},
      scaleBoundBy: {},
      bindGuard: false,
      cellViews: {},
      activeCell: null,
      intervalEl: null,
      intervalBand: null,
      lassoPts: [],
      lassoEl: null,
      selfToken: {},
      group: null,
      receivingView: false,
      joinedGroup: null,
      ctGroup: null,
      unwatchRemoval: null,
      ctSel: null,
      ctFilt: null,
      tipShowTimer: 0,
      tipHideTimer: 0,
      down: null,
      dragging: "",
      movedDuringDrag: false,
      pointers: /* @__PURE__ */ new Map(),
      pinchDist: 0,
      sourcePopover: null
    };
  }

  // srcts/index.ts
  HTMLWidgets.widget({
    name: "vellumwidget",
    type: "output",
    factory: function(el) {
      const ws = createState(el);
      Object.assign(
        ws.fx,
        coordsFeature(ws),
        highlightFeature(ws),
        legendFeature(ws),
        pickingFeature(ws),
        hoverFeature(ws),
        rasterFeature(ws),
        selectionFeature(ws),
        declarativeFeature(ws),
        intervalFeature(ws),
        bindScalesFeature(ws),
        proxyFeature(ws),
        viewportFeature(ws),
        axisZoomFeature(ws),
        navigatorFeature(ws),
        colorbarFeature(ws),
        pointerFeature(ws),
        sourceFeature(ws),
        toolbarFeature(ws),
        renderFeature(ws),
        a11yFeature(ws),
        detailFeature(ws),
        markStateFeature(ws),
        runStyleFeature(ws),
        raiseFeature(ws)
      );
      ensureStyle();
      el.classList.add("vellumwidget-root");
      ws.tip.className = "vellumwidget-tip";
      ws.brushBox.className = "vellumwidget-brush";
      return {
        renderValue: ws.fx.renderValue,
        resize: ws.fx.resize,
        // Server->client proxy seam: vellumwidget_proxy() reaches this instance via
        // HTMLWidgets.find() and calls `_call` (see the "vellumwidget-calls" handler).
        _call: ws.fx.proxyCall,
        // Test seam: the index-backed query functions + hover-mode flags, so the
        // headless suite can verify the spatial index with explicit coordinates
        // (jsdom has no layout, so client->user coordinate mapping is degenerate).
        _test: {
          nearestKeyAt: ws.fx.nearestKeyAt,
          brushKeysIn: ws.fx.brushKeysIn,
          indexSize: function() {
            return ws.spatialIndex ? ws.spatialIndex.numItems : 0;
          },
          // True-geometry picking (WI-3): whether the payload carried geometry, and
          // the exact distance to one key, so the suite can assert the ranking that
          // the bbox distance would get wrong.
          haveGeometry: function() {
            return ws.haveGeometry;
          },
          geomVertexCount: function() {
            return ws.gx.length;
          },
          distToKey: function(x, y, key) {
            for (let i = 0; i < ws.elements.length; i++) {
              if (ws.elements[i].key === key) return ws.fx.distToElem(x, y, ws.elements[i]);
            }
            return Infinity;
          },
          largeDim: function() {
            return ws.largeDim;
          },
          rasterMode: function() {
            return ws.rasterMode;
          },
          hasCanvas: function() {
            return !!ws.canvasEl;
          },
          displayListSize: function() {
            return ws.dl ? ws.dl.n : 0;
          },
          displayListKeys: function() {
            return ws.dl ? ws.dl.keys.slice() : null;
          },
          keyIds: function(keys) {
            return Array.from(ws.fx.keyIds(keys));
          },
          markTier: function() {
            return ws.markTier;
          },
          listExact: function() {
            return ws.dl ? ws.dl.exact : null;
          },
          runsAttached: function() {
            return !!(ws.dl && ws.dl.runImgs);
          },
          runStyled: ws.fx.runStyled,
          exportMarksImage: ws.fx.exportMarksImage,
          raiseOrder: function() {
            const o = ws.dl ? ws.fx.raiseOrder(ws.dl) : null;
            return o ? Array.from(o) : null;
          },
          condTags: function() {
            return Object.keys(ws.condTagElems).map(function(k) {
              return k + "=" + ws.condTagElems[k].length;
            }).join(",");
          },
          selectedKeys: ws.fx.selectedKeys,
          evalTier: ws.fx.evalTier,
          bboxOf: function(k) {
            const m = ws.meta[k];
            return m ? [m.x0, m.y0, m.x1, m.y1] : null;
          },
          pointCount: function() {
            return ws.ptN;
          },
          hoverMode: function() {
            return ws.opts.hoverMode || "closest";
          },
          columnKeys: ws.fx.columnKeys,
          nearestAxisKey: ws.fx.nearestAxisKey,
          legendOff: function() {
            return Object.keys(ws.legendOff).filter((s) => ws.legendOff[s]);
          },
          lassoKeysIn: ws.fx.lassoKeysIn,
          availableModes: ws.fx.availableModes,
          mode: function() {
            return ws.mode;
          },
          inert: ws.fx.inert,
          dropInert: ws.fx.dropInert,
          panelAt: ws.fx.panelAt,
          dataRangeOf: ws.fx.dataRangeOf,
          // Interval selections: the active ranges/members, and a completed brush
          // driven directly (device-px scene rect), bypassing pointer calibration.
          intervals: function() {
            return ws.intervals;
          },
          // Scale binds (bind_scale()): each bound panel's native domain + its driver.
          scaleBinds: function() {
            return { domains: ws.scaleBinds, by: ws.scaleBoundBy };
          },
          brushInterval: function(rect) {
            const iv = ws.fx.applyIntervalBrush(rect);
            if (!iv) return null;
            ws.lastBrush = iv.band;
            if (ws.opts.select) ws.fx.setSelection(ws.fx.brushSelectable(iv.keys, iv.band));
            else ws.fx.reevaluateInteractions();
            return iv;
          },
          intervalBand: function() {
            if (!ws.intervalEl || !ws.intervalEl.parentNode) return null;
            return {
              x: parseFloat(ws.intervalEl.getAttribute("x") || "NaN"),
              y: parseFloat(ws.intervalEl.getAttribute("y") || "NaN"),
              w: parseFloat(ws.intervalEl.getAttribute("width") || "NaN"),
              h: parseFloat(ws.intervalEl.getAttribute("height") || "NaN")
            };
          },
          clearSelection: ws.fx.clearSelection,
          brushDataFields: ws.fx.brushDataFields,
          hasNavigator: function() {
            return !!ws.navEl;
          },
          navToView: ws.fx.navToView,
          hasColorbar: function() {
            return !!ws.colorbarLayer;
          },
          setColorRange: ws.fx.setColorRange,
          colorHidden: function() {
            return Object.keys(ws.colorHiddenSet);
          },
          cbHandleCount: function() {
            return ws.colorbarLayer ? ws.colorbarLayer.querySelectorAll(".vellumwidget-cb-handle").length : 0;
          },
          navWindowFrac: function() {
            if (!ws.navWindow) return null;
            return { left: parseFloat(ws.navWindow.style.left) || 0, width: parseFloat(ws.navWindow.style.width) || 0 };
          },
          axisZoomActive: function() {
            return ws.axisZoomActive;
          },
          panTransform: function() {
            return ws.panGroup ? ws.panGroup.getAttribute("transform") : null;
          },
          panScaleVars: function() {
            if (!ws.panGroup) return null;
            return { ix: ws.panGroup.style.getPropertyValue("--vw-ix"), iy: ws.panGroup.style.getPropertyValue("--vw-iy") };
          },
          // Re-ticked axis labels (their text + device-px position), for asserting the
          // re-tick output without a real layout engine.
          retickLabels: function() {
            if (!ws.retickLayer) return [];
            return Array.prototype.map.call(ws.retickLayer.querySelectorAll("text"), function(t) {
              return { text: t.textContent, x: parseFloat(t.getAttribute("x") || "NaN"), y: parseFloat(t.getAttribute("y") || "NaN") };
            });
          },
          retickGridCount: function() {
            let n = 0;
            for (let i = 0; i < ws.azPanels.length; i++) {
              const g = ws.azPanels[i].grid;
              if (g) n += g.querySelectorAll("line:not(.vellumwidget-retick-tick)").length;
            }
            return n;
          },
          // Every zoomable panel's name + current pan transform (multi-panel axis zoom).
          panTransforms: function() {
            return ws.azPanels.map(function(a) {
              return { name: a.p.name, transform: a.pan.getAttribute("transform") };
            });
          },
          // Per panel: which axes got a label anchor (outer facets) — interior ones none.
          axisAnchors: function() {
            return ws.azPanels.map(function(a) {
              return { name: a.p.name, x: a.xLab, y: a.yLab };
            });
          },
          toAnchor: ws.fx.toAnchor,
          clientToScene: ws.fx.clientToScene,
          zoomTo: ws.fx.zoomTo,
          getView: function() {
            return ws.vb ? { x: ws.vb.x, y: ws.vb.y, w: ws.vb.w, h: ws.vb.h } : null;
          },
          staticAxesHidden: function() {
            if (!ws.svgEl) return null;
            const nodes = ws.svgEl.querySelectorAll('[role="grid"], [data-vellum-panel^="axis-x"], [data-vellum-panel^="axis-y"]');
            if (!nodes.length) return null;
            return Array.prototype.every.call(nodes, function(n) {
              if (n.style.display === "none") return true;
              if (n.getAttribute("role") === "grid") return false;
              return Array.prototype.every.call(n.children, function(c) {
                return c.style.display === "none" || c.tagName.toLowerCase() === "path";
              });
            });
          },
          focusCell: ws.fx.focusCell,
          resetZoom: ws.fx.resetZoom,
          activeCell: function() {
            return ws.activeCell;
          },
          setView: function(nvb) {
            ws.vb = { x: nvb.x, y: nvb.y, w: nvb.w, h: nvb.h };
            ws.fx.applyViewBox();
          },
          toView: ws.fx.toView,
          // Graph neighbour highlighting: the projection a hover/click acts on, and
          // the reconstructed adjacency + the select_neighbours() config.
          linkedKeys: ws.fx.linkedKeys,
          graphAdjacency: function() {
            return {
              incidentEdges: ws.incidentEdges,
              neighbourNodes: ws.neighbourNodes,
              edgeEndpoints: ws.edgeEndpoints,
              neighbourExpand: ws.neighbourExpand
            };
          }
        }
      };
    }
  });
  registerProxyHandler();
  window.__vellumwidgetTest = {
    rectsIntersect,
    distToBbox,
    distToSegment2,
    distToGeom,
    brushKeys,
    parseColor,
    luminance,
    isDarkBg,
    sceneBackgrounds,
    dropPartialSeries,
    isSeriesElem,
    nearestKey,
    zoomViewBox,
    zoomViewBoxCapped,
    clampZoomFactor,
    clampViewBox,
    atMaxZoom,
    parseViewBox,
    fmtViewBox,
    unionBbox,
    sanitizeTip,
    dispatchProxyCall,
    cssEscape: cssEscape2,
    cssEscapePolyfill,
    idSelector,
    findWidgetById,
    normalizeElements,
    decodeBbox,
    isZoomedIn,
    userToCanvas,
    nearestSortedIdx,
    columnTolerance,
    pointInPolygon,
    lassoKeys,
    polyBounds,
    nativeToData,
    pxToDataX,
    selEncodings,
    axisForEncoding,
    intervalRangeOf,
    inInterval,
    intervalKeys,
    pxToDataY,
    normalizePanels,
    viewToPan,
    panToView,
    conjugatePan,
    boundPan,
    channelToNative,
    niceTicks,
    fmtTick,
    dataToNative,
    logTicks,
    fmtRNum,
    strftimeUTC,
    timeTicks,
    detectTimeFormat,
    axisTicks,
    axisRetickable,
    parseSecLabels,
    secAxisMap,
    secTicks,
    sourceTable,
    decodeDisplayList,
    fillBboxes,
    tracePoint,
    traceShape,
    decodeKeys,
    dlColumn,
    bus: vellumwidgetBus
  };
})();
