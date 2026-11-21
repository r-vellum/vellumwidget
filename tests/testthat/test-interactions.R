# The declarative-interactivity block travels from the vellumplot spec into the
# widget payload (where the JS runtime enacts it — see tests/js/behavior.test.js).

skip_if_not_installed("vellumplot")

test_that("as_widget() carries a plot's interaction_model in the payload", {
  df <- data.frame(x = 1:10, y = 1:10, g = rep(c("a", "b"), 5))
  p <- vellumplot::vplot(df) |>
    vellumplot::mark_point(
      x = x,
      y = y,
      color = vellumplot::condition("hi", g, "grey80")
    ) |>
    vellumplot::select_point("hi", on = "hover")
  w <- as_widget(p)
  ix <- w$x$interactions
  expect_false(is.null(ix))
  expect_length(ix$selections, 1L)
  expect_identical(ix$selections[[1]]$name, "hi")
  expect_identical(ix$selections[[1]]$on, "hover")
  expect_length(ix$conditions, 1L)
  expect_identical(ix$conditions[[1]]$aes, "color")
  expect_identical(ix$conditions[[1]]$if_false, "#cccccc") # normalised to CSS
})

test_that("condition membership tags reach the element metadata", {
  df <- data.frame(x = 1:6, y = 1:6, g = rep(c("a", "b"), 3))
  p <- vellumplot::vplot(df) |>
    vellumplot::mark_point(
      x = x,
      y = y,
      color = vellumplot::condition("hi", g, "grey80")
    ) |>
    vellumplot::select_point("hi", on = "hover")
  w <- as_widget(p)
  els <- w$x$elements
  # columnar payload: the `cond` column is present and tags every point
  expect_true("cond" %in% names(els))
})

test_that("two layers' conditions on one selection and aesthetic keep their own tags (VP-72)", {
  df <- data.frame(x = 1:6, y = 1:6, g = rep(c("a", "b"), 3))
  lab <- data.frame(x = 2, y = 5, g = "a", l = "t")
  p <- vellumplot::vplot(df) |>
    vellumplot::mark_point(
      x = x,
      y = y,
      color = vellumplot::condition("pick", g, "grey85")
    ) |>
    vellumplot::mark_text(
      data = lab,
      x = x,
      y = y,
      label = l,
      color = vellumplot::condition("pick", g, "tomato")
    ) |>
    vellumplot::select_point("pick", on = "click")
  ix <- as_widget(p)$x$interactions
  tags <- vapply(ix$conditions, function(cnd) cnd$tag %||% NA_character_, "")
  skip_if(anyNA(tags), "vellumplot predates per-layer condition tags")
  expect_identical(tags, c("pick:color@1", "pick:color@2"))
  expect_identical(
    vapply(ix$conditions, function(cnd) cnd$if_false, ""),
    c("#d9d9d9", "#ff6347")
  )
})

test_that("a cross-view composition carries join + filt for the target cell", {
  df <- data.frame(x = 1:4, y = 1:4)
  sel <- vellumplot::select_interval("br", on = "x")
  comp <- vellumplot::vconcat(
    vellumplot::vplot(df) |>
      vellumplot::mark_point(x = x, y = y) |>
      vellumplot::add_selection(sel),
    vellumplot::vplot(df) |>
      vellumplot::mark_point(x = x, y = y) |>
      vellumplot::filter_by(sel)
  )
  els <- as_widget(comp)$x$elements
  expect_true("join" %in% names(els))
  expect_true("filt" %in% names(els))
  # only the filtering cell (cell B) is tagged; both cells carry a join id
  expect_equal(sum(lengths(els$filt) > 0), nrow(df))
  expect_equal(length(els$join), 2L * nrow(df))
  # keys are unique across cells (no collision in one runtime)
  expect_equal(length(unique(els$key)), length(els$key))
})

test_that("a plot with no declared interaction carries no interactions block", {
  df <- data.frame(x = 1:5, y = 1:5)
  w <- as_widget(vellumplot::vplot(df) |> vellumplot::mark_point(x = x, y = y))
  expect_null(w$x$interactions)
})

# select_interval(encodings =) needs a vellumplot that emits per-element data
# values; CI installs vellumplot from GitHub main, so skip until that is released.
skip_if_no_interval_values <- function() {
  skip_if_not(
    "encodings" %in% names(formals(vellumplot::select_interval)),
    "installed vellumplot predates select_interval(encodings =)"
  )
}

test_that("an interval selection carries its spec record and data values", {
  skip_if_no_interval_values()
  df <- data.frame(
    x = c(1, 5, 9),
    y = c(2, 4, 6),
    g = c("a", "b", "c"),
    d = as.Date("2024-01-01") + c(0, 10, 20)
  )
  p <- vellumplot::vplot(df) |>
    vellumplot::mark_point(
      x = x,
      y = y,
      color = vellumplot::condition("br", g, "grey80")
    ) |>
    vellumplot::select_interval("br", encodings = c("x", "y"))
  w <- as_widget(p)
  sel <- w$x$interactions$selections[[1]]
  expect_identical(sel$type, "interval")
  expect_identical(unlist(sel$encodings), c("x", "y"))
  els <- w$x$elements
  expect_equal(els$ix, df$x)
  expect_equal(els$iy, df$y)
  # the panel axis says which aesthetic it shows
  expect_identical(w$x$panels[[1]]$x$aes, "x")

  # a date axis ships the epoch value; a discrete axis the label + levels
  wd <- as_widget(
    vellumplot::vplot(df) |>
      vellumplot::mark_point(x = d, y = y) |>
      vellumplot::select_interval("br", encodings = "x")
  )
  expect_equal(wd$x$elements$ix, as.numeric(df$d))
  expect_null(wd$x$elements$iy) # x-only selection: no y values
  wc <- as_widget(
    vellumplot::vplot(df) |>
      vellumplot::mark_bar(x = g, y = y) |>
      vellumplot::select_interval("br")
  )
  expect_setequal(wc$x$elements$ixd, df$g)
  expect_identical(unlist(wc$x$panels[[1]]$x$levels), c("a", "b", "c"))
})

test_that("a plot without an interval selection ships no interval values", {
  df <- data.frame(x = 1:3, y = 1:3)
  w <- as_widget(
    vellumplot::vplot(df) |>
      vellumplot::mark_point(x = x, y = y) |>
      vellumplot::select_point("p")
  )
  expect_false(any(c("ix", "iy", "ixd", "iyd") %in% names(w$x$elements)))
})

# --- bind_scale() / select_interval(bind = "scales") (F-15) --------------------

test_that("panel descriptors forward a composition cell id", {
  model <- list(panels = data.frame(
    name = c("cell-1-panel-1-1", "panel-1-1"),
    px0 = c(10, 10),
    py0 = c(10, 10),
    px1 = c(100, 100),
    py1 = c(50, 50)
  ))
  ax <- list(
    type = "continuous",
    transform = "identity",
    data_lo = 0,
    data_hi = 1,
    native_lo = 0,
    native_hi = 1
  )
  sc <- list(cartesian = TRUE, x = ax, y = ax)
  model$panels$meta <- list(list(scales = sc, cell = "cell-1"), list(scales = sc))
  p <- vellumwidget:::.vellumwidget_panels(model)
  expect_identical(p[[1]]$cell, "cell-1")
  expect_null(p[[2]]$cell)
})

test_that("an overview + detail composition ships per-cell panels and scoped binds", {
  skip_if_not("bind" %in% names(formals(vellumplot::select_interval)))
  df <- data.frame(t = 1:30, v = sin(1:30 / 4))
  brush <- vellumplot::select_interval("brush", encodings = "x")
  cmp <- vellumplot::vconcat(
    vellumplot::vplot(df) |>
      vellumplot::mark_line(x = t, y = v) |>
      vellumplot::add_selection(brush),
    vellumplot::vplot(df) |>
      vellumplot::mark_line(x = t, y = v) |>
      vellumplot::bind_scale(brush)
  )
  w <- as_widget(cmp)
  nm <- vapply(w$x$panels, function(p) p$name, character(1))
  cells <- vapply(w$x$panels, function(p) p$cell, character(1))
  expect_identical(nm, c("cell-1-panel-1-1", "cell-2-panel-1-1"))
  expect_identical(cells, c("cell-1", "cell-2"))
  expect_identical(w$x$interactions$binds[[1]]$cell, "cell-2")
  js <- as.character(htmlwidgets:::toJSON(w$x$interactions))
  expect_match(js, '"cells":["cell-1"]', fixed = TRUE)
  expect_match(w$x$svg, 'data-vellum-pan="cell-2-panel-1-1"', fixed = TRUE)
})

test_that("a condition's if_false colour ships as CSS (VW-16)", {
  df <- data.frame(x = 1:10, y = 1:10, g = rep(c("a", "b"), 5))
  p <- vellumplot::vplot(df) |>
    vellumplot::mark_point(
      x = x,
      y = y,
      color = vellumplot::condition("hi", g, "grey80")
    ) |>
    vellumplot::select_point("hi", on = "hover")
  expect_identical(as_widget(p)$x$interactions$conditions[[1]]$if_false, "#cccccc")
})
