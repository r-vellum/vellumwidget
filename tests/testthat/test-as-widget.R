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

test_that("axis_zoom defaults on and round-trips into the payload options", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  expect_true(as_widget(scene)$x$options$axisZoom)
  expect_false(as_widget(scene, axis_zoom = FALSE)$x$options$axisZoom)
})

test_that("the payload carries per-panel scale descriptors from vellumplot", {
  skip_if_not_installed("vellumplot")
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, model = rownames(mtcars))
  w <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = wt, y = mpg, data_id = model) |>
    as_widget()
  p <- w$x$panels
  expect_true(length(p) >= 1L)
  panel <- p[[1]]
  expect_equal(panel$name, "panel-1-1")
  # a true device-px rectangle
  expect_true(panel$px1 > panel$px0 && panel$py1 > panel$py0)
  # per-axis descriptor: continuous identity, data extent = wt/mpg range
  expect_equal(panel$x$type, "continuous")
  expect_equal(panel$x$transform, "identity")
  expect_equal(c(panel$x$data_lo, panel$x$data_hi), range(df$wt))
  expect_equal(c(panel$y$data_lo, panel$y$data_hi), range(df$mpg))
  # native domain is the 5%-expanded range (wider than the data)
  expect_true(panel$x$native_lo < min(df$wt) && panel$x$native_hi > max(df$wt))
})

test_that("data-space inversion round-trips a mark's pixel position back to its data value", {
  skip_if_not_installed("vellumplot")
  # Replicate the runtime's px -> data inversion (srcts/index.ts) in R, and assert
  # that a mark's device-px centre inverts back to its known data value — across
  # continuous / log10 / date / reverse / coord_flip / facets. This is the
  # end-to-end guard the identity-only JS unit tests can't provide.
  invertible <- c("identity", "log10", "sqrt", "reverse")
  ntd <- function(tr, nv) switch(tr, log10 = 10^nv, sqrt = nv^2, nv)
  px_x <- function(p, px) if (!p$x$transform %in% invertible) NA else
    ntd(p$x$transform, p$x$native_lo + (px - p$px0) / (p$px1 - p$px0) * (p$x$native_hi - p$x$native_lo))
  px_y <- function(p, py) if (!p$y$transform %in% invertible) NA else {
    frac <- (py - p$py0) / (p$py1 - p$py0)
    ntd(p$y$transform, p$y$native_hi + frac * (p$y$native_lo - p$y$native_hi))
  }
  panel_of <- function(w, nm) Filter(function(p) p$name == nm, w$x$panels)[[1]]
  ctr <- function(w, key) {
    e <- w$x$elements; i <- which(e$key == key)
    c(x = (e$x0[i] + e$x1[i]) / 2, y = (e$y0[i] + e$y1[i]) / 2)
  }
  roundtrips <- function(w, key, ex, ey, nm = "panel-1-1") {
    p <- panel_of(w, nm); c0 <- ctr(w, key)
    isTRUE(all.equal(unname(px_x(p, c0[["x"]])), ex, tolerance = 1e-2)) &&
      isTRUE(all.equal(unname(px_y(p, c0[["y"]])), ey, tolerance = 1e-2))
  }
  d <- data.frame(a = c(1, 10, 100, 1000), b = c(2, 4, 6, 8), id = letters[1:4])

  # continuous
  wc <- vellumplot::vplot(d) |> vellumplot::mark_point(x = a, y = b, data_id = id) |> as_widget()
  expect_true(roundtrips(wc, "c", 100, 6))
  # log10 x
  wl <- vellumplot::vplot(d) |> vellumplot::mark_point(x = a, y = b, data_id = id) |>
    vellumplot::scale_x_continuous(trans = "log10") |> as_widget()
  expect_true(roundtrips(wl, "c", 100, 6))
  # reverse x
  wr <- vellumplot::vplot(d) |> vellumplot::mark_point(x = a, y = b, data_id = id) |>
    vellumplot::scale_x_continuous(trans = "reverse") |> as_widget()
  expect_true(roundtrips(wr, "c", 100, 6))
  # date x (epoch days)
  dd <- data.frame(t = as.Date("2020-01-01") + c(0, 100, 200, 300), y = c(5, 6, 7, 8), id = letters[1:4])
  wd <- vellumplot::vplot(dd) |> vellumplot::mark_point(x = t, y = y, data_id = id) |> as_widget()
  expect_true(roundtrips(wd, "c", as.numeric(as.Date("2020-01-01") + 200), 7))
  # coord_flip: axes are the *visual* ones, so x recovers the (flipped) y aesthetic
  wf <- vellumplot::vplot(d) |> vellumplot::mark_point(x = a, y = b, data_id = id) |>
    vellumplot::coord_flip() |> as_widget()
  expect_true(roundtrips(wf, "c", 6, 100)) # horizontal shows b, vertical shows a
})

test_that("a custom (non-invertible) transform axis omits its data descriptor path", {
  skip_if_not_installed("vellumplot")
  skip_if_not_installed("scales")
  d <- data.frame(a = c(1, 2, 4, 8), b = 1:4, id = letters[1:4])
  w <- vellumplot::vplot(d) |> vellumplot::mark_point(x = a, y = b, data_id = id) |>
    vellumplot::scale_x_continuous(trans = scales::transform_log(2)) |> as_widget()
  # the panel is still emitted (finite rect), the x descriptor reports a name the
  # runtime declines ("log-2"); the widget guards this client-side (see JS tests).
  p <- w$x$panels[[1]]
  expect_false(p$x$transform %in% c("identity", "log10", "sqrt", "reverse"))
})

test_that("a continuous colour plot emits a colorbar descriptor + per-mark filter_value", {
  skip_if_not_installed("vellumplot")
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, hp = mtcars$hp, m = rownames(mtcars))
  w <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = wt, y = mpg, color = hp, data_id = m) |>
    as_widget()
  cb <- w$x$colorbar
  expect_false(is.null(cb))
  expect_equal(c(cb$lo, cb$hi), range(df$hp))
  expect_true(cb$orientation %in% c("v", "h"))
  expect_true(cb$x1 > cb$x0 && cb$y1 > cb$y0) # a real device-px rect
  # per-mark value carried for the runtime to range-test
  expect_true("filter_value" %in% names(w$x$elements))
  i <- which(w$x$elements$key == "Mazda RX4")
  expect_equal(w$x$elements$filter_value[i], df$hp[df$m == "Mazda RX4"])
})

test_that("a plot with no continuous colour scale emits no colorbar", {
  skip_if_not_installed("vellumplot")
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, m = rownames(mtcars))
  w <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = wt, y = mpg, data_id = m) |>
    as_widget()
  expect_null(w$x$colorbar)
  expect_false("filter_value" %in% names(w$x$elements))
})

test_that("a raw vellum scene (no scales meta) yields no panels payload", {
  scene <- vellum::vl_scene(2, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  expect_null(as_widget(scene)$x$panels)
})

test_that("lasso toggle round-trips into the payload (default on)", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  expect_true(as_widget(scene)$x$options$lasso) # default TRUE
  expect_false(as_widget(scene, lasso = FALSE)$x$options$lasso)
})

test_that("tooltip behavior options round-trip", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  o <- as_widget(scene)$x$options
  expect_equal(o$tooltipDelay, 0) # defaults
  expect_true(o$tooltipFollow)
  expect_false(o$tooltipSticky)
  o2 <- as_widget(scene, tooltip_delay = 250, tooltip_follow = FALSE, tooltip_sticky = TRUE)$x$options
  expect_equal(o2$tooltipDelay, 250)
  expect_false(o2$tooltipFollow)
  expect_true(o2$tooltipSticky)
})

test_that("navigator options round-trip (default off)", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  expect_false(as_widget(scene)$x$options$navigator) # default FALSE
  o <- as_widget(scene, navigator = TRUE, navigator_height = 80)$x$options
  expect_true(o$navigator)
  expect_equal(o$navigatorHeight, 80)
})

test_that("hover_mode and crosshair are validated and round-trip into the payload", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  o <- as_widget(scene)$x$options
  expect_equal(o$hoverMode, "closest") # default
  expect_false(o$crosshair)
  o2 <- as_widget(scene, hover_mode = "x", crosshair = TRUE)$x$options
  expect_equal(o2$hoverMode, "x")
  expect_true(o2$crosshair)
  expect_equal(as_widget(scene, hover_mode = "y")$x$options$hoverMode, "y")
  expect_error(as_widget(scene, hover_mode = "diagonal"))
})

test_that("legend_click is validated and round-trips into the payload", {
  scene <- vellum::vl_scene(1, 1, dpi = 100) |>
    vellum::draw(vellum::points_grob(0.5, 0.5, gp = vellum::vl_gpar(fill = "red"), key = "a"))
  expect_equal(as_widget(scene)$x$options$legendClick, "select") # default
  expect_equal(as_widget(scene, legend_click = "hide")$x$options$legendClick, "hide")
  expect_equal(as_widget(scene, legend_click = "mute")$x$options$legendClick, "mute")
  expect_error(as_widget(scene, legend_click = "vanish"))
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

test_that("mode = 'raster' ships a base image with the element index (no per-element SVG)", {
  scene <- vellum::vl_scene(2, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(
      c(0.25, 0.75), 0.5, size = vellum::vl_unit(4, "mm"),
      gp = vellum::vl_gpar(fill = "red"), key = c("a", "b"),
      meta = list(list(tooltip = "Alpha"), list(tooltip = "Beta"))
    ))
  w <- as_widget(scene, mode = "raster")
  expect_true(w$x$options$raster)
  expect_match(w$x$svg, "<image", fixed = TRUE)
  expect_match(w$x$svg, "data:image/png;base64,", fixed = TRUE)
  expect_no_match(w$x$svg, "data-key")
  # the interaction index still ships (columnar), with geometry + tooltips
  expect_setequal(w$x$elements$key, c("a", "b"))
  expect_true(all(c("x0", "y0", "x1", "y1") %in% names(w$x$elements)))
  expect_equal(w$x$elements$tooltip[match("a", w$x$elements$key)], "Alpha")
  # widget sized from the rendered raster
  expect_true(is.numeric(w$width) && w$width > 0)
})

test_that("mode = 'auto' switches to raster above raster_threshold, stays SVG below", {
  scene <- vellum::vl_scene(2, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(c(0.25, 0.75), 0.5, key = c("a", "b")))
  # 2 keyed elements: default threshold keeps SVG
  expect_false(as_widget(scene)$x$options$raster)
  expect_match(as_widget(scene)$x$svg, 'data-key="a"', fixed = TRUE)
  # a low threshold flips auto to raster
  expect_true(as_widget(scene, raster_threshold = 1)$x$options$raster)
  # mode = 'svg' overrides the threshold
  expect_false(as_widget(scene, mode = "svg", raster_threshold = 1)$x$options$raster)
})

test_that("raster shell carries the scene title/description for accessibility", {
  scene <- vellum::vl_scene(2, 2, dpi = 100, title = "My cloud", desc = "A big scatter.") |>
    vellum::draw(vellum::points_grob(c(0.25, 0.75), 0.5, key = c("a", "b")))
  svg <- as_widget(scene, mode = "raster")$x$svg
  expect_match(svg, "<title id=\"vw-t\">My cloud</title>", fixed = TRUE)
  expect_match(svg, "<desc id=\"vw-d\">A big scatter.</desc>", fixed = TRUE)
  expect_match(svg, "role=\"img\"", fixed = TRUE)
})

test_that("text = 'native' (default) emits selectable <text>; 'outline' emits glyph paths", {
  scene <- vellum::vl_scene(3, 2, dpi = 96, bg = "white") |>
    vellum::draw(vellum::text_grob(
      "Hello widget", x = 0.5, y = 0.5,
      gp = vellum::vl_gpar(fontsize = 20, col = "black")
    ))
  # default is native: selectable text, no glyph outlines
  svg_default <- as_widget(scene)$x$svg
  expect_match(svg_default, "<text", fixed = TRUE)
  # explicit outline: glyph paths, no <text>
  svg_outline <- as_widget(scene, text = "outline")$x$svg
  expect_match(svg_outline, "<path", fixed = TRUE)
  expect_no_match(svg_outline, "<text")
})

test_that("text is ignored (with a warning) in raster mode", {
  scene <- vellum::vl_scene(2, 2, dpi = 100) |>
    vellum::draw(vellum::points_grob(c(0.25, 0.75), 0.5, key = c("a", "b")))
  expect_warning(
    as_widget(scene, mode = "raster", text = "outline"),
    "ignored in raster mode"
  )
  # not passing `text` explicitly stays quiet
  expect_no_warning(as_widget(scene, mode = "raster"))
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
