# Option helpers for as_widget(). Each groups a family of related settings into
# one validated object, so as_widget() takes `tooltip = tooltip_options(...)`
# rather than four flat `tooltip_*` arguments. The objects are plain lists with
# a class; as_widget() reads their fields when it builds the payload.

#' Option helpers for `as_widget()`
#'
#' These helpers group related [as_widget()] settings into one argument each:
#'
#' * `tooltip_options()` for the hover tooltip (`as_widget(tooltip = )`);
#' * `export_options()` for the toolbar's SVG/PNG download (`as_widget(export = )`);
#' * `navigator_options()` for the overview range navigator
#'   (`as_widget(navigator = )`);
#' * `render_options()` for how the marks are drawn (`as_widget(render = )`).
#'
#' Each validates its arguments and returns an object that `as_widget()` reads.
#' Calling a helper with no arguments gives the defaults.
#'
#' @param delay Milliseconds to wait before the tooltip appears on hover
#'   (default `0`, i.e. immediate). The highlight is unaffected --- only the
#'   tooltip waits. A short delay (e.g. `250`) calms a dense scatter.
#' @param follow When `TRUE` (default) the tooltip tracks the cursor; when
#'   `FALSE` it anchors above the hovered mark's centre.
#' @param sticky When `TRUE`, the tooltip accepts pointer events and lingers
#'   briefly when you leave the mark, so you can move into it --- for tooltips
#'   that contain links or buttons (build the HTML via `tooltip =` in the plot).
#'   Default `FALSE`.
#' @param style Optional named list styling the tooltip box: `background` /
#'   `color` (any R or CSS colour), `fontsize`, and `max_width` (any CSS length;
#'   a bare number is used as is). `NULL` (default) uses the built-in style.
#'   Tooltip text is rendered as safe HTML --- an author-built `tooltip =` (e.g.
#'   via `glue()`) may use `<b>`/`<i>`/`<br>` for bold/italic/line breaks; data
#'   values are escaped and only those inert tags are honoured (no
#'   scripts/attributes).
#' @return An object of class `vellumwidget_tooltip_options`,
#'   `vellumwidget_export_options`, `vellumwidget_navigator_options` or
#'   `vellumwidget_render_options`, to pass to the matching [as_widget()]
#'   argument.
#' @examples
#' tooltip_options(delay = 250, style = list(background = "#1d3557"))
#' export_options(filename = "mtcars", scale = 2)
#' navigator_options(height = 80)
#' render_options(mode = "raster")
#'
#' \dontrun{
#' library(vellumplot)
#' vplot(mtcars) |>
#'   mark_point(x = wt, y = mpg, tooltip = rownames(mtcars)) |>
#'   as_widget(
#'     tooltip = tooltip_options(delay = 250, follow = FALSE),
#'     export = export_options(filename = "mtcars", scale = 2)
#'   )
#' }
#' @name widget-options
NULL

#' @rdname widget-options
#' @export
tooltip_options <- function(
  delay = 0,
  follow = TRUE,
  sticky = FALSE,
  style = NULL
) {
  structure(
    list(
      delay = .check_number(delay, "delay", min = 0, allow_null = TRUE) %||% 0,
      follow = .check_bool(follow, "follow"),
      sticky = .check_bool(sticky, "sticky"),
      style = .check_tooltip_style(style, "style")
    ),
    class = "vellumwidget_tooltip_options"
  )
}

#' @rdname widget-options
#' @param filename The download filename base, without extension (default
#'   `"plot"`).
#' @param scale The PNG resolution multiplier (default `1`). Exports capture the
#'   current (zoomed/panned) view.
#' @export
export_options <- function(filename = "plot", scale = 1) {
  structure(
    list(
      filename = .check_string(filename, "filename", allow_empty = FALSE),
      scale = .check_number(scale, "scale", min = 0, min_inclusive = FALSE)
    ),
    class = "vellumwidget_export_options"
  )
}

#' @rdname widget-options
#' @param height Height of the navigator strip in pixels (default `56`).
#'   Passing `navigator_options()` to `as_widget(navigator = )` turns the
#'   navigator on; `navigator = TRUE` is the same as
#'   `navigator = navigator_options()`.
#' @export
navigator_options <- function(height = 56) {
  structure(
    list(
      height = .check_number(height, "height", min = 0, min_inclusive = FALSE)
    ),
    class = "vellumwidget_navigator_options"
  )
}

#' @rdname widget-options
#' @param mode Rendering strategy for the marks. `"auto"` (default) ships a
#'   per-element SVG for small/moderate plots and switches to a single embedded
#'   raster image above `raster_threshold` keyed elements; `"svg"` always uses
#'   the per-element SVG; `"raster"` always uses the image. In raster mode the
#'   marks are drawn once as a base image and all interaction (hover, click,
#'   brush, pan/zoom) is driven client-side from the element index (geometry +
#'   boxes + keys), so a very large scatter (100k+ points) stays navigable with a
#'   tiny DOM and a small payload. With a vellum that has the split render
#'   (`layer =` on [vellum::scene_svg()]), only the keyed marks are an image: the
#'   axes, gridlines, legend and text stay SVG, so axis-aware zoom re-ticks the
#'   real axes, and the navigator and `vellumplot::bind_scale()` work as in SVG
#'   mode. With a vellum that also splits the furniture by paint order, what was
#'   drawn after the marks (a reference line or annotation added after the
#'   points) stays on top of them. An older vellum draws the whole scene as one
#'   image, and zoom then
#'   magnifies it. The trade-offs of raster mode: there are no per-element DOM
#'   nodes until the detail tier (see `detail_marks`), so hover and selection
#'   show as rings and per-mark screen-reader focus is off. Zoomed in, the
#'   marks are redrawn exactly from vellum's marks-only display list (see
#'   `max_marks`), or as plain dots with an older vellum. With the display
#'   list, `vellumplot::condition()` colours and dimming, `vellumplot::filter_by()`,
#'   cross-filters and legend hide/mute show at every zoom: the marks are then
#'   drawn on a canvas from the list. With a current vellum this includes
#'   gradient fills, clip paths and grouped (opacity) marks, which the list
#'   draws itself, and the marks it flags (masks, effects, hatches, patterns,
#'   text, gradient strokes), which are restyled from their own SVG. If that
#'   SVG would exceed 4 MB, the flagged marks keep their own look under these
#'   states while the other marks follow them. If the flagged marks are
#'   interleaved with the rest more than 8 times, or use a blend mode the
#'   browser can't composite on its own, all the marks stay one image: these
#'   states show on none of them, at any zoom, and there is no detail tier
#'   (the widget says so with a message). The same holds without the list (an
#'   older vellum, or more marks than `max_marks`).
#' @param raster_threshold Keyed-element count above which `mode = "auto"`
#'   switches to the raster image (default `20000`).
#' @param max_marks In raster mode with a vellum that has the marks-only display
#'   list, the most marks whose exact geometry and paint ship with the widget
#'   (default `2000000`). Zoomed-in marks are then redrawn exactly, with their
#'   own shape, colour, stroke and alpha. With `precision = "compact"` a
#'   scatter's widget takes about 5.4 MB per million points (1 million:
#'   5.4 MB, 2 million: 10.7 MB, keys included) and about 10 to 15 s per
#'   million to build. Above it, the widget ships only a bounding-box index, about as big
#'   (5.6 MB per million), draws zoomed-in marks as plain dots
#'   (each in its own mark's colour), and says so with a message: a plot that big is better drawn as density,
#'   with `vellumplot::mark_datashade()` or `vellumplot::mark_hex()`.
#' @param detail_marks In raster mode with the display list, once a zoom
#'   settles with fewer than this many marks in view (default `3000`), the
#'   visible marks become real SVG nodes (the detail tier): hover, selection,
#'   `condition()` and `filter_by()` styling and keyboard focus then work on
#'   them as in SVG mode. Zooming back out past 1.5 times this many returns to
#'   the canvas. `0` turns the detail tier off.
#' @param webgl In raster mode with the display list, how the zoomed-in (and
#'   restyled) marks are drawn. `"auto"` (default) draws a list of 50,000 marks
#'   or more with WebGL2 where the browser has it: a million points redraw in
#'   one or two frames (about 10 to 30 ms), so pan, zoom and `condition()`, selection and filter
#'   styling stay live, where the 2D canvas redraws in about a second and waits
#'   for the view to settle. `"always"` uses WebGL2 for any size of list,
#'   `"never"` keeps the 2D canvas. WebGL2 draws points, rectangles, lines and
#'   polygons with solid fills and strokes (lines join with a miter, which at
#'   sharp turns of thick lines differs a little from a round join); a list
#'   holding gradients, dashed strokes, grouped marks or very large paths is
#'   drawn on the canvas, as it is without WebGL2 or when the browser drops the
#'   context.
#' @param precision How the display list ships its marks' coordinates (see
#'   `max_marks`). `"compact"` (default), with a vellum that supports it,
#'   quantises each coordinate column within its range so that no coordinate
#'   is off by more than 0.005 px, the precision of the SVG vellum writes
#'   (SVG mode, and raster mode's axes and gridlines): 16 bits per value for a
#'   plot up to 655 px across, 24 above, instead of a 32-bit float. That
#'   halves the coordinates in the payload (a 200k-point scatter's whole
#'   widget: 2.2 to 1.1 MB) and keeps the error under half a pixel up to 100x
#'   zoom. `"f32"`
#'   ships 32-bit floats, as an older vellum always does.
#' @param max_zoom The most the view zooms in, per axis, over the full view
#'   (default `100`), in SVG and raster mode alike: the wheel, pinch, keys,
#'   box zoom and zoom-to-selection, [vw_zoom()], linked views (`group =`) and
#'   `vellumplot::bind_scale()` all stop there. At 100x the 0.01 px grid vellum
#'   writes SVG coordinates on (and the 0.005 px error of `precision =
#'   "compact"`) is still within half a screen pixel, so the marks stay on
#'   their gridlines; past it they drift (a few pixels at 1000x) and show only
#'   the rounding. A number from 1 (no zoom in) to `10000`: past about 16,000x
#'   a 32-bit float can no longer place a mark at all.
#' @param text How text is written into the SVG, passed to [vellum::scene_svg()]:
#'   `"native"` (default) emits selectable `<text>` referencing system fonts ---
#'   smaller when the page has the font, post-processable, and better for
#'   accessibility and LLMs; `"outline"` emits glyph outlines that are
#'   pixel-faithful and font-independent but not selectable. Applies to the
#'   SVG, including raster mode's SVG furniture under the split render; with an
#'   older vellum, raster mode bakes text into the base image and this argument
#'   is ignored (with a warning if set explicitly).
#' @param autoplay,loop For an animation (from `vellumplot::animate()`):
#'   whether it starts playing as soon as it is shown (default `TRUE`; `FALSE`
#'   starts paused on the first frame, for the reader to press play), and
#'   whether it loops (default `TRUE`; `FALSE` plays once and stops on the last
#'   frame, and pressing play there starts it over). A reader whose system asks
#'   for reduced motion always gets it paused. They need JavaScript: the
#'   animated SVG on its own always plays and loops. Ignored for a static plot.
#' @export
render_options <- function(
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
) {
  text_set <- !missing(text)
  structure(
    list(
      mode = .check_choice(mode, c("auto", "svg", "raster"), "mode"),
      raster_threshold = .check_number(
        raster_threshold,
        "raster_threshold",
        min = 0
      ),
      text = .check_choice(text, c("native", "outline"), "text"),
      max_marks = .check_number(max_marks, "max_marks", min = 0),
      detail_marks = .check_number(detail_marks, "detail_marks", min = 0),
      webgl = .check_choice(webgl, c("auto", "always", "never"), "webgl"),
      precision = .check_choice(precision, c("compact", "f32"), "precision"),
      max_zoom = .check_max_zoom(max_zoom),
      autoplay = .check_bool(autoplay, "autoplay"),
      loop = .check_bool(loop, "loop"),
      text_set = text_set
    ),
    class = "vellumwidget_render_options"
  )
}

#' @export
print.vellumwidget_tooltip_options <- function(x, ...) {
  .print_options(x, "tooltip_options")
}

#' @export
print.vellumwidget_export_options <- function(x, ...) {
  .print_options(x, "export_options")
}

#' @export
print.vellumwidget_navigator_options <- function(x, ...) {
  .print_options(x, "navigator_options")
}

#' @export
print.vellumwidget_render_options <- function(x, ...) {
  .print_options(x, "render_options")
}

.print_options <- function(x, what) {
  fields <- unclass(x)
  fields$text_set <- NULL
  cat("<", what, ">\n", sep = "")
  for (nm in names(fields)) {
    v <- fields[[nm]]
    shown <- if (is.null(v)) {
      "NULL"
    } else if (is.list(v)) {
      paste0(
        "list(",
        paste(names(v), vapply(v, format, ""), sep = " = ", collapse = ", "),
        ")"
      )
    } else {
      format(v)
    }
    cat("  ", nm, ": ", shown, "\n", sep = "")
  }
  invisible(x)
}

# `render_options(max_zoom =)` (VW-44): a finite number in [1, 10000]. The
# upper bound keeps the view inside what a 32-bit float (the canvas, the
# display list) can resolve: past ~16,000x a scene px is below its precision.
.MAX_ZOOM_LIMIT <- 10000

.check_max_zoom <- function(x, call = parent.frame()) {
  x <- .check_number(x, "max_zoom", min = 1, call = call)
  if (x > .MAX_ZOOM_LIMIT) {
    cli::cli_abort(
      c(
        "{.arg max_zoom} must be at most {(.MAX_ZOOM_LIMIT)}, not {x}.",
        i = "Past about 16,000x a 32-bit float can no longer place a mark."
      ),
      call = call
    )
  }
  x
}

# Check that `x` is an options object of `class` (from helper `helper`), or
# `NULL` for the defaults. Returns the object, with `NULL` filled in.
.check_options <- function(x, arg, class, helper, call = parent.frame()) {
  if (is.null(x)) {
    return(match.fun(helper)())
  }
  if (!inherits(x, class)) {
    cli::cli_abort(
      c(
        "{.arg {arg}} must be built with {.fn {helper}}, not {.obj_type_friendly {x}}.",
        i = "For example {.code {arg} = {helper}()}."
      ),
      call = call
    )
  }
  x
}

# --- deprecated flat arguments ----------------------------------------------

# The old flat as_widget() arguments, each mapped to its option helper and the
# helper's argument. They still work through `...`, with a once-per-session
# deprecation warning.
.deprecated_args <- list(
  tooltip_delay = c("tooltip", "tooltip_options", "delay"),
  tooltip_follow = c("tooltip", "tooltip_options", "follow"),
  tooltip_sticky = c("tooltip", "tooltip_options", "sticky"),
  tooltip_style = c("tooltip", "tooltip_options", "style"),
  export_filename = c("export", "export_options", "filename"),
  export_scale = c("export", "export_options", "scale"),
  navigator_height = c("navigator", "navigator_options", "height"),
  mode = c("render", "render_options", "mode"),
  raster_threshold = c("render", "render_options", "raster_threshold"),
  text = c("render", "render_options", "text")
)

# Which deprecated arguments have warned this session.
.deprecation_env <- new.env(parent = emptyenv())

# Warn that the as_widget() arguments `olds` are deprecated in favour of their
# option helpers, lifecycle-style: once per session per argument, in a single
# warning per call. The `lifecycle_verbosity` option is honoured ("quiet" never
# warns, "warning" always does) so tests and users can control it as for
# lifecycle itself.
.warn_deprecated_args <- function(olds) {
  verbosity <- getOption("lifecycle_verbosity", "default")
  if (identical(verbosity, "quiet")) {
    return(invisible())
  }
  always <- identical(verbosity, "warning")
  if (!always) {
    olds <- olds[!vapply(olds, function(o) isTRUE(.deprecation_env[[o]]), TRUE)]
  }
  if (!length(olds)) {
    return(invisible())
  }
  for (o in olds) {
    .deprecation_env[[o]] <- TRUE
  }
  use <- vapply(
    olds,
    function(o) {
      m <- .deprecated_args[[o]]
      cli::format_inline(
        "{.arg {o}}: use {.code {m[[1]]} = {m[[2]]}({m[[3]]} = )}"
      )
    },
    ""
  )
  names(use) <- rep("i", length(use))
  cli::cli_warn(
    c(
      "{cli::qty(length(olds))}The {.arg {olds}} argument{?s} of {.fn as_widget} {?is/are} deprecated as of vellumwidget 0.11.0.",
      use,
      if (!always) c(" " = "This warning is displayed once per session.")
    ),
    class = c("lifecycle_warning_deprecated", "vellumwidget_deprecated_arg")
  )
}

# Fold the deprecated flat arguments in `dots` into the option objects. Returns
# a list with `tooltip`, `export`, `navigator` and `render` (each `NULL` when
# no deprecated argument touched it, so the caller keeps its own value).
# `supplied` names the option arguments the caller passed explicitly; mixing an
# explicit option object with its old flat arguments is an error.
.fold_deprecated <- function(dots, supplied, call = parent.frame()) {
  out <- list()
  if (!length(dots)) {
    return(out)
  }
  nms <- names(dots)
  if (is.null(nms) || !all(nzchar(nms))) {
    cli::cli_abort(
      "Extra arguments to {.fn as_widget} must be named.",
      call = call
    )
  }
  unknown <- setdiff(nms, names(.deprecated_args))
  if (length(unknown)) {
    cli::cli_abort(
      "{.fn as_widget} has no argument{?s} {.arg {unknown}}.",
      call = call
    )
  }
  .warn_deprecated_args(nms)
  targets <- unique(vapply(.deprecated_args[nms], `[[`, "", 1L))
  for (target in targets) {
    olds <- nms[vapply(.deprecated_args[nms], `[[`, "", 1L) == target]
    helper <- .deprecated_args[[olds[[1]]]][[2]]
    if (target %in% supplied) {
      cli::cli_abort(
        c(
          "Supply {.arg {target}} or the deprecated {.arg {olds}}, not both.",
          i = "Move {.arg {olds}} into {.code {target} = {helper}()}."
        ),
        call = call
      )
    }
    args <- dots[olds]
    names(args) <- vapply(.deprecated_args[olds], `[[`, "", 3L)
    # NULL meant "default" for every old flat argument; drop those so the
    # helper's own default applies.
    args <- args[!vapply(args, is.null, logical(1))]
    out[[target]] <- do.call(helper, args)
  }
  out
}
