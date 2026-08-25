# Andranik Grigoryan — Portfolio

A portfolio with two faces, both generated from a single JSON file:

- **Campaign map** — a procedurally drawn parchment continent you walk around
  as a top-down party, under fog of war. Each keep is one job; riding up to it
  opens that role's chronicle. Accept a keep's mission and waves of that
  company's own incidents march on **the keep** — you are its only archer, and
  each incident yields only to the one tool from that company's stack that
  actually answers it.
- **Document** — the same content as an ordinary, readable, recruiter-friendly
  page.

Toggle with the switch in the corner, or press <kbd>M</kbd> on the map.
The choice is remembered in `localStorage`; `#/map` and `#/doc` deep-link.

## Everything comes from one file

`assets/data/portfolio.json` is the only place content lives. Both views render
from it at runtime — there is no duplicated copy of the résumé anywhere.

| JSON | Map | Document |
|---|---|---|
| `experience[]` | a keep, its chronicle card, and its mission | the timeline |
| `experience[].castle` | keep name, banner colour, silhouette, terrain | — |
| `experience[].mission` | waves, keep integrity, which incidents attack, which tools you carry | — |
| `incidents{}` | each incident's art, skill, and the one domain it is weak to | — |
| `tools{}` | damage, cooldown, projectile speed, pierce, splash per tool kind | — |
| `skills[]` | provinces named across the continent | skill cards |
| `skills[].tags` | villages inside each province | tags |
| `certifications[]` | chapter houses | certificate cards |
| `projects[]` | outlying landmarks | project cards |
| `metrics[]`, `links[]`, `meta` | HUD title and labels | metrics, nav, contact |
| `map.seed` | the entire continent | — |

Change the seed and you get a different world with the same career on it.

## Playing the map

| Input | Action |
|---|---|
| `W A S D` / arrows | march |
| click | travel to a point, a keep, or loose at an incident |
| `Space` / `F` | strike (aims at the cursor, else the nearest incident) |
| `1`–`3` | swap tools **during a mission** |
| `Q` / `E` | cycle tools |
| `1`–`4` | ride to the *n*th keep, when no mission is running |
| mouse wheel | zoom |
| `Esc` | close a card, or abandon a mission |
| `M` | switch to the document view |
| touch | drag anywhere to steer, tap to travel, ⤢ button to strike |

## Missions

Accepting a mission changes the rules:

- **The keep is the health bar.** Incidents ignore you and march on the walls;
  every one that reaches them chips the keep's integrity. You are an obstacle
  they shove past, not a target.
- **Every incident yields to exactly one tool.** A DDoS Surge only breaks
  against traffic tooling; Config Drift only against configuration tooling;
  a Blind Spot only against observability. The wrong tool bounces off with
  *no effect*. Swap with `1`–`3` mid-fight — that is the whole game.
- **Each incident fights differently.** Surges weave and arrive in packs;
  Config Drift blinks sideways; a Blind Spot is invisible until it is close or
  until it is hit; Failed Rollout shrugs off part of every blow; Node Pressure
  hits the walls twice as hard; CrashLoopBackOff gets back up once.
- **Waves grow.** More of them, tougher and quicker each wave, with an elite in
  the final one.

Outside a mission, keeps are safe ground: incidents will not follow you in, so
a chronicle card is never interrupted, and being overrun merely drives you back
to the nearest keep. **Letting a keep fall destroys the world** and hands you a
500.

## Fog of war

A lantern, not a map memory: the light travels with the party and the land
closes up behind it. Defending a keep widens it — the walls have braziers, the
road does not.

## Performance

The map is a full-screen animated canvas over a world-sized offscreen sheet, so
it adapts to the machine it lands on. `assets/js/map/device.js` picks a tier
from memory, cores, pointer type and screen size, and sets the sheet
resolution, device-pixel-ratio cap, zoom ceiling and detail level. A frame-time
governor then drops detail (clouds → grass → smoke and carts → swell) if frames
start costing more than ~26 ms, and restores it when they get cheap again.

Override the guess with `?quality=low`, `?quality=mid` or `?quality=high` —
useful for checking the other tiers by hand.

Measured on a headless Chromium with **no GPU at all** (a deliberately harsh
floor; real hardware is far better):

| | boot: longest task | boot: total blocking | frame rate |
|---|---|---|---|
| low tier | ~75 ms | ~25 ms | 60 fps |
| high tier | ~90 ms | ~70 ms | 60 fps |

Things that mattered, in the order they mattered:

- `imageSmoothingQuality = 'high'` on the sheet blit cost roughly 30 ms *per
  frame* — it is a multi-step downsample. Bilinear looks the same here and took
  every tier from ~21 fps to 60.
- Building the world was one 350 ms task that froze the page. It now yields
  between phases, so the loading state actually paints and no single task
  exceeds ~90 ms.
- The paper pass drew 60 large radial gradients and then blended the whole
  14 Mpx sheet in `multiply`. Halving the blotches and pre-multiplying the
  grain tile removed most of the remaining boot cost.
- The live layer batches each glyph family into one path stroked once, and the
  woodland has a spatial index; the rAF loop stops on `visibilitychange`.

## Stack

Pure HTML5 / CSS3 / ES modules. No build step, no dependencies, no images —
the map, the paper grain, and every glyph are drawn in canvas or inline SVG.

```
assets/
  data/portfolio.json      the single source of content
  css/style.css            document view (parchment theme)
  css/map.css              map view chrome, HUD, cards
  js/main.js               boot, view routing, doc chrome
  js/doc-view.js           renders the document from JSON
  js/map/rng.js            seeded PRNG + value/ridged noise
  js/map/worldgen.js       heightfield, coasts, rivers, roads, placement
  js/map/cartography.js    paints the static engraving to an offscreen canvas
  js/map/ambience.js       live layer: wind, swell, grass, smoke, carts, birds, clouds
  js/map/fog.js            fog of war mask and reveal
  js/map/bestiary.js       art for every incident archetype and every tool
  js/map/combat.js         incidents, skills, tool matching, waves, keep defence
  js/map/map-view.js       camera, party, input, cards, collapse sequence
```

## Local development

The page fetches its JSON and uses ES modules, so it must be served over HTTP —
opening `index.html` from the filesystem will not work.

```bash
python3 -m http.server 8080
# or
npx serve .
```

## Deployment

`.github/workflows/deploy.yml` validates every push and deploys `master` to
GitHub Pages. Set **Settings → Pages → Source** to *GitHub Actions* once.

The validation job runs on pull requests too, and checks that

- every JS module parses,
- `portfolio.json` is valid and every keep's tools cover every domain its
  incidents are weak to — a mission with a gap would be unwinnable,
- the world sheet stays under the ~16 Mpx canvas ceiling iOS Safari enforces,
- no asset path is absolute (they would break a project page served from
  `/<repo>/`), and every referenced file exists.

Every path in the site is relative, so it works at a domain root and under a
`/<repo>/` sub-path alike.
