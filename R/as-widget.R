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
#' Graph (`vgraph()`) plots that declare `vellumplot::select_neighbours()` are
#' enacted here: hovering a node spotlights its neighbourhood (the node, its
#' incident edges, and its adjacent nodes) and dims the rest, and hovering an edge
#' spotlights its two endpoints. The adjacency is reconstructed from the endpoint
#' identity each edge carries --- no extra configuration.
#'
#' The scene metadata `vellumwidget` reads --- the [`vellum::scene_model()`] element
#' table and the SVG `data-key` / `data-vellum-*` attributes --- is specified in
#' vellum's "The scene contract" vignette
#' (`vignette("scene-contract", package = "vellum")`).
#'
#' @param x A `vellumplot` plot (a `PlotSpec` / `PlotComposition`) or a `vellum`
#'   scene --- anything [vellum::as_vellum_scene()] accepts. Also a keyframe
#'   animation from `vellumplot::animate()`, embedded as a self-contained animated
#'   SVG that plays on its own (no per-element interaction).
#' @param width,height Widget size (any valid CSS size, or `NULL` to size from the
#'   scene). Passed to [htmlwidgets::createWidget()].
#' @param toolbar Show the on-hover toolbar (default `TRUE`). Hover tooltip,
#'   highlight, click-select, brush, lasso, pan/zoom, and axis-aware zoom are
#'   **on by default** (interactive-by-default) and no longer have per-widget
#'   toggles; per-mark hover/select styling and selection-driven behaviour are
#'   declared in the plot spec instead (see `vellumplot::condition()` /
#'   `vellumplot::select_point()`).
#' @param navigator Show an overview **range navigator** below the plot (default
#'   `FALSE`): a full-width strip rendering the whole scene in miniature, with a
#'   draggable, resizable window marking the visible x-range. Drag the window to
#'   pan, drag a handle to zoom; it stays two-way in sync with the main view
#'   (wheel/keyboard/brush and linked-group changes all move it). Useful for long
#'   series. `TRUE` shows it with the defaults; pass [navigator_options()] to
#'   show it and set its height.
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
#' @param tooltip Tooltip behaviour and style, from [tooltip_options()]: the
#'   show delay, whether the box follows the cursor, whether it is sticky, and the
#'   box style. `NULL` is the same as `tooltip_options()`.
#' @param export The toolbar's SVG/PNG download settings, from
#'   [export_options()]: the filename and PNG scale. `NULL` is the same as
#'   `export_options()`.
#' @param select_mode `"multiple"` (default; click toggles each element) or
#'   `"single"` (click replaces the selection).
#' @param group Optional linking group name. Widgets sharing a `group` link
#'   client-side: selecting (or brushing) in one highlights the same data keys in
#'   the others, and panning/zooming one **pans/zooms the others** to the same
#'   relative view — no Shiny, no crosstalk. Selection projects by `hover_group`
#'   when the marks declare it (select one, select the whole series). Linked
#'   pan/zoom shares the view as a *fraction* of each widget's own extent, so it
#'   links correctly even across differently-sized plots (e.g. small multiples).
#' @param crosstalk Optional [crosstalk::SharedData] (or a crosstalk group name
#'   string) to link this widget with the crosstalk ecosystem (plotly, leaflet,
#'   DT, and crosstalk's `filter_*` inputs). The widget's `data_id`s must match the
#'   SharedData's keys. A crosstalk filter hides the non-matching elements
#'   (display-tier cross-filter). Requires the crosstalk package.
#' @param render How the marks are drawn, from [render_options()]: per-element
#'   SVG or a single raster image (`mode`), the element count at which `"auto"`
#'   switches to the image (`raster_threshold`), and how SVG text is written
#'   (`text`). `NULL` is the same as `render_options()`.
#' @param elementId Optional explicit widget DOM id.
#' @param ... Deprecated flat arguments, still accepted with a once-per-session
#'   warning: `tooltip_delay`, `tooltip_follow`, `tooltip_sticky` and
#'   `tooltip_style` (now `tooltip = tooltip_options()`), `export_filename` and
#'   `export_scale` (now `export = export_options()`), `navigator_height` (now
#'   `navigator = navigator_options()`), and `mode`, `raster_threshold` and
#'   `text` (now `render = render_options()`).
#' @return An htmlwidget of class `"vellumwidget"`.
#' @examples
#' \dontrun{
#' library(vellumplot)
#' df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, model = rownames(mtcars))
#' vplot(df) |>
#'   mark_point(x = wt, y = mpg, tooltip = model, data_id = model) |>
#'   as_widget()
#'
#' # Grouped options
#' vplot(df) |>
#'   mark_point(x = wt, y = mpg, tooltip = model, data_id = model) |>
#'   as_widget(
#'     tooltip = tooltip_options(delay = 250, style = list(background = "#1d3557")),
#'     export = export_options(filename = "mtcars", scale = 2),
#'     render = render_options(mode = "svg")
#'   )
#' }
#' @seealso [tooltip_options()], [export_options()], [navigator_options()] and
#'   [render_options()] for the grouped settings.
#' @export
# NOTE (agents/maintainers): `as_widget()` already carries many behaviour flags.
# Before adding another interaction argument, consider whether the behaviour
# belongs in the vellumplot *spec* (declarative interactivity) rather than as one
# more imperative widget flag. See CLAUDE.md, "Interactivity: prefer the spec over
# new as_widget() flags". Related settings are grouped into option helpers
# (R/options.R); a new setting in one of those families belongs in its helper.
# A tripwire test (test-as-widget.R) guards this count.
as_widget <- function(
  x,
  width = NULL,
  height = NULL,
  toolbar = TRUE,
  navigator = FALSE,
  hover_mode = c("closest", "x", "y"),
  crosshair = FALSE,
  legend_click = c("select", "hide", "mute"),
  a11y = TRUE,
  alt = NULL,
  tooltip = tooltip_options(),
  export = export_options(),
  group = NULL,
  crosstalk = NULL,
  select_mode = c("multiple", "single"),
  render = render_options(),
  elementId = NULL,
  ...
) {
  width <- .check_css_size(width, "width")
  height <- .check_css_size(height, "height")
  toolbar <- .check_bool(toolbar, "toolbar")
  hover_mode <- .check_choice(hover_mode, c("closest", "x", "y"), "hover_mode")
  crosshair <- .check_bool(crosshair, "crosshair")
  legend_click <- .check_choice(
    legend_click,
    c("select", "hide", "mute"),
    "legend_click"
  )
  a11y <- .check_bool(a11y, "a11y")
  alt <- .check_string(alt, "alt", allow_null = TRUE)
  group <- .check_string(group, "group", allow_null = TRUE, allow_empty = FALSE)
  select_mode <- .check_choice(
    select_mode,
    c("multiple", "single"),
    "select_mode"
  )
  elementId <- .check_string(elementId, "elementId", allow_null = TRUE)

  # Which option objects the caller passed explicitly (read before any of them
  # is reassigned, which would make missing() FALSE).
  supplied <- c(
    if (!missing(tooltip)) "tooltip",
    if (!missing(export)) "export",
    if (!missing(render)) "render",
    if (!is.logical(navigator)) "navigator"
  )

  # The grouped options. `navigator` is TRUE/FALSE or a navigator_options();
  # the others take their helper's object (NULL = the defaults).
  if (!is.logical(navigator)) {
    navigator <- .check_options(
      navigator,
      "navigator",
      "vellumwidget_navigator_options",
      "navigator_options"
    )
  }
  tooltip <- .check_options(
    tooltip,
    "tooltip",
    "vellumwidget_tooltip_options",
    "tooltip_options"
  )
  export <- .check_options(
    export,
    "export",
    "vellumwidget_export_options",
    "export_options"
  )
  render <- .check_options(
    render,
    "render",
    "vellumwidget_render_options",
    "render_options"
  )
  # The deprecated flat arguments (tooltip_delay, mode, ...) arrive in `...`
  # and are folded into the option objects. A logical `navigator` combines with
  # the old `navigator_height` (as it always did); an explicit option object
  # does not mix with its own deprecated flat arguments.
  dep <- .fold_deprecated(list(...), supplied)
  tooltip <- dep$tooltip %||% tooltip
  export <- dep$export %||% export
  render <- dep$render %||% render
  if (is.logical(navigator)) {
    navigator <- .check_bool(navigator, "navigator")
    navigator <- if (!navigator) {
      NULL
    } else {
      dep$navigator %||% navigator_options()
    }
  }

  # A keyframe animation (from vellumplot::animate()) becomes an embedded animated
  # SVG that plays on its own -- its marks move every frame, so there is no stable
  # per-element geometry to hover, and the interactive machinery is skipped.
  if (.is_animation(x)) {
    return(.animation_widget(x, width, height, elementId, alt, a11y))
  }
  scene <- vellum::as_vellum_scene(x)
  # Meta as columns (VR-19): one vector per field, never a record per element.
  model <- vellum::scene_model(scene, meta = "columns")
  ct_group <- .crosstalk_group(crosstalk)

  # Above `raster_threshold` keyed elements a per-element SVG (one DOM node each)
  # is too heavy to build, ship, and hover; the raster path draws the scene once as
  # a single embedded image and drives all interaction from the element index
  # (bboxes + keys) client-side instead. `mode` forces either path.
  n_keyed <- if (is.null(model$elements) || !nrow(model$elements)) {
    0L
  } else {
    sum(!is.na(model$elements$key))
  }
  use_raster <- switch(
    render$mode,
    raster = TRUE,
    svg = FALSE,
    auto = n_keyed > render$raster_threshold
  )
  marks <- NULL
  dlist <- NULL
  above <- NULL
  flagged <- NULL
  if (use_raster && .split_render_supported()) {
    # Split render (VW-14, vellum >= 0.9.0.9000): the furniture (axes, gridlines,
    # legend, text) stays real SVG, so axis zoom can re-tick it, and only the heavy
    # keyed mark layer is a PNG, which the runtime places inside each panel's pan
    # group. Restricting the mark layer to the data panels keeps the legend's
    # keyed swatches in the furniture as real nodes.
    panel_names <- .scene_panel_names(model)
    # Paint-order split (VW-21): with a vellum that splits the furniture by
    # paint order, what was drawn after the marks (a reference line or an
    # annotation added after the points, the title) ships as its own SVG that
    # the runtime stacks above the marks; the rest stays below them.
    split <- .paint_order_supported()
    svg <- vellum::scene_svg(
      scene,
      text = render$text,
      layer = if (split) "unkeyed_below" else "unkeyed",
      panels = panel_names
    )
    if (split) {
      above <- .svg_drawn_or_null(vellum::scene_svg(
        scene,
        text = render$text,
        layer = "unkeyed_above",
        panels = panel_names
      ))
    }
    dims <- .svg_dims(svg)
    marks <- .raster_marks(scene, panel_names)
    dlist <- .raster_display_list(scene, model, panel_names, render$max_marks)
    # The mixed tier (VW-30): the marks the display list flags, as one PNG per
    # run in paint order, so the runtime draws the rest exactly around them.
    flagged <- .raster_flagged(scene, panel_names, dlist, marks, render$text)
  } else if (use_raster) {
    # Raster mode bakes the marks (text included) into a single PNG, so the SVG
    # `text` control has nothing to act on. Flag it only when the caller asked
    # explicitly, so the drop is visible rather than silent.
    if (isTRUE(render$text_set)) {
      warning(
        "`text` is ignored in raster mode; text is rendered into the base image.",
        call. = FALSE
      )
    }
    r <- .raster_svg(scene)
    svg <- r$svg
    dims <- list(width = r$width, height = r$height)
  } else {
    svg <- vellum::scene_svg(scene, text = render$text)
    dims <- .svg_dims(svg)
  }

  interactions <- .vellumwidget_interactions(x)

  payload <- list(
    svg = svg,
    # Raster mode is the big-N path, where the element index is most of the
    # payload: ship it in the compact wire encoding (`.encode_elements()`).
    elements = if (use_raster) {
      .encode_elements(.drop_listed_bboxes(.vellumwidget_elements(model), dlist))
    } else {
      .vellumwidget_elements(model)
    },
    geometry = .vellumwidget_geometry(scene),
    panels = .vellumwidget_panels(model),
    colorbar = .vellumwidget_colorbar(model),
    # The split render's mark layer (raster mode, VW-14), or NULL.
    marks = marks,
    # The marks-only display list (raster mode, VW-15), or NULL.
    displayList = dlist,
    # The furniture painted after the marks (raster mode, VW-21), or NULL.
    above = above,
    # The flagged keyed marks, one PNG per run (raster mode, VW-30), or NULL.
    flagged = flagged,
    interactions = interactions,
    options = list(
      raster = use_raster,
      # Raster detail tier threshold (VW-16): SVG nodes below this many visible marks.
      detailMarks = render$detail_marks,
      # Hover tooltip, highlight, click-select, brush, lasso, pan/zoom, and
      # axis-aware zoom are on by default (interactive-by-default): the runtime
      # supplies the defaults, so they no longer need per-widget flags. Per-mark
      # hover/select styling now comes from the plot spec via `condition()`.
      navigator = !is.null(navigator),
      navigatorHeight = navigator$height,
      toolbar = toolbar,
      hoverMode = hover_mode,
      crosshair = crosshair,
      legendClick = legend_click,
      tooltipDelay = tooltip$delay,
      tooltipFollow = tooltip$follow,
      tooltipSticky = tooltip$sticky,
      a11y = a11y,
      alt = alt,
      selectMode = select_mode,
      group = group,
      crosstalk = ct_group,
      style = .tooltip_style(tooltip$style),
      export = list(
        filename = export$filename,
        scale = export$scale
      )
    )
  )

  # Click-to-source (from vellumplot::inspect_source()): attach the per-grob
  # source-row payload only when the spec opted in, so an ordinary widget carries
  # no extra weight. Keyed by data-vellum-id, which the SVG already carries.
  if (!is.null(interactions) && !is.null(interactions$source)) {
    payload$provenance <- .vellumwidget_provenance(x, interactions$source)
  }

  # Load crosstalk's client library only when a SharedData/group is used, so a
  # plain widget carries no crosstalk dependency.
  deps <- if (
    !is.null(ct_group) && requireNamespace("crosstalk", quietly = TRUE)
  ) {
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

# Is `x` a vellumplot keyframe animation? Detected by its S7 class name so no
# hard dependency on vellumplot is needed (the class is not exported anyway).
.is_animation <- function(x) {
  inherits(x, "vellumplot::vellum_animation")
}

# Build a widget that embeds a self-contained animated SVG (from
# vellumplot::anim_save() to a `.svg`). The SVG carries its own CSS frame
# animation and prefers-reduced-motion fallback, so it plays natively once the
# runtime injects it (`holder.innerHTML = x.svg`) -- no interaction index, no
# raster canvas. Vector-only: an animated SVG is the resolution-independent path.
.animation_widget <- function(x, width, height, elementId, alt, a11y) {
  if (!requireNamespace("vellumplot", quietly = TRUE)) {
    stop(
      "Rendering an animation as a widget needs the 'vellumplot' package.",
      call. = FALSE
    )
  }
  f <- tempfile(fileext = ".svg")
  on.exit(unlink(f), add = TRUE)
  anim_save <- getExportedValue("vellumplot", "anim_save")
  anim_save(f, x)
  svg <- paste(readLines(f, warn = FALSE), collapse = "\n")
  dims <- .svg_dims(svg)

  payload <- list(
    svg = svg,
    elements = list(),
    panels = list(),
    colorbar = NULL,
    options = list(
      animated = TRUE,
      raster = FALSE,
      toolbar = FALSE,
      a11y = isTRUE(a11y),
      alt = if (is.null(alt)) NULL else as.character(alt)
    )
  )

  htmlwidgets::createWidget(
    name = "vellumwidget",
    x = payload,
    width = width %||% dims$width,
    height = height %||% dims$height,
    package = "vellumwidget",
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
  drop_null(list(
    tipBg = .css_color(ts$background),
    tipFg = .css_color(ts$color),
    tipFontSize = if (is.null(ts$fontsize)) NULL else as.character(ts$fontsize),
    tipMaxWidth = if (is.null(ts$max_width)) {
      NULL
    } else {
      as.character(ts$max_width)
    }
  ))
}

# Validate a `tooltip_style` list: `NULL`, or a named list whose names are among
# background/color/fontsize/max_width and whose entries are single values.
# Colours are checked by `.css_color()` when the payload is built.
.tooltip_style_fields <- c("background", "color", "fontsize", "max_width")

.check_tooltip_style <- function(
  ts,
  arg = "tooltip_style",
  call = parent.frame()
) {
  if (is.null(ts)) {
    return(NULL)
  }
  nms <- names(ts)
  if (!is.list(ts) || (length(ts) && (is.null(nms) || !all(nzchar(nms))))) {
    cli::cli_abort(
      c(
        "{.arg {arg}} must be a named list, not {.obj_type_friendly {ts}}.",
        i = "Known fields are {.val {(.tooltip_style_fields)}}."
      ),
      call = call
    )
  }
  bad <- setdiff(nms, .tooltip_style_fields)
  if (length(bad)) {
    cli::cli_abort(
      c(
        "{.arg {arg}} has unknown field{?s} {.val {bad}}.",
        i = "Known fields are {.val {(.tooltip_style_fields)}}."
      ),
      call = call
    )
  }
  for (nm in nms) {
    v <- ts[[nm]]
    if (
      !is.null(v) &&
        (!(is.character(v) || is.numeric(v)) || length(v) != 1L || is.na(v))
    ) {
      cli::cli_abort(
        "{.code {arg}${nm}} must be a single string or number, not {.obj_type_friendly {v}}.",
        call = call
      )
    }
  }
  ts
}

# Drop NULL entries from a list (so unset style fields don't reach the payload).
drop_null <- function(x) x[!vapply(x, is.null, logical(1))]

# The declarative-interactivity block a vellumplot spec carries (selections,
# conditional encodings, filters, scale binds). Read straight off the plot object
# via vellumplot::interaction_model(); NULL for a raw vellum scene or a plot with
# no declared interaction (so the payload field is simply absent).
.vellumwidget_interactions <- function(x) {
  if (!requireNamespace("vellumplot", quietly = TRUE)) {
    return(NULL)
  }
  im <- getExportedValue("vellumplot", "interaction_model")
  ix <- tryCatch(im(x), error = function(e) NULL)
  # A condition's `if_false` is an R colour ("grey80"), which the runtime sets
  # as a CSS fill/stroke: normalise it to hex, or the browser drops it. A value
  # R does not know (a CSS-only name) passes through.
  if (!is.null(ix) && length(ix$conditions)) {
    ix$conditions <- lapply(ix$conditions, function(c) {
      v <- c$if_false
      if (is.character(v) && length(v) == 1L && !is.na(v)) {
        c$if_false <- tryCatch(.css_color(v), error = function(e) v) %||% v
      }
      c
    })
  }
  ix
}

# Build the click-to-source payload for the JS runtime: source rows per grob id
# (`data-vellum-id`), plus the field names and -- when inspect_source(values=)
# asked -- the data rows themselves. Delegates to vellumplot::provenance_payload()
# so vellumwidget needs no drawing or data logic of its own. `src` is the
# interaction model's `source` block (`on`, `values`).
#
# Payload shape (backward compatible with the plot-data-only runtime):
#   byId     id -> 1-based rows into the element's source table
#   fields   plot-data field names        (top level, as before)
#   values   plot-data rows, if values=   (top level, as before)
#   sourceOf id -> source name, ONLY for elements not drawn from the plot data
#            (a layer's own `data =`, tagged "layer:<i>"); absent means "plot"
#   sources  source name -> list(fields, values), ONLY for those non-plot tables
#            (the plot table is the top-level fields/values, not repeated)
# An untagged element (older vellumplot, no `source`) is the plot data.
.vellumwidget_provenance <- function(x, src) {
  if (!requireNamespace("vellumplot", quietly = TRUE)) {
    return(NULL)
  }
  with_values <- isTRUE(src$values)
  pp <- getExportedValue("vellumplot", "provenance_payload")
  pl <- tryCatch(
    pp(x, values = with_values),
    error = function(e) NULL
  )
  if (is.null(pl) || !length(pl$elements)) {
    return(NULL)
  }
  by_id <- list()
  source_of <- list()
  used <- character()
  for (e in pl$elements) {
    s <- e$source %||% "plot"
    if (is.na(s)) {
      s <- "plot"
    }
    if (s != "plot") {
      # A layer table the payload does not describe cannot be shown correctly;
      # leave the element out rather than index the wrong table.
      if (is.null(pl$sources[[s]])) {
        next
      }
      source_of[[e$id]] <- s
      used <- union(used, s)
    }
    # I() so a single-row group serialises as a JSON array ([1]), not a scalar
    # (htmlwidgets auto-unboxes length-1 vectors, which would break rows.length
    # in the runtime).
    by_id[[e$id]] <- I(as.integer(e$rows))
  }
  out <- list(
    on = src$on %||% "click",
    byId = by_id,
    fields = I(as.character(unlist(pl$fields)))
  )
  if (with_values) {
    out$values <- pl$data
  }
  if (length(source_of)) {
    out$sourceOf <- source_of
    out$sources <- list()
    for (s in used) {
      tbl <- pl$sources[[s]]
      rec <- list(fields = I(as.character(unlist(tbl$fields))))
      if (with_values) {
        rec$values <- tbl$data
      }
      out$sources[[s]] <- rec
    }
  }
  out
}

# Resolve the crosstalk group name from `crosstalk`: a crosstalk::SharedData (use
# its group), a group-name string, or NULL (no crosstalk).
.crosstalk_group <- function(crosstalk, call = parent.frame()) {
  if (is.null(crosstalk)) {
    return(NULL)
  }
  if (inherits(crosstalk, "SharedData")) {
    return(crosstalk$groupName())
  }
  if (
    is.character(crosstalk) &&
      length(crosstalk) == 1L &&
      !is.na(crosstalk) &&
      nzchar(crosstalk)
  ) {
    return(crosstalk)
  }
  cli::cli_abort(
    "{.arg crosstalk} must be a {.cls SharedData}, a group-name string, or {.code NULL}, not {.obj_type_friendly {crosstalk}}.",
    call = call
  )
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
  # `scene_model(meta = "columns")`: `meta` is a data frame, one column per
  # field, `NA` (or a `NULL` list entry) where an element lacks the field.
  meta <- el$meta
  if (!is.data.frame(meta)) {
    cli::cli_abort(
      "Internal error: the scene model must carry {.code meta = \"columns\"}."
    )
  }
  all_keyed <- all(keep)
  meta <- if (all_keyed) as.list(meta) else lapply(meta, `[`, keep)
  el <- if (all_keyed) {
    el
  } else {
    el[keep, setdiff(names(el), "meta"), drop = FALSE]
  }
  # Exact field names (no partial matching: `legend` is not `legend_for`).
  field <- function(f) if (f %in% names(meta)) meta[[f]]
  meta_col <- function(f, transform = as.character) {
    .meta_chr(field(f), transform)
  }

  cols <- list(
    key = as.character(el$key),
    # The mark kind (point/circle/rect/segment/...), forwarded so the runtime can
    # keep glyph marks a constant pixel size under axis-aware zoom while positional
    # marks (bars, segments, lines) scale with the data. Already computed by
    # `scene_model()`; NULL only if the column is somehow absent.
    mark = if (!is.null(el$mark)) as.character(el$mark) else NULL,
    x0 = as.numeric(el$x0),
    y0 = as.numeric(el$y0),
    x1 = as.numeric(el$x1),
    y1 = as.numeric(el$y1),
    tooltip = meta_col("tooltip"),
    hover_group = meta_col("hover_group"),
    # Per-element grammar styling (Option 2), normalised to CSS colours.
    hover_color = meta_col("hover_color", .css_color),
    selected_color = meta_col("selected_color", .css_color),
    # A legend swatch's series it drives.
    legend_for = meta_col("legend_for"),
    # Graph edge endpoints: the two node keys this edge joins, so the runtime can
    # reconstruct node<->edge adjacency for neighbour highlighting. Absent for
    # non-edge elements / non-graph plots.
    source = meta_col("source"),
    target = meta_col("target"),
    # Legend membership: the series a mark belongs to. A mark may belong to
    # several (one per legend aesthetic), so this is ragged -- a list-column of
    # character vectors, `character(0)` for none.
    legend = .meta_ragged(field("legend")),
    # Conditional-encoding tags ("<sel>:<aes>") this element participates in --
    # ragged like `legend`. The JS runtime styles non-members of an active
    # selection by these tags.
    cond = .meta_ragged(field("cond")),
    # Filter selection tags (a view filtered by `filter_by()`) -- ragged like
    # `cond`. The runtime hides a tagged element when its `join` is not in the
    # filtering selection's members, scoped to this view.
    filt = .meta_ragged(field("filt")),
    # Cross-view join id (a composition cell's original id; keys are per-cell
    # unique). Absent for a single plot.
    join = meta_col("join"),
    # Continuous colorbar filter value, kept numeric so the runtime can
    # range-test it.
    filter_value = .meta_num(field("filter_value"))
  )
  # Interval-selection data values (from a vellumplot `select_interval()`): the
  # element's value on each brushed position channel -- numeric `ix`/`iy` (with
  # `ixh`/`iyh` the upper end when the element is a series spanning a range), or
  # the category label `ixd`/`iyd` on a discrete axis. The runtime tests these
  # against the brushed data range.
  for (f in c("ix", "ixh", "iy", "iyh")) {
    cols[[f]] <- .meta_num(field(f))
  }
  cols$ixd <- meta_col("ixd")
  cols$iyd <- meta_col("iyd")

  # Drop the absent (NULL) meta columns; the always-present key/bbox columns stay.
  cols[!vapply(cols, is.null, logical(1))]
}

# Compact wire encoding of the columnar element table, used in raster mode where
# the index (not the PNG) is the bulk of the payload. It is a pure wire-format
# step: the runtime's `normalizeElements()` decodes it back to the same
# per-element records. Per column:
#
# - **sparse** `{at, v}`: a column set on under 10% of elements (e.g. `tooltip` /
#   `legend_for`, carried only by the legend swatches of a big scatter) ships just
#   the 0-based indices that carry a value and those values. Absent elsewhere.
# - **dictionary** `{levels, codes}`: a string column with few distinct values
#   (`mark`, a one-series `legend`, `hover_group`, ...) ships each level once and
#   a 0-based integer code per element (`null` for `NA`), or, when the codes
#   come in few long runs, `{levels, rv, rl}`: run codes (-1 for `NA`) and
#   lengths.
# - the bbox columns are rounded outward to 1/100 px (a 0.01 px larger box is
#   invisible to brush / nearest hit-testing, and it halves their JSON).
#
# A ragged list-column (`legend`, `cond`, `filt`) whose entries all hold at most
# one value is first flattened to a character column (`NA` for empty), which the
# runtime already reads as "one value" / "none"; one with several values somewhere
# can still go sparse.
.encode_elements <- function(cols) {
  n <- length(cols$key)
  if (!n) {
    return(cols)
  }
  for (f in c("x0", "y0", "x1", "y1")) {
    v <- cols[[f]]
    if (is.null(v)) {
      next
    }
    cols[[f]] <- if (f %in% c("x0", "y0")) {
      floor(v * 100) / 100
    } else {
      ceiling(v * 100) / 100
    }
  }
  cols$key <- .encode_keys(cols$key)
  for (f in setdiff(names(cols), "key")) {
    v <- cols[[f]]
    if (is.list(v)) {
      flat <- if (all(lengths(v) <= 1L)) .meta_flatten(v, NA_character_)
      if (!is.null(flat)) {
        v <- as.character(flat)
      } else if (all(lengths(v) <= 1L)) {
        v <- vapply(
          v,
          function(e) if (length(e)) as.character(e) else NA_character_,
          character(1)
        )
      } else {
        # Ragged with several values somewhere: only the sparse form applies.
        set <- lengths(v) > 0L
        if (sum(set) < 0.1 * n) {
          cols[[f]] <- list(at = which(set) - 1L, v = v[set])
        }
        next
      }
    }
    set <- !is.na(v)
    if (!any(set)) {
      cols[[f]] <- NULL
      next
    }
    if (sum(set) < 0.1 * n) {
      cols[[f]] <- list(at = which(set) - 1L, v = v[set])
      next
    }
    if (is.character(v)) {
      lv <- unique(v[set])
      if (length(lv) <= n / 4) {
        codes <- match(v, lv) - 1L
        # Long runs of one value (every mark a "point", a series drawn in
        # one go) ship as runs: `rv` codes (-1 for none) and `rl` lengths.
        r <- rle(ifelse(is.na(codes), -1L, codes))
        cols[[f]] <- if (length(r$lengths) < n / 10) {
          list(levels = lv, rv = r$values, rl = r$lengths)
        } else {
          list(levels = lv, codes = codes)
        }
      }
    }
  }
  cols
}

# The key column, compactly when most keys end in an integer (row-numbered
# keys, the usual big-scatter case): `{delta, at, v}` -- the integer suffixes as
# a first value plus successive differences (mostly one or two digits), and the
# other keys (legend swatches, say) sparse at their 0-based positions. When the
# integers carry a text prefix -- vellumplot's default keys, "p1-1:l2:7" (VP-55)
# -- the prefixes ride along as runs in `pre` (`{levels, rv, rl}`, one entry per
# integer key), so a layer's keys cost one level plus its deltas. Otherwise the
# plain character vector.
.encode_keys <- function(key) {
  n <- length(key)
  pos <- regexpr("(0|[1-9][0-9]{0,14})$", key)
  int <- !is.na(key) & pos > 0L
  if (n < 2L || sum(int) < 0.9 * n) {
    return(key)
  }
  ki <- key[int]
  at_num <- pos[int]
  v <- as.numeric(substring(ki, at_num))
  out <- list(
    delta = c(v[[1]], diff(v)),
    at = which(!int) - 1L,
    v = key[!int]
  )
  pre <- substr(ki, 1L, at_num - 1L)
  if (any(nzchar(pre))) {
    lv <- unique(pre)
    r <- rle(match(pre, lv) - 1L)
    if (length(r$lengths) >= length(pre) / 10) {
      return(key)
    }
    out$pre <- list(levels = lv, rv = r$values, rl = r$lengths)
  }
  out
}

# Per-element meta fields, read from `scene_model(meta = "columns")` (VR-19).
# Each takes one meta column -- a plain vector (`NA` where absent) or a list
# (`NULL` where absent) -- or NULL when no element has the field. Before VR-19
# the meta came as one record per element and was flattened here; vellumplot
# now writes columns and vellum hands them on, so a big plot never builds a
# per-element list.

# Whether a list-column holds only plain (non-factor) atomic values of length
# 0 or 1, so it can be unlisted in one call.
.meta_scalar_list <- function(v) {
  all(lengths(v) <= 1L) &&
    all(vapply(v, is.atomic, logical(1)) | vapply(v, is.null, logical(1))) &&
    !any(vapply(v, is.object, logical(1)))
}

# A list-column as a plain vector of its first values (`NA` where empty), or
# NULL when it holds anything else.
.meta_flatten <- function(v, na) {
  if (!.meta_scalar_list(v)) {
    return(NULL)
  }
  out <- rep(na, length(v))
  set <- lengths(v) == 1L
  out[set] <- unlist(v[set], use.names = FALSE)
  out
}

# One character meta field (`NA` where absent), or NULL when no element carries
# it. `transform` maps present values (e.g. a colour name -> CSS hex) and must
# be vectorised.
.meta_chr <- function(v, transform = as.character) {
  if (is.null(v)) {
    return(NULL)
  }
  if (is.list(v)) {
    flat <- .meta_flatten(v, NA_character_)
    if (is.null(flat)) {
      set <- lengths(v) > 0L
      out <- rep(NA_character_, length(v))
      out[set] <- vapply(
        v[set],
        function(x) as.character(transform(x))[[1L]],
        character(1)
      )
      return(if (any(set)) out else NULL)
    }
    v <- flat
  }
  set <- !is.na(v)
  if (!any(set)) {
    return(NULL)
  }
  out <- rep(NA_character_, length(v))
  out[set] <- as.character(transform(as.character(v[set])))
  out
}

# One numeric meta field (`NA` where absent or empty), or NULL when no element
# carries it.
.meta_num <- function(v) {
  if (is.null(v)) {
    return(NULL)
  }
  if (is.list(v)) {
    flat <- .meta_flatten(v, NA)
    v <- if (is.null(flat)) {
      vapply(
        v,
        function(x) if (length(x)) as.numeric(x)[[1L]] else NA_real_,
        numeric(1)
      )
    } else {
      flat
    }
  }
  v <- as.numeric(v)
  if (all(is.na(v))) NULL else v
}

# A ragged meta field as a list-column of character vectors (`character(0)`
# for none), or NULL when no element carries it.
.meta_ragged <- function(v) {
  if (is.null(v)) {
    return(NULL)
  }
  if (is.list(v)) {
    if (!any(lengths(v) > 0L)) {
      return(NULL)
    }
    flat <- if (all(lengths(v) <= 1L)) .meta_flatten(v, NA_character_)
    if (is.null(flat)) {
      return(lapply(v, function(x) {
        if (is.null(x)) character(0) else as.character(x)
      }))
    }
    v <- flat
  }
  set <- !is.na(v)
  if (!any(set)) {
    return(NULL)
  }
  out <- rep(list(character(0)), length(v))
  out[set] <- as.list(as.character(v[set]))
  out
}

# The interactive colorbar descriptor (continuous colour scales): the gradient
# bar's device-px rectangle plus its value domain/orientation, carried on the
# (unkeyed) bar element's `colorbar` meta by vellumplot. NULL when the scene has no
# continuous colorbar. The runtime overlays a value-range filter on this rect and
# hides marks whose `filter_value` falls outside the dragged range.
.vellumwidget_colorbar <- function(model) {
  el <- model$elements
  cb_col <- if (is.data.frame(el$meta)) el$meta[["colorbar"]]
  if (!is.list(cb_col)) {
    return(NULL)
  }
  for (i in which(lengths(cb_col) > 0L)) {
    cb <- cb_col[[i]]
    rect <- c(el$x0[i], el$y0[i], el$x1[i], el$y1[i])
    if (anyNA(rect) || !all(is.finite(rect))) {
      next
    }
    return(drop_null(list(
      x0 = as.numeric(el$x0[i]),
      y0 = as.numeric(el$y0[i]),
      x1 = as.numeric(el$x1[i]),
      y1 = as.numeric(el$y1[i]),
      lo = as.numeric(cb$lo),
      hi = as.numeric(cb$hi),
      orientation = as.character(cb$orientation),
      reverse = isTRUE(cb$reverse)
    )))
  }
  NULL
}

# The true geometry of every keyed element, for exact client-side hit-testing.
#
# `scene_model()` reports bounding boxes, which are right for a rectangular brush
# and misleading for anything diagonal or thin: a rising line's box is the whole
# rectangle its endpoints span, so a box-distance "what is nearest" matches it
# from anywhere in that rectangle. `vellum::element_geometry()` returns the shape
# the box was standing in for -- vertices in device px, y down, the same space as
# the boxes and the SVG -- once, at build time. The runtime keeps the R-tree over
# boxes to shortlist candidates and then ranks them by true distance.
#
# Deliberately NOT `vl_nearest()`: that asks the engine per query, and a browser
# cannot call R on pointermove. This ships the geometry once instead.
#
# Only the kinds whose shape is not their box are shipped. For a `rect`, `text`
# or `roundrect` the geometry IS the two corners of the bbox, so sending it would
# be duplicating a column the payload already has; for a `point` the bbox's
# centre and half-extent give the disc exactly, which is what the runtime
# reconstructs. That leaves the kinds where the box genuinely lies -- and it
# keeps the block near-free for the dense scatter, the case where payload size
# actually bites (150k keyed points would otherwise add ~2 MB of centres the
# bboxes already imply).
.GEOMETRY_KINDS <- c("segment", "line", "polygon", "path", "hexagon", "sector")

# Wire format, columnar for the same reason `.vellumwidget_elements()` is:
#   key  -- one per geometry element (NOT unique: a key can own several)
#   kind -- one per element, which is what says how to measure to it
#   n    -- vertex count per element; the x/y runs are laid end to end
#   x, y -- sum(n) coordinates, rounded to 0.01 px (far below a pixel, and it
#           roughly halves the JSON)
#   nr   -- rings per element,
#   rl   -- each ring's vertex count, laid end to end, and
#   eo   -- per element, 1 when it is filled under the even-odd rule, else 0
#
# `nr`/`rl` are the ring boundaries of a multi-ring `path` (a polygon with a
# hole, a multipart feature). Without them the concatenated vertices are lossy:
# the runtime has to treat the whole run as ONE closed ring, which invents a
# phantom edge from each ring's last vertex to the next ring's first, and closes
# the last ring back to the very first vertex. Exact for a single-ring path, an
# approximation otherwise.
#
# Both are OMITTED when every element is a single ring, which is the common case
# (a plain sf polygon, every non-path kind) -- so the usual payload does not grow
# at all, and an older runtime, or a payload from an older build, keeps working
# on the one-ring reading.
#
# `eo` is the fill rule the runtime decides containment with, so a point in a
# hole is not a hit (vellum's `pick_table` does the same). It is OMITTED unless
# some element is even-odd: absent means nonzero, the engine's default, and an
# engine older than the `rule` column (vellum < 0.7.2) ships none.
# NULL when the scene has no such elements, or when the vertex count exceeds
# `.GEOMETRY_MAX_VERTICES` -- above that the payload cost outweighs the picking
# accuracy and the runtime falls back to boxes, as it does for an older payload.
.GEOMETRY_MAX_VERTICES <- 500000L

.vellumwidget_geometry <- function(scene) {
  g <- vellum::element_geometry(scene)
  if (is.null(g) || !nrow(g)) {
    return(NULL)
  }
  g <- g[g$kind %in% .GEOMETRY_KINDS, , drop = FALSE]
  if (!nrow(g)) {
    return(NULL)
  }
  if (nrow(g) > .GEOMETRY_MAX_VERTICES) {
    message(
      "scene geometry is ",
      nrow(g),
      " vertices (limit ",
      .GEOMETRY_MAX_VERTICES,
      "); hit-testing falls back to bounding boxes for this widget."
    )
    return(NULL)
  }
  # `element_geometry()` is one row per vertex with `vertex` restarting at 1 for
  # each element, so the starts are exactly where it is 1. A key may own several
  # elements (the same datum drawn as a fill and a stroke; a series' line and its
  # end label) -- they stay separate here and the runtime takes the minimum.
  starts <- which(g$vertex == 1L)
  if (!length(starts)) {
    return(NULL)
  }
  n <- diff(c(starts, nrow(g) + 1L))
  # Ring runs: a new run wherever the element changes or the ring index does.
  # `ring` arrives from vellum (>= 0.7.0); tolerate its absence rather than
  # requiring it, so this stays readable against an older engine.
  ring <- if (is.null(g$ring)) rep(1L, nrow(g)) else as.integer(g$ring)
  el <- rep.int(seq_along(starts), n)
  m <- length(el)
  chg <- c(TRUE, el[-1L] != el[-m] | ring[-1L] != ring[-m])
  rl <- diff(c(which(chg), m + 1L))
  nr <- tabulate(el[chg], nbins = length(starts))
  multi <- any(nr > 1L)
  eo <- if (is.null(g$rule)) {
    logical(length(starts))
  } else {
    g$rule[starts] %in% "evenodd"
  }
  drop_null(list(
    key = as.character(g$key[starts]),
    kind = as.character(g$kind[starts]),
    n = as.integer(n),
    x = round(as.numeric(g$x), 2),
    y = round(as.numeric(g$y), 2),
    nr = if (multi) as.integer(nr),
    rl = if (multi) as.integer(rl),
    eo = if (any(eo)) as.integer(eo)
  ))
}

# The per-panel geometry + scale descriptors the runtime needs to map device
# pixels back to data values (data-space brush + view reporting). Only cartesian
# data panels that carry a `scales` meta (from vellumplot) are emitted; a scene
# with none (raw vellum, or non-cartesian coords) yields NULL and the widget stays
# pixel-only. Each panel carries its resolved device-px rectangle and, per axis, a
# compact scale descriptor (type / transform / data + native domains / time unit)
# --- enough to invert px -> native -> data --- plus the static `breaks` (native
# positions) and their `labels`, which axis-aware zoom re-positions on discrete /
# binned axes and reads to match a date axis's label format. Both stay arrays
# (`I()`) so a one-break axis isn't unboxed to a scalar. `scene_model()$panels` is specified in
# vellum's "The scene contract" vignette.
.vellumwidget_panels <- function(model) {
  p <- model$panels
  if (is.null(p) || !nrow(p) || is.null(p$meta)) {
    return(NULL)
  }
  axis <- function(a) {
    if (is.null(a)) {
      return(NULL)
    }
    drop_null(list(
      type = as.character(a$type),
      transform = as.character(a$transform %||% "identity"),
      data_lo = as.numeric(a$data_lo),
      data_hi = as.numeric(a$data_hi),
      native_lo = as.numeric(a$native_lo),
      native_hi = as.numeric(a$native_hi),
      time_unit = if (is.null(a$time_unit)) NULL else as.character(a$time_unit),
      breaks = if (is.null(a$breaks)) NULL else I(as.numeric(a$breaks)),
      labels = if (is.null(a$labels)) NULL else I(as.character(a$labels)),
      # The aesthetic the axis shows (swapped under coord_flip) and a discrete
      # axis's levels in position order, for interval-selection membership. A
      # list keeps a one-level axis a JSON array.
      aes = if (is.null(a$aesthetic)) NULL else as.character(a$aesthetic),
      levels = if (is.null(a$levels)) NULL else as.list(as.character(a$levels))
    ))
  }
  out <- list()
  for (i in seq_len(nrow(p))) {
    sc <- p$meta[[i]]$scales
    if (is.null(sc) || !isTRUE(sc$cartesian)) {
      next
    }
    # A finite device-px rectangle is required to invert pixels; skip a panel whose
    # viewport geometry wasn't resolved (px* NA) rather than ship a rect the runtime
    # would mis-handle as JSON nulls.
    rect <- c(p$px0[i], p$py0[i], p$px1[i], p$py1[i])
    if (
      anyNA(rect) ||
        !all(is.finite(rect)) ||
        p$px1[i] == p$px0[i] ||
        p$py1[i] == p$py0[i]
    ) {
      next
    }
    cell <- p$meta[[i]]$cell
    out[[length(out) + 1L]] <- drop_null(list(
      name = as.character(p$name[i]),
      # The composition cell the panel belongs to (vellumplot >= 0.14.1.9000),
      # which scopes a bind_scale() to its own cell. Absent for a lone plot.
      cell = if (is.null(cell)) NULL else as.character(cell),
      px0 = as.numeric(p$px0[i]),
      py0 = as.numeric(p$py0[i]),
      px1 = as.numeric(p$px1[i]),
      py1 = as.numeric(p$py1[i]),
      x = axis(sc$x),
      y = axis(sc$y)
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
# bboxes (in the same device-px space) line up with the image. Takes the encoded
# bytes, since `scene_png()` hands them over without touching disk.
.png_dims <- function(bytes) {
  if (length(bytes) < 24L) {
    return(NULL)
  }
  be <- function(v) sum(as.integer(v) * 256^(3:0))
  list(width = be(bytes[17:20]), height = be(bytes[21:24]))
}

# Resolution multiplier for the raster base image. `scene_png(scale=)` multiplies
# dpi while holding physical size, so the image carries this many pixels per
# device pixel -- the retina idiom. A widget is *always* viewed at screen
# resolution, and often on a HiDPI screen, where a 1x base is visibly soft.
#
# Fixed rather than an argument: raster mode is chosen precisely when the SVG
# alternative would be enormous, so the extra bytes are noise against what they
# replace. Measured at 30k keyed points: 446 KB -> 877 KB, versus a 14.7 MB SVG.
# The dense case is *cheaper* at 2x, not dearer -- a saturated canvas compresses
# better (150k points: 51 KB -> 12 KB) -- so the worst case is the middle of the
# range, and it is bounded at roughly double.
.RASTER_SCALE <- 2

# The scene's size in device pixels -- the space the element bboxes, the panel
# rectangles and the SVG's own coordinates all live in.
#
# It cannot be read back off a scaled PNG: the engine rounds the scaled pixel
# dimensions, so halving a 2x image re-rounds and drifts by a pixel on any
# fractional size (a 5.333in page at 97 dpi is 517.3 px, ships as 517 at 1x and
# 1035 at 2x, and 1035/2 rounds to 518). A pixel of disagreement between the
# frame and the bbox space is small but it is a *systematic* offset, so it is
# worth asking rather than inferring. `vl_convert()` answers exactly, without
# rendering anything.
#
# `png` is the fallback for a scene `vl_convert()` cannot measure: at scale 1 it
# is exactly right, and above it, a pixel out is better than nothing.
.scene_dims <- function(scene, png) {
  ask <- function(axis) {
    tryCatch(
      as.numeric(vellum::vl_convert(1, to = "px", scene = scene, axis = axis)),
      error = function(e) NA_real_
    )
  }
  w <- ask("x")
  h <- ask("y")
  if (is.na(w) || is.na(h) || w <= 0 || h <= 0) {
    return(list(
      width = as.integer(round(png$width / .RASTER_SCALE)),
      height = as.integer(round(png$height / .RASTER_SCALE))
    ))
  }
  list(width = as.integer(round(w)), height = as.integer(round(h)))
}

# Render the scene to a PNG and wrap it as a self-contained `<svg><image></svg>`
# shell in the scene's device-px viewBox space, so the client can pan/zoom it via
# the viewBox and hit-test element bboxes against it without any rescaling. The
# scene's title/description (if any) ride along as `<title>`/`<desc>` so the chart
# keeps an accessible name. The image is a base64 data URI (self-contained widget).
.raster_svg <- function(scene) {
  png <- vellum::scene_png(scene, scale = .RASTER_SCALE)
  d <- .png_dims(png)
  if (is.null(d)) {
    stop("could not read the rendered raster dimensions", call. = FALSE)
  }
  # The PNG is `.RASTER_SCALE` times the scene's device pixels; the shell stays in
  # device pixels. That is the whole point: the element bboxes and the panel
  # rectangles are device px, so the viewBox has to be too, and the browser gets
  # more image pixels than CSS pixels to draw into. Dividing here rather than
  # asking the scene keeps the image and the frame from ever disagreeing.
  d <- .scene_dims(scene, d)
  title <- tryCatch(scene@title, error = function(e) NULL)
  desc <- tryCatch(scene@desc, error = function(e) NULL)
  head <- ""
  ids <- character(0)
  if (!is.null(title) && nzchar(title)) {
    head <- paste0(
      head,
      sprintf('<title id="vw-t">%s</title>', .xml_escape(title))
    )
    ids <- c(ids, "vw-t")
  }
  if (!is.null(desc) && nzchar(desc)) {
    head <- paste0(
      head,
      sprintf('<desc id="vw-d">%s</desc>', .xml_escape(desc))
    )
    ids <- c(ids, "vw-d")
  }
  a11y <- if (length(ids)) {
    sprintf(' role="img" aria-labelledby="%s"', paste(ids, collapse = " "))
  } else {
    ""
  }
  uri <- paste0("data:image/png;base64,", base64enc::base64encode(png))
  svg <- sprintf(
    paste0(
      '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d"%s>',
      "%s",
      '<image width="%d" height="%d" preserveAspectRatio="none" href="%s"/></svg>'
    ),
    d$width,
    d$height,
    d$width,
    d$height,
    a11y,
    head,
    d$width,
    d$height,
    uri
  )
  list(svg = svg, width = d$width, height = d$height)
}

# Does the installed vellum have the split render (`layer =` / `panels =` on
# `scene_svg()` and `scene_png()`)? Older vellum (0.9.0) does not, and raster mode
# then falls back to one PNG of the whole scene (`.raster_svg()`).
.split_render_supported <- function() {
  all(c("layer", "panels") %in% names(formals(vellum::scene_svg))) &&
    all(c("layer", "panels") %in% names(formals(vellum::scene_png)))
}

# Does the installed vellum split the furniture by paint order relative to the
# marks (`layer = "unkeyed_below"` / `"unkeyed_above"`)?
.paint_order_supported <- function() {
  .split_render_supported() &&
    all(c("unkeyed_below", "unkeyed_above") %in% eval(formals(vellum::scene_svg)$layer)) &&
    "unkeyed_above" %in% eval(formals(vellum::scene_png)$layer)
}

# An SVG document, or NULL when it draws nothing (only empty groups, defs and
# the title/description), so a plot with nothing above its marks ships no layer.
.svg_drawn_or_null <- function(svg) {
  body <- gsub("<defs>.*?</defs>|<title[^>]*>.*?</title>|<desc[^>]*>.*?</desc>", "", svg, perl = TRUE)
  drawn <- "<(path|text|rect|circle|ellipse|line|polyline|polygon|image|use)[\\s>/]"
  if (grepl(drawn, body, perl = TRUE)) svg else NULL
}

# Does the installed vellum have the marks-only display list (VR-14)?
.display_list_supported <- function() {
  is.function(tryCatch(
    getExportedValue("vellum", "scene_display_list"),
    error = function(e) NULL
  ))
}

# Does it list gradients, path clips and opacity groups exactly (display list
# version 2, VW-23)? Older vellum has no `version` argument.
.display_list_v2_supported <- function() {
  .display_list_supported() &&
    "version" %in% names(formals(getExportedValue("vellum", "scene_display_list")))
}

# Does the installed vellum render the display list's flagged marks as their
# own layer, run by run (`layer = "keyed_flagged"`, `run =`, VW-30)?
.flagged_layer_supported <- function() {
  "keyed_flagged" %in% eval(formals(vellum::scene_png)$layer) &&
    "run" %in% names(formals(vellum::scene_png))
}

# More runs than this (flagged marks interleaved with exact ones many times)
# keep today's behaviour: every mark stays on the PNG.
.MAX_FLAGGED_RUNS <- 8L

# The runs' SVGs (VW-33) ship only up to this many characters in all: past
# it, the flagged marks keep their own look under interactive state.
.MAX_FLAGGED_SVG_CHARS <- 4e6

# The flagged keyed marks for the mixed tier (VW-30): when the display list
# flags some marks (masks, blend modes, effects, hatches, patterns, repeating
# gradients, gradient strokes, text) and numbers them into runs, one PNG of
# each run at `.RASTER_SCALE`, in the mark layer's frame. The runtime draws
# the exact marks itself and composites each run where it falls in paint
# order. NULL with no flagged mark, an older vellum, a list without runs, or
# more than `.MAX_FLAGGED_RUNS` runs.
#
# Each run also ships as SVG (`svg`, VW-33): the same layer as vector nodes
# carrying their `data-key`s. A run's PNG bakes its marks' look in; the
# runtime applies a condition(), a filter, dimming or a legend hide/mute to
# the run's SVG instead and draws that, so the state reaches the flagged
# marks in every raster tier and in exports. Past `.MAX_FLAGGED_SVG_CHARS`
# the SVGs are dropped, with a message.
.raster_flagged <- function(scene, panels, dl, marks, text = "native") {
  if (is.null(dl) || is.null(marks) || !.flagged_layer_supported()) {
    return(NULL)
  }
  runs <- dl$runs
  if (
    is.null(runs) ||
      is.null(dl$record$run) ||
      runs < 1L ||
      runs > .MAX_FLAGGED_RUNS
  ) {
    return(NULL)
  }
  # A mark under a blend mode (flag 32) mixes with what is beneath it. Its
  # run, rendered on its own, is its marks unblended, so the runtime can
  # composite it only with the run's blend mode: with a vellum that reports
  # it (`run_blend`, VW-32) and a mode it knows. Otherwise keep the PNG path.
  if (!.run_blend_ok(dl, runs)) {
    return(NULL)
  }
  hrefs <- vapply(
    seq_len(runs),
    function(k) {
      png <- vellum::scene_png(
        scene,
        scale = .RASTER_SCALE,
        layer = "keyed_flagged",
        panels = panels,
        run = k
      )
      paste0("data:image/png;base64,", base64enc::base64encode(png))
    },
    character(1)
  )
  svgs <- vapply(
    seq_len(runs),
    function(k) {
      vellum::scene_svg(
        scene,
        text = text,
        layer = "keyed_flagged",
        panels = panels,
        run = k
      )
    },
    character(1)
  )
  if (sum(nchar(svgs, type = "bytes")) > .MAX_FLAGGED_SVG_CHARS) {
    cli::cli_inform(c(
      "i" = "The marks this widget draws from images (masked, patterned or blended marks, text) are too many to restyle in the browser.",
      "*" = "Conditions, filters, dimming and legend hide/mute will not change how they look; the other marks follow them as usual."
    ))
    svgs <- NULL
  }
  list(
    runs = I(hrefs),
    svg = if (is.null(svgs)) NULL else I(svgs),
    width = marks$width,
    height = marks$height
  )
}

# The CSS blend modes the runtime composites a run with (VW-32).
.BLEND_MODES <- c(
  "multiply", "screen", "overlay", "darken", "lighten", "color-dodge",
  "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue",
  "saturation", "color", "luminosity"
)

# Can every run be composited from its own raster? Without a blended mark,
# always. With one, only when the list says per run how (`run_blend`, VW-32)
# and every mode is "normal" or one the runtime knows.
.run_blend_ok <- function(dl, runs) {
  rb <- dl$run_blend
  if (!is.null(rb) && (length(rb) != runs || !all(rb %in% c("normal", .BLEND_MODES)))) {
    return(FALSE)
  }
  blended <- any(bitwAnd(as.integer(.dl_col(dl$record$flags)), 32L) > 0L)
  !blended || !is.null(rb)
}

# The marks-only display list for raster mode (VW-15): each keyed mark of the
# data panels with its exact device-px geometry, paint and key, as vellum's
# private columnar payload. The runtime draws the zoomed-in tier from it and
# derives the hit-test bboxes, so the covered marks ship no bbox. NULL with an
# older vellum, or above `max_marks` (with a message: the list would be big,
# and a plot that size reads better as density).
.raster_display_list <- function(scene, model, panels, max_marks) {
  if (!.display_list_supported()) {
    return(NULL)
  }
  el <- model$elements
  keyed <- !is.na(el$key)
  if (!is.null(panels) && !is.null(el$panel)) {
    keyed <- keyed & el$panel %in% panels
  }
  n <- sum(keyed)
  if (!n) {
    return(NULL)
  }
  if (n > max_marks) {
    cli::cli_inform(c(
      "i" = "This plot has {n} marks, more than {.code max_marks} ({max_marks}): the widget ships a bounding-box index instead of the exact marks, so zoomed-in marks are drawn as plain dots.",
      "*" = "A plot this big reads better as density: try {.fn vellumplot::mark_datashade} or {.fn vellumplot::mark_hex}.",
      "*" = "Or raise the cap with {.code render_options(max_marks = )}."
    ))
    return(NULL)
  }
  if (.display_list_v2_supported()) {
    return(vellum::scene_display_list(scene, what = "keyed", panels = panels, version = 2L))
  }
  vellum::scene_display_list(scene, what = "keyed", panels = panels)
}

# One display-list column (`list(type, n, data | const | seq | rle)`) as an R
# vector; the runtime's `dlColumn()` is the same in JS.
.dl_col <- function(col) {
  n <- col$n
  if (!n) {
    return(numeric(0))
  }
  if (!is.null(col$const)) {
    return(rep(col$const, n))
  }
  if (!is.null(col$seq)) {
    return(col$seq[[1]] + col$seq[[2]] * (seq_len(n) - 1))
  }
  if (!is.null(col$rle)) {
    return(rep(col$rle$values, col$rle$lengths))
  }
  raw <- base64enc::base64decode(col$data)
  switch(
    col$type,
    f32 = readBin(raw, "double", n, size = 4, endian = "little"),
    u8 = as.integer(raw),
    u16 = readBin(raw, "integer", n, size = 2, signed = FALSE, endian = "little"),
    u32 = {
      v <- readBin(raw, "integer", n, size = 4, endian = "little")
      as.numeric(v) + ifelse(v < 0, 2^32, 0)
    }
  )
}

# The keys whose every display-list record is drawn exactly (no flag, or only
# pick-only, 16: it paints nothing): the runtime derives their bboxes from the
# list, so they ship none.
.dl_exact_keys <- function(dl) {
  keys <- if (is.list(dl$keys)) {
    as.character(.dl_col(dl$keys))
  } else {
    as.character(dl$keys)
  }
  k <- keys[.dl_col(dl$record$key) + 1L]
  flagged <- .dl_col(dl$record$flags) %% 16 != 0
  setdiff(unique(k[!flagged]), unique(k[flagged]))
}

# Blank the bboxes of the marks the display list covers exactly (the runtime
# fills them back in from the list). With most marks covered the bbox columns
# then go sparse in `.encode_elements()`.
.drop_listed_bboxes <- function(cols, dl) {
  if (is.null(dl) || !length(cols$key)) {
    return(cols)
  }
  hit <- cols$key %in% .dl_exact_keys(dl)
  for (f in c("x0", "y0", "x1", "y1")) {
    if (!is.null(cols[[f]])) cols[[f]][hit] <- NA_real_
  }
  cols
}

# The panels whose keyed marks go into the mark layer: every panel that holds a
# keyed mark, except the legend (its interactive swatches stay in the furniture
# as real nodes). NULL -- every keyed mark -- when the scene names no panels (a
# raw vellum scene) or a keyed mark sits outside every panel; the runtime then
# lays the mark layer over the whole scene instead of into the pan groups.
.scene_panel_names <- function(model) {
  el <- model$elements
  if (is.null(el) || is.null(el$panel)) {
    return(NULL)
  }
  pn <- as.character(el$panel[!is.na(el$key)])
  if (!length(pn) || anyNA(pn)) {
    return(NULL)
  }
  nm <- setdiff(unique(pn), "legend")
  if (length(nm)) nm else NULL
}

# The split render's mark layer: the keyed marks alone, on a transparent page at
# `.RASTER_SCALE`, as a data URI plus the scene's device-px size (the frame the
# runtime places it in, like `.raster_svg()`).
.raster_marks <- function(scene, panels) {
  png <- vellum::scene_png(
    scene,
    scale = .RASTER_SCALE,
    layer = "keyed",
    panels = panels
  )
  d <- .png_dims(png)
  if (is.null(d)) {
    stop("could not read the rendered raster dimensions", call. = FALSE)
  }
  d <- .scene_dims(scene, d)
  list(
    href = paste0("data:image/png;base64,", base64enc::base64encode(png)),
    width = d$width,
    height = d$height,
    panels = if (is.null(panels)) NULL else I(panels)
  )
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
#'     bounds `x0d,y0d,x1d,y1d` and the `panel` name. When the plot declares a
#'     `vellumplot::select_interval()`, it also carries `selection` (the
#'     selection's name) and `interval` (per encoding, the brushed data range
#'     `c(lo, hi)`, or the brushed levels on a discrete axis), and clearing the
#'     brush sets it to `NULL`. An event input.}
#'   \item{`input$plot_colorfilter`}{A length-2 numeric `c(lo, hi)` — the value
#'     range selected on a continuous colorbar (see the interactive colorbar
#'     filter); `NULL` when the full range is shown. State input.}
#'   \item{`input$plot_zoom`}{A list `list(x=, y=, w=, h=, zoomed=)` — the current
#'     view (the SVG `viewBox` in device-pixel coordinates) plus a `zoomed` flag
#'     (is the view narrower/shorter than the full extent). A cartesian plot
#'     also carries `panels`, a list keyed by panel id (`"panel-1-1"`, ...) with
#'     each panel's visible range in **data** coordinates,
#'     `list(x=c(lo,hi), y=c(lo,hi), panel=)`, or `NULL` for a panel scrolled out
#'     of view. Facets zoom per panel, so read `panels` for a faceted plot. A
#'     single-panel plot keeps the older `data` field, the same range as its one
#'     `panels` entry. A composition names its panels per cell
#'     (`"cell-1-panel-1-1"`, `"cell-2-panel-1-1"`, ...). When a
#'     `vellumplot::bind_scale()` zooms a panel to an interval selection, the
#'     panel's entry is its bound range and `bound` maps each bound panel id to
#'     the selection driving it. With binds in a composition each cell zooms
#'     on its own (a wheel or pan moves only the cell under the pointer, and a
#'     bound axis follows its selection), so `x`..`h` are the last-zoomed
#'     cell's view and `zoomed` is `TRUE` while any cell is zoomed in. Binds
#'     are enacted in SVG mode, and in raster mode with a vellum that has the
#'     split render (`render_options(mode = "raster")`, or `"auto"` above the
#'     threshold); with an older vellum a raster render ignores them. Updates as state when a zoom/pan
#'     settles (wheel, drag-pan release, pinch, keyboard, reset, zoom-to-selection,
#'     a proxy [vw_zoom()], or a brush that moves a bound panel).}
#' }
#'
#' Data-space coordinates (`x0d`/…, `zoom$data` and `zoom$panels`) come from the per-panel scale
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
  htmlwidgets::shinyWidgetOutput(
    outputId,
    "vellumwidget",
    width,
    height,
    package = "vellumwidget"
  )
}

#' @rdname vellumwidget-shiny
#' @export
renderVellumwidget <- function(expr, env = parent.frame(), quoted = FALSE) {
  if (!quoted) {
    expr <- substitute(expr)
  }
  htmlwidgets::shinyRenderWidget(expr, vellumwidgetOutput, env, quoted = TRUE)
}
