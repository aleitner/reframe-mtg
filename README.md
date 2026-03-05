# Reframe MTG

Replace Magic: The Gathering card images on EDHREC and other sites with your preferred printings — old border, modern frame, Secret Lairs, and more.

<!-- TODO: Add extension store badges/links once published -->
<!-- [Chrome Web Store](https://chrome.google.com/webstore/detail/reframe-mtg/CHROME_EXTENSION_ID) · [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/reframe-mtg/) -->

## Features

- **Automatic card replacement** — Detects Scryfall card images and swaps them with your preferred printing
- **Frame priority** — Rank frame styles (old border, modern, extended art, etc.) in the order you prefer
- **Set priority** — Fine-grained control over which sets to prefer in advanced mode
- **Printing options** — Choose oldest/newest printing, border color, and foil finish preferences
- **Block specific printings** — Exclude individual cards, ranges, or entire sets by set code
- **SPA-aware** — Works seamlessly on single-page apps with live navigation detection

## Supported Sites

- [EDHREC](https://edhrec.com)
- [Archidekt](https://archidekt.com)
- [TappedOut](https://tappedout.net)

## Install

### Chrome

<!-- TODO: Replace with Chrome Web Store link once published -->
**Chrome Web Store** — *Coming soon*

To install manually:

1. Run `./build.sh` to generate the packaged builds
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the `build/chrome` folder

### Firefox

<!-- TODO: Replace with Firefox Add-ons link once published -->
**Firefox Add-ons** — *Coming soon*

To install manually:

1. Run `./build.sh` to generate the packaged builds
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** and select `build/firefox/manifest.json`

## Building

```bash
./build.sh
```

This creates two zip files in `build/`:

- `mtg-printing-prefs-chrome.zip` — Chrome (Manifest V3)
- `mtg-printing-prefs-firefox.zip` — Firefox (Manifest V2)

## How It Works

The extension runs a content script on supported sites that watches for `<img>` elements with Scryfall URLs. When a card image is found, it sends the card name to the background script, which queries the Scryfall API for available printings and returns the best match based on your configured preferences. The image `src` is then swapped in-place.

A `MutationObserver` ensures dynamically loaded cards (infinite scroll, SPA navigation) are caught automatically.

## Acknowledgements

Card data and images provided by [Scryfall](https://scryfall.com). Reframe MTG is not produced by or endorsed by Scryfall.

## Links

- **Author** — [aleitner](https://github.com/aleitner)
- **Support** — [Buy me a coffee](https://ko-fi.com/piyrus)
- **Source** — [GitHub](https://github.com/aleitner/reframe-mtg)

## License

[MIT](LICENSE)
