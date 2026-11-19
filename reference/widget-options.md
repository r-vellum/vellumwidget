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
  text = c("native", "outline")
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
  Applies to the per-element SVG path only; in raster mode text is baked
  into the base image and this argument is ignored (with a warning if
  set explicitly).

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
