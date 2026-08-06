// Integration smoke test: unlike classify.test.ts/declarations.test.ts
// (fixture-only, never touch the real repo), this runs the real
// derivation against the real docs/reference/ tree — the same call
// docs:check makes. Its job is to catch drift the fixture tests cannot:
// someone edits a component/API's source (changing its derived profile)
// or its doc page (changing what's declared) without keeping the other in
// sync. Kept to one assertion on purpose — the substance of "is a given
// mismatch reported correctly" is declarations.test.ts's job; this only
// asks "does the real repo currently agree with itself".
import { describe, expect, test } from "vitest"
import { checkAdwProfiles } from "./enforce.ts"

describe("checkAdwProfiles: the real docs/reference tree", () => {
  test("every declared profile matches the derived matrix", () => {
    expect(checkAdwProfiles()).toEqual([])
  })
})
