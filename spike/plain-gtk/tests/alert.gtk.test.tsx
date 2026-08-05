// Integration: Alert.alert mapped onto Gtk.AlertDialog — this project's own
// gtkx.config.ts declares no Adw-1, so this is genuinely the plain-GTK
// fallback branch of src/apis/host.gtkx.ts (adwAvailable() === false), not
// the Adw path packages/react-native-gtkx/tests/gtk/apis/alert.test.tsx
// exercises. Same shape as that file on purpose — the twin task 003 asked
// for (.claude/epics/adw-optional/003.md): same buttons, same callbacks,
// same cancel mapping, proven against a real Gtk.AlertDialog instead of a
// real Adw.AlertDialog.
import { Alert } from "react-native"
import { Gtk, GtkLabel } from "react-native-gtkx/gtk"
import { fireEvent, render, screen, waitFor } from "react-native-gtkx/testing"
import { expect, it, vi } from "vitest"

// A raw GTK widget, not react-native-gtkx's own <Text> — @gtkx/testing's
// render() mounts into its own bare harness, not a react-native-gtkx <Root>,
// so an RN component needing HostNodeContext (<Text>, <View>, ...) would
// throw "must be rendered inside AppRegistry.runApplication() or a <Root>"
// here; a raw widget has no such dependency, same choice the Adw twin
// (packages/react-native-gtkx/tests/gtk/apis/alert.test.tsx) makes.

it("shows a single OK button when called without buttons", async () => {
  await render(<GtkLabel label="alert host" />)

  Alert.alert("Hello", "A message body")

  const ok = await screen.findByRole(Gtk.AccessibleRole.BUTTON, { name: "OK" })
  expect(ok).toBeTruthy()
  await fireEvent(ok, "clicked")
  await waitFor(() => {
    expect(
      screen.queryByRole(Gtk.AccessibleRole.BUTTON, { name: "OK" }),
    ).toBeNull()
  })
})

it("resolves the pressed button's callback", async () => {
  await render(<GtkLabel label="alert host" />)

  const onCancel = vi.fn()
  const onDelete = vi.fn()
  Alert.alert("Delete file?", "This cannot be undone.", [
    { text: "Cancel", style: "cancel", onPress: onCancel },
    { text: "Delete", style: "destructive", onPress: onDelete },
  ])

  const deleteButton = await screen.findByRole(Gtk.AccessibleRole.BUTTON, {
    name: "Delete",
  })
  await fireEvent(deleteButton, "clicked")

  await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1))
  expect(onCancel).not.toHaveBeenCalled()
})

it("maps the cancel button and leaves other callbacks untouched", async () => {
  await render(<GtkLabel label="alert host" />)

  const onCancel = vi.fn()
  const onConfirm = vi.fn()
  Alert.alert("Save changes?", undefined, [
    { text: "Discard", style: "cancel", onPress: onCancel },
    { text: "Save", isPreferred: true, onPress: onConfirm },
  ])

  const discard = await screen.findByRole(Gtk.AccessibleRole.BUTTON, {
    name: "Discard",
  })
  await fireEvent(discard, "clicked")

  await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1))
  expect(onConfirm).not.toHaveBeenCalled()
})
