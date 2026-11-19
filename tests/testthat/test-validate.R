# as_widget() argument validation (VW-6): every argument is checked up front and
# a bad value fails with a cli error naming the argument, instead of crashing
# deep inside the build or shipping NA / arrays to the runtime.

.val_scene <- function() {
  vellum::vl_scene(2, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, key = "a"))
}

test_that("raster_threshold = NA is a clear error, not an if() crash", {
  s <- .val_scene()
  expect_error(as_widget(s, raster_threshold = NA), "`raster_threshold`")
  expect_error(as_widget(s, raster_threshold = -1), "at least 0")
  expect_error(as_widget(s, raster_threshold = c(1, 2)), "single finite number")
})

test_that("tooltip_delay must be a non-negative number", {
  s <- .val_scene()
  expect_error(as_widget(s, tooltip_delay = "abc"), "`tooltip_delay`")
  expect_error(as_widget(s, tooltip_delay = -5), "`tooltip_delay`")
  expect_error(as_widget(s, tooltip_delay = NA_real_), "`tooltip_delay`")
  expect_identical(
    as_widget(s, tooltip_delay = 250L)$x$options$tooltipDelay,
    250
  )
  expect_identical(as_widget(s, tooltip_delay = NULL)$x$options$tooltipDelay, 0)
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
  for (arg in c(
    "toolbar",
    "navigator",
    "crosshair",
    "a11y",
    "tooltip_follow",
    "tooltip_sticky"
  )) {
    args <- list(s, NA)
    names(args) <- c("", arg)
    expect_error(do.call(as_widget, args), paste0("`", arg, "`"))
    args[[2]] <- "yes"
    expect_error(do.call(as_widget, args), paste0("`", arg, "`"))
  }
})

test_that("choice arguments report the allowed values and the argument", {
  s <- .val_scene()
  expect_error(as_widget(s, hover_mode = "diagonal"), "`hover_mode`")
  expect_error(as_widget(s, legend_click = "vanish"), "`legend_click`")
  expect_error(as_widget(s, select_mode = "nope"), "multiple")
  expect_error(as_widget(s, mode = c("svg", "raster")), "`mode`")
  expect_error(as_widget(s, text = 1), "`text`")
})

test_that("numeric options are checked", {
  s <- .val_scene()
  expect_error(as_widget(s, navigator_height = 0), "`navigator_height`")
  expect_error(as_widget(s, navigator_height = "tall"), "`navigator_height`")
  expect_error(as_widget(s, export_scale = 0), "`export_scale`")
  expect_error(as_widget(s, export_scale = NA), "`export_scale`")
})

test_that("string options are checked", {
  s <- .val_scene()
  expect_error(as_widget(s, alt = 1), "`alt`")
  expect_error(as_widget(s, alt = NA_character_), "`alt`")
  expect_error(as_widget(s, export_filename = ""), "`export_filename`")
  expect_error(as_widget(s, export_filename = c("a", "b")), "`export_filename`")
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

test_that("tooltip_style must be a named list of known fields", {
  s <- .val_scene()
  expect_error(as_widget(s, tooltip_style = "red"), "named list")
  expect_error(as_widget(s, tooltip_style = list("red")), "named list")
  expect_error(
    as_widget(s, tooltip_style = list(bg = "red")),
    "unknown field"
  )
  expect_error(
    as_widget(s, tooltip_style = list(background = c("red", "blue"))),
    "background"
  )
  w <- as_widget(s, tooltip_style = list(background = "red", fontsize = 14))
  expect_identical(w$x$options$style$tipBg, "#ff0000")
  expect_identical(w$x$options$style$tipFontSize, "14")
})

test_that("errors are attributed to as_widget()", {
  s <- .val_scene()
  err <- tryCatch(as_widget(s, group = 1:3), error = identity)
  expect_identical(as.character(conditionCall(err)[[1]]), "as_widget")
})
