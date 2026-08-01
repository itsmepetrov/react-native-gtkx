// Contract for the visual regression script: the ordered list of gallery
// section ids. The script imports/reads it and captures each section in a
// separate app run with GALLERY_SECTION=<id> (see src/index.tsx).
//
// The file deliberately imports no components — it can be loaded outside the
// GTK runtime. The full registry (id → title → component) is assembled in
// src/index.tsx on top of this list, with completeness enforced via a Record.
export const SECTION_IDS = [
  "views",
  "text",
  "layout",
  "inputs",
  "buttons",
  "lists",
  "toggles",
  "media",
  "svg",
  "animated",
  "gestures",
  "modal",
  "apis",
] as const

export type SectionId = (typeof SECTION_IDS)[number]
