# R-13: the grouped option helpers and the soft-deprecated flat arguments.

.opt_scene <- function() {
  vellum::vl_scene(2, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, key = "a"))
}

test_that("option helpers return classed objects with the defaults", {
  t <- tooltip_options()
  expect_s3_class(t, "vellumwidget_tooltip_options")
  expect_identical(t$delay, 0)
  expect_true(t$follow)
  expect_false(t$sticky)
  expect_null(t$style)
  e <- export_options()
  expect_identical(e$filename, "plot")
  expect_identical(e$scale, 1)
  expect_identical(navigator_options()$height, 56)
  r <- render_options()
  expect_identical(r$mode, "auto")
  expect_identical(r$raster_threshold, 20000)
  expect_identical(r$text, "native")
  expect_false(r$text_set)
  expect_true(render_options(text = "native")$text_set)
  expect_identical(r$precision, "compact")
  expect_identical(render_options(precision = "f32")$precision, "f32")
  expect_error(render_options(precision = "u16"), "precision")
})

test_that("option helpers print", {
  expect_output(print(tooltip_options(delay = 5)), "<tooltip_options>")
  expect_output(print(render_options()), "mode: auto")
  expect_output(
    print(tooltip_options(style = list(background = "red"))),
    "background = red"
  )
})

test_that("the option arguments only take their helper's object", {
  s <- .opt_scene()
  expect_error(
    as_widget(s, tooltip = list(delay = 1)),
    "must be built with `tooltip_options\\(\\)`"
  )
  expect_error(as_widget(s, export = "x"), "export_options")
  expect_error(as_widget(s, render = tooltip_options()), "render_options")
  expect_error(as_widget(s, navigator = 80), "navigator_options")
  # NULL is the defaults
  w <- as_widget(s, tooltip = NULL, export = NULL, render = NULL)
  expect_identical(w$x$options$tooltipDelay, 0)
  expect_identical(w$x$options$export$filename, "plot")
})

test_that("navigator takes TRUE/FALSE or navigator_options()", {
  s <- .opt_scene()
  o <- as_widget(s)$x$options
  expect_false(o$navigator)
  expect_null(o$navigatorHeight)
  o <- as_widget(s, navigator = TRUE)$x$options
  expect_true(o$navigator)
  expect_identical(o$navigatorHeight, 56)
  o <- as_widget(s, navigator = navigator_options(height = 90))$x$options
  expect_true(o$navigator)
  expect_identical(o$navigatorHeight, 90)
})

test_that("old flat arguments still work, with a deprecation warning", {
  s <- .opt_scene()
  withr::local_options(lifecycle_verbosity = "warning")
  expect_warning(
    w <- as_widget(s, tooltip_delay = 250, tooltip_follow = FALSE),
    class = "lifecycle_warning_deprecated"
  )
  expect_identical(w$x$options$tooltipDelay, 250)
  expect_false(w$x$options$tooltipFollow)

  expect_warning(
    w <- as_widget(
      s,
      tooltip_sticky = TRUE,
      tooltip_style = list(color = "red")
    ),
    "tooltip_options"
  )
  expect_true(w$x$options$tooltipSticky)
  expect_identical(w$x$options$style$tipFg, "#ff0000")

  expect_warning(
    w <- as_widget(s, export_filename = "f", export_scale = 3),
    "export = export_options\\(scale = \\)"
  )
  expect_identical(w$x$options$export, list(filename = "f", scale = 3))

  expect_warning(
    w <- as_widget(s, mode = "raster", raster_threshold = 5),
    "render_options"
  )
  expect_true(w$x$options$raster)

  # navigator = TRUE combines with the old navigator_height, as it always did
  expect_warning(
    w <- as_widget(s, navigator = TRUE, navigator_height = 80),
    "navigator_options"
  )
  expect_true(w$x$options$navigator)
  expect_identical(w$x$options$navigatorHeight, 80)
  # ... and navigator = FALSE still ignores it
  expect_warning(w <- as_widget(s, navigator_height = 80))
  expect_false(w$x$options$navigator)

  # the old `text` still warns in raster mode when set explicitly
  local_single_raster()
  expect_warning(
    expect_warning(
      as_widget(s, mode = "raster", text = "outline"),
      class = "lifecycle_warning_deprecated"
    ),
    "ignored in raster mode"
  )
  # NULL meant "the default" for the old arguments
  expect_warning(w <- as_widget(s, tooltip_delay = NULL, export_scale = NULL))
  expect_identical(w$x$options$tooltipDelay, 0)
  expect_identical(w$x$options$export$scale, 1)
})

test_that("the deprecation warning fires once per session by default", {
  s <- .opt_scene()
  withr::local_options(lifecycle_verbosity = NULL)
  env <- .deprecation_env
  rm(list = ls(env), envir = env)
  withr::defer(rm(list = ls(env), envir = env))
  expect_warning(as_widget(s, tooltip_delay = 1), "once per session")
  expect_no_warning(as_widget(s, tooltip_delay = 1))
  # a different old argument still warns the first time
  expect_warning(as_widget(s, export_scale = 2), "export_scale")
  withr::local_options(lifecycle_verbosity = "quiet")
  expect_no_warning(as_widget(s, tooltip_follow = FALSE))
})

test_that("an option object and its own old flat arguments do not mix", {
  s <- .opt_scene()
  withr::local_options(lifecycle_verbosity = "quiet")
  expect_error(
    as_widget(s, tooltip = tooltip_options(), tooltip_delay = 5),
    "not both"
  )
  expect_error(
    as_widget(s, navigator = navigator_options(), navigator_height = 5),
    "not both"
  )
  # other groups are independent
  w <- as_widget(s, tooltip = tooltip_options(delay = 5), export_scale = 2)
  expect_identical(w$x$options$tooltipDelay, 5)
  expect_identical(w$x$options$export$scale, 2)
})

test_that("unknown or unnamed extra arguments are errors", {
  s <- .opt_scene()
  expect_error(as_widget(s, tooltip_dely = 5), "no argument `tooltip_dely`")
  expect_error(
    as_widget(
      s,
      NULL,
      NULL,
      TRUE,
      FALSE,
      "closest",
      FALSE,
      "select",
      TRUE,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      "multiple",
      NULL,
      NULL,
      3
    ),
    "must be named"
  )
})
