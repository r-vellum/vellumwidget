// Build the gloss htmlwidget JS binding from the TypeScript source into
// inst/htmlwidgets/gloss.js. The `HTMLWidgets` (and `Shiny`) globals are injected
// by the htmlwidgets framework at render time, so they are used as ambient
// globals, not bundled. The output is a plain IIFE that registers the widget.
const esbuild = require("esbuild");
const path = require("path");

const watch = process.argv.includes("--watch");

const opts = {
  entryPoints: [path.join(__dirname, "srcts", "index.ts")],
  outfile: path.join(__dirname, "inst", "htmlwidgets", "gloss.js"),
  bundle: true,
  format: "iife",
  target: ["es2018"],
  legalComments: "none",
  banner: { js: "// Generated from srcts/index.ts by esbuild — do not edit by hand." }
};

if (watch) {
  esbuild.context(opts).then((ctx) => ctx.watch());
} else {
  esbuild.build(opts).catch(() => process.exit(1));
}
