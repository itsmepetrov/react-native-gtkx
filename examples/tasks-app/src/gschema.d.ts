// Types for the compiled GSettings schema imported as `#data/…gschema.xml`.
// See examples/tasks-nav/src/gschema.d.ts — same reason, this app's keys.
declare module "#data/dev.rngtkx.tasks.gschema.xml" {
  const schema: {
    id: string
    path: string | null
    keys: {
      // An `enum` key reads and writes as its integer value.
      "sort-order": "enum"
      "color-scheme": "s"
      "reminder-minutes": "i"
      "window-width": "i"
      "window-height": "i"
    }
  }
  export default schema
}
