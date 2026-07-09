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
  zoom = TRUE,
  toolbar = TRUE,
  nearest = TRUE,
  a11y = TRUE,
  alt = NULL,
  hover_color = NULL,
  selected_color = NULL,
  dim_opacity = NULL,
  tooltip_style = NULL,
  export_filename = NULL,
  export_scale = NULL,
  group = NULL,
  crosstalk = NULL,
  select_mode = c("multiple", "single"),
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

- nearest:

  When `TRUE` (default), hover snaps to the nearest mark within a small
  radius when the cursor is not directly over one (helps sparse points).

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
  keys in the others — no Shiny, no crosstalk. Selection projects by
  `hover_group` when the marks declare it (select one, select the whole
  series).

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
