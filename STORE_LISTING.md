# Store listing — ready to paste

The same text works for the **Microsoft Edge Add-ons** store (free) and the **Chrome Web Store** ($5 one-time).

## Edge Add-ons (Partner Center) — field by field

| Field | What to enter |
| --- | --- |
| Package | `dist/glyph-zoo-<version>.zip` (build with `tools/package.ps1`) |
| Visibility | Public |
| Markets | All markets |
| Category | Productivity |
| Website | https://deeksha-bhardwaj.github.io/glyph-zoo/ |
| Support contact | https://github.com/Deeksha-Bhardwaj/glyph-zoo/issues |
| Mature content | No |
| Single purpose | Replaces the new tab page with an animated ASCII scene, clock, daily quote, weather and search box. |
| Permission: search | Lets the search box use the user's own default search engine (`chrome.search.query`) instead of a hard-coded one. |
| Remote code | No (all code is inside the package) |
| Privacy policy URL | https://github.com/Deeksha-Bhardwaj/glyph-zoo/blob/main/PRIVACY.md |
| Extension logo | `store-assets/logo300.png` (300×300) |
| Screenshots | Up to 6, at 1280×800 |
| Description | The "Description" section below (Edge needs 250–10,000 characters) |
| Search terms (max 7, 30 chars each, 21 words total) | `new tab`, `ascii art`, `animated wallpaper`, `butterfly`, `koi fish`, `clock and weather`, `daily quote` |
| Notes for certification | Overrides the new tab page only. Weather is optional: the user types a city, and only that city name is sent to Open-Meteo (open-meteo.com). No accounts, analytics or tracking. |

## Name
Glyph Zoo

## Summary (max 132 characters)
A living ASCII zoo on every new tab: butterflies, koi, whales and more, plus a clock, daily quote and weather.

## Category
Productivity (alternative: Fun)

## Language
English

## Description

Make every new tab a little calmer.

Glyph Zoo fills your new tab with animals drawn entirely from text characters — pink butterflies, koi, jellyfish, dragonflies, manta rays, turtles, flocks of birds, whales and glowing fireflies. They swim, flutter and glide across a soft glowing grid.

✦ A big clock, a personal greeting and a daily quote
✦ Current weather for your city (no location access needed)
✦ Search with your own default search engine
✦ 9 animals, each with several styles — Kohaku or Ogon koi, Peacock or Glasswing butterflies, Humpback or Orca whales…
✦ Click an animal to see it react, click the water to make ripples and drop food
✦ Birds and fish move in realistic flocks and schools
✦ Day and night themes that follow your clock, with stars and fireflies at night
✦ Character sets: ASCII, Blocks, Braille or Japanese Kana
✦ Optional gentle sound — every animal plays its own notes
✦ Low power mode, and no animation at all while the tab is hidden

Private by design: no accounts, no tracking, no ads. Your settings stay in your browser.

## Single purpose (asked during review)
Replaces the new tab page with an animated ASCII scene, clock, quote, weather and search box.

## Permission justification
- **search**: lets the search box use the user's own default search engine via `chrome.search.query`, as required for new tab pages that offer search.

## Data usage answers (Privacy practices tab)
- Collects user data: **No** (the city name is sent to Open-Meteo only to fetch the weather; it is not collected by the developer).
- Certify: not sold to third parties, not used for unrelated purposes, not used for credit decisions.
- Privacy policy URL: https://github.com/Deeksha-Bhardwaj/glyph-zoo/blob/main/PRIVACY.md

## Images you need to make
| Asset | Size | Notes |
| --- | --- | --- |
| Store icon | 128×128 (Chrome) / 300×300 (Edge) | `icons/icon128.png` / `store-assets/logo300.png` |
| Screenshots (1–5) | 1280×800 | New tab with butterflies, koi, whale, night mode, Tweaks panel open |
| Small promo tile (optional) | 440×280 | Butterfly + "Glyph Zoo" title |

Tip for screenshots: set the browser window to 1280×800, press `H` to hide the UI for a clean shot, or keep it visible to show the clock and quote.
