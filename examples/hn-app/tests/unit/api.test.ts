import { afterEach, describe, expect, it, vi } from "vitest"
import {
  fetchItem,
  fetchTopStories,
  PAGE_SIZE,
  type Story,
} from "../../src/api"

const story = (id: number): Story => ({
  id,
  type: "story",
  title: `Story ${id}`,
  by: `user${id}`,
  time: 1_700_000_000,
  score: id,
  descendants: id * 2,
  url: `https://example.com/${id}`,
})

// Serves /topstories.json from a mutable ranking and /item/<id>.json from an
// item table (defaulting to a generated story). Returns the spy for call
// assertions.
const mockApi = (
  ranking: () => number[],
  items: Record<number, Story | null> = {},
) => {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input)
    const respond = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
    })
    if (url.endsWith("/topstories.json")) {
      return respond(ranking())
    }
    const match = /\/item\/(\d+)\.json$/.exec(url)
    if (match) {
      const id = Number(match[1])
      return respond(id in items ? items[id] : story(id))
    }
    throw new Error(`unexpected url ${url}`)
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const ids = (stories: Story[]) => stories.map((item) => item.id)
const range = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => from + index)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchTopStories", () => {
  it("returns the first PAGE_SIZE stories in rank order", async () => {
    const fetchMock = mockApi(() => range(101, 30))
    const page = await fetchTopStories(0)
    expect(ids(page)).toEqual(range(101, PAGE_SIZE))
    // One ranking request plus one request per item.
    expect(fetchMock).toHaveBeenCalledTimes(1 + PAGE_SIZE)
  })

  it("keeps pages disjoint even when the live ranking shifts", async () => {
    let ranking = range(1, 40)
    mockApi(() => ranking)
    const first = await fetchTopStories(0)
    // Rank churn between requests: story 21 jumps to the top. A naive
    // re-slice of the fresh list would now return it on page 1 too...
    ranking = [21, ...range(1, 20), ...range(22, 19)]
    const second = await fetchTopStories(1)
    // ...but page 1 slices the page-0 snapshot, so no id repeats.
    expect(ids(second)).toEqual(range(21, 20))
    const overlap = ids(second).filter((id) => ids(first).includes(id))
    expect(overlap).toEqual([])
  })

  it("does not refetch the ranking for follow-up pages", async () => {
    const fetchMock = mockApi(() => range(1, 40))
    await fetchTopStories(0)
    await fetchTopStories(1)
    const rankingCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/topstories.json"),
    )
    expect(rankingCalls).toHaveLength(1)
  })

  it("takes a fresh snapshot on page 0 (refresh)", async () => {
    let ranking = range(1, 25)
    const fetchMock = mockApi(() => ranking)
    await fetchTopStories(0)
    ranking = range(501, 25)
    const refreshed = await fetchTopStories(0)
    expect(ids(refreshed)).toEqual(range(501, PAGE_SIZE))
    const rankingCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/topstories.json"),
    )
    expect(rankingCalls).toHaveLength(2)
  })

  it("returns an empty page past the end of the ranking", async () => {
    mockApi(() => range(1, 25))
    await fetchTopStories(0)
    expect(await fetchTopStories(2)).toEqual([])
  })

  it("drops null, deleted and dead items", async () => {
    mockApi(() => range(1, 20), {
      3: null,
      7: { ...story(7), deleted: true },
      11: { ...story(11), dead: true },
    })
    const page = await fetchTopStories(0)
    expect(page).toHaveLength(17)
    expect(ids(page)).not.toContain(3)
    expect(ids(page)).not.toContain(7)
    expect(ids(page)).not.toContain(11)
  })

  it("rejects on an HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => null,
      })),
    )
    await expect(fetchTopStories(0)).rejects.toThrow("503")
  })
})

describe("fetchItem", () => {
  it("returns the parsed item", async () => {
    mockApi(() => [], { 42: story(42) })
    expect(await fetchItem(42)).toEqual(story(42))
  })

  it("passes the API's null for unknown ids through", async () => {
    mockApi(() => [], { 404: null })
    expect(await fetchItem(404)).toBeNull()
  })
})
