# VR-16: per-element meta is read column-wise (`.meta_index()` and friends).
# These pin the result to the obvious per-element `m[[field]]` reading.

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
    list(cond = c("s:color"), legend = "color:z", ix = "4", hover_color = "#00ff0080"),
    list(nul = NULL, tooltip = NULL)
  )
}

test_that("column-wise meta reads match per-element [[ ]] access", {
  ix_fun <- getFromNamespace(".meta_index", "vellumwidget")
  chr <- getFromNamespace(".meta_chr", "vellumwidget")
  num <- getFromNamespace(".meta_num", "vellumwidget")
  rag <- getFromNamespace(".meta_ragged", "vellumwidget")
  css <- getFromNamespace(".css_color", "vellumwidget")
  meta <- .meta_fixture()
  ix <- ix_fun(meta)
  for (f in c("tooltip", "legend", "legend_for", "cond", "absent", "nul")) {
    expect_identical(chr(ix, f), .naive_chr(meta, f), info = f)
    expect_identical(rag(ix, f), .naive_ragged(meta, f), info = f)
  }
  expect_identical(chr(ix, "hover_color", css), .naive_chr(meta, "hover_color", css))
  expect_identical(suppressWarnings(num(ix, "ix")), suppressWarnings(.naive_num(meta, "ix")))
  expect_null(num(ix, "absent"))
  # The all-scalar fast path (one vectorised call) agrees too.
  big <- lapply(1:500, function(i) list(legend = paste0("color:", i %% 4), ix = i / 3))
  bix <- ix_fun(big)
  expect_identical(chr(bix, "legend"), .naive_chr(big, "legend"))
  expect_identical(rag(bix, "legend"), .naive_ragged(big, "legend"))
  expect_identical(num(bix, "ix"), .naive_num(big, "ix"))
})

test_that("non-list records fall back to per-element reads", {
  ix_fun <- getFromNamespace(".meta_index", "vellumwidget")
  chr <- getFromNamespace(".meta_chr", "vellumwidget")
  meta <- list(c(tooltip = "a", other = "b"), list(tooltip = "c"))
  expect_identical(chr(ix_fun(meta), "tooltip"), .naive_chr(meta, "tooltip"))
})
