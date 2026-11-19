// Tooltip text handling: a safe-HTML allow-list sanitiser and a plain-text form.

// Render a tooltip string as *safe* HTML: escape everything, then re-enable a
// fixed allow-list of inert, attribute-free tags. Data values can't inject
// scripts, event handlers, or attributes (an opening tag carrying attributes
// stays escaped), so an author can build multi-line / bold tooltips (e.g. via
// vellumplot's `tooltip =`) with `<br>` / `<b>` without any XSS surface.
export const TIP_TAGS = ["b", "i", "em", "strong", "br", "span"];
export function sanitizeTip(s: string): string {
  let out = String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  for (const t of TIP_TAGS) {
    out = out
      .replace(new RegExp("&lt;" + t + "&gt;", "gi"), "<" + t + ">")
      .replace(new RegExp("&lt;/" + t + "&gt;", "gi"), "</" + t + ">")
      .replace(new RegExp("&lt;" + t + "\\s*/&gt;", "gi"), "<" + t + ">");
  }
  return out;
}

// Plain-text form of a (possibly HTML) tooltip, for an aria-label, a spoken
// announcement or a `textContent` cell: drop complete tags, collapse whitespace.
// NOT an HTML sanitiser -- an unterminated tag such as `<img src=x onerror=...`
// survives it -- so its result must only ever reach the DOM as text
// (`textContent` / `setAttribute`), never through `innerHTML`.
export function stripTags(s: string): string {
  return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
