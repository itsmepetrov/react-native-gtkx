// Spike PAINT check: the overflow child (a ██ block at x≈280..340, y≈60..90
// in a 640x480 fullscreen window) must leave dark pixels PAST its container's
// boundary (x=300), where the background is the pristine outer box. Compare
// the mean brightness of the block zone against an empty control zone on the
// same row. Input is grim's PPM P6 (parsed with zero dependencies).
import { readFileSync } from "node:fs"

const path = process.argv[2] ?? "shots/paint.ppm"
const data = readFileSync(path)

const header = data.subarray(0, 64).toString("latin1")
const match = header.match(/^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/)
if (!match) {
  console.log("PAINT-PIXELS FAIL (not PPM P6)")
  process.exit(1)
}
const width = Number(match[1])
const height = Number(match[2])
const offset = match[0].length

const meanBrightness = (x0, y0, x1, y1) => {
  let sum = 0
  let count = 0
  for (let y = y0; y < y1 && y < height; y += 1) {
    for (let x = x0; x < x1 && x < width; x += 1) {
      const index = offset + (y * width + x) * 3
      sum += (data[index] + data[index + 1] + data[index + 2]) / 3
      count += 1
    }
  }
  return count > 0 ? sum / count : 255
}

const block = meanBrightness(305, 65, 340, 85)
const control = meanBrightness(380, 65, 440, 85)
const ok = block < control - 30
console.log(
  `PAINT-PIXELS ${ok ? "OK" : "FAIL"} block=${block.toFixed(0)} control=${control.toFixed(0)} (${width}x${height})`,
)
process.exit(ok ? 0 : 1)
