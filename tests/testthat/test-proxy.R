# vellumwidget_proxy(): a server-side handle that drives an already-rendered widget
# by sending "vellumwidget-calls" custom messages. Tested against a fake Shiny
# session that captures the messages (no live Shiny needed).

# A minimal stand-in for a ShinySession: `ns()` namespaces an id and
# `sendCustomMessage()` records what would go to the browser.
fake_session <- function(prefix = NULL) {
  sent <- list()
  list(
    ns = function(id) if (is.null(prefix)) id else paste0(prefix, "-", id),
    sendCustomMessage = function(type, message) {
      sent[[length(sent) + 1L]] <<- list(type = type, message = message)
      invisible(NULL)
    },
    .sent = function() sent
  )
}

test_that("vellumwidget_proxy() captures the (namespaced) output id and session", {
  s <- fake_session()
  p <- vellumwidget_proxy("plot", session = s)
  expect_s3_class(p, "vellumwidget_proxy")
  expect_equal(p$id, "plot")
  expect_identical(p$session, s)

  # inside a module, session$ns() prepends the namespace
  sm <- fake_session(prefix = "mod")
  expect_equal(vellumwidget_proxy("plot", session = sm)$id, "mod-plot")
})

test_that("vellumwidget_proxy() errors without a session / reactive domain", {
  expect_error(vellumwidget_proxy("plot", session = NULL), "Shiny session")
  expect_error(vellumwidget_proxy(1, session = fake_session()), "output id")
})

test_that("vw_select() sends a select message with the keys as args", {
  s <- fake_session()
  p <- vellumwidget_proxy("plot", session = s)
  out <- vw_select(p, c("a", "b"))
  expect_identical(out, p) # returns the proxy invisibly for piping

  sent <- s$.sent()
  expect_length(sent, 1L)
  expect_equal(sent[[1]]$type, "vellumwidget-calls")
  expect_equal(sent[[1]]$message$id, "plot")
  expect_equal(sent[[1]]$message$method, "select")
  expect_equal(sent[[1]]$message$args, c("a", "b"))
})

test_that("vw_select() coerces keys to character and keeps an empty vector", {
  s <- fake_session()
  p <- vellumwidget_proxy("plot", session = s)
  vw_select(p, 1:3)
  vw_select(p, character(0))
  sent <- s$.sent()
  expect_equal(sent[[1]]$message$args, c("1", "2", "3"))
  expect_equal(sent[[2]]$message$args, character(0))
})

test_that("clear/reset verbs send a bare method with no args", {
  s <- fake_session()
  p <- vellumwidget_proxy("plot", session = s)
  vw_clear_selection(p)
  vw_clear_filter(p)
  vw_reset_zoom(p)
  sent <- s$.sent()
  methods <- vapply(sent, function(m) m$message$method, character(1))
  expect_equal(methods, c("clearSelection", "clearFilter", "resetZoom"))
  # no `args` key at all (distinguishes clear-filter from filter([]))
  for (m in sent) expect_null(m$message$args)
})

test_that("vw_filter() and vw_zoom() send their keys", {
  s <- fake_session()
  p <- vellumwidget_proxy("plot", session = s)
  vw_filter(p, c("x", "y"))
  vw_zoom(p, "x")
  sent <- s$.sent()
  expect_equal(sent[[1]]$message$method, "filter")
  expect_equal(sent[[1]]$message$args, c("x", "y"))
  expect_equal(sent[[2]]$message$method, "zoom")
  expect_equal(sent[[2]]$message$args, "x")
})

test_that("the proxy verbs reject a non-proxy first argument", {
  expect_error(vw_select(list(), "a"), "vellumwidget_proxy")
  expect_error(vw_clear_selection("nope"), "vellumwidget_proxy")
})
