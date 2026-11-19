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
  expect_lte(length(formals(as_widget)), 18L)
})

layer_data_plot <- function(values = TRUE) {
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg)
  notes <- data.frame(wt = c(2, 5), mpg = c(30, 12), lab = c("light", "heavy"))
  vellumplot::vplot(df) |>
    vellumplot::mark_point(x = wt, y = mpg) |>
    vellumplot::mark_point(data = notes, x = wt, y = mpg) |>
    vellumplot::inspect_source(values = values)
}

skip_if_untagged <- function(p) {
  pl <- vellumplot::provenance_payload(p)
  srcs <- vapply(pl$elements, function(e) e$source %||% NA_character_, "")
  skip_if(
    all(is.na(srcs)),
    "installed vellumplot does not tag provenance sources"
  )
  skip_if(is.null(pl$sources), "installed vellumplot ships no `sources` block")
  pl
}

test_that("an element drawn from a layer's own data is present, with its source", {
  p <- layer_data_plot()
  pl <- skip_if_untagged(p)
  srcs <- vapply(pl$elements, function(e) e$source, "")
  layer_ids <- vapply(pl$elements[srcs != "plot"], function(e) e$id, "")
  expect_gte(length(layer_ids), 1L)

  prov <- as_widget(p)$x$provenance
  # every element is in the map, the layer ones included
  ids <- vapply(pl$elements, function(e) e$id, "")
  expect_setequal(names(prov$byId), ids)
  # only non-plot elements are tagged; their source is the layer's
  expect_setequal(names(prov$sourceOf), layer_ids)
  expect_true(all(unlist(prov$sourceOf) == "layer:2"))
  expect_named(prov$sources, "layer:2")
})

test_that("a layer-data element's rows index that layer's own table", {
  p <- layer_data_plot()
  skip_if_untagged(p)
  prov <- as_widget(p)$x$provenance
  tbl <- prov$sources[["layer:2"]]
  expect_identical(as.character(tbl$fields), c("wt", "mpg", "lab"))
  expect_length(tbl$values, 2L)
  for (id in names(prov$sourceOf)) {
    rows <- prov$byId[[id]]
    expect_true(all(rows >= 1L & rows <= length(tbl$values)))
  }
  labs <- vapply(tbl$values, function(r) r$lab, "")
  expect_identical(labs, c("light", "heavy"))
})

test_that("plot-data elements keep the top-level fields/values, as before", {
  p <- layer_data_plot()
  skip_if_untagged(p)
  prov <- as_widget(p)$x$provenance
  expect_identical(as.character(prov$fields), c("wt", "mpg"))
  expect_length(prov$values, nrow(mtcars))
  plot_ids <- setdiff(names(prov$byId), names(prov$sourceOf))
  expect_gte(length(plot_ids), 1L)
  expect_true(all(unlist(prov$byId[plot_ids]) <= length(prov$values)))
})

test_that("without values, a layer source ships its fields but no rows", {
  p <- layer_data_plot(values = FALSE)
  skip_if_untagged(p)
  prov <- as_widget(p)$x$provenance
  expect_null(prov$values)
  expect_identical(
    as.character(prov$sources[["layer:2"]]$fields),
    c("wt", "mpg", "lab")
  )
  expect_null(prov$sources[["layer:2"]]$values)
})

test_that("a plot with only plot data ships no sourceOf/sources (payload unchanged)", {
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg)
  p <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = wt, y = mpg) |>
    vellumplot::inspect_source(values = TRUE)
  prov <- as_widget(p)$x$provenance
  expect_null(prov$sourceOf)
  expect_null(prov$sources)
})

test_that("an untagged element (older vellumplot) falls back to the plot data", {
  fake <- function(x, values = FALSE) {
    list(
      fields = list("wt", "mpg"),
      elements = list(
        list(id = "layer-1-point-g1", rows = 1:2), # no `source`
        list(id = "layer-1-point-g2", rows = 3L, source = NA_character_)
      ),
      data = if (values) {
        list(
          list(wt = 1, mpg = 2),
          list(wt = 3, mpg = 4),
          list(wt = 5, mpg = 6)
        )
      }
    )
  }
  local_mocked_bindings(provenance_payload = fake, .package = "vellumplot")
  prov <- .vellumwidget_provenance(NULL, list(on = "click", values = TRUE))
  expect_setequal(names(prov$byId), c("layer-1-point-g1", "layer-1-point-g2"))
  expect_null(prov$sourceOf)
  expect_null(prov$sources)
  expect_identical(as.character(prov$fields), c("wt", "mpg"))
  expect_length(prov$values, 3L)
})
