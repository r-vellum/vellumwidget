# Option helpers for `as_widget()`

These helpers group related
[`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md)
settings into one argument each:

## Usage

``` r
tooltip_options(delay = 0, follow = TRUE, sticky = FALSE, style = NULL)

export_options(filename = "plot", scale = 1)

navigator_options(height = 56)

render_options(
  mode = c("auto", "svg", "raster"),
  raster_threshold = 20000L,
  text = c("native", "outline"),
  max_marks = 500000L,
  detail_marks = 3000L
)
```

## Arguments

- delay:

  Milliseconds to wait before the tooltip appears on hover (default `0`,
  i.e. immediate). The highlight is unaffected — only the tooltip waits.
  A short delay (e.g. `250`) calms a dense scatter.

- follow:

  When `TRUE` (default) the tooltip tracks the cursor; when `FALSE` it
  anchors above the hovered mark's centre.

- sticky:

  When `TRUE`, the tooltip accepts pointer events and lingers briefly
  when you leave the mark, so you can move into it — for tooltips that
  contain links or buttons (build the HTML via `tooltip =` in the plot).
  Default `FALSE`.

- style:

  Optional named list styling the tooltip box: `background` / `color`
  (any R or CSS colour), `fontsize`, and `max_width` (any CSS length; a
  bare number is used as is). `NULL` (default) uses the built-in style.
  Tooltip text is rendered as safe HTML — an author-built `tooltip =`
  (e.g. via `glue()`) may use `<b>`/`<i>`/`<br>` for bold/italic/line
  breaks; data values are escaped and only those inert tags are honoured
  (no scripts/attributes).

- filename:

  The download filename base, without extension (default `"plot"`).

- scale:

  The PNG resolution multiplier (default `1`). Exports capture the
  current (zoomed/panned) view.

- height:

  Height of the navigator strip in pixels (default `56`). Passing
  `navigator_options()` to `as_widget(navigator = )` turns the navigator
  on; `navigator = TRUE` is the same as
  `navigator = navigator_options()`.

- mode:

  Rendering strategy for the marks. `"auto"` (default) ships a
  per-element SVG for small/moderate plots and switches to a single
  embedded raster image above `raster_threshold` keyed elements; `"svg"`
  always uses the per-element SVG; `"raster"` always uses the image. In
  raster mode the marks are drawn once as a base image and all
  interaction (hover, click, brush, pan/zoom) is driven client-side from
  the element index (geometry + boxes + keys), so a very large scatter
  (100k+ points) stays navigable with a tiny DOM and a small payload.
  With a vellum that has the split render (`layer =` on
  [`vellum::scene_svg()`](https://r-vellum.github.io/vellum/reference/scene_svg.html)),
  only the keyed marks are an image: the axes, gridlines, legend and
  text stay SVG, so axis-aware zoom re-ticks the real axes, and the
  navigator and
  [`vellumplot::bind_scale()`](https://r-vellum.github.io/vellumplot/reference/bind_scale.html)
  work as in SVG mode. An older vellum draws the whole scene as one
  image, and zoom then magnifies it. The trade-offs of raster mode:
  per-element grammar colours, per-mark screen-reader focus, and
  display-tier cross-filtering do not apply (there are no per-element
  DOM nodes). Zoomed in, the marks are redrawn exactly from vellum's
  marks-only display list (see `max_marks`), or as plain dots with an
  older vellum.

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
  Applies to the SVG, including raster mode's SVG furniture under the
  split render; with an older vellum, raster mode bakes text into the
  base image and this argument is ignored (with a warning if set
  explicitly).

- max_marks:

  In raster mode with a vellum that has the marks-only display list, the
  most marks whose exact geometry and paint ship with the widget
  (default `500000`, about 8 MB). Zoomed-in marks are then redrawn
  exactly, with their own shape, colour, stroke and alpha. Above it, the
  widget ships only a bounding-box index, draws zoomed-in marks as plain
  dots, and says so with a message: a plot that big is better drawn as
  density, with
  [`vellumplot::mark_datashade()`](https://r-vellum.github.io/vellumplot/reference/mark_datashade.html)
  or
  [`vellumplot::mark_hex()`](https://r-vellum.github.io/vellumplot/reference/mark_tile.html).

- detail_marks:

  In raster mode with the display list, once a zoom settles with fewer
  than this many marks in view (default `3000`), the visible marks
  become real SVG nodes (the detail tier): hover, selection,
  [`condition()`](https://r-vellum.github.io/vellumplot/reference/condition.html)
  and
  [`filter_by()`](https://r-vellum.github.io/vellumplot/reference/filter_by.html)
  styling and keyboard focus then work on them as in SVG mode. Zooming
  back out past 1.5 times this many returns to the canvas. `0` turns the
  detail tier off.

## Value

An object of class `vellumwidget_tooltip_options`,
`vellumwidget_export_options`, `vellumwidget_navigator_options` or
`vellumwidget_render_options`, to pass to the matching
[`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md)
argument.

## Details

- `tooltip_options()` for the hover tooltip (`as_widget(tooltip = )`);

- `export_options()` for the toolbar's SVG/PNG download
  (`as_widget(export = )`);

- `navigator_options()` for the overview range navigator
  (`as_widget(navigator = )`);

- `render_options()` for how the marks are drawn
  (`as_widget(render = )`).

Each validates its arguments and returns an object that
[`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md)
reads. Calling a helper with no arguments gives the defaults.

## Examples

``` r
tooltip_options(delay = 250, style = list(background = "#1d3557"))
#> <tooltip_options>
#>   delay: 250
#>   follow: TRUE
#>   sticky: FALSE
#>   style: list(background = #1d3557)
export_options(filename = "mtcars", scale = 2)
#> <export_options>
#>   filename: mtcars
#>   scale: 2
navigator_options(height = 80)
#> <navigator_options>
#>   height: 80
render_options(mode = "raster")
#> <render_options>
#>   mode: raster
#>   raster_threshold: 20000
#>   text: native
#>   max_marks: 5e+05
#>   detail_marks: 3000

if (FALSE) { # \dontrun{
library(vellumplot)
vplot(mtcars) |>
  mark_point(x = wt, y = mpg, tooltip = rownames(mtcars)) |>
  as_widget(
    tooltip = tooltip_options(delay = 250, follow = FALSE),
    export = export_options(filename = "mtcars", scale = 2)
  )
} # }
```
