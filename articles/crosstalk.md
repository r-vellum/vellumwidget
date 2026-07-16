# Linking views with crosstalk

A vellumwidget widget selects, brushes, and highlights on its own, with
no server. When you want that selection to travel to a table, a map, or
another chart, you have two options. If the other view is also a
vellumwidget widget, the built-in `group` bus links them with no extra
dependency. If it is a `DT` table, a `plotly` chart, a `leaflet` map, or
one of crosstalk’s `filter_*` controls, you bridge through
[crosstalk](https://rstudio.github.io/crosstalk/) instead. This article
is about the second case.

## The one thing that has to match: the key

crosstalk coordinates widgets by a shared key. Every row of your data
carries a key, and each widget reports and receives selections in terms
of those keys. For vellumwidget the key is the mark’s `data_id`. So the
rule is simple: **the `SharedData` key and the `data_id` must be the
same column.**

``` r

library(vellumplot)
library(crosstalk)

df <- data.frame(
  wt = mtcars$wt, mpg = mtcars$mpg, hp = mtcars$hp,
  model = rownames(mtcars), cyl = factor(mtcars$cyl)
)
sd <- SharedData$new(df, key = ~model)
```

`SharedData$new(df, key = ~model)` wraps the data and declares `model`
as the key. Build the plot from `sd$origData()` (the wrapped frame), set
`data_id = model` on the mark so the widget’s keys line up with the key
column, and pass the `SharedData` itself to `as_widget(crosstalk =)`:

``` r

scatter <- vplot(sd$origData()) |>
  mark_point(x = wt, y = mpg, color = cyl, tooltip = model, data_id = model) |>
  as_widget(crosstalk = sd, width = 360, height = 300)
```

The plot draws from the data, and `crosstalk = sd` is what tells the
widget which group and keys to coordinate on.

## Selection round-trips

Put the scatter next to a `DT` table built from the *same* `SharedData`
and the selection travels both ways: click or brush points on the plot
and the matching rows highlight in the table; select rows in the table
and the points light up.

``` r

crosstalk::bscols(
  scatter,
  DT::datatable(sd, rownames = FALSE, options = list(pageLength = 6))
)
```

Nothing in that snippet wires the two together explicitly. They agree
because they share `sd`, and `sd` carries the keys. Under the hood
vellumwidget keeps its own selection engine and registers a crosstalk
`SelectionHandle`, so a click on the plot sets the crosstalk selection
(which the table reads) and a crosstalk selection from the table drives
the widget’s highlight. Selection still projects by `hover_group` on the
vellumwidget side, so if your marks declare one, selecting a single
point can select its whole series and that series is what crosstalk
broadcasts.

## Filters hide marks

crosstalk’s `filter_*` inputs are a second, independent channel. A
filter narrows the set of *visible* keys; every widget bound to the
group shows only those and drops the rest. On the vellumwidget side a
filter dims and hides the non-matching marks (a display-tier
cross-filter, the same mechanism
[`vw_filter()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget-proxy-verbs.md)
uses from Shiny) without touching the data behind them.

``` r

crosstalk::bscols(
  widths = c(3, 9),
  list(
    filter_checkbox("cyl", "Cylinders", sd, ~cyl),
    filter_slider("hp", "Horsepower", sd, ~hp)
  ),
  vplot(sd$origData()) |>
    mark_point(x = wt, y = mpg, color = cyl, data_id = model) |>
    as_widget(crosstalk = sd, width = 420, height = 320)
)
```

Selection and filtering compose: a filter restricts what is on screen,
and selection then highlights within what remains.

## Other widgets in the ecosystem

Any crosstalk-aware widget joins the same group. A `leaflet` map keyed
the same way links its markers to the scatter:

``` r

sd_geo <- SharedData$new(cities, key = ~id)
crosstalk::bscols(
  leaflet::leaflet(sd_geo) |> leaflet::addTiles() |> leaflet::addCircleMarkers(),
  vplot(sd_geo$origData()) |>
    mark_point(x = lon, y = lat, data_id = id) |>
    as_widget(crosstalk = sd_geo)
)
```

`plotly` works the same way — build the plotly trace from the shared
data and it coordinates with the widget:

``` r

sd <- SharedData$new(df, key = ~model)
crosstalk::bscols(
  plotly::plot_ly(sd, x = ~wt, y = ~mpg, text = ~model),
  vplot(sd$origData()) |> mark_point(x = wt, y = mpg, data_id = model) |> as_widget(crosstalk = sd)
)
```

## When to use which link

vellumwidget has three linking directions, and they answer different
questions.

- The native **`group`** bus links vellumwidget widgets to each other
  with no dependency (see the [interactive
  tour](https://r-vellum.github.io/vellumwidget/articles/interactivity.html#linked-views)).
  Reach for it when every linked view is a vellumwidget.
- **crosstalk** links a vellumwidget widget to the rest of the
  htmlwidgets ecosystem, client-side, still with no Shiny. Reach for it
  the moment a `DT`, `plotly`, or `leaflet` view, or a `filter_*`
  control, is in the picture.
- **Shiny** inputs and
  [`vellumwidget_proxy()`](https://r-vellum.github.io/vellumwidget/reference/vellumwidget_proxy.md)
  are for when a *server* needs to see or drive the selection. See the
  [Shiny
  article](https://r-vellum.github.io/vellumwidget/articles/shiny.md).

crosstalk is a Suggests. Its client library is bundled only when you
actually pass a `SharedData` (or a group name) to `crosstalk =`; a plain
widget carries no crosstalk code. A `group`-linked widget and a
crosstalk-linked widget can coexist in the same document — they use
separate buses.

One caveat for raster-mode widgets (see [Very large
scenes](https://r-vellum.github.io/vellumwidget/articles/big-data.md)):
crosstalk selection still round-trips by key, but the display-tier
*filter* has no per-element nodes to hide, so `filter_*` inputs do not
cull a raster plot.
