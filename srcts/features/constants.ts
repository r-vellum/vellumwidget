// Fixed tuning constants shared by the feature modules.

// Above this many elements, dim on hover via the holder's opacity + a clone
// overlay (O(hovered)) rather than the CSS rule that restyles every keyed node.
export const DIM_OVERLAY_MIN = 2000;
// Cap on how many selection rings to draw: a huge brush selects thousands of
// points, and drawing a ring per point would reintroduce the DOM blowup raster
// mode exists to avoid. The selection set itself is always fully tracked and
// reported; only the on-canvas rings are bounded.
export const OVERLAY_MARK_CAP = 2000;
// How many bbox-shortlisted candidates the exact pass ranks. A bbox distance
// never exceeds the true distance, so the shortlist cannot miss anything in
// range; the cap only bounds the work when many boxes are equally close (a
// pile of long lines whose boxes all contain the cursor). Well above the
// number of marks that overlap one cursor position in practice.
export const PICK_CANDIDATES = 256;
// --- raster-mode feedback (rings drawn on the overlay, index-driven) ---
export const SVGNS = "http://www.w3.org/2000/svg";
// Unified tooltip: one box listing every mark in the hovered column, one row
// per mark (its tooltip, or its key). Rows are capped so a dense column can't
// build a runaway box.
export const TIP_MULTI_CAP = 30;
// --- toolbar ---
// The drag modes enabled for this widget, in cycle order (selection tools
// adjacent, then pan). The toolbar's mode button cycles through this list.
export const MODE_ICON: Record<string, string> = { brush: "▭", lasso: "◌", pan: "✋" };
export const MODE_LABEL: Record<string, string> = { brush: "brush-select", lasso: "lasso-select", pan: "pan" };
