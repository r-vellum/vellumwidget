# Shiny bindings for vellumwidget widgets

Standard
[htmlwidgets](https://rdrr.io/pkg/htmlwidgets/man/htmlwidgets-package.html)
output/render helpers so a `vellumwidget` widget can appear in a Shiny
app or an interactive R Markdown document.

## Usage

``` r
vellumwidgetOutput(outputId, width = "100%", height = "400px")

renderVellumwidget(expr, env = parent.frame(), quoted = FALSE)
```

## Arguments

- outputId:

  Shiny output slot id.

- width, height:

  Widget size.

- expr:

  An expression producing a `vellumwidget` widget.

- env, quoted:

  Standard non-standard-evaluation plumbing.

## Value

`vellumwidgetOutput()`: a Shiny output UI element.
`renderVellumwidget()`: a Shiny render function.

## Reading interactions server-side

A widget rendered as `vellumwidgetOutput("plot")` reports the user's
interactions back to the server as reactive inputs, keyed by the output
id. All values are the element **data keys** (the `data_id` a
`vellumplot` mark declares); map them back to your data by that key.

- `input$plot_selected`:

  Character vector of the currently selected keys (click / brush /
  keyboard, and any selection arriving from a linked widget). Updates as
  state — re-selecting the same set is a no-op. `character(0)` when
  nothing is selected.

- `input$plot_click`:

  A list `list(key=)` for each click; `key` is `NULL` for a click on
  empty space. An event input — fires on every click, even the same mark
  twice.

- `input$plot_hover`:

  The hovered key, or `NULL` when the pointer leaves a mark. Updates as
  state (re-fires only when the hovered key changes).

- `input$plot_brush`:

  A list `list(keys=, x0=, y0=, x1=, y1=)` when a brush (or lasso)
  gesture completes: the selected keys and the region's bounding
  rectangle in the scene's device-pixel (viewBox) coordinates. A lasso
  gesture also carries `lasso = TRUE`. When the plot carries a cartesian
  scale (a `vellumplot` plot), it *also* carries the region's
  **data-space** bounds `x0d,y0d,x1d,y1d` and the `panel` name. An event
  input.

- `input$plot_zoom`:

  A list `list(x=, y=, w=, h=, zoomed=)` — the current view (the SVG
  `viewBox` in device-pixel coordinates) plus a `zoomed` flag (is the
  view narrower/shorter than the full extent). For a single-panel
  cartesian plot it also carries
  `data = list(x=c(lo,hi), y=c(lo,hi), panel=)`, the visible range in
  **data** coordinates. Updates as state when a zoom/pan settles (wheel,
  drag-pan release, pinch, keyboard, reset, zoom-to-selection, or a
  proxy
  [`vw_zoom()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md)).

Data-space coordinates (`x0d`/… and `zoom$data`) come from the per-panel
scale descriptors `vellumplot` attaches to the scene; a raw `vellum`
scene or a non-cartesian coordinate system carries none, and only the
device-pixel fields are reported. Date/time axes report the numeric
epoch (days for `Date`, seconds for `POSIXct`), which you map back with
[`as.Date()`](https://rdrr.io/r/base/as.Date.html) /
[`.POSIXct()`](https://rdrr.io/r/base/base-internal.html).

These are emitted only inside a live Shiny session; a static render
(knitr, pkgdown,
[`htmltools::save_html()`](https://rstudio.github.io/htmltools/reference/save_html.html))
produces identical output and no input traffic. To drive the widget
*from* the server — set the selection, cross-filter it, or zoom it
without a re-render — use
[`vellumwidget_proxy()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget_proxy.md).

## See also

[`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md)
