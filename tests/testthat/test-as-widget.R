# as_widget(): compiles a vellumplot plot or a raw vellum scene into a vellumwidget
# htmlwidget whose payload carries the SVG (with data-keys) and the keyed
# element table the JS runtime consumes.

test_that("as_widget() on a vellumplot plot builds a vellumwidget htmlwidget with keyed payload", {
  skip_if_not_installed("vellumplot")
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, model = rownames(mtcars))
  w <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = wt, y = mpg, tooltip = model, data_id = model) |>
    as_widget()

  expect_s3_class(w, "vellumwidget")
  expect_s3_class(w, "htmlwidget")
  expect_match(w$x$svg, 'data-key="Mazda RX4"', fixed = TRUE)
  # payload is columnar: one vector per field, aligned by index
  expect_length(w$x$elements$key, nrow(df))
  keys <- w$x$elements$key
  expect_setequal(keys, df$model)
  # tooltip carried per element
  i <- which(keys == "Mazda RX4")
  expect_equal(w$x$elements$tooltip[i], "Mazda RX4")
  # options round-trip
  expect_true(w$x$options$tooltip)
  expect_equal(w$x$options$selectMode, "multiple")
})

test_that("as_widget() works on a raw vellum scene (no vellumplot)", {
  scene <- vellum::vl_scene(2, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(
      c(0.3, 0.7), 0.5,
      gp = vellum::vl_gpar(fill = "red"), key = c("x", "y")
    ))
  w <- as_widget(scene)
  expect_s3_class(w, "vellumwidget")
  expect_match(w$x$svg, 'data-key="x"', fixed = TRUE)
  expect_setequal(w$x$elements$key, c("x", "y"))
})

test_that("a plot with no interactivity yields a static widget (no keyed elements)", {
  skip_if_not_installed("vellumplot")
  w <- vellumplot::vplot(mtcars) |>
    vellumplot::mark_point(x = wt, y = mpg) |>
    as_widget()
  expect_s3_class(w, "vellumwidget")
  expect_no_match(w$x$svg, "data-key")
  expect_length(w$x$elements, 0L)
})

test_that("select_mode is validated and passed through", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  expect_equal(as_widget(scene, select_mode = "single")$x$options$selectMode, "single")
  expect_error(as_widget(scene, select_mode = "nope"))
})

test_that("elements carry a device-px bbox for brush/nearest hit-testing", {
  scene <- vellum::vl_scene(2, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(
      c(0.25, 0.75), 0.5, size = vellum::vl_unit(4, "mm"),
      gp = vellum::vl_gpar(fill = "red"), key = c("a", "b")
    ))
  w <- as_widget(scene)
  el <- w$x$elements
  expect_true(all(c("x0", "y0", "x1", "y1") %in% names(el)))
  expect_true(is.numeric(el$x0) && el$x1[1] > el$x0[1] && el$y1[1] > el$y0[1])
  # bbox is in the SVG's viewBox (device-px) space: centre near 0.25*200 = 50
  cx <- (el$x0[1] + el$x1[1]) / 2
  expect_true(abs(cx - 50) < 5)
})

test_that("Phase 4 option toggles round-trip into the payload", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  o <- as_widget(scene)$x$options
  expect_true(o$brush && o$zoom && o$toolbar && o$nearest)
  o2 <- as_widget(scene, brush = FALSE, zoom = FALSE, toolbar = FALSE, nearest = FALSE)$x$options
  expect_false(o2$brush || o2$zoom || o2$toolbar || o2$nearest)
})

test_that("a11y is on by default and round-trips (with alt) into the payload", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  o <- as_widget(scene)$x$options
  expect_true(o$a11y)
  expect_null(o$alt) # defaults to the scene's own title/desc
  o2 <- as_widget(scene, a11y = FALSE, alt = "A single red point.")$x$options
  expect_false(o2$a11y)
  expect_equal(o2$alt, "A single red point.")
})

test_that("hover_group is carried into the element table", {
  scene <- vellum::vl_scene(2, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(
      c(0.3, 0.7), 0.5,
      gp = vellum::vl_gpar(fill = "red"),
      key = c("a", "b"),
      meta = list(list(hover_group = "g"), list(hover_group = "g"))
    ))
  w <- as_widget(scene)
  expect_equal(w$x$elements$hover_group, c("g", "g"))
})

test_that("widget theme args normalise to CSS colours in the payload (Option 1)", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
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

test_that("tooltip_style normalises into the payload tip* CSS vars", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  s <- as_widget(scene, tooltip_style = list(
    background = "steelblue", color = "white", fontsize = "14px", max_width = "260px"
  ))$x$options$style
  expect_equal(s$tipBg, "#4682b4") # colour name -> hex
  expect_equal(s$tipFg, "#ffffff")
  expect_equal(s$tipFontSize, "14px")
  expect_equal(s$tipMaxWidth, "260px")
  # unset -> no tip* entries at all (built-in CSS defaults apply)
  s0 <- as_widget(scene)$x$options$style
  expect_null(s0$tipBg)
  expect_false("tipFontSize" %in% names(s0))
})

test_that("export_filename / export_scale round-trip into the payload", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  ex <- as_widget(scene, export_filename = "myplot", export_scale = 2)$x$options$export
  expect_equal(ex$filename, "myplot")
  expect_equal(ex$scale, 2)
  # unset -> empty (JS falls back to "plot" @ 1x)
  ex0 <- as_widget(scene)$x$options$export
  expect_null(ex0$filename)
  expect_null(ex0$scale)
})

test_that("per-element grammar colours flow into the payload, normalised (Option 2)", {
  skip_if_not_installed("vellumplot")
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg)
  w <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = wt, y = mpg, data_id = seq_len(nrow(df)),
                      hover_color = "red", selected_color = "grey20") |>
    as_widget()
  el <- w$x$elements
  expect_equal(el$hover_color[1], "#ff0000")
  expect_equal(el$selected_color[1], "#333333")
})

test_that("group option round-trips for own-bus linking (Phase 5)", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  w <- as_widget(scene, group = "mylink")
  expect_equal(w$x$options$group, "mylink")
  expect_null(w$x$options$crosstalk)
})

test_that("crosstalk = SharedData wires the group + loads crosstalk deps (Phase 5)", {
  skip_if_not_installed("crosstalk")
  skip_if_not_installed("vellumplot")
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, id = rownames(mtcars))
  sd <- crosstalk::SharedData$new(df, key = ~id, group = "ctgrp")
  w <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = wt, y = mpg, data_id = id) |>
    as_widget(crosstalk = sd)
  expect_equal(w$x$options$crosstalk, "ctgrp")
  # the crosstalk client library is attached as a dependency
  deps <- w$dependencies
  expect_true(length(deps) > 0)
  expect_true(any(vapply(deps, function(d) grepl("crosstalk", d$name %||% ""), logical(1))))
})

test_that("crosstalk accepts a bare group name; absent by default", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  expect_equal(as_widget(scene, crosstalk = "g")$x$options$crosstalk, "g")
  w0 <- as_widget(scene)
  expect_null(w0$x$options$crosstalk)
  expect_null(w0$dependencies)
  expect_error(as_widget(scene, crosstalk = 42))
})

test_that("discrete legend swatches + series membership flow into the payload (Phase 5)", {
  skip_if_not_installed("vellumplot")
  df <- data.frame(
    wt = mtcars$wt, mpg = mtcars$mpg,
    model = rownames(mtcars), cyl = factor(mtcars$cyl)
  )
  w <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = wt, y = mpg, color = cyl, data_id = model) |>
    as_widget()
  el <- w$x$elements
  # swatches carry `legend_for` (and NOT `legend`); marks carry `legend` membership
  is_swatch <- !is.na(el$legend_for)
  has_legend <- lengths(el$legend) > 0L
  expect_equal(sum(is_swatch), nlevels(df$cyl))
  expect_equal(sum(has_legend), nrow(df))
  expect_setequal(el$legend_for[is_swatch], paste0("color:", levels(df$cyl)))
  # no swatch leaks a `legend` membership (the `$`-partial-match trap)
  expect_false(any(is_swatch & has_legend))
})

`%||%` <- function(a, b) if (is.null(a)) b else a

# Keyed statistical marks (error bars / boxplots) become interactive: each mark's
# several SVG elements share one data-key, so the widget hovers/selects them as a
# unit. Gated on the installed vellumplot actually keying error bars, so this
# passes regardless of which vellumplot dev version is present.
.errorbar_keyed <- function() {
  if (!requireNamespace("vellumplot", quietly = TRUE)) return(FALSE)
  df <- data.frame(g = c("a", "b"), lo = c(1, 2), hi = c(3, 4))
  w <- tryCatch(
    vellumplot::vplot(df) |>
      vellumplot::mark_errorbar(x = g, ymin = lo, ymax = hi, data_id = g) |>
      as_widget(),
    error = function(e) NULL
  )
  !is.null(w) && any(grepl("data-key", w$x$svg %||% ""))
}

test_that("as_widget() keys an error bar's segments to one addressable unit", {
  skip_if_not_installed("vellumplot")
  skip_if_not(.errorbar_keyed(), "installed vellumplot does not key error bars yet")
  df <- data.frame(g = c("a", "b", "c"), lo = c(1, 2, 3), hi = c(3, 4, 5))
  w <- vellumplot::vplot(df) |>
    vellumplot::mark_errorbar(x = g, ymin = lo, ymax = hi, data_id = g, tooltip = g) |>
    as_widget()
  keys <- w$x$elements$key
  # each bar contributes several keyed segment rows sharing its datum key
  expect_setequal(unique(keys), c("a", "b", "c"))
  expect_gt(sum(keys == "b"), 1L)
  expect_match(w$x$svg, 'data-key="b"', fixed = TRUE)
})

test_that("as_widget() keys each boxplot box by its category", {
  skip_if_not_installed("vellumplot")
  skip_if_not(.errorbar_keyed(), "installed vellumplot does not key stat marks yet")
  w <- vellumplot::vplot(mtcars) |>
    vellumplot::mark_boxplot(x = factor(cyl), y = mpg, data_id = cyl) |>
    as_widget()
  keys <- w$x$elements$key
  expect_true(all(c("4", "6", "8") %in% keys))
})
