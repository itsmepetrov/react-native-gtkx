// Hacker News Firebase API client. Plain `fetch` — on this platform the app
// runs in Node, so no networking module is needed.
// https://github.com/HackerNews/API

const API_BASE = "https://hacker-news.firebaseio.com/v0"

export const PAGE_SIZE = 20

// The subset of HN item fields the app renders. `topstories` mixes stories
// and the occasional job posting; comments/polls never appear in that list.
export type Story = {
  id: number
  type: "story" | "job" | "poll"
  title: string
  by?: string
  time: number
  score?: number
  descendants?: number
  url?: string
  text?: string
  kids?: number[]
  deleted?: boolean
  dead?: boolean
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HN API responded with ${response.status} for ${url}`)
  }
  return (await response.json()) as T
}

// The API returns null for unknown ids and tombstones for deleted items.
export const fetchItem = (id: number): Promise<Story | null> =>
  fetchJson<Story | null>(`${API_BASE}/item/${id}.json`)

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
