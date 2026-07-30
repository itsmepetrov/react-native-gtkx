// Remote image loading for <Image source={{uri: "https://…"}}/>: Node's
// own fetch downloads into an on-disk cache (XDG cache dir, keyed by
// sha256 of the URL) and GtkPicture reads the file. Pure module — the
// fetcher is injectable, so the download logic is unit-tested without a
// network or a widget.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, renameSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export const isRemoteUri = (uri: string): boolean =>
  uri.startsWith("http://") || uri.startsWith("https://")

const cacheDir = (): string =>
  join(
    process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
    "react-native-gtkx",
    "images",
  )

/** Deterministic on-disk location for a remote URL. */
export const cachePathFor = (uri: string): string =>
  join(cacheDir(), createHash("sha256").update(uri).digest("hex"))

export type ImageFetcher = (uri: string) => Promise<{
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  arrayBuffer(): Promise<ArrayBuffer>
}>

// N simultaneous mounts of the same URL share one download.
const inFlight = new Map<string, Promise<string>>()

/**
 * Resolves a remote URL to a local file path: instantly when cached,
 * otherwise downloads once (concurrent callers share the promise). Rejects
 * on network errors, non-2xx responses and non-image payloads.
 */
export const loadRemoteImage = (
  uri: string,
  fetcher: ImageFetcher = fetch,
): Promise<string> => {
  const target = cachePathFor(uri)
  if (existsSync(target)) {
    return Promise.resolve(target)
  }
  const pending = inFlight.get(uri)
  if (pending) {
    return pending
  }
  const download = (async (): Promise<string> => {
    const response = await fetcher(uri)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${uri}`)
    }
    const contentType = response.headers.get("content-type")
    if (contentType !== null && !contentType.startsWith("image/")) {
      throw new Error(`Not an image (${contentType}) at ${uri}`)
    }
    const bytes = Buffer.from(await response.arrayBuffer())
    mkdirSync(cacheDir(), { recursive: true })
    // Write-then-rename: a crash mid-write must not leave a partial file
    // that later reads as a cache hit.
    const scratch = `${target}.${process.pid}.part`
    await writeFile(scratch, bytes)
    renameSync(scratch, target)
    return target
  })().finally(() => {
    inFlight.delete(uri)
  })
  inFlight.set(uri, download)
  return download
}
