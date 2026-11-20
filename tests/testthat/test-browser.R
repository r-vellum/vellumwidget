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
