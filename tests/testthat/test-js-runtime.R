# Exercise the built JS runtime in a headless DOM (jsdom). Skipped unless Node
# and the dev dependencies are present (they are not needed to use the package,
# only to develop/verify the bundle). The heavy lifting is in tests/js/.
test_that("the vellumwidget JS runtime passes its headless behaviour suite", {
  node <- Sys.which("node")
  skip_if(node == "", "Node.js not available")
  script <- testthat::test_path("..", "js", "behavior.test.js")
  skip_if_not(file.exists(script), "JS behaviour test not found")
  # jsdom lives under node_modules at the package root (dev-only).
  pkg_root <- normalizePath(file.path(dirname(script), "..", ".."))
  skip_if_not(dir.exists(file.path(pkg_root, "node_modules", "jsdom")), "jsdom not installed")
  status <- system2(node, shQuote(normalizePath(script)), stdout = TRUE, stderr = TRUE)
  ok <- any(grepl("ALL PASS", status))
  if (!ok) cat(status, sep = "\n")
  expect_true(ok)
})
