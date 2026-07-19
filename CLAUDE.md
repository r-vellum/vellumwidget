# vellumwidget — agent notes

`vellumwidget` turns a compiled `vellumplot` scene into an interactive
htmlwidget. It is a **host adapter**: it consumes an already-compiled, *static*
`vellum` scene (SVG with `data-key`s + the `scene_model()` element table) and
layers interaction on top in the browser. It does **not** compile the grammar.

## Interactivity: prefer the spec over new `as_widget()` flags

`as_widget()` already carries ~36 arguments, most of them behaviour flags
(`hover`, `select`, `brush`, `lasso`, `legend_click`, `crosshair`, `hover_mode`,
`navigator`, `axis_zoom`, …). **Before adding another interaction/behaviour
argument, stop and consider whether the behaviour belongs in the `vellumplot`
*spec* instead** — declared as part of the plot — rather than as one more
imperative widget flag.

Why this matters:

- **A widget flag is per-plot, per-host, imperative config, with a low ceiling.**
  It cannot express cross-view coordination (brush panel A → filter panel B), it
  is not portable to any other host, and it does not travel with the plot when
  the spec is saved / printed / round-tripped.
- **`vellumplot` is a spec-as-data grammar.** Interaction declared *in the spec*
  — a named selection referenced by a conditional encoding, a filter, or a scale
  domain (Vega-Lite's model) — is portable, composable, and serialisable. That is
  the intended long-term home for interaction: the **"declarative interactivity"**
  direction (Phase 6 of the vellumplot Tier-2 plan). It is **not built yet**, and
  building it is a deliberate, checkpointed design decision — but every new
  `as_widget()` flag added in the meantime is one more thing a future declarative
  model would have to duplicate or migrate.

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
and flag it to the maintainer. A tripwire test in `tests/testthat/test-as-widget.R`
fails when the `as_widget()` argument count grows past its current baseline — its
purpose is to force exactly this consideration (and remind you of the Phase 6
direction) before the signature grows further.
