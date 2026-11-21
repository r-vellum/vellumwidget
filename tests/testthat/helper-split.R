# Raster mode uses vellum's split render when the installed vellum has it
# (VW-14). Tests of the single-image fallback shell pin that path explicitly, so
# they hold against both an old and a new vellum.
local_single_raster <- function(env = parent.frame()) {
  testthat::local_mocked_bindings(
    .split_render_supported = function() FALSE,
    .package = "vellumwidget",
    .env = env
  )
}

# The key column as R strings, whatever its wire form (see `.encode_keys()`).
.decode_keys_r <- function(key) {
  if (!is.list(key)) {
    return(as.character(key))
  }
  n <- length(key$delta) + length(key$at)
  out <- character(n)
  other <- key$at + 1L
  out[other] <- key$v
  num <- format(cumsum(key$delta), scientific = FALSE, trim = TRUE)
  if (!is.null(key$pre)) {
    num <- paste0(rep(key$pre$levels[key$pre$rv + 1L], key$pre$rl), num)
  }
  out[setdiff(seq_len(n), other)] <- num
  out
}

# A typed column (`.uint_column()`, the runtime's `dlColumn()`) as integers.
.uint_column_r <- function(col) {
  n <- col$n
  if (!is.null(col$const)) {
    return(rep(as.integer(col$const), n))
  }
  if (!is.null(col$rle)) {
    return(as.integer(rep(col$rle$values, col$rle$lengths)))
  }
  raw <- base64enc::base64decode(col$data)
  if (!is.null(col$bits)) {
    k <- col$bits
    b <- as.integer(rawToBits(raw))[seq_len(n * k)]
    return(as.integer(colSums(matrix(b, nrow = k) * 2^(seq_len(k) - 1L))))
  }
  switch(
    col$type,
    u8 = as.integer(raw),
    u16 = readBin(raw, "integer", n, size = 2, signed = FALSE, endian = "little"),
    u32 = readBin(raw, "integer", n, size = 4, endian = "little")
  )
}

# One encoded element column as R strings (`NA` for none), whatever its wire
# form: the R twin of the runtime's `decodeColumn()`. `keys`: the element keys.
.decode_column_r <- function(col, n, keys = NULL) {
  if (!is.list(col)) {
    return(as.character(col))
  }
  if (!is.null(col$at)) {
    out <- rep(NA_character_, n)
    out[col$at + 1L] <- as.character(unlist(col$v))
    return(out)
  }
  if (!is.null(col$cb)) {
    code <- .uint_column_r(col$cb)
    return(ifelse(code == 0L, NA_character_, col$levels[pmax(code, 1L)]))
  }
  if (!is.null(col$rv)) {
    code <- rep(col$rv, col$rl)
    return(ifelse(code < 0L, NA_character_, col$levels[pmax(code + 1L, 1L)]))
  }
  if (!is.null(col$codes)) {
    return(col$levels[col$codes + 1L])
  }
  if (!is.null(col$tpl)) {
    tc <- .uint_column_r(col$tc)
    tn <- if (is.list(col$tn)) col$tn else list(col$tn)
    key_int <- regmatches(keys, regexpr("(0|[1-9][0-9]{0,14})$", keys, perl = TRUE))
    at <- rep(0L, length(tn))
    out <- rep(NA_character_, n)
    ki <- 0L
    for (i in seq_len(n)) {
      if (tc[i] == 0L) next
      p <- col$tpl[[tc[i]]]
      s <- p[1]
      if (length(p) > 1L) ki <- ki + 1L
      for (j in seq_len(length(p) - 1L)) {
        st <- tn[[j]]
        num <- if (identical(st, "key")) {
          sub(".*?(0|[1-9][0-9]{0,14})$", "\\1", keys[i], perl = TRUE)
        } else {
          at[j] <- at[j] + 1L
          vals <- if (!is.null(st$d)) cumsum(st$d) else st$v
          format(vals[at[j]], scientific = FALSE)
        }
        s <- paste0(s, num, p[j + 1L])
      }
      out[i] <- s
    }
    return(out)
  }
  stop("unknown column form")
}
