// Window and application actions declared IN the app tree, not around it.
//
// `AppRegistry.runApplication`'s `windowActions`/`windowControllers`/
// `applicationActions` options build their children as props of the window
// AppRegistry creates — SIBLINGS of the app's own tree. Nothing inside the
// app is above them, so no context of the app's reaches them: a `win.new`
// action could not read a React context store, and `examples/tasks-nav` had
// to rewrite its store as a module-level external one before Ctrl+N could
// see any app state at all.
//
// These components invert that. They are portals in React's own sense: the
// children stay where they are written — inside whatever providers,
// navigators and screens surround them, with their own state and effects —
// while the registration lands on the window or the application. Three
// things follow, and all three are the point:
//
// - context works, because the declaration IS a descendant of its provider;
// - registration is dynamic: an action is added when the component that
//   needs it mounts and removed when it unmounts, so a single screen can
//   own its own actions instead of the process owning all of them forever;
// - it composes: two unrelated subtrees can each declare their own without
//   meeting in one options object.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react"
import {
  createSlotPortal,
  GSimpleAction as GtkxSimpleAction,
  useApplication,
  useParentWindow,
} from "../gtkx/bridge/index"

/**
 * The action map an enclosing {@link WindowActions} / {@link ApplicationActions}
 * registers into, plus the GTK prefix its children answer to. Carried through
 * React context, so a `GSimpleAction` nested arbitrarily deep — inside a
 * component of the app's own, not just as a direct child — still finds it.
 */
type ActionScope = {
  /** The `Gio.ActionMap` (a window or the application). Registry key, too. */
  target: object
  /** "win" or "app": what an `actionName` has to say to reach these. */
  prefix: string
}

const ActionScopeContext = createContext<ActionScope | null>(null)

// One live claim on one action name. `notify` is the claimant's own
// useSyncExternalStore callback, so the registry can tell the next in line
// that the name has come free.
type NameClaim = { notify: () => void }

// Claims per action map, in mount order. A WeakMap so a closed window's
// bookkeeping goes away with the window.
const claimsByScope: WeakMap<object, Map<string, NameClaim[]>> = new WeakMap()

const queueFor = (target: object, name: string): NameClaim[] => {
  let names = claimsByScope.get(target)
  if (!names) {
    names = new Map()
    claimsByScope.set(target, names)
  }
  let queue = names.get(name)
  if (!queue) {
    queue = []
    names.set(name, queue)
  }
  return queue
}

/**
 * Arbitrates one action name inside one scope, and answers "may I register?".
 *
 * FIRST DECLARATION WINS, and a second one is ignored with a development
 * warning. That is not a coin toss between first and last: `Gio.ActionMap`
 * is name-keyed on BOTH ends — `addAction` replaces a same-named action
 * silently, and `removeAction` takes a NAME, not the action object. So with
 * "last wins" the first unmount of either declaration removes whatever
 * currently answers to that name, leaving the other one mounted but dead.
 * First-wins is the only order in which release always happens before
 * acquire: the loser never registers at all, and when the winner unmounts
 * (removing its own action, correctly) the next claimant is notified and
 * registers afterwards, in a later commit.
 *
 * The claim queue is an external store, so it is read as one: the claim is
 * made when React subscribes and dropped when it unsubscribes, which is also
 * what puts the hand-off after the departing owner's own deregistration
 * rather than racing it.
 *
 * With no scope (a `GSimpleAction` handed to `<GtkApplicationWindow
 * actions={…}>` directly, the pre-existing path) there is nothing to
 * arbitrate and the action always renders.
 */
const useIsNameOwner = (scope: ActionScope | null, name: string): boolean => {
  const claimRef = useRef<NameClaim | null>(null)

  const subscribe = useCallback(
    (notify: () => void) => {
      if (scope === null) {
        return () => undefined
      }
      const queue = queueFor(scope.target, name)
      const claim: NameClaim = { notify }
      queue.push(claim)
      claimRef.current = claim

      if (queue.length > 1 && process.env.NODE_ENV !== "production") {
        console.warn(
          `[react-native-gtkx] the action "${scope.prefix}.${name}" is declared by ${queue.length} mounted components at once. ` +
            `The first one to mount stays registered and this one is ignored — GTK removes an action by NAME, so letting the ` +
            `newest win would let whichever declaration unmounts first take the name down with it. Give them distinct names, ` +
            `or move the declaration to one place both can reach.`,
        )
      }

      return () => {
        const index = queue.indexOf(claim)
        claimRef.current = null
        if (index === -1) {
          return
        }
        const wasOwner = index === 0
        queue.splice(index, 1)
        if (wasOwner) {
          queue[0]?.notify()
        }
      }
    },
    [scope, name],
  )

  const getSnapshot = useCallback(() => {
    if (scope === null) {
      return true
    }
    const claim = claimRef.current
    return claim !== null && queueFor(scope.target, name)[0] === claim
  }, [scope, name])

  return useSyncExternalStore(subscribe, getSnapshot)
}

export type GSimpleActionProps = ComponentProps<typeof GtkxSimpleAction>

/**
 * A `Gio.SimpleAction`, declared as an element.
 *
 * Identical to gtkx's own element except for one thing: inside
 * {@link WindowActions} or {@link ApplicationActions} it takes part in name
 * arbitration, so two subtrees declaring the same action name produce a
 * warning and a predictable winner instead of a name that the first unmount
 * silently kills. Outside them it renders exactly as before.
 */
export const GSimpleAction = (props: GSimpleActionProps) => {
  const scope = useContext(ActionScopeContext)
  const name = typeof props.name === "string" ? props.name : ""
  const isOwner = useIsNameOwner(scope, name)
  return isOwner ? <GtkxSimpleAction {...props} /> : null
}

export type WindowActionsProps = {
  /** `GSimpleAction` elements, or any components that render them. */
  children?: ReactNode
}

/**
 * Registers its children as actions on the WINDOW — the `win.` prefix a
 * HeaderBar button's `actionName`, a `GMenu` item or an `actionAccels` entry
 * targets.
 *
 * Render it anywhere in the app tree; the children are registered on the
 * window that encloses them and unregistered when this component unmounts.
 *
 * ```tsx
 * const NewTaskAction = () => {
 *   const { addTask } = useStore() // an ordinary React context store
 *   return (
 *     <WindowActions>
 *       <GSimpleAction name="new" onActivate={() => addTask()} />
 *     </WindowActions>
 *   )
 * }
 * ```
 *
 * Inside a `Modal` the enclosing window is the MODAL's window, so the
 * actions belong to it and go away with it — which is usually what a dialog
 * wants, and worth knowing when it is not.
 */
export const WindowActions = ({ children }: WindowActionsProps) => {
  const window = useParentWindow()
  const scope = useMemo(
    () => (window === null ? null : { target: window, prefix: "win" }),
    [window],
  )
  // Null for exactly one commit: the window object reaches context through
  // state, so the app's first render happens before it is known.
  if (window === null || scope === null) {
    return null
  }
  return (
    <ActionScopeContext.Provider value={scope}>
      {createSlotPortal(children, window, "actions")}
    </ActionScopeContext.Provider>
  )
}

export type ApplicationActionsProps = {
  /** `GSimpleAction` elements, or any components that render them. */
  children?: ReactNode
}

/**
 * Registers its children as actions on the APPLICATION — the `app.` prefix.
 *
 * The same component as {@link WindowActions} against a different action
 * map, and the two are not interchangeable: a `Gio.Notification`'s action
 * button can only ever activate an application action, and an application
 * action outlives any one window. Which prefix an `actionName=` has to say
 * is decided by which of the two you write, deliberately — a prop that
 * silently moved every child between prefixes would be a good way to spend
 * an hour wondering why a button is insensitive.
 */
export const ApplicationActions = ({ children }: ApplicationActionsProps) => {
  const application = useApplication()
  const scope = useMemo(
    () =>
      application === null ? null : { target: application, prefix: "app" },
    [application],
  )
  if (application === null || scope === null) {
    return null
  }
  return (
    <ActionScopeContext.Provider value={scope}>
      {createSlotPortal(children, application, "actions")}
    </ActionScopeContext.Provider>
  )
}

export type WindowControllersProps = {
  /** `Gtk.EventController` elements — `GtkShortcutController` above all. */
  children?: ReactNode
}

/**
 * Attaches its children as event controllers on the WINDOW: a
 * `GtkShortcutController` with `scope={Gtk.ShortcutScope.GLOBAL}` is the
 * reason this exists — window-wide keyboard shortcuts, declared by the
 * screen they belong to and gone when it leaves.
 *
 * Deliberately a different component from {@link WindowActions} rather than
 * one that sorts its children: controllers land on the window as a WIDGET
 * (`addController`/`removeController`, keyed by the controller object)
 * while actions land on it as a `Gio.ActionMap` (keyed by name). Different
 * children, different GObject interfaces, and — as the name arbitration
 * above shows — different duplicate semantics. One component sniffing each
 * child's type to pick a slot would fail silently on a wrong child; two
 * components fail at the type level instead.
 */
export const WindowControllers = ({ children }: WindowControllersProps) => {
  const window = useParentWindow()
  if (window === null) {
    return null
  }
  return createSlotPortal(children, window, "controllers")
}
