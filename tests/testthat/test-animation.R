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
