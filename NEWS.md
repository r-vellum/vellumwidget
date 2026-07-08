# gloss (development version)

* **Accessibility (`a11y = TRUE`, on by default).** The interactive widget is now
  keyboard- and screen-reader-navigable, not a mute image:
  * the SVG is announced as an interactive chart (`role="graphics-document"` +
    `aria-roledescription`), labelled from the scene's title/description (which
    `quill` sets automatically) or an explicit `as_widget(alt =)`;
  * every mark is a focusable `graphics-symbol` with a **roving tabindex** — arrow
    keys move between marks, Enter/Space toggles selection, Escape exits;
  * a polite **`aria-live`** region announces the focused / selected mark;
  * a visually-hidden **data table** lists every mark for assistive tech.
  All gated on `a11y`; `a11y = FALSE` restores the previous output exactly. See the
  quill *Accessibility* article.

# gloss 0.2.0

Interaction-depth release (ROADMAP §4).

* **Rich tooltips.** Tooltip text now renders as *safe* HTML: an author-built
  `tooltip =` (e.g. via `glue()`) may use `<b>`/`<i>`/`<br>` for bold/italic/
  line breaks. Data values are escaped and only inert, attribute-free tags are
  honoured — no scripts, handlers, or attributes (no XSS). New
  `as_widget(tooltip_style =)` themes the tooltip box (background/color/fontsize/
  max_width).
* **Touch + keyboard.** The widget is driven by pointer events, so pan/brush/
  hover work with mouse, touch, and pen from one path; a two-finger pinch
  zooms. With the widget focused, arrow keys pan, `+`/`-` zoom, and `0` resets.
* **Configurable export.** `as_widget(export_filename =, export_scale =)` set the
  download filename base and a hi-res PNG multiplier; exports capture the current
  (zoomed/panned) view. A "copy PNG to clipboard" toolbar button appears where
  the Clipboard API is available.
* **Large-N performance.** Hover/selection highlighting uses a per-render
  key→node cache instead of a `querySelectorAll` per key, and the nearest-mark
  hover scan is throttled to one per animation frame.
* New "Interactive widgets: a tour" article.

Deferred: a spatial index for hit-testing (the DOM cost was the real bottleneck,
now cached; bbox scans are cheap and datashade collapses huge clouds to a
raster); coordinated zoom across linked widgets and URL deep-linking; PDF export.

# gloss 0.1.0

First release. gloss turns a `vellum` scene or a `quill` plot into a
self-contained, client-side interactive HTML widget via a single terminal
`as_widget()` pipe — no Shiny, no server round-trip. Everything below ships in
this first release.

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
* **Legend interaction.** For a discrete `color`/`shape` scale on an interactive
  plot, each legend swatch drives its whole data series: hovering a swatch
  highlights the series (the swatch stays lit), clicking it selects the series
  (and links across views / crosstalk). Automatic — no extra arguments.
* **Linked views.** `as_widget(group=)` links gloss widgets client-side (no
  dependency): selecting/brushing in one highlights the same data keys in the
  others, projecting by `hover_group` (select one, select the series).
  `as_widget(crosstalk = SharedData)` bridges to the crosstalk ecosystem
  (plotly / leaflet / DT and `filter_*` inputs) via a `SelectionHandle` +
  `FilterHandle`; a crosstalk filter hides the non-matching marks (display-tier
  cross-filter). crosstalk is a Suggests, loaded only when used.
* **Customisable interaction styling**, at two composing levels:
  * *Widget theme* — `as_widget(hover_color=, selected_color=, dim_opacity=)`
    sets the look for the whole plot (any R or CSS colour).
  * *Per-element grammar* — `quill` marks' `hover_color`/`selected_color`
    (constant or column-mapped) style each element individually and override the
    theme. Both use CSS variables with a defaults ← theme ← per-element cascade.

The JS runtime is TypeScript in `srcts/`, bundled by esbuild into the committed
`inst/htmlwidgets/gloss.js` (so the R package installs with no Node).
