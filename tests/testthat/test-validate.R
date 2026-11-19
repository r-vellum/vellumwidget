# as_widget() argument validation (VW-6): every argument is checked up front and
# a bad value fails with a cli error naming the argument, instead of crashing
# deep inside the build or shipping NA / arrays to the runtime. Since R-13 the
# grouped settings are validated by their option helpers.

.val_scene <- function() {
  vellum::vl_scene(2, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, key = "a"))
}

test_that("raster_threshold = NA is a clear error, not an if() crash", {
  s <- .val_scene()
  expect_error(render_options(raster_threshold = NA), "`raster_threshold`")
  expect_error(render_options(raster_threshold = -1), "at least 0")
  expect_error(
    render_options(raster_threshold = c(1, 2)),
    "single finite number"
  )
  # the deprecated flat argument is validated the same way
  withr::local_options(lifecycle_verbosity = "quiet")
  expect_error(as_widget(s, raster_threshold = NA), "`raster_threshold`")
})

test_that("tooltip delay must be a non-negative number", {
  s <- .val_scene()
  expect_error(tooltip_options(delay = "abc"), "`delay`")
  expect_error(tooltip_options(delay = -5), "`delay`")
  expect_error(tooltip_options(delay = NA_real_), "`delay`")
  w <- as_widget(s, tooltip = tooltip_options(delay = 250L))
  expect_identical(w$x$options$tooltipDelay, 250)
  expect_identical(tooltip_options(delay = NULL)$delay, 0)
  withr::local_options(lifecycle_verbosity = "quiet")
  expect_error(as_widget(s, tooltip_delay = "abc"), "`delay`")
})

test_that("group must be a single string", {
  s <- .val_scene()
  expect_error(as_widget(s, group = 1:3), "`group`")
  expect_error(as_widget(s, group = c("a", "b")), "`group`")
  expect_error(as_widget(s, group = ""), "`group`")
  expect_identical(as_widget(s, group = "g")$x$options$group, "g")
})

test_that("logical flags must be TRUE or FALSE", {
  s <- .val_scene()
  for (arg in c("toolbar", "navigator", "crosshair", "a11y")) {
    args <- list(s, NA)
    names(args) <- c("", arg)
    expect_error(do.call(as_widget, args), paste0("`", arg, "`"))
  }
  expect_error(as_widget(s, toolbar = "yes"), "`toolbar`")
  expect_error(tooltip_options(follow = NA), "`follow`")
  expect_error(tooltip_options(sticky = "yes"), "`sticky`")
})

test_that("choice arguments report the allowed values and the argument", {
  s <- .val_scene()
  expect_error(as_widget(s, hover_mode = "diagonal"), "`hover_mode`")
  expect_error(as_widget(s, legend_click = "vanish"), "`legend_click`")
  expect_error(as_widget(s, select_mode = "nope"), "multiple")
  expect_error(render_options(mode = c("svg", "raster")), "`mode`")
  expect_error(render_options(text = 1), "`text`")
})

test_that("numeric options are checked", {
  expect_error(navigator_options(height = 0), "`height`")
  expect_error(navigator_options(height = "tall"), "`height`")
  expect_error(export_options(scale = 0), "`scale`")
  expect_error(export_options(scale = NA), "`scale`")
})

test_that("string options are checked", {
  s <- .val_scene()
  expect_error(as_widget(s, alt = 1), "`alt`")
  expect_error(as_widget(s, alt = NA_character_), "`alt`")
  expect_error(export_options(filename = ""), "`filename`")
  expect_error(export_options(filename = c("a", "b")), "`filename`")
  expect_error(as_widget(s, elementId = 3), "`elementId`")
})

test_that("width and height take pixels or a CSS size string", {
  s <- .val_scene()
  expect_error(as_widget(s, width = -1), "`width`")
  expect_error(as_widget(s, height = TRUE), "`height`")
  expect_error(as_widget(s, width = c(100, 200)), "`width`")
  expect_identical(as_widget(s, width = "100%")$width, "100%")
  expect_identical(as_widget(s, height = 300)$height, 300)
})

test_that("tooltip_options(style) must be a named list of known fields", {
  s <- .val_scene()
  expect_error(tooltip_options(style = "red"), "named list")
  expect_error(tooltip_options(style = list("red")), "named list")
  expect_error(tooltip_options(style = list(bg = "red")), "unknown field")
  expect_error(
    tooltip_options(style = list(background = c("red", "blue"))),
    "background"
  )
  w <- as_widget(
    s,
    tooltip = tooltip_options(style = list(background = "red", fontsize = 14))
  )
  expect_identical(w$x$options$style$tipBg, "#ff0000")
  expect_identical(w$x$options$style$tipFontSize, "14")
})

test_that("errors are attributed to as_widget()", {
  s <- .val_scene()
  err <- tryCatch(as_widget(s, group = 1:3), error = identity)
  expect_identical(as.character(conditionCall(err)[[1]]), "as_widget")
})
