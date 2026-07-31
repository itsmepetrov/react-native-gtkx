// Lists slice — ported from the gtkx tutorial (examples/tutorial/src/store/lists.ts).
import type { StateCreator } from "zustand"
import type { TaskList } from "../types"
import type { Mutators, Store } from "./index"
import { seedLists } from "./seed"

export type ListsSlice = {
  lists: TaskList[]
  addList: (name: string, color: string) => void
}

export const createListsSlice: StateCreator<Store, Mutators, [], ListsSlice> = (
  set,
) => ({
  lists: seedLists,
  addList: (name, color) => {
    const trimmed = name.trim()
    if (trimmed === "") {
      return
    }
    set((state) => ({
      lists: [
        ...state.lists,
        { id: crypto.randomUUID(), name: trimmed, color },
      ],
    }))
  },
})
