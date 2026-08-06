// Parses and checks the declared GTK/Adw profile against the derived one
// (derive.ts). Two declaration shapes, matching the Reference's per-entry
// structure (docs-site epic task 005 — see .claude/epics/docs-site/
// 005-notes.md for why this shape and not a table column):
//
// - Per-entry (component/API pages): a `**Profile:** ...` line somewhere
//   under the entry's own heading (before the next heading at the SAME OR
//   HIGHER level), one of:
//     **Profile:** GTK
//     **Profile:** Adw
//     **Profile:** Adw (fallback: <one line>)
//   The third form is required for a probe-guarded entry — the checker
//   fails a plain "Adw" there, since a reader has no way to tell "richer
//   under Adw, still works" from "absent without it" without the sentence.
// - Page-level (subpath modules — navigation.md, svg.md, dnd.md,
//   gesture-handler.md, reanimated-compat.md): YAML frontmatter,
//   `profile: gtk` or `profile: adw` (no fallback text — a whole page's
//   badge is a pointer to its own prose, not a one-line summary).
//
// Both are plain Markdown/YAML — no JSX in the .md source; the
// website's ProfileBadge component renders FROM this same text at build
// time (a swizzled DocItem/Content wrapper), so there is exactly one
// source of truth for a given entry's profile.
import type { ClassifyResult, Profile } from "./classify.ts"

export type DeclaredEntryProfile = {
  profile: "gtk" | "adw"
  fallback: string | null
  // 1-based line number of the `**Profile:**` line itself, for error
  // messages a human can jump to.
  line: number
}

const HEADING_RE = /^(#{2,6})\s+(.*)$/
// A heading's own text is usually backtick-quoted (`` ## `Alert` ``) —
// strip backticks/whitespace so the heading text matches the plain export
// name derive.ts uses.
const cleanHeadingText = (raw: string): string =>
  raw.trim().replace(/`/g, "").trim()

const PROFILE_LINE_RE =
  /^\*\*Profile:\*\*\s+(GTK|Adw)(?:\s*\(fallback:\s*(.+?)\s*\))?\s*$/

// Every `**Profile:** ...` line in `markdown`, keyed by the text of the
// nearest heading ABOVE it (at any level — grouped pages nest an entry's
// own sub-sections under it, so a fallback note two headings down still
// belongs to the entry, not to whichever sub-heading happens to be
// nearest). A heading with no Profile line before the next heading of the
// same or shallower level simply has no entry here — the caller (checkPage
// below) is what turns that into a "missing" failure, one per name it
// actually expected.
export const parseEntryProfiles = (
  markdown: string,
): Map<string, DeclaredEntryProfile> => {
  const declared = new Map<string, DeclaredEntryProfile>()
  const lines = markdown.split("\n")
  let currentHeading: string | null = null
  lines.forEach((rawLine, index) => {
    const heading = HEADING_RE.exec(rawLine)
    if (heading) {
      currentHeading = cleanHeadingText(heading[2] ?? "")
      return
    }
    const match = PROFILE_LINE_RE.exec(rawLine.trim())
    if (match && currentHeading) {
      const profile = match[1]?.toLowerCase() === "adw" ? "adw" : "gtk"
      declared.set(currentHeading, {
        profile,
        fallback: match[2]?.trim() || null,
        line: index + 1,
      })
    }
  })
  return declared
}

// The YAML frontmatter block's `profile:` key, for a whole-page subpath
// module (navigation.md, svg.md, ...). Deliberately not a general YAML
// parser — the frontmatter this repo's docs use is flat `key: value`
// pairs, and `profile` is the only one this checker reads.
export const parsePageProfile = (markdown: string): "gtk" | "adw" | null => {
  const match = /^---\n([\s\S]*?)\n---/.exec(markdown)
  if (!match) {
    return null
  }
  const line = /^profile:\s*(gtk|adw)\s*$/m.exec(match[1] ?? "")
  return line ? (line[1] as "gtk" | "adw") : null
}

export type ProfileMismatch = {
  entry: string
  kind: "missing" | "wrong-profile" | "missing-fallback" | "unexpected-fallback"
  message: string
}

const expectedDeclaredProfile = (profile: Profile): "gtk" | "adw" =>
  profile === "gtk" ? "gtk" : "adw"

// Compares the derived verdict for every named entry against what
// `pageMarkdown` declares under each entry's own heading. Every mismatch is
// reported by name — missing entirely, declared the wrong side of GTK/Adw,
// or (probe-guarded specifically) missing the required fallback sentence.
export const checkEntryProfiles = (
  derived: ReadonlyMap<string, ClassifyResult>,
  pageMarkdown: string,
): ProfileMismatch[] => {
  const declared = parseEntryProfiles(pageMarkdown)
  const mismatches: ProfileMismatch[] = []
  for (const [name, result] of derived) {
    const found = declared.get(name)
    if (!found) {
      mismatches.push({
        entry: name,
        kind: "missing",
        message: `"${name}" has no **Profile:** line under its heading (derived: ${result.profile})`,
      })
      continue
    }
    const expected = expectedDeclaredProfile(result.profile)
    if (found.profile !== expected) {
      mismatches.push({
        entry: name,
        kind: "wrong-profile",
        message:
          `"${name}" declares **Profile:** ${found.profile === "adw" ? "Adw" : "GTK"} ` +
          `(line ${found.line}) but the code derives ${result.profile} — ` +
          `expected ${expected === "adw" ? "Adw" : "GTK"}`,
      })
      continue
    }
    if (result.profile === "probe-guarded" && !found.fallback) {
      mismatches.push({
        entry: name,
        kind: "missing-fallback",
        message:
          `"${name}" is probe-guarded (works on plain GTK with a fallback) but its ` +
          `**Profile:** line (line ${found.line}) has no "(fallback: ...)" sentence`,
      })
    }
    if (result.profile === "hard-adw" && found.fallback) {
      mismatches.push({
        entry: name,
        kind: "unexpected-fallback",
        message:
          `"${name}" is hard Adw (no plain-GTK fallback exists) but its **Profile:** ` +
          `line (line ${found.line}) claims one`,
      })
    }
  }
  return mismatches
}

// The page-level counterpart, for a subpath module's frontmatter.
export const checkPageProfile = (
  pageName: string,
  result: ClassifyResult,
  pageMarkdown: string,
): ProfileMismatch[] => {
  const declared = parsePageProfile(pageMarkdown)
  const expected = expectedDeclaredProfile(result.profile)
  if (!declared) {
    return [
      {
        entry: pageName,
        kind: "missing",
        message: `"${pageName}" has no \`profile:\` frontmatter key (derived: ${result.profile})`,
      },
    ]
  }
  if (declared !== expected) {
    return [
      {
        entry: pageName,
        kind: "wrong-profile",
        message:
          `"${pageName}" declares \`profile: ${declared}\` but the code derives ` +
          `${result.profile} — expected \`profile: ${expected}\``,
      },
    ]
  }
  return []
}
