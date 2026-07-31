// The content pane: the task list, or the editor for the open task — ported
// from the gtkx tutorial (examples/tutorial/src/components/content-pane.tsx).
// A conditional render inside ONE AdwNavigationPage, not a push navigation —
// this is exactly why createStackNavigator does not fit this app (see
// window.tsx and README.md): there is no second page to push, the content
// pane's header itself changes shape by selection (filter toggle group vs.
// a back button), which a single static per-navigator header could not do
// either.
import {
  AdwHeaderBar,
  AdwToggle,
  AdwToggleGroup,
  AdwToolbarView,
  AdwWindowTitle,
} from "react-native-gtkx/adw"
import { GtkButton, GtkToggleButton } from "react-native-gtkx/gtk"
import { useStore } from "../store/index"
import { selectionKey } from "../store/selectors"
import { useRequestDeleteTask } from "./dialogs"
import { MainMenu } from "./main-menu"
import { TaskDetail } from "./task-detail"
import { TaskList } from "./task-list"

export const ContentPane = () => {
  const requestDeleteTask = useRequestDeleteTask()
  const tasks = useStore((state) => state.tasks)
  const selection = useStore((state) => state.selection)
  const selectedTaskId = useStore((state) => state.selectedTaskId)
  const closeTask = useStore((state) => state.closeTask)
  const setImportant = useStore((state) => state.setImportant)
  const filter = useStore((state) => state.filter)
  const setFilter = useStore((state) => state.setFilter)
  const searchMode = useStore((state) => state.searchMode)
  const setSearchMode = useStore((state) => state.setSearchMode)
  const task = tasks.find((candidate) => candidate.id === selectedTaskId)

  if (task) {
    return (
      <AdwToolbarView
        topBar={
          <AdwHeaderBar
            titleWidget={<AdwWindowTitle title={task.title} />}
            start={
              <GtkButton
                iconName="go-previous-symbolic"
                tooltipText="Back (Escape)"
                onClicked={closeTask}
              />
            }
            end={
              <>
                <GtkToggleButton
                  iconName={
                    task.important ? "starred-symbolic" : "non-starred-symbolic"
                  }
                  active={task.important}
                  tooltipText="Important"
                  onToggled={(self) => setImportant(task.id, self.active)}
                />
                <GtkButton
                  iconName="user-trash-symbolic"
                  tooltipText="Delete (Delete)"
                  onClicked={() => requestDeleteTask(task)}
                />
              </>
            }
          />
        }
      >
        <TaskDetail
          key={task.id}
          task={task}
        />
      </AdwToolbarView>
    )
  }

  return (
    <AdwToolbarView
      topBar={
        <AdwHeaderBar
          titleWidget={
            <AdwToggleGroup
              activeName={filter}
              cssClasses={["round"]}
              onNotifyActiveName={(name) => {
                if (name === "all" || name === "open" || name === "done") {
                  setFilter(name)
                }
              }}
            >
              <AdwToggle
                name="all"
                label="All"
              />
              <AdwToggle
                name="open"
                label="Open"
              />
              <AdwToggle
                name="done"
                label="Done"
              />
            </AdwToggleGroup>
          }
          start={
            <>
              <GtkButton
                iconName="list-add-symbolic"
                tooltipText="New Task (Ctrl+N)"
                actionName="win.new"
              />
              <GtkButton
                iconName="system-search-symbolic"
                tooltipText="Search (Ctrl+F)"
                onClicked={() => setSearchMode(!searchMode)}
              />
            </>
          }
          end={<MainMenu />}
        />
      }
    >
      <TaskList key={selectionKey(selection)} />
    </AdwToolbarView>
  )
}
