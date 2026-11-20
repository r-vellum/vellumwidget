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
  p <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = x, y = y, color = g, data_id = id)
  w <- as_widget(p)
  expect_true(w$x$options$raster)
  expect_identical(w$x$elements$mark$levels, "point")
  # the right-most data point (not a legend swatch): isolated, so a click on
  # its centre picks it alone (positions from the scene: with a display list
  # the payload carries no bbox for it)
  el <- vellum::scene_model(vellum::as_vellum_scene(p))$elements
  el <- el[!is.na(el$key), ]
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

test_that("VW-15: the zoomed canvas draws each mark's own colour from the display list", {
  skip_browser()
  skip_if_not(.split_render_supported() && .display_list_supported(), "vellum without the display list")
  set.seed(4)
  n <- 400L
  df <- data.frame(x = runif(n), y = runif(n), g = sample(letters[1:4], n, TRUE), id = seq_len(n))
  p <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = x, y = y, color = g, shape = g, data_id = id, size = 4)
  # (detail tier off: this checks the canvas, which ~40 marks in view would replace)
  w <- as_widget(p, render = render_options(mode = "raster", detail_marks = 0), elementId = "w1")
  expect_false(is.null(w$x$displayList))
  b <- open_widget(w)
  ev <- function(js) b$Runtime$evaluate(js)$result$value
  pn <- w$x$panels[[1]]
  ev(sprintf(
    "HTMLWidgets.find('#w1')._test.setView({x:%f,y:%f,w:%f,h:%f})",
    pn$px0 + 0.3 * (pn$px1 - pn$px0), pn$py0 + 0.3 * (pn$py1 - pn$py0),
    0.3 * (pn$px1 - pn$px0), 0.3 * (pn$py1 - pn$py0)
  ))
  Sys.sleep(0.3)
  expect_identical(ev("getComputedStyle(document.querySelector('.vellumwidget-canvas')).display"), "block")
  # every drawn mark's centre pixel on the canvas is one of the plot's paints,
  # not a colour read back from the (blurred) image
  px <- ev("(function(){
    var c = document.querySelector('.vellumwidget-canvas'), x = c.getContext('2d');
    var d = x.getImageData(0, 0, c.width, c.height).data, seen = {};
    for (var i = 0; i < d.length; i += 4 * 97) if (d[i + 3] === 255) seen[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] = (seen[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] || 0) + 1;
    return JSON.stringify(seen); })()")
  seen <- jsonlite::fromJSON(px)
  pal <- vapply(w$x$displayList$paints$fill, function(h) {
    paste(strtoi(substring(h, c(2, 4, 6), c(3, 5, 7)), 16L), collapse = ",")
  }, "")
  top <- names(sort(unlist(seen), decreasing = TRUE))[1:4]
  expect_true(all(top %in% pal))
  expect_true(ev("!!document.querySelector('svg.vellumwidget-marks-off')"))
})

test_that("VW-15: with many marks in view the exact redraw waits for the zoom to settle", {
  skip_browser()
  skip_if_not(.split_render_supported() && .display_list_supported(), "vellum without the display list")
  set.seed(5)
  n <- 80000L
  df <- data.frame(x = runif(n), y = runif(n), id = seq_len(n))
  w <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = x, y = y, data_id = id) |>
    as_widget(elementId = "w1")
  b <- open_widget(w)
  ev <- function(js) b$Runtime$evaluate(js)$result$value
  pn <- w$x$panels[[1]]
  # a shallow zoom keeps ~70k marks in view: the image stands in at first ...
  st <- ev(sprintf(
    "(function(){ HTMLWidgets.find('#w1')._test.setView({x:%f,y:%f,w:%f,h:%f});
      return getComputedStyle(document.querySelector('.vellumwidget-canvas')).display; })()",
    pn$px0 + 0.05 * (pn$px1 - pn$px0), pn$py0 + 0.05 * (pn$py1 - pn$py0),
    0.9 * (pn$px1 - pn$px0), 0.9 * (pn$py1 - pn$py0)
  ))
  expect_identical(st, "none")
  # ... and the exact canvas replaces it once the view settles
  Sys.sleep(0.6)
  expect_identical(ev("getComputedStyle(document.querySelector('.vellumwidget-canvas')).display"), "block")
  expect_true(ev("!!document.querySelector('svg.vellumwidget-marks-off')"))
})

test_that("VW-16: zooming in far enough materialises keyed SVG nodes (detail tier)", {
  skip_browser()
  skip_if_not(.split_render_supported() && .display_list_supported(), "vellum without the display list")
  set.seed(6)
  n <- 25000L
  df <- data.frame(x = runif(n), y = runif(n), g = sample(letters[1:4], n, TRUE), id = seq_len(n))
  p <- vellumplot::vplot(df) |>
    vellumplot::mark_point(
      x = x, y = y, data_id = id,
      color = vellumplot::condition("pick", g, "grey80")
    ) |>
    vellumplot::select_point("pick", on = "click")
  w <- as_widget(p, elementId = "w1")
  expect_true(w$x$options$raster)
  b <- open_widget(w)
  ev <- function(js) b$Runtime$evaluate(js)$result$value
  pn <- w$x$panels[[1]]
  view <- function(f) {
    ev(sprintf(
      "HTMLWidgets.find('#w1')._test.setView({x:%f,y:%f,w:%f,h:%f})",
      pn$px0 + (0.5 - f / 2) * (pn$px1 - pn$px0), pn$py0 + (0.5 - f / 2) * (pn$py1 - pn$py0),
      f * (pn$px1 - pn$px0), f * (pn$py1 - pn$py0)
    ))
    Sys.sleep(0.5) # past the settle delay
  }
  tier <- function() ev("HTMLWidgets.find('#w1')._test.markTier()")
  nodes <- function() ev("document.querySelectorAll('.vellumwidget-detail [data-key]').length")
  view(0.5)
  expect_identical(tier(), "mid")
  expect_identical(nodes(), 0L)
  view(0.25) # ~1560 of 25k uniform points in view
  expect_identical(tier(), "detail")
  expect_gt(nodes(), 1000L)
  expect_lt(nodes(), 3000L)
  expect_identical(ev("getComputedStyle(document.querySelector('.vellumwidget-canvas')).display"), "none")
  # click a node: it is selected by class, and the condition greys the rest
  ev("(function(){var n=document.querySelector('.vellumwidget-detail [data-key]'), r=n.getBoundingClientRect(); window.__xy=[r.left+r.width/2, r.top+r.height/2]; return 1})()")
  xy <- as.numeric(strsplit(ev("window.__xy.join(',')"), ",")[[1]])
  for (type in c("mouseMoved", "mousePressed", "mouseReleased")) {
    b$Input$dispatchMouseEvent(type = type, x = xy[1], y = xy[2], button = "left", clickCount = 1)
    Sys.sleep(0.1)
  }
  Sys.sleep(0.3)
  expect_identical(ev("document.querySelectorAll('.vellumwidget-detail .vellumwidget-selected').length"), 1L)
  expect_gt(ev("[].filter.call(document.querySelectorAll('.vellumwidget-detail [data-key]'), function(n){ return !!n.style.fill; }).length"), 1000L)
  # keyboard focus: the nodes are focusable marks
  expect_gt(ev("document.querySelectorAll('.vellumwidget-detail [tabindex]').length"), 1000L)
  # back out: the nodes go and the selection is a ring again
  view(0.6)
  expect_identical(tier(), "mid")
  expect_identical(nodes(), 0L)
  expect_identical(ev("document.querySelectorAll('.vellumwidget-fb-sel').length"), 1L)
})

test_that("VW-22: a condition and filter_by() show in the overview and mid tiers", {
  skip_browser()
  skip_if_not(.split_render_supported() && .display_list_supported(), "vellum without the display list")
  set.seed(6)
  n <- 25000L
  df <- data.frame(x = runif(n), y = runif(n), g = sample(letters[1:4], n, TRUE), id = seq_len(n))
  members <- jsonlite::toJSON(as.character(df$id[df$x < 0.33]))
  # The canvas's opaque pixel colours, most frequent first.
  canvas_colours <- function(ev) {
    seen <- jsonlite::fromJSON(ev("(function(){
      var c = document.querySelector('.vellumwidget-canvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, seen = {};
      for (var i = 0; i < d.length; i += 4 * 13) if (d[i + 3] === 255) { var k = d[i] + ',' + d[i + 1] + ',' + d[i + 2]; seen[k] = (seen[k] || 0) + 1; }
      return JSON.stringify(seen); })()"))
    names(sort(unlist(seen), decreasing = TRUE))
  }
  shown <- function(ev) ev("getComputedStyle(document.querySelector('.vellumwidget-canvas')).display")

  p <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = x, y = y, data_id = id, color = vellumplot::condition("pick", g, "grey80")) |>
    vellumplot::select_point("pick", on = "click")
  w <- as_widget(p, elementId = "w1")
  b <- open_widget(w)
  ev <- function(js) b$Runtime$evaluate(js)$result$value
  expect_identical(shown(ev), "none")
  ev(sprintf("HTMLWidgets.find('#w1')._call('select', %s)", members))
  Sys.sleep(0.3)
  # overview: the canvas replaces the image, two thirds of the marks are grey80
  expect_identical(ev("HTMLWidgets.find('#w1')._test.markTier()"), "overview")
  expect_identical(shown(ev), "block")
  expect_true(ev("!!document.querySelector('svg.vellumwidget-marks-off')"))
  top <- canvas_colours(ev)
  expect_identical(top[1], "204,204,204")
  pal <- vapply(w$x$displayList$paints$fill, function(h) {
    paste(strtoi(substring(h, c(2, 4, 6), c(3, 5, 7)), 16L), collapse = ",")
  }, "")
  expect_true(any(top[2:4] %in% pal)) # the members keep their own colour
  # mid: still grey
  pn <- w$x$panels[[1]]
  ev(sprintf(
    "HTMLWidgets.find('#w1')._test.setView({x:%f,y:%f,w:%f,h:%f})",
    pn$px0 + 0.25 * (pn$px1 - pn$px0), pn$py0 + 0.25 * (pn$py1 - pn$py0),
    0.5 * (pn$px1 - pn$px0), 0.5 * (pn$py1 - pn$py0)
  ))
  Sys.sleep(0.5)
  expect_identical(ev("HTMLWidgets.find('#w1')._test.markTier()"), "mid")
  expect_identical(canvas_colours(ev)[1], "204,204,204")
  # clearing the selection: back to the image at the overview
  ev("HTMLWidgets.find('#w1')._call('resetZoom')")
  ev("HTMLWidgets.find('#w1')._call('clearSelection')")
  Sys.sleep(0.5)
  expect_identical(shown(ev), "none")
  b$close()

  # filter_by(): the filtered-out right two thirds leave the overview canvas
  w2 <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = x, y = y, data_id = id, color = g) |>
    vellumplot::select_point("pick", on = "click") |>
    vellumplot::filter_by("pick") |>
    as_widget(elementId = "w1")
  b2 <- open_widget(w2)
  ev2 <- function(js) b2$Runtime$evaluate(js)$result$value
  ev2(sprintf("HTMLWidgets.find('#w1')._call('select', %s)", members))
  Sys.sleep(0.3)
  expect_identical(shown(ev2), "block")
  inked <- function(from, to) ev2(sprintf("(function(){
    var c = document.querySelector('.vellumwidget-canvas'), s = document.querySelector('.vellumwidget svg');
    var v = s.viewBox.baseVal, k = c.width / v.width, x0 = Math.round(k * (%f - v.x)), x1 = Math.round(k * (%f - v.x));
    var d = c.getContext('2d').getImageData(x0, 0, x1 - x0, c.height).data, n = 0;
    for (var i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n; })()", from, to))
  right <- inked(pn$px0 + 0.5 * (pn$px1 - pn$px0), pn$px1 - 4)
  expect_gt(inked(pn$px0 + 4, pn$px0 + 0.3 * (pn$px1 - pn$px0)), 1000L)
  expect_identical(right, 0L)
})

test_that("VW-21: a reference line added after the points is drawn over them", {
  skip_browser()
  skip_if_not(.paint_order_supported(), "vellum without the paint-order split")
  set.seed(7)
  n <- 25000L
  df <- data.frame(x = runif(n), y = runif(n), g = sample(letters[1:4], n, TRUE), id = seq_len(n))
  w <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = x, y = y, color = g, data_id = id) |>
    vellumplot::mark_rule(yintercept = 0.5, color = "red", linewidth = 2) |>
    as_widget(elementId = "w1")
  expect_true(w$x$options$raster)
  b <- open_widget(w)
  ev <- function(js) b$Runtime$evaluate(js)$result$value
  pn <- w$x$panels[[1]]
  # Share of pure-red pixels along the rule, across the inner panel width.
  red_share <- function() {
    # the line's on-screen extent, clipped to the panel (its fixed rect)
    q <- as.numeric(strsplit(ev(sprintf("(function(){var s=document.querySelector('.vellumwidget-svg-holder svg'),k=s.getBoundingClientRect().width/s.viewBox.baseVal.width,o=s.getBoundingClientRect(),r=document.querySelector('.vellumwidget-above-layer path[stroke=\"#ff0000\"]').getBoundingClientRect();return [o.left+k*%f,o.left+k*%f,r.top+r.height/2].join(',')})()", pn$px0, pn$px1)), ",")[[1]])
    shot <- b$Page$captureScreenshot(format = "png", clip = list(x = q[1] + 10, y = round(q[3]) - 3, width = q[2] - q[1] - 20, height = 7, scale = 1))
    img <- png::readPNG(jsonlite::base64_dec(shot$data))
    # the best row of the band (the line's centre row)
    max(vapply(seq_len(dim(img)[1]), function(i) {
      mean(img[i, , 1] > 0.85 & img[i, , 2] < 0.25 & img[i, , 3] < 0.25)
    }, 0))
  }
  expect_gt(red_share(), 0.95) # overview: over the mark image
  ev(sprintf(
    "HTMLWidgets.find('#w1')._test.setView({x:%f,y:%f,w:%f,h:%f})",
    pn$px0 + 0.25 * (pn$px1 - pn$px0), pn$py0 + 0.25 * (pn$py1 - pn$py0),
    0.5 * (pn$px1 - pn$px0), 0.5 * (pn$py1 - pn$py0)
  ))
  Sys.sleep(0.5)
  expect_identical(ev("HTMLWidgets.find('#w1')._test.markTier()"), "mid")
  expect_gt(red_share(), 0.95) # zoomed: over the marks canvas, moved with the panel
  # the layer never takes the pointer: a point under it is still the target
  expect_identical(ev("getComputedStyle(document.querySelector('.vellumwidget-above-layer')).pointerEvents"), "none")
  # the toolbar's PNG export draws the line over the marks too
  ev("(function(){ window.__png = null; HTMLAnchorElement.prototype.click = function(){ var a = this; if (/\\.png$/.test(a.download)) fetch(a.href).then(function(r){ return r.blob(); }).then(function(bl){ var fr = new FileReader(); fr.onload = function(){ window.__png = fr.result; }; fr.readAsDataURL(bl); }); }; document.querySelector('[data-act=\"png\"]').click(); return 1; })()")
  Sys.sleep(1.5)
  png64 <- ev("window.__png")
  expect_type(png64, "character")
  img <- png::readPNG(jsonlite::base64_dec(sub("^data:image/png;base64,", "", png64)))
  ry <- round(ev("(function(){var s=document.querySelector('.vellumwidget-svg-holder svg'),p=document.querySelector('.vellumwidget-above-layer path[stroke=\"#ff0000\"]'),b=p.getBoundingClientRect(),q=s.getBoundingClientRect();return (b.top+b.height/2-q.top)/q.height*s.viewBox.baseVal.height})()"))
  cols <- round(pn$px0 + 10):round(pn$px1 - 10)
  best <- max(vapply((ry - 3):(ry + 3), function(i) {
    mean(img[i, cols, 1] > 0.85 & img[i, cols, 2] < 0.25 & img[i, cols, 3] < 0.25)
  }, 0))
  expect_gt(best, 0.95)
})

test_that("VW-25: the toolbar export draws the marks as shown (condition, zoom)", {
  skip_browser()
  skip_if_not(.split_render_supported() && .display_list_supported(), "vellum without the display list")
  set.seed(6)
  n <- 25000L
  df <- data.frame(x = runif(n), y = runif(n), g = sample(letters[1:4], n, TRUE), id = seq_len(n))
  members <- jsonlite::toJSON(as.character(df$id[df$x < 0.33]))
  p <- vellumplot::vplot(df) |>
    vellumplot::mark_point(x = x, y = y, data_id = id, color = vellumplot::condition("pick", g, "grey80")) |>
    vellumplot::select_point("pick", on = "click")
  w <- as_widget(p, elementId = "w1")
  b <- open_widget(w)
  ev <- function(js) b$Runtime$evaluate(js)$result$value
  pn <- w$x$panels[[1]]
  export_png <- function() {
    ev("(function(){ window.__png = null; HTMLAnchorElement.prototype.click = function(){ var a = this; if (/\\.png$/.test(a.download)) fetch(a.href).then(function(r){ return r.blob(); }).then(function(bl){ var fr = new FileReader(); fr.onload = function(){ window.__png = fr.result; }; fr.readAsDataURL(bl); }); }; document.querySelector('[data-act=\"png\"]').click(); return 1; })()")
    Sys.sleep(1.5)
    png64 <- ev("window.__png")
    expect_type(png64, "character")
    png::readPNG(jsonlite::base64_dec(sub("^data:image/png;base64,", "", png64)))
  }
  # share of grey80 pixels in a band of the exported panel (scene px = export px)
  grey_share <- function(img, fx0, fx1) {
    cols <- round(pn$px0 + fx0 * (pn$px1 - pn$px0)):round(pn$px0 + fx1 * (pn$px1 - pn$px0))
    rows <- round(pn$py0 + 10):round(pn$py1 - 10)
    r <- img[rows, cols, 1]; g <- img[rows, cols, 2]; bl <- img[rows, cols, 3]
    mean(abs(r - 0.8) < 0.02 & abs(g - 0.8) < 0.02 & abs(bl - 0.8) < 0.02)
  }
  ev(sprintf("HTMLWidgets.find('#w1')._call('select', %s)", members))
  Sys.sleep(0.3)
  img <- export_png()
  expect_gt(grey_share(img, 0.5, 0.95), 0.5) # non-members exported in the condition colour
  expect_lt(grey_share(img, 0.02, 0.3), 0.05) # members keep their own colour
  # zoomed (mid tier): the export is the exact redraw, so the condition holds
  ev(sprintf(
    "HTMLWidgets.find('#w1')._test.setView({x:%f,y:%f,w:%f,h:%f})",
    pn$px0 + 0.2 * (pn$px1 - pn$px0), pn$py0 + 0.2 * (pn$py1 - pn$py0),
    0.5 * (pn$px1 - pn$px0), 0.5 * (pn$py1 - pn$py0)
  ))
  Sys.sleep(0.5)
  expect_identical(ev("HTMLWidgets.find('#w1')._test.markTier()"), "mid")
  img <- export_png()
  expect_gt(grey_share(img, 0.5, 0.95), 0.4)
})

test_that("VW-23: gradient bars (display list v2) reach the detail tier", {
  skip_browser()
  skip_if_not(.split_render_supported() && .display_list_v2_supported(), "vellum without display list v2")
  d <- data.frame(g = letters[1:6], v = c(3, 5, 2, 6, 4, 1), id = 1:6)
  p <- vellumplot::vplot(d) |>
    vellumplot::mark_bar(x = g, y = v, data_id = id, fill = vellumplot::linear_gradient(c("gold", "purple"), x2 = 0, y2 = 1))
  w <- as_widget(p, elementId = "w1", render = render_options(mode = "raster"))
  expect_identical(w$x$displayList$version, 2L)
  b <- open_widget(w)
  ev <- function(js) b$Runtime$evaluate(js)$result$value
  pn <- w$x$panels[[1]]
  ev(sprintf(
    "HTMLWidgets.find('#w1')._test.setView({x:%f,y:%f,w:%f,h:%f})",
    pn$px0 + 0.2 * (pn$px1 - pn$px0), pn$py0 + 0.4 * (pn$py1 - pn$py0),
    0.5 * (pn$px1 - pn$px0), 0.5 * (pn$py1 - pn$py0)
  ))
  Sys.sleep(0.5)
  expect_identical(ev("HTMLWidgets.find('#w1')._test.markTier()"), "detail")
  expect_true(ev("[].every.call(document.querySelectorAll('.vellumwidget-detail [data-key]'), function(n){ var m = /^url\\(#(.+)\\)$/.exec(n.getAttribute('fill') || ''); return !!m && document.getElementById(m[1]).tagName === 'linearGradient'; })"))
  # the bars are painted: a gold-to-purple pixel range inside the panel
  r <- panel_rect(b)
  shot <- b$Page$captureScreenshot(format = "png", clip = list(x = r[1], y = r[2], width = r[3], height = r[4], scale = 1))
  img <- png::readPNG(jsonlite::base64_dec(shot$data))
  expect_gt(mean(img[, , 1] > 0.8 & img[, , 3] < 0.4), 0.05) # gold-ish
})
