# as_widget() on a keyframe animation (vellumplot::animate()) embeds a
# self-contained animated SVG that plays on its own.

test_that("as_widget() embeds an animated SVG for a vellum_animation", {
  skip_if_not_installed("vellumplot")
  a <- vellumplot::vplot(mtcars) |>
    vellumplot::mark_point(x = wt, y = mpg, color = factor(cyl)) |>
    vellumplot::transition_states(cyl) |>
    vellumplot::animate(nframes = 12, fps = 12)

  expect_true(vellumwidget:::.is_animation(a))
  w <- as_widget(a)
  expect_s3_class(w, "vellumwidget")
  # the visual rides the ordinary svg field: vector markup, a CSS frame cycle,
  # and the reduced-motion fallback (all emitted by vellum)
  expect_match(w$x$svg, "<svg")
  expect_match(w$x$svg, "@keyframes")
  expect_match(w$x$svg, "prefers-reduced-motion")
  expect_true(isTRUE(w$x$options$animated))
})

test_that("an animation widget carries no interaction index (marks move each frame)", {
  skip_if_not_installed("vellumplot")
  a <- vellumplot::vplot(mtcars) |>
    vellumplot::mark_point(x = wt, y = mpg) |>
    vellumplot::transition_states(cyl) |>
    vellumplot::animate(nframes = 8)
  w <- as_widget(a)
  # no per-element geometry (positions change per frame) and the raster/canvas
  # path is off (the animated SVG is vector)
  expect_length(w$x$elements, 0L)
  expect_false(isTRUE(w$x$options$raster))
})

test_that(".is_animation() is false for an ordinary plot or scene", {
  skip_if_not_installed("vellumplot")
  p <- vellumplot::vplot(mtcars) |> vellumplot::mark_point(x = wt, y = mpg)
  expect_false(vellumwidget:::.is_animation(p))
  expect_false(vellumwidget:::.is_animation(vellum::as_vellum_scene(p)))
})

test_that("the animated SVG has the frame structure the playback controls read (VW-55)", {
  skip_if_not_installed("vellumplot")
  a <- vellumplot::vplot(data.frame(g = c("a", "b", "a", "b"), v = 1:4, t = c(1, 1, 2, 2))) |>
    vellumplot::mark_bar(x = g, y = v) |>
    vellumplot::transition_states(t) |>
    vellumplot::animate(nframes = 6)
  svg <- as_widget(a)$x$svg
  # srcts/features/anim.ts finds the frames by their `<prefix>-vf` class, the
  # still frame by `<prefix>-vs`, each frame's offset by its inline
  # animation-delay, and the loop length from the frame rule's animation.
  prefix <- regmatches(svg, regexpr("[A-Za-z0-9_]+(?=-vf\\b)", svg, perl = TRUE))
  expect_length(prefix, 1L)
  frames <- gregexpr(paste0('class="', prefix, '-vf[ "]'), svg)[[1]]
  expect_identical(length(frames), 6L)
  expect_match(svg, paste0('class="', prefix, "-vf ", prefix, '-vs"'))
  expect_identical(lengths(regmatches(svg, gregexpr("animation-delay:-[0-9.]+s", svg))), 6L)
  expect_match(
    svg,
    paste0("\\.", prefix, "-vf\\{[^}]*animation:", prefix, "-vc [0-9.]+s steps\\(1,end\\) infinite")
  )
})

test_that("a static widget's options carry no animated flag (VW-55)", {
  skip_if_not_installed("vellumplot")
  w <- as_widget(vellumplot::vplot(mtcars) |> vellumplot::mark_point(x = wt, y = mpg))
  expect_null(w$x$options$animated)
})

test_that("render_options(autoplay, loop) reach an animation widget (VW-61)", {
  skip_if_not_installed("vellumplot")
  a <- vellumplot::vplot(mtcars) |>
    vellumplot::mark_point(x = wt, y = mpg) |>
    vellumplot::transition_states(cyl) |>
    vellumplot::animate(nframes = 6)
  w <- as_widget(a)
  expect_true(w$x$options$autoplay)
  expect_true(w$x$options$loop)
  w2 <- as_widget(a, render = render_options(autoplay = FALSE, loop = FALSE))
  expect_false(w2$x$options$autoplay)
  expect_false(w2$x$options$loop)
  expect_error(render_options(loop = NA), "loop")
  expect_error(render_options(autoplay = "yes"), "autoplay")
  # A static plot's payload does not carry them.
  p <- vellumplot::vplot(mtcars) |> vellumplot::mark_point(x = wt, y = mpg)
  expect_null(as_widget(p)$x$options$autoplay)
})

test_that("an animation widget reserves a row below the plot for its controls (VW-60)", {
  skip_if_not_installed("vellumplot")
  a <- vellumplot::vplot(mtcars, width = 4, height = 3, dpi = 96) |>
    vellumplot::mark_point(x = wt, y = mpg) |>
    vellumplot::transition_states(cyl) |>
    vellumplot::animate(nframes = 6)
  w <- as_widget(a)
  dims <- vellumwidget:::.svg_dims(w$x$svg)
  expect_equal(w$height, dims$height + 30)
  expect_equal(w$sizingPolicy$defaultHeight, dims$height + 30)
  expect_equal(w$width, dims$width)
})
