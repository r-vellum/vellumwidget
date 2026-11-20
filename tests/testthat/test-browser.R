# Real-browser checks (headless Chrome through chromote). They catch what jsdom
# cannot: paint order and layout. Local only -- skipped on CRAN, on CI, and
# wherever chromote or a Chrome binary is missing.

skip_browser <- function() {
  skip_on_cran()
  skip_on_ci()
  skip_if_not_installed("chromote")
  skip_if_not_installed("png")
  skip_if_not_installed("vellumplot")
  chrome <- tryCatch(chromote::find_chrome(), error = function(e) NULL)
  skip_if(is.null(chrome) || !nzchar(chrome), "Chrome not found")
}

open_widget <- function(w) {
  dir <- withr::local_tempdir(.local_envir = parent.frame())
  path <- file.path(dir, "w.html")
  htmlwidgets::saveWidget(w, path, selfcontained = FALSE, libdir = "lib")
  b <- chromote::ChromoteSession$new(width = 900, height = 700)
  withr::defer(b$close(), envir = parent.frame())
  loaded <- b$Page$loadEventFired(wait_ = FALSE)
  b$Page$navigate(paste0("file://", normalizePath(path)), wait_ = FALSE)
  b$wait_for(loaded)
  Sys.sleep(0.5)
  b
}

panel_rect <- function(b, i = 1) {
  js <- sprintf(
    "(function(){var r=document.querySelectorAll('[data-vellum-panel] > [data-vellum-pan]')[%d]
      .parentNode.getBoundingClientRect();return [r.left,r.top,r.width,r.height].join(',')})()",
    i - 1
  )
  as.numeric(strsplit(b$Runtime$evaluate(js)$result$value, ",")[[1]])
}

wheel_in <- function(b, r, n = 4) {
  for (k in seq_len(n)) {
    b$Input$dispatchMouseEvent(
      type = "mouseWheel", x = r[1] + r[3] * 0.4, y = r[2] + r[4] * 0.5,
      deltaX = 0, deltaY = -120
    )
    Sys.sleep(0.1)
  }
  Sys.sleep(0.5)
}

# Share of pixels in the panel (inset 3px from its edges) clearly lighter than
# theme_grey's #ebebeb panel background.
white_share <- function(b, r) {
  shot <- b$Page$captureScreenshot(
    format = "png",
    clip = list(x = r[1] + 3, y = r[2] + 3, width = r[3] - 6, height = r[4] - 6, scale = 1)
  )
  img <- png::readPNG(jsonlite::base64_dec(shot$data))
  mean(img[, , 1] > 0.95 & img[, , 2] > 0.95 & img[, , 3] > 0.95)
}

test_that("VW-17: zoomed re-ticked gridlines paint over the panel background", {
  skip_browser()
  df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, model = rownames(mtcars))
  w <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = wt, y = mpg, data_id = model) |>
    as_widget()
  b <- open_widget(w)
  r <- panel_rect(b)
  wheel_in(b, r)
  # theme_grey: white gridlines on a grey background, so a zoomed panel with no
  # visible white is one whose re-ticked grid sits under the background.
  expect_gt(white_share(b, r), 0.002)
  state <- b$Runtime$evaluate("(function(){
    var pan = document.querySelector('[data-vellum-pan]'), outer = pan.parentNode;
    var order = [].map.call(outer.children, function (c) {
      return c.hasAttribute('data-vellum-pan') ? 'pan' :
        c.hasAttribute('data-vw-panel-bg') ? 'bg' : (c.getAttribute('class') || c.tagName);
    }).join(',');
    var ticks = [].filter.call(pan.querySelectorAll('g[role=presentation]:not([data-vellum-id])'),
      function (g) { return getComputedStyle(g).display !== 'none'; }).length;
    var redrawn = outer.querySelectorAll('.vellumwidget-retick-tick').length;
    return order + '|' + ticks + '|' + redrawn; })()")$result$value
  parts <- strsplit(state, "|", fixed = TRUE)[[1]]
  expect_identical(parts[1], "bg,vellumwidget-retick-grid,pan")
  expect_identical(parts[2], "0") # no static tick mark left in the pan group
  expect_gt(as.integer(parts[3]), 0) # re-drawn at the new breaks
})

test_that("VW-13: a raster widget decodes the compact index (click selects a point)", {
  skip_browser()
  set.seed(1)
  n <- 25000L
  df <- data.frame(x = rnorm(n), y = rnorm(n), g = sample(letters[1:4], n, TRUE), id = seq_len(n))
  w <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = x, y = y, color = g, data_id = id) |>
    as_widget()
  el <- w$x$elements
  expect_true(w$x$options$raster)
  expect_identical(el$mark$levels, "point")
  # the right-most data point (not a legend swatch): isolated, so a click on its centre picks it alone
  i <- which.max(ifelse(startsWith(el$key, "legend:"), -Inf, el$x1))
  cx <- (el$x0[i] + el$x1[i]) / 2
  cy <- (el$y0[i] + el$y1[i]) / 2
  b <- open_widget(w)
  xy <- b$Runtime$evaluate(sprintf("(function(){
    var s = document.querySelector('.vellumwidget svg'), p = s.createSVGPoint();
    p.x = %f; p.y = %f; var q = p.matrixTransform(s.getScreenCTM());
    return q.x + ',' + q.y; })()", cx, cy))$result$value
  xy <- as.numeric(strsplit(xy, ",")[[1]])
  for (type in c("mouseMoved", "mousePressed", "mouseReleased")) {
    b$Input$dispatchMouseEvent(
      type = type, x = xy[1], y = xy[2], button = "left", clickCount = 1
    )
    Sys.sleep(0.1)
  }
  Sys.sleep(0.3)
  rings <- b$Runtime$evaluate(
    "document.querySelectorAll('.vellumwidget-fb-sel').length"
  )$result$value
  expect_identical(rings, 1L)
})

test_that("VW-14: a split-render raster widget zooms by axis and re-ticks", {
  skip_browser()
  skip_if_not(.split_render_supported(), "vellum without the split render")
  set.seed(1)
  n <- 25000L
  df <- data.frame(x = rnorm(n), y = rnorm(n), g = sample(letters[1:4], n, TRUE), id = seq_len(n))
  w <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = x, y = y, color = g, data_id = id) |>
    as_widget()
  expect_true(w$x$options$raster)
  b <- open_widget(w)
  r <- panel_rect(b)
  ev <- function(js) b$Runtime$evaluate(js)$result$value
  expect_identical(ev("document.querySelectorAll('[data-vellum-pan] use.vellumwidget-marks').length"), 1L)
  wheel_in(b, r)
  # the pan group carries the zoom; the frame (viewBox) and the axes stay SVG
  sx <- ev("parseFloat(/matrix\\(([-\\d.eE]+)/.exec(document.querySelector('[data-vellum-pan]').getAttribute('transform'))[1])")
  expect_gt(sx, 1.2)
  expect_gt(ev("document.querySelectorAll('.vellumwidget-retick-layer text').length"), 2L)
  # the crisp canvas redraws the points, and the scaled mark image is hidden
  expect_identical(ev("getComputedStyle(document.querySelector('.vellumwidget-canvas')).display"), "block")
  expect_true(ev("!!document.querySelector('svg.vellumwidget-marks-off')"))
  # theme_grey: re-ticked white gridlines show through
  expect_gt(white_share(b, r), 0.0005)
})
