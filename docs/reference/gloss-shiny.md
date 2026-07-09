# Shiny bindings for gloss widgets

Standard
[htmlwidgets](https://rdrr.io/pkg/htmlwidgets/man/htmlwidgets-package.html)
output/render helpers so a `gloss` widget can appear in a Shiny app or
an interactive R Markdown document.

## Usage

``` r
glossOutput(outputId, width = "100%", height = "400px")

renderGloss(expr, env = parent.frame(), quoted = FALSE)
```

## Arguments

- outputId:

  Shiny output slot id.

- width, height:

  Widget size.

- expr:

  An expression producing a `gloss` widget.

- env, quoted:

  Standard non-standard-evaluation plumbing.

## Value

`glossOutput()`: a Shiny output UI element. `renderGloss()`: a Shiny
render function.

## Reading interactions server-side

A widget rendered as `glossOutput("plot")` reports the user's
interactions back to the server as reactive inputs, keyed by the output
id. All values are the element **data keys** (the `data_id` a `quill`
mark declares); map them back to your data by that key.

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

  A list `list(keys=, x0=, y0=, x1=, y1=)` when a brush gesture
  completes: the selected keys and the brushed rectangle in the scene's
  device-pixel (viewBox) coordinates. An event input.

These are emitted only inside a live Shiny session; a static render
(knitr, pkgdown,
[`htmltools::save_html()`](https://rstudio.github.io/htmltools/reference/save_html.html))
produces identical output and no input traffic. Driving the widget
*from* the server (setting selection without a re-render) is a planned
addition.

## See also

[`as_widget()`](https://schochastics.github.io/gloss/reference/as_widget.md)
