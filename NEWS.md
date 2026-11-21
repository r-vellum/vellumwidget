# vellumwidget 0.14.1

* **Raster mode: a blend mode no longer keeps the whole plot on the mark
  image (VW-32).** One mark under a blend mode (a layer `blend = "multiply"`,
  `"screen"`, ...) used to send every mark back to the PNG. The PNG also
  blended only against the other marks, not the panel beneath, so it didn't
  match the static render. With a vellum that reports each run's blend mode
  (`run_blend`, feature-detected), a blended run is drawn on a canvas layer
  of its own with that CSS `mix-blend-mode`, stacked between the marks
  before and after it. It blends with the furniture and marks beneath it, as
  SVG mode and `scene_png()` do, in every raster tier (the overview included,
  where the canvas now stands in for the PNG) and in PNG/SVG exports. In the
  detail tier the run's `<use>` carries the blend mode. An older vellum, or a
  run vellum can't composite, keeps the old behaviour.

* **Raster mode: conditions, filters, dimming and legend hide/mute reach the
  marks drawn from images (VW-33).** Since 0.14.0, masked, patterned and
  similar marks and keyed text are drawn from one small PNG per run, with
  their look baked in. So a cross-filter could not hide a keyed label, and a
  `condition()` could not recolour or dim it, in the overview, mid and detail
  tiers or in exports. Each run now also ships as SVG. When some state
  touches a run's marks, the widget applies it to that SVG, as SVG mode
  styles its nodes, and draws the result in place of the PNG; untouched runs
  keep their PNG. The re-rendered run is drawn by the browser, so its text can
  differ slightly from vellum's. If the runs' SVGs would exceed 4 MB, they are
  left out with a message, and those marks keep their own look.

* **Raster mode: a flagged run's image is placed once per panel (VW-34).** In
  the detail tier, a run of flagged marks (e.g. text labels) spanning a panel
  with a pan group and one without (a polar or `coord_trans()` panel in a
  composition) was drawn twice over the first panel, so its labels came out
  heavier. The root copy is now clipped to the marks it stands for. Under axis
  zoom, a run's marks in a panel the zoom does not transform are drawn
  untransformed, like the exact marks there, instead of not at all. vellumplot
  does not produce that case today (raster axis zoom needs every mark panel to
  have a pan group), so this is a safeguard.

# vellumwidget 0.14.0

* **Raster mode: one mark the display list can't draw no longer keeps every
  mark on the PNG (VW-30).** Masked marks (`clip_to()` / `set_mask()`),
  effects, hatches, patterns, repeating gradients, gradient strokes and keyed
  text used to keep the whole plot on the mark image: zoomed in, every mark
  stayed blurry and there was no detail tier. With a vellum that renders those
  marks as their own layer (`scene_png(layer = "keyed_flagged")`,
  feature-detected), the widget ships one small PNG per run of them in paint
  order and draws the rest exactly, compositing each run where it falls. So
  the other marks reach the crisp canvas and the SVG detail tier, and a label
  drawn after the points stays on top of them. The flagged marks themselves
  stay images: they are as sharp as the mark PNG and keep their own colours
  under `condition()` and dimming, though they still take the pointer and show
  a selection outline in the detail tier. Marks under a blend mode, more than
  8 runs, or an older vellum: unchanged.

* **The navigator's mini-map draws gridlines, ticks and reference lines
  visibly (VW-31).** It squashes the whole plot into a short strip, and the
  strokes squashed with it, so horizontal gridlines and thin rules shrank to
  a fraction of a pixel and nearly disappeared. The mini-map's strokes now keep
  their own width on screen (`vector-effect: non-scaling-stroke`), with a
  1 px minimum.

* **SVG and PNG exports from SVG mode show condition dimming and selection
  outlines (VW-28).** The widget styles these through CSS classes, and the
  page stylesheet does not travel with an exported SVG, so a `condition()`
  spotlight or a click selection exported undimmed and unoutlined. The export
  now writes those styles inline (dim opacity, selection stroke, legend mute,
  hidden filtered marks), resolved from the live theme, so the export matches
  the screen. Hover and keyboard focus stay out of the export.

* **Raster mode: a point or circle keeps its size when zooming crosses from
  the canvas tier to the SVG detail tier (VW-29).** Without axis zoom (raw
  vellum scenes, polar and void panels), the whole scene zooms through its
  viewBox, and the detail tier's nodes and the SVG mode grow with it. The mid
  tier's canvas, however, drew point records and strokes at their unzoomed
  pixel size, so a large `circle_grob()` disc jumped in size between tiers. The
  canvas now follows the same rule: under viewBox zoom, glyphs and stroke
  widths scale with the view; under axis zoom they keep their pixel size, as
  before. Dense raw-scene scatters therefore show bigger dots at the mid zoom
  than they used to, matching the SVG mode.

* **Gradients, path clips and translucent groups no longer keep a raster plot
  out of the exact tiers (VW-23).** With a vellum that has display list
  version 2 (`scene_display_list(version = 2)`, feature-detected), gradient
  fills (`linear_gradient()` / `radial_gradient()`, pad extension), clips by
  a path and marks inside an opacity group are listed exactly. They are drawn
  on the zoomed canvas (a group as one layer at its opacity), take
  `condition()` / `filter_by()` styling (a condition colour replaces a
  gradient), become SVG nodes in the detail tier (`<linearGradient>` /
  `<radialGradient>`, chained `<clipPath>`s, `<g opacity>`) and export sharp.
  Older vellum: unchanged (those marks stay in the image). Masks
  (`clip_to()`, `set_mask()`), blend modes, effects, hatches and patterns
  still stay in the image.
* Keyed marks that paint nothing (pick-only hover targets) no longer make the
  display list inexact.
* The detail tier now also builds marks that are only partly in view (a bar
  or disc whose centre is off-screen). It used to test the centre alone, so
  such marks disappeared on deep zoom.
* Fixed: zooming a raster plot whose display list has a single paint with no
  fill (e.g. one-colour keyed segments) threw, and the marks vanished. The
  length-1 `NA` column arrives as `null`, which left the paint table empty.

* **Raster exports show the marks as they are drawn (VW-25).** The toolbar's
  SVG, PNG and clipboard exports used the overview mark PNG. So
  `condition()` colours, dimming and `filter_by()` (VW-22) were missing, and
  a zoomed export showed that PNG scaled up and blurred. When vellum's display
  list covers every mark exactly, the export now redraws it at export
  resolution (at least 2x, or `export_options(scale)`), with the current
  style state, into one image over the current view. The detail tier's nodes
  and the mark PNG are left out of the export, and the above-marks furniture
  and re-ticked labels still go on top. Without an exact list (older vellum,
  above `max_marks`, flagged marks) the export keeps the mark PNG.
* PNG exports at `export_options(scale)` above 1 keep non-scaling strokes
  (axis-zoomed lines, rules and outlines) at their on-screen weight. Before,
  they came out `scale` times too thin.

* Under axis zoom, unkeyed panel furniture keeps its size, as the keyed marks
  do (VW-26). A reference rule no longer thickens, an annotation's text stays
  its size, anchored where it was placed, and an unkeyed point layer keeps its
  pixel size. This applies in SVG mode and to both raster furniture layers
  (below and above the marks). Text marks with a key get the same treatment.
  `render_options(zoom_marks = "scale")` keeps the old scaling.
* The navigator's mini-map now shows the furniture painted after the marks
  (a reference line or annotation drawn over the points in raster mode,
  VW-21). It cloned only the base svg, so that layer was missing (VW-27).

# vellumwidget 0.13.1

* Raster widgets ship vellumplot's new default keys (`"p1-1:l2:7"`, VP-55)
  as compactly as plain row numbers: the key column's delta encoding now also
  covers integers after a text prefix, with the prefixes sent as runs. A
  20k-point default-keyed scatter sends about 40 kB of keys instead of 300 kB.

# vellumwidget 0.13.0

* **Building a big widget is faster (VR-16).** The element table's meta
  columns (`tooltip`, `legend`, `cond`, ...) are read column-wise from one
  flattened index instead of scanning every element's record once per field.
  At 200k keyed points this step drops from about 1.5 s to 0.4 s. With the
  matching vellum and vellumplot changes, `as_widget()` on a 200k-point keyed
  scatter takes about 1.6 s instead of 7 s. The payload is unchanged.

* **In raster mode, a reference line or annotation added after the points is
  drawn over them again (VW-21).** The split render put all the furniture
  under the marks image, so `mark_rule()` or `annotate()` layered after
  `mark_point()` disappeared under the points. With a vellum that splits the
  furniture by paint order (`layer = "unkeyed_above"`), what was painted after
  the marks ships as its own SVG layer, stacked over the marks at every tier
  (image, zoomed canvas, detail nodes). It zooms with its panel and is part of
  the SVG/PNG export. It never takes the pointer, so hovering and clicking
  still reach the marks underneath. With an older vellum it is drawn as before.

* **`condition()`, `filter_by()` and selection dimming show at every zoom in
  raster mode (VW-22).** They used to take effect only once the detail tier's
  SVG nodes existed; the overview image and the zoomed canvas drew every mark
  unchanged. The canvas now draws each mark from the display list with its
  key's state: dimmed, in the condition's `if_false` colour, or not at all when
  filtered out (also cross-filters and legend hide/mute). While any such state
  is active at the overview zoom, the canvas replaces the mark image. With more
  than 50,000 marks in view the redraw waits until the change settles (about
  170 ms once for 200,000 points). Without a display list (an older vellum, or
  above `render_options(max_marks = )`), or when the list has marks it cannot
  reproduce, the image is shown unchanged and these states still apply only in
  the detail tier.

* **Zoom in far enough on a big plot and its marks become real, interactive
  SVG (VW-16).** In raster mode with the display list, once a zoom settles with
  fewer than `render_options(detail_marks = )` marks in view (default 3,000),
  the visible marks are built as keyed SVG nodes inside the zoomed panel, from
  their exact geometry and paint. Hover and click selection then style the marks
  themselves (no rings), `condition()` and `filter_by()` apply to them, and they
  are keyboard-focusable marks for screen readers. Panning or zooming within the
  detail tier rebuilds the nodes for the new view, keeping the selection.
  Zooming back out past 1.5 times the threshold returns to the canvas, and
  the selection shows as rings again. `detail_marks = 0` turns it off. The
  swap happens once the view settles, not on every wheel tick.

* A `condition()`'s `if_false` colour given as an R colour name (`"grey80"`) is
  now sent to the browser as hex. The browser ignored such names, so the
  condition styled nothing (SVG mode too).

* **Zoomed-in big plots are drawn exactly, from a smaller payload (VW-15).**
  With a vellum that has the marks-only display list (`scene_display_list()`),
  raster mode ships each keyed mark's exact device-pixel geometry, paint and key
  instead of its bounding box. Once zoomed in, the canvas redraws the marks with
  their own shape (circle, square, triangle, diamond, plus, cross, star), rects
  and paths, fill, stroke, width, dash and alpha, in the engine's paint order,
  where it used to draw plain dots in a colour read back from the image. The
  hit-test boxes are derived in the browser. The key column ships as integer
  differences when the keys are row numbers, and long runs of one value (every
  mark a "point") as runs. A 20,000-point keyed scatter's payload drops from
  1.09 MB to 0.61 MB, a 200,000-point one from 8.3 MB to 3.9 MB. With more than
  50,000 marks in view, the exact redraw waits until the zoom settles, and the
  image stands in meanwhile. Above `render_options(max_marks = )` (default
  500,000) no list ships: the widget keeps the bounding-box index and a message
  suggests `vellumplot::mark_datashade()` or `vellumplot::mark_hex()`. With an
  older vellum nothing changes. Marks the list cannot draw exactly (gradient or
  pattern paints, path clips, marks in a translucent group) keep their box and
  stay in the image.

* **Raster mode keeps real axes, so axis zoom, the navigator and linked zoom
  work on big plots (VW-14).** With a vellum that has the split render
  (`scene_svg(layer =)` / `scene_png(layer =)`), raster mode no longer draws the
  whole scene as one image. The axes, gridlines, legend and text stay SVG, and
  only the keyed marks are a PNG, placed inside each panel's zoomable group.
  Zooming re-ticks the real axes, facets zoom per panel, the range navigator is
  available, and `bind_scale()` / `select_interval(bind = "scales")` linked
  zoom now works in raster mode. Once zoomed in, the crisp point layer is drawn
  per panel and clipped to it, and the scaled mark image is hidden beneath it.
  `render_options(text =)` now applies to the furniture, so it no longer warns.
  SVG and PNG export give one image: furniture, the mark layer and the
  re-ticked axis labels (which an axis-zoomed export used to drop, in SVG mode
  too). With an older vellum (0.9.0) raster mode is unchanged.

* **A raster-mode widget ships less than half the data (VW-13).** In raster mode
  (more than `raster_threshold` keyed marks) the element index, not the image, is
  most of the payload. It now ships in a compact encoding: a column with few
  distinct values (`mark`, a mark's legend series) sends each value once plus a
  small integer code per mark, a column that only a handful of marks carry (the
  legend swatches' tooltips) sends just those marks, and the bounding boxes are
  rounded outward to 1/100 px. A 20,000-point keyed scatter drops from 2.45 MB to
  1.09 MB (gzip 0.90 to 0.48 MB), a 200,000-point one from 21.9 MB to 8.3 MB.
  The runtime decodes it back to the same per-mark records, and SVG mode is
  unchanged.

# vellumwidget 0.12.0

* **Selection rings contrast with the plot, not the OS colour scheme (VW-20).**
  The selection stroke, crosshair and colorbar wash switched to their light
  variants whenever the page was viewed in a dark colour scheme. On a white plot
  that made the ring near-white, and on a `theme_dark()` plot in light mode it
  stayed dark. The widget now reads the scene's panel background (and the plot
  background for the colorbar wash) and picks dark ink for light backgrounds and
  light ink for dark ones (`theme_dark()`, `theme_cyberpunk()`), whatever the OS
  scheme. A selection colour set by the user (a mark's `selected_color`) still wins.

* **A brush no longer blanks out a line it only partly covers (VW-19).** A
  line, path or area drawn as one keyed element spans a whole series. A brush
  over part of it (a `select_interval()` brush, a plain brush or a lasso) used
  to select it, and the selected style restroked the line in the selection
  colour. With a dark colour scheme on a light plot that colour is near-white,
  so the overview line of an overview + detail disappeared. The partly covered
  line is now left as it is, much as Vega-Lite leaves a line under an interval
  brush unless a `condition()` styles it. It is still a member of the interval,
  so `condition()`, `filter_by()`, binds and `input$<id>_brush` keys see it as
  before, but it is not selected and not in `input$<id>_selected`. A brush that
  covers the whole line still selects it. Points, bars and segments keep
  today's behaviour.

* **Linked views zoom per cell (VW-18).** In a composition with a
  `bind_scale()` or a `select_interval(bind = "scales")`, every cell used to
  share one zoom: a wheel on the overview also moved the detail's unbound axis,
  and a pan on the bound detail moved the overview. Each cell now keeps its own
  view. A wheel, pan or zoom-to-selection moves only the cell it starts in, a
  bound axis follows its selection, and reset returns every cell to its full
  view. `input$<id>_zoom` reports the last-zoomed cell's view in `x`..`h`, and
  `zoomed` is `TRUE` while any cell is zoomed. Facets, and compositions without
  binds, still zoom together. Binds remain SVG-only: a raster render ignores
  them.

* **Zoomed axes show their gridlines and tick marks (VW-17).** Under axis-aware
  zoom the re-ticked gridlines went in under vellumplot's opaque panel
  background, so a zoomed panel showed none, and the static tick marks stayed
  in the scaled pan group and drifted off their breaks. The panel background
  now moves out of the pan group and the re-ticked grid sits on top of it; the
  background no longer scales with the zoom either. The static ticks are
  hidden along with the static labels and re-drawn at the new breaks in the
  theme's stroke and length, and an axis line (`theme_classic()`) stays
  visible. Applies to facets, compositions and secondary axes alike.

* **Overview + detail: `vellumplot::bind_scale()` is enacted (F-15).** Brushing
  an overview view zooms every panel bound to the brush to the brushed range on
  the bound axis, re-ticking its axes; clearing the brush resets it. The view
  the brush is drawn in never zooms itself, and in a composition a brush in
  another cell leaves the selection alone. Date and datetime axes convert
  between days and seconds, a discrete target zooms to the brushed levels, and
  log/sqrt/reversed axes map through their transform. `input$<id>_zoom`
  reports the bound range in `panels` and names the bound panels in `bound`.
  SVG mode with axis-aware zoom only.

* **`vellumplot::select_interval(bind = "scales")` (F-15).** The selection is
  the view's own pan/zoom: the settled visible range of its cell writes it (no
  brush band), resetting the zoom empties it, and the default drag is pan. A
  `bind_scale()` on another view then follows it (linked zoom), and
  `condition()` / `filter_by()` react to what is in view.

* Panel descriptors carry the composition `cell` vellumplot now records, so a
  composition's per-cell panels (`"cell-2-panel-1-1"`, ...) zoom and report
  individually. With vellumplot 0.14.1.9000 or later an aligned composition's
  panels are described and pannable, so compositions get axis-aware zoom too.

* **Selection, hover and focus rings show in full on a point drawn as one
  element (VW-12).** vellum is moving a keyed point with a solid fill and an
  undashed solid stroke from a fill element plus a `fill="none"` stroke twin to
  one element carrying both paints, halving the DOM nodes of a scatter. The ring
  rules painted the stroke under the fill (`paint-order: stroke fill`), which on
  one element hides the inner half of the ring; they now use
  `paint-order: normal`, so the ring looks the same on both outputs. The widget
  works with either: hover, selection and conditional colours act on every node
  of a key, and a condition recolours the fill and stroke a node actually uses.

# vellumwidget 0.11.0

* **Linked widgets follow a changed `group` and are freed when removed (VW-5).**
  After a Shiny re-render with a new `group` (or `crosstalk` group), a widget
  published to the new group but kept listening on the old one. It now leaves
  the old group and joins the new one, closing its old crosstalk handles. A
  widget whose element is removed from the page (a re-render, `renderUI()`)
  leaves the linking bus and closes its crosstalk handles instead of lingering.

* **Hover in open space finds the right mark when zoomed (VW-3).** The
  client-to-scene fit behind nearest-mark hover is now made per data panel, from
  that panel's own marks, and ignores legend swatches and hidden or filtered
  marks. Before, one fit across every mark and the legend went wrong once axis
  zoom scaled the data but not the legend, and in faceted plots. The fit is
  cached until the view, the widget size, a re-render or a legend/filter change
  invalidates it, so a hover frame no longer scans every element and forces
  four layouts.

* **`as_widget()`'s settings are grouped into option helpers.** The flat
  arguments move into four helpers, each validating its own arguments:

  | Old argument | New |
  |---|---|
  | `tooltip_delay`, `tooltip_follow`, `tooltip_sticky`, `tooltip_style` | `tooltip = tooltip_options(delay, follow, sticky, style)` |
  | `export_filename`, `export_scale` | `export = export_options(filename, scale)` |
  | `navigator_height` | `navigator = navigator_options(height)` |
  | `mode`, `raster_threshold`, `text` | `render = render_options(mode, raster_threshold, text)` |

  `navigator` still takes `TRUE`/`FALSE`. The old names keep working but are
  deprecated: each warns once per session. Passing an option object together
  with its own old names (say `tooltip = tooltip_options()` and
  `tooltip_delay = 250`) is an error. `as_widget()` drops from 24 formals to 18,
  and the export filename and scale now always reach the payload (`"plot"` and
  `1` by default, the runtime's own fallbacks) (R-13).

* **Zoom follow-ups for facets, secondary axes and time zones (VW-10).**
  * `input$<id>_zoom` gains `panels`, a list keyed by panel id with each
    panel's visible data range (`list(x=, y=, panel=)`), so a faceted plot
    reports what every facet shows. Under plain viewBox zoom a panel outside
    the view reports `NULL`. Single-panel plots keep `data` as before, so
    existing code is unaffected.
  * Axis-aware zoom re-ticks secondary axes (`sec_axis()` / `dup_axis()`)
    instead of hiding them. The transform is read back from the static axis's
    own labels: exact for a linear transform, interpolated between the static
    breaks otherwise. A shared prefix or suffix (`"$"`, `" km"`) and thousands
    separators carry over. An axis whose labels are not plain numbers stays
    hidden under zoom.
  * Datetime ticks get their own UTC offset when the static labels show a
    daylight-saving change. Such an axis is matched to an IANA time zone that
    reproduces its labels (the viewer's zone is tried first), so zooming into
    a DST change no longer shifts labels by an hour. An axis that one fixed
    offset explains keeps that offset.

* `as_widget()` now checks every argument up front and fails with an error that
  names the argument. Before, `raster_threshold = NA` crashed with "missing
  value where TRUE/FALSE needed", `tooltip_delay = "abc"` sent `NA` to the
  browser, and `group = 1:3` sent an array. Flags must be `TRUE` or `FALSE`,
  sizes and delays non-negative numbers, `group` / `alt` / `export_filename` /
  `elementId` single strings, and `tooltip_style` a named list of its four known
  fields (an unknown field is now an error, not silently dropped) (VW-6).

* **`vellumwidget_proxy()` works with module ids (VW-7).** The proxy looked up
  its widget with a bare `"#" + id` selector, so an output id holding `.` or
  `:` (common inside Shiny modules) silently matched nothing. The id is now
  escaped with `CSS.escape()`, with a built-in fallback where the browser lacks
  it.

* **Hover is cheaper while the pointer stays on one mark (VW-4).** A pointer
  move that resolves to the same hovered mark and highlight set now only moves
  the tooltip; it no longer clears and re-applies the highlight classes, re-runs
  the `condition()` pass or rebuilds the tooltip. Moving through empty space no
  longer re-clears a plot with nothing hovered. On a 3000-mark plot with one
  hover condition, 50 moves over the same mark went from about 245 ms to about
  1 ms in the jsdom benchmark.

# vellumwidget 0.10.0

* **Interval selections brush a data range.** A plot that declares
  `vellumplot::select_interval()` now turns the brush into that named selection,
  and `condition()` / `filter_by()` react to it as they do to a point selection.
  Membership is by data value: the brushed pixels are converted to a data range
  through the panel's scale (continuous, log10/sqrt/reverse, date, datetime, or
  the covered categories of a discrete axis) and each element's own data values
  are tested, so a brush in one facet selects matching rows in every facet. An
  x-only (or y-only) brush leaves a band across the full panel that stays on the
  data through pan and zoom; clicking empty space or pressing `Escape` clears
  it. Members are reported in `input$<id>_selected`; `input$<id>_brush` gains
  `selection` and `interval`, and goes to `NULL` when the brush is cleared. When
  the scales cannot be inverted (a raw scene, a composition, a custom transform)
  the brush falls back to selecting what it covers on screen. Needs no new
  `as_widget()` option, and works without Shiny.

* **Axis-aware zoom now re-ticks log, date, datetime and discrete axes, and
  faceted plots.** Before, any of these fell back to scaling the whole scene.
  Log10 axes tick decades, then 1-3 or 1-2-5 subdivisions as you zoom in, with
  vellumplot's static labels. Date and datetime axes tick on calendar
  boundaries (years down to seconds) and keep the axis's own `date_labels`
  format until the step needs a finer one; a datetime axis drawn in a local
  time zone ticks on that zone's clock. Discrete and binned axes keep the
  categories still in view. In a faceted plot every panel zooms about the
  matching point and re-ticks its own axes, labelling only the outer panels as
  the static plot does. The panels payload now carries each axis's static
  `breaks` and `labels`.

* Under axis-aware zoom, wheel and pinch zooms stay anchored under the cursor
  once the view is already zoomed. The client-to-plot mapping used the zoomed
  view where the frame shows the base one, so the anchor drifted.


# vellumwidget 0.9.1

* **Hovering or clicking a polygon's hole no longer hits the polygon.** The
  runtime decided "inside" per ring, so a point inside any ring, a hole
  included, counted as on the shape. It now decides once across all of an
  element's rings under the rule the shape is filled with (even-odd or nonzero
  winding), as vellum's `vl_nearest()` does from vellum 0.7.2. The payload's
  geometry block gains an `eo` column, sent only when some element is
  even-odd.

* Hexagons and pie/donut sectors now hover and click by their outline instead
  of their bounding box. vellum 0.7.2 reports their geometry.

* **Click-to-source now shows each mark's own rows, including marks from a
  layer with its own data.** vellumplot tags every element with the table its
  rows refer to, and the widget now ships each layer's table (`fields`, plus the
  rows when `inspect_source(values = TRUE)`) next to the plot data. Clicking a
  mark from a layer drawn with `data =` lists that layer's fields and rows
  instead of nothing. The `vellum:source` event and `input$<id>_source` gain a
  `source` entry (`"plot"` or `"layer:<i>"`) and report that table's fields.
  This supersedes the 0.9.0 stopgap that left such marks out of the popover.
  Plot-data marks are unchanged, and an element without a source tag (an older
  vellumplot) still reads the plot data.

# vellumwidget 0.9.0

* **Click-to-source no longer shows the wrong rows for a layer with its own
  data.** The popover looks every element's rows up in the plot's data, but a
  layer drawn from its own `data =` indexes that layer's table, so clicking one
  of its marks listed unrelated rows of the plot data. vellumplot now tags each
  element with the table its rows refer to, and elements from a layer's own data
  are left out of the popover instead of answering with the wrong rows.

* **Security fix: the click-to-source popover no longer parses data as HTML.**
  The popover that `inspect_source()` opens on a click was assembled as an HTML
  string and inserted with `innerHTML`. Field names and row values only passed
  through a regex that strips *complete* `<...>` tags, so an unterminated tag in
  the data, such as `<img src=x onerror=alert(1) //`, survived and ran as script
  in the viewer's page. The popover is now built element by element with
  `textContent`, the way the accessible data table already is, so every value
  is shown as literal text. Markup in a value (`<b>bold</b>`) now appears as
  written instead of being stripped.

* **A polygon with a hole is now hit-tested exactly, not approximately.** A
  `path` element ships every ring's vertices concatenated, and the runtime had no
  way to tell where one ring ended -- so it read the whole run as ONE closed ring.
  That invents a phantom edge from each ring's last vertex to the next ring's
  first, and closes the last ring back to the very first vertex. Exact for a
  single-ring path (a plain sf polygon, the common case), an approximation for a
  polygon with a hole or a multipart feature, and the error is not small: on a
  square-with-a-hole fixture the old reading put a point 20 px outside the shape
  at 90 px away, and called the shape's own centre a miss.

  `vellum::element_geometry()` gained a `ring` column in 0.7.0, so the payload
  now carries the ring boundaries (`nr`, `rl`) and the runtime measures each ring
  separately. It follows the engine's own rule -- a path's distance is the minimum
  over its rings, each measured as filled, so being inside **any** ring is a hit
  and the fill rule does not enter into it. Client-side answers now match
  `vl_nearest()` exactly on the same scene.

  Both columns are omitted when every element is a single ring, so the usual
  payload does not grow, and a widget saved by an older build keeps working on
  the one-ring reading.

* **Bug fix: data marks are no longer drawn offset from their own coordinates.**
  Under `axis_zoom`/`zoom_marks = "fixed"` (both default), the constant-size
  counter-scale is applied as an *inline CSS* transform, which outranks the SVG
  `transform` presentation attribute. Panel marks are positioned by that attribute
  (a panel-offset matrix), so the counter-scale replaced their placement and every
  glyph rendered at its untranslated geometry — displaced from the scene by the
  panel origin. The widget therefore showed the wrong data coordinates, and
  disagreed with the PNG and PDF of the same scene.

  The inline transform now carries the node's own placement ahead of the
  counter-scale, so position and constant size both hold. `transform-origin`
  resolves the scale about the glyph's own centre and translations commute with
  that, so the composition is exact for the translate-only matrices vellum emits.

  The visible symptom was a crosshair that missed the mark it was tracking:
  `drawCrosshair()` works in scene space (correctly), while hit-testing calibrates
  against the marks' real rendered positions, so hover was right and the guide rule
  was not. Both agree again.

  This is the same clobbering as the 0.8.0 legend-swatch fix, which assumed data
  points "carry absolute coordinates" and so restricted the counter-scale to marks
  inside the pannable region. Marks inside that region carry a positioning
  transform too, so excluding the outside was not enough.

# vellumwidget 0.8.0

Requires **vellum >= 0.6.6**, which fixes the coordinate space
`element_geometry()` reports in — the exact hit-testing below is built on it.

* **The raster base image is now rendered at 2× for HiDPI screens.** A widget is
  always viewed at screen resolution, and a 1× image stretched by the browser is
  visibly soft on a retina display. `scene_png(scale = 2)` multiplies dpi while
  holding physical size, so the image carries two pixels per device pixel while
  the SVG shell stays in device pixels — the space the element bounding boxes and
  panel rectangles live in, so nothing about hit-testing or pan/zoom changes.

  No new argument: raster mode is chosen precisely when the SVG alternative would
  be enormous, so the extra bytes are noise against what they replace (at 30,000
  keyed points, 446 KB → 877 KB, versus a 14.7 MB per-element SVG). The dense end
  is *cheaper* at 2×, not dearer — a saturated canvas compresses better.

  The shell's dimensions now come from the scene rather than from the image, via
  `vellum::vl_convert()`. Halving a scaled PNG re-rounds and drifted by a pixel
  on a fractional page size, which would have put a small but systematic offset
  between the drawn frame and the bounding-box space picking uses.

* **Exact hit-testing: picking now measures to the mark, not to its box.** The
  payload carries each keyed element's true vertices in device pixels
  (`vellum::element_geometry()`, computed once at build time); the Flatbush
  R-tree still shortlists candidates by bounding box — a box distance is never
  greater than the true distance, so nothing in range is missed — and the
  shortlist is then ranked by distance to the actual shape. What changes:

  - **Graph edges are hoverable.** An edge's box is the whole rectangle its
    endpoints span, so a box-distance "nearest" matched it from anywhere inside
    that rectangle; edges had to be excluded from the open-space snap entirely.
    They are now measured to the line and compete on their merits.
  - **A diagonal is no longer matched from the far corner of its box.** On a
    four-series line chart whose boxes each cover ~91% of the panel, a cursor on
    a line picks that line — where previously two or more series were tied at
    box-distance zero at 39 of 40 probe positions.
  - **A click inside a filled region hits the region**, at distance zero, rather
    than snapping to whichever border happens to be nearest.
  - **Round marks are measured to the disc**, not to the square around it.

  Only the kinds whose shape is not their box (segment, line, polygon, path) are
  shipped; a point's disc and a label's box are reconstructed from the bounding
  box the payload already carries, so the dense scatter — where payload size
  actually bites — pays nothing for this. Above 500,000 vertices the block is
  dropped with a message and picking falls back to boxes.

  Brush and lasso are unchanged: a box is the right answer for a rectangular
  brush, which is what it was always for.

* **Raster-mode widgets no longer touch disk.** The base image is now encoded
  with `vellum::scene_png()`, which returns the PNG bytes, instead of rendering
  to a `tempfile()` and reading it back. Widget output is unchanged.

* **Animated plots as widgets.** `as_widget()` now accepts a keyframe animation
  from `vellumplot::animate()` and embeds it as a self-contained **animated SVG**
  — resolution-independent and honouring `prefers-reduced-motion` (both handled
  inside the SVG by vellum). It plays on its own through the runtime's existing
  inline-SVG mount; since the marks move every frame there is no per-element
  interaction index (no hover/brush) and no raster canvas.

* **Fix: click-to-source did nothing for single-row groups.** A grob backed by
  one data row had its `rows` auto-unboxed to a scalar in the payload, so the
  runtime's `rows.length` check skipped it (no event, no popover) — e.g. every
  single-county region of a choropleth. The payload now forces arrays, and the
  runtime coerces a scalar defensively.

* **Click-to-source.** When a plot opts in with `vellumplot::inspect_source()`,
  clicking a mark surfaces the source data rows behind it: the widget reads the
  compiled scene's provenance (keyed by each grob's `data-vellum-id`), fires a
  bubbling `vellum:source` DOM event (`detail` = `id`, `rows`, `fields`, and
  `values` when `inspect_source(values = TRUE)`), sets `input$<id>_source` under
  Shiny, and shows a small values popover. Opt-in rides the spec, so it adds no
  `as_widget()` argument and no payload weight to a plain widget.

# vellumwidget 0.7.0

* **Bug fix: hover snapped to the wrong mark on a scaled plot.** When the svg was
  rendered at a different size than its viewBox implies (the widget's
  `max-width:100%`, the RStudio Viewer pane, an embedded/`saveWidget` page), hover
  highlighted a mark offset from the cursor (usually up-and-left); click was
  unaffected because it uses the DOM target. The client→scene hit-test mapping
  relied on `getScreenCTM()` / viewBox math, which can disagree with how the
  content is actually laid out when the svg carries `width`/`height` attributes.
  Hit-testing (hover, brush, lasso) now **calibrates the transform from the real
  rendered positions of the marks themselves** versus their known scene bboxes —
  exact under any viewBox / attribute / CSS-scale / zoom combination. Tooltip
  anchoring uses the mark's own rendered position.

* **Breaking: interaction is now declared in the plot, not on `as_widget()`.**
  The interaction-intent arguments have been removed — `hover_color`,
  `selected_color`, `dim_opacity` (now `vellumplot::condition()`), and the
  `hover`/`select`/`brush`/`lasso`/`tooltip`/`nearest`/`zoom`/`axis_zoom`/
  `zoom_marks` toggles (now **on by default** — interactive-by-default). The
  signature drops from ~36 to 24 arguments. Per-plot interaction (highlight,
  filter, cross-filter) travels with the spec via
  `vellumplot::select_point()`/`select_interval()`/`condition()`/`filter_by()`.
  Requires `vellumplot (>= 0.6.0.9000)`. (`hover_mode`, `crosshair`,
  `legend_click`, `select_mode`, and the tooltip-appearance args remain until
  their spec equivalents land.)

* **Declarative interactivity: cross-view filtering.** A selection defined on one
  cell of a composition and referenced by `filter_by()` on another now
  cross-filters — brush/select the source cell and the linked cell narrows to the
  matching rows, matched by a cross-view `join` id. The **source cell stays fully
  visible**; only the target cell hides (scoped by per-cell-unique keys). All in
  one widget runtime, no server round-trip.

* **Declarative interactivity: filters.** A `vellumplot` plot that declares
  `filter_by(selection)` now hides everything outside the selection when that
  selection's gesture fires — reusing the cross-filter path. Driven entirely by
  the plot spec (no `as_widget()` argument). Single-view for now; the cross-view
  form (brush one panel, filter another) follows.

* **Declarative interactivity: conditional encodings.** `as_widget()` now reads
  the interaction model a `vellumplot` plot declares (`select_point()` /
  `condition()`) off the compiled spec and enacts it on the frozen scene. A
  hover- or click-driven selection with a `condition()` on an aesthetic keeps
  selection members at their `if_true` style and applies `if_false` to
  non-members (an explicit colour, or the theme dim as a spotlight) — reverting
  when the selection empties. No new `as_widget()` argument: the behaviour
  travels with the plot. (Filters, cross-view, and scale binds follow.)

# vellumwidget 0.6.0

* **Bug fix: legend swatches no longer jump off-screen under axis-aware zoom.**
  With `axis_zoom`/`zoom_marks = "fixed"` (both default), the constant-size counter-
  scale was applied to every glyph mark, including discrete legend swatches. Because
  a swatch is positioned by a `transform` attribute (unlike data points, which carry
  absolute coordinates), the inline counter-scale overrode that attribute and flung
  the swatch to a corner. The counter-scale is now restricted to marks inside the
  pannable data region, so legend swatches stay put.

* **Axis-aware zoom (`axis_zoom`, default `TRUE`).** Wheel/drag zoom scales only
  the plot's data region and re-ticks the axes for the visible range — holding the
  frame (axes, titles, legend) in place the way a charting library zooms, rather
  than scaling the whole scene like an image. Hit-testing (hover/brush/lasso), the
  crosshair, and the `input$<id>_zoom` data range all follow the zoomed data region.
  Applies to a single **linear** cartesian panel (continuous `identity`/`reverse`
  axes) rendered as SVG; plots with log/date/discrete axes, several panels, or in
  raster mode silently fall back to the ordinary whole-scene zoom, so it is safe to
  leave on. Set `axis_zoom = FALSE` for the plain whole-scene zoom. Built on vellum's
  pannable-panel contract (`vl_viewport(pannable=)`) and the panel scale metadata
  `vellumplot` emits (needs the current development `vellum`/`vellumplot`).

* **Constant-size markers on zoom (`zoom_marks`, default `"fixed"`).** Under
  axis-aware zoom, glyph marks (points, circles, hexagons, sector wedges) now keep
  their original pixel size and only their positions re-map — so points stay round
  and don't stretch into ellipses under the navigator's x-only zoom, the way a
  charting library zooms. Positional marks (bars, error bars, lines, areas) still
  scale with the data; their stroke width is held constant. Set `zoom_marks =
  "scale"` for the old behaviour where glyphs grow with the zoom (useful to read
  density). Applies to SVG axis-aware zoom and the raster crisp-point layer.

* **Interactive continuous colorbar filter (visualMap).** When a `vellumplot` plot
  maps a continuous `color` scale, its colorbar becomes a range filter: drag the
  two handles on the gradient bar to a value range and marks whose colour value
  falls outside it fade out (and drop out of hover/brush hit-testing); double-click
  the bar to reset. The selected range is reported to Shiny as
  `input$<id>_colorfilter = c(lo, hi)` (`NULL` at the full range). Automatic — no
  argument to set — whenever the plot has a continuous colorbar (needs the current
  development `vellumplot`; SVG mode). Discrete/binned colour legends keep their
  existing click-to-hide interaction.

* **Tooltip polish.** `as_widget()` gains `tooltip_delay` (ms to wait before the
  tooltip appears — the highlight is immediate, only the tooltip waits),
  `tooltip_follow` (`TRUE`, the default, tracks the cursor; `FALSE` anchors above
  the mark), and `tooltip_sticky` (the tooltip accepts pointer events and lingers
  briefly on leave, so tooltips containing links/buttons are usable). The tooltip
  also now auto-flips below the cursor when there isn't room above and clamps
  horizontally so it doesn't overflow the widget.

* **Overview navigator (`navigator = TRUE`).** An opt-in strip below the plot that
  renders the whole scene in miniature with a draggable, resizable window marking
  the visible x-range: drag the window to pan, drag a handle to zoom. Zoom is
  **x-only** — the selected x-range fills the width while the full y-range stays on
  screen (a time-series range selector). With `axis_zoom` (the default) it is
  rendered through the axis-aware zoom, so the x-axis re-ticks crisply; otherwise
  the view stretches horizontally. It stays two-way in sync with the main view —
  wheel/keyboard/brush, the toolbar, and linked-group pan/zoom all move the window,
  and moving the window drives them. Useful for scrubbing long series.
  `navigator_height` sets the strip height (default 56px). Client-side; off by
  default.

* **Linked pan/zoom across a `group`.** Widgets sharing a `group` already linked
  selection and hover; now panning or zooming one moves the others to the same
  view. The view is shared as a *fraction* of each widget's own extent (over the
  same client-side bus, no Shiny/crosstalk), so linked plots of different sizes —
  small multiples — stay aligned. Reset links too.

* **Brush and view now report data-space coordinates, not just pixels.** When the
  plot carries a cartesian scale (any `vellumplot` plot), `input$<id>_brush` gains
  the brushed region's data-space bounds `x0d,y0d,x1d,y1d` (plus the `panel` name)
  alongside the existing device-pixel rectangle, and `input$<id>_zoom` gains
  `data = list(x=, y=, panel=)`, the visible range in data coordinates. This reads
  the per-panel scale descriptors `vellumplot` now attaches to the scene (requires
  the current development `vellum` (>= 0.4.0.9000) and `vellumplot`); a raw `vellum` scene
  or a non-cartesian coordinate system reports device-pixel fields only, as before.
  Date/time axes report the numeric epoch (days for `Date`, seconds for `POSIXct`),
  which you map back with `as.Date()` / `.POSIXct()`. The fields describe the
  *visual* axes (under `coord_flip()`, `x0d` is the plot's `y` aesthetic); a
  discrete axis reports fractional band positions; and an axis built with a custom
  `scales::transform_*()` object (beyond identity / log10 / sqrt / reverse) is
  omitted from the data-space fields rather than reported wrong. (Groundwork for
  axis-aware zoom.)

* **Fix: cross-filtered and legend-hidden marks were still hit-testable.** A
  display-tier cross-filter (crosstalk or `vw_filter()`) and a legend
  `legend_click = "hide"` toggle set the marks to `display:none`, but they stayed
  in the spatial index — so a nearest-mark hover could still tooltip a hidden
  datum, and a brush or lasso could re-select filtered-out points (propagating the
  selection back to linked/crosstalk views). Keyboard traversal already skipped
  hidden marks; hover, brush, lasso, and raster click-snap now do too, via a single
  "inert" guard. Muted (not hidden) legend series stay interactive.

* **Freehand lasso-select.** A third drag mode alongside brush and pan (default
  on; disable with `as_widget(lasso = FALSE)`). The toolbar's mode button now
  cycles brush → lasso → pan, and it appears whenever at least two drag modes are
  enabled. Drag a loop and every mark whose centre falls inside it is selected —
  hit-tested with a point-in-polygon check over the Flatbush spatial index, so it
  stays fast on large scenes. It reports through `input$<id>_brush` like the box
  brush, with a `lasso = TRUE` flag and the loop's bounding box.

* **Widgets report their current view to Shiny (`input$<id>_zoom`).** After a
  zoom/pan settles — wheel, drag-pan release, pinch, keyboard, reset,
  zoom-to-selection, or a `vw_zoom()` proxy call — the widget publishes
  `list(x=, y=, w=, h=, zoomed=)`: the current `viewBox` (device-px) and whether
  the view is zoomed in. A deduped state input, so a coordinated dashboard can
  react to what the user is looking at. (Data-space limits await axis/scale
  metadata in the scene contract.)

* **Legend click-to-hide and double-click-to-isolate.** `as_widget()` gains a
  `legend_click` argument. The default `"select"` is unchanged (clicking a
  discrete-legend swatch selects its series). `"hide"` turns the legend into a
  visibility toggle — a single click hides or shows the series, a double-click
  isolates it (hides every other series; double-click again to restore all) — the
  reflexive legend interaction from plotly / ECharts / Highcharts. `"mute"` is the
  same but dims the series rather than removing it (keeping its layout). Hovering a
  swatch still highlights its series under every policy, and hidden series drop out
  of hover/tooltip hit-testing. Works with keyboard (Enter/Space on a focused
  swatch toggles) and is independent of the crosstalk cross-filter (the two never
  clobber each other). Entirely client-side.

* **Shared (unified) hover tooltips and a crosshair.** `as_widget()` gains a
  `hover_mode` argument. The default `"closest"` is unchanged (hover shows the
  single nearest mark), but `"x"` (or `"y"`) turns on a *unified* hover: every
  mark sharing the hovered x (or y) position is highlighted at once and listed
  together in one tooltip box — the shared readout multi-series line and
  time-series charts expect, where you want every series' value at the cursor's
  x rather than one point. A companion `crosshair` argument (default `FALSE`)
  draws a guide rule at the hovered position: a vertical rule at the shared x in
  `"x"` mode, a horizontal one in `"y"` mode, and a full cross through the mark
  in `"closest"` mode. Both are entirely client-side and need no extra scene
  metadata — the mark positions come straight from the element index — so they
  work on any keyed `vellumplot` plot or raw `vellum` scene, and in raster mode.
  Unified hover snaps along its axis so the readout tracks the cursor anywhere in
  the plot; the `hover` Shiny input still reports the single nearest (primary)
  mark, so the read-back contract is unchanged.

* **Fix: hover/selection feedback rings were drawn offset from the mark.** When
  the widget container was larger than the plot's rendered box — which happens
  routinely, as htmlwidgets stamps an explicit `height` on the container and a
  fluid layout can stretch its width — the feedback overlay filled the whole
  container while the base SVG only filled its aspect-locked box. The overlay's
  `viewBox` then letterboxed (centred), so every hover/selection ring drew off
  the real mark: downward when the container was taller (e.g. 68px low for a
  520px-tall container over a 384px plot) and sideways when it was wider. It
  looked like the wrong mark was picked. Hit-testing itself was always correct;
  only the visual feedback was displaced. The svg and its overlays now share a
  shrink-to-fit stage, so the overlay tracks the svg box exactly at any container
  size.

# vellumwidget 0.5.0

* **`text` argument on `as_widget()`.** Choose how text is written into the SVG,
  passed through to `vellum::scene_svg()`: `"native"` (the default) emits
  selectable `<text>` referencing system fonts — smaller when the page has the
  font, post-processable, and better for accessibility and LLMs — while
  `"outline"` emits pixel-faithful, font-independent glyph paths. Applies to the
  per-element SVG path only; in raster mode text is baked into the base image and
  the argument is ignored (with a warning if set explicitly) (#1).

* **New articles.** Two articles document the features added since 0.4.0:
  *Linking views with crosstalk* (coordinating a widget with DT / plotly /
  leaflet and crosstalk's `filter_*` inputs) and *Very large scenes* (raster
  mode, the spatial index, the columnar payload, and crisp zoom).

* **Crisp zoom in raster mode.** When you zoom into a raster-mode plot, the base
  image used to upscale and blur. The widget now redraws the points sharply on a
  `<canvas>` overlay while zoomed in — sampling each point's colour straight from
  the rendered image and its position/size from the element index, so the crisp
  layer matches what vellum drew. It engages only when zoomed in (the faithful,
  anti-aliased base image still shows at the full view), redraws just the points in
  view, and degrades gracefully to the image alone where a 2D canvas context isn't
  available. Entirely client-side; no change to the payload or to small/moderate
  (SVG-mode) plots.

* **Very large scatterplots are navigable (raster mode).** `as_widget()` gains a
  `mode` argument (`"auto"` / `"svg"` / `"raster"`). In `"auto"` (the default), a
  scene with more than `raster_threshold` keyed elements (default `20000`) is drawn
  **once as a single embedded image** instead of one SVG node per element, and all
  interaction — hover tooltips + highlight, click/brush select, pan/zoom — is driven
  client-side from the element index (bounding boxes + keys) rather than the DOM.
  A 150k-point keyed scatter that previously produced a ~75 MB SVG with 150,000 DOM
  nodes now ships as a ~0.8 MB image plus a compact index, with a handful of DOM
  nodes, and stays smooth to hover and pan. Small and moderate plots are unchanged
  (they keep the per-element SVG). Trade-offs in raster mode: per-element grammar
  colours, per-mark screen-reader focus, and display-tier cross-filtering don't
  apply (there are no per-element nodes), and a zoomed-in view is a scaled raster
  until re-rendered. Adds a dependency on `base64enc`.

* **Smoother hover, brush, and pan on large plots.** Two client-side changes lift
  the per-interaction cost that made big scatterplots laggy:
  * **Spatial index.** Nearest-mark hover and rectangular brush now hit-test
    against a [Flatbush](https://github.com/mourner/flatbush) R-tree
    (O(log n) / O(k)) instead of scanning every element each time. The nearest-mark
    scan runs on every pointer move, so this is the change you feel most.
  * **Cheaper hover dim.** Above a threshold, hovering dims the plot once (via the
    holder's opacity) and re-draws the hovered marks crisply in a small overlay —
    O(hovered) — instead of restyling *every* element via CSS (O(n)), which forced
    a full-scene style recalc on each hover. Small and moderate plots keep the exact
    previous per-mark dim. (Phase 2 of vellum's big-data interactivity plan.)

* **Much faster, smaller payload for large plots (columnar element table).** The
  keyed-element metadata `as_widget()` embeds is now serialised in a *columnar*
  form (one array per field) instead of one JSON object per element. This is a
  transparent wire-format change — the widget behaves identically — but it removes
  the per-element serialisation cost that dominated at large N. On a 150,000-point
  keyed scatter the payload build + serialise dropped from **~24 s / 89 MB to
  ~0.4 s / 12 MB** (~60x faster), so a big interactive scatter is no longer choked
  by payload generation. Small and moderate plots are unaffected. (This is Phase 1
  of vellum's big-data interactivity plan; the browser-side DOM/hover work for
  truly huge scatters follows in later phases.)

* **Error bars and boxplots are interactive.** Now that vellumplot keys these
  statistical marks, the widget hovers, tooltips, clicks/selects, and brushes them
  as units: an error bar's bar + caps, or a box's rect + median + whiskers, all
  light up and select together because they share one `data-key` (outliers stay
  individually addressable). Brush selection no longer double-counts a mark whose
  key spans several SVG elements — `input$<id>_brush$keys` reports each such key
  once. No runtime change was needed for the core behaviour; it already grouped
  every node sharing a key.

# vellumwidget 0.4.0

* **Server-to-client proxy (`vellumwidget_proxy()`).** A Shiny app can now drive an
  already-rendered widget from the server **without re-rendering it** — no
  `renderVellumwidget()` round-trip, no lost pan/zoom. Get a handle with
  `vellumwidget_proxy(outputId)` (inside an `observe()`), then pipe it through the
  verbs:
  * `vw_select()` / `vw_clear_selection()` — set or clear the selection (projects
    across `hover_group` and propagates to linked / crosstalk widgets, exactly
    like a user click, and updates `input$<id>_selected`);
  * `vw_filter()` / `vw_clear_filter()` — cross-filter the widget (show only the
    given keys, dim the rest; display tier, data untouched);
  * `vw_zoom()` / `vw_reset_zoom()` — frame a set of keys, or restore the full view.

  All keys are the element `data_id`s — the same identifiers you read back through
  `input$<id>_selected`. This completes the two-way Shiny story begun with the
  input read-back in 0.3.0; see the expanded *Using vellumwidget in Shiny* article.

# vellumwidget 0.3.0

* Adopted vellum's renamed `vl_*` graphics primitives (grid collision fix).

* **Shiny input read-back.** A widget rendered with `vellumwidgetOutput()` now reports the
  user's interactions to the server as reactive inputs keyed by the output id:
  `input$<id>_selected` (selected keys, state), `input$<id>_click` (`list(key=)`,
  event), `input$<id>_hover` (hovered key or `NULL`, state), and
  `input$<id>_brush` (`list(keys=, x0=, y0=, x1=, y1=)`, event). Values are element
  data keys, so they map straight back to your data. Emitted only in a live Shiny
  session — a static render is unchanged and produces no input traffic. See the new
  *Using vellumwidget in Shiny* article. (Driving the widget from the server — a
  `vellumwidget_proxy()` — is a planned follow-up.)

* **Accessibility (`a11y = TRUE`, on by default).** The interactive widget is now
  keyboard- and screen-reader-navigable, not a mute image:
  * the SVG is announced as an interactive chart (`role="graphics-document"` +
    `aria-roledescription`), labelled from the scene's title/description (which
    `vellumplot` sets automatically) or an explicit `as_widget(alt =)`;
  * every mark is a focusable `graphics-symbol` with a **roving tabindex** — arrow
    keys move between marks, Enter/Space toggles selection, Escape exits;
  * a polite **`aria-live`** region announces the focused / selected mark;
  * a visually-hidden **data table** lists every mark for assistive tech.
  All gated on `a11y`; `a11y = FALSE` restores the previous output exactly. See the
  vellumplot *Accessibility* article.

# vellumwidget 0.2.0

Interaction-depth release (ROADMAP §4).

* **Rich tooltips.** Tooltip text now renders as *safe* HTML: an author-built
  `tooltip =` (e.g. via `glue()`) may use `<b>`/`<i>`/`<br>` for bold/italic/
  line breaks. Data values are escaped and only inert, attribute-free tags are
  honoured — no scripts, handlers, or attributes (no XSS). New
  `as_widget(tooltip_style =)` themes the tooltip box (background/color/fontsize/
  max_width).
* **Touch + keyboard.** The widget is driven by pointer events, so pan/brush/
  hover work with mouse, touch, and pen from one path; a two-finger pinch
  zooms. With the widget focused, arrow keys pan, `+`/`-` zoom, and `0` resets.
* **Configurable export.** `as_widget(export_filename =, export_scale =)` set the
  download filename base and a hi-res PNG multiplier; exports capture the current
  (zoomed/panned) view. A "copy PNG to clipboard" toolbar button appears where
  the Clipboard API is available.
* **Large-N performance.** Hover/selection highlighting uses a per-render
  key→node cache instead of a `querySelectorAll` per key, and the nearest-mark
  hover scan is throttled to one per animation frame.
* New "Interactive widgets: a tour" article.

Deferred: a spatial index for hit-testing (the DOM cost was the real bottleneck,
now cached; bbox scans are cheap and datashade collapses huge clouds to a
raster); coordinated zoom across linked widgets and URL deep-linking; PDF export.

# vellumwidget 0.1.0

First release. vellumwidget turns a `vellum` scene or a `vellumplot` plot into a
self-contained, client-side interactive HTML widget via a single terminal
`as_widget()` pipe — no Shiny, no server round-trip. Everything below ships in
this first release.

## Features

* `as_widget()` compiles a `vellumplot` plot or a raw `vellum` scene and bundles its
  SVG + `scene_model()` element table into an htmlwidget.
* **Hover** — tooltip (from the declared `tooltip`, falling back to the key) and
  highlight with inverse-dim; a hovered element's `hover_group` highlights the
  whole group. Hover snaps to the **nearest mark** when the cursor isn't directly
  over one.
* **Click** — select (single / multiple modes); every element sharing a key
  toggles together.
* **Brush** — drag a rectangle to select every element it covers.
* **Pan / zoom** — mouse wheel and pan-mode drag reframe the SVG `viewBox`, plus
  zoom-to-selection and reset.
* **Toolbar** (on hover) — brush/pan mode toggle, zoom-to-selection, reset zoom,
  download SVG, download PNG, fullscreen.
* Everything is opt-outable via `as_widget()` arguments
  (`tooltip`/`hover`/`select`/`brush`/`zoom`/`toolbar`/`nearest`).
* **Legend interaction.** For a discrete `color`/`shape` scale on an interactive
  plot, each legend swatch drives its whole data series: hovering a swatch
  highlights the series (the swatch stays lit), clicking it selects the series
  (and links across views / crosstalk). Automatic — no extra arguments.
* **Linked views.** `as_widget(group=)` links vellumwidget widgets client-side (no
  dependency): selecting/brushing in one highlights the same data keys in the
  others, projecting by `hover_group` (select one, select the series).
  `as_widget(crosstalk = SharedData)` bridges to the crosstalk ecosystem
  (plotly / leaflet / DT and `filter_*` inputs) via a `SelectionHandle` +
  `FilterHandle`; a crosstalk filter hides the non-matching marks (display-tier
  cross-filter). crosstalk is a Suggests, loaded only when used.
* **Customisable interaction styling**, at two composing levels:
  * *Widget theme* — `as_widget(hover_color=, selected_color=, dim_opacity=)`
    sets the look for the whole plot (any R or CSS colour).
  * *Per-element grammar* — `vellumplot` marks' `hover_color`/`selected_color`
    (constant or column-mapped) style each element individually and override the
    theme. Both use CSS variables with a defaults ← theme ← per-element cascade.

The JS runtime is TypeScript in `srcts/`, bundled by esbuild into the committed
`inst/htmlwidgets/vellumwidget.js` (so the R package installs with no Node).
