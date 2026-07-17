#' Turn a vellum scene (or vellumplot plot) into an interactive widget
#'
#' `as_widget()` is the terminal verb of the interactivity pipeline: it compiles
#' its input to a `vellum` scene, emits the SVG (with per-element `data-key`s) and
#' the [`vellum::scene_model()`] element table, and bundles them with the `vellumwidget`
#' JavaScript runtime into a self-contained [htmlwidgets::createWidget()] widget.
#' The result does hover tooltips, hover highlighting, and click selection
#' entirely client-side --- no Shiny, no server round-trip. Pan/zoom, brush, and
#' selection work with mouse, touch (drag to pan, two-finger pinch to zoom), and
#' keyboard input: the arrows pan and `+`/`-`/`0` zoom and reset, except that with
#' accessibility on (the default) the arrows move between marks while one is
#' focused --- see the `a11y` argument.
#'
#' Interactivity is driven by the keys/metadata a plot declares. In `vellumplot` these
#' come from the reserved `data_id` / `tooltip` / `hover_group` mark arguments; a
#' plot that declares none renders as a static (but still embeddable) SVG. A
#' hovered element with a `data_id` but no `tooltip` shows its key.
#'
#' The scene metadata `vellumwidget` reads --- the [`vellum::scene_model()`] element
#' table and the SVG `data-key` / `data-vellum-*` attributes --- is specified in
#' vellum's "The scene contract" vignette
#' (`vignette("scene-contract", package = "vellum")`).
#'
#' @param x A `vellumplot` plot (a `PlotSpec` / `PlotComposition`) or a `vellum`
#'   scene --- anything [vellum::as_vellum_scene()] accepts.
#' @param width,height Widget size (any valid CSS size, or `NULL` to size from the
#'   scene). Passed to [htmlwidgets::createWidget()].
#' @param tooltip,hover,select Toggles for the three hover/click interactions
#'   (all `TRUE`).
#' @param brush,zoom,toolbar Toggles for rectangular brush-select, wheel/drag
#'   pan-zoom (via the SVG `viewBox`), and the on-hover toolbar (all `TRUE`).
#' @param lasso Enable freehand **lasso-select** (default `TRUE`): a third drag
#'   mode alongside brush and pan, cycled from the toolbar's mode button. Drag a
#'   loop and every mark whose centre falls inside it is selected. Like the brush,
#'   it reports through `input$<id>_brush` (with a `lasso = TRUE` flag and the
#'   loop's bounding box). The mode button appears whenever at least two drag modes
#'   are enabled.
#' @param nearest When `TRUE` (default), hover snaps to the nearest mark within a
#'   small radius when the cursor is not directly over one (helps sparse points).
#' @param hover_mode How hover gathers marks into the tooltip. `"closest"`
#'   (default) shows the single nearest mark. `"x"` (or `"y"`) gives a *unified*
#'   hover: every mark sharing the hovered x (or y) position is highlighted and
#'   listed together in one box — the shared readout multi-series line and
#'   time-series charts expect. Unified mode always snaps along its axis, so the
#'   readout tracks the cursor regardless of `nearest`. The mark positions come
#'   from the element index, so no axis metadata is required; the box lists each
#'   mark's `tooltip` (one row per series) without a value-axis header.
#' @param crosshair Draw a guide rule at the hovered position (default `FALSE`):
#'   a vertical rule at the shared x when `hover_mode = "x"`, a horizontal rule
#'   when `"y"`, and a full cross through the mark when `"closest"`. Colour is the
#'   `--vellumwidget-crosshair-stroke` CSS variable (a muted grey by default).
#' @param legend_click What clicking a discrete-legend swatch does. `"select"`
#'   (default) selects the swatch's whole series (the established behaviour).
#'   `"hide"` makes the legend a visibility toggle — a single click hides/shows
#'   the series, a double-click isolates it (hides every other series; double-click
#'   again to restore all) — the reflexive legend interaction in plotly / ECharts /
#'   Highcharts. `"mute"` is the same but dims the series instead of removing it
#'   (its layout is kept). Hovering a swatch still highlights its series under every
#'   policy. Applies only where the plot draws an interactive legend (a discrete
#'   `color` / `shape` scale in `vellumplot`).
#' @param a11y Accessibility (default `TRUE`). Makes the widget a keyboard- and
#'   screen-reader-navigable chart: the SVG is labelled as an interactive chart
#'   (`role="graphics-document"`), each mark is a focusable `graphics-symbol` with
#'   a roving tabindex (arrow keys move between marks, Enter/Space select, Escape
#'   exits), a polite `aria-live` region announces the focused/selected mark, and
#'   a visually-hidden data table lists every mark for assistive tech. `FALSE`
#'   restores the previous behaviour (no chart semantics, marks not focusable).
#' @param alt Accessible label (alt text) for the chart as a whole. Defaults to
#'   the scene's own title/description — which `vellumplot` sets automatically from the
#'   plot title and [vellumplot::plot_alt()] — so an explicit value is only needed for
#'   a raw `vellum` scene or to override.
#' @param hover_color,selected_color Outline colours for hovered / selected
#'   elements (any R or CSS colour), applied widget-wide. `hover_color = NULL`
#'   (default) keeps the plain dim-others hover; `selected_color = NULL` uses the
#'   built-in default. A per-mark `hover_color`/`selected_color` declared in
#'   `vellumplot` overrides these for that mark.
#' @param dim_opacity Opacity (0–1) of the non-hovered elements while hovering
#'   (default `0.28`); `NULL` keeps the default.
#' @param tooltip_style Optional named list styling the tooltip box:
#'   `background` / `color` (any R or CSS colour), `fontsize`, and `max_width`
#'   (any CSS length). `NULL` (default) uses the built-in style. Tooltip text is
#'   rendered as safe HTML — an author-built `tooltip =` (e.g. via `glue()`) may
#'   use `<b>`/`<i>`/`<br>` for bold/italic/line breaks; data values are escaped
#'   and only those inert tags are honoured (no scripts/attributes).
#' @param export_filename,export_scale The download filename base (no extension;
#'   default `"plot"`) and the PNG resolution multiplier (default `1`) for the
#'   toolbar's SVG/PNG export. Exports capture the current (zoomed/panned) view.
#' @param select_mode `"multiple"` (default; click toggles each element) or
#'   `"single"` (click replaces the selection).
#' @param group Optional linking group name. Widgets sharing a `group` link
#'   client-side: selecting (or brushing) in one highlights the same data keys in
#'   the others — no Shiny, no crosstalk. Selection projects by `hover_group` when
#'   the marks declare it (select one, select the whole series).
#' @param crosstalk Optional [crosstalk::SharedData] (or a crosstalk group name
#'   string) to link this widget with the crosstalk ecosystem (plotly, leaflet,
#'   DT, and crosstalk's `filter_*` inputs). The widget's `data_id`s must match the
#'   SharedData's keys. A crosstalk filter hides the non-matching elements
#'   (display-tier cross-filter). Requires the crosstalk package.
#' @param mode Rendering strategy for the marks. `"auto"` (default) ships a
#'   per-element SVG for small/moderate plots and switches to a single embedded
#'   raster image above `raster_threshold` keyed elements; `"svg"` always uses the
#'   per-element SVG; `"raster"` always uses the image. In raster mode the marks are
#'   drawn once as a base image and all interaction (hover, click, brush, pan/zoom)
#'   is driven client-side from the element index (bounding boxes + keys), so a very
#'   large scatter (100k+ points) stays navigable with a tiny DOM and a small
#'   payload. The trade-offs of raster mode: per-element grammar colours,
#'   per-mark screen-reader focus, and display-tier cross-filtering do not apply
#'   (there are no per-element DOM nodes), and a zoomed-in view is a scaled raster
#'   until re-rendered.
#' @param raster_threshold Keyed-element count above which `mode = "auto"` switches
#'   to the raster image (default `20000`).
#' @param text How text is written into the SVG, passed to [vellum::scene_svg()]:
#'   `"native"` (default) emits selectable `<text>` referencing system fonts —
#'   smaller when the page has the font, post-processable, and better for
#'   accessibility and LLMs; `"outline"` emits glyph outlines that are
#'   pixel-faithful and font-independent but not selectable. Applies to the
#'   per-element SVG path only; in raster mode (see `mode`) text is baked into the
#'   base image and this argument is ignored (with a warning if set explicitly).
#' @param elementId Optional explicit widget DOM id.
#' @return An htmlwidget of class `"vellumwidget"`.
#' @examples
#' \dontrun{
#' library(vellumplot)
#' df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, model = rownames(mtcars))
#' vplot(df) |>
#'   mark_point(x = wt, y = mpg, tooltip = model, data_id = model) |>
#'   as_widget()
#' }
#' @export
as_widget <- function(x, width = NULL, height = NULL,
                      tooltip = TRUE, hover = TRUE, select = TRUE,
                      brush = TRUE, lasso = TRUE, zoom = TRUE, toolbar = TRUE,
                      nearest = TRUE,
                      hover_mode = c("closest", "x", "y"), crosshair = FALSE,
                      legend_click = c("select", "hide", "mute"),
                      a11y = TRUE, alt = NULL,
                      hover_color = NULL, selected_color = NULL, dim_opacity = NULL,
                      tooltip_style = NULL,
                      export_filename = NULL, export_scale = NULL,
                      group = NULL, crosstalk = NULL,
                      select_mode = c("multiple", "single"),
                      mode = c("auto", "svg", "raster"),
                      raster_threshold = 20000L,
                      text = c("native", "outline"),
                      elementId = NULL) {
  select_mode <- match.arg(select_mode)
  hover_mode <- match.arg(hover_mode)
  legend_click <- match.arg(legend_click)
  mode <- match.arg(mode)
  text_set <- !missing(text)
  text <- match.arg(text)
  scene <- vellum::as_vellum_scene(x)
  model <- vellum::scene_model(scene)
  ct_group <- .crosstalk_group(crosstalk)

  # Above `raster_threshold` keyed elements a per-element SVG (one DOM node each)
  # is too heavy to build, ship, and hover; the raster path draws the scene once as
  # a single embedded image and drives all interaction from the element index
  # (bboxes + keys) client-side instead. `mode` forces either path.
  n_keyed <- if (is.null(model$elements) || !nrow(model$elements)) 0L else sum(!is.na(model$elements$key))
  use_raster <- switch(mode,
    raster = TRUE,
    svg = FALSE,
    auto = n_keyed > raster_threshold
  )
  if (use_raster) {
    # Raster mode bakes the marks (text included) into a single PNG, so the SVG
    # `text` control has nothing to act on. Flag it only when the caller asked
    # explicitly, so the drop is visible rather than silent.
    if (text_set) {
      warning(
        "`text` is ignored in raster mode; text is rendered into the base image.",
        call. = FALSE
      )
    }
    r <- .raster_svg(scene)
    svg <- r$svg
    dims <- list(width = r$width, height = r$height)
  } else {
    svg <- vellum::scene_svg(scene, text = text)
    dims <- .svg_dims(svg)
  }

  payload <- list(
    svg = svg,
    elements = .vellumwidget_elements(model),
    panels = .vellumwidget_panels(model),
    options = list(
      raster = use_raster,
      tooltip = isTRUE(tooltip),
      hover = isTRUE(hover),
      select = isTRUE(select),
      brush = isTRUE(brush),
      lasso = isTRUE(lasso),
      zoom = isTRUE(zoom),
      toolbar = isTRUE(toolbar),
      nearest = isTRUE(nearest),
      hoverMode = hover_mode,
      crosshair = isTRUE(crosshair),
      legendClick = legend_click,
      a11y = isTRUE(a11y),
      alt = if (is.null(alt)) NULL else as.character(alt),
      selectMode = select_mode,
      group = group,
      crosstalk = ct_group,
      style = c(
        list(
          hoverColor = .css_color(hover_color),
          selectedColor = .css_color(selected_color),
          dimOpacity = if (is.null(dim_opacity)) NULL else as.numeric(dim_opacity)
        ),
        .tooltip_style(tooltip_style)
      ),
      export = drop_null(list(
        filename = if (is.null(export_filename)) NULL else as.character(export_filename),
        scale = if (is.null(export_scale)) NULL else as.numeric(export_scale)
      ))
    )
  )

  # Load crosstalk's client library only when a SharedData/group is used, so a
  # plain widget carries no crosstalk dependency.
  deps <- if (!is.null(ct_group) && requireNamespace("crosstalk", quietly = TRUE)) {
    crosstalk::crosstalkLibs()
  } else {
    NULL
  }

  htmlwidgets::createWidget(
    name = "vellumwidget",
    x = payload,
    width = width %||% dims$width,
    height = height %||% dims$height,
    package = "vellumwidget",
    dependencies = deps,
    elementId = elementId,
    sizingPolicy = htmlwidgets::sizingPolicy(
      defaultWidth = dims$width,
      defaultHeight = dims$height,
      browser.fill = FALSE,
      viewer.fill = FALSE,
      knitr.figure = FALSE,
      padding = 0
    )
  )
}

# Normalise a `tooltip_style` list (background/color/fontsize/max_width) into the
# JS `style` fields (tipBg/tipFg/tipFontSize/tipMaxWidth). Colours are CSS-
# normalised; sizes pass through as CSS length strings. NULL -> no entries.
.tooltip_style <- function(ts) {
  if (is.null(ts)) {
    return(list())
  }
  if (!is.list(ts)) {
    stop("`tooltip_style` must be a named list (background/color/fontsize/max_width).", call. = FALSE)
  }
  drop_null(list(
    tipBg = .css_color(ts$background),
    tipFg = .css_color(ts$color),
    tipFontSize = if (is.null(ts$fontsize)) NULL else as.character(ts$fontsize),
    tipMaxWidth = if (is.null(ts$max_width)) NULL else as.character(ts$max_width)
  ))
}

# Drop NULL entries from a list (so unset style fields don't reach the payload).
drop_null <- function(x) x[!vapply(x, is.null, logical(1))]

# Resolve the crosstalk group name from `crosstalk`: a crosstalk::SharedData (use
# its group), a group-name string, or NULL (no crosstalk).
.crosstalk_group <- function(crosstalk) {
  if (is.null(crosstalk)) {
    return(NULL)
  }
  if (inherits(crosstalk, "SharedData")) {
    return(crosstalk$groupName())
  }
  if (is.character(crosstalk) && length(crosstalk) == 1L) {
    return(crosstalk)
  }
  stop("`crosstalk` must be a crosstalk::SharedData, a group-name string, or NULL.", call. = FALSE)
}

# The keyed elements the JS runtime needs: for each drawn, keyed element, its
# tooltip / hover-group / styling and its device-px bounding box (in the SVG's
# viewBox coordinate space, so brush/nearest hit-testing needs no rescaling).
# Elements without a key (panel background, gridlines, legend glyphs) are dropped
# -- they are not interactive. Not deduplicated: `scene_model()` already yields one
# row per datum, and the brush needs every element's geometry.
#
# The result is a **columnar** structure -- a named list of equal-length vectors
# (`key`, `x0`, `y0`, `x1`, `y1`, and any present meta column), one entry per
# element, rather than a list of per-element records. This is a pure wire-format
# change: the JS runtime reconstructs the same per-element view on ingestion. It
# matters because htmlwidgets serialises the payload to JSON, and serialising N
# small objects is O(N) allocations of tiny lists on the R side and dominates for
# large N: measured on a 150k-point keyed scatter, the old per-record payload took
# ~24 s / 89 MB to build+serialise (htmlwidgets JSON), the columnar form
# ~0.4 s / 12 MB (~60x faster, ~7x smaller).
# Absent meta columns are omitted entirely; within a present column, elements
# lacking that field carry `NA` (serialised as `null`). `legend` is ragged (a mark
# may belong to several series) so it stays a list-column.
.vellumwidget_elements <- function(model) {
  el <- model$elements
  if (is.null(el) || !nrow(el)) {
    return(list())
  }
  keep <- !is.na(el$key)
  if (!any(keep)) {
    return(list())
  }
  el <- el[keep, , drop = FALSE]
  n <- nrow(el)
  meta <- el$meta
  if (length(meta) < n) meta <- c(meta, vector("list", n - length(meta)))
  # A keyed-but-plain scene (e.g. a huge scatter with `data_id` only, no tooltips)
  # carries no meta at all -- skip the per-field scans entirely so the big-N build
  # stays proportional to just the geometry columns.
  any_meta <- any(lengths(meta) > 0L)

  # Pull one reserved meta key across all elements into an atomic column, or NULL
  # if no element carries it. Exact `[[` access (not `$`, which partial-matches, so
  # `m$legend` would wrongly pick up a swatch's `legend_for`). `transform` maps a
  # present value (e.g. a colour name -> CSS hex); absent -> NA.
  meta_col <- function(field, transform = as.character) {
    if (!any_meta) return(NULL)
    present <- FALSE
    out <- vapply(meta, function(m) {
      v <- if (is.null(m)) NULL else m[[field]]
      if (is.null(v)) {
        NA_character_
      } else {
        present <<- TRUE
        as.character(transform(v))[[1L]]
      }
    }, character(1))
    if (present) out else NULL
  }

  cols <- list(
    key = as.character(el$key),
    x0 = as.numeric(el$x0), y0 = as.numeric(el$y0),
    x1 = as.numeric(el$x1), y1 = as.numeric(el$y1),
    tooltip = meta_col("tooltip"),
    hover_group = meta_col("hover_group"),
    # Per-element grammar styling (Option 2), normalised to CSS colours.
    hover_color = meta_col("hover_color", .css_color),
    selected_color = meta_col("selected_color", .css_color),
    # A legend swatch's series it drives.
    legend_for = meta_col("legend_for")
  )
  # Legend membership is ragged (a mark may belong to several series) -> a
  # list-column; each entry is a character vector, or `character(0)` when absent.
  if (any_meta) {
    legend <- lapply(meta, function(m) {
      v <- if (is.null(m)) NULL else m[["legend"]]
      if (is.null(v)) character(0) else as.character(v)
    })
    if (any(lengths(legend) > 0L)) cols$legend <- legend
  }

  # Drop the omitted (NULL) meta columns; the always-present key/bbox columns stay.
  cols[!vapply(cols, is.null, logical(1))]
}

# The per-panel geometry + scale descriptors the runtime needs to map device
# pixels back to data values (data-space brush + view reporting). Only cartesian
# data panels that carry a `scales` meta (from vellumplot) are emitted; a scene
# with none (raw vellum, or non-cartesian coords) yields NULL and the widget stays
# pixel-only. Each panel carries its resolved device-px rectangle and, per axis, a
# compact scale descriptor (type / transform / data + native domains / time unit)
# --- enough to invert px -> native -> data. `scene_model()$panels` is specified in
# vellum's "The scene contract" vignette.
.vellumwidget_panels <- function(model) {
  p <- model$panels
  if (is.null(p) || !nrow(p) || is.null(p$meta)) {
    return(NULL)
  }
  axis <- function(a) {
    if (is.null(a)) return(NULL)
    drop_null(list(
      type = as.character(a$type),
      transform = as.character(a$transform %||% "identity"),
      data_lo = as.numeric(a$data_lo), data_hi = as.numeric(a$data_hi),
      native_lo = as.numeric(a$native_lo), native_hi = as.numeric(a$native_hi),
      time_unit = if (is.null(a$time_unit)) NULL else as.character(a$time_unit)
    ))
  }
  out <- list()
  for (i in seq_len(nrow(p))) {
    sc <- p$meta[[i]]$scales
    if (is.null(sc) || !isTRUE(sc$cartesian)) next
    # A finite device-px rectangle is required to invert pixels; skip a panel whose
    # viewport geometry wasn't resolved (px* NA) rather than ship a rect the runtime
    # would mis-handle as JSON nulls.
    rect <- c(p$px0[i], p$py0[i], p$px1[i], p$py1[i])
    if (anyNA(rect) || !all(is.finite(rect)) || p$px1[i] == p$px0[i] || p$py1[i] == p$py0[i]) next
    out[[length(out) + 1L]] <- drop_null(list(
      name = as.character(p$name[i]),
      px0 = as.numeric(p$px0[i]), py0 = as.numeric(p$py0[i]),
      px1 = as.numeric(p$px1[i]), py1 = as.numeric(p$py1[i]),
      x = axis(sc$x), y = axis(sc$y)
    ))
  }
  if (!length(out)) NULL else out
}

# Pixel width/height declared on the emitted <svg> (its intrinsic size), used to
# size the widget container. Falls back to NULL (let htmlwidgets decide).
.svg_dims <- function(svg) {
  head <- substr(svg, 1L, 400L)
  grab <- function(attr) {
    m <- regmatches(head, regexpr(sprintf('%s="[0-9.]+"', attr), head))
    if (!length(m)) {
      return(NULL)
    }
    as.numeric(sub(sprintf('%s="([0-9.]+)"', attr), "\\1", m))
  }
  list(width = grab("width"), height = grab("height"))
}

`%||%` <- function(a, b) if (is.null(a)) b else a

# Escape the XML metacharacters for embedding a scene title/description in the
# raster shell's <title>/<desc>. Kept tiny (no dependency); attribute-safe too.
.xml_escape <- function(s) {
  s <- gsub("&", "&amp;", s, fixed = TRUE)
  s <- gsub("<", "&lt;", s, fixed = TRUE)
  s <- gsub(">", "&gt;", s, fixed = TRUE)
  s
}

# Read a PNG's pixel dimensions from its IHDR chunk (bytes 17-24, big-endian),
# dependency-free — the ground truth for the raster shell's viewBox so the element
# bboxes (in the same device-px space) line up with the image.
.png_dims <- function(path) {
  con <- file(path, "rb")
  on.exit(close(con))
  b <- readBin(con, "raw", n = 24L)
  if (length(b) < 24L) {
    return(NULL)
  }
  be <- function(v) sum(as.integer(v) * 256^(3:0))
  list(width = be(b[17:20]), height = be(b[21:24]))
}

# Render the scene to a PNG and wrap it as a self-contained `<svg><image></svg>`
# shell in the scene's device-px viewBox space, so the client can pan/zoom it via
# the viewBox and hit-test element bboxes against it without any rescaling. The
# scene's title/description (if any) ride along as `<title>`/`<desc>` so the chart
# keeps an accessible name. The image is a base64 data URI (self-contained widget).
.raster_svg <- function(scene) {
  tmp <- tempfile(fileext = ".png")
  on.exit(unlink(tmp), add = TRUE)
  vellum::render(scene, tmp)
  d <- .png_dims(tmp)
  if (is.null(d)) {
    stop("could not read the rendered raster dimensions", call. = FALSE)
  }
  title <- tryCatch(scene@title, error = function(e) NULL)
  desc <- tryCatch(scene@desc, error = function(e) NULL)
  head <- ""
  ids <- character(0)
  if (!is.null(title) && nzchar(title)) {
    head <- paste0(head, sprintf('<title id="vw-t">%s</title>', .xml_escape(title)))
    ids <- c(ids, "vw-t")
  }
  if (!is.null(desc) && nzchar(desc)) {
    head <- paste0(head, sprintf('<desc id="vw-d">%s</desc>', .xml_escape(desc)))
    ids <- c(ids, "vw-d")
  }
  a11y <- if (length(ids)) sprintf(' role="img" aria-labelledby="%s"', paste(ids, collapse = " ")) else ""
  uri <- paste0("data:image/png;base64,", base64enc::base64encode(tmp))
  svg <- sprintf(
    paste0(
      '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d"%s>',
      "%s",
      '<image width="%d" height="%d" preserveAspectRatio="none" href="%s"/></svg>'
    ),
    d$width, d$height, d$width, d$height, a11y, head, d$width, d$height, uri
  )
  list(svg = svg, width = d$width, height = d$height)
}

# Normalise an R or CSS colour to a CSS colour string (hex, with alpha when
# present), so users can pass R colour names ("steelblue", "grey35") or numbers.
# NULL/NA -> NULL (no override). Vectorised (for per-element colours).
.css_color <- function(x) {
  if (is.null(x)) {
    return(NULL)
  }
  out <- rep(NA_character_, length(x))
  ok <- !is.na(x)
  if (any(ok)) {
    m <- grDevices::col2rgb(x[ok], alpha = TRUE)
    hex <- ifelse(
      m[4L, ] < 255L,
      sprintf("#%02x%02x%02x%02x", m[1L, ], m[2L, ], m[3L, ], m[4L, ]),
      sprintf("#%02x%02x%02x", m[1L, ], m[2L, ], m[3L, ])
    )
    out[ok] <- hex
  }
  if (length(out) == 1L) {
    if (is.na(out)) NULL else out
  } else {
    out
  }
}

#' Shiny bindings for vellumwidget widgets
#'
#' Standard [htmlwidgets] output/render helpers so a `vellumwidget` widget can appear in
#' a Shiny app or an interactive R Markdown document.
#'
#' # Reading interactions server-side
#'
#' A widget rendered as `vellumwidgetOutput("plot")` reports the user's interactions back
#' to the server as reactive inputs, keyed by the output id. All values are the
#' element **data keys** (the `data_id` a `vellumplot` mark declares); map them back to
#' your data by that key.
#'
#' \describe{
#'   \item{`input$plot_selected`}{Character vector of the currently selected keys
#'     (click / brush / keyboard, and any selection arriving from a linked widget).
#'     Updates as state — re-selecting the same set is a no-op. `character(0)` when
#'     nothing is selected.}
#'   \item{`input$plot_click`}{A list `list(key=)` for each click; `key` is `NULL`
#'     for a click on empty space. An event input — fires on every click, even the
#'     same mark twice.}
#'   \item{`input$plot_hover`}{The hovered key, or `NULL` when the pointer leaves a
#'     mark. Updates as state (re-fires only when the hovered key changes).}
#'   \item{`input$plot_brush`}{A list `list(keys=, x0=, y0=, x1=, y1=)` when a
#'     brush (or lasso) gesture completes: the selected keys and the region's
#'     bounding rectangle in the scene's device-pixel (viewBox) coordinates. A
#'     lasso gesture also carries `lasso = TRUE`. When the plot carries a cartesian
#'     scale (a `vellumplot` plot), it *also* carries the region's **data-space**
#'     bounds `x0d,y0d,x1d,y1d` and the `panel` name. An event input.}
#'   \item{`input$plot_zoom`}{A list `list(x=, y=, w=, h=, zoomed=)` — the current
#'     view (the SVG `viewBox` in device-pixel coordinates) plus a `zoomed` flag
#'     (is the view narrower/shorter than the full extent). For a single-panel
#'     cartesian plot it also carries `data = list(x=c(lo,hi), y=c(lo,hi), panel=)`,
#'     the visible range in **data** coordinates. Updates as state when a zoom/pan
#'     settles (wheel, drag-pan release, pinch, keyboard, reset, zoom-to-selection,
#'     or a proxy [vw_zoom()]).}
#' }
#'
#' Data-space coordinates (`x0d`/… and `zoom$data`) come from the per-panel scale
#' descriptors `vellumplot` attaches to the scene; a raw `vellum` scene or a
#' non-cartesian coordinate system carries none, and only the device-pixel fields
#' are reported. Some specifics:
#' * They describe the **visual** axes: `x0d`/`x1d` (and `zoom$data$x`) are the
#'   *horizontal* axis. Under `coord_flip()` that is the plot's `y` aesthetic.
#' * **Date/time** axes report the numeric epoch (days for `Date`, seconds for
#'   `POSIXct`); map back with `as.Date()` / `.POSIXct()`.
#' * A **discrete** axis reports fractional band positions (category *i* sits at
#'   `i`), not the level labels.
#' * Axes built with a custom `scales::transform_*()` object (anything beyond
#'   identity / log10 / sqrt / reverse) can't be inverted client-side, so that axis
#'   is omitted from the data-space fields (device-pixel fields still report).
#'
#' These are emitted only inside a live Shiny session; a static render (knitr,
#' pkgdown, `htmltools::save_html()`) produces identical output and no input
#' traffic. To drive the widget *from* the server — set the selection, cross-filter
#' it, or zoom it without a re-render — use [vellumwidget_proxy()].
#'
#' @param outputId Shiny output slot id.
#' @param width,height Widget size.
#' @param expr An expression producing a `vellumwidget` widget.
#' @param env,quoted Standard non-standard-evaluation plumbing.
#' @return `vellumwidgetOutput()`: a Shiny output UI element. `renderVellumwidget()`: a Shiny
#'   render function.
#' @seealso [as_widget()]
#' @name vellumwidget-shiny
#' @export
vellumwidgetOutput <- function(outputId, width = "100%", height = "400px") {
  htmlwidgets::shinyWidgetOutput(outputId, "vellumwidget", width, height, package = "vellumwidget")
}

#' @rdname vellumwidget-shiny
#' @export
renderVellumwidget <- function(expr, env = parent.frame(), quoted = FALSE) {
  if (!quoted) {
    expr <- substitute(expr)
  }
  htmlwidgets::shinyRenderWidget(expr, vellumwidgetOutput, env, quoted = TRUE)
}
