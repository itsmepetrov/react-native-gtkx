import type { SidebarsConfig } from "@docusaurus/plugin-content-docs"

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// The Guide category is the install → run → ship arc, in reading order.
// "api", "platform-layer" and "gestures" are still the flat pre-restructure
// pages; tasks 2 and 4 turn them into the Reference and Architecture
// categories.
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
    "platform-layer",
    "gestures",
  ],
}

export default sidebars
