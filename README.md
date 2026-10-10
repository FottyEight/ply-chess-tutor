# Ply: a personal chess tutor

A phone-first, installable web app for a ~1000-rated player. Play Stockfish and get every move labelled (Brilliant, Great, Best, Excellent, Good, Book, Inaccuracy, Mistake, Miss, Blunder) with a plain-language reason, what it costs over the next moves and what to play instead. Around that: adaptive puzzles, daily/themed/rush modes, challenges, a learning path, an opening trainer with spaced repetition, an endgame trainer and a progress dashboard. Everything runs in the browser; it works offline after the first visit.

Licence: **GPL-3.0-or-later** (required because it bundles Stockfish). The deployed site serves its own source at `/source/ply-source.zip`.

## Stack

| Part | Choice |
|---|---|
| Build | Vite 5 + TypeScript 5 |
| UI | React 18, zustand (state), hand-written CSS with tokens |
| Rules | chess.js **1.4.0** (pinned) |
| Engine | Stockfish 19 *lite single-threaded* WASM (`public/engine/`, 1.8 MB), in a Web Worker over UCI. No COOP/COEP headers needed. |
| Board | Custom SVG/DOM board (`src/board/Board.tsx`): tap-to-move and Pointer-Events drag, lifted piece on touch, snap-back, promotion picker, arrows, keyboard input |
| Pieces | cburnett SVG set (BSD-3-Clause / GPLv2+ / GFDL, Colin M.L. Burnett) |
| Fonts | Newsreader (display/serif) + Atkinson Hyperlegible (UI), both OFL, self-hosted |
| Storage | IndexedDB via idb-keyval behind a `StorageAdapter` interface (`src/state/storage.ts`) with export/import backup |
| PWA | vite-plugin-pwa (Workbox): app shell, engine, puzzles and openings precached |
| Hosting | Vercel (static) + optional Vercel Function for AI explanations |

Folder map:

```
src/engine      UCI parser + job queue (uci.ts), Web Worker transport (browser.ts), opponent levels
src/coach       config.ts (ALL thresholds), classify.ts, detectors.ts, writer.ts, coach.ts, ai.ts
src/board       board component
src/features    tutor, puzzles, learn, review, progress, more (settings)
src/data        puzzle/opening loaders, lessons, repertoire, endgame drills
src/state       persisted stores (progress, settings), storage adapter, achievements
scripts/        build-data.mjs (datasets), pack-source.mjs, qa/* (headless browser checks)
tests/          vitest: rules, engine, classification, detectors, content
api/            explain.js (optional AI rewrite, Vercel Function)
```

## Run, test, build

```bash
npm install
npm run dev            # http://localhost:5173
npm test               # rules, engine, classification (37 positions), detectors (26 positions), content checks
npm run build          # type-check, build to dist/, pack source zip
npm run preview        # serve dist/ at http://localhost:4173
node scripts/qa/flows.mjs     # browser flows (needs preview running)
node scripts/qa/devices.mjs   # layout sweep at 7 viewports, screenshots in reports/screens
npx vitest run --config vitest.slow.config.ts   # opponent-level round robin (~2 min)
```

## Deploy (Vercel)

`vercel.json` sets the build command (`npm run build`), output directory (`dist`) and cache headers. The optional AI function is `api/explain.js`.

**Option A: Git (recommended; redeploys on every push and includes the AI function).**
1. Push this folder to a GitHub repository.
2. vercel.com → Add New → Project → Import the repository. Vercel detects Vite; the settings in `vercel.json` apply.
3. Deploy. You get `https://<project>.vercel.app`.

**Option B: CLI from your computer, no Git needed.**
```bash
npm install
npx vercel login
npx vercel --prod        # first run asks a few questions: accept the defaults
```
This uploads the source and Vercel builds it (functions included).

**Option C: deploy the prebuilt site only.** Unzip `ply-site-dist.zip`, then inside that folder run `npx vercel --prod`. Vercel serves it as a static site. AI explanations stay off; everything else works.

**Custom domain.** Vercel → Project → Settings → Domains → Add. The app uses hash routes and absolute `/` paths, so it works at the root of any domain with no rewrites.

**Deployment protection.** If Vercel turns on Deployment Protection for the project, only you (signed in to Vercel) can open it. To use it on a phone that isn't signed in, or share it, set Settings → Deployment Protection to off for production.

## Update the puzzles

`data-src/lichess-puzzles/` holds the raw Lichess puzzle rows (CC0) and `data-src/openings/*.tsv` the Lichess openings. To rebuild:

```bash
# optional: replace data-src/lichess-puzzles/*.json with new rows: [id, fen, moves, rating, themes]
# (from https://database.lichess.org/#puzzles, converted from CSV)
npm run data            # or: node scripts/build-data.mjs --target 12000
```

The script keeps ratings 600–1600, balances the 15 target themes across 100-point bands, replays every FEN and solution with chess.js and drops any that fail, then writes `public/data/puzzles/p####.json` chunks plus `index.json`. Chunks load on demand.

## Tune the classification

All thresholds live in **`src/coach/config.ts`** (win-percentage points lost, from your point of view):

| Label | Rule |
|---|---|
| Best | engine’s top move (or equal score) |
| Excellent / Good / Inaccuracy / Mistake | loss ≤ 2 / ≤ 5 / ≤ 10 / ≤ 20 |
| Blunder | loss > 20, or ≥ 40% → < 20% (equal/better becomes clearly lost), or allows a forced mate |
| Great | loss ≤ 2, best beats 2nd-best by ≥ 15 points, you stay ≥ 35%, 2nd-best < 85%; excludes plain recaptures, grabbing hanging material and forced check evasions |
| Brilliant | loss ≤ 2; you were not already winning (material ≤ +4 and best alternative ≤ 90%, unless the sac mates faster than any alternative); the move’s line leaves you ≥ 2 points down after the reply and still ≥ 2 down after 8 plies (unless it mates); you stay ≥ 50%; not a promotion |
| Miss | you had a mate or ≥ 65% chance created by the opponent’s error (their move lost ≥ 10) or by a free capture, you lost ≥ 10, and your move itself didn’t give away material or allow mate |
| Book | position after the move is in the Lichess openings book, first 30 plies, loss ≤ 5 |

Win% uses `50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)`. Analysis: MultiPV 3, depth 16 / 0.8 s cap on desktop, depth 14 / 1.5 s on phones (`analysis` in the same file). The position before your move is analysed while you think, so after you move only one more search runs.

After changing thresholds, run `npm test` — the classification suite shows which known positions change label.

## Turn on AI-written explanations (optional)

1. Deploy with Option A or B so `api/explain.js` is deployed.
2. Vercel → Project → Settings → Environment Variables → add `ANTHROPIC_API_KEY` (Production). Optionally `EXPLAIN_MODEL`.
3. Redeploy, then in the app: More → Coaching → “AI-written explanations”.

The key never reaches the browser. The function gets the FEN, your move, the best line, the punishment line, the detector tags and the templated text, and returns a 2–4 sentence rewrite. Results are cached in IndexedDB; offline or on any error the templated explanation is shown.

## Adding cloud sync later

Implement `StorageAdapter` (`get/set/del/keys`) against Supabase (or anything) and call `setAdapter()` before the stores hydrate. All persisted state goes through it, keyed `ply:*`.
