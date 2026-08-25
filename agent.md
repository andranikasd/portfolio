# Portfolio Specification — Andranik Grigoryan

How this site is built and what the rules are. Read this before changing it.

---

## The one rule

**All content lives in `assets/data/portfolio.json`.** Both views render from it
at runtime. Never hard-code a job, a skill, a link, or a number into HTML, CSS,
or JS. Adding a role to the JSON adds a keep to the map, a mission to that keep,
and a timeline entry to the document, with no other edits.

---

## Two views, one page

`index.html` is a shell. `body[data-view]` is `map`, `doc`, `error`, or
`loading`, and CSS shows exactly one.

- **Map** (default on first visit) — the campaign map, an interactive canvas.
- **Document** — the ordinary readable page, for recruiters and for anyone who
  does not want to play anything.
- Routing: `#/map`, `#/doc`; any other hash (`#experience`) opens the document
  and scrolls. The last choice is stored in `localStorage` under
  `ag-portfolio-view`.

---

## Appearance

One design language across both views: aged paper, sepia ink, wax-seal red,
banner gold. Serif throughout (Georgia stack); the sans stack is reserved for
small uppercase labels and tag chips.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#efe3c8` | page ground |
| `--paper-card` | `#f5ecd8` | cards and panels |
| `--ink` | `#3a2c1a` | body text, coastlines |
| `--seal` | `#9b2c1f` | accent, section marks, primary button |
| `--gold` | `#a9741f` | secondary accent, project rules |

No terminal aesthetics. No images — the paper grain is an inline SVG turbulence
data-URI and every map glyph is drawn in canvas. No education section.

---

## The map

### Generation (`worldgen.js`)

Everything derives from `map.seed`. Change the seed, get a new continent with
the same career on it.

1. Multi-octave value noise with domain warp, times a wobbled radial falloff.
2. Sea level chosen as the percentile giving ~46% land, so every seed works.
3. Coasts and sea rings from marching squares, smoothed with Chaikin.
4. Rivers by steepest descent; roads by displaced curves nudged onto land;
   bridges wherever a road crosses a river.
5. Keeps placed oldest-to-newest along a wandering journey line, snapped to
   ground matching `castle.terrain` and spaced apart.
6. `skills[]` become provinces, their tags become the villages inside them,
   certifications become chapter houses, projects become landmarks.

### Passability

`isLand` is dry ground. `isPassable` is where anything on foot may go: sea and
the **drawn footprint of each mountain** are blocked, then roads, side tracks,
and a radius around every keep are carved back open. The block follows the
glyph on the paper, not a coarse elevation band. A generation change must keep
every keep reachable — flood-fill from one keep and check.

### Static vs live

`cartography.js` paints the engraving once to an offscreen canvas: paper, sea,
coast, contour washes, relief, marshes, roads, labels, compass rose, frame.
`ambience.js` draws the moving layer every frame: woodland leaning in a
travelling wind, sea swell, grass, chimney smoke, carts plodding the roads,
birds, and cloud shadows. Woodland is deliberately *not* baked.

Every glyph family in the live layer is batched into **one path, stroked
once**; the woodland has a 384-unit spatial index. Keep it that way — the
per-glyph `save`/`restore` version was an order of magnitude slower.

### Fog of war

A lantern, not a map memory. The light travels with the party and the ground
closes behind it, which makes this pure screen space: one radial gradient over
the viewport per frame, no mask canvas, no accumulated state. Missions widen
the reach so waves are visible as they gather.

The reach is a fraction of the smaller viewport edge, not a world distance —
that keeps it consistent at every zoom level.

### Device tiers and the frame governor

`device.js` is the single place that decides how hard to push the machine:
sheet resolution, DPR cap, zoom ceiling, detail level. `?quality=low|mid|high`
overrides it. `map-view.js` then runs a governor that lowers `ambience`'s
detail when the rolling frame time passes ~26 ms and restores it below ~13 ms.

Everything here is a hint. The map must stay *correct* at every tier — only
cheaper.

### Canvas size ceiling

The world sheet is one canvas: 4600 × 3100 world units, painted at
`device.sheetScale` (1 on desktop, 0.5 on phones). At 1:1 that is 14.3 Mpx and
iOS Safari refuses canvases above roughly 16.7 Mpx, so the world cannot grow
much further without switching to tiles. CI enforces the ceiling.

### Performance rules that are easy to undo

- **Never set `imageSmoothingQuality = 'high'` on the sheet blit.** It is a
  multi-step downsample and cost ~30 ms per frame — it alone took every tier
  from 21 fps to 60. Bilinear is indistinguishable on a hand-drawn map.
- **Building the world must stay chunked.** `generateWorld` and `paintWorld`
  both take a `breathe` callback and await it between phases; `createMapView`
  is async because of it. Collapsing that back into one synchronous call
  restores a 350 ms freeze on load.
- Full-canvas `globalCompositeOperation` passes over the sheet are expensive at
  this size; pre-multiply into the source tile instead.
- Each glyph family in the live layer is one path stroked once. Per-glyph
  `save`/`restore` was an order of magnitude slower.

---

## Missions and incidents

Two modes share `combat.js`.

**Free roam.** A light trickle of generic incidents that chase the party. Keeps
are sanctuaries — nothing hostile enters, so reading a chronicle is never
interrupted. There is a 7-second grace period on load and after every setback.
Being reduced to zero here drives the party back to the nearest keep; nothing
more.

**Mission.** Accepted from a keep's card. **The keep is what has health**, not
the party: incidents walk past you and strike the walls, and you are the only
archer. The party cannot die during a mission; colliding with an incident just
shoves you aside.

### The tool map is the mechanic

Every incident has exactly one `weakTo` domain. The wrong tool bounces off with
a visible *no effect* — not reduced damage, none. Tools are swapped mid-fight
with `1`–`3` or `Q`/`E`. **Every keep's tool set must cover every domain its
incidents need**; verify after any JSON edit:

```
python3 -c "
import json;d=json.load(open('assets/data/portfolio.json'))
for e in d['experience']:
    m=e['mission']; have={t['domain'] for t in m['tools']}
    need={d['incidents'][i]['weakTo'] for i in m['incidents']}
    print(e['id'], 'COVERED' if need<=have else 'GAP: '+str(need-have))"
```

### Incident skills

| skill | behaviour |
|---|---|
| `swarm` | spawns in pairs and weaves as it runs |
| `blink` | jumps sideways every few seconds |
| `cloak` | invisible beyond ~330 units, revealed by proximity or by being hit |
| `armour` | every blow lands for one less (minimum 1) |
| `siege` | does double damage to the walls |
| `revive` | comes back once at half health |

Art lives in `bestiary.js`, one function per `art` key, drawn around an origin
at the figure's feet. Tools have their own silhouettes there too, and the same
functions draw the HUD glyphs.

**Losing a mission destroys the world**: the engraving tears into sliding
slices, fissures burn through it, everything washes to white, and the site
serves a plain `500 Internal Server Error` page with a restart control. This
gag only lands if the error page looks genuinely unstyled — leave it plain.

### Balance

The map is a portfolio first. Anything that can kill a passive visitor who is
reading a card is a bug. Missions are tuned so that correct tool-swapping wins
and a single tool always loses. The simulation harness that proves this lives
outside the repo; the shape of it is: run each mission headlessly across
several seeds with a scripted player, and assert

- perfect play holds every keep,
- a player who only ever uses one tool holds none,
- the win rate degrades gracefully for a slower, less accurate player.

Current band: Stone Valley and Codedcloud are near-certain holds, Goya is
middling, Codeex (6 waves) is the hard one.

---

## Accessibility and fallbacks

- Full keyboard control on the map; `Esc` closes or abandons; `M` leaves.
- `prefers-reduced-motion` removes camera smoothing and document transitions.
- Touch: drag to steer, tap to travel, dedicated fire button on coarse pointers.
- `<noscript>` points at the PDF. If the JSON fails to load, a plain message
  explains that the page must be served over HTTP.
- The document view is the accessible path to every piece of content; nothing
  is reachable only by playing.

---

## Content (source of truth is the JSON)

### Experience

1. **Codedcloud** — DevOps Engineer (Contract), 2025 – Present · 10 mos
2. **Codeex** — DevOps Engineer (Full-time · On-site), 2024 – 2025 · 1 yr 6 mos
3. **Goya CJSC** — DevOps Engineer (Full-time · On-site), 2022 – 2024 · 2 yrs 9 mos
4. **Stone Valley LLC** — DevOps Engineer (Full-time · Remote), 2020 – 2022 · 2 yrs 2 mos

### Skills

Cloud & Infrastructure · Containers & Orchestration · CI/CD & GitOps ·
Observability · Networking & DNS · Languages & Scripting

### Certifications

- Certified Kubernetes Administrator (CKA) — Linux Foundation
- AWS Certified Solutions Architect — Amazon Web Services

### Links

- GitHub: https://github.com/andranikasd
- LinkedIn: https://www.linkedin.com/in/andranik-grigoryan/
- Email: theandranikgrigoryan@gmail.com
- `cv.pdf` — generated from `cv.html` via headless Chrome:
  `chromium --headless --disable-gpu --print-to-pdf="$(pwd)/cv.pdf" --no-pdf-header-footer "file://$(pwd)/cv.html"`

---

## Technical notes

- Pure HTML5 / CSS3 / ES modules. Zero build step, zero dependencies, zero
  image assets.
- ES modules and `fetch` mean the site must be served over HTTP; opening the
  file directly will not work. `python3 -m http.server 8080`.
- Deployed to GitHub Pages from the repository root.
- Favicon: inline SVG data-URI, "AG" on wax red `#9b2c1f`.
