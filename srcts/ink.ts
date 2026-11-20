// Feedback ink from the plot's own background (VW-20): the selection ring, the
// crosshair and the colorbar wash contrast with the panel / plot background the
// scene was drawn on, not with the OS colour scheme (a white plot stays a white
// plot when the page is viewed in dark mode, and theme_dark is dark in light mode).

// "#rgb", "#rrggbb", "#rrggbbaa", "rgb(...)", "rgba(...)", "white", "black" ->
// [r, g, b, a] in 0..255 (a in 0..1); null for "none", "transparent" or anything else.
export function parseColor(s: string | null | undefined): number[] | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (t === "white") return [255, 255, 255, 1];
  if (t === "black") return [0, 0, 0, 1];
  let m = /^#([0-9a-f]{3})$/.exec(t);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)).concat(1);
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(t);
  if (m) {
    const v = [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16));
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

// WCAG relative luminance of an sRGB colour, 0 (black) .. 1 (white).
export function luminance(c: number[]): number {
  const lin = c.slice(0, 3).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

// Is this background dark? Mid-grey and darker counts as dark: on theme_dark's
// grey50 panel the two inks contrast about equally with the background, and a
// light ring also stands out on the default black marks.
export function isDarkBg(c: number[]): boolean {
  return luminance(c) < 0.25;
}

// The opaque fill of a background shape, or null (no fill / see-through).
export function opaqueFill(n: Element | null): number[] | null {
  if (!n) return null;
  const c = parseColor(n.getAttribute("fill"));
  if (!c || c[3] < 0.5) return null;
  const fo = parseFloat(n.getAttribute("fill-opacity") || "1");
  if (isFinite(fo) && fo < 0.5) return null;
  return c;
}

// The panel and plot backgrounds of a vellum scene. The panel background is the
// un-roled shape vellumplot draws first in each pan group (moved just before it
// under axis zoom, tagged data-vw-panel-bg); the plot background is the
// plot-background group's shape, else the device rect at the top of the svg.
export function sceneBackgrounds(svg: Element): { panel: number[] | null; plot: number[] | null } {
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
  return { panel: panel, plot: plot };
}
