---
name: verify
description: The full pre-commit verification checklist for react-native-gtkx changes — what to run locally, what needs the VM, and the repository's commit rules. Use before committing any package, example, or docs change.
---

# Verification checklist

## Local (any OS)

```bash
npm run lint            # eslint (bridge-only @gtkx imports is enforced here)
npm run format:check    # prettier
npm test                # unit project (the GTK project auto-skips off-Linux)
npm run docs:check      # every value export of the package must be in docs/api.md
npm run mcp:check-data  # regenerate + commit if you touched docs/ or the surface
```

`mcp:check-data` is the one that catches people out: `src/mcp/data/generated.ts`
is generated FROM docs/, so any docs change makes it stale and CI fails on it
long after the code is green. Fix with `node scripts/generate-mcp-data.mjs`.

## In the VM (Linux-only; see the `vm` skill)

```bash
npm run typecheck        # needs the codegen store
npm test                 # unit + GTK projects in one run
npm run check:package    # build:dist + are-the-types-wrong
npm run typecheck -w rn-app   # the cli-init example against stock RN types
```

For toolchain/runtime changes also re-run the relevant headless proofs
(`vm` skill) — release run-linux, dev-mode HMR probes, gtkx dev.

## What "done" means here

- RN semantics are the contract: any deviation from react-native behavior
  is either fixed or documented in docs/api.md (Differences column).
- New public exports need a docs/api.md row (docs:check enforces the name,
  you write the substance) and usually a gallery demo.
- GTK behavior gets a GTK test (tests/gtk/**), pure logic a unit test
  (tests/unit/**).

## Commit rules

- Meaningful English messages; explain the WHY, not just the what.
- No internal planning/task numbers, no Co-Authored-By trailers.
- No private infrastructure ever (hosts, addresses, usernames) — machine
  config belongs in scripts/local/ (gitignored).
- `.claude/` stays local except `.claude/skills/`.
