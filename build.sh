#!/bin/bash
# Build script for Reframe MTG extension
# Usage: ./build.sh

set -e

FILES="background.js content.js options.js popup.js options.html popup.html icons/icon-48.svg"

# Clean previous builds
rm -rf build/
mkdir -p build/chrome build/firefox

# Copy shared files
for target in chrome firefox; do
  for f in $FILES; do
    dir=$(dirname "build/$target/$f")
    mkdir -p "$dir"
    cp "$f" "build/$target/$f"
  done
done

# Chrome: use MV3 manifest
cp manifest_chrome.json build/chrome/manifest.json

# Firefox: use MV2 manifest
cp manifest.json build/firefox/manifest.json

# Create zips (use Python to ensure forward-slash paths on all platforms)
python3 -c "
import zipfile, os
for target in ['chrome', 'firefox']:
    src = os.path.join('build', target)
    out = os.path.join('build', f'reframe-mtg-{target}.zip')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(src):
            for f in files:
                full = os.path.join(root, f)
                arc = os.path.relpath(full, src).replace(os.sep, '/')
                zf.write(full, arc)
"

echo ""
echo "Done! Packages ready in build/:"
echo "  build/reframe-mtg-chrome.zip  (Chrome Web Store)"
echo "  build/reframe-mtg-firefox.zip (Firefox Add-ons)"
