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
  expect_identical(ix$conditions[[1]]$if_false, "grey80")
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
