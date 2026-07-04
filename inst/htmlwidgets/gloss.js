// Generated from srcts/index.ts by esbuild — do not edit by hand.
"use strict";
(() => {
  // srcts/index.ts
  var STYLE_ID = "gloss-style";
  var GLOSS_CSS = `
.gloss-root { position: relative; display: inline-block; max-width: 100%; }
.gloss-root .gloss-svg-holder svg { max-width: 100%; height: auto; display: block; }
.gloss-root [data-key] { cursor: pointer; }
.gloss-hovering [data-key] { opacity: 0.28; }
.gloss-hovering [data-key].gloss-hl { opacity: 1; }
[data-key].gloss-selected { stroke: #111827; stroke-width: 1.4px; paint-order: stroke fill; }
.gloss-tip {
  position: absolute; left: 0; top: 0; pointer-events: none; z-index: 20;
  background: rgba(17,24,39,0.94); color: #fff;
  font: 12px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  padding: 5px 8px; border-radius: 5px; white-space: pre-wrap; max-width: 320px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  opacity: 0; transition: opacity 0.08s ease; will-change: transform;
}
.gloss-tip.gloss-show { opacity: 1; }
@media (prefers-color-scheme: dark) {
  .gloss-tip { background: rgba(243,244,246,0.96); color: #111827; }
  [data-key].gloss-selected { stroke: #f9fafb; }
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
  HTMLWidgets.widget({
    name: "gloss",
    type: "output",
    factory: function(el) {
      ensureStyle();
      el.classList.add("gloss-root");
      const tip = document.createElement("div");
      tip.className = "gloss-tip";
      el.appendChild(tip);
      let holder = null;
      let meta = {};
      let groups = {};
      let selected = {};
      let opts = { tooltip: true, hover: true, select: true, selectMode: "multiple" };
      function elementsForKey(k) {
        if (!holder) return [];
        return Array.prototype.slice.call(
          holder.querySelectorAll('[data-key="' + cssEscape(k) + '"]')
        );
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
        const text = m && m.tooltip || k;
        tip.textContent = text;
        const box = el.getBoundingClientRect();
        const x = clientX - box.left;
        const y = clientY - box.top;
        tip.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px) translate(-50%, calc(-100% - 12px))";
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
        for (const k in selected) {
          if (selected[k]) addClassForKeys([k], "gloss-selected");
        }
      }
      function toggleSelect(k) {
        if (opts.selectMode === "single") {
          const wasOnly = selected[k] && Object.keys(selected).filter((x) => selected[x]).length === 1;
          selected = {};
          if (!wasOnly) selected[k] = true;
        } else {
          selected[k] = !selected[k];
        }
        refreshSelected();
      }
      function wire(svg) {
        svg.addEventListener("mousemove", function(ev) {
          const k = keyOf(ev.target);
          if (k == null) {
            clearHover();
            return;
          }
          setHover(k);
          if (opts.tooltip) showTip(ev.clientX, ev.clientY, k);
        });
        svg.addEventListener("mouseleave", clearHover);
        if (opts.select) {
          svg.addEventListener("click", function(ev) {
            const k = keyOf(ev.target);
            if (k != null) toggleSelect(k);
          });
        }
      }
      return {
        renderValue: function(x) {
          opts = x.options || opts;
          meta = {};
          groups = {};
          selected = {};
          const els = x.elements || [];
          for (let i = 0; i < els.length; i++) {
            const e = els[i];
            meta[e.key] = e;
            if (e.hover_group != null) {
              (groups[e.hover_group] = groups[e.hover_group] || []).push(e.key);
            }
          }
          if (!holder) {
            holder = document.createElement("div");
            holder.className = "gloss-svg-holder";
            el.insertBefore(holder, tip);
          }
          holder.innerHTML = x.svg;
          const svg = holder.querySelector("svg");
          if (svg) wire(svg);
        },
        resize: function() {
        }
      };
    }
  });
})();
