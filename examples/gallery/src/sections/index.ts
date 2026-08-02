// Contract for the visual regression script: the ordered list of gallery
// section ids. The script imports/reads it and captures each section in a
// separate app run with GALLERY_SECTION=<id> (see src/index.tsx).
//
// The file deliberately imports no components — it can be loaded outside the
// GTK runtime. The full registry (id → title → group → component) is
// assembled in src/index.tsx on top of this list, with completeness enforced
// via a Record.
//
// The order below is the sidebar, and the sidebar is the navigation: one id
// per capability, named so it can be found without reading, and grouped by
// WHERE the capability comes from. That grouping is also the honest story of
// the platform, in the order a reader meets it:
//
//   1. React Native — portable API an iOS/Android app already knows. None of
//      it is this platform's invention; all of it happens to render as GTK.
//   2. gtkx — what exists only because this is GTK: Adwaita widgets, the
//      escape hatches, the layout-root boundary between the two worlds.
//   3. Modules — the third-party ecosystem, reached through the presets'
//      aliases (and, in the last one, not aliased at all).
//
// Groups are contiguous runs, because `SidebarNavigationOptions.group`
// headers follow row order — see packages/react-native-gtkx/src/navigation.
export const SECTION_IDS = [
  // 1 — React Native
  "views",
  "text",
  "layout",
  "clipping",
  "inputs",
  "buttons",
  "toggles",
  "lists",
  "media",
  "modal",
  "animated",
  "interpolate",
  "transforms",
  "gestures",
  "apis",
  // 2 — gtkx
  "widget-hosting",
  "adwaita-stack",
  // 3 — modules
  "reanimated",
  "reanimated-motion",
  "reanimated-layout",
  "reanimated-limits",
  "gesture-detector",
  "gesture-pinch",
  "gesture-relations",
  "dnd",
  "svg",
  "upstream",
] as const

export type SectionId = (typeof SECTION_IDS)[number]
