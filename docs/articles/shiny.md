# Using gloss in Shiny

A `gloss` widget is interactive on its own — hover, select, brush,
pan/zoom — with no server round-trip. Inside Shiny it also **reports
those interactions back** as reactive inputs, so an app can respond to
what the user does on the plot: filter a table to the brushed points,
show details for the hovered mark, drive another output from the
selection.

## The two bindings

Render a widget with the standard htmlwidgets pair, exactly like
`plotly` or `DT`:

``` r

library(shiny)
library(quill)
library(gloss)

ui <- fluidPage(
  glossOutput("plot", height = "500px"),
  verbatimTextOutput("info")
)

server <- function(input, output) {
  output$plot <- renderGloss({
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

The inputs are named `<outputId>_<event>` — so for `glossOutput("plot")`
they are `input$plot_selected`, `input$plot_click`, `input$plot_hover`,
and `input$plot_brush`. **Every value is expressed in element keys** —
the `data_id` you set on the mark — so you map back to your data by that
key.

| Input | Value | Kind |
|----|----|----|
| `input$plot_selected` | character vector of selected keys (`character(0)` if none) | state |
| `input$plot_click` | `list(key=)` — `key` is `NULL` for an empty-space click | event |
| `input$plot_hover` | the hovered key, or `NULL` on leave | state |
| `input$plot_brush` | `list(keys=, x0=, y0=, x1=, y1=)` — keys + brushed rectangle (device px) | event |

**State vs event.** *State* inputs (`_selected`, `_hover`) update only
when the value changes, so re-selecting the same set does not re-fire —
pair them with [`observe()`](https://rdrr.io/pkg/shiny/man/observe.html)
/ [`reactive()`](https://rdrr.io/pkg/shiny/man/reactive.html). *Event*
inputs (`_click`, `_brush`) fire on every occurrence, even a repeat —
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

## Notes

- The `data_id` (mark key) is what everything reports; without it the
  marks are drawn but carry no identity to report. `tooltip` is
  independent — it is what the hover box shows, not what the input
  carries.
- The inputs fire only inside a live Shiny session. A static render
  (knitr, pkgdown,
  [`htmltools::save_html()`](https://rstudio.github.io/htmltools/reference/save_html.html))
  is byte-for-byte identical and emits nothing.
- The same keys are what a
  [crosstalk](https://rstudio.github.io/crosstalk/) `SharedData` uses,
  so a gloss widget can link to `DT`, `plotly`, or `leaflet` client-side
  *without* Shiny — see `as_widget(crosstalk=)`. Shiny inputs and
  crosstalk are complementary: use Shiny when the server needs to react,
  crosstalk for pure client-side linking.
- Driving the widget *from* the server — setting the selection or a
  filter without re-rendering — is a planned addition (a
  `gloss_proxy()`), not yet available.

See the [interactive widgets
tour](https://schochastics.github.io/gloss/articles/interactivity.md)
for the full set of client-side interactions, and the [accessibility
article](https://schochastics.github.io/quill/articles/accessibility.html)
for the keyboard and screen-reader model.
