# Using vellumwidget in Shiny

A `vellumwidget` widget is interactive on its own (hover, select, brush,
pan/zoom) with no server round-trip. Inside Shiny it also **reports
those interactions back** as reactive inputs, so an app can respond to
what the user does on the plot: filter a table to the brushed points,
show details for the hovered mark, drive another output from the
selection.

## The two bindings

Render a widget with the standard htmlwidgets pair, exactly like
`plotly` or `DT`:

``` r

library(shiny)
library(vellumplot)
library(vellumwidget)

ui <- fluidPage(
  vellumwidgetOutput("plot", height = "500px"),
  verbatimTextOutput("info")
)

server <- function(input, output) {
  output$plot <- renderVellumwidget({
    vplot(mtcars) |>
      mark_point(
        x = wt, y = mpg,
        tooltip = rownames(mtcars),
        data_id = rownames(mtcars) # <- the key each interaction reports
      ) |>
      as_widget()
  })

  output$info <- renderPrint({
    input$plot_selected # the keys currently selected
  })
}

shinyApp(ui, server)
```

## What the widget reports

The inputs are named `<outputId>_<event>`, so for
`vellumwidgetOutput("plot")` they are `input$plot_selected`,
`input$plot_click`, `input$plot_hover`, and `input$plot_brush`. **Every
value is expressed in element keys** (the `data_id` you set on the
mark), so you map back to your data by that key.

| Input | Value | Kind |
|----|----|----|
| `input$plot_selected` | character vector of selected keys (`character(0)` if none) | state |
| `input$plot_click` | `list(key=)` — `key` is `NULL` for an empty-space click | event |
| `input$plot_hover` | the hovered key, or `NULL` on leave | state |
| `input$plot_brush` | `list(keys=, x0=, y0=, x1=, y1=)` — keys + brushed rectangle (device px) | event |

**State vs event.** *State* inputs (`_selected`, `_hover`) update only
when the value changes, so re-selecting the same set does not re-fire;
pair them with [`observe()`](https://rdrr.io/pkg/shiny/man/observe.html)
/ [`reactive()`](https://rdrr.io/pkg/shiny/man/reactive.html). *Event*
inputs (`_click`, `_brush`) fire on every occurrence, even a repeat;
pair them with
[`observeEvent()`](https://rdrr.io/pkg/shiny/man/observeEvent.html).

## Reacting to interactions

Because everything is keyed, the common patterns are one-liners. Filter
a table to the brushed points:

``` r

output$table <- renderTable({
  keys <- input$plot_brush$keys
  if (length(keys)) mtcars[rownames(mtcars) %in% keys, ] else mtcars[0, ]
})
```

Show the hovered car:

``` r

output$detail <- renderText({
  k <- input$plot_hover
  if (is.null(k)) "Hover a point" else paste(k, "-", mtcars[k, "hp"], "hp")
})
```

Respond to each click:

``` r

observeEvent(input$plot_click, {
  key <- input$plot_click$key
  if (!is.null(key)) showNotification(paste("clicked", key))
})
```

## Driving the widget from the server

Reading interactions is one direction; the other is the server
*changing* what the widget shows.
[`vellumwidget_proxy()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget_proxy.md)
gives you a handle to a widget that is **already on the page** and
drives it **without re-rendering** — the SVG is not rebuilt, so the
current pan/zoom and the smooth feel are preserved. It works exactly
like `leaflet::leafletProxy()`, `DT::dataTableProxy()`, or
`plotly::plotlyProxy()`.

Call it with the same `outputId` you gave
[`vellumwidgetOutput()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-shiny.md),
then pipe the handle through the verbs:

| Verb | Effect |
|----|----|
| `vw_select(keys)` / [`vw_clear_selection()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md) | set / clear the selection |
| `vw_filter(keys)` / [`vw_clear_filter()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md) | cross-filter to `keys` (dim the rest) / remove the filter |
| `vw_zoom(keys)` / [`vw_reset_zoom()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md) | frame `keys` / restore the full view |

All `keys` are the element `data_id`s — the very same identifiers you
get back through `input$plot_selected`. For example, a `selectInput`
that highlights cars on the plot, and a button that clears everything:

``` r

ui <- fluidPage(
  selectInput("pick", "Highlight", choices = rownames(mtcars), multiple = TRUE),
  actionButton("reset", "Reset"),
  vellumwidgetOutput("plot", height = "500px")
)

server <- function(input, output, session) {
  output$plot <- renderVellumwidget({
    vplot(mtcars) |>
      mark_point(x = wt, y = mpg, data_id = rownames(mtcars)) |>
      as_widget()
  })

  # server -> client: highlight and zoom to the picked cars, no re-render
  observeEvent(input$pick, ignoreNULL = FALSE, {
    vellumwidget_proxy("plot") |>
      vw_select(input$pick) |>
      vw_zoom(input$pick) # empty selection resets the view
  })

  observeEvent(input$reset, {
    vellumwidget_proxy("plot") |>
      vw_clear_selection() |>
      vw_reset_zoom()
  })
}
```

A server-driven
[`vw_select()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md)
behaves just like a user click: it projects across a mark’s
`hover_group`, propagates to any linked / crosstalk widgets, and updates
`input$plot_selected`. If you also *observe* `input$plot_selected` and
call
[`vw_select()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md)
from there, guard against the echo (e.g. only act when the value
actually differs) to avoid a feedback loop — the usual Shiny proxy
caution.

## Notes

- The `data_id` (mark key) is what everything reports; without it the
  marks are drawn but carry no identity to report. `tooltip` is
  independent; it is what the hover box shows, not what the input
  carries.
- The inputs fire only inside a live Shiny session. A static render
  (knitr, pkgdown,
  [`htmltools::save_html()`](https://rstudio.github.io/htmltools/reference/save_html.html))
  is byte-for-byte identical and emits nothing.
- The same keys are what a
  [crosstalk](https://rstudio.github.io/crosstalk/) `SharedData` uses,
  so a vellumwidget widget can link to `DT`, `plotly`, or `leaflet`
  client-side *without* Shiny. See `as_widget(crosstalk=)`. Shiny inputs
  and crosstalk are complementary: use Shiny when the server needs to
  react, crosstalk for pure client-side linking.
- Driving the widget *from* the server — selection, filter, zoom — is
  [`vellumwidget_proxy()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget_proxy.md),
  above. Shiny inputs (client → server), crosstalk (client ↔︎ client),
  and the proxy (server → client) are the three linking directions.

See the [interactive widgets
tour](https://r-vellum.github.io/vellumwidget/articles/interactivity.md)
for the full set of client-side interactions, and the [accessibility
article](https://r-vellum.github.io/vellumplot/articles/accessibility.html)
for the keyboard and screen-reader model.
