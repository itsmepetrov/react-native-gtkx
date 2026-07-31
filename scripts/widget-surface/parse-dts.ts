// Extracts the JSX component names gtkx binds from its generated .d.ts —
// the authoritative "what does gtkx export as a component" list. We parse
// text rather than importing the module because @gtkx/jsx/{gtk,adw} resolve
// "virtual:" specifiers that only exist inside a vite/vitest build (see
// scripts/widget-surface/README); the .d.ts is plain text and needs no
// bundler.
//
// Two kinds of top-level `export declare const` show up:
//   export declare const GtkButton: (props: GtkButtonProps) => ReactNode;
//   export declare const GtkWidget: "GtkWidget";
// The first is a real, mountable JSX component. The second is an abstract
// GObject class gtkx still tags with a string marker (so mixins can refer to
// it) but that has no concrete constructor of its own — not a component.
import { readFileSync } from "node:fs"

const CONST_RE = /^export declare const (\w+): (.+);$/

export interface ComponentNames {
  components: string[]
  markers: string[]
}

export const parseComponentNames = (dtsPath: string): ComponentNames => {
  const text = readFileSync(dtsPath, "utf8")
  const components: string[] = []
  const markers: string[] = []
  const unrecognized: string[] = []
  for (const line of text.split("\n")) {
    const match = CONST_RE.exec(line)
    if (!match) {
      continue
    }
    const name = match[1] ?? ""
    const rhs = match[2] ?? ""
    if (/^"\w+"$/.test(rhs)) {
      markers.push(name)
    } else if (/=>\s*ReactNode$/.test(rhs)) {
      components.push(name)
    } else {
      unrecognized.push(`${name} :: ${rhs}`)
    }
  }
  if (unrecognized.length > 0) {
    throw new Error(
      `parseComponentNames(${dtsPath}): unrecognized declaration shape(s), ` +
        `the .d.ts format may have changed upstream:\n` +
        unrecognized.join("\n"),
    )
  }
  return { components, markers }
}
