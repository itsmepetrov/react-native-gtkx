// The remote image loader is pure logic over an injectable fetcher: cache
// hits skip the network, concurrent loads of one URL share a download,
// bad responses reject without leaving partial cache files.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, expect, test, vi } from "vitest"
import {
  cachePathFor,
  isRemoteUri,
  loadRemoteImage,
  type ImageFetcher,
} from "../../../src/components/image-loader"

let cacheHome: string
let previousCacheHome: string | undefined

beforeAll(() => {
  cacheHome = mkdtempSync(join(tmpdir(), "rn-gtkx-images-"))
  previousCacheHome = process.env.XDG_CACHE_HOME
  process.env.XDG_CACHE_HOME = cacheHome
})

afterAll(() => {
  process.env.XDG_CACHE_HOME = previousCacheHome
  rmSync(cacheHome, { recursive: true, force: true })
})

const imageResponse = (bytes: string) => ({
  ok: true,
  status: 200,
  headers: { get: () => "image/png" },
  arrayBuffer: async () => new TextEncoder().encode(bytes).buffer,
})

test("isRemoteUri accepts only http(s)", () => {
  expect(isRemoteUri("https://example.com/a.png")).toBe(true)
  expect(isRemoteUri("http://example.com/a.png")).toBe(true)
  expect(isRemoteUri("/tmp/a.png")).toBe(false)
  expect(isRemoteUri("file:///tmp/a.png")).toBe(false)
})

test("downloads once and serves the cache afterwards", async () => {
  const fetcher = vi.fn(async () => imageResponse("pixels"))
  const uri = "https://example.com/one.png"
  const first = await loadRemoteImage(uri, fetcher as unknown as ImageFetcher)
  expect(readFileSync(first, "utf8")).toBe("pixels")
  const second = await loadRemoteImage(uri, fetcher as unknown as ImageFetcher)
  expect(second).toBe(first)
  expect(fetcher).toHaveBeenCalledOnce()
})

test("concurrent loads of one URL share a single download", async () => {
  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const fetcher = vi.fn(async () => {
    await gate
    return imageResponse("shared")
  })
  const uri = "https://example.com/two.png"
  const loads = Promise.all([
    loadRemoteImage(uri, fetcher as unknown as ImageFetcher),
    loadRemoteImage(uri, fetcher as unknown as ImageFetcher),
  ])
  release?.()
  const [a, b] = await loads
  expect(a).toBe(b)
  expect(fetcher).toHaveBeenCalledOnce()
})

test("non-2xx rejects and caches nothing", async () => {
  const uri = "https://example.com/missing.png"
  const fetcher: ImageFetcher = async () => ({
    ok: false,
    status: 404,
    headers: { get: () => null },
    arrayBuffer: async () => new ArrayBuffer(0),
  })
  await expect(loadRemoteImage(uri, fetcher)).rejects.toThrow("HTTP 404")
  expect(existsSync(cachePathFor(uri))).toBe(false)
})

test("non-image content type rejects", async () => {
  const fetcher: ImageFetcher = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => "text/html" },
    arrayBuffer: async () => new ArrayBuffer(0),
  })
  await expect(
    loadRemoteImage("https://example.com/page", fetcher),
  ).rejects.toThrow("Not an image")
})
