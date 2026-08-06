import type { SidebarsConfig } from "@docusaurus/plugin-content-docs"

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// The Guide category is the install → run → ship arc, in reading order.
// The category order is the reading order: Guide (install → run → ship),
// Reference (the react-native surface), Architecture (how it works).
const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: "category",
      label: "Guide",
      items: [
        "guide/installation",
        "guide/first-app",
        "guide/toolchains",
        "guide/plain-gtk",
        "guide/packaging",
      ],
    },
    {
      type: "category",
      label: "Reference",
      items: [
        "reference/components-core",
        "reference/components-inputs",
        "reference/components-lists",
        "reference/components-overlays",
        "reference/apis",
        "reference/styling",
        "reference/globals",
        "reference/aliases",
        "reference/navigation",
        "reference/svg",
        "reference/dnd",
        "reference/gesture-handler",
        "reference/reanimated-compat",
      ],
    },
    {
      type: "category",
      label: "Architecture",
      items: [
        "architecture/overview",
        "architecture/layout-and-styling",
        "architecture/integration",
        "architecture/gestures",
      ],
    },
  ],
}

export default sidebars
