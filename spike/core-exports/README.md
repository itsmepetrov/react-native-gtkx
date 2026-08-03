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

`CORE_EXPORTS_SKIP_BUILD=1` skips the rebuild — and note what that means: `gtkx build` is what bundles the library INTO the probe, so with the flag set a library change (and any `npm run build:dist` after it) is invisible and the probe re-measures the previous bundle. It is for re-running the same code, not for comparing two versions of it. `npm run build && npm start`
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

## What it found, and what fixing it took

Every check passes now. Three of them did not, and the sequence is worth
keeping because the diagnosis was wrong twice before it was right — which is
the reason this app exists rather than a reading of the libraries' sources.

**Cause one: an unstyled scrollable was never a viewport.** A `ScrollView`
with no style of its own grew to its content instead of filling its parent, so
its scroll range stayed empty and `onScroll` never fired. It now carries RN's
own base style (`flexGrow: 1, flexShrink: 1`, composed under the app's), and
the probe proves the difference in isolation next to its controls: `<FlatList
/>` with no style in a bounded parent scrolls (`row-one y 406 -> 278`, where it
used to report `170 -> 170`).

**Cause two: the sheet's list had no bounded parent, and the reason was not
the one on the file.** gorhom bounds it with an animated `height` —
`contentMaskContainerAnimatedStyle` in `BottomSheetContent`, a
`useAnimatedStyle` returning `height: animate({point: …})` — and the list
reported `allocated height=792`, exactly its own content height (18 rows × 44).
That was written down as the driven-size carve-out's known limit: a size that
lives as a rect-store override, deliberately never written into Yoga, cannot
bound a child.

It was not. Instrumenting the style layer in a real run showed the height
arriving as `{kind: "spring", toValue: 543.4, …}` — an animation DESCRIPTOR,
never a number. `useAnimatedStyle` did not run animations returned from the
updater at all, so the driven-size path was never even asked: zero size slots,
zero refusals. The fix is `src/reanimated-compat/updater-animations.ts`, plus a
React render published when an animation on a property the platform refuses to
drive reaches its target, and at most one per 100 ms while it is on its way —
which needs the style object's IDENTITY to change, because
`BottomSheetDraggableView` is `memo`'d and a re-render of the component owning
the hook stops there. `docs/research/animated-size.md` §9 and §10 have the
numbers, and §10 is why the settle alone was not the end of it: gorhom derives
that height from the sheet's own POSITION, so the opening spring re-aims it on
every frame and it never settles at all — on a MOUNT (which this probe does not
photograph, and the gallery screen does) the mask stood at 96 px of a 954 px
target for 1.38 s with the list inside it mounting zero cells.

With that, the sheet's list reports `allocated height=468` (543 px of mask
minus 75 px of padding), receives 158 scroll events under the injected wheel,
and gorhom's own scroll LOCK is exercised in both directions: held at the top
while the sheet is collapsed, released once it is extended (`row-one y 240 ->
-84` under the identical wheel). `COLLAPSED` is deliberately gated on scroll
events having arrived — a list that cannot move satisfies "held at the top"
for free, and letting that count as a pass is exactly how "the sheet's list did
not move" gets recorded as a lock working.

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
