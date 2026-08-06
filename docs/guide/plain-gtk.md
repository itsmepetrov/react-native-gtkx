# Running without libadwaita

react-native-gtkx runs on plain GTK4, with no libadwaita dependency at
all. This is a real, supported profile, not an unsupported edge case —
useful for a non-GNOME desktop environment where linking libadwaita buys
nothing.

## Choosing the profile

Drop `"Adw-1"` from `gtkx.config.ts`'s `libraries`:

```ts
import { defineConfig } from "@gtkx/config"

export default defineConfig({
  libraries: ["Gtk-4.0"],
  applicationId: "com.example.myapp",
})
```

An app configured this way never links libadwaita: no Adwaita theming,
no `Adw.StyleManager`, no Adwaita widgets. The choice is per-app, made
once, at the `gtkx.config.ts` level — there's no runtime flag to flip
between the two profiles in a single build.

react-native-gtkx's own bridge is split to make this possible: a core
module with zero Adw imports covers everything `View`/`Text`/
`ScrollView`/`Modal`/`Animated`/gestures/`FlatList` and the rest of the
portable surface need, and a separate Adw module is loaded only when the
app's codegen store actually has Adw bindings.

## What still works

Three parts of the API fall back to a plain-GTK equivalent, so the same
app code runs on both profiles without branching on which one it got:

- **`AppRegistry`**'s `chrome: "content"` falls back to the plain
  `GtkApplicationWindow` chrome that `chrome: "system"` always uses,
  instead of throwing. This is why requesting `chrome: "content"`
  unconditionally is the right default for a portable app: HeaderBar-as-
  chrome where Adw exists, an ordinary window chrome where it doesn't,
  with no `if (adwAvailable())` branch of the app's own to write.
  `breakpoints` degrades the same way `chrome: "content"` under the
  wrong chrome always has — accepted, ignored, one dev warning — naming
  `"Adw-1"` as the reason instead of the chrome mismatch.
- **`Alert.alert`** falls back to `Gtk.AlertDialog` (GTK ≥ 4.10),
  preserving button order, default/cancel mapping and callbacks. Lost:
  `destructive`/`isPreferred` appearance, and `cancelable: false` with no
  cancel-style button.
- **`Appearance`/`useColorScheme`** fall back to the
  `org.freedesktop.appearance` desktop portal's `color-scheme` setting
  (with live updates via its `SettingChanged` signal), then to
  `Gtk.Settings:gtk-application-prefer-dark-theme` when no portal
  answers. The contract is identical either way: always `"light"`/
  `"dark"`, change events still fire, and `setColorScheme` is local to
  the process on both profiles, never a system-wide write.

## What refuses

Two subpaths need Adw unconditionally and refuse to import without it:
`react-native-gtkx/adw` (the Adwaita widget bindings) and
`react-native-gtkx/navigation` (built on `AdwHeaderBar`/
`Adw.NavigationView`). Importing either on the plain-GTK profile throws,
naming the fix:

```
[react-native-gtkx] "@gtkx/jsx/adw" requires "Adw-1" in this app's
gtkx.config.ts `libraries` — see the plain-GTK profile documentation for
what needs Adw unconditionally and what falls back without it.
```

`react-native-gtkx/common`'s `NavigationStack`/`NavigationStackPage` are
the same story at component granularity rather than import granularity:
the subpath itself imports fine (its barrel also carries Adw-free
exports — `Widget`, `Icon`, `SlotContent`), and only actually
**rendering** one of these two throws, naming the component instead of
the raw specifier. There's no fallback to degrade to for either one —
this platform ships no non-Adwaita stand-in for `Adw.NavigationView`.

## How the profile is detected

Nothing in application code needs to check which profile it's running
on — the three fallbacks above and the two refusals handle it — but the
mechanism is worth knowing when debugging a build: the platform asks a
single question, "does this app's codegen store actually have Adw
bindings", answered differently on each toolchain:

- On the Metro/SEA host, the run-linux host resolves every module
  (including the Adw ones, when declared) into a global registry before
  the bundle ever runs; a plain-GTK app simply has no Adw entry there,
  which is the expected, normal shape rather than a broken install.
- On the vite path (`gtkx dev`/`gtkx build`), a build-time constant is
  set from whether `@gtkx/gi/adw` actually resolves out of the app's own
  `node_modules` — decided once, when vite starts.
- Anywhere else (a bare `vitest` project, for instance), a dynamic-
  import probe answers the same question at runtime.

All three answer the one question the bridge asks internally —
"is Adw available in this app" — consistently, regardless of which
toolchain built the app.
