// The declaration-shape parser + checker: a per-entry `**Profile:** ...`
// line under each entry's own heading, and `profile:` frontmatter for
// whole-page subpath modules. No real docs/reference/*.md fixture here —
// task 005 lands this checker ahead of the Reference restructure that owns
// those files (see .claude/epics/docs-site/005-notes.md); the inline
// Markdown below stands in for the shape the restructured pages will use.
import { describe, expect, test } from "vitest"
import type { ClassifyResult } from "./classify.ts"
import {
  checkEntryProfiles,
  checkPageProfile,
  parseEntryProfiles,
  parsePageProfile,
} from "./declarations.ts"

const gtk = (): ClassifyResult => ({ profile: "gtk", evidence: [] })
const probeGuarded = (): ClassifyResult => ({
  profile: "probe-guarded",
  evidence: ["x"],
})
const hardAdw = (): ClassifyResult => ({ profile: "hard-adw", evidence: ["x"] })

describe("parseEntryProfiles", () => {
  test("reads the profile and fallback off the line under each heading", () => {
    const markdown = `
## \`Alert\`

Some prose about the export.

**Profile:** Adw (fallback: falls back to \`Gtk.AlertDialog\`)

## \`Platform\`

**Profile:** GTK
`
    const declared = parseEntryProfiles(markdown)
    expect(declared.get("Alert")).toEqual({
      profile: "adw",
      fallback: "falls back to `Gtk.AlertDialog`",
      line: 6,
    })
    expect(declared.get("Platform")).toEqual({
      profile: "gtk",
      fallback: null,
      line: 10,
    })
  })

  test("an entry with no Profile line before the next heading is absent", () => {
    const markdown = `
## \`Alert\`

No profile line here.

## \`Platform\`

**Profile:** GTK
`
    expect(parseEntryProfiles(markdown).has("Alert")).toBe(false)
  })
})

describe("parsePageProfile", () => {
  test("reads profile: out of YAML frontmatter", () => {
    const markdown = `---\ntitle: Navigation\nprofile: adw\n---\n\n# Navigation\n`
    expect(parsePageProfile(markdown)).toBe("adw")
  })

  test("no frontmatter at all is null, not a crash", () => {
    expect(parsePageProfile("# Navigation\n\nno frontmatter here\n")).toBeNull()
  })
})

describe("checkEntryProfiles", () => {
  test("a fully-declared page produces zero mismatches", () => {
    const derived = new Map([
      ["Platform", gtk()],
      ["Alert", probeGuarded()],
      ["NavigationStack", hardAdw()],
    ])
    const markdown = `
## \`Platform\`

**Profile:** GTK

## \`Alert\`

**Profile:** Adw (fallback: Gtk.AlertDialog, no destructive/preferred styling)

## \`NavigationStack\`

**Profile:** Adw
`
    expect(checkEntryProfiles(derived, markdown)).toEqual([])
  })

  test("missing entry, wrong profile, missing fallback, and unexpected fallback all fail", () => {
    const derived = new Map([
      ["Platform", gtk()],
      ["Alert", probeGuarded()],
      ["NavigationStack", hardAdw()],
      ["Undocumented", gtk()],
    ])
    const markdown = `
## \`Platform\`

**Profile:** Adw

## \`Alert\`

**Profile:** Adw

## \`NavigationStack\`

**Profile:** Adw (fallback: none really, but claimed anyway)
`
    const mismatches = checkEntryProfiles(derived, markdown)
    const byEntry = Object.fromEntries(mismatches.map((m) => [m.entry, m.kind]))
    expect(byEntry).toEqual({
      Platform: "wrong-profile",
      Alert: "missing-fallback",
      NavigationStack: "unexpected-fallback",
      Undocumented: "missing",
    })
  })

  // The PR's planted-mismatch demo: one wrong badge, the exact failure a
  // reviewer would see once this checker is wired into docs:check.
  test("planted mismatch: a GTK entry declared as Adw", () => {
    const derived = new Map([["Platform", gtk()]])
    const markdown = "## `Platform`\n\n**Profile:** Adw\n"
    const [mismatch] = checkEntryProfiles(derived, markdown)
    expect(mismatch?.kind).toBe("wrong-profile")
    expect(mismatch?.message).toMatch(
      /declares \*\*Profile:\*\* Adw.*derives gtk/,
    )
  })
})

describe("checkPageProfile", () => {
  test("matching frontmatter produces no mismatch", () => {
    const markdown = "---\nprofile: adw\n---\n\n# Navigation\n"
    expect(checkPageProfile("navigation", hardAdw(), markdown)).toEqual([])
  })

  test("no frontmatter at all is a missing mismatch", () => {
    const [mismatch] = checkPageProfile(
      "navigation",
      hardAdw(),
      "# Navigation\n",
    )
    expect(mismatch?.kind).toBe("missing")
  })

  test("wrong frontmatter value is a wrong-profile mismatch", () => {
    const markdown = "---\nprofile: gtk\n---\n\n# Navigation\n"
    const [mismatch] = checkPageProfile("navigation", hardAdw(), markdown)
    expect(mismatch?.kind).toBe("wrong-profile")
  })
})
