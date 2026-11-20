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
