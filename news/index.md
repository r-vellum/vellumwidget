# Changelog

## vellumwidget (development version)

- **Axis-aware zoom (`axis_zoom`, default `TRUE`).** Wheel/drag zoom
  scales only the plot’s data region and re-ticks the axes for the
  visible range — holding the frame (axes, titles, legend) in place the
  way a charting library zooms, rather than scaling the whole scene like
  an image. Hit-testing (hover/brush/lasso), the crosshair, and the
  `input$<id>_zoom` data range all follow the zoomed data region.
  Applies to a single **linear** cartesian panel (continuous
  `identity`/`reverse` axes) rendered as SVG; plots with
  log/date/discrete axes, several panels, or in raster mode silently
  fall back to the ordinary whole-scene zoom, so it is safe to leave on.
  Set `axis_zoom = FALSE` for the plain whole-scene zoom. Built on
  vellum’s pannable-panel contract (`vl_viewport(pannable=)`) and the
  panel scale metadata `vellumplot` emits (needs the current development
  `vellum`/`vellumplot`).

- **Constant-size markers on zoom (`zoom_marks`, default `"fixed"`).**
  Under axis-aware zoom, glyph marks (points, circles, hexagons, sector
  wedges) now keep their original pixel size and only their positions
  re-map — so points stay round and don’t stretch into ellipses under
  the navigator’s x-only zoom, the way a charting library zooms.
  Positional marks (bars, error bars, lines, areas) still scale with the
  data; their stroke width is held constant. Set `zoom_marks = "scale"`
  for the old behaviour where glyphs grow with the zoom (useful to read
  density). Applies to SVG axis-aware zoom and the raster crisp-point
  layer.

- **Interactive continuous colorbar filter (visualMap).** When a
  `vellumplot` plot maps a continuous `color` scale, its colorbar
  becomes a range filter: drag the two handles on the gradient bar to a
  value range and marks whose colour value falls outside it fade out
  (and drop out of hover/brush hit-testing); double-click the bar to
  reset. The selected range is reported to Shiny as
  `input$<id>_colorfilter = c(lo, hi)` (`NULL` at the full range).
  Automatic — no argument to set — whenever the plot has a continuous
  colorbar (needs the current development `vellumplot`; SVG mode).
  Discrete/binned colour legends keep their existing click-to-hide
  interaction.

- **Tooltip polish.**
  [`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md)
  gains `tooltip_delay` (ms to wait before the tooltip appears — the
  highlight is immediate, only the tooltip waits), `tooltip_follow`
  (`TRUE`, the default, tracks the cursor; `FALSE` anchors above the
  mark), and `tooltip_sticky` (the tooltip accepts pointer events and
  lingers briefly on leave, so tooltips containing links/buttons are
  usable). The tooltip also now auto-flips below the cursor when there
  isn’t room above and clamps horizontally so it doesn’t overflow the
  widget.

- **Overview navigator (`navigator = TRUE`).** An opt-in strip below the
  plot that renders the whole scene in miniature with a draggable,
  resizable window marking the visible x-range: drag the window to pan,
  drag a handle to zoom. Zoom is **x-only** — the selected x-range fills
  the width while the full y-range stays on screen (a time-series range
  selector). With `axis_zoom` (the default) it is rendered through the
  axis-aware zoom, so the x-axis re-ticks crisply; otherwise the view
  stretches horizontally. It stays two-way in sync with the main view —
  wheel/keyboard/brush, the toolbar, and linked-group pan/zoom all move
  the window, and moving the window drives them. Useful for scrubbing
  long series. `navigator_height` sets the strip height (default 56px).
  Client-side; off by default.

- **Linked pan/zoom across a `group`.** Widgets sharing a `group`
  already linked selection and hover; now panning or zooming one moves
  the others to the same view. The view is shared as a *fraction* of
  each widget’s own extent (over the same client-side bus, no
  Shiny/crosstalk), so linked plots of different sizes — small multiples
  — stay aligned. Reset links too.

- **Brush and view now report data-space coordinates, not just pixels.**
  When the plot carries a cartesian scale (any `vellumplot` plot),
  `input$<id>_brush` gains the brushed region’s data-space bounds
  `x0d,y0d,x1d,y1d` (plus the `panel` name) alongside the existing
  device-pixel rectangle, and `input$<id>_zoom` gains
  `data = list(x=, y=, panel=)`, the visible range in data coordinates.
  This reads the per-panel scale descriptors `vellumplot` now attaches
  to the scene (requires the current development `vellum` (\>=
  0.4.0.9000) and `vellumplot`); a raw `vellum` scene or a non-cartesian
  coordinate system reports device-pixel fields only, as before.
  Date/time axes report the numeric epoch (days for `Date`, seconds for
  `POSIXct`), which you map back with
  [`as.Date()`](https://rdrr.io/r/base/as.Date.html) /
  [`.POSIXct()`](https://rdrr.io/r/base/base-internal.html). The fields
  describe the *visual* axes (under
  [`coord_flip()`](https://r-vellum.github.io/vellumplot/reference/coord_cartesian.html),
  `x0d` is the plot’s `y` aesthetic); a discrete axis reports fractional
  band positions; and an axis built with a custom
  `scales::transform_*()` object (beyond identity / log10 / sqrt /
  reverse) is omitted from the data-space fields rather than reported
  wrong. (Groundwork for axis-aware zoom.)

- **Fix: cross-filtered and legend-hidden marks were still
  hit-testable.** A display-tier cross-filter (crosstalk or
  [`vw_filter()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md))
  and a legend `legend_click = "hide"` toggle set the marks to
  `display:none`, but they stayed in the spatial index — so a
  nearest-mark hover could still tooltip a hidden datum, and a brush or
  lasso could re-select filtered-out points (propagating the selection
  back to linked/crosstalk views). Keyboard traversal already skipped
  hidden marks; hover, brush, lasso, and raster click-snap now do too,
  via a single “inert” guard. Muted (not hidden) legend series stay
  interactive.

- **Freehand lasso-select.** A third drag mode alongside brush and pan
  (default on; disable with `as_widget(lasso = FALSE)`). The toolbar’s
  mode button now cycles brush → lasso → pan, and it appears whenever at
  least two drag modes are enabled. Drag a loop and every mark whose
  centre falls inside it is selected — hit-tested with a
  point-in-polygon check over the Flatbush spatial index, so it stays
  fast on large scenes. It reports through `input$<id>_brush` like the
  box brush, with a `lasso = TRUE` flag and the loop’s bounding box.

- **Widgets report their current view to Shiny (`input$<id>_zoom`).**
  After a zoom/pan settles — wheel, drag-pan release, pinch, keyboard,
  reset, zoom-to-selection, or a
  [`vw_zoom()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md)
  proxy call — the widget publishes `list(x=, y=, w=, h=, zoomed=)`: the
  current `viewBox` (device-px) and whether the view is zoomed in. A
  deduped state input, so a coordinated dashboard can react to what the
  user is looking at. (Data-space limits await axis/scale metadata in
  the scene contract.)

- **Legend click-to-hide and double-click-to-isolate.**
  [`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md)
  gains a `legend_click` argument. The default `"select"` is unchanged
  (clicking a discrete-legend swatch selects its series). `"hide"` turns
  the legend into a visibility toggle — a single click hides or shows
  the series, a double-click isolates it (hides every other series;
  double-click again to restore all) — the reflexive legend interaction
  from plotly / ECharts / Highcharts. `"mute"` is the same but dims the
  series rather than removing it (keeping its layout). Hovering a swatch
  still highlights its series under every policy, and hidden series drop
  out of hover/tooltip hit-testing. Works with keyboard (Enter/Space on
  a focused swatch toggles) and is independent of the crosstalk
  cross-filter (the two never clobber each other). Entirely client-side.

- **Shared (unified) hover tooltips and a crosshair.**
  [`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md)
  gains a `hover_mode` argument. The default `"closest"` is unchanged
  (hover shows the single nearest mark), but `"x"` (or `"y"`) turns on a
  *unified* hover: every mark sharing the hovered x (or y) position is
  highlighted at once and listed together in one tooltip box — the
  shared readout multi-series line and time-series charts expect, where
  you want every series’ value at the cursor’s x rather than one point.
  A companion `crosshair` argument (default `FALSE`) draws a guide rule
  at the hovered position: a vertical rule at the shared x in `"x"`
  mode, a horizontal one in `"y"` mode, and a full cross through the
  mark in `"closest"` mode. Both are entirely client-side and need no
  extra scene metadata — the mark positions come straight from the
  element index — so they work on any keyed `vellumplot` plot or raw
  `vellum` scene, and in raster mode. Unified hover snaps along its axis
  so the readout tracks the cursor anywhere in the plot; the `hover`
  Shiny input still reports the single nearest (primary) mark, so the
  read-back contract is unchanged.

- **Fix: hover/selection feedback rings were drawn offset from the
  mark.** When the widget container was larger than the plot’s rendered
  box — which happens routinely, as htmlwidgets stamps an explicit
  `height` on the container and a fluid layout can stretch its width —
  the feedback overlay filled the whole container while the base SVG
  only filled its aspect-locked box. The overlay’s `viewBox` then
  letterboxed (centred), so every hover/selection ring drew off the real
  mark: downward when the container was taller (e.g. 68px low for a
  520px-tall container over a 384px plot) and sideways when it was
  wider. It looked like the wrong mark was picked. Hit-testing itself
  was always correct; only the visual feedback was displaced. The svg
  and its overlays now share a shrink-to-fit stage, so the overlay
  tracks the svg box exactly at any container size.

## vellumwidget 0.5.0

- **`text` argument on
  [`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md).**
  Choose how text is written into the SVG, passed through to
  [`vellum::scene_svg()`](https://r-vellum.github.io/vellum/reference/scene_svg.html):
  `"native"` (the default) emits selectable `<text>` referencing system
  fonts — smaller when the page has the font, post-processable, and
  better for accessibility and LLMs — while `"outline"` emits
  pixel-faithful, font-independent glyph paths. Applies to the
  per-element SVG path only; in raster mode text is baked into the base
  image and the argument is ignored (with a warning if set explicitly)
  ([\#1](https://github.com/r-vellum/vellumwidget/issues/1)).

- **New articles.** Two articles document the features added since
  0.4.0: *Linking views with crosstalk* (coordinating a widget with DT /
  plotly / leaflet and crosstalk’s `filter_*` inputs) and *Very large
  scenes* (raster mode, the spatial index, the columnar payload, and
  crisp zoom).

- **Crisp zoom in raster mode.** When you zoom into a raster-mode plot,
  the base image used to upscale and blur. The widget now redraws the
  points sharply on a `<canvas>` overlay while zoomed in — sampling each
  point’s colour straight from the rendered image and its position/size
  from the element index, so the crisp layer matches what vellum drew.
  It engages only when zoomed in (the faithful, anti-aliased base image
  still shows at the full view), redraws just the points in view, and
  degrades gracefully to the image alone where a 2D canvas context isn’t
  available. Entirely client-side; no change to the payload or to
  small/moderate (SVG-mode) plots.

- **Very large scatterplots are navigable (raster mode).**
  [`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md)
  gains a `mode` argument (`"auto"` / `"svg"` / `"raster"`). In `"auto"`
  (the default), a scene with more than `raster_threshold` keyed
  elements (default `20000`) is drawn **once as a single embedded
  image** instead of one SVG node per element, and all interaction —
  hover tooltips + highlight, click/brush select, pan/zoom — is driven
  client-side from the element index (bounding boxes + keys) rather than
  the DOM. A 150k-point keyed scatter that previously produced a ~75 MB
  SVG with 150,000 DOM nodes now ships as a ~0.8 MB image plus a compact
  index, with a handful of DOM nodes, and stays smooth to hover and pan.
  Small and moderate plots are unchanged (they keep the per-element
  SVG). Trade-offs in raster mode: per-element grammar colours, per-mark
  screen-reader focus, and display-tier cross-filtering don’t apply
  (there are no per-element nodes), and a zoomed-in view is a scaled
  raster until re-rendered. Adds a dependency on `base64enc`.

- **Smoother hover, brush, and pan on large plots.** Two client-side
  changes lift the per-interaction cost that made big scatterplots
  laggy:

  - **Spatial index.** Nearest-mark hover and rectangular brush now
    hit-test against a [Flatbush](https://github.com/mourner/flatbush)
    R-tree (O(log n) / O(k)) instead of scanning every element each
    time. The nearest-mark scan runs on every pointer move, so this is
    the change you feel most.
  - **Cheaper hover dim.** Above a threshold, hovering dims the plot
    once (via the holder’s opacity) and re-draws the hovered marks
    crisply in a small overlay — O(hovered) — instead of restyling
    *every* element via CSS (O(n)), which forced a full-scene style
    recalc on each hover. Small and moderate plots keep the exact
    previous per-mark dim. (Phase 2 of vellum’s big-data interactivity
    plan.)

- **Much faster, smaller payload for large plots (columnar element
  table).** The keyed-element metadata
  [`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md)
  embeds is now serialised in a *columnar* form (one array per field)
  instead of one JSON object per element. This is a transparent
  wire-format change — the widget behaves identically — but it removes
  the per-element serialisation cost that dominated at large N. On a
  150,000-point keyed scatter the payload build + serialise dropped from
  **~24 s / 89 MB to ~0.4 s / 12 MB** (~60x faster), so a big
  interactive scatter is no longer choked by payload generation. Small
  and moderate plots are unaffected. (This is Phase 1 of vellum’s
  big-data interactivity plan; the browser-side DOM/hover work for truly
  huge scatters follows in later phases.)

- **Error bars and boxplots are interactive.** Now that vellumplot keys
  these statistical marks, the widget hovers, tooltips, clicks/selects,
  and brushes them as units: an error bar’s bar + caps, or a box’s
  rect + median + whiskers, all light up and select together because
  they share one `data-key` (outliers stay individually addressable).
  Brush selection no longer double-counts a mark whose key spans several
  SVG elements — `input$<id>_brush$keys` reports each such key once. No
  runtime change was needed for the core behaviour; it already grouped
  every node sharing a key.

## vellumwidget 0.4.0

- **Server-to-client proxy
  ([`vellumwidget_proxy()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget_proxy.md)).**
  A Shiny app can now drive an already-rendered widget from the server
  **without re-rendering it** — no
  [`renderVellumwidget()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-shiny.md)
  round-trip, no lost pan/zoom. Get a handle with
  `vellumwidget_proxy(outputId)` (inside an
  [`observe()`](https://rdrr.io/pkg/shiny/man/observe.html)), then pipe
  it through the verbs:
  - [`vw_select()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md)
    /
    [`vw_clear_selection()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md)
    — set or clear the selection (projects across `hover_group` and
    propagates to linked / crosstalk widgets, exactly like a user click,
    and updates `input$<id>_selected`);
  - [`vw_filter()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md)
    /
    [`vw_clear_filter()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md)
    — cross-filter the widget (show only the given keys, dim the rest;
    display tier, data untouched);
  - [`vw_zoom()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md)
    /
    [`vw_reset_zoom()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md)
    — frame a set of keys, or restore the full view.

  All keys are the element `data_id`s — the same identifiers you read
  back through `input$<id>_selected`. This completes the two-way Shiny
  story begun with the input read-back in 0.3.0; see the expanded *Using
  vellumwidget in Shiny* article.

## vellumwidget 0.3.0

- Adopted vellum’s renamed `vl_*` graphics primitives (grid collision
  fix).

- **Shiny input read-back.** A widget rendered with
  [`vellumwidgetOutput()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-shiny.md)
  now reports the user’s interactions to the server as reactive inputs
  keyed by the output id: `input$<id>_selected` (selected keys, state),
  `input$<id>_click` (`list(key=)`, event), `input$<id>_hover` (hovered
  key or `NULL`, state), and `input$<id>_brush`
  (`list(keys=, x0=, y0=, x1=, y1=)`, event). Values are element data
  keys, so they map straight back to your data. Emitted only in a live
  Shiny session — a static render is unchanged and produces no input
  traffic. See the new *Using vellumwidget in Shiny* article. (Driving
  the widget from the server — a
  [`vellumwidget_proxy()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget_proxy.md)
  — is a planned follow-up.)

- **Accessibility (`a11y = TRUE`, on by default).** The interactive
  widget is now keyboard- and screen-reader-navigable, not a mute image:

  - the SVG is announced as an interactive chart
    (`role="graphics-document"` + `aria-roledescription`), labelled from
    the scene’s title/description (which `vellumplot` sets
    automatically) or an explicit `as_widget(alt =)`;
  - every mark is a focusable `graphics-symbol` with a **roving
    tabindex** — arrow keys move between marks, Enter/Space toggles
    selection, Escape exits;
  - a polite **`aria-live`** region announces the focused / selected
    mark;
  - a visually-hidden **data table** lists every mark for assistive
    tech. All gated on `a11y`; `a11y = FALSE` restores the previous
    output exactly. See the vellumplot *Accessibility* article.

## vellumwidget 0.2.0

Interaction-depth release (ROADMAP §4).

- **Rich tooltips.** Tooltip text now renders as *safe* HTML: an
  author-built `tooltip =` (e.g. via `glue()`) may use
  `<b>`/`<i>`/`<br>` for bold/italic/ line breaks. Data values are
  escaped and only inert, attribute-free tags are honoured — no scripts,
  handlers, or attributes (no XSS). New `as_widget(tooltip_style =)`
  themes the tooltip box (background/color/fontsize/ max_width).
- **Touch + keyboard.** The widget is driven by pointer events, so
  pan/brush/ hover work with mouse, touch, and pen from one path; a
  two-finger pinch zooms. With the widget focused, arrow keys pan,
  `+`/`-` zoom, and `0` resets.
- **Configurable export.**
  `as_widget(export_filename =, export_scale =)` set the download
  filename base and a hi-res PNG multiplier; exports capture the current
  (zoomed/panned) view. A “copy PNG to clipboard” toolbar button appears
  where the Clipboard API is available.
- **Large-N performance.** Hover/selection highlighting uses a
  per-render key→node cache instead of a `querySelectorAll` per key, and
  the nearest-mark hover scan is throttled to one per animation frame.
- New “Interactive widgets: a tour” article.

Deferred: a spatial index for hit-testing (the DOM cost was the real
bottleneck, now cached; bbox scans are cheap and datashade collapses
huge clouds to a raster); coordinated zoom across linked widgets and URL
deep-linking; PDF export.

## vellumwidget 0.1.0

First release. vellumwidget turns a `vellum` scene or a `vellumplot`
plot into a self-contained, client-side interactive HTML widget via a
single terminal
[`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md)
pipe — no Shiny, no server round-trip. Everything below ships in this
first release.

### Features

- [`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md)
  compiles a `vellumplot` plot or a raw `vellum` scene and bundles its
  SVG + `scene_model()` element table into an htmlwidget.
- **Hover** — tooltip (from the declared `tooltip`, falling back to the
  key) and highlight with inverse-dim; a hovered element’s `hover_group`
  highlights the whole group. Hover snaps to the **nearest mark** when
  the cursor isn’t directly over one.
- **Click** — select (single / multiple modes); every element sharing a
  key toggles together.
- **Brush** — drag a rectangle to select every element it covers.
- **Pan / zoom** — mouse wheel and pan-mode drag reframe the SVG
  `viewBox`, plus zoom-to-selection and reset.
- **Toolbar** (on hover) — brush/pan mode toggle, zoom-to-selection,
  reset zoom, download SVG, download PNG, fullscreen.
- Everything is opt-outable via
  [`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md)
  arguments
  (`tooltip`/`hover`/`select`/`brush`/`zoom`/`toolbar`/`nearest`).
- **Legend interaction.** For a discrete `color`/`shape` scale on an
  interactive plot, each legend swatch drives its whole data series:
  hovering a swatch highlights the series (the swatch stays lit),
  clicking it selects the series (and links across views / crosstalk).
  Automatic — no extra arguments.
- **Linked views.** `as_widget(group=)` links vellumwidget widgets
  client-side (no dependency): selecting/brushing in one highlights the
  same data keys in the others, projecting by `hover_group` (select one,
  select the series). `as_widget(crosstalk = SharedData)` bridges to the
  crosstalk ecosystem (plotly / leaflet / DT and `filter_*` inputs) via
  a `SelectionHandle` + `FilterHandle`; a crosstalk filter hides the
  non-matching marks (display-tier cross-filter). crosstalk is a
  Suggests, loaded only when used.
- **Customisable interaction styling**, at two composing levels:
  - *Widget theme* —
    `as_widget(hover_color=, selected_color=, dim_opacity=)` sets the
    look for the whole plot (any R or CSS colour).
  - *Per-element grammar* — `vellumplot` marks’
    `hover_color`/`selected_color` (constant or column-mapped) style
    each element individually and override the theme. Both use CSS
    variables with a defaults ← theme ← per-element cascade.

The JS runtime is TypeScript in `srcts/`, bundled by esbuild into the
committed `inst/htmlwidgets/vellumwidget.js` (so the R package installs
with no Node).
