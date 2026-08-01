# Upstream draft: empty AdwShortcutsDialog reports a negative minimum height

Status: verified, not yet filed. Not found in libadwaita's issue tracker
(searched `AdwWrapBox`, `WrapBox`, `min height`, `-12`, `sizes must be`,
`shortcuts dialog`, `ShortcutsDialog`, `empty shortcuts` — the closest hits,
#1129 "GTK warnings opening an AdwShortcutsDialog" and #1049
"shortcuts-dialog: Criticals when using a non-resizable window", are both
closed and about unrelated warnings). MR !1356 ("AdwWrapBox fixes") predates
this: merged December 2024, long before the version this was verified
against. Not fixed in the current stable release.

Below is the report as intended for GNOME/libadwaita's GitLab. Title and
body are separated for easy copy-paste; nothing here mentions
react-native-gtkx, since the repro needs none of it.

---

## Title

`AdwShortcutsDialog` with no sections logs `AdwWrapBox … reported min
height -12, but sizes must be >= 0`

## Summary

Presenting an `AdwShortcutsDialog` that has zero `AdwShortcutsSection`
children logs a `Gtk-WARNING` from an internal `AdwWrapBox` reporting a
negative minimum height, during `present()`, before the dialog is shown or
anything is measured by the caller. A dialog with at least one section does
not warn.

## Steps to reproduce

Minimal C, no application window content beyond the dialog itself:

```c
// bug1.c
// Build: gcc bug1.c -o bug1 $(pkg-config --cflags --libs gtk4 libadwaita-1)
#include <adwaita.h>

static gboolean quit_cb(gpointer app) {
  g_application_quit(G_APPLICATION(app));
  return G_SOURCE_REMOVE;
}

static void activate(GtkApplication *app, gpointer user_data) {
  AdwWindow *win = ADW_WINDOW(adw_window_new());
  gtk_window_set_application(GTK_WINDOW(win), app);
  gtk_window_present(GTK_WINDOW(win));

  AdwShortcutsDialog *dialog = ADW_SHORTCUTS_DIALOG(adw_shortcuts_dialog_new());
  adw_dialog_present(ADW_DIALOG(dialog), GTK_WIDGET(win));

  g_timeout_add(300, quit_cb, app);
}

int main(int argc, char **argv) {
  adw_init();
  GtkApplication *app =
      gtk_application_new("org.example.Bug1", G_APPLICATION_DEFAULT_FLAGS);
  g_signal_connect(app, "activate", G_CALLBACK(activate), NULL);
  int status = g_application_run(G_APPLICATION(app), argc, argv);
  g_object_unref(app);
  return status;
}
```

Run it and the warning appears immediately, before the 300 ms timeout fires
and closes the window:

```
$ ./bug1
(process:52169): Gtk-WARNING **: AdwWrapBox 0xbfd6d43656d0 (wrap-box) reported min height -12, but sizes must be >= 0
(process:52169): Gtk-WARNING **: AdwWrapBox 0xbfd6d43656d0 (wrap-box) reported min height -12, but sizes must be >= 0
```

### Control (does not warn)

The same dialog with a single, empty `AdwShortcutsSection` added is silent:

```c
AdwShortcutsDialog *dialog = ADW_SHORTCUTS_DIALOG(adw_shortcuts_dialog_new());
AdwShortcutsSection *section = ADW_SHORTCUTS_SECTION(adw_shortcuts_section_new("Test"));
adw_shortcuts_dialog_add(dialog, section);
adw_dialog_present(ADW_DIALOG(dialog), GTK_WIDGET(win));
```

Verified both ways on the environment below — zero sections warns twice per
present(), one section is silent.

## Expected behavior

No warning either way; a widget's reported minimum size should never be
negative, and an _empty_ container is the case most obligated to report
`[0, 0]` rather than a negative number.

## Actual behavior

```
Gtk-WARNING **: AdwWrapBox 0x… (wrap-box) reported min height -12, but sizes must be >= 0
```

Logged twice per `present()` (once for the minimum-size query, once for
natural size, both landing on the same negative value in this case).

## Impact

This is not cosmetic-only noise confined to one app: `AdwShortcutsDialog` is
the documented, recommended replacement for `GtkShortcutsWindow`, and is
commonly presented from an action with no guard against a section list that
is empty at the time of construction (e.g. filled asynchronously, or reached
before content is registered). Every consumer that presents one before
populating it gets this warning on stderr — in a flatpak sandbox or under
`G_DEBUG=fatal-warnings` (common in test suites and CI) this is a hard
failure, not just log noise.

## Root cause (built from source and instrumented — corrected from an earlier guess)

The internal wrap box lives at `src/adw-shortcuts-dialog.ui` as `nav_box`
(an `AdwWrapBox`, styled `.navigation-box`, used for the dialog's
section-navigation row). It is tempting to blame the `n_lines - 1`
line-spacing arithmetic in `adw_wrap_layout_measure()` (`src/adw-wrap-layout.c`)
for an empty-box negative value — that was our first guess too, before
building libadwaita from source and instrumenting the measure path directly
to check it. It does not hold up: with zero children, `adw_wrap_layout_measure()`
takes its early "trivial case" branch (`multiple_visible_children` is false,
`visible_child` is NULL) and returns a plain `[0, 0]` _before_ the
line-spacing arithmetic ever runs. Instrumented, confirmed: for this exact
repro the function is entered twice (width and height) and both times exits
through `DEBUG-TRIVIAL-EMPTY`, min/nat = 0/0.

The real mechanism is CSS, not arithmetic. `src/stylesheet/widgets/_shortcuts-dialog.scss`:

```scss
.navigation-box {
  margin-top: -12px;
  ...
}
```

GTK's own `gtk_widget_measure()` adds a widget's CSS margin on top of
whatever its layout manager reports. With `nav_box` empty, content height is
`0` (from the trivial branch above), and the combined size becomes
`0 + (-12px margin) = -12` — computed entirely inside GTK core's own
generic bounds check, not inside any libadwaita arithmetic. Removing the
`-12px` (or giving the box any content) makes the warning disappear, which
we verified directly by editing the built stylesheet and rebuilding.

The `-12px` is intentional: normal use never leaves this row empty long
enough to matter, because `adw-shortcuts-dialog.c` already has logic to
hide `nav_group` (the parent of `nav_box`) whenever there is nothing to
navigate between:

```c
// src/adw-shortcuts-dialog.c, update_nav_visibility()
gboolean has_many_sections = g_list_model_get_n_items (...) >= N_MIN_SECTIONS;
gboolean has_many_shortcuts = g_list_model_get_n_items (...) >= N_MIN_SHORTCUTS;
gtk_widget_set_visible (GTK_WIDGET (self->nav_group),
                        has_many_sections && has_many_shortcuts);
```

`update_nav_visibility()` (via `update_stack()`) is correct — the actual gap
is that it only ever runs _reactively_, wired to `"items-changed"` on the
section list model (`adw_shortcuts_dialog_init()`, `g_signal_connect_object
(self->title_sections, "items-changed", ...)`). A dialog that never has a
section added never gets that first change notification, so it never runs
even once, and `nav_group` stays at the `.ui` template's default — visible,
with nothing in it — for the dialog's entire lifetime. It is a missing
initial sync, not a bad formula: calling the existing `update_stack(self)`
once at the end of `adw_shortcuts_dialog_init()` is enough, and a dialog
that starts with zero sections then reaches the exact state a later mutation
would already put it in.

We built libadwaita 1.9.1 from source in a clean VM and confirmed all of
the above directly, including that the one-line fix removes the warning
with no change to the "many sections" case (nav row still shows once
thresholds are met) or the "one section" case (already correctly hidden,
unaffected). Happy to attach the patch (~12 lines, plus a test) to the
issue or open it as a linked merge request — whichever this project
prefers.

## Environment

- libadwaita 1.9.1-0ubuntu0.1 (`libadwaita-1-0:arm64`)
- GTK 4.22.4+ds-0ubuntu0.1 (`libgtk-4-1:arm64`)
- Ubuntu 26.04 LTS (Resolute Raccoon), kernel 7.0.0-28-generic, aarch64
- Reproduced under a headless wlroots (sway 1.11) Wayland compositor;
  nothing about the bug is backend- or architecture-specific — it is a pure
  arithmetic error in the measure path, hit before any surface is composited.
