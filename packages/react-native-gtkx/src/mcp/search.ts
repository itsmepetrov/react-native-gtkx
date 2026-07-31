// rn_gtkx_search_docs: free-text fallback for anything the structured
// tools (list_surface, describe_component) do not cover by name — symptoms
// ("list blanks on scroll"), cross-cutting workarounds, prose-only
// sections (navigation options, the escape hatch, ...).
import { DOC_CHUNKS, type DocChunk } from "./data/generated.js"

type SearchResult = DocChunk & { score: number }

const tokenize = (text: string): string[] =>
  text.toLowerCase().match(/[a-z0-9]+/g) ?? []

const countOccurrences = (haystack: string, needle: string): number => {
  if (needle.length === 0) {
    return 0
  }
  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    count++
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

const HEADING_MATCH_WEIGHT = 3

/**
 * Scores every doc chunk by how many times each query term occurs in it
 * (body text: 1 point per occurrence; the same term appearing in the
 * heading: +3, so a chunk that is literally ABOUT the query ranks above
 * one that merely mentions it in passing). No stemming, no synonyms — this
 * is deliberately the least clever tool: a fallback, not the star.
 */
const searchDocs = (query: string, limit: number): readonly SearchResult[] => {
  const terms = tokenize(query)
  if (terms.length === 0) {
    return []
  }

  const scored: SearchResult[] = DOC_CHUNKS.map((chunk) => {
    const headingLower = chunk.heading.toLowerCase()
    const bodyLower = chunk.text.toLowerCase()
    let score = 0
    for (const term of terms) {
      score += countOccurrences(bodyLower, term)
      score += countOccurrences(headingLower, term) * HEADING_MATCH_WEIGHT
    }
    return { ...chunk, score }
  })

  return scored
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export { searchDocs, type SearchResult }
