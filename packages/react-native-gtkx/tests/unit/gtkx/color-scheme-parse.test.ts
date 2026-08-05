// Unit coverage for the D-Bus parsing seam behind the plain profile's
// Appearance fallback (src/gtkx/bridge/color-scheme-portal.ts). This is the
// part of that file .claude/epics/adw-optional/004.md calls for
// unit-testing directly: the real portal round trip cannot be exercised
// headless in this repo (see spike/plain-gtk/tests/appearance.gtk.test.tsx's
// own doc comment) — no CI/dev environment here has a settings portal that
// this repo's tests are allowed to query — so this file stands in for it
// with plain objects shaped like the slice of GLib.Variant the real code
// actually calls (VariantLike), covering the one thing genuinely likely to
// regress: the portal's well-documented double-variant-boxing quirk
// (flatpak/xdg-desktop-portal#789).
import { describe, expect, it } from "vitest"
import {
  parseColorSchemeValue,
  parsePortalReadReply,
  parseSettingChangedValue,
  unwrapVariant,
  type VariantLike,
} from "../../../src/gtkx/bridge/color-scheme-parse"

// A minimal, real-shaped stand-in for GLib.Variant: a scalar leaf ("u") or a
// variant box ("v") wrapping another VariantLike, matching how
// GLib.Variant.getVariant()/getTypeString() actually behave.
const uint32 = (value: number): VariantLike => ({
  getTypeString: () => "u",
  getVariant: () => {
    throw new Error("not a variant box")
  },
  getUint32: () => value,
  getString: () => {
    throw new Error("not a string")
  },
})

const boxed = (inner: VariantLike): VariantLike => ({
  getTypeString: () => "v",
  getVariant: () => inner,
  getUint32: () => {
    throw new Error("still boxed")
  },
  getString: () => {
    throw new Error("still boxed")
  },
})

const string = (value: string): VariantLike => ({
  getTypeString: () => "s",
  getVariant: () => {
    throw new Error("not a variant box")
  },
  getUint32: () => {
    throw new Error("not a uint32")
  },
  getString: () => [value, value.length],
})

describe("parseColorSchemeValue", () => {
  it("maps 1 to dark", () => {
    expect(parseColorSchemeValue(1)).toBe("dark")
  })

  it("maps 0 (no preference) to light", () => {
    expect(parseColorSchemeValue(0)).toBe("light")
  })

  it("maps 2 (prefer light) to light", () => {
    expect(parseColorSchemeValue(2)).toBe("light")
  })

  it("treats an unknown value the same as no preference, per the portal spec", () => {
    expect(parseColorSchemeValue(99)).toBe("light")
  })
})

describe("unwrapVariant", () => {
  it("passes through an already-scalar variant", () => {
    const leaf = uint32(1)
    expect(unwrapVariant(leaf)).toBe(leaf)
  })

  it("unwraps a single box (the *.impl.* / ReadOne shape)", () => {
    expect(unwrapVariant(boxed(uint32(1))).getUint32()).toBe(1)
  })

  it("unwraps a double box (the documented org.freedesktop.portal.Settings.Read quirk)", () => {
    expect(unwrapVariant(boxed(boxed(uint32(1)))).getUint32()).toBe(1)
  })
})

describe("parsePortalReadReply", () => {
  it("reads a single-boxed reply", () => {
    expect(parsePortalReadReply(boxed(uint32(1)))).toBe("dark")
  })

  it("reads a double-boxed reply (Read's own quirk)", () => {
    expect(parsePortalReadReply(boxed(boxed(uint32(2))))).toBe("light")
  })
})

describe("parseSettingChangedValue", () => {
  it("reads the value argument the same way a Read reply is read", () => {
    expect(parseSettingChangedValue(boxed(uint32(1)))).toBe("dark")
  })
})

// Documents the shape the real caller (color-scheme-portal.ts) relies on
// for filtering SettingChanged to the one namespace/key it cares about —
// getString() returns [value, byteLength], gvariant/gjs-style.
describe("VariantLike.getString (namespace/key filtering shape)", () => {
  it("returns the string as the first tuple element", () => {
    expect(string("org.freedesktop.appearance").getString()[0]).toBe(
      "org.freedesktop.appearance",
    )
  })
})
