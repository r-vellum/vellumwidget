// Ambient globals injected by the htmlwidgets framework at render time. They are
// used as globals, never bundled (see esbuild.js).
declare const HTMLWidgets: {
  widget: (w: unknown) => void;
  shinyMode?: boolean; // true only inside a live Shiny app (gates the Shiny.* calls)
  // Resolve a mounted widget instance (the object its factory returned) by CSS
  // selector; used by the server->client proxy to find the widget to drive.
  find?: (selector: string) => import("./types").WidgetInstance | null;
};
