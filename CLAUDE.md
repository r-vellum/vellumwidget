# vellumwidget — agent notes

`vellumwidget` turns a compiled `vellumplot` scene into an interactive
htmlwidget. It is a **host adapter**: it consumes an already-compiled, *static*
`vellum` scene (SVG with `data-key`s + the `scene_model()` element table) and
layers interaction on top in the browser. It does **not** compile the grammar.

## Interactivity: prefer the spec over new `as_widget()` flags

`as_widget()` has 18 formals (17 named arguments plus `...`), and a tripwire
test caps it there. Hover, click-select, brush, lasso, pan/zoom and axis-aware
zoom are on by default and have no per-widget toggles. The remaining arguments
are host-level options (`toolbar`, `navigator`, `hover_mode`, `crosshair`,
`legend_click`, `a11y`, `alt`, `group`, `crosstalk`, `select_mode`, …).
Families of related settings are grouped into option helpers (R-13), each
validated by its constructor:

- `tooltip = tooltip_options(delay, follow, sticky, style)`
- `export = export_options(filename, scale)`
- `navigator = TRUE/FALSE` or `navigator_options(height)`
- `render = render_options(mode, raster_threshold, text, max_marks, detail_marks)`

The old flat names (`tooltip_delay`, `tooltip_follow`, `tooltip_sticky`,
`tooltip_style`, `export_filename`, `export_scale`, `navigator_height`, `mode`,
`raster_threshold`, `text`) are soft-deprecated: they arrive through `...`, are
folded into the option objects by `.fold_deprecated()` (`R/options.R`), and warn
once per session (honouring `lifecycle_verbosity`). Do not use them in new code,
docs or tests. A new setting that belongs to one of these families goes into its
helper, not into `as_widget()`. Argument checks live in `R/validate.R`
(`.check_bool()`, `.check_number()`, `.check_string()`, `.check_choice()`, …);
every argument is validated, so do the same for anything you add.

**Before adding another interaction/behaviour argument,
stop and consider whether the behaviour belongs in the `vellumplot` *spec*
instead**, declared as part of the plot rather than as one more imperative
widget flag.

Why this matters:

- **A widget flag is per-plot, per-host, imperative config, with a low ceiling.**
  It cannot express cross-view coordination (brush panel A → filter panel B), it
  is not portable to any other host, and it does not travel with the plot when
  the spec is saved / printed / round-tripped.
- **`vellumplot` is a spec-as-data grammar.** Interaction declared *in the spec*
  — a named selection referenced by a conditional encoding, a filter, or a scale
  domain (Vega-Lite's model) — is portable, composable, and serialisable. That is
  the intended long-term home for interaction: the **"declarative
  interactivity"** direction (Phase 6 of the vellumplot Tier-2 plan).

**Declarative interactivity is built.** `vellumplot::interaction_model()` hands
the widget the plot's selections, conditions, filters and binds, and the runtime
enacts:

- `select_point()` (hover or click) and `select_neighbours()` (graph
  neighbourhoods);
- `select_interval()`: a data-value brush. The brushed pixels are inverted through
  the panel's scale (continuous, log10/sqrt/reverse, date/datetime, discrete
  levels) and elements are tested by data value. It falls back to pixel
  hit-testing when the scale can't be inverted (#50);
- `condition()`: styles an aesthetic by selection membership;
- `add_selection()` + `filter_by()`: cross-filtering. The filtered view hides
  non-members and the source view stays whole. SVG mode only.

- `bind_scale()`: overview + detail. The panels of the bind's composition
  `cell` (every panel but the brushed one when it names none) zoom to the
  interval selection's range on the bound axis, and clearing it unbinds them
  (`srcts/features/bindScales.ts`, pure math in `srcts/binds.ts`). A bound panel
  overrides its axis in `azT()`, so the re-tick, hit-testing and `_zoom` follow;
- `select_interval(bind = "scales")`: the selection is written from its view's
  settled zoom (`syncScaleSelections()`, called from `reportView()`); a brush
  never fills it and the default drag is pan.

**When you do route interaction through the spec, keep it display-tier.**
`vellumplot` is compile-once by design and deliberately has **no reactive
dataflow runtime**. So spec-declared interactions must be reactions a host can
perform on the *frozen* scene — highlight/dim, hide/isolate, filter-by-hiding,
pan/zoom, linked brushing. Interactions that would **recompute the grammar**
(re-bin or re-aggregate on brush, retrain a scale from filtered data) are out of
scope client-side; they need a Shiny recompile.

**Rule of thumb.** A new `as_widget()` behaviour is fine for a genuinely
widget-local, single-plot affordance. But if it smells like "the *plot* should
know about this," or it needs to coordinate two views, route it through the spec
and flag it to the maintainer. The tripwire in `tests/testthat/test-as-widget.R`
(`expect_lte(length(formals(as_widget)), 18L)`) exists to force exactly this
consideration. Bump it only for a genuinely widget-local affordance, and say so
in the commit.

## Axis-aware zoom

On by default in SVG mode (no flag). Zoom scales only the data region and
re-ticks the axes; the frame (axes, titles, legend) stays put. It re-ticks
linear, reverse, sqrt, log10 and date/datetime axes, and re-positions the static
breaks of discrete/binned axes. Facets zoom per panel (#51). Raster mode zooms
by axis too when vellum has the split render (VW-14): the furniture is SVG and
the keyed-mark PNG (`payload$marks`) is drawn by a `<use>` in each pan group;
with an older vellum (one base image), raster mode, void
panels (graphs, `theme_void`) and panels the re-ticker can't follow (e.g. polar)
fall back to whole-scene viewBox zoom. Glyph marks keep a constant pixel size.

With a vellum that splits the furniture by paint order (VW-21,
`.paint_order_supported()`), `payload$svg` is `layer = "unkeyed_below"` and
`payload$above` the `"unkeyed_above"` SVG: an overlay svg in the stage
(`ws.aboveEl`, over the canvas, `pointer-events: none`) whose pan groups are
each `AzPanel.mirror`, transformed with the base pan group, and whose viewBox
follows the base svg; export folds it in after the marks.

Raster mode has three mark tiers (`ws.markTier`): `"overview"` (the mark PNG),
`"mid"` (the exact canvas drawn from vellum's display list, `ws.dl`,
`srcts/dlist.ts`, `features/raster.ts` `drawList`) and `"detail"` (keyed SVG
nodes for the visible marks, `features/detail.ts`), decided when the view
settles. Raster feedback is drawn as rings only while `ws.fx.ringMode()`
(every raster tier but detail); in detail the nodes take classes as in SVG mode.

## Build and test

- The runtime is TypeScript in `srcts/`. `srcts/index.ts` is the entry point
  (registers the widget). Pure helpers live in sibling modules (`geometry`,
  `spatial`, `scales`, `viewbox`, `ticks`, `css`, `tooltip`, `dom`, `linking`,
  `shiny`, `types`). Per-widget state is one `WidgetState` object
  (`srcts/state.ts`); the feature code lives in `srcts/features/*.ts`, each a
  `xxxFeature(ws)` factory. A function another module calls is listed in
  `WidgetFns` and reached as `ws.fx.name`. Build it with `node esbuild.js`
  (`npm run build`) into `inst/htmlwidgets/vellumwidget.js`.
- **Always commit the rebuilt bundle with the source change.** The `js-runtime`
  CI job rebuilds it and fails if the committed copy is stale. It also runs
  `npx tsc --noEmit` and `node tests/js/behavior.test.js` (jsdom).
- In a git worktree, **copy** `node_modules` from the main checkout
  (`cp -R`); never symlink it.
- Run R tests with `devtools::test()`. Never run `testthat::test_dir()` against
  an installed build: it deletes snapshot files.
