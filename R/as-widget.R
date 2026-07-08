#' Turn a vellum scene (or quill plot) into an interactive widget
#'
#' `as_widget()` is the terminal verb of the interactivity pipeline: it compiles
#' its input to a `vellum` scene, emits the SVG (with per-element `data-key`s) and
#' the [`vellum::scene_model()`] element table, and bundles them with the `gloss`
#' JavaScript runtime into a self-contained [htmlwidgets::createWidget()] widget.
#' The result does hover tooltips, hover highlighting, and click selection
#' entirely client-side --- no Shiny, no server round-trip. Pan/zoom, brush, and
#' selection work with mouse, touch (drag to pan, two-finger pinch to zoom), and
#' keyboard input: the arrows pan and `+`/`-`/`0` zoom and reset, except that with
#' accessibility on (the default) the arrows move between marks while one is
#' focused --- see the `a11y` argument.
#'
#' Interactivity is driven by the keys/metadata a plot declares. In `quill` these
#' come from the reserved `data_id` / `tooltip` / `hover_group` mark arguments; a
#' plot that declares none renders as a static (but still embeddable) SVG. A
#' hovered element with a `data_id` but no `tooltip` shows its key.
#'
#' The scene metadata `gloss` reads --- the [`vellum::scene_model()`] element
#' table and the SVG `data-key` / `data-vellum-*` attributes --- is specified in
#' vellum's "The scene contract" vignette
#' (`vignette("scene-contract", package = "vellum")`).
#'
#' @param x A `quill` plot (a `PlotSpec` / `PlotComposition`) or a `vellum`
#'   scene --- anything [vellum::as_vellum_scene()] accepts.
#' @param width,height Widget size (any valid CSS size, or `NULL` to size from the
#'   scene). Passed to [htmlwidgets::createWidget()].
#' @param tooltip,hover,select Toggles for the three hover/click interactions
#'   (all `TRUE`).
#' @param brush,zoom,toolbar Toggles for rectangular brush-select, wheel/drag
#'   pan-zoom (via the SVG `viewBox`), and the on-hover toolbar (all `TRUE`).
#' @param nearest When `TRUE` (default), hover snaps to the nearest mark within a
#'   small radius when the cursor is not directly over one (helps sparse points).
#' @param a11y Accessibility (default `TRUE`). Makes the widget a keyboard- and
#'   screen-reader-navigable chart: the SVG is labelled as an interactive chart
#'   (`role="graphics-document"`), each mark is a focusable `graphics-symbol` with
#'   a roving tabindex (arrow keys move between marks, Enter/Space select, Escape
#'   exits), a polite `aria-live` region announces the focused/selected mark, and
#'   a visually-hidden data table lists every mark for assistive tech. `FALSE`
#'   restores the previous behaviour (no chart semantics, marks not focusable).
#' @param alt Accessible label (alt text) for the chart as a whole. Defaults to
#'   the scene's own title/description — which `quill` sets automatically from the
#'   plot title and [quill::plot_alt()] — so an explicit value is only needed for
#'   a raw `vellum` scene or to override.
#' @param hover_color,selected_color Outline colours for hovered / selected
#'   elements (any R or CSS colour), applied widget-wide. `hover_color = NULL`
#'   (default) keeps the plain dim-others hover; `selected_color = NULL` uses the
#'   built-in default. A per-mark `hover_color`/`selected_color` declared in
#'   `quill` overrides these for that mark.
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
#' @param elementId Optional explicit widget DOM id.
#' @return An htmlwidget of class `"gloss"`.
#' @examples
#' \dontrun{
#' library(quill)
#' df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, model = rownames(mtcars))
#' vplot(df) |>
#'   mark_point(x = wt, y = mpg, tooltip = model, data_id = model) |>
#'   as_widget()
#' }
#' @export
as_widget <- function(x, width = NULL, height = NULL,
                      tooltip = TRUE, hover = TRUE, select = TRUE,
                      brush = TRUE, zoom = TRUE, toolbar = TRUE, nearest = TRUE,
                      a11y = TRUE, alt = NULL,
                      hover_color = NULL, selected_color = NULL, dim_opacity = NULL,
                      tooltip_style = NULL,
                      export_filename = NULL, export_scale = NULL,
                      group = NULL, crosstalk = NULL,
                      select_mode = c("multiple", "single"),
                      elementId = NULL) {
  select_mode <- match.arg(select_mode)
  scene <- vellum::as_vellum_scene(x)
  svg <- vellum::scene_svg(scene)
  model <- vellum::scene_model(scene)
  dims <- .svg_dims(svg)
  ct_group <- .crosstalk_group(crosstalk)

  payload <- list(
    svg = svg,
    elements = .gloss_elements(model),
    options = list(
      tooltip = isTRUE(tooltip),
      hover = isTRUE(hover),
      select = isTRUE(select),
      brush = isTRUE(brush),
      zoom = isTRUE(zoom),
      toolbar = isTRUE(toolbar),
      nearest = isTRUE(nearest),
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
    name = "gloss",
    x = payload,
    width = width %||% dims$width,
    height = height %||% dims$height,
    package = "gloss",
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

# The keyed elements the JS runtime needs: one record per drawn, keyed element,
# carrying its tooltip / hover-group and its device-px bounding box (in the SVG's
# viewBox coordinate space, so brush/nearest hit-testing needs no rescaling).
# Elements without a key (panel background, gridlines, legend glyphs) are dropped
# -- they are not interactive. Not deduplicated: `scene_model()` already yields one
# row per datum, and the brush needs every element's geometry.
.gloss_elements <- function(model) {
  el <- model$elements
  if (is.null(el) || !nrow(el)) {
    return(list())
  }
  keep <- !is.na(el$key)
  if (!any(keep)) {
    return(list())
  }
  el <- el[keep, , drop = FALSE]
  meta <- el$meta
  lapply(seq_len(nrow(el)), function(i) {
    m <- if (length(meta) >= i) meta[[i]] else NULL
    rec <- list(
      key = el$key[[i]],
      x0 = el$x0[[i]], y0 = el$y0[[i]], x1 = el$x1[[i]], y1 = el$y1[[i]]
    )
    # Exact `[[` access, not `$` — `$` partial-matches, so `m$legend` would wrongly
    # pick up a swatch's `legend_for`.
    if (!is.null(m[["tooltip"]])) rec$tooltip <- as.character(m[["tooltip"]])
    if (!is.null(m[["hover_group"]])) rec$hover_group <- as.character(m[["hover_group"]])
    # Per-element grammar styling (Option 2), normalised to CSS colours.
    if (!is.null(m[["hover_color"]])) rec$hover_color <- .css_color(m[["hover_color"]])
    if (!is.null(m[["selected_color"]])) rec$selected_color <- .css_color(m[["selected_color"]])
    # Legend linking: a mark's series membership, or a swatch's series it drives.
    if (!is.null(m[["legend"]])) rec$legend <- as.character(m[["legend"]])
    if (!is.null(m[["legend_for"]])) rec$legend_for <- as.character(m[["legend_for"]])
    rec
  })
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

#' Shiny bindings for gloss widgets
#'
#' Standard [htmlwidgets] output/render helpers so a `gloss` widget can appear in
#' a Shiny app or an interactive R Markdown document. (Server-side selection
#' read-back is a future addition; today the widget is client-side only.)
#'
#' @param outputId Shiny output slot id.
#' @param width,height Widget size.
#' @param expr An expression producing a `gloss` widget.
#' @param env,quoted Standard non-standard-evaluation plumbing.
#' @return `glossOutput()`: a Shiny output UI element. `renderGloss()`: a Shiny
#'   render function.
#' @name gloss-shiny
#' @export
glossOutput <- function(outputId, width = "100%", height = "400px") {
  htmlwidgets::shinyWidgetOutput(outputId, "gloss", width, height, package = "gloss")
}

#' @rdname gloss-shiny
#' @export
renderGloss <- function(expr, env = parent.frame(), quoted = FALSE) {
  if (!quoted) {
    expr <- substitute(expr)
  }
  htmlwidgets::shinyRenderWidget(expr, glossOutput, env, quoted = TRUE)
}
