// Name resolution for rn_gtkx_describe_component: turns a free-form name
// into exactly one of the surface's entities, or says clearly why it
// could not (ambiguous vs. not-found) instead of guessing.
import {
  ADW_WIDGETS,
  COMMON_PRIMITIVES,
  GTK_WIDGETS,
  PORTABLE_APIS,
  PORTABLE_COMPONENTS,
  type CommonRecord,
  type PortableRecord,
  type WidgetRecord,
} from "./data/generated.js"

type Entity =
  | { kind: "portable-component"; record: PortableRecord }
  | { kind: "portable-api"; record: PortableRecord }
  | { kind: "common"; record: CommonRecord }
  | { kind: "gtk-widget"; record: WidgetRecord }
  | { kind: "adw-widget"; record: WidgetRecord }

type Candidate = { name: string; subpath: string; kind: Entity["kind"] }

type ResolvedEntity = {
  status: "resolved"
  entity: Entity
  matchedBy: "exact" | "case-insensitive" | "prefix" | "substring"
}
type AmbiguousResult = {
  status: "ambiguous"
  query: string
  candidates: readonly Candidate[]
}
type NotFoundResult = {
  status: "not-found"
  query: string
  suggestions: readonly Candidate[]
}
type ResolveResult = ResolvedEntity | AmbiguousResult | NotFoundResult

const ALL_ENTITIES: readonly Entity[] = [
  ...PORTABLE_COMPONENTS.map((record): Entity => ({
    kind: "portable-component",
    record,
  })),
  ...PORTABLE_APIS.map((record): Entity => ({ kind: "portable-api", record })),
  ...COMMON_PRIMITIVES.map((record): Entity => ({ kind: "common", record })),
  ...GTK_WIDGETS.map((record): Entity => ({ kind: "gtk-widget", record })),
  ...ADW_WIDGETS.map((record): Entity => ({ kind: "adw-widget", record })),
]

const candidateOf = (entity: Entity): Candidate => ({
  name: entity.record.name,
  subpath: entity.record.subpath,
  kind: entity.kind,
})

// Unweighted Levenshtein distance — 200-odd short names, no need for
// anything fancier to rank "closest known name" suggestions.
const levenshtein = (a: string, b: string): number => {
  const rows = a.length + 1
  const cols = b.length + 1
  const dp: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  )
  for (let i = 0; i < rows; i++) {
    dp[i]![0] = i
  }
  for (let j = 0; j < cols; j++) {
    dp[0]![j] = j
  }
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      )
    }
  }
  return dp[rows - 1]![cols - 1]!
}

const MAX_CANDIDATES = 20
const MAX_SUGGESTIONS = 5
const PREFIXES = ["Gtk", "Adw"] as const

/**
 * Resolves a free-form name to exactly one surface entity:
 * 1. exact match, then case-insensitive exact match;
 * 2. Gtk<name>/Adw<name> exact match — tried BEFORE substring search, so
 *    "Popover" resolves cleanly to GtkPopover instead of landing ambiguous
 *    against GtkPopoverBin/GtkPopoverMenu/GtkPopoverMenuBar too;
 * 3. substring search (case-insensitive): one hit resolves, several are
 *    reported as ambiguous candidates (never guessed), zero fall through
 *    to a not-found response with the closest known names by edit
 *    distance.
 */
const resolveComponent = (query: string): ResolveResult => {
  const trimmed = query.trim()
  const lower = trimmed.toLowerCase()

  if (lower.length === 0) {
    return { status: "not-found", query: trimmed, suggestions: [] }
  }

  const exact = ALL_ENTITIES.find((e) => e.record.name === trimmed)
  if (exact) {
    return { status: "resolved", entity: exact, matchedBy: "exact" }
  }

  const caseInsensitive = ALL_ENTITIES.find(
    (e) => e.record.name.toLowerCase() === lower,
  )
  if (caseInsensitive) {
    return {
      status: "resolved",
      entity: caseInsensitive,
      matchedBy: "case-insensitive",
    }
  }

  if (!/^(gtk|adw)/i.test(trimmed)) {
    for (const prefix of PREFIXES) {
      const prefixedLower = `${prefix}${trimmed}`.toLowerCase()
      const match = ALL_ENTITIES.find(
        (e) => e.record.name.toLowerCase() === prefixedLower,
      )
      if (match) {
        return { status: "resolved", entity: match, matchedBy: "prefix" }
      }
    }
  }

  const substringMatches = ALL_ENTITIES.filter((e) =>
    e.record.name.toLowerCase().includes(lower),
  )
  if (substringMatches.length === 1) {
    return {
      status: "resolved",
      entity: substringMatches[0]!,
      matchedBy: "substring",
    }
  }
  if (substringMatches.length > 1) {
    return {
      status: "ambiguous",
      query: trimmed,
      candidates: substringMatches.slice(0, MAX_CANDIDATES).map(candidateOf),
    }
  }

  const suggestions = ALL_ENTITIES.map((entity) => ({
    entity,
    distance: levenshtein(lower, entity.record.name.toLowerCase()),
  }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ entity }) => candidateOf(entity))

  return { status: "not-found", query: trimmed, suggestions }
}

/** Formats a resolved entity into the plain object the tool returns as
 * JSON text — one shape per kind, matching what docs/reference/ and
 * docs/architecture/ actually document for it. */
const formatEntity = (entity: Entity): Record<string, unknown> => {
  switch (entity.kind) {
    case "portable-component":
    case "portable-api": {
      const record = entity.record
      return {
        kind: entity.kind,
        name: record.name,
        subpath: record.subpath,
        ...(record.gtkImplementation !== undefined
          ? { gtkImplementation: record.gtkImplementation }
          : {}),
        supported: record.supported,
        differences: record.differences,
      }
    }
    case "common": {
      const record = entity.record
      return {
        kind: entity.kind,
        name: record.name,
        subpath: record.subpath,
        summary: record.summary,
      }
    }
    case "gtk-widget":
    case "adw-widget": {
      const record = entity.record
      const note = record.wrapped
        ? "Takes `style` + `onLayout`; React Native layout positions and styles it. Outside RN layout (e.g. inside an AdwHeaderBar slot) it steps aside and renders as the bare widget."
        : `Raw export — exactly as gtkx binds it, no \`style\`/\`onLayout\` (wrap it yourself with wrapReactNative from react-native-gtkx/gtk if you need RN layout to drive it).${record.reason ? ` Why raw: ${record.reason}` : ""}`
      return {
        kind: entity.kind,
        name: record.name,
        subpath: record.subpath,
        wrapped: record.wrapped,
        ...(record.reason !== undefined ? { reason: record.reason } : {}),
        note,
      }
    }
  }
}

export {
  formatEntity,
  resolveComponent,
  type Candidate,
  type Entity,
  type ResolveResult,
}
