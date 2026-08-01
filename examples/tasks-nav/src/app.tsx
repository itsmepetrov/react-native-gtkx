// The window's whole structure — ONE createSidebarNavigator, nothing built
// directly on AdwNavigationSplitView/AdwNavigationPage/AdwActionRow. This is
// the proof the PRD asked for: an app of examples/tasks-app's navigational
// shape (smart views + colored user lists in a sidebar; a content pane that
// shows a task list or an open task's editor), written through the
// navigator instead of around it.
import { NavigationContainer } from "@react-navigation/native"
import schema from "#data/dev.rngtkx.tasksnav.gschema.xml"
import { useCallback, useEffect, useRef } from "react"
import { AdwToastOverlay, type Adw } from "react-native-gtkx/adw"
import { GtkButton, useApplication, useSetting } from "react-native-gtkx/gtk"
import { createSidebarNavigator } from "react-native-gtkx/navigation"
import { Dialogs } from "./components/dialogs"
import { WindowChrome } from "./components/window-chrome"
import { isToday } from "./format"
import { useReminders } from "./hooks/use-reminders"
import { buildReminder } from "./notifications"
import { ContentScreen } from "./screens/content-screen"
import { StoreProvider, useStore } from "./store"
import { applyColorScheme } from "./theme"
import { ToastProvider } from "./toast"
import type { SmartView, Task } from "./types"

const Sidebar = createSidebarNavigator()

// Route names encode which family a screen belongs to — the shared
// ContentScreen below reads this back apart from any params.
export const smartViewRoute = (view: SmartView): string => `smart:${view}`
export const listRoute = (listId: string): string => `list:${listId}`

const TasksNav = () => {
  const { lists, tasks, showDialog } = useStore()
  const application = useApplication()
  const toastOverlayRef = useRef<Adw.ToastOverlay | null>(null)
  const [colorScheme] = useSetting(schema, "color-scheme")
  const [reminderMinutes] = useSetting(schema, "reminder-minutes")

  useEffect(() => {
    applyColorScheme(colorScheme)
  }, [colorScheme])

  // Addressed by the task's own id, so a re-send for the same task replaces
  // its banner instead of stacking a second one.
  const sendReminder = useCallback(
    (task: Task) => application.sendNotification(task.id, buildReminder(task)),
    [application],
  )
  useReminders(tasks, reminderMinutes, sendReminder)

  // Open tasks only — a badge that counted completed ones would never go
  // down, which is what examples/tasks-app's `sidebarCounts` already says
  // by filtering `!done`. This example used to count them.
  const openCount = (predicate: (task: Task) => boolean) =>
    tasks.filter((task) => !task.deleted && !task.done && predicate(task))
      .length

  const trashCount = tasks.filter((task) => task.deleted).length

  return (
    <ToastProvider overlayRef={toastOverlayRef}>
      {/* The overlay has to be ABOVE the navigator: a toast is drawn over
          the whole window, not inside whichever pane raised it. */}
      <AdwToastOverlay ref={toastOverlayRef}>
        <NavigationContainer>
          <Sidebar.Navigator
            sidebarTitle="Tasks (nav)"
            // The sidebar pane's own header — where GNOME, and the gtkx
            // tutorial this app family is modelled on, puts a sidebar's
            // "add" action: next to the pane title. It used to sit on the
            // CONTENT header instead, because the navigator gave an app no
            // way into this one. That header already carries "New Task", so
            // the window showed two identical + buttons with nothing to
            // tell them apart. Closing that gap is `sidebarHeaderLeft` /
            // `sidebarHeaderRight` / `sidebarHeaderTitle` (docs/api.md);
            // this is the call site that wanted it.
            sidebarHeaderLeft={() => (
              <GtkButton
                iconName="list-add-symbolic"
                tooltipText="New List"
                onClicked={() => showDialog("new-list")}
              />
            )}
            collapseWidth={500}
            // This app's own narrow floor, measured rather than guessed: the
            // collapsed content HeaderBar (the split view's back button, New
            // Task, Search, the All/Open/Done toggle group as headerTitle,
            // the main menu, and the window controls) asks for 469px, and a
            // segmented control cannot ellipsize the way a title label does.
            // Left at the 360px default the window kept shrinking past that
            // and Adwaita clipped the pane — the task list ran off the right
            // edge with its star/trash buttons cut away. 480 still sits below
            // collapseWidth, so the collapsed layout is fully reachable.
            minWidth={480}
            // No `contentLayout: "widget"` any more. Every screen's body is
            // React Native now — ScrollView/View/Text/TextInput plus
            // `common`'s List and ListRow — which is what this project's
            // showcase should be showing. The option itself stays supported
            // (examples/bottom-sheet still uses that shape); see
            // screens/content-screen.tsx for what closing the last gap took.
          >
            <Sidebar.Screen
              name={smartViewRoute("all")}
              component={ContentScreen}
              options={{
                title: "All Tasks",
                icon: "view-list-symbolic",
                count: openCount(() => true),
              }}
            />
            <Sidebar.Screen
              name={smartViewRoute("today")}
              component={ContentScreen}
              options={{
                title: "Today",
                icon: "x-office-calendar-symbolic",
                count: openCount((task) => isToday(task.due)),
              }}
            />
            <Sidebar.Screen
              name={smartViewRoute("important")}
              component={ContentScreen}
              options={{
                title: "Important",
                icon: "starred-symbolic",
                count: openCount((task) => task.important),
              }}
            />
            {/* Dynamic: one screen per user list, added/removed as `lists`
                changes at runtime — proves createSidebarNavigator (TabRouter)
                tolerates a changing screen set, not just a fixed tab bar. */}
            {lists.map((list) => (
              <Sidebar.Screen
                key={list.id}
                name={listRoute(list.id)}
                component={ContentScreen}
                options={{
                  title: list.name,
                  color: list.color,
                  count: openCount((task) => task.listId === list.id),
                }}
              />
            ))}
            <Sidebar.Screen
              name={smartViewRoute("trash")}
              component={ContentScreen}
              options={{
                title: "Trash",
                icon: "user-trash-symbolic",
                count: trashCount,
              }}
            />
          </Sidebar.Navigator>
        </NavigationContainer>
      </AdwToastOverlay>
      {/* A sibling of the navigator, not a child of any screen: an
          Adw.Dialog presents itself onto the window rather than being laid
          out where it is written. */}
      <Dialogs />
      {/* The window's actions and its global shortcuts, inside the app tree
          on purpose: the Delete shortcut raises the undo toast through
          useToast(), and win.new reads the store — neither can see a
          provider from outside. */}
      <WindowChrome />
    </ToastProvider>
  )
}

// The store's provider is the app's outermost component. Everything that
// used to be a runApplication option — the actions, the shortcut controller —
// now renders inside it (see TasksNav above and store.tsx for why that
// matters).
export const App = () => (
  <StoreProvider>
    <TasksNav />
  </StoreProvider>
)
