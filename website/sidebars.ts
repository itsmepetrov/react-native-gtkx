import type { SidebarsConfig } from "@docusaurus/plugin-content-docs"

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// The Guide category is the install → run → ship arc, in reading order.
// "api" is the last flat pre-restructure page; task 2 turns it into the
// Reference category.
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
    "api",
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
