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
- a plain `ScrollView` and a plain `FlatList` scroll under an injected wheel,
  which is the control on the scroll checks below — "the sheet's list did not
  move" and "the wheel never arrived" look identical without it;
- **the negative control**: a zone the pointer never visits reports every
  touch it receives, and must receive none. A Wayland pointer is addressed by
  position, not by focus, so without this the other three prove only that
  something happened somewhere.

## The checks that fail, and why they are kept

`the sheet's own scrollable receives scroll events at all` — **it receives
none**, in either sheet state — and with it the two halves of the lock,
`COLLAPSED` and `EXTENDED`.

This is `@gorhom/bottom-sheet`'s scroll LOCK: while the sheet is collapsed,
`useScrollEventsHandlersDefault` holds its scrollable at the top by calling
Reanimated's `scrollTo` from every scroll event, and releases it once the
sheet is extended. Both halves are implemented on this platform. The lock
still cannot run, because **no scroll event is ever produced** — and the
reason is one layer below scrolling entirely, in layout.

**The first cause is fixed.** A scrollable with no style of its own did not
become a viewport at all: it grew to its content, so its scroll range stayed
empty and `onScroll` never fired. It now carries RN's own base style
(`flexGrow: 1, flexShrink: 1`, composed under the app's style), and the probe
proves the difference in isolation next to its controls — `<FlatList />` with
no style in a bounded parent scrolls (`row-one y 406 -> 278`, where it used to
report `170 -> 170`).

**The second cause is not, and it is why these checks still fail.** That base
style can only make a scroller fill a **bounded** parent, and gorhom's parent
is not bounded here. gorhom bounds its list with an animated `height` —
`contentMaskContainerAnimatedStyle` in `BottomSheetContent`, a `useAnimatedStyle`
returning `height: animate({point: ...})` on the content-mask container — and
that height is not reaching the Yoga node on this platform. The probe measures
it directly: the sheet's list reports `allocated height=792`, which is exactly
its own content height (18 rows x 44), so its parent is content-sized rather
than sheet-sized. Everything else about the sheet works, which is what makes
the diagnosis specific: it snaps between detents and the handle drag moves it
(`handle y 531 -> 212`), so the container height and the detents are known and
`translateY` is applied — it is the animated **height**, a layout property,
that is not.

So the failing checks are not scroll-event findings at all; they are LAYOUT
ones, and they are left failing rather than removed because they name the next
thing to fix. `COLLAPSED` is deliberately gated on scroll events having
arrived: a list that cannot move satisfies "held at the top" for free, and
letting that count as a pass is exactly how "the sheet's list did not move"
gets recorded as a lock working.

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
