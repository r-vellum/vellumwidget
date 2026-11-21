# Contributing to vellumwidget

## Build and test

The runtime is TypeScript in `srcts/`, bundled into the committed
`inst/htmlwidgets/vellumwidget.js` with `npm run build`
(`node esbuild.js`). Commit the rebuilt bundle with every source change:
the `js-runtime` CI job rebuilds it and fails when the committed copy is
stale. Before a PR, run

- `npx tsc --noEmit` and `node tests/js/behavior.test.js` (jsdom), and
- `devtools::test()` for the R side.

## A PR that needs an unmerged vellum or vellumplot change

vellumwidget’s CI installs `vellum` and `vellumplot` from their GitHub
`main` (the `Remotes:` field in `DESCRIPTION`). A widget PR that builds
on a vellum PR that has not been merged yet would therefore run against
the old vellum, and the tests that feature-detect the new vellum would
skip.

To check such a PR against the vellum branch, put a line like this in
the PR description (on its own line, anywhere in the text):

    vellum-ref: my-feature-branch

`vellumplot-ref:` works the same way for vellumplot. The value is a
branch, tag or commit SHA on `r-vellum/vellum` (`r-vellum/vellumplot`).
The R-CMD-check workflow reads the description when it runs and rewrites
the `Remotes:` entry in its own checkout only, so nothing is committed
and there is nothing to undo when the PR merges. The job log shows a
notice naming the ref it built against.

- Editing the description does not start a new run: re-run the
  R-CMD-check job (it reads the description afresh).
- Merge the vellum PR first. Then delete the `vellum-ref:` line and
  re-run the widget PR’s check, so it passes against vellum’s `main`
  before you merge it. (If the branch was deleted with the merge, the
  job warns and falls back to `main` anyway.)
- Pushes to `main` and the nightly run always use `main`.
