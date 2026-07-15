# Drive an already-rendered widget from the Shiny server

`vellumwidget_proxy()` is the server-to-client counterpart of the input
read-back documented in
[vellumwidget-shiny](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-shiny.md).
It returns a lightweight handle to a widget that is **already on the
page**, so the server can change what the widget shows — set the
selection, cross-filter it, zoom it — **without re-rendering** it (no
[`renderVellumwidget()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-shiny.md)
round-trip, no full redraw, no lost pan/zoom). This mirrors
`leaflet::leafletProxy()` / `DT::dataTableProxy()` /
`plotly::plotlyProxy()`.

## Usage

``` r
vellumwidget_proxy(outputId, session = NULL)
```

## Arguments

- outputId:

  The id of the
  [`vellumwidgetOutput()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-shiny.md)
  to control (the un-namespaced id, as passed to
  [`vellumwidgetOutput()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-shiny.md);
  module namespacing is handled for you).

- session:

  The Shiny session; defaults to the current reactive domain, so you
  rarely pass it explicitly.

## Value

An object of class `"vellumwidget_proxy"` (invisibly from the verbs), to
be piped into
[`vw_select()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md)
and the other proxy verbs.

## Details

Call it inside an
[`observe()`](https://rdrr.io/pkg/shiny/man/observe.html) /
[`observeEvent()`](https://rdrr.io/pkg/shiny/man/observeEvent.html) with
the same `outputId` you gave
[`vellumwidgetOutput()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-shiny.md),
then pipe the handle through one or more of the verbs below. Each verb
sends a single custom message to the browser and returns the proxy
invisibly, so calls chain with the pipe.

- [`vw_select()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md):

  Replace the widget's selection with `keys` (the element `data_id`s).
  Selecting projects across a mark's `hover_group` and propagates to any
  linked / crosstalk widgets, exactly as a user click would, and updates
  `input$<id>_selected`.

- [`vw_clear_selection()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md):

  Clear the selection.

- [`vw_filter()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md):

  Cross-filter: show only the elements whose key is in `keys` and
  dim/hide the rest (display tier — the data is untouched).

- [`vw_clear_filter()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md):

  Remove the filter (show everything).

- [`vw_zoom()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md):

  Zoom/pan the view to frame the elements in `keys`.

- [`vw_reset_zoom()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md):

  Restore the original (full) view.

All keys are the element **data keys** — the `data_id` a `vellumplot`
mark declares — the same identifiers you receive back through
`input$<id>_selected` and friends.

## See also

[`vw_select()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md),
[`vw_filter()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md),
[`vw_zoom()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md);
[`vellumwidgetOutput()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-shiny.md)
and
[vellumwidget-shiny](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-shiny.md)
for reading interactions back.

## Examples

``` r
if (FALSE) { # \dontrun{
library(shiny)
server <- function(input, output, session) {
  output$plot <- renderVellumwidget(my_widget)
  # A server-side control drives the plot without redrawing it:
  observeEvent(input$highlight, {
    vellumwidget_proxy("plot") |> vw_select(input$highlight)
  })
  observeEvent(input$reset, {
    vellumwidget_proxy("plot") |> vw_clear_selection() |> vw_reset_zoom()
  })
}
} # }
```
