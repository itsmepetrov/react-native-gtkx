# Package aliases

Both toolchain presets — `withLinuxPlatform` (Metro) and `reactNativeGtkx`
(vite) — rewrite six package names during module resolution, from one shared
table both of them read. A name is matched exactly or with a `/` after it,
and the matched tail is transplanted onto the target: `react-native-svg/lib/x`
becomes `react-native-gtkx/svg/lib/x`, while a lookalike name such as
`react-native-svg-icons` is left alone.

| Package                        | Resolves to                         | Why                                                                                                                                                    |
| ------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `react-native`                 | `react-native-gtkx`                 | The platform itself — not a substitution, and not configurable.                                                                                        |
| `react-native-svg`             | `react-native-gtkx/svg`             | The real package is a native module.                                                                                                                   |
| `react-native-reanimated`      | `react-native-gtkx/reanimated`      | The real package needs a worklet runtime and a Babel plugin.                                                                                           |
| `react-native-worklets`        | `react-native-gtkx/worklets`        | Where Reanimated 4 moved that runtime; a library that pulls `scheduleOnRN`/`scheduleOnUI` from it directly fails at import if the name is not aliased. |
| `react-native-gesture-handler` | `react-native-gtkx/gesture-handler` | A reimplementation of the semantics, not a port — see [Gesture Handler](gesture-handler.md).                                                           |
| `react-native-reanimated-dnd`  | `react-native-gtkx/dnd`             | A mirror of its API over native GTK drag-and-drop — see [Drag and drop](dnd.md) for the one genuine behavioral trade this alias makes.                 |

## Configuring the aliases

Both presets take an `aliases` option as **deltas keyed by package name**,
not a replacement list — anything not mentioned keeps its default. A
replacement list that has to be re-stated in full is a list that can quietly
lose an entry; losing one of these six from a bundler's own external-package
list is what admits the real, incompatible upstream package into a Linux
build.

```ts
// vite.config.ts
import { reactNativeGtkx } from "react-native-gtkx/vite"

export default defineConfig({
  plugins: [
    reactNativeGtkx({
      aliases: {
        // false — drop one of ours, so the real upstream package loads
        "react-native-reanimated-dnd": false,
        // string — an exact name or subpath, tail transplanted
        "my-pkg": "my-pkg/linux",
        // { pattern, replace } — only for the rare case where the subpath
        // layouts genuinely differ
        "weird-pkg": { pattern: /^weird-pkg\/lib\/(.+)$/, replace: "impl/$1" },
      },
    }),
  ],
})
```

```ts
// metro.config.ts — the same object, the same semantics
export default withLinuxPlatform(getDefaultConfig(__dirname), {
  aliases: { "react-native-reanimated-dnd": false },
})
```

Prefer the string form: it is anchored to the exact package name, which
matters because `react-native-reanimated-dnd` is a lookalike of
`react-native-reanimated`, and `react-native-worklets-core` is a real,
unrelated package that looks like `react-native-worklets`. A loose prefix
rewrite would send either one onto a subpath that does not exist. Reach for
`{ pattern, replace }` only when a package's subpath layout genuinely does
not match its target's.

Because the rules are data rather than functions, a preset validates them
when the config loads and reports exactly what is wrong:

- an unknown key paired with `false` — the aliases that exist are named, so a
  typo cannot silently do nothing;
- an overlapping pattern — two rules claiming one specifier would make
  resolution order-dependent, so this is rejected;
- an unanchored pattern, or one carrying the `g`/`y` regex flag — the first
  matches inside a longer specifier than intended, the second carries state
  (`lastIndex`) between calls;
- a target that is not a plain module specifier — a relative or absolute
  path, or one ending in `/`;
- `react-native` itself — it cannot be dropped or retargeted; the platform
  alias is not one of the six substituted packages.

On the vite path, the same option also drives `ssr.noExternal`, derived from
the table rather than duplicated beside it — every name in the table stays
inside vite's own pipeline, including one that is turned off deliberately: an
un-aliased package still imports `react-native` at module scope, and that
import only reaches the platform alias if Node never resolves the real
package first.

## The one alias that is a real trade

Five of these six substitute an implementation that cannot run on this
platform at all. `react-native-reanimated-dnd` is the exception: its real
2.0.0 release runs on top of this platform's own Reanimated, worklets and
gesture-handler surfaces, dragged by a real pointer. Choosing between the two
is a genuine trade, not a workaround:

- **`react-native-gtkx/dnd` (the default)** — GDK animates a paintable of the
  dragged view above every window, with the desktop theme's own drag
  cursors, hit-testing against the real widget tree, and drops into _other_
  applications. The dragged view itself never moves.
- **the real `react-native-reanimated-dnd`** — the full upstream prop
  surface (`dragAxis`, `dragBoundsRef`, `dropAlignment`,
  `collisionAlgorithm`, and the rest), and the view genuinely moves under the
  pointer. No drag icon, no cross-application drop, and the drag stays
  confined to the app window.

See [Drag and drop](dnd.md) for what the mirror does and does not carry over
from upstream's own prop surface; the real package, once aliased off, has
upstream's behavior by definition.
