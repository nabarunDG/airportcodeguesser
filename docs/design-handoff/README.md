# Handoff: Gate Check — airport code guessing game

## Overview
Gate Check is a mobile-first web game for aviation nerds and bored gate-sitters: guess which airport a 3-letter IATA code belongs to, using real contextual data (local time, temperature, carriers, routes) instead of bare letters. Batches of 10 rounds, 10 pts per correct answer, optional hints that cost 2 pts. No countdown pressure; a gentle idle nudge eventually skips a round. Daily collective leaderboard aggregated by players' home airports.

## About the Design Files
The files in `design/` are **design references created in HTML** — a working prototype showing intended look and behavior, not production code to copy directly. Recreate this in the codebase's environment. This repo is currently empty, so **choose the most appropriate stack** — a static SPA (vanilla JS or React + Vite) deployable to GitHub Pages fits the stated goal of free hosting with optional ads later. The prototype's game logic (in the `<script data-dc-script>` block of the `.dc.html`) is plain JavaScript and can be ported nearly verbatim; the templating layer is proprietary and must be replaced with your framework's rendering.

`design/nocturne-styles.css` is the complete design-token stylesheet (CSS custom properties + component classes). Ship it (or port its tokens) as-is.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interactions are final. Recreate pixel-perfectly using the token sheet. All colors/fonts below reference `nocturne-styles.css` variables — never hard-code hexes.

## Data pipeline
- Source: `https://raw.githubusercontent.com/Jonty/airline-route-data/main/airline_routes.json` (single large JSON, updated weekly, CORS-open). Indexed by IATA code; each entry: `name`, `city_name`, `country`, `country_code`, `continent` (NA/EU/AS/SA/AF/OC), `latitude`, `longitude`, `elevation`, `timezone` (IANA), `routes[] {iata, km, min, carriers[] {iata, name}}`.
- Fetch once per session on first "Start boarding" (show baggage-belt loader). Consider caching in IndexedDB/Cache API (localStorage is too small). A build-time preprocessing step that trims the file to needed fields would materially improve first load.
- Eligible airports: has iata, name, city_name, ≥8 routes (commercial focus; excludes ferry terminals/private fields).
- Weather: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&current=temperature_2m` per round (free, no key). °F computed client-side. Fail silently — hide temp if unavailable.
- Local time: `Intl.DateTimeFormat('en-US', {timeZone, hour:'numeric', minute:'2-digit'})`, ticked every second.
- **Known caveat**: the dataset has no true flight-frequency numbers. Daily departures are *estimated* as the sum of carrier counts across routes (bucketed "N+", capped "300+"); route traffic for the sort-hint is the per-route carrier count (shown "×N"). Label these as estimates.

## Game rules (exact)

> **Note — partly superseded.** This section records the rules as originally
> handed off. Airport selection, round ordering, scoring maximum, and the
> Destinations clue were revised after launch to fix a geographic-variety
> problem (the `routes.length²` weighting below gave Africa 2.6% of the draw
> weight against 7.5% of the eligible pool, and locked the hub slot to the
> same dozen mega-hubs). The current rules live in `src/lib/gameLogic.ts`,
> with the changes summarized in the root `README.md` under "Airport
> selection". Everything else here is still accurate.

- Batch = 10 airports: at least 1 "major hub" (≥45 routes) + at least one airport per continent (NA, EU, AS, SA, AF, OC) when available; remaining slots weighted-random with weight = routes.length² (biases toward larger airports). No repeats within a session (reset the used-set if the pool runs low, <80 remaining).
- Scoring: correct = 10 pts minus 2 per hint used that round, floored at 2. Wrong or skipped = 0. Max 100/batch.
- 5 multiple-choice options, **airport names** (never codes): the answer + 2 nearest airports (Manhattan distance on lat/lon, excluding same city) + 1 sharing the answer's airport-name first letter + 1 sharing the city-name first letter; dedupe by iata AND name; fill randomly (≥20 routes) if short; shuffle.
- Free clues (chips the player pulls, no cost): Departures (est. bucket + destination count), Carriers (2-letter codes, shuffled once per round, cap 28 + "+N more"), Destinations (3-letter codes alphabetical, cap 36 + "+N more").
- Hints (−2 pts each, one-time per round, in the "Hint bag"): **Sort routes by traffic** (destinations re-sort desc by carrier count, showing "×N"), **Airline names** (carrier chips gain full names), **Show cities** (each choice shows "City, Country" beneath), **Reveal country** (answer's country tag appears by the code tiles).
- Timeout: no visible countdown. After 120 s idle → "Still there?" dialog ("this round will taxi away in 30 seconds"); at 150 s idle → round auto-skips to reveal as "TAXIED AWAY", 0 pts.
- After answering: 1 s pause showing colored choice states, then reveal screen.
- Fun fact on reveal, derived from data (pick randomly among applicable): longest nonstop (km + hours), most-contested route (carrier count), countries served nonstop, elevation >1,500 m. **Correction:** the source dataset's `elevation` is in **feet**, not metres (La Paz 13,313; Amsterdam −11), so this rule as written both mislabelled the unit and set the bar at 1,500 ft. The implementation now compares against ≈4,921 ft (1,500 m) and prints both units.
- Time-on-page is a marketing metric: accumulate seconds per batch into persistent storage.

## Screens / Views

### 1. Header (all screens)
Max-width 620px centered, padding 14px 20px. Left (click → home): split-flap logo — three 17×22px tiles (radius 3.5px, `--color-neutral-900` with a horizontal seam line of `--color-neutral-800` at 47–53%, 1px ring `--color-neutral-800`, ui-monospace 12.5px/600 `--color-accent-200`) cycling letters through JFK→CDG→HND→GRU→SYD→DXB every 3 s (step-end content swap + scaleY(0.15) squash flick, 70ms stagger per tile); wordmark "GATECHECK" Inter 500 15px, letter-spacing 0.16em, "CHECK" in `--color-accent`. Right, during play only: "RD n/10 | PTS n" 11.5px `--color-neutral-500`, points value in accent, tabular-nums.

### 2. Background (all screens)
Four translucent cloud SVGs (simple cumulus path) in `--color-neutral-900` / one `--color-accent-900`, opacity 0.3–0.5, blur 1.5–3px, drifting left→right on 95–150 s linear loops at top 9/38/66/84%. Fixed, pointer-events none, behind content. Toggleable (ambientMotion).

### 3. Home
Centered column, max 420px. Three "?" tiles (58×74px, `--color-surface`, radius `--radius-md`, `--shadow-sm`, mono 40px; accent / text / neutral-500 colors). H1 34px "Name that airport". Body copy 14.5px `--color-neutral-400` (see prototype for exact copy). Buttons (280px column): primary outline "Start boarding" (44px min-height), secondary "Flight Leaders". Footnote 11px `--color-neutral-600`: "10 points per correct answer · max 100 points per group".

### 4. Loading (baggage belt)
Card 420px: 84px `--color-surface` panel; bottom 26px belt of diagonal stripes (`--color-neutral-900`/`--color-neutral-800`, 70°) scrolling 0.9 s/56px; three rounded suitcases (accent-800 / neutral-700 / accent-2-900, ~40×30px with handle outline) traversing on 5 s loops, staggered. Rotating status line 13.5px pulsing (2.4 s), messages every 3 s: "Loading global route data…", "Unloading 3,000+ airports onto the belt…", "Cross-checking carrier manifests…", "Screening liquids over 100 ml…", "Almost at the carousel…". Sub-note 11px about the large one-time download. Error state: card "DELAYED / Couldn't load route data" + retry primary button.

### 5. Game round
Column, gap 18px:
- Code tiles: three 64×82px tiles, mono 46px/500, `--color-surface`, radius-md, `--shadow-md`.
- Context row 13px `--color-neutral-400`: clock icon "Local h:mm", thermometer "72°F / 22°C" (fades in via 0.4 s chip animation when fetched), country tag (`tag-accent`) if revealed.
- Free-clue pill buttons (34px min-height, 12.5px, 1px `--color-divider` border, radius 20px; label dims to neutral-500 once pulled) + caption "free clues — pull any". Each reveals its block with a 0.35 s rise-in: departures line; carrier `tag-neutral` chips (mono 10.5px); destination `tag-accent-2` chips.
- Hint bag: 1.5px `--color-divider` border, radius-lg, translucent surface; 14px zip strip of 45° accent-900 stripes; header "HINT BAG" (10px caps accent) + "3.4 oz / 100 ml max · −2 pts each"; four pill chips (accent outline, "label −2"; used state: accent-900 fill, accent-300 text, "label ✓", disabled).
- Choices: 5 full-width buttons, min-height 52px, padding 12px 16px, `--color-surface`, 1px `--color-divider`, radius-md, 15px text, hover border accent-600. After answer: correct → accent border + 14% accent tint; picked-wrong → neutral-500 border, opacity 0.75; others → opacity 0.4.
- Idle dialog: standard `.dialog` over `.dialog-backdrop`: "Still there?" / taxi copy / primary "I'm here".

### 6. Reveal
Centered column: verdict pill (filled, radius 22px, 8px 18px, Inter 500 16px, letter-spacing 0.1em, 0.4 s chip-in) — CORRECT: accent-800 bg, accent-100 text, check icon; NOT QUITE: neutral-800/neutral-200, X icon; TAXIED AWAY: neutral, no icon. Then code (mono 40px accent), airport name (26px), "City · Country" (14px neutral-400), points line ("+8 pts (1 hint used)" accent-300, or muted zero-line). Fun-fact card (`.card elev-sm`, kicker "FROM THE FLIGHT LOGS", max 380px). Cockpit dial: 180×100 SVG semicircle gauge — track `--color-divider` 6px round-cap arc, accent fill arc growing with batch score (pathLength trick, 0.9 s springy cubic-bezier(.3,1.3,.4,1)), needle line rotating −90°→+90° same easing, hub circle, 0/100 labels; caption "{score} points this group". Primary button "Next code" / "See boarding pass".

### 7. Batch summary (boarding pass)
Card 400px, radius-lg, `--shadow-md`: header band `--color-section` "GATE CHECK AIR / GROUP n" — boarding group = max(1, 10 − floor(score/10)) so 90–100 pts boards Group 1. Two-column grid: **Frequent Flyer Status** (accent-300; 10 tiers by decade of score: Standby, Middle Seat, Basic Economy, Main Cabin, Extra Legroom, Silver Wings, Gold Wings, Platinum, Diamond, Million Miler), Flight "GC-n0c", Correct n/10, Hints used, and SCORE (mono 40px accent) / 100. Dashed perforation, then a randomized barcode (~52 bars, widths 1–3px, gaps 1–4px, `--color-neutral-300` at 0.7 opacity, regenerated per batch) and footer "August 4, 2026 UTC · time on board 4m 32s" (long-form date).
Below: required field "Your home or current airport (required)" (3-char uppercase mono input) + "Post score" primary; inline error (12px accent-300) for invalid/unknown IATA codes (validated against the dataset) or incomplete batches. "New boarding group" and "Flight Leaders" buttons are **disabled until 3 letters are entered or the score is posted**.

### 8. Flight Leaders (leaderboard)
H2 "Flight Leaders", subtitle "{long date} UTC · Score points for your airport!". Table (`.table`): # / Airport / PAX / Rounds / Avg / Score. Airport left-aligned (mono code + accent "YOURS" tag on airports you contributed to); every other column center-aligned, tabular-nums; Score in accent-300. Aggregation is **collective by airport per UTC day**: Score = sum of posted batch scores, Rounds = completed sets of 10 (partial batches cannot post at all), PAX = unique players, Avg = Score/Rounds to 1 decimal. Avg and Score headers are click-sortable (active shows ▼/▲ toggling desc/asc in accent; inactive shows ⇅). Empty state line + "Back to gate" secondary button.
**Prototype stores this in localStorage; production needs a tiny backend** (e.g. Cloudflare Worker + KV, or Supabase) keyed by UTC date + airport, storing per-player-id contributions.

## State Management
Single game store: `screen` (home/loading/game/reveal/summary/leaderboard), dataset cache, used-airport set, current batch + roundIdx, per-round: choices, pulled clues {dep,car,dest}, hints {sorted,names,cities,country}, answered/answeredIdx/timedOut, weather; batch: score, correct, hintsUsed, doneRounds, barcode, batchStart; leaderboard entries + sort key/direction; anonymous player id persisted (for PAX dedupe and YOURS tag); accumulated time-on-page metric. 1 s tick drives clock, idle detection, loader messages.

## Design Tokens
All in `design/nocturne-styles.css` (Nocturne system). Key ones: bg #161826, surface #232532, text #e9e9ed, accent #9184d9 (+100–900 ramps for neutral/accent/accent-2), section band #262a60, Inter 400–700 (headings weight 500, never bolder), radius 4/8/14px, compact spacing scale, shadows as 1px edge + ambient darkness. Buttons are **outlined, never filled** (accent border on transparent); focus-visible = 2px accent outline; hit targets ≥44px; mono = ui-monospace/Menlo stack for codes. Phosphor icons (prototype inlines small stroke SVGs on currentColor).

## Assets
None external. Clouds, suitcases, dial, barcode, and icons are inline SVG/CSS. Fonts: Inter via Google Fonts (imported by the stylesheet).

## Files
- `design/Airport Code Guesser.dc.html` — full prototype: template markup (between `<x-dc>` tags) + portable game logic (the `Component` class: data filtering, batch/choice/fact generation, scoring, idle timer, leaderboard aggregation)
- `design/nocturne-styles.css` — the design-token stylesheet; link or port as-is
