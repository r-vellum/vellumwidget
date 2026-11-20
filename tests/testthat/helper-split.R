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
  out[setdiff(seq_len(n), other)] <- format(cumsum(key$delta), scientific = FALSE, trim = TRUE)
  out
}
