// Sweeps upcoming due dates and fires a reminder once per task — ported
// from the gtkx tutorial (examples/tutorial/src/hooks/use-reminders.ts).
// Plain React/Node logic, nothing platform-specific.
import { useEffect, useRef } from "react"
import type { Task } from "../types"

export const useReminders = (
  tasks: Task[],
  reminderMinutes: number,
  sendReminder: (task: Task) => void,
): void => {
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
