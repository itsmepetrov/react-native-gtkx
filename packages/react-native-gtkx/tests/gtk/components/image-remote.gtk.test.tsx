// Remote Image through the cache, no network: a pre-seeded cache file for
// an https URL must load into the picture and fire onLoad; a dead URL must
// fire onError without touching the widget.
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { render, waitFor } from "@gtkx/testing"
import { expect, it, vi } from "vitest"
import { cachePathFor } from "../../../src/components/image-loader"
import { Image, Root } from "../../../src/index"

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
)

it("remote uri resolves from the disk cache and fires onLoad", async () => {
  const uri = "https://cache-hit.example/pixel.png"
  const target = cachePathFor(uri)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, PNG)

  const onLoad = vi.fn()
  const onError = vi.fn()
  await render(
    <Root
      width={200}
      height={200}
    >
      <Image
        source={{ uri }}
        style={{ width: 40, height: 40 }}
        onLoad={onLoad}
        onError={onError}
      />
    </Root>,
  )
  await waitFor(() => {
    expect(onLoad).toHaveBeenCalledOnce()
  })
  expect(onError).not.toHaveBeenCalled()
})

it("unreachable remote uri fires onError", async () => {
  const onError = vi.fn()
  await render(
    <Root
      width={200}
      height={200}
    >
      <Image
        source={{ uri: "https://127.0.0.1:1/nope.png" }}
        style={{ width: 40, height: 40 }}
        onError={onError}
      />
    </Root>,
  )
  await waitFor(() => {
    expect(onError).toHaveBeenCalledOnce()
  })
})

it("an undecodable cached payload fires onError, not a blank onLoad", async () => {
  const uri = "https://cache-hit.example/favicon.ico"
  const target = cachePathFor(uri)
  mkdirSync(dirname(target), { recursive: true })
  // Bytes no image loader accepts (the ICO-favicon case, distilled).
  writeFileSync(target, Buffer.from("not an image at all"))

  const onLoad = vi.fn()
  const onError = vi.fn()
  await render(
    <Root
      width={200}
      height={200}
    >
      <Image
        source={{ uri }}
        style={{ width: 40, height: 40 }}
        onLoad={onLoad}
        onError={onError}
      />
    </Root>,
  )
  await waitFor(() => {
    expect(onError).toHaveBeenCalledOnce()
  })
  expect(onLoad).not.toHaveBeenCalled()
})
