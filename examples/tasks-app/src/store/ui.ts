// UI slice (selection, search, dialogs) — ported from the gtkx tutorial
// (examples/tutorial/src/store/ui.ts).
import type { StateCreator } from "zustand"
import type { DialogKind, Filter, Selection } from "../types"
import type { Mutators, Store } from "./index"

export type UiSlice = {
  selection: Selection
  selectedTaskId: string | null
  collapsed: boolean
  showContent: boolean
  filter: Filter
  searchMode: boolean
  searchQuery: string
  dialog: DialogKind
  taskToDelete: string | null
  select: (selection: Selection) => void
  openTask: (id: string) => void
  closeTask: () => void
  setCollapsed: (collapsed: boolean) => void
  setShowContent: (showContent: boolean) => void
  setFilter: (filter: Filter) => void
  setSearchMode: (searchMode: boolean) => void
  setSearchQuery: (searchQuery: string) => void
  showDialog: (dialog: DialogKind) => void
  askDeleteTask: (taskToDelete: string | null) => void
}

export const createUiSlice: StateCreator<Store, Mutators, [], UiSlice> = (
  set,
) => ({
  selection: { kind: "smart", view: "all" },
  selectedTaskId: null,
  collapsed: false,
  showContent: false,
  filter: "all",
  searchMode: false,
  searchQuery: "",
  dialog: "none",
  taskToDelete: null,
  select: (selection) =>
    set((state) => ({
      selection,
      selectedTaskId: null,
      searchMode: false,
      searchQuery: "",
      showContent: state.collapsed,
    })),
  openTask: (selectedTaskId) => set({ selectedTaskId, showContent: true }),
  closeTask: () => set({ selectedTaskId: null }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setShowContent: (showContent) => set({ showContent }),
  setFilter: (filter) => set({ filter }),
  setSearchMode: (searchMode) => set({ searchMode }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  showDialog: (dialog) => set({ dialog }),
  askDeleteTask: (taskToDelete) =>
    set({
      taskToDelete,
      dialog: taskToDelete === null ? "none" : "delete-task",
    }),
})
