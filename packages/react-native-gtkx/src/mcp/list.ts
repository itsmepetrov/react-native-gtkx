// rn_gtkx_list_surface: browse the surface without knowing an exact name
// first — an overview with counts, or the full name list for one area.
import {
  ADW_WIDGETS,
  COMMON_PRIMITIVES,
  GTK_WIDGETS,
  PORTABLE_APIS,
  PORTABLE_COMPONENTS,
  type WidgetRecord,
} from "./data/generated.js"

const SURFACE_AREAS = [
  "portable-components",
  "portable-apis",
  "gtk-widgets",
  "adw-widgets",
  "common",
] as const

type SurfaceArea = (typeof SURFACE_AREAS)[number]

const formatWidgetArea = (
  subpath: string,
  widgets: readonly WidgetRecord[],
): string => {
  const wrapped = widgets.filter((w) => w.wrapped)
  const raw = widgets.filter((w) => !w.wrapped)
  const wrappedLines = wrapped.map((w) => `- ${w.name}`).join("\n")
  const rawLines = raw
    .map((w) => `- ${w.name} (${w.reason ?? "raw"})`)
    .join("\n")
  return (
    `${subpath} — ${wrapped.length} wrapped (take \`style\`/\`onLayout\`), ${raw.length} raw (exported exactly as gtkx binds them):\n\n` +
    `Wrapped:\n${wrappedLines}\n\nRaw:\n${rawLines}`
  )
}

const overview = (): string => {
  const gtkWrapped = GTK_WIDGETS.filter((w) => w.wrapped).length
  const gtkRaw = GTK_WIDGETS.length - gtkWrapped
  const adwWrapped = ADW_WIDGETS.filter((w) => w.wrapped).length
  const adwRaw = ADW_WIDGETS.length - adwWrapped

  return [
    "react-native-gtkx surface overview",
    "",
    `portable-components (${PORTABLE_COMPONENTS.length}): exported from "react-native" — same import path as upstream RN (View, Text, FlatList, ...). Each has RN-compatible differences documented per name.`,
    `portable-apis (${PORTABLE_APIS.length}): modules exported from "react-native" (StyleSheet, Platform, AppRegistry, ...).`,
    `gtk-widgets (${gtkWrapped} wrapped + ${gtkRaw} raw): react-native-gtkx/gtk — every GTK4 widget gtkx binds.`,
    `adw-widgets (${adwWrapped} wrapped + ${adwRaw} raw): react-native-gtkx/adw — every libadwaita widget gtkx binds.`,
    `common (${COMMON_PRIMITIVES.length}): react-native-gtkx/common — NavigationStack, NavigationStackPage, SlotContent, IntrinsicContent. (Widget, wrapReactNative and useWidgetLayout also live here but are prose-only in the docs — use rn_gtkx_search_docs for those.)`,
    "",
    "Call again with `area` to list names, or rn_gtkx_describe_component with a specific name for full details.",
  ].join("\n")
}

const listSurface = (area?: SurfaceArea): string => {
  if (area === undefined) {
    return overview()
  }
  switch (area) {
    case "portable-components":
      return PORTABLE_COMPONENTS.map(
        (c) => `- ${c.name} (GTK: ${c.gtkImplementation})`,
      ).join("\n")
    case "portable-apis":
      return PORTABLE_APIS.map((a) => `- ${a.name}`).join("\n")
    case "common":
      return COMMON_PRIMITIVES.map((c) => `- ${c.name} — ${c.summary}`).join(
        "\n",
      )
    case "gtk-widgets":
      return formatWidgetArea("react-native-gtkx/gtk", GTK_WIDGETS)
    case "adw-widgets":
      return formatWidgetArea("react-native-gtkx/adw", ADW_WIDGETS)
  }
}

export { listSurface, SURFACE_AREAS, type SurfaceArea }
