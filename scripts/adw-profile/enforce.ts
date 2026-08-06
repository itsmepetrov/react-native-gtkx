// Compares the derived GTK/Adw matrix (derive.ts) against what
// docs/reference/*.md actually declares (declarations.ts), across every
// page shape the Reference uses: one file per component, one shared page
// of `##` sections for the rest of the API surface, and frontmatter on the
// five subpath pages. Called from check-docs-coverage.ts so `docs:check`
// fails on a missing/wrong/unguarded-fallback profile the same way it
// already fails on an undocumented export.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  checkEntryProfiles,
  checkPageProfile,
  type ProfileMismatch,
} from "./declarations.ts"
import { deriveAdwProfiles } from "./derive.ts"
import { API_MODULES_FILE, COMPONENT_PAGES, SUBPATH_PAGES } from "./pages.ts"

const REFERENCE_DIR = join(import.meta.dirname, "..", "..", "docs/reference")

export const checkAdwProfiles = (): ProfileMismatch[] => {
  const { entries, pages } = deriveAdwProfiles()
  const mismatches: ProfileMismatch[] = []

  for (const [name, file] of Object.entries(COMPONENT_PAGES)) {
    const result = entries[name]
    if (!result) {
      mismatches.push({
        entry: name,
        kind: "missing",
        message: `"${name}" is in COMPONENT_PAGES but derive.ts no longer derives it — is it still exported from src/index.ts?`,
      })
      continue
    }
    const markdown = readFileSync(
      join(REFERENCE_DIR, "components", file),
      "utf8",
    )
    mismatches.push(...checkEntryProfiles(new Map([[name, result]]), markdown))
  }

  const apiNames = Object.keys(entries).filter(
    (name) => !(name in COMPONENT_PAGES),
  )
  const apiDerived = new Map(apiNames.map((name) => [name, entries[name]!]))
  const apiMarkdown = readFileSync(
    join(REFERENCE_DIR, API_MODULES_FILE),
    "utf8",
  )
  mismatches.push(...checkEntryProfiles(apiDerived, apiMarkdown))

  for (const [page, file] of Object.entries(SUBPATH_PAGES)) {
    const result = pages[page]
    if (!result) {
      mismatches.push({
        entry: page,
        kind: "missing",
        message: `"${page}" is in SUBPATH_PAGES but derive.ts has no page-level result for it`,
      })
      continue
    }
    const markdown = readFileSync(join(REFERENCE_DIR, file), "utf8")
    mismatches.push(...checkPageProfile(page, result, markdown))
  }

  return mismatches
}
