#!/usr/bin/env bash
# Generate packages/react-native-gtkx/README.md from the root README for npm:
# npmjs.com does not resolve repo-relative links, so docs/ references are
# rewritten to absolute GitHub URLs. Wired as the package's prepack hook.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="https://raw.githubusercontent.com/itsmepetrov/react-native-gtkx/main"
BLOB="https://github.com/itsmepetrov/react-native-gtkx/blob/main"
sed \
  -e "s|src=\"docs/|src=\"$RAW/docs/|g" \
  -e "s|](docs/|]($BLOB/docs/|g" \
  -e "s|](CONTRIBUTING.md)|]($BLOB/CONTRIBUTING.md)|g" \
  "$ROOT/README.md" > "$ROOT/packages/react-native-gtkx/README.md"
echo "packages/react-native-gtkx/README.md regenerated"
