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
  toolbar = TRUE,
  navigator = FALSE,
  hover_mode = c("closest", "x", "y"),
  crosshair = FALSE,
  legend_click = c("select", "hide", "mute"),
  a11y = TRUE,
  alt = NULL,
  tooltip = tooltip_options(),
  export = export_options(),
  group = NULL,
  crosstalk = NULL,
  select_mode = c("multiple", "single"),
  render = render_options(),
  elementId = NULL,
  ...
)
```

## Arguments

- x:

  A `vellumplot` plot (a `PlotSpec` / `PlotComposition`) or a `vellum`
  scene — anything
  [`vellum::as_vellum_scene()`](https://r-vellum.github.io/vellum/reference/as_vellum_scene.html)
  accepts. Also a keyframe animation from
  [`vellumplot::animate()`](https://r-vellum.github.io/vellumplot/reference/animate.html),
  embedded as a self-contained animated SVG (no per-element
  interaction). It autoplays and loops, with playback controls in the
  bottom-left corner: a play/pause button, always shown, and a frame
  scrubber that appears on hover or keyboard focus. Dragging the
  scrubber pauses on the chosen frame. When the reader's system asks for
  reduced motion (`prefers-reduced-motion`), the animation starts paused
  on its still frame; the button still plays it. Without JavaScript (the
  SVG on its own) it loops as before.

- width, height:

  Widget size (any valid CSS size, or `NULL` to size from the scene).
  Passed to
  [`htmlwidgets::createWidget()`](https://rdrr.io/pkg/htmlwidgets/man/createWidget.html).

- toolbar:

  Show the on-hover toolbar (default `TRUE`). Hover tooltip, highlight,
  click-select, brush, lasso, pan/zoom, and axis-aware zoom are **on by
  default** (interactive-by-default) and no longer have per-widget
  toggles; per-mark hover/select styling and selection-driven behaviour
  are declared in the plot spec instead (see
  [`vellumplot::condition()`](https://r-vellum.github.io/vellumplot/reference/condition.html)
  /
  [`vellumplot::select_point()`](https://r-vellum.github.io/vellumplot/reference/select_point.html)).

- navigator:

  Show an overview **range navigator** below the plot (default `FALSE`):
  a full-width strip rendering the whole scene in miniature, with a
  draggable, resizable window marking the visible x-range. Drag the
  window to pan, drag a handle to zoom; it stays two-way in sync with
  the main view (wheel/keyboard/brush and linked-group changes all move
  it). Useful for long series. `TRUE` shows it with the defaults; pass
  [`navigator_options()`](https://r-vellum.github.io/vellumwidget/reference/widget-options.md)
  to show it and set its height.

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

- tooltip:

  Tooltip behaviour and style, from
  [`tooltip_options()`](https://r-vellum.github.io/vellumwidget/reference/widget-options.md):
  the show delay, whether the box follows the cursor, whether it is
  sticky, and the box style. `NULL` is the same as
  [`tooltip_options()`](https://r-vellum.github.io/vellumwidget/reference/widget-options.md).

- export:

  The toolbar's SVG/PNG download settings, from
  [`export_options()`](https://r-vellum.github.io/vellumwidget/reference/widget-options.md):
  the filename and PNG scale. `NULL` is the same as
  [`export_options()`](https://r-vellum.github.io/vellumwidget/reference/widget-options.md).

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

- render:

  How the marks are drawn, from
  [`render_options()`](https://r-vellum.github.io/vellumwidget/reference/widget-options.md):
  per-element SVG or a single raster image (`mode`), the element count
  at which `"auto"` switches to the image (`raster_threshold`), and how
  SVG text is written (`text`). `NULL` is the same as
  [`render_options()`](https://r-vellum.github.io/vellumwidget/reference/widget-options.md).

- elementId:

  Optional explicit widget DOM id.

- ...:

  Deprecated flat arguments, still accepted with a once-per-session
  warning: `tooltip_delay`, `tooltip_follow`, `tooltip_sticky` and
  `tooltip_style` (now `tooltip = tooltip_options()`), `export_filename`
  and `export_scale` (now `export = export_options()`),
  `navigator_height` (now `navigator = navigator_options()`), and
  `mode`, `raster_threshold` and `text` (now
  `render = render_options()`).

## Value

An htmlwidget of class `"vellumwidget"`.

## Details

Interactivity is driven by the keys/metadata a plot declares. In
`vellumplot` these come from the reserved `data_id` / `tooltip` /
`hover_group` mark arguments; a plot that declares none renders as a
static (but still embeddable) SVG. A hovered element with a `data_id`
but no `tooltip` shows its key.

Graph
([`vgraph()`](https://r-vellum.github.io/vellumplot/reference/vgraph.html))
plots that declare
[`vellumplot::select_neighbours()`](https://r-vellum.github.io/vellumplot/reference/select_neighbours.html)
are enacted here: hovering a node spotlights its neighbourhood (the
node, its incident edges, and its adjacent nodes) and dims the rest, and
hovering an edge spotlights its two endpoints. The adjacency is
reconstructed from the endpoint identity each edge carries — no extra
configuration.

The scene metadata `vellumwidget` reads — the
[`vellum::scene_model()`](https://r-vellum.github.io/vellum/reference/scene_model.html)
element table and the SVG `data-key` / `data-vellum-*` attributes — is
specified in vellum's "The scene contract" vignette
([`vignette("scene-contract", package = "vellum")`](https://r-vellum.github.io/vellum/articles/scene-contract.html)).

## See also

[`tooltip_options()`](https://r-vellum.github.io/vellumwidget/reference/widget-options.md),
[`export_options()`](https://r-vellum.github.io/vellumwidget/reference/widget-options.md),
[`navigator_options()`](https://r-vellum.github.io/vellumwidget/reference/widget-options.md)
and
[`render_options()`](https://r-vellum.github.io/vellumwidget/reference/widget-options.md)
for the grouped settings.

## Examples

``` r
if (FALSE) { # \dontrun{
library(vellumplot)
df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, model = rownames(mtcars))
vplot(df) |>
  mark_point(x = wt, y = mpg, tooltip = model, data_id = model) |>
  as_widget()

# Grouped options
vplot(df) |>
  mark_point(x = wt, y = mpg, tooltip = model, data_id = model) |>
  as_widget(
    tooltip = tooltip_options(delay = 250, style = list(background = "#1d3557")),
    export = export_options(filename = "mtcars", scale = 2),
    render = render_options(mode = "svg")
  )
} # }
```
