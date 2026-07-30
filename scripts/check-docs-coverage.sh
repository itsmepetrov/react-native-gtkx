#!/usr/bin/env bash
# Docs coverage gate: every VALUE export of the public surface must be
# mentioned in docs/api.md. Type-only exports are exempt.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INDEX="$ROOT/packages/react-native-gtkx/src/index.ts"
DOC="$ROOT/docs/api.md"

# Value exports: entries of `export { ... }` blocks (single- or multi-line,
# skipping `type` entries and whole `export type { ... }` blocks, honoring
# `X as Y` renames) plus `export const` declarations.
names=$(awk '
  function emit(entry) {
    gsub(/,$/, "", entry)
    gsub(/^[ \t]+|[ \t]+$/, "", entry)
    if (entry == "" || entry ~ /^type / || entry ~ /^\}/) return
    sub(/.* as /, "", entry)
    print entry
  }
  /^export const [A-Za-z_]/ { print $3; next }
  /^export type \{/ { skiptype = 1 }
  skiptype { if ($0 ~ /\}/) skiptype = 0; next }
  /^export \{/ {
    line = $0
    sub(/^export \{/, "", line)
    if (line ~ /\}/) {
      sub(/\}.*/, "", line)
      n = split(line, parts, ",")
      for (i = 1; i <= n; i++) emit(parts[i])
    } else {
      inblock = 1
    }
    next
  }
  inblock {
    if ($0 ~ /^\}/) { inblock = 0; next }
    emit($0)
  }
' "$INDEX" | sort -u)

missing=""
count=0
for name in $names; do
  count=$((count + 1))
  if ! grep -q "\`$name\`" "$DOC"; then
    missing="$missing  - $name\n"
  fi
done

if [ -n "$missing" ]; then
  echo "Undocumented public exports (add them to docs/api.md):"
  printf "%b" "$missing"
  exit 1
fi
echo "docs coverage OK: $count public exports documented"
