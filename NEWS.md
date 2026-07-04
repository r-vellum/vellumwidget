# gloss 0.0.0.9000

Client-side interactive HTML widgets for `vellum` scenes / `quill` plots, via a
single terminal `as_widget()` pipe. No Shiny, no server round-trip.

## Features

* `as_widget()` compiles a `quill` plot or a raw `vellum` scene and bundles its
  SVG + `scene_model()` element table into an htmlwidget.
* **Hover** — tooltip (from the declared `tooltip`, falling back to the key) and
  highlight with inverse-dim; a hovered element's `hover_group` highlights the
  whole group. Hover snaps to the **nearest mark** when the cursor isn't directly
  over one.
* **Click** — select (single / multiple modes); every element sharing a key
  toggles together.
* **Brush** — drag a rectangle to select every element it covers.
* **Pan / zoom** — mouse wheel and pan-mode drag reframe the SVG `viewBox`, plus
  zoom-to-selection and reset.
* **Toolbar** (on hover) — brush/pan mode toggle, zoom-to-selection, reset zoom,
  download SVG, download PNG, fullscreen.
* Everything is opt-outable via `as_widget()` arguments
  (`tooltip`/`hover`/`select`/`brush`/`zoom`/`toolbar`/`nearest`).
* **Customisable interaction styling**, at two composing levels:
  * *Widget theme* — `as_widget(hover_color=, selected_color=, dim_opacity=)`
    sets the look for the whole plot (any R or CSS colour).
  * *Per-element grammar* — `quill` marks' `hover_color`/`selected_color`
    (constant or column-mapped) style each element individually and override the
    theme. Both use CSS variables with a defaults ← theme ← per-element cascade.

The JS runtime is TypeScript in `srcts/`, bundled by esbuild into the committed
`inst/htmlwidgets/gloss.js` (so the R package installs with no Node).
