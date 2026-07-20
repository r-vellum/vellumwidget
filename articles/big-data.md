# Very large scenes

The default widget draws one SVG node per mark. That is what makes
hover, per-element styling, and screen-reader focus work, and it is fine
up to a few thousand marks. It stops being fine well before you reach a
scientific-scale scatter. A 150,000-point keyed scatter serialised the
old way produced roughly a 75 MB SVG with 150,000 DOM nodes: slow to
build, slow to ship, and slow to hover, because every pointer move
restyled every node.

vellumwidget handles large scenes on two fronts. The payload and
hit-testing were made cheap enough that a big *SVG* plot stays
responsive, and above a threshold the widget switches to a raster
strategy that drops the per-element DOM entirely. Both are automatic.

## Raster mode

Above `raster_threshold` keyed elements (default `20000`),
`as_widget(mode = "auto")` — the default — renders the scene **once as a
single embedded image** and drives all interaction from a compact
element index rather than the DOM.

``` r

library(vellumplot)

set.seed(1)
n <- 30000
big <- data.frame(
  x = rnorm(n),
  y = rnorm(n),
  id = seq_len(n)
)
```

``` r

vplot(big) |>
  mark_point(x = x, y = y, data_id = id, size = 1) |>
  as_widget()
```

That scatter has 30,000 keyed points, so `"auto"` chose the raster path.
The image is a base64 PNG wrapped in an SVG shell whose `viewBox` is the
scene’s device-pixel space, so pan and zoom reframe the image through
the `viewBox` and the element bounding boxes line up with it without any
rescaling. Hover, click, and brush all hit-test against the index of
keys and boxes, so they keep working even though there is nothing
per-point in the DOM.

You can force the strategy instead of letting `"auto"` decide:

``` r

as_widget(p, mode = "svg")    # always per-element SVG
as_widget(p, mode = "raster") # always the single image
as_widget(p, mode = "auto", raster_threshold = 50000) # move the switch point
```

Use `"svg"` when you want per-element behaviour (grammar colours,
screen-reader focus, filter culling) on a plot near the threshold and
can afford the nodes. Use `"raster"` to opt a smaller plot into the
image path, or lift `raster_threshold` to keep the SVG path for longer.

## What makes it responsive

Three changes carry the load, and they apply whether the plot ends up as
SVG or raster.

*Columnar payload.* The keyed-element metadata is serialised as one
array per field (all the keys, then all the x-coordinates, and so on)
instead of one JSON object per element. Serialising N tiny objects is N
allocations on the R side and dominated the build at large N. On the
150,000-point scatter, building and serialising the payload dropped from
about 24 s / 89 MB to about 0.4 s / 12 MB. The widget reconstructs the
per-element view on the browser side, so this is a pure wire-format
change with no behavioural difference.

*Spatial index.* Nearest-mark hover and rectangular brush hit-test
against a [Flatbush](https://github.com/mourner/flatbush) R-tree rather
than scanning every element. The nearest-mark scan runs on every pointer
move, so replacing an O(n) scan with an O(log n) query is the change you
feel most on a dense plot.

*Cheaper hover dim.* Above a threshold, hovering dims the whole plot
once through the container’s opacity and redraws just the hovered marks
crisply in a small overlay — O(hovered) — instead of restyling every
element in CSS, which forced a full-scene style recalc on each hover.
Small and moderate plots keep the exact per-mark dim they had before.

## Crisp zoom

Scaling a raster up blurs it. When you zoom into a raster-mode plot, the
widget redraws the points in view sharply on a `<canvas>` overlay: it
samples each point’s colour straight from the rendered image and takes
its position and size from the element index, so the sharp layer matches
what vellum drew. The overlay engages only while zoomed in — at the full
view you see the faithful, anti-aliased base image — and it redraws only
the points currently on screen. Where a 2D canvas context is unavailable
it falls back to the scaled image alone.

## Trade-offs

Raster mode buys scale by giving up the per-element DOM, so the things
that need per-element nodes do not apply:

- **Per-element grammar styling** (a mark’s own `hover_color` /
  `selected_color`, or a
  [`condition()`](https://r-vellum.github.io/vellumplot/reference/condition.html)
  in the plot spec) has no node to style, so it does not apply. The
  built-in hover highlight (dim-the-rest) still works.
- **Per-mark screen-reader focus** is gone — there are no focusable
  `graphics-symbol` nodes to tab through. The chart keeps its accessible
  name and description (from the scene title/alt text), but not per-mark
  traversal. If keyboard/screen-reader navigation of individual marks
  matters more than scale for a given plot, force `mode = "svg"`.
- **Display-tier cross-filtering** (crosstalk `filter_*` inputs,
  [`vw_filter()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md))
  has no nodes to hide, so it does not cull a raster plot. Crosstalk
  *selection* still round-trips by key.
- A **zoomed-in view is a scaled raster** refined by the crisp-zoom
  canvas, not a re-rendered scene, so it will not reveal detail finer
  than the base image.

Everything else is unchanged: hover tooltips and highlight, click and
brush selection, pan and zoom, `group`-linked and crosstalk selection
(all keyed), the toolbar, and export. Small and moderate plots never
touch this path and behave exactly as before.
