# core-exports — the probe that says which libraries run, and why

`react-native-draggable-flatlist` 4.0.3 and `@gorhom/bottom-sheet` 5.2.14,
from their published tarballs, unedited, built by the real `gtkx build` with
the presets' aliases in place and then driven by a real
`zwlr_virtual_pointer_v1`.

**It exists because reading a library's imports predicts the wrong answer.**
Three times in this epic a list of blockers was derived from sources, and
twice it was wrong — most memorably `react-native-gesture-handler`'s
scrollable re-exports, named as the wall and not the wall, because
`createAnimatedComponent` reads only `displayName` and `name` and a refusing
stand-in answers both. A build resolves every specifier for real and stops at
the first thing that is genuinely missing, in the order the module graph
reaches it; and then a RUNNING app finds the rest, which no build can. Of the
walls these two libraries hit, four were missing exports and three only
appeared after the first render.

## Running it

```bash
# in the VM, once
npm install                          # in this directory
# then
bash spike/core-exports/run-headless.sh
```

It builds, starts a PRIVATE headless sway (never the user's session — the
pointer is injected at absolute output coordinates), fullscreens the window
so window coordinates and output coordinates coincide, drags a list row and
then the sheet's handle, and prints `[core-exports]` lines. Logs and
screenshots land in `/tmp/core-exports/`.

`CORE_EXPORTS_SKIP_BUILD=1` skips the rebuild. `npm run build && npm start`
opens the window to drag by hand instead.

## What it asserts, and the controls

- the window really fills the output — every coordinate below is a window
  coordinate injected as an output one, so if that is false nothing after it
  means anything;
- a row of the draggable list changes place under a real drag, measured with
  `measureInWindow` on the row rather than from a value the app stored;
- the sheet moves up under a real drag of its handle;
- **the negative control**: a zone the pointer never visits reports every
  touch it receives, and must receive none. A Wayland pointer is addressed by
  position, not by focus, so without this the other three prove only that
  something happened somewhere.

## Deliberate choices

- **Unminified, with source maps** (`vite.config.ts`), run under
  `node --enable-source-maps`. The value of this app is the stack trace of
  whatever it hits next, and `at d (bundle.js:16:107976)` names nothing.
- **Fullscreened by TITLE, not by app_id.** gtkx does not set a Wayland
  app_id from `applicationId`, so every app on this platform arrives as
  `GTK Application`.
- **The zones are `View` wrappers written for the probe**, not refs onto the
  libraries' own components: a ref into a library measures whatever that
  library happened to render this frame.
