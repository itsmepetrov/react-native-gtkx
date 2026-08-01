// Types for the compiled GSettings schema imported as `#data/…gschema.xml`.
//
// The gtkx build plugin turns the XML into `{ id, path, keys }` at build
// time, where `keys` maps each key name to its GVariant type string — and
// that map is what makes `useSetting(schema, "reminder-minutes")` return a
// number rather than `unknown`. Nothing generates it: `@gtkx/cli/env`
// declares the asset types it knows (`*.png`, `*.svg`, …) and has no entry
// for `.gschema.xml` at all, so without this file every settings read in the
// app is untyped and the example does not compile.
//
// Transcribed from data/dev.rngtkx.tasksnav.gschema.xml — the two are
// checked against each other by `npm run typecheck:examples`, which is what
// CI runs.
declare module "#data/dev.rngtkx.tasksnav.gschema.xml" {
  const schema: {
    id: string
    path: string | null
    keys: {
      // An `enum` key reads and writes as its integer value.
      "sort-order": "enum"
      "color-scheme": "s"
      "reminder-minutes": "i"
    }
  }
  export default schema
}
