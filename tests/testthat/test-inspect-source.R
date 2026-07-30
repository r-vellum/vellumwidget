# Click-to-source (vellumplot::inspect_source()): the per-grob source-row payload
# travels into the widget, keyed by data-vellum-id. The JS runtime reads it on
# click (see the emitSource hook in srcts/index.ts; browser-validated separately).

skip_if_not_installed("vellumplot")
skip_if_not(
  "inspect_source" %in% getNamespaceExports("vellumplot"),
  "installed vellumplot has no inspect_source()"
)

test_that("inspect_source() attaches a click-to-source payload keyed by grob id", {
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, cyl = factor(mtcars$cyl))
  p <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = wt, y = mpg, color = cyl) |>
    vellumplot::inspect_source()
  w <- as_widget(p)
  prov <- w$x$provenance
  expect_false(is.null(prov))
  expect_identical(prov$on, "click")
  expect_gte(length(prov$byId), 1L)
  # every id is a real scene grob id (the SVG's data-vellum-id join key)
  sc <- vellum::as_vellum_scene(p)
  ids <- unique(stats::na.omit(vellum::scene_model(sc)$elements$id))
  expect_true(all(names(prov$byId) %in% ids))
  expect_type(prov$byId[[1]], "integer")
  expect_null(prov$values) # values off by default
})

test_that("inspect_source(values = TRUE) inlines the data rows", {
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg)
  p <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = wt, y = mpg) |>
    vellumplot::inspect_source(values = TRUE)
  w <- as_widget(p)
  expect_false(is.null(w$x$provenance$values))
  expect_length(w$x$provenance$values, nrow(df))
})

test_that("a plot without inspect_source() carries no provenance payload", {
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg)
  p <- vellumplot::vplot(df) |> vellumplot::mark_point(x = wt, y = mpg)
  expect_null(as_widget(p)$x$provenance)
})

test_that("as_widget() argument count is unchanged (opt-in rides the spec)", {
  # click-to-source must NOT add an as_widget() flag (CLAUDE.md + the tripwire).
  expect_lte(length(formals(as_widget)), 24L)
})
