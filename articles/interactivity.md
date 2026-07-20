# Interactive widgets: a tour

`vellumwidget` turns a `vellum` scene, or more usually a `vellumplot`
plot, into a self-contained, client-side interactive HTML widget. There
is one verb,
[`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md),
and it works the same in the RStudio/Positron viewer, a knitr/Quarto
document, and a Shiny app. No Shiny server and no round-trip are
required; every interaction runs in the browser.

Interactivity is *declared in the grammar*: a mark’s `data_id`,
`tooltip`, and `hover_group` arguments flow through the scene as
per-element metadata that the widget reads. A plot that declares none
still renders as a static (but embeddable) SVG.

Everything here scales to a few thousand marks on the per-element SVG
path. Past that, the widget switches to a raster strategy so a
100k-point scatter stays navigable; see [Very large
scenes](https://r-vellum.github.io/vellumwidget/articles/big-data.md).

``` r

library(vellumplot)
df <- data.frame(
  wt = mtcars$wt, mpg = mtcars$mpg,
  model = rownames(mtcars), cyl = factor(mtcars$cyl)
)
```

## Hover: tooltips and highlighting

Map `tooltip` and `data_id` and hover a point: it shows a tooltip and
dims the others. `data_id` is the join key; `tooltip` is what the box
says.

``` r

vplot(df) |>
  mark_point(x = wt, y = mpg, color = cyl, tooltip = model, data_id = model) |>
  as_widget()
```

### HTML tooltips

Tooltip text is rendered as **safe HTML**: build a multi-line, formatted
string in `tooltip =` (here with `glue`) using `<b>` and `<br>`. Data
values are escaped, and only inert tags (`<b>`, `<i>`, `<br>`, `<span>`)
are honoured, so there is no injection risk. Style the box with
`tooltip_style`.

``` r

df$label <- glue::glue("<b>{df$model}</b><br>{df$mpg} mpg · {df$wt}k lbs")
vplot(df) |>
  mark_point(x = wt, y = mpg, tooltip = label, data_id = model) |>
  as_widget(tooltip_style = list(background = "#1d3557", fontsize = "13px"))
```

Tune its behaviour too: `tooltip_delay` waits a beat before showing
(calmer on a dense scatter), `tooltip_follow = FALSE` anchors it above
the mark instead of tracking the cursor, and `tooltip_sticky = TRUE`
lets you move into the tooltip — useful when the HTML holds a link or
button. The box auto-flips below the cursor near the top edge and stays
within the widget.

### Shared tooltips and a crosshair

On a single scatter, hovering the nearest point is what you want. On a
multi-series line or time-series chart you usually want the opposite:
*every* series’ value at the cursor’s x, in one box. Set
`hover_mode = "x"` for that unified hover — every mark sharing the
hovered x highlights together and its tooltip joins one combined box.
`"y"` does the same along y; `"closest"` (the default) keeps the
single-nearest behaviour. Turn on `crosshair = TRUE` to drop a guide
rule at the hovered position (vertical in `"x"` mode, horizontal in
`"y"`, a full cross in `"closest"`).

``` r

long <- data.frame(
  t = rep(1:12, 2),
  y = c(cumsum(rnorm(12, 1)), cumsum(rnorm(12, 0.5))),
  series = rep(c("A", "B"), each = 12)
)
vplot(long) |>
  mark_line(x = t, y = y, color = series) |>
  mark_point(x = t, y = y, color = series, tooltip = y, data_id = interaction(series, t)) |>
  as_widget(hover_mode = "x", crosshair = TRUE)
```

Unified hover reads the mark positions straight from the element index —
no axis metadata is needed — so it works on any keyed plot and in raster
mode. It snaps along its axis, so the shared readout tracks the cursor
anywhere in the plot. In Shiny, `input$<id>_hover` still reports the
single nearest mark.

## Select and brush

Click a mark to select it (every mark sharing its `data_id` toggles
together); drag a rectangle to brush-select. `select_mode = "single"`
makes a click replace the selection instead of toggling. There is also a
freehand **lasso** — switch to it with the toolbar’s mode button (which
cycles brush → lasso → pan) and drag a loop; every mark whose centre
falls inside is selected. Hover, click-select, brush, and lasso are all
on by default.

``` r

vplot(df) |>
  mark_point(x = wt, y = mpg, data_id = model, selected_color = "#e63946") |>
  as_widget()
```

This works for *every* keyed mark, not just points. A statistical mark
draws several shapes that share one key — an error bar is a bar plus two
caps, a boxplot box is a rectangle plus median and whiskers — so
hovering, selecting, or brushing any part lights up and toggles the
whole mark as a unit (a boxplot’s outliers stay individually
addressable). Declare `data_id`/`tooltip` on
[`mark_errorbar()`](https://r-vellum.github.io/vellumplot/reference/mark_boxplot.html),
[`mark_linerange()`](https://r-vellum.github.io/vellumplot/reference/mark_boxplot.html),
or
[`mark_boxplot()`](https://r-vellum.github.io/vellumplot/reference/mark_boxplot.html)
the same way.

``` r

df2 <- data.frame(g = c("A", "B", "C"), y = c(20, 26, 23), lo = c(17, 24, 21), hi = c(23, 28, 25))
vplot(df2) |>
  mark_errorbar(x = g, ymin = lo, ymax = hi, data_id = g, tooltip = g) |>
  as_widget()
```

## Interactive legends

A discrete `color` or `shape` scale draws an interactive legend
automatically: hover a swatch to highlight its series, click to select
it. Set `legend_click = "hide"` to make the legend a **visibility
toggle** instead — a single click hides or shows a series, and a
double-click **isolates** it (hides every other series; double-click
again to bring them all back). This is the reflexive legend interaction
from plotly and friends. `"mute"` dims the series rather than removing
it, keeping the layout steady.

``` r

vplot(df) |>
  mark_point(x = wt, y = mpg, color = cyl, data_id = model) |>
  as_widget(legend_click = "hide")
```

Hovering a swatch still highlights its series under every policy, and a
hidden series drops out of hover and tooltip hit-testing. It works from
the keyboard too (Tab to a swatch, Enter/Space to toggle) and is
independent of any crosstalk cross-filter.

### Filtering by a continuous colorbar

When a plot maps a **continuous** `color` scale, its colorbar becomes an
interactive filter: drag the two handles to a value range and marks
outside it fade out (and stop responding to hover/brush); double-click
the bar to reset. In Shiny the range arrives as
`input$<id>_colorfilter`. It’s automatic — no argument — whenever
there’s a continuous colorbar.

``` r

vplot(df) |>
  mark_point(x = wt, y = mpg, color = mpg, data_id = model) |>
  as_widget()
```

## Pan, zoom, and the toolbar

Zoom with the mouse wheel, drag to pan (the toolbar’s mode button cycles
brush → lasso → pan). On a touch device, drag pans and a two-finger
pinch zooms; with the widget focused, the arrow keys pan, `+`/`-` zoom,
and `0` resets. The on-hover toolbar adds zoom-to-selection, reset,
SVG/PNG download, copy-to-clipboard (where supported), and fullscreen.

### Axis-aware zoom

Zoom scales only the plot’s data region and **re-ticks the axes** for
the visible range, holding the frame — axes, titles, legend — in place,
the way a charting library zooms (rather than scaling the whole scene
like an image, where the tick labels grow and blur). Hover, brush, the
crosshair, and the reported data range all follow the zoomed region.
This is on by default:

``` r

vplot(df) |>
  mark_point(x = wt, y = mpg, tooltip = model) |>
  as_widget()
```

It applies to a single **linear** cartesian panel (continuous
`identity`/`reverse` axes) in SVG mode, and is on by default. Plots with
log/date/discrete axes, several panels, or in raster mode silently fall
back to the whole-scene zoom, so it is always safe.

Glyph marks (points, circles, hexagons) keep a **constant pixel size**
as you zoom — only their positions re-map, so points stay round and
never stretch into ellipses. Bars, error bars, and lines still scale
with the data (their extent *is* data); only their stroke width is held
constant.

### Overview navigator

For long series, `navigator = TRUE` adds a strip below the plot showing
the whole scene in miniature, with a draggable, resizable window marking
the visible x-range. Drag the window to pan, drag a handle to zoom — it
stays in sync with the main view (wheel, keyboard, brush, and
linked-group changes all move it).

The navigator is an **x-range** tool, so zoom is one-dimensional: the
selected x-range fills the width while the **full y-range stays on
screen** (values never scroll off the top or bottom), the way a
time-series range selector behaves. With axis-aware zoom on (the
default), the x-axis re-ticks crisply as you scrub; on a plot that falls
back to whole-scene zoom the view stretches horizontally instead (so
point marks scale anisotropically) — the navigator is aimed at
line/area/series charts.

``` r

long <- data.frame(t = 1:200, y = cumsum(rnorm(200)))
vplot(long) |>
  mark_line(x = t, y = y) |>
  as_widget(navigator = TRUE)
```

Export captures the *current* view, so a zoomed-in region exports as
shown. Set the download name and a hi-res PNG scale:

``` r

vplot(df) |>
  mark_point(x = wt, y = mpg, data_id = model) |>
  as_widget(export_filename = "mtcars", export_scale = 2)
```

## Accessibility

Accessibility is on by default (`a11y = TRUE`). The widget announces
itself as an interactive chart, and every mark is focusable: **Tab**
into the chart, use the **arrow keys** to move between marks (each
announced through a polite live region), **Enter**/**Space** to select,
and **Escape** to leave traversal mode. A visually-hidden data table
lists every mark for screen-reader users. The chart’s accessible name
and description come from the plot’s title and alt text (which
`vellumplot` sets automatically) or an explicit `as_widget(alt =)`.

See the [vellumplot *Accessibility*
article](https://r-vellum.github.io/vellumplot/articles/accessibility.html)
for the full cross-package story (alt text, accessible SVG/PDF, and this
widget).

## Linked views

Widgets sharing a `group` link client-side: selecting or brushing in one
highlights the same data keys in the others, and **panning or zooming
one moves the others to the same relative view** — with no Shiny and no
crosstalk. Selection projects by `hover_group` when the marks declare
it. Linked pan/zoom shares the view as a *fraction* of each widget’s own
extent, so it stays aligned even when the linked plots are different
sizes (small multiples). Try zooming one below — the other follows.

``` r

p <- vplot(df) |> mark_point(x = wt, y = mpg, data_id = model, hover_group = cyl)
htmltools::tagList(
  as_widget(p, group = "cars", width = 320, height = 240),
  as_widget(vplot(df) |> mark_point(x = wt, y = mpg, data_id = model, hover_group = cyl),
            group = "cars", width = 320, height = 240)
)
```

For interop with plotly / leaflet / DT and crosstalk’s `filter_*`
controls, pass a
[`crosstalk::SharedData`](https://rdrr.io/pkg/crosstalk/man/SharedData.html)
(or a group name) to `crosstalk =` instead — see [Linking views with
crosstalk](https://r-vellum.github.io/vellumwidget/articles/crosstalk.md).

## Declarative interactivity (in the plot spec)

The interactions above are the widget’s built-in defaults. For
interaction that is *part of the plot* — travelling with the spec,
portable, and composable across views — declare it in `vellumplot`
itself. A **selection** is a named set of elements defined by a gesture;
refer to it from
[`condition()`](https://r-vellum.github.io/vellumplot/reference/condition.html)
(style by membership),
[`filter_by()`](https://r-vellum.github.io/vellumplot/reference/filter_by.html)
(show only members), or across views for cross-filtering. No
[`as_widget()`](https://r-vellum.github.io/vellumwidget/reference/as_widget.md)
flags are involved.

**Highlight on hover** — colour by group, but dim everything except the
hovered point’s group:

``` r

library(vellumplot)
vplot(df) |>
  mark_point(x = wt, y = mpg, color = condition("hi", cyl, "grey85")) |>
  select_point("hi", on = "hover") |>
  as_widget()
```

**Cross-filter** — brush one view, a linked view narrows to those rows
while the source stays full:

``` r

sel <- select_interval("brush", on = "xy")
hconcat(
  vplot(df) |> mark_point(x = wt, y = mpg) |> add_selection(sel),
  vplot(df) |> mark_point(x = mpg, y = wt) |> filter_by(sel)
) |>
  as_widget()
```

This is the intended long-term home for interaction: it is declared
once, in the plot, and any capable host enacts it. See the `vellumplot`
reference for
[`select_point()`](https://r-vellum.github.io/vellumplot/reference/select_point.html)
/
[`select_interval()`](https://r-vellum.github.io/vellumplot/reference/select_point.html)
/
[`condition()`](https://r-vellum.github.io/vellumplot/reference/condition.html)
/
[`filter_by()`](https://r-vellum.github.io/vellumplot/reference/filter_by.html).

## Styling

`tooltip_style` themes the tooltip box (above). Per-mark hover/selected
outlines are declared in `vellumplot`
(`mark_*(hover_color =, selected_color =)`); richer per-element styling
by selection membership uses
[`condition()`](https://r-vellum.github.io/vellumplot/reference/condition.html)
(above).

## Shiny

[`vellumwidgetOutput()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-shiny.md)
/
[`renderVellumwidget()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-shiny.md)
embed a widget in a Shiny app, and the widget reports the user’s
selection, clicks, hovers, brush, and current view back to the server as
reactive inputs. For a `vellumplot` plot the brush and the view also
report **data-space** coordinates (not just pixels) — e.g.
`input$plot_brush$x0d`/`x1d` and `input$plot_zoom$data$x` — so the
server can act on data ranges directly. See the [Shiny
article](https://r-vellum.github.io/vellumwidget/articles/shiny.md) and
`?vellumwidget-shiny`.
