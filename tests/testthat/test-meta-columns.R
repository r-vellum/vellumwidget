# VR-16 / VR-19: per-element meta arrives as columns (`scene_model(meta =
# "columns")`) and is read by `.meta_chr()` and friends. These pin the result to
# the obvious per-element `m[[field]]` reading of the same records.

.naive_chr <- function(meta, field, transform = as.character) {
  present <- FALSE
  out <- vapply(
    meta,
    function(m) {
      v <- if (is.null(m)) NULL else m[[field]]
      if (is.null(v)) {
        NA_character_
      } else {
        present <<- TRUE
        as.character(transform(v))[[1L]]
      }
    },
    character(1)
  )
  if (present) out else NULL
}

.naive_num <- function(meta, field) {
  present <- FALSE
  out <- vapply(
    meta,
    function(m) {
      v <- if (is.null(m)) NULL else m[[field]]
      if (is.null(v) || !length(v)) {
        NA_real_
      } else {
        present <<- TRUE
        as.numeric(v)[[1L]]
      }
    },
    numeric(1)
  )
  if (present) out else NULL
}

.naive_ragged <- function(meta, field) {
  lapply(meta, function(m) {
    v <- if (is.null(m)) NULL else m[[field]]
    if (is.null(v)) character(0) else as.character(v)
  })
}

.meta_fixture <- function() {
  list(
    list(tooltip = "a", legend = "color:x", ix = 1.5, hover_color = "red"),
    NULL,
    list(legend = c("color:x", "shape:y"), tooltip = factor("lvl"), ix = 2L),
    list(legend_for = "color:x", tooltip = 3, ix = numeric(0)),
    list(tooltip = c("first", "second"), tooltip = "dup", hover_color = "blue"),
    list(),
    list(
      cond = c("s:color"),
      legend = "color:z",
      ix = "4",
      hover_color = "#00ff0080"
    ),
    list(nul = NULL, tooltip = NULL)
  )
}

# The records' columns, as vellum hands them to the widget.
.columns_of <- function(meta) {
  n <- length(meta)
  g <- vellum::points_grob(
    seq(0.1, 0.9, length.out = n),
    0.5,
    key = paste0("k", seq_len(n)),
    meta = meta
  )
  vellum::scene_model(
    vellum::vl_scene(2, 2) |> vellum::draw(g),
    meta = "columns"
  )$elements$meta
}

# `.meta_ragged()` is NULL when no element carries the field.
.as_ragged <- function(v, n) {
  if (is.null(v)) rep(list(character(0)), n) else v
}

test_that("column-wise meta reads match per-element [[ ]] access", {
  chr <- getFromNamespace(".meta_chr", "vellumwidget")
  num <- getFromNamespace(".meta_num", "vellumwidget")
  rag <- getFromNamespace(".meta_ragged", "vellumwidget")
  css <- getFromNamespace(".css_color", "vellumwidget")
  meta <- .meta_fixture()
  cols <- .columns_of(meta)
  for (f in c("tooltip", "legend", "legend_for", "cond", "absent", "nul")) {
    expect_identical(chr(cols[[f]]), .naive_chr(meta, f), info = f)
    expect_identical(
      .as_ragged(rag(cols[[f]]), length(meta)),
      .naive_ragged(meta, f),
      info = f
    )
  }
  expect_identical(
    chr(cols$hover_color, css),
    .naive_chr(meta, "hover_color", css)
  )
  expect_identical(
    suppressWarnings(num(cols$ix)),
    suppressWarnings(.naive_num(meta, "ix"))
  )
  expect_null(num(cols$absent))
  # Plain columns (the big-plot case) agree too.
  big <- lapply(1:500, function(i) {
    list(legend = paste0("color:", i %% 4), ix = i / 3)
  })
  bcols <- .columns_of(big)
  expect_type(bcols$legend, "character")
  expect_type(rag(bcols$legend), "list")
  expect_identical(chr(bcols$legend), .naive_chr(big, "legend"))
  expect_identical(
    .as_ragged(rag(bcols$legend), 500L),
    .naive_ragged(big, "legend")
  )
  expect_identical(num(bcols$ix), .naive_num(big, "ix"))
})

test_that("non-list records read like lists", {
  chr <- getFromNamespace(".meta_chr", "vellumwidget")
  meta <- list(c(tooltip = "a", other = "b"), list(tooltip = "c"))
  expect_identical(chr(.columns_of(meta)$tooltip), .naive_chr(meta, "tooltip"))
})

test_that("the element table needs the columnar scene model", {
  els <- getFromNamespace(".vellumwidget_elements", "vellumwidget")
  sc <- vellum::vl_scene(2, 2) |>
    vellum::draw(vellum::points_grob(
      0.5,
      0.5,
      key = "a",
      meta = list(list(tooltip = "t"))
    ))
  expect_identical(els(vellum::scene_model(sc, meta = "columns"))$tooltip, "t")
  expect_error(els(vellum::scene_model(sc)), "columns")
})

# Regression (VR-19): keys, tooltips and legend membership reach the widget
# payload the same whether a scene's meta is records or a data frame, in both
# render modes.
test_that("records and columnar meta give the same widget elements", {
  n <- 30L
  recs <- lapply(seq_len(n), function(i) {
    list(
      tooltip = paste("pt", i),
      legend = paste0("color:", letters[i %% 3 + 1]),
      hover_color = "red"
    )
  })
  df <- data.frame(
    tooltip = paste("pt", seq_len(n)),
    legend = paste0("color:", letters[seq_len(n) %% 3 + 1]),
    hover_color = "red"
  )
  scene <- function(meta) {
    vellum::vl_scene(3, 2, dpi = 72) |>
      vellum::draw(vellum::points_grob(
        seq(0.05, 0.95, length.out = n),
        0.5,
        key = paste0("k", seq_len(n)),
        meta = meta
      )) |>
      vellum::draw(vellum::points_grob(
        0.02,
        0.02,
        key = "swatch",
        meta = list(list(legend_for = "color:a", tooltip = "a"))
      ))
  }
  for (mode in c("svg", "raster")) {
    a <- as_widget(scene(recs), render = render_options(mode = mode))$x$elements
    b <- as_widget(scene(df), render = render_options(mode = mode))$x$elements
    expect_identical(a, b, info = mode)
  }
  els <- as_widget(scene(df), render = render_options(mode = "svg"))$x$elements
  i <- match(c("k1", "k2", "swatch"), els$key)
  expect_identical(els$tooltip[i], c("pt 1", "pt 2", "a"))
  expect_identical(els$legend[i], list("color:b", "color:c", character(0)))
  expect_identical(els$legend_for[i], c(NA, NA, "color:a"))
  expect_identical(els$hover_color[i], c("#ff0000", "#ff0000", NA))
})
