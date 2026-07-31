#!/usr/bin/env node
// Render docs/social-preview.png — the 1280x640 GitHub repository social card.
//
// Composition: an Adwaita-dark backdrop, the project wordmark and tagline on
// the left, and two real GTK4 app windows (examples/hn-app) stacked on the
// right so the native chrome is instantly recognisable.
//
// Uses @napi-rs/canvas (skia) for drawing, text (including the variable-font
// weight selection SFNS.ttf needs — "400"/"600"/"700" px font strings select
// named instances the same way Pillow's set_variation_by_name did) and blur.
// The project icon is still rasterised from docs/icon.svg with macOS
// `qlmanage` — an external process, already macOS-only, not a library this
// port could usefully replace.
import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createCanvas,
  GlobalFonts,
  loadImage,
  type Canvas,
  type SKRSContext2D,
} from "@napi-rs/canvas"

const ROOT = join(import.meta.dirname, "..")
const SHOTS = join(ROOT, "docs/shots")
const OUT = join(ROOT, "docs/social-preview.png")

const W = 1280
const H = 640

// Adwaita-dark flavoured project palette.
const BG: [number, number, number] = [36, 31, 49] // #241f31 window
const CARD: [number, number, number] = [61, 56, 70] // #3d3846 card
const ACCENT: [number, number, number] = [28, 113, 216] // #1c71d8 focus blue
const REACT_CYAN: [number, number, number] = [0, 216, 255]
const TEXT = "#ffffff"

const SF = "/System/Library/Fonts/SFNS.ttf"
const SF_MONO = "/System/Library/Fonts/SFNSMono.ttf"
const SF_FAMILY = "RNGtkxSocialPreviewSF"
const SF_MONO_FAMILY = "RNGtkxSocialPreviewSFMono"

// OpenType weight classes — the names the Python script passed to
// set_variation_by_name, mapped to the numeric weights CSS font strings (and
// therefore this variable font's own `wght` axis) actually use.
const WEIGHTS: Record<string, number> = {
  Regular: 400,
  Medium: 500,
  Semibold: 600,
  Bold: 700,
}

const cssFont = (px: number, weight: string, family: string): string =>
  `${WEIGHTS[weight] ?? 400} ${px}px ${family}`

const clampByte = (v: number): number =>
  Math.max(0, Math.min(255, Math.round(v)))
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

// Pillow's RGBA tuples use a 0-255 alpha; canvas's rgba() wants 0-1.
const rgba8 = (r: number, g: number, b: number, a: number): string =>
  `rgba(${r}, ${g}, ${b}, ${a / 255})`

/**
 * Rasterise docs/icon.svg via QuickLook (vector -> crisp bitmap).
 *
 * QuickLook returns an opaque square matted on white, so the transparency is
 * rebuilt from the shapes the SVG actually draws: the 256x256 rounded tile
 * (rx=56) plus the gtkx badge that pokes past its bottom-right corner. The
 * matte is repainted in the tile's own #222222 *before* downsampling so no
 * white bleeds into the rounded corners.
 */
const rasteriseIcon = async (px: number): Promise<Canvas | undefined> => {
  const svg = join(ROOT, "docs/icon.svg")
  if (!existsSync(svg)) {
    return undefined
  }
  const hi = px * 4
  const tmp = mkdtempSync(join(tmpdir(), "social-preview-icon-"))
  let renderedPath: string | undefined
  try {
    execFileSync("qlmanage", ["-t", "-s", String(hi), "-o", tmp, svg], {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 60_000,
    })
    renderedPath = readdirSync(tmp).find((name) => name.endsWith(".png"))
  } catch {
    renderedPath = undefined
  }
  if (!renderedPath) {
    rmSync(tmp, { recursive: true, force: true })
    return undefined
  }

  const rendered = await loadImage(join(tmp, renderedPath))
  rmSync(tmp, { recursive: true, force: true })

  const scratch = createCanvas(rendered.width, rendered.height)
  const sctx = scratch.getContext("2d")
  sctx.drawImage(rendered, 0, 0)
  const { data } = sctx.getImageData(0, 0, rendered.width, rendered.height)

  // QuickLook pads the thumbnail canvas, so locate the drawn tile: its ink
  // bounding box is exactly the 256x256 viewBox.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let y = 0; y < rendered.height; y++) {
    for (let x = 0; x < rendered.width; x++) {
      const i = (y * rendered.width + x) * 4
      const r = data[i] ?? 255
      const g = data[i + 1] ?? 255
      const b = data[i + 2] ?? 255
      if (r < 245 || g < 245 || b < 245) {
        if (x < minX) {
          minX = x
        }
        if (x > maxX) {
          maxX = x
        }
        if (y < minY) {
          minY = y
        }
        if (y > maxY) {
          maxY = y
        }
      }
    }
  }
  if (!Number.isFinite(minX)) {
    return undefined
  }
  const cropW = maxX - minX + 1
  const cropH = maxY - minY + 1

  const k = hi / 256.0 // SVG user units -> rendered pixels

  // Clip to the rounded tile + the gtkx badge, drawing straight from the
  // cropped/rescaled QuickLook render — canvas composites premultiplied
  // alpha correctly on downscale, so (unlike the Pillow original) there is
  // no need to flatten onto a matte background before resizing.
  const hiCanvas = createCanvas(hi, hi)
  const hctx = hiCanvas.getContext("2d")
  hctx.beginPath()
  hctx.roundRect(0, 0, hi, hi, 56 * k)
  hctx.roundRect(146 * k, 146 * k, 96 * k, 96 * k, 26 * k)
  hctx.clip()
  hctx.imageSmoothingEnabled = true
  hctx.imageSmoothingQuality = "high"
  hctx.drawImage(rendered, minX, minY, cropW, cropH, 0, 0, hi, hi)

  const out = createCanvas(px, px)
  const octx = out.getContext("2d")
  octx.imageSmoothingEnabled = true
  octx.imageSmoothingQuality = "high"
  octx.drawImage(hiCanvas, 0, 0, px, px)
  return out
}

/** Base colour + soft radial glows + vignette, built in a raw pixel buffer. */
const backdrop = (): Canvas => {
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext("2d")
  const imageData = ctx.createImageData(W, H)
  const rgb = new Float64Array(W * H * 3)
  for (let i = 0; i < W * H; i++) {
    rgb[i * 3] = BG[0]
    rgb[i * 3 + 1] = BG[1]
    rgb[i * 3 + 2] = BG[2]
  }

  const glow = (
    cx: number,
    cy: number,
    radius: number,
    colour: [number, number, number],
    strength: number,
    falloff = 2.2,
  ): void => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx
        const dy = y - cy
        const d = Math.sqrt(dx * dx + dy * dy) / radius
        const mask = clamp01(1 - d) ** falloff * strength
        const idx = (y * W + x) * 3
        rgb[idx] = (rgb[idx] ?? 0) + (colour[0] - (rgb[idx] ?? 0)) * mask
        rgb[idx + 1] =
          (rgb[idx + 1] ?? 0) + (colour[1] - (rgb[idx + 1] ?? 0)) * mask
        rgb[idx + 2] =
          (rgb[idx + 2] ?? 0) + (colour[2] - (rgb[idx + 2] ?? 0)) * mask
      }
    }
  }

  // Blue bloom behind the screenshots, cyan counter-light under the wordmark.
  glow(1050, 330, 720, ACCENT, 0.34)
  glow(190, 500, 640, REACT_CYAN, 0.09)
  glow(110, 70, 540, CARD, 0.32)

  // Vignette to keep the corners quiet.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const nx = (x - W / 2) / (W / 2)
      const ny = (y - H / 2) / (H / 2)
      const d = Math.sqrt(nx * nx + ny * ny)
      const vig = clamp01((d - 0.55) / 0.9) ** 1.7 * 0.55
      const idx = (y * W + x) * 3
      rgb[idx] = (rgb[idx] ?? 0) * (1 - vig)
      rgb[idx + 1] = (rgb[idx + 1] ?? 0) * (1 - vig)
      rgb[idx + 2] = (rgb[idx + 2] ?? 0) * (1 - vig)
    }
  }

  for (let i = 0; i < W * H; i++) {
    imageData.data[i * 4] = clampByte(rgb[i * 3] ?? 0)
    imageData.data[i * 4 + 1] = clampByte(rgb[i * 3 + 1] ?? 0)
    imageData.data[i * 4 + 2] = clampByte(rgb[i * 3 + 2] ?? 0)
    imageData.data[i * 4 + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/**
 * A blurred, solid-colour silhouette of `source`'s alpha shape, on a canvas
 * padded by blur*3 so the blur has room — the same shape drop_shadow()
 * built in Pillow from a grayscale alpha channel, built here straight from
 * whatever was already drawn (source-in keeps the fill only where the
 * source had alpha, discarding its actual colour).
 */
const buildShadowLayer = (
  source: Canvas,
  blur: number,
  opacity: number,
): { canvas: Canvas; pad: number } => {
  const pad = blur * 3
  const w = source.width + pad * 2
  const h = source.height + pad * 2

  const silhouette = createCanvas(w, h)
  const sctx = silhouette.getContext("2d")
  sctx.drawImage(source, pad, pad)
  sctx.globalCompositeOperation = "source-in"
  sctx.fillStyle = `rgba(8, 6, 14, ${opacity})`
  sctx.fillRect(0, 0, w, h)

  const blurred = createCanvas(w, h)
  const bctx = blurred.getContext("2d")
  bctx.filter = `blur(${blur}px)`
  bctx.drawImage(silhouette, 0, 0)

  return { canvas: blurred, pad }
}

interface PlaceWindowOptions {
  blur?: number
  opacity?: number
  dim?: number
}

/**
 * Paste a screenshot with a soft drop shadow; the canvas clips any bleed.
 * `dim` < 1 pushes a window back in the stack so the front one stays legible.
 */
const placeWindow = async (
  ctx: SKRSContext2D,
  name: string,
  width: number,
  pos: [number, number],
  options: PlaceWindowOptions = {},
): Promise<void> => {
  const { blur = 34, opacity = 0.75, dim = 1.0 } = options
  const image = await loadImage(join(SHOTS, name))
  const height = Math.round((image.height * width) / image.width)

  const shot = createCanvas(width, height)
  const shotCtx = shot.getContext("2d")
  shotCtx.imageSmoothingEnabled = true
  shotCtx.imageSmoothingQuality = "high"
  shotCtx.drawImage(image, 0, 0, width, height)
  if (dim !== 1.0) {
    const id = shotCtx.getImageData(0, 0, width, height)
    for (let i = 0; i < id.data.length; i += 4) {
      id.data[i] = clampByte((id.data[i] ?? 0) * dim)
      id.data[i + 1] = clampByte((id.data[i + 1] ?? 0) * dim)
      id.data[i + 2] = clampByte((id.data[i + 2] ?? 0) * dim)
    }
    shotCtx.putImageData(id, 0, 0)
  }

  const { canvas: shadow, pad } = buildShadowLayer(shot, blur, opacity)
  ctx.drawImage(shadow, pos[0] - pad, pos[1] - pad + 18)
  ctx.drawImage(shot, pos[0], pos[1])
}

const roundedRect = (
  width: number,
  height: number,
  radius: number,
  fill: string,
  outline?: string,
): Canvas => {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext("2d")
  ctx.beginPath()
  ctx.roundRect(0.5, 0.5, width - 1, height - 1, radius)
  ctx.fillStyle = fill
  ctx.fill()
  if (outline) {
    ctx.strokeStyle = outline
    ctx.lineWidth = 1
    ctx.stroke()
  }
  return canvas
}

const build = async (): Promise<Canvas> => {
  const canvas = backdrop()
  const ctx = canvas.getContext("2d")

  // ---- right side: two real GTK4 windows, the front one bleeding off-canvas
  await placeWindow(ctx, "hn-story.png", 344, [760, 40], {
    blur: 34,
    opacity: 0.65,
    dim: 0.72,
  })
  await placeWindow(ctx, "hn-list.png", 400, [852, 190], {
    blur: 46,
    opacity: 0.92,
  })

  // ---- left side: icon, wordmark, tagline, install/run line
  const x = 76
  const icon = await rasteriseIcon(78)
  let y = 116
  if (icon) {
    const { canvas: ishadow, pad } = buildShadowLayer(icon, 16, 0.6)
    ctx.drawImage(ishadow, x - pad, y - pad + 8)
    ctx.drawImage(icon, x, y)
    y += icon.height + 34
  }

  ctx.textBaseline = "top"
  ctx.textAlign = "left"

  ctx.font = cssFont(76, "Bold", SF_FAMILY)
  ctx.fillStyle = TEXT
  ctx.fillText("react-native-gtkx", x, y)
  y += 96

  ctx.font = cssFont(34, "Semibold", SF_FAMILY)
  ctx.fillStyle = "rgb(226, 221, 240)"
  ctx.fillText("React Native for the Linux desktop", x, y)
  y += 50

  ctx.font = cssFont(27, "Regular", SF_FAMILY)
  ctx.fillStyle = "rgb(200, 194, 217)"
  const subLines = ["Real GTK4 / libadwaita widgets.", "No WebView, no canvas."]
  const metrics = ctx.measureText(subLines[0] ?? "")
  const lineHeight =
    (metrics.fontBoundingBoxAscent ?? 27) +
    (metrics.fontBoundingBoxDescent ?? 8) +
    10
  for (const [i, line] of subLines.entries()) {
    ctx.fillText(line, x, y + i * lineHeight)
  }
  y += 92

  // Terminal-style chip with the command that actually runs an app.
  ctx.font = cssFont(26, "Medium", SF_MONO_FAMILY)
  const cmd = "npx react-native run-linux"
  const prompt = "$ "
  const pw = ctx.measureText(prompt).width
  const cw = ctx.measureText(cmd).width
  const chipW = Math.trunc(pw + cw) + 56
  const chipH = 60
  const chip = roundedRect(
    chipW,
    chipH,
    14,
    rgba8(61, 56, 70, 225),
    rgba8(110, 102, 128, 200),
  )
  ctx.drawImage(chip, x, y)
  const ty = y + (chipH - 34) / 2
  ctx.fillStyle = "rgb(120, 174, 237)"
  ctx.fillText(prompt, x + 28, ty)
  ctx.fillStyle = "rgb(230, 226, 242)"
  ctx.fillText(cmd, x + 28 + pw, ty)

  return canvas
}

const main = async (): Promise<void> => {
  GlobalFonts.registerFromPath(SF, SF_FAMILY)
  GlobalFonts.registerFromPath(SF_MONO, SF_MONO_FAMILY)

  const canvas = await build()
  mkdirSync(join(ROOT, "docs"), { recursive: true })
  writeFileSync(OUT, canvas.toBuffer("image/png"))
  console.log(`wrote ${OUT} (${canvas.width}x${canvas.height})`)
}

await main()
