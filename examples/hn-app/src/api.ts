// Hacker News Firebase API client. Plain `fetch` — on this platform the app
// runs in Node, so no networking module is needed.
// https://github.com/HackerNews/API

const API_BASE = "https://hacker-news.firebaseio.com/v0"

export const PAGE_SIZE = 20

// The subset of HN item fields the app renders. /item/<id> serves stories,
// jobs, polls and comments from the same endpoint with the same shape.
export type Item = {
  id: number
  type: "story" | "job" | "poll" | "comment"
  title?: string
  by?: string
  time: number
  score?: number
  descendants?: number
  url?: string
  text?: string
  parent?: number
  kids?: number[]
  deleted?: boolean
  dead?: boolean
}

// `topstories` mixes stories and the occasional job posting; everything in
// that list carries a title (comments never do).
export type Story = Item & { title: string }

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HN API responded with ${response.status} for ${url}`)
  }
  return (await response.json()) as T
}

// The API returns null for unknown ids and tombstones for deleted items.
export const fetchItem = (id: number): Promise<Item | null> =>
  fetchJson<Item | null>(`${API_BASE}/item/${id}.json`)

// /v0/topstories.json is a live-ranked list: between two requests stories
// shift ranks, so slicing a fresh list per page would duplicate (or skip)
// items across pages. The id list is therefore snapshotted once and every
// page slices the same snapshot; page 0 (initial load / refresh) takes a
// fresh one.
let topIdsSnapshot: number[] | null = null

export const fetchTopStories = async (page: number): Promise<Story[]> => {
  if (page === 0 || topIdsSnapshot === null) {
    topIdsSnapshot = await fetchJson<number[]>(`${API_BASE}/topstories.json`)
  }
  const ids = topIdsSnapshot.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const items = await Promise.all(ids.map((id) => fetchItem(id)))
  return items.filter(
    (item): item is Story =>
      item !== null && !item.deleted && !item.dead && item.title !== undefined,
  )
}

// Search goes through Algolia's HN API — the one the website itself uses.
// The Firebase API has no search endpoint, and filtering the loaded page
// would only ever search what is already on screen. Hit ids are the same
// HN item ids, so opening a result loads its comments the usual way.
const SEARCH_BASE = "https://hn.algolia.com/api/v1"

type AlgoliaHit = {
  objectID: string
  title: string | null
  url: string | null
  author: string | null
  points: number | null
  num_comments: number | null
  created_at_i: number
  story_text?: string | null
}

type AlgoliaResponse = {
  hits: AlgoliaHit[]
  nbPages: number
}

export type SearchResult = {
  stories: Story[]
  hasMore: boolean
}

export const searchStories = async (
  query: string,
  page: number,
  signal?: AbortSignal,
): Promise<SearchResult> => {
  const url =
    `${SEARCH_BASE}/search?query=${encodeURIComponent(query)}` +
    `&tags=story&page=${page}&hitsPerPage=${PAGE_SIZE}`
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`HN search responded with ${response.status}`)
  }
  const payload = (await response.json()) as AlgoliaResponse
  const stories = payload.hits
    .filter((hit) => hit.title !== null)
    .map((hit) => ({
      id: Number(hit.objectID),
      type: "story" as const,
      title: hit.title!,
      by: hit.author ?? undefined,
      time: hit.created_at_i,
      score: hit.points ?? undefined,
      descendants: hit.num_comments ?? undefined,
      url: hit.url ?? undefined,
      text: hit.story_text ?? undefined,
    }))
  return { stories, hasMore: page + 1 < payload.nbPages }
}
