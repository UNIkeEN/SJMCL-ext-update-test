#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="$ROOT_DIR/org.sjmcl.release_update_test"
DIST_DIR="$ROOT_DIR/dist"

version="$(node -e "const fs=require('fs'); const path=require('path'); const manifest=JSON.parse(fs.readFileSync(path.join(process.argv[1],'sjmcl.ext.json'),'utf8')); console.log(manifest.version);" "$PLUGIN_DIR")"
identifier="$(node -e "const fs=require('fs'); const path=require('path'); const manifest=JSON.parse(fs.readFileSync(path.join(process.argv[1],'sjmcl.ext.json'),'utf8')); console.log(manifest.identifier);" "$PLUGIN_DIR")"
out_dir="$DIST_DIR/$version"
package_path="$out_dir/${identifier}-${version}.sjmclx"

mkdir -p "$out_dir"
rm -f "$package_path"
(
  cd "$ROOT_DIR"
  zip -qry -X "$package_path" "$(basename "$PLUGIN_DIR")"
)
cp "$PLUGIN_DIR/sjmcl.ext.json" "$out_dir/sjmcl.ext.json"
cp "$PLUGIN_DIR/icon.png" "$out_dir/icon.png"

echo "$out_dir"
