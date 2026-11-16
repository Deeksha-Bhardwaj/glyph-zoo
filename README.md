# Glyph Zoo

A living ASCII ecosystem. Nine procedural animals swim, flutter, flock and glow across a character grid, and each one is drawn entirely with text characters. You can click them, feed them, make ripples and play music with them.

**Live demo:** https://deeksha-bhardwaj.github.io/glyph-zoo/

<!-- To show a preview: save a screenshot as screenshot.png in this folder, then remove these comment marks around the next line.
![Glyph Zoo screenshot](screenshot.png)
-->

## Features

- **New tab essentials:** a big clock (12/24-hour), a personal greeting, a daily quote (click for another), the current weather for your city and a search box.

- **9 animals:** butterfly, koi, jellyfish, dragonfly, manta, turtle, bird, whale and firefly. Every one is a math function, with no sprites or images.
- **Styles for every animal:** pick a design in Tweaks (or "Mix" for a random one each):
  - Butterfly: Classic, Swallowtail, Glasswing, Peacock, Stained glass, Silk (all pink)
  - Koi: Kohaku, Sanke, Showa, Tancho, Ogon, Platinum
  - Jellyfish: Moon, Lion's mane, Crystal, Box
  - Dragonfly: Emerald, Azure, Ruby, Golden-ringed
  - Manta: Oceanic, Reef, Ghost
  - Turtle: Green, Hawksbill, Leatherback, Star
  - Bird: Bluebird, Swallow, Goldfinch, Cardinal
  - Whale (side view): Humpback, Blue whale, Orca
  - Firefly: Gold, Green, Blue
- **Click reactions:** butterflies do a sparkly loop, whales spout, turtles hide in their shell, and birds scatter the whole flock.
- **Water ripples:** click empty space to send out a ring that pushes creatures away.
- **Food chain:** clicking also drops food. Koi, turtles, mantas and whales swim over to eat it.
- **Flocking:** birds and koi use the classic **Boids** algorithm (separation, alignment, cohesion).
- **Day and night:** the background follows your real clock. At night extra fireflies and twinkling stars appear. You can also force day or night.
- **Character sets:** ASCII, Blocks (`░▒▓█`), Braille (`⣿`) and Japanese Kana.
- **Sound:** a small Web Audio synth on a pentatonic scale. Each animal has its own voice, and creatures play notes as they drift across the screen.
- **Tweaks panel:** creature count, speed, cell size, glow, grid, trails and every feature toggle. Settings are saved in `localStorage`.

## Controls

| Input | Action |
| --- | --- |
| Click an animal | Make it react |
| Swipe the mouse fast | Animals scatter (a slow hover leaves them alone) |
| Click empty space | Ripple + drop food |
| Shift + click | Spawn an animal |
| `1`–`9`, `←` `→` | Switch animal |
| `G` | Cycle character set |
| `N` | Cycle Auto / Day / Night |
| `M` | Sound on/off |
| `S` | Cycle the current animal's style |
| `Space` | Pause |
| `H` | Hide UI (screensaver mode) |
| `T` | Tweaks panel |
| `/` | Focus search |
| `?` | Help panel (also the **?** button, top right) |

## How it works

1. **The grid.** The screen is divided into small square cells. Each frame, every cell gets a *density* from 0 to 1. Density picks the character (from a "ramp" like `.:-=+o*#%8@`), the tile colour and the opacity.
2. **Shapes are math.** Each animal has `shape(x, y, t, c)`, which returns a density for a point in the animal's own space (x = forward). Shapes are built from two soft primitives, `ell()` (oval) and `seg()` (thick line). `t` animates them: wings flap with `cos(t)`, and the koi's whole body follows `sin(x - t)`. A shape can also set `TONE` per point to paint markings (borders, spots, patches) in a second or third colour.
3. **Local space.** Each cell centre is rotated into the creature's space before sampling, so one shape works at any angle and size.
4. **Steering.** Each creature has a heading. Every frame it is nudged by wander, flocking, food, hunting or fleeing, the cursor and ripples. Then the creature moves and wraps around the screen edges.
5. **Boids.** For each bird or koi, nearby flockmates are averaged: steer away if too close, match their direction, and drift towards their centre.
6. **Effects.** Ripples, particles (sparkles, ink, water drops), food and trails are drawn into a separate effects layer on the same grid.
7. **Sound.** Each note is one oscillator with a short fade, panned by screen position and sent through a feedback delay for echo. A pentatonic scale means any notes sound nice together.

## Project structure

```
index.html   page + UI markup
style.css    styling, day/night themes
util.js      math helpers (ell, seg, hash, lerpAngle…)
species.js   all animals and character sets
quotes.js    daily quotes
weather.js   weather from Open-Meteo
audio.js     Web Audio synth
main.js      simulation, rendering, UI wiring
manifest.json  Chrome extension settings (new tab override)
icons/       extension icons (16, 48, 128 px)
tools/make-icons.js  draws the icons
tools/package.ps1    builds the Web Store zip
PRIVACY.md           privacy policy (needed for the store)
STORE_LISTING.md     store description, ready to paste
```

## Install as a Chrome extension (new tab page)

Glyph Zoo replaces Chrome's new tab page, like Momentum.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this project folder (the one with `manifest.json`).
4. Open a new tab.

After you change any file, click the **↻ reload** icon on the Glyph Zoo card in `chrome://extensions`, then open a new tab.

Extension notes:
- Web searches use your own default search engine (`chrome.search` API), as the Chrome Web Store requires.
- Fonts are the computer's built-in ones, so it works offline. Only the weather needs the internet.
- Weather comes from [Open-Meteo](https://open-meteo.com/) (free, no API key). Only the city name you type is sent, and results are cached for 30 minutes.
- Settings are saved per browser in `localStorage`.
- **Low power** in Tweaks halves the frame rate to save battery. Chrome also pauses the animation while the tab is hidden.
- Icons are generated by `node tools/make-icons.js`.

### Publishing to the Chrome Web Store

1. **Build the zip:** `powershell -ExecutionPolicy Bypass -File tools\package.ps1` creates `dist\glyph-zoo-<version>.zip` with only the extension files.
2. **Host the privacy policy:** push this repo to GitHub, and use the link to `PRIVACY.md` as the privacy policy URL.
3. **Developer account:** sign up at the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 fee).
4. **New item:** upload the zip, then fill in the listing with the ready-made text in `STORE_LISTING.md` (description, category, permission reason, privacy answers) and add 1280×800 screenshots.
5. **Submit for review.** It usually takes a few days. Once approved, anyone can install it from the store.
6. **Updates:** bump `version` in `manifest.json`, rebuild the zip, and upload it as a new package.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Deploy (GitHub Pages)

1. Push this folder to a public GitHub repo.
2. Go to **Settings → Pages → Source: Deploy from a branch**, choose `main` and `/ (root)`.
3. Your site will be live at `https://<username>.github.io/<repo>/`.

## Credits

Inspired by the "ascii animals" concept by PocketStudio. All code and creature designs here are original.
