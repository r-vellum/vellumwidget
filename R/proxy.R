#' Drive an already-rendered widget from the Shiny server
#'
#' `vellumwidget_proxy()` is the server-to-client counterpart of the input
#' read-back documented in [vellumwidget-shiny]. It returns a lightweight handle to a
#' widget that is **already on the page**, so the server can change what the
#' widget shows --- set the selection, cross-filter it, zoom it --- **without
#' re-rendering** it (no `renderVellumwidget()` round-trip, no full redraw, no lost
#' pan/zoom). This mirrors `leaflet::leafletProxy()` / `DT::dataTableProxy()` /
#' `plotly::plotlyProxy()`.
#'
#' Call it inside an `observe()` / `observeEvent()` with the same `outputId` you
#' gave [vellumwidgetOutput()], then pipe the handle through one or more of the verbs
#' below. Each verb sends a single custom message to the browser and returns the
#' proxy invisibly, so calls chain with the pipe.
#'
#' \describe{
#'   \item{[vw_select()]}{Replace the widget's selection with `keys` (the element
#'     `data_id`s). Selecting projects across a mark's `hover_group` and
#'     propagates to any linked / crosstalk widgets, exactly as a user click
#'     would, and updates `input$<id>_selected`.}
#'   \item{[vw_clear_selection()]}{Clear the selection.}
#'   \item{[vw_filter()]}{Cross-filter: show only the elements whose key is in
#'     `keys` and dim/hide the rest (display tier --- the data is untouched).}
#'   \item{[vw_clear_filter()]}{Remove the filter (show everything).}
#'   \item{[vw_zoom()]}{Zoom/pan the view to frame the elements in `keys`.}
#'   \item{[vw_reset_zoom()]}{Restore the original (full) view.}
#' }
#'
#' All keys are the element **data keys** --- the `data_id` a `vellumplot` mark
#' declares --- the same identifiers you receive back through `input$<id>_selected`
#' and friends.
#'
#' @param outputId The id of the [vellumwidgetOutput()] to control (the un-namespaced
#'   id, as passed to `vellumwidgetOutput()`; module namespacing is handled for you).
#' @param session The Shiny session; defaults to the current reactive domain, so
#'   you rarely pass it explicitly.
#' @return An object of class `"vellumwidget_proxy"` (invisibly from the verbs), to be
#'   piped into [vw_select()] and the other proxy verbs.
#' @seealso [vw_select()], [vw_filter()], [vw_zoom()]; [vellumwidgetOutput()] and
#'   [vellumwidget-shiny] for reading interactions back.
#' @examples
#' \dontrun{
#' library(shiny)
#' server <- function(input, output, session) {
#'   output$plot <- renderVellumwidget(my_widget)
#'   # A server-side control drives the plot without redrawing it:
#'   observeEvent(input$highlight, {
#'     vellumwidget_proxy("plot") |> vw_select(input$highlight)
#'   })
#'   observeEvent(input$reset, {
#'     vellumwidget_proxy("plot") |> vw_clear_selection() |> vw_reset_zoom()
#'   })
#' }
#' }
#' @export
vellumwidget_proxy <- function(outputId, session = NULL) {
  if (is.null(session)) {
    if (!requireNamespace("shiny", quietly = TRUE)) {
      stop("`vellumwidget_proxy()` requires the 'shiny' package.", call. = FALSE)
    }
    session <- shiny::getDefaultReactiveDomain()
  }
  if (is.null(session)) {
    stop(
      "`vellumwidget_proxy()` must be called from within a Shiny session ",
      "(no reactive domain found).",
      call. = FALSE
    )
  }
  if (!is.character(outputId) || length(outputId) != 1L || is.na(outputId)) {
    stop("`outputId` must be a single output id string.", call. = FALSE)
  }
  structure(
    list(
      # The widget's DOM id: `session$ns()` prepends the module namespace when
      # called inside a Shiny module, and is the identity at the top level.
      id = session$ns(outputId),
      session = session
    ),
    class = "vellumwidget_proxy"
  )
}

# Send one proxy command to the browser. The JS runtime routes `method`/`args`
# to the matching client action (see srcts/index.ts, the "vellumwidget-calls" handler).
.vw_proxy_call <- function(proxy, method, args = NULL) {
  if (!inherits(proxy, "vellumwidget_proxy")) {
    stop(
      "`proxy` must be a `vellumwidget_proxy` from `vellumwidget_proxy()`.",
      call. = FALSE
    )
  }
  msg <- list(id = proxy$id, method = method)
  if (!is.null(args)) {
    msg$args <- args
  }
  proxy$session$sendCustomMessage("vellumwidget-calls", msg)
  invisible(proxy)
}

# Normalise a keys argument to a plain character vector (never NULL): the
# selection/filter/zoom verbs all speak in element data keys.
.vw_keys <- function(keys, arg = "keys") {
  if (is.null(keys)) {
    return(character(0))
  }
  if (!is.atomic(keys)) {
    stop(sprintf("`%s` must be a character vector of element keys.", arg), call. = FALSE)
  }
  as.character(keys)
}

#' Proxy verbs: drive a rendered widget from the server
#'
#' Pipe a [vellumwidget_proxy()] handle through these to change what an
#' already-rendered widget shows, without re-rendering it. Each sends one message
#' to the browser and returns the proxy invisibly, so they chain.
#'
#' @param proxy A [vellumwidget_proxy()].
#' @param keys Character vector of element **data keys** (the `data_id`s a
#'   `vellumplot` mark declares). For [vw_select()]/[vw_filter()] an empty vector is
#'   meaningful (select nothing / hide everything); use [vw_clear_selection()] /
#'   [vw_clear_filter()] to *remove* a selection or filter. For [vw_zoom()] an empty
#'   vector resets to the full view.
#' @return The `proxy`, invisibly (for piping).
#' @seealso [vellumwidget_proxy()]
#' @name vellumwidget-proxy-verbs
NULL

#' @rdname vellumwidget-proxy-verbs
#' @export
vw_select <- function(proxy, keys) {
  .vw_proxy_call(proxy, "select", .vw_keys(keys))
}

#' @rdname vellumwidget-proxy-verbs
#' @export
vw_clear_selection <- function(proxy) {
  .vw_proxy_call(proxy, "clearSelection")
}

#' @rdname vellumwidget-proxy-verbs
#' @export
vw_filter <- function(proxy, keys) {
  .vw_proxy_call(proxy, "filter", .vw_keys(keys))
}

#' @rdname vellumwidget-proxy-verbs
#' @export
vw_clear_filter <- function(proxy) {
  .vw_proxy_call(proxy, "clearFilter")
}

#' @rdname vellumwidget-proxy-verbs
#' @export
vw_zoom <- function(proxy, keys) {
  .vw_proxy_call(proxy, "zoom", .vw_keys(keys))
}

#' @rdname vellumwidget-proxy-verbs
#' @export
vw_reset_zoom <- function(proxy) {
  .vw_proxy_call(proxy, "resetZoom")
}
