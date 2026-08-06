import type { SidebarsConfig } from "@docusaurus/plugin-content-docs"

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Temporary mapping of today's four flat docs/ pages, in reading order.
// Tasks 2-4 restructure this into Guide / Reference / Architecture categories.
const sidebars: SidebarsConfig = {
  docsSidebar: ["getting-started", "api", "platform-layer", "gestures"],
}

export default sidebars
