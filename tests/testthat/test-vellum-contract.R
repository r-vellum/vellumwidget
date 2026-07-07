# Cross-layer contract: gloss reads vellum's `scene_model()` element table (via
# `gloss_elements()`) and the SVG `data-key` attributes. These tests assert the
# columns and meta keys gloss depends on, so a schema change in vellum (caught by
# the nightly run against vellum's `main`) fails loudly here. The contract is
# specified in vellum's `vignette("scene-contract")`.

gloss_elements <- getFromNamespace(".gloss_elements", "gloss")

keyed_scene <- function() {
  vellum::vl_scene(3, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(
      x = c(0.25, 0.75), y = c(0.5, 0.5),
      size = vellum::unit(6, "mm"),
      gp = vellum::gpar(fill = "steelblue", col = NA),
      key = c("a", "b"),
      meta = list(
        list(tooltip = "Alpha", hover_group = "g1"),
        list(tooltip = "Beta", hover_group = "g1")
      )
    ))
}

test_that("scene_model() exposes the element columns gloss reads", {
  m <- vellum::scene_model(keyed_scene())
  el <- m$elements
  expect_true(all(c("key", "x0", "y0", "x1", "y1") %in% names(el)))
  expect_type(el$meta, "list")
  expect_type(el$key, "character")
  expect_true(is.numeric(el$x0) && is.numeric(el$y1))
})

test_that("gloss_elements() turns the contract into keyed interaction records", {
  m <- vellum::scene_model(keyed_scene())
  els <- gloss_elements(m)

  expect_length(els, 2L)
  expect_setequal(vapply(els, function(e) e$key, character(1)), c("a", "b"))

  a <- Filter(function(e) e$key == "a", els)[[1]]
  # bbox fields carried through
  expect_true(all(c("x0", "y0", "x1", "y1") %in% names(a)))
  # reserved meta keys read via exact `[[` (no partial-match)
  expect_identical(a$tooltip, "Alpha")
  expect_identical(a$hover_group, "g1")
})

test_that("an unkeyed scene yields no interaction records (contract additivity)", {
  plain <- vellum::vl_scene(3, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(c(0.25, 0.75), 0.5,
                                     gp = vellum::gpar(fill = "steelblue", col = NA)))
  expect_length(gloss_elements(vellum::scene_model(plain)), 0L)
})
