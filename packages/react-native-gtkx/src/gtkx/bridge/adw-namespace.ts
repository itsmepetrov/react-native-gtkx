// A plain, EAGER, static re-export of the real `@gtkx/gi/adw` namespace —
// deliberately NOT behind adw.ts's probe.
//
// Why this needs to exist separately from adw.ts: react-native-gtkx/adw's
// public `Adw` export (toast.tsx, window.tsx and adwaita-stack.tsx in the
// examples all import it as a plain named value off that one subpath, then
// use it BOTH as a value — `Adw.Toast.new(title)` — and as a namespace in
// type position — `Ref<Adw.ToastOverlay | null>`) needs that same duality
// gtkx's own `import * as Adw from "@gtkx/gi/adw"` gives for free. That
// duality is a property of the IMPORT STATEMENT itself: TypeScript only
// treats an identifier as usable in both spaces when it traces back to an
// actual namespace import, forwarded by a bare re-export (`export { X }
// from` a specifier) — introduce a local binding anywhere in the chain (an
// `import type` alongside a `const`, or a value synthesized by calling a
// function) and the type half is lost, which is exactly what broke when
// adw/index.ts first tried to build `Adw` from adw.ts's requireAdwGi().
//
// So this file exists purely to be the START of that re-export chain, and
// nothing imports it except adw/index.ts (and only for this one name) —
// never gtkx/bridge/core.ts, app-registry.tsx or host.gtkx.ts, which is
// exactly what keeps the plain-GTK profile buildable: those three reach for
// adw.ts's LAZY probe instead, and this file's static import never enters
// their module graph.
import * as Adw from "@gtkx/gi/adw"

export { Adw }
