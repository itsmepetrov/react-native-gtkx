// Text formatting shared by the row and the editor. The due-date wording is
// the gtkx tutorial's own (and examples/tasks-app's port of it) — relative
// for anything within a week, absolute past that — kept identical on
// purpose so the two examples read the same in a screenshot.

/** AdwActionRow's title takes Pango markup when `useMarkup` is set, which
 *  is how a completed task gets a real strikethrough — so the task's own
 *  text has to be escaped before being embedded in it. */
export const escapeMarkup = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const startOfDay = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()

/** Relative to WHOLE days, not to 24-hour spans: a task due at 09:00
 *  tomorrow is "Tomorrow", whether it is now 23:00 or 01:00. */
export const formatDue = (iso: string | null): string | null => {
  if (!iso) {
    return null
  }
  const due = new Date(iso)
  const days = Math.round(
    (startOfDay(due) - startOfDay(new Date())) / 86_400_000,
  )
  const time = due.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
  if (days === 0) {
    return `Today at ${time}`
  }
  if (days === 1) {
    return `Tomorrow at ${time}`
  }
  if (days === -1) {
    return `Yesterday at ${time}`
  }
  if (days < 0) {
    return `${-days} days ago`
  }
  if (days < 7) {
    return due.toLocaleDateString([], { weekday: "long" })
  }
  return due.toLocaleDateString([], { month: "short", day: "numeric" })
}
