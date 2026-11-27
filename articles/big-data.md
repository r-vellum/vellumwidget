# Very large scenes

The default widget draws one SVG node per mark. That is what makes
hover, per-element styling and screen-reader focus work, and it is fine
up to a few thousand marks. It stops being fine well before you reach a
scientific-scale scatter: 150,000 keyed points as per-element SVG come
to roughly 75 MB and 150,000 DOM nodes. That is slow to build, slow to
ship and slow to hover.

Above a threshold, the widget switches to *raster mode*. It keeps the
plot’s chrome as SVG, draws the marks as an image, and then swaps in
sharper and more interactive drawings of the marks as you zoom in.
Everything on this page is automatic. [Settings and
fallbacks](#settings-and-fallbacks) lists the settings, in
[`render_options()`](https://r-vellum.github.io/vellumwidget/reference/widget-options.md),
that change it.

## Raster mode

Above `raster_threshold` keyed elements (default `20000`),
`render_options(mode = "auto")` (the default) leaves the per-element SVG
behind:

``` r

library(vellumplot)

set.seed(1)
n <- 30000
big <- data.frame(
  x = rnorm(n),
  y = rnorm(n),
  g = sample(c("a", "b", "c"), n, replace = TRUE),
  id = seq_len(n)
)
```

``` r

vplot(big) |>
  mark_point(x = x, y = y, color = g, data_id = id, size = 1) |>
  as_widget()
```

That scatter has 30,000 keyed points, so `"auto"` chose raster mode.
What reaches the browser is:

- **The chrome as SVG.** Axes, gridlines, titles, the legend and any
  text stay real SVG, exactly as in SVG mode. Furniture drawn after the
  marks in the plot (a
  [`mark_rule()`](https://r-vellum.github.io/vellumplot/reference/mark_point.html)
  or
  [`annotate()`](https://r-vellum.github.io/vellumplot/reference/annotate.html)
  added after the points) goes in its own SVG layer on top of them.
- **The keyed marks as one PNG.** vellum renders only the keyed marks
  onto a transparent image, at twice the plot’s pixel resolution, so it
  stays sharp on HiDPI screens. Each panel shows it inside its own
  clipped, zoomable group.
- **An element index.** Keys, boxes and exact geometry for every mark,
  sent as compact columns. Hover, click, brush and lasso hit-test
  against it, so they work without any per-point DOM.
- **The display list.** vellum’s marks-only display list: each keyed
  mark’s exact device-pixel geometry and paint (shape, fill, stroke,
  width, dash, alpha) in paint order. The zoomed-in tiers below draw
  from it.

Because the chrome is real SVG, zoom works as it does in SVG mode. The
data region zooms and the axes re-tick for the visible range. Facet
panels zoom together, each re-ticking its own axes, and the
[navigator](https://r-vellum.github.io/vellumwidget/articles/interactivity.html#overview-navigator),
linked views and
[`vellumplot::bind_scale()`](https://r-vellum.github.io/vellumplot/reference/bind_scale.html)
overview + detail all work on a raster plot.

## Tiers as you zoom

The marks are drawn by one of three tiers, chosen when the view changes:

1.  **Overview: the mark PNG.** At the full view the browser shows
    vellum’s own anti-aliased image.

2.  **Mid tier: exact redraw from the display list.** Once you zoom in,
    scaling the PNG would blur it, so the widget redraws the marks in
    view from the display list: their own shapes, colours, strokes and
    alpha, in the order vellum painted them, through each panel’s zoom
    and clip. The redraw is exact, not a magnified image.

    A list of 50,000 marks or more is drawn with **WebGL2**, where the
    browser has it. A million points redraw in about 10 ms, so pan and
    zoom stay live. Smaller lists, and lists WebGL2 cannot draw (such as
    gradients, dashed strokes, grouped marks, masks or text, and very
    large paths), are drawn on a 2D canvas instead. On the canvas, a
    view with more than 50,000 marks redraws once the gesture settles,
    with the scaled image standing in until then.

3.  **Detail tier: real SVG nodes.** Zoom in until fewer than
    `detail_marks` marks (default `3000`) are in view and, once the view
    settles, those marks are built as keyed SVG nodes in their panel.
    From there on the plot behaves like SVG mode: hover and selection
    style the marks themselves instead of drawing rings, and the marks
    are focusable from the keyboard. Panning rebuilds the nodes for the
    new view. Zooming back out past 1.5 times the threshold returns to
    the mid tier.

Glyph marks (points and text) keep their pixel size in every tier, as in
SVG mode, so zooming spreads a dense cloud apart instead of enlarging
it.

The mid and detail tiers both need the display list. Marks the list
draws only approximately (masks, effects, patterns, text) still come out
right: they arrive as small images of their own, cut in paint order, and
the tiers place those where they belong.

## Selections, conditions and filters

Everything the plot declares reaches the raster tiers. The widget keeps
each mark’s state (selected, dimmed, recoloured, hidden, muted) per key
and applies it in whichever tier is drawing:

- [`vellumplot::condition()`](https://r-vellum.github.io/vellumplot/reference/condition.html)
  colours, opacities and dimming;
- [`vellumplot::filter_by()`](https://r-vellum.github.io/vellumplot/reference/filter_by.html)
  and cross-filters, which leave filtered-out marks undrawn;
- legend `legend_click = "hide"` and `"mute"`;
- crosstalk `filter_*` inputs and
  [`vw_filter()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md).

Selected marks are drawn above the other marks of their layer. While any
of this state is active, the drawn list replaces the mark PNG even at
the full view, so nothing waits for a zoom. Click a swatch in this
legend to hide a series, or click a point to grey out the groups it is
not in (click empty space to clear):

``` r

vplot(big) |>
  mark_point(x = x, y = y, data_id = id, size = 1,
             color = condition("hi", g, "grey85")) |>
  select_point("hi", on = "click", fields = "g") |>
  as_widget(legend_click = "hide")
```

Exports from the toolbar (SVG, PNG and copy) redraw the list at export
resolution with the same state, so a zoomed or filtered export matches
the screen.

## Settings and fallbacks

You can force the strategy instead of letting `"auto"` decide, and tune
each tier, with
[`render_options()`](https://r-vellum.github.io/vellumwidget/reference/widget-options.md):

``` r

as_widget(p, render = render_options(mode = "svg"))    # always per-element SVG
as_widget(p, render = render_options(mode = "raster")) # always raster mode
as_widget(p, render = render_options(raster_threshold = 50000)) # move the switch

as_widget(p, render = render_options(max_marks = 5e6))  # ship a bigger display list
as_widget(p, render = render_options(detail_marks = 0)) # no SVG detail tier
as_widget(p, render = render_options(webgl = "never"))  # 2D canvas only
as_widget(p, render = render_options(max_zoom = 20))    # zoom in at most 20x
```

- **`max_marks`** (default 2 million) caps the marks whose exact
  geometry ships. With the default `precision = "compact"` a scatter’s
  widget takes about 6 MB per million points and several seconds per
  million to build. Above the cap, the widget ships only a bounding-box
  index and says so with a message. Zoomed-in marks are then drawn as
  plain dots in each mark’s own colour and marker shape, and there is no
  detail tier. A plot that big usually reads better as density, with
  [`vellumplot::mark_datashade()`](https://r-vellum.github.io/vellumplot/reference/mark_datashade.html)
  or
  [`vellumplot::mark_hex()`](https://r-vellum.github.io/vellumplot/reference/mark_tile.html).
- **`detail_marks`** (default `3000`) is the mark count below which the
  detail tier takes over. `0` turns it off.
- **`webgl`**: `"auto"` (default) uses WebGL2 for lists of 50,000 marks
  or more; `"always"` uses it for any list and `"never"` keeps the 2D
  canvas. If the browser has no WebGL2, or drops the context, the canvas
  takes over.
- **`precision`**: `"compact"` (default) quantises the list’s
  coordinates to within 0.005 px, which roughly halves them; `"f32"`
  ships 32-bit floats.
- **`max_zoom`** (default `100`) caps the zoom per axis, in SVG and
  raster mode alike. At 100x vellum’s coordinate grid is still within
  half a screen pixel, so marks stay on their gridlines; past it they
  drift. It takes 1 to 10000.

When a tier can’t run, you get:

| When | What you get |
|----|----|
| WebGL2 unavailable, lost, or the list holds what it can’t draw | the 2D canvas mid tier |
| More marks than `max_marks` | the mark PNG, plain dots on zoom, no detail tier; conditions, filters and legend hide/mute are not drawn; crosstalk, [`vw_filter()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md) and [`filter_by()`](https://r-vellum.github.io/vellumplot/reference/filter_by.html) leave every mark visible and pickable; marks hidden by the legend stop answering hover and clicks |
| A panel the axis zoom can’t follow (polar, [`theme_void()`](https://r-vellum.github.io/vellumplot/reference/theme_gray.html) graphs) | the whole scene zooms as one, like an image |

Use `mode = "svg"` when you want per-element nodes at every zoom (for
example, screen-reader traversal of every mark) on a plot near the
threshold and can afford them. Use `mode = "raster"` to opt a smaller
plot into raster mode, or raise `raster_threshold` to keep SVG mode for
longer.

## What makes it responsive

A few changes carry the load, and they apply whether the plot ends up as
SVG or raster.

*Columnar payload.* The keyed-element metadata is serialised as one
array per field (all the keys, then all the x-coordinates, and so on)
instead of one JSON object per element. Columns with few distinct values
ship each value once plus a small code per mark, row-number keys ship as
differences, and the display list’s coordinates ship as packed integers.
A whole 200,000-point keyed scatter widget, display list and mark image
included, comes to about 1.1 MB and builds in a few seconds.

*Spatial index.* Nearest-mark hover and rectangular brush hit-test
against a [Flatbush](https://github.com/mourner/flatbush) R-tree rather
than scanning every element. The nearest-mark scan runs on every pointer
move, so replacing an O(n) scan with an O(log n) query is the change you
feel most on a dense plot.

*Exact picking on top of it.* The R-tree indexes bounding boxes, which
are the right shape for a rectangular brush and the wrong one for
deciding what the cursor is pointing at: a rising line’s box is the
whole rectangle its endpoints span. So the R-tree shortlists candidates,
and those are ranked by distance to the mark’s real geometry. A box
distance is never greater than the distance to the shape inside it, so
nothing in range is missed. A round mark is measured to its disc rather
than the square around it at no extra cost, and in raster mode lines and
polygons take their shapes from the display list rather than a second
copy.

*Cheaper hover dim.* Above a threshold, hovering dims the whole plot
once through the container’s opacity and redraws just the hovered marks
crisply in a small overlay, instead of restyling every element in CSS,
which forced a full-scene style recalc on each hover. Small and moderate
plots keep the exact per-mark dim.

Small and moderate plots never enter raster mode and behave exactly as
on the [interactive
tour](https://r-vellum.github.io/vellumwidget/articles/interactivity.md).
