// The open task's editor — a conditional render inside the SAME screen as
// the list, never a push (see screens/content-screen.tsx for why that is
// the whole point of this example).
//
// Laid out as examples/tasks-app's editor is: a preferences group of
// fields, then Notes, then the read-only timestamps. Two rows exist here
// that tasks-app has no need for, and both are consequences of the
// navigator rather than taste:
//
// - **Done**. tasks-app completes a task with the row's checkbox, which
//   stays on screen because its editor sits in a pane beside the list.
//   Here the editor REPLACES the list inside one screen, so that checkbox
//   is not reachable while a task is open — without this switch there
//   would be no way to complete the task you are looking at.
// - **List**. Smart views mix lists together, and in the list body that is
//   covered by the row subtitle. The editor has no subtitle to borrow.
import {
  AdwActionRow,
  AdwClamp,
  AdwEntryRow,
  AdwPreferencesGroup,
  AdwSwitchRow,
} from "react-native-gtkx/adw"
import {
  GLib,
  Gtk,
  GtkBox,
  GtkButton,
  GtkCalendar,
  GtkLabel,
  GtkMenuButton,
  GtkPopover,
  GtkScrolledWindow,
  GtkTextBuffer,
  GtkTextView,
} from "react-native-gtkx/gtk"
import { formatDateTime, formatDue } from "../format"
import { useStore } from "../store"
import { detailNotes } from "../styles"
import type { Task, TaskList } from "../types"

export const TaskDetail = ({ task, list }: { task: Task; list?: TaskList }) => {
  const { setTitle, setNotes, setDue, toggleDone, toggleImportant } = useStore()
  const dueDate = task.due
    ? GLib.DateTime.newFromIso8601(task.due, null)
    : undefined

  return (
    <GtkScrolledWindow vexpand>
      <AdwClamp
        maximumSize={640}
        marginTop={24}
        marginBottom={24}
        marginStart={12}
        marginEnd={12}
      >
        <GtkBox
          orientation={Gtk.Orientation.VERTICAL}
          spacing={18}
        >
          <AdwPreferencesGroup>
            <AdwEntryRow
              title="Title"
              text={task.title}
              // Committed on Enter or the apply button, not on every
              // keystroke. `onNotifyText` (what this used to do) renamed the
              // task per character — visible as the HeaderBar title
              // stuttering mid-word, and, now that the document is written
              // to disk on every change, a file write per character too.
              // Same interaction examples/tasks-app uses.
              showApplyButton
              onApply={(self) => setTitle(task.id, self.text)}
              onEntryActivated={(self) => setTitle(task.id, self.text)}
            />
            <AdwSwitchRow
              title="Done"
              active={task.done}
              onNotifyActive={() => toggleDone(task.id)}
            />
            <AdwSwitchRow
              title="Important"
              active={task.important}
              onNotifyActive={() => toggleImportant(task.id)}
            />
            <AdwActionRow
              title="Due"
              suffix={
                <GtkBox
                  spacing={6}
                  valign={Gtk.Align.CENTER}
                >
                  {task.due ? (
                    <GtkButton
                      iconName="edit-clear-symbolic"
                      cssClasses={["flat", "circular"]}
                      accessibleLabel="Clear due date"
                      onClicked={() => setDue(task.id, null)}
                    />
                  ) : null}
                  <GtkMenuButton
                    label={formatDue(task.due) ?? "Set date"}
                    popover={
                      <GtkPopover>
                        <GtkCalendar
                          date={dueDate}
                          onDaySelected={(self) => {
                            // GtkCalendar has no time component; 18:00 is the
                            // same end-of-day convention the seed data uses,
                            // so "Today at 6:00 PM" reads consistently
                            // whichever way a due date got set.
                            const date = self.getDate()
                            const picked = new Date(
                              date.getYear(),
                              date.getMonth() - 1,
                              date.getDayOfMonth(),
                              18,
                              0,
                              0,
                            )
                            setDue(task.id, picked.toISOString())
                          }}
                        />
                      </GtkPopover>
                    }
                  />
                </GtkBox>
              }
            />
            <AdwActionRow
              title="List"
              subtitle={list?.name ?? "—"}
            />
          </AdwPreferencesGroup>

          <GtkBox
            orientation={Gtk.Orientation.VERTICAL}
            spacing={6}
          >
            <GtkLabel
              halign={Gtk.Align.START}
              cssClasses={["heading"]}
            >
              Notes
            </GtkLabel>
            <GtkScrolledWindow
              cssClasses={["card"]}
              heightRequest={160}
            >
              <GtkTextView
                wrapMode={Gtk.WrapMode.WORD_CHAR}
                cssClasses={[detailNotes]}
                buffer={
                  <GtkTextBuffer
                    // The buffer owns undo/redo, so Ctrl+Z inside the notes
                    // field is GTK's own rather than anything reimplemented
                    // over the store.
                    enableUndo
                    text={task.notes}
                    onChanged={(buffer) =>
                      setNotes(
                        task.id,
                        buffer.getText(
                          buffer.getStartIter(),
                          buffer.getEndIter(),
                          false,
                        ),
                      )
                    }
                  />
                }
              />
            </GtkScrolledWindow>
          </GtkBox>

          <AdwPreferencesGroup>
            <AdwActionRow
              cssClasses={["property"]}
              title="Created"
              subtitle={formatDateTime(task.createdAt)}
            />
            {task.completedAt ? (
              <AdwActionRow
                cssClasses={["property"]}
                title="Completed"
                subtitle={formatDateTime(task.completedAt)}
              />
            ) : null}
          </AdwPreferencesGroup>
        </GtkBox>
      </AdwClamp>
    </GtkScrolledWindow>
  )
}
