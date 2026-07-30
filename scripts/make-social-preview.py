#!/usr/bin/env python3
"""Render docs/social-preview.png — the 1280x640 GitHub repository social card.

Composition: an Adwaita-dark backdrop, the project wordmark and tagline on the
left, and two real GTK4 app windows (examples/hn-app) stacked on the right so
the native chrome is instantly recognisable.

Requires Pillow and numpy. The project icon is rasterised from docs/icon.svg
with macOS `qlmanage`; if that is unavailable the icon is simply omitted.
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "shots"
OUT = ROOT / "docs" / "social-preview.png"

W, H = 1280, 640

# Adwaita-dark flavoured project palette.
BG = (36, 31, 49)  # #241f31 window
CARD = (61, 56, 70)  # #3d3846 card
ACCENT = (28, 113, 216)  # #1c71d8 focus blue
REACT_CYAN = (0, 216, 255)
TEXT = (255, 255, 255)
TEXT_DIM = (185, 178, 205)
TEXT_FAINT = (150, 143, 172)

SF = "/System/Library/Fonts/SFNS.ttf"
SF_MONO = "/System/Library/Fonts/SFNSMono.ttf"


def font(size: int, weight: str = "Regular", path: str = SF) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(path, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def rasterise_icon(px: int) -> Image.Image | None:
    """Rasterise docs/icon.svg via QuickLook (vector -> crisp bitmap).

    QuickLook returns an opaque square matted on white, so the transparency is
    rebuilt from the shapes the SVG actually draws: the 256x256 rounded tile
    (rx=56) plus the gtkx badge that pokes past its bottom-right corner. The
    matte is repainted in the tile's own #222222 *before* downsampling so no
    white bleeds into the rounded corners.
    """
    svg = ROOT / "docs" / "icon.svg"
    if not svg.exists():
        return None
    hi = px * 4
    with tempfile.TemporaryDirectory() as tmp:
        try:
            subprocess.run(
                ["qlmanage", "-t", "-s", str(hi), "-o", tmp, str(svg)],
                check=True,
                capture_output=True,
                timeout=60,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        rendered = list(Path(tmp).glob("*.png"))
        if not rendered:
            return None
        img = Image.open(rendered[0]).convert("RGB")

    # QuickLook pads the thumbnail canvas, so locate the drawn tile: its ink
    # bounding box is exactly the 256x256 viewBox.
    ink = (np.asarray(img) < 245).any(axis=2)
    ys, xs = np.where(ink)
    if len(ys) == 0:
        return None
    img = img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    img = img.resize((hi, hi), Image.LANCZOS)

    k = hi / 256.0  # SVG user units -> rendered pixels
    mask = Image.new("L", (hi, hi), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, hi - 1, hi - 1), radius=round(56 * k), fill=255)
    md.rounded_rectangle(
        (round(146 * k), round(146 * k), round(242 * k) - 1, round(242 * k) - 1),
        radius=round(26 * k),
        fill=255,
    )
    flat = Image.new("RGB", (hi, hi), (34, 34, 34))
    flat.paste(img, (0, 0), mask)

    out = flat.resize((px, px), Image.LANCZOS).convert("RGBA")
    out.putalpha(mask.resize((px, px), Image.LANCZOS))
    return out


def backdrop() -> Image.Image:
    """Base colour + soft radial glows + vignette, built in float space."""
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    canvas = np.zeros((H, W, 3), np.float32)
    canvas[:] = BG

    def glow(cx, cy, radius, colour, strength, falloff=2.2):
        d = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2) / radius
        mask = np.clip(1.0 - d, 0.0, 1.0) ** falloff * strength
        for c in range(3):
            canvas[:, :, c] += (colour[c] - canvas[:, :, c]) * mask

    # Blue bloom behind the screenshots, cyan counter-light under the wordmark.
    glow(1050, 330, 720, ACCENT, 0.34)
    glow(190, 500, 640, REACT_CYAN, 0.09)
    glow(110, 70, 540, CARD, 0.32)

    # Vignette to keep the corners quiet.
    d = np.sqrt(((xs - W / 2) / (W / 2)) ** 2 + ((ys - H / 2) / (H / 2)) ** 2)
    vig = np.clip((d - 0.55) / 0.9, 0.0, 1.0) ** 1.7 * 0.55
    canvas *= 1.0 - vig[:, :, None]

    return Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8)).convert("RGBA")


def drop_shadow(alpha: Image.Image, blur: int, offset: tuple[int, int], opacity: float) -> Image.Image:
    """An RGBA layer holding a blurred silhouette of `alpha`, canvas-sized."""
    pad = blur * 3
    grown = Image.new("L", (alpha.width + pad * 2, alpha.height + pad * 2), 0)
    grown.paste(alpha, (pad, pad))
    grown = grown.filter(ImageFilter.GaussianBlur(blur))
    grown = grown.point(lambda v: int(v * opacity))
    layer = Image.new("RGBA", (grown.width, grown.height), (8, 6, 14, 0))
    layer.putalpha(grown)
    return layer, pad, offset


def place_window(
    canvas: Image.Image,
    name: str,
    width: int,
    pos: tuple[int, int],
    blur=34,
    opacity=0.75,
    dim=1.0,
) -> None:
    """Paste a screenshot with a soft drop shadow; the canvas clips any bleed.

    `dim` < 1 pushes a window back in the stack so the front one stays legible.
    """
    shot = Image.open(SHOTS / name).convert("RGBA")
    height = round(shot.height * width / shot.width)
    shot = shot.resize((width, height), Image.LANCZOS)
    if dim != 1.0:
        r, g, b, a = shot.split()
        scale = lambda v: int(v * dim)  # noqa: E731
        shot = Image.merge("RGBA", (r.point(scale), g.point(scale), b.point(scale), a))

    layer, pad, _ = drop_shadow(shot.split()[-1], blur, (0, 0), opacity)
    canvas.alpha_composite(layer, (pos[0] - pad, pos[1] - pad + 18))
    canvas.alpha_composite(shot, pos)


def rounded_rect(size: tuple[int, int], radius: int, fill, outline=None, width=1) -> Image.Image:
    img = Image.new("RGBA", (size[0] * 4, size[1] * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(
        (0, 0, size[0] * 4 - 1, size[1] * 4 - 1),
        radius=radius * 4,
        fill=fill,
        outline=outline,
        width=width * 4,
    )
    return img.resize(size, Image.LANCZOS)


def build() -> Image.Image:
    canvas = backdrop()

    # ---- right side: two real GTK4 windows, the front one bleeding off-canvas
    place_window(canvas, "hn-story.png", 344, (760, 40), blur=34, opacity=0.65, dim=0.72)
    place_window(canvas, "hn-list.png", 400, (852, 190), blur=46, opacity=0.92)

    draw = ImageDraw.Draw(canvas)

    # ---- left side: icon, wordmark, tagline, install/run line
    x = 76
    icon = rasterise_icon(78)
    y = 116
    if icon is not None:
        ishadow, pad, _ = drop_shadow(icon.split()[-1], 16, (0, 0), 0.6)
        canvas.alpha_composite(ishadow, (x - pad, y - pad + 8))
        canvas.alpha_composite(icon, (x, y))
        y += icon.height + 34

    f_title = font(76, "Bold")
    draw.text((x, y), "react-native-gtkx", font=f_title, fill=TEXT)
    y += 96

    f_lead = font(34, "Semibold")
    draw.text((x, y), "React Native for the Linux desktop", font=f_lead, fill=(226, 221, 240))
    y += 50

    f_sub = font(27, "Regular")
    draw.text(
        (x, y),
        "Real GTK4 / libadwaita widgets.\nNo WebView, no canvas.",
        font=f_sub,
        fill=(200, 194, 217),
        spacing=10,
    )
    y += 92

    # Terminal-style chip with the command that actually runs an app.
    f_mono = font(26, "Medium", SF_MONO)
    cmd = "npx react-native run-linux"
    prompt = "$ "
    pw = draw.textlength(prompt, font=f_mono)
    cw = draw.textlength(cmd, font=f_mono)
    chip_w, chip_h = int(pw + cw) + 56, 60
    chip = rounded_rect((chip_w, chip_h), 14, (61, 56, 70, 225), outline=(110, 102, 128, 200), width=1)
    canvas.alpha_composite(chip, (x, y))
    ty = y + (chip_h - 34) // 2
    draw.text((x + 28, ty), prompt, font=f_mono, fill=(120, 174, 237))
    draw.text((x + 28 + pw, ty), cmd, font=f_mono, fill=(230, 226, 242))

    return canvas


def main() -> int:
    img = build().convert("RGB")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    print(f"wrote {OUT} ({img.width}x{img.height})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
