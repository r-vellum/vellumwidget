# Turn a vellum scene (or vellumplot plot) into an interactive widget

`as_widget()` is the terminal verb of the interactivity pipeline: it
compiles its input to a `vellum` scene, emits the SVG (with per-element
`data-key`s) and the
[`vellum::scene_model()`](https://r-vellum.github.io/vellum/reference/scene_model.html)
element table, and bundles them with the `vellumwidget` JavaScript
runtime into a self-contained
[`htmlwidgets::createWidget()`](https://rdrr.io/pkg/htmlwidgets/man/createWidget.html)
widget. The result does hover tooltips, hover highlighting, and click
selection entirely client-side — no Shiny, no server round-trip.
Pan/zoom, brush, and selection work with mouse, touch (drag to pan,
two-finger pinch to zoom), and keyboard input: the arrows pan and
`+`/`-`/`0` zoom and reset, except that with accessibility on (the
default) the arrows move between marks while one is focused — see the
`a11y` argument.

## Usage

``` r
as_widget(
  x,
  width = NULL,
  height = NULL,
  tooltip = TRUE,
  hover = TRUE,
  select = TRUE,
  brush = TRUE,
  lasso = TRUE,
  zoom = TRUE,
  toolbar = TRUE,
  nearest = TRUE,
  navigator = FALSE,
  navigator_height = NULL,
  axis_zoom = TRUE,
  hover_mode = c("closest", "x", "y"),
  crosshair = FALSE,
  legend_click = c("select", "hide", "mute"),
  a11y = TRUE,
  alt = NULL,
  hover_color = NULL,
  selected_color = NULL,
  dim_opacity = NULL,
  tooltip_delay = 0,
  tooltip_follow = TRUE,
  tooltip_sticky = FALSE,
  tooltip_style = NULL,
  export_filename = NULL,
  export_scale = NULL,
  group = NULL,
  crosstalk = NULL,
  select_mode = c("multiple", "single"),
  mode = c("auto", "svg", "raster"),
  raster_threshold = 20000L,
  text = c("native", "outline"),
  elementId = NULL
)
```

## Arguments

- x:

  A `vellumplot` plot (a `PlotSpec` / `PlotComposition`) or a `vellum`
  scene — anything
  [`vellum::as_vellum_scene()`](https://r-vellum.github.io/vellum/reference/as_vellum_scene.html)
  accepts.

- width, height:

  Widget size (any valid CSS size, or `NULL` to size from the scene).
  Passed to
  [`htmlwidgets::createWidget()`](https://rdrr.io/pkg/htmlwidgets/man/createWidget.html).

- tooltip, hover, select:

  Toggles for the three hover/click interactions (all `TRUE`).

- brush, zoom, toolbar:

  Toggles for rectangular brush-select, wheel/drag pan-zoom (via the SVG
  `viewBox`), and the on-hover toolbar (all `TRUE`).

- lasso:

  Enable freehand **lasso-select** (default `TRUE`): a third drag mode
  alongside brush and pan, cycled from the toolbar's mode button. Drag a
  loop and every mark whose centre falls inside it is selected. Like the
  brush, it reports through `input$<id>_brush` (with a `lasso = TRUE`
  flag and the loop's bounding box). The mode button appears whenever at
  least two drag modes are enabled.

- nearest:

  When `TRUE` (default), hover snaps to the nearest mark within a small
  radius when the cursor is not directly over one (helps sparse points).

- navigator:

  Show an overview **range navigator** below the plot (default `FALSE`):
  a full-width strip rendering the whole scene in miniature, with a
  draggable, resizable window marking the visible x-range. Drag the
  window to pan, drag a handle to zoom; it stays two-way in sync with
  the main view (wheel/keyboard/brush and linked-group changes all move
  it). Useful for long series. `navigator_height` sets the strip height
  in pixels (default `56`).

- navigator_height:

  Height of the navigator strip in pixels (default `56`); ignored unless
  `navigator = TRUE`.

- axis_zoom:

  **Axis-aware zoom** (default `TRUE`). Wheel/drag zoom scales only the
  plot's data region and re-ticks the axes for the visible range,
  holding the frame — axes, titles and legend — in place, the way a
  chart library zooms (rather than scaling the whole scene like an
  image). Applies to a single **linear** cartesian panel (continuous
  `identity`/`reverse` axes) rendered as SVG; plots with
  log/date/discrete axes, several panels, or in raster mode silently
  fall back to the ordinary whole-scene zoom, so leaving it on is always
  safe. Set `FALSE` to force the plain whole-scene viewBox zoom. Builds
  on vellum's pannable-panel contract (`vl_viewport(pannable=)`) and the
  panel scale metadata vellumplot emits (needs the current
  `vellum`/`vellumplot`). When combined with `navigator = TRUE`, the
  navigator's x-only zoom is rendered through it, so the x-axis re-ticks
  crisply instead of stretching.

- hover_mode:

  How hover gathers marks into the tooltip. `"closest"` (default) shows
  the single nearest mark. `"x"` (or `"y"`) gives a *unified* hover:
  every mark sharing the hovered x (or y) position is highlighted and
  listed together in one box — the shared readout multi-series line and
  time-series charts expect. Unified mode always snaps along its axis,
  so the readout tracks the cursor regardless of `nearest`. The mark
  positions come from the element index, so no axis metadata is
  required; the box lists each mark's `tooltip` (one row per series)
  without a value-axis header.

- crosshair:

  Draw a guide rule at the hovered position (default `FALSE`): a
  vertical rule at the shared x when `hover_mode = "x"`, a horizontal
  rule when `"y"`, and a full cross through the mark when `"closest"`.
  Colour is the `--vellumwidget-crosshair-stroke` CSS variable (a muted
  grey by default).

- legend_click:

  What clicking a discrete-legend swatch does. `"select"` (default)
  selects the swatch's whole series (the established behaviour).
  `"hide"` makes the legend a visibility toggle — a single click
  hides/shows the series, a double-click isolates it (hides every other
  series; double-click again to restore all) — the reflexive legend
  interaction in plotly / ECharts / Highcharts. `"mute"` is the same but
  dims the series instead of removing it (its layout is kept). Hovering
  a swatch still highlights its series under every policy. Applies only
  where the plot draws an interactive legend (a discrete `color` /
  `shape` scale in `vellumplot`).

- a11y:

  Accessibility (default `TRUE`). Makes the widget a keyboard- and
  screen-reader-navigable chart: the SVG is labelled as an interactive
  chart (`role="graphics-document"`), each mark is a focusable
  `graphics-symbol` with a roving tabindex (arrow keys move between
  marks, Enter/Space select, Escape exits), a polite `aria-live` region
  announces the focused/selected mark, and a visually-hidden data table
  lists every mark for assistive tech. `FALSE` restores the previous
  behaviour (no chart semantics, marks not focusable).

- alt:

  Accessible label (alt text) for the chart as a whole. Defaults to the
  scene's own title/description — which `vellumplot` sets automatically
  from the plot title and
  [`vellumplot::plot_alt()`](https://r-vellum.github.io/vellumplot/reference/plot_alt.html)
  — so an explicit value is only needed for a raw `vellum` scene or to
  override.

- hover_color, selected_color:

  Outline colours for hovered / selected elements (any R or CSS colour),
  applied widget-wide. `hover_color = NULL` (default) keeps the plain
  dim-others hover; `selected_color = NULL` uses the built-in default. A
  per-mark `hover_color`/`selected_color` declared in `vellumplot`
  overrides these for that mark.

- dim_opacity:

  Opacity (0–1) of the non-hovered elements while hovering (default
  `0.28`); `NULL` keeps the default.

- tooltip_delay:

  Milliseconds to wait before the tooltip appears on hover (default `0`,
  i.e. immediate). The highlight is unaffected — only the tooltip waits.
  A short delay (e.g. `250`) calms a dense scatter.

- tooltip_follow:

  When `TRUE` (default) the tooltip tracks the cursor; when `FALSE` it
  anchors above the hovered mark's centre.

- tooltip_sticky:

  When `TRUE`, the tooltip accepts pointer events and lingers briefly
  when you leave the mark, so you can move into it — for tooltips that
  contain links or buttons (build the HTML via `tooltip =`). Default
  `FALSE`.

- tooltip_style:

  Optional named list styling the tooltip box: `background` / `color`
  (any R or CSS colour), `fontsize`, and `max_width` (any CSS length).
  `NULL` (default) uses the built-in style. Tooltip text is rendered as
  safe HTML — an author-built `tooltip =` (e.g. via `glue()`) may use
  `<b>`/`<i>`/`<br>` for bold/italic/line breaks; data values are
  escaped and only those inert tags are honoured (no
  scripts/attributes).

- export_filename, export_scale:

  The download filename base (no extension; default `"plot"`) and the
  PNG resolution multiplier (default `1`) for the toolbar's SVG/PNG
  export. Exports capture the current (zoomed/panned) view.

- group:

  Optional linking group name. Widgets sharing a `group` link
  client-side: selecting (or brushing) in one highlights the same data
  keys in the others, and panning/zooming one **pans/zooms the others**
  to the same relative view — no Shiny, no crosstalk. Selection projects
  by `hover_group` when the marks declare it (select one, select the
  whole series). Linked pan/zoom shares the view as a *fraction* of each
  widget's own extent, so it links correctly even across
  differently-sized plots (e.g. small multiples).

- crosstalk:

  Optional
  [crosstalk::SharedData](https://rdrr.io/pkg/crosstalk/man/SharedData.html)
  (or a crosstalk group name string) to link this widget with the
  crosstalk ecosystem (plotly, leaflet, DT, and crosstalk's `filter_*`
  inputs). The widget's `data_id`s must match the SharedData's keys. A
  crosstalk filter hides the non-matching elements (display-tier
  cross-filter). Requires the crosstalk package.

- select_mode:

  `"multiple"` (default; click toggles each element) or `"single"`
  (click replaces the selection).

- mode:

  Rendering strategy for the marks. `"auto"` (default) ships a
  per-element SVG for small/moderate plots and switches to a single
  embedded raster image above `raster_threshold` keyed elements; `"svg"`
  always uses the per-element SVG; `"raster"` always uses the image. In
  raster mode the marks are drawn once as a base image and all
  interaction (hover, click, brush, pan/zoom) is driven client-side from
  the element index (bounding boxes + keys), so a very large scatter
  (100k+ points) stays navigable with a tiny DOM and a small payload.
  The trade-offs of raster mode: per-element grammar colours, per-mark
  screen-reader focus, and display-tier cross-filtering do not apply
  (there are no per-element DOM nodes), and a zoomed-in view is a scaled
  raster until re-rendered.

- raster_threshold:

  Keyed-element count above which `mode = "auto"` switches to the raster
  image (default `20000`).

- text:

  How text is written into the SVG, passed to
  [`vellum::scene_svg()`](https://r-vellum.github.io/vellum/reference/scene_svg.html):
  `"native"` (default) emits selectable `<text>` referencing system
  fonts — smaller when the page has the font, post-processable, and
  better for accessibility and LLMs; `"outline"` emits glyph outlines
  that are pixel-faithful and font-independent but not selectable.
  Applies to the per-element SVG path only; in raster mode (see `mode`)
  text is baked into the base image and this argument is ignored (with a
  warning if set explicitly).

- elementId:

  Optional explicit widget DOM id.

## Value

An htmlwidget of class `"vellumwidget"`.

## Details

Interactivity is driven by the keys/metadata a plot declares. In
`vellumplot` these come from the reserved `data_id` / `tooltip` /
`hover_group` mark arguments; a plot that declares none renders as a
static (but still embeddable) SVG. A hovered element with a `data_id`
but no `tooltip` shows its key.

The scene metadata `vellumwidget` reads — the
[`vellum::scene_model()`](https://r-vellum.github.io/vellum/reference/scene_model.html)
element table and the SVG `data-key` / `data-vellum-*` attributes — is
specified in vellum's "The scene contract" vignette
([`vignette("scene-contract", package = "vellum")`](https://r-vellum.github.io/vellum/articles/scene-contract.html)).

## Examples

``` r
if (FALSE) { # \dontrun{
library(vellumplot)
df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, model = rownames(mtcars))
vplot(df) |>
  mark_point(x = wt, y = mpg, tooltip = model, data_id = model) |>
  as_widget()
} # }
```
