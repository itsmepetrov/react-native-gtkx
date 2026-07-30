// Integration: Alert.alert mapped onto Adw.AlertDialog. The dialog's response
// buttons are queried by role and activated via fireEvent("clicked") — direct
// signal emission exercises the real Adw response wiring (button -> response
// -> choose() -> RN callback) without depending on where the dialog lands on
// screen.

import { fireEvent, render, screen, waitFor } from "@gtkx/testing"
import { expect, it, vi } from "vitest"
import { Alert } from "../../../src/apis/index"
import { Gtk, GtkLabel } from "../../../src/gtkx/bridge/index"

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
