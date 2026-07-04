# as_widget(): compiles a quill plot or a raw vellum scene into a gloss
# htmlwidget whose payload carries the SVG (with data-keys) and the keyed
# element table the JS runtime consumes.

test_that("as_widget() on a quill plot builds a gloss htmlwidget with keyed payload", {
  skip_if_not_installed("quill")
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, model = rownames(mtcars))
  w <- quill::vplot(df) |>
    quill::mark_point(x = wt, y = mpg, tooltip = model, data_id = model) |>
    as_widget()

  expect_s3_class(w, "gloss")
  expect_s3_class(w, "htmlwidget")
  expect_match(w$x$svg, 'data-key="Mazda RX4"', fixed = TRUE)
  expect_length(w$x$elements, nrow(df))
  keys <- vapply(w$x$elements, function(e) e$key, character(1))
  expect_setequal(keys, df$model)
  # tooltip carried per element
  i <- which(keys == "Mazda RX4")
  expect_equal(w$x$elements[[i]]$tooltip, "Mazda RX4")
  # options round-trip
  expect_true(w$x$options$tooltip)
  expect_equal(w$x$options$selectMode, "multiple")
})

test_that("as_widget() works on a raw vellum scene (no quill)", {
  scene <- vellum::vl_scene(2, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(
      c(0.3, 0.7), 0.5,
      gp = vellum::gpar(fill = "red"), key = c("x", "y")
    ))
  w <- as_widget(scene)
  expect_s3_class(w, "gloss")
  expect_match(w$x$svg, 'data-key="x"', fixed = TRUE)
  expect_setequal(vapply(w$x$elements, function(e) e$key, character(1)), c("x", "y"))
})

test_that("a plot with no interactivity yields a static widget (no keyed elements)", {
  skip_if_not_installed("quill")
  w <- quill::vplot(mtcars) |>
    quill::mark_point(x = wt, y = mpg) |>
    as_widget()
  expect_s3_class(w, "gloss")
  expect_no_match(w$x$svg, "data-key")
  expect_length(w$x$elements, 0L)
})

test_that("select_mode is validated and passed through", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::gpar(fill = "red"), key = "a"))
  expect_equal(as_widget(scene, select_mode = "single")$x$options$selectMode, "single")
  expect_error(as_widget(scene, select_mode = "nope"))
})

test_that("elements carry a device-px bbox for brush/nearest hit-testing", {
  scene <- vellum::vl_scene(2, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(
      c(0.25, 0.75), 0.5, size = vellum::unit(4, "mm"),
      gp = vellum::gpar(fill = "red"), key = c("a", "b")
    ))
  w <- as_widget(scene)
  e <- w$x$elements[[1]]
  expect_true(all(c("x0", "y0", "x1", "y1") %in% names(e)))
  expect_true(is.numeric(e$x0) && e$x1 > e$x0 && e$y1 > e$y0)
  # bbox is in the SVG's viewBox (device-px) space: centre near 0.25*200 = 50
  cx <- (e$x0 + e$x1) / 2
  expect_true(abs(cx - 50) < 5)
})

test_that("Phase 4 option toggles round-trip into the payload", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::gpar(fill = "red"), key = "a"))
  o <- as_widget(scene)$x$options
  expect_true(o$brush && o$zoom && o$toolbar && o$nearest)
  o2 <- as_widget(scene, brush = FALSE, zoom = FALSE, toolbar = FALSE, nearest = FALSE)$x$options
  expect_false(o2$brush || o2$zoom || o2$toolbar || o2$nearest)
})

test_that("hover_group is carried into the element table", {
  scene <- vellum::vl_scene(2, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(
      c(0.3, 0.7), 0.5,
      gp = vellum::gpar(fill = "red"),
      key = c("a", "b"),
      meta = list(list(hover_group = "g"), list(hover_group = "g"))
    ))
  w <- as_widget(scene)
  hg <- vapply(w$x$elements, function(e) e$hover_group %||% NA_character_, character(1))
  expect_equal(hg, c("g", "g"))
})

test_that("widget theme args normalise to CSS colours in the payload (Option 1)", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::gpar(fill = "red"), key = "a"))
  s <- as_widget(scene, hover_color = "steelblue", selected_color = "orange",
                 dim_opacity = 0.1)$x$options$style
  expect_equal(s$hoverColor, "#4682b4") # R colour name -> hex
  expect_equal(s$selectedColor, "#ffa500")
  expect_equal(s$dimOpacity, 0.1)
  # defaults: NULL (fall back to the built-in CSS)
  s0 <- as_widget(scene)$x$options$style
  expect_null(s0$hoverColor)
  expect_null(s0$selectedColor)
  expect_null(s0$dimOpacity)
})

test_that("per-element grammar colours flow into the payload, normalised (Option 2)", {
  skip_if_not_installed("quill")
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg)
  w <- quill::vplot(df) |>
    quill::mark_point(x = wt, y = mpg, data_id = seq_len(nrow(df)),
                      hover_color = "red", selected_color = "grey20") |>
    as_widget()
  e <- w$x$elements[[1]]
  expect_equal(e$hover_color, "#ff0000")
  expect_equal(e$selected_color, "#333333")
})

`%||%` <- function(a, b) if (is.null(a)) b else a
