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
  max_marks = 2000000L,
  detail_marks = 3000L,
  webgl = c("auto", "always", "never"),
  precision = c("compact", "f32"),
  max_zoom = 100,
  autoplay = TRUE,
  loop = TRUE
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
  work as in SVG mode. With a vellum that also splits the furniture by
  paint order, what was drawn after the marks (a reference line or
  annotation added after the points) stays on top of them. An older
  vellum draws the whole scene as one image, and zoom then magnifies it.
  The trade-offs of raster mode: there are no per-element DOM nodes
  until the detail tier (see `detail_marks`), so hover and selection
  show as rings and per-mark screen-reader focus is off. Zoomed in, the
  marks are redrawn exactly from vellum's marks-only display list (see
  `max_marks`), or as plain dots with an older vellum. With the display
  list,
  [`vellumplot::condition()`](https://r-vellum.github.io/vellumplot/reference/condition.html)
  colours and dimming,
  [`vellumplot::filter_by()`](https://r-vellum.github.io/vellumplot/reference/filter_by.html),
  cross-filters and legend hide/mute show at every zoom: the marks are
  then drawn on a canvas from the list. Without it (an older vellum, or
  more marks than `max_marks`), and for marks the list cannot reproduce
  (gradients, grouped marks), these show only in the detail tier.

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
  (default `2000000`). Zoomed-in marks are then redrawn exactly, with
  their own shape, colour, stroke and alpha. With
  `precision = "compact"` a scatter's widget takes about 6 MB per
  million points (1 million: 6.2 MB, 2 million: 12.2 MB, keys included)
  and about 5 s per million to build. Above it, the widget ships only a
  bounding-box index, about as big (6.3 MB per million), draws zoomed-in
  marks as plain dots (each in its own mark's colour), and says so with
  a message: a plot that big is better drawn as density, with
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

- webgl:

  In raster mode with the display list, how the zoomed-in (and restyled)
  marks are drawn. `"auto"` (default) draws a list of 50,000 marks or
  more with WebGL2 where the browser has it: a million points redraw in
  a few milliseconds, so pan, zoom and
  [`condition()`](https://r-vellum.github.io/vellumplot/reference/condition.html),
  selection and filter styling stay live, where the 2D canvas redraws in
  about a second and waits for the view to settle. `"always"` uses
  WebGL2 for any size of list, `"never"` keeps the 2D canvas. WebGL2
  draws points, rectangles, lines and polygons with solid fills and
  strokes (lines join with a miter, which at sharp turns of thick lines
  differs a little from a round join); a list holding gradients, dashed
  strokes, grouped marks or very large paths is drawn on the canvas, as
  it is without WebGL2 or when the browser drops the context.

- precision:

  How the display list ships its marks' coordinates (see `max_marks`).
  `"compact"` (default), with a vellum that supports it, quantises each
  coordinate column within its range so that no coordinate is off by
  more than 0.005 px, the precision of the SVG vellum writes (SVG mode,
  and raster mode's axes and gridlines): 16 bits per value for a plot up
  to 655 px across, 24 above, instead of a 32-bit float. That halves the
  coordinates in the payload (a 200k-point scatter: 2.7 to 1.7 MB) and
  keeps the error under half a pixel up to 100x zoom. `"f32"` ships
  32-bit floats, as an older vellum always does.

- max_zoom:

  The most the view zooms in, per axis, over the full view (default
  `100`), in SVG and raster mode alike: the wheel, pinch, keys, box zoom
  and zoom-to-selection,
  [`vw_zoom()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md),
  linked views (`group =`) and
  [`vellumplot::bind_scale()`](https://r-vellum.github.io/vellumplot/reference/bind_scale.html)
  all stop there. At 100x the 0.01 px grid vellum writes SVG coordinates
  on (and the 0.005 px error of `precision = "compact"`) is still within
  half a screen pixel, so the marks stay on their gridlines; past it
  they drift (a few pixels at 1000x) and show only the rounding. A
  number from 1 (no zoom in) to `10000`: past about 16,000x a 32-bit
  float can no longer place a mark at all.

- autoplay, loop:

  For an animation (from
  [`vellumplot::animate()`](https://r-vellum.github.io/vellumplot/reference/animate.html)):
  whether it starts playing as soon as it is shown (default `TRUE`;
  `FALSE` starts paused on the first frame, for the reader to press
  play), and whether it loops (default `TRUE`; `FALSE` plays once and
  stops on the last frame, and pressing play there starts it over). A
  reader whose system asks for reduced motion always gets it paused.
  They need JavaScript: the animated SVG on its own always plays and
  loops. Ignored for a static plot.

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
#>   max_marks: 2e+06
#>   detail_marks: 3000
#>   webgl: auto
#>   precision: compact
#>   max_zoom: 100
#>   autoplay: TRUE
#>   loop: TRUE

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
