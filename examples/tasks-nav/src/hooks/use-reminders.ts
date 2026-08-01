// Sweeps for tasks coming due and fires one reminder each. Plain
// React/Node — nothing platform-specific lives here, which is why the
// notification itself is built elsewhere (src/notifications.ts) and handed
// in as `sendReminder`.
import { useEffect, useRef } from "react"
import type { Task } from "../types"

export const useReminders = (
  tasks: Task[],
  reminderMinutes: number,
  sendReminder: (task: Task) => void,
): void => {
  // A ref, not state: remembering that a task was already notified must not
  // itself cause a render, and it has to survive the effect re-running when
  // `tasks` changes — which is on every single edit.
  const notified = useRef(new Set<string>())

  useEffect(() => {
    const sweep = (): void => {
      const nowMs = Date.now()
      const leadMs = reminderMinutes * 60_000
      for (const task of tasks) {
        if (
          task.done ||
          task.deleted ||
          !task.due ||
          notified.current.has(task.id)
        ) {
          continue
        }
        const remaining = new Date(task.due).getTime() - nowMs
        // Strictly in the future and inside the lead window: an already
        // overdue task does not fire a reminder on every launch forever.
        if (remaining > 0 && remaining <= leadMs) {
          sendReminder(task)
          notified.current.add(task.id)
        }
      }
    }
    sweep()
    const handle = setInterval(sweep, 60_000)
    return () => clearInterval(handle)
  }, [tasks, reminderMinutes, sendReminder])
}
