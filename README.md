# gloss

<!-- badges: start -->
<!-- badges: end -->

**gloss** turns a [vellum](https://github.com/schochastics/vellum) scene — or a
[quill](https://github.com/schochastics/quill) plot — into a self-contained, client-side interactive HTML
widget: **hover tooltips + highlighting, click selection, rectangular
brush-select, pan/zoom, and a toolbar**, with no Shiny and no server round-trip.
It is the host adapter of the vellum interactivity stack: `vellum` emits
per-element `data-key`s, bounding boxes, and a `scene_model()` element table,
`quill` declares what is interactive, and `gloss` hosts it.

**Interactions:** hover (tooltip + highlight, with nearest-mark snapping and
`hover_group` linking) · click-select (single/multiple) · drag a rectangle to
brush-select · wheel / pan-drag to pan-zoom · toolbar (mode toggle,
zoom-to-selection, reset, save SVG/PNG, fullscreen). Each is opt-outable via an
`as_widget()` argument.

> The name is the manuscript *gloss* — an annotation revealed on the page.

## Usage

```r
library(quill)
library(gloss)

df <- data.frame(wt = mtcars$wt, mpg = mtcars$mpg, model = rownames(mtcars))

vplot(df) |>
  mark_point(x = wt, y = mpg, tooltip = model, data_id = model) |>
  as_widget()
```

`as_widget()` is terminal: it compiles the plot to a vellum scene, emits the SVG
and the element table, and returns an htmlwidget. It also accepts a bare `vellum`
scene. Declare interactivity in `quill` with the reserved mark arguments
`data_id` (the join key), `tooltip`, and `hover_group` (links elements for shared
highlighting). A plot that declares none renders as a static — but still
embeddable — SVG.

## How it depends

```
gloss ──depends──▶ vellum ◀──depends── quill
```

`gloss` depends only on `vellum`'s `scene_svg()` / `scene_model()` contract, so it
wraps *any* vellum scene, whoever produced it. `quill` is a Suggests (for the
examples/tests).

## Development

The JS runtime is TypeScript in `srcts/`, bundled by esbuild into the committed
`inst/htmlwidgets/gloss.js` (so the R package installs with no Node):

```sh
npm install            # esbuild + typescript (+ jsdom for tests)
npm run build          # srcts/index.ts -> inst/htmlwidgets/gloss.js
node tests/js/behavior.test.js   # headless DOM behaviour suite
```
