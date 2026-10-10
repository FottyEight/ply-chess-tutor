// Builds the static puzzle and opening datasets in public/data from data-src/.
// Usage: node scripts/build-data.mjs [--target 10000]
// Sources (both CC0): Lichess puzzle database, lichess-org/chess-openings.
import fs from 'node:fs';
import path from 'node:path';
import { Chess } from 'chess.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC_P = path.join(ROOT, 'data-src/lichess-puzzles');
const SRC_O = path.join(ROOT, 'data-src/openings');
const OUT = path.join(ROOT, 'public/data');
const args = process.argv.slice(2);
const TARGET = Number(args[args.indexOf('--target') + 1]) || 10000;

export const THEMES = [
  'mateIn1', 'mateIn2', 'fork', 'pin', 'skewer', 'discoveredAttack', 'backRankMate',
  'hangingPiece', 'trappedPiece', 'deflection', 'attraction', 'advancedPawn',
  'endgame', 'opening', 'middlegame',
];
const MIN = 600, MAX = 1600;

// Deterministic PRNG so rebuilds are reproducible.
let seed = 20261010;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

function validate(fen, moves) {
  try {
    const c = new Chess(fen);
    for (const uci of moves.split(' ')) {
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!m) return false;
    }
    return true;
  } catch { return false; }
}

// ---------- puzzles ----------
const all = [];
for (const f of fs.readdirSync(SRC_P)) {
  if (!f.endsWith('.json')) continue;
  for (const row of JSON.parse(fs.readFileSync(path.join(SRC_P, f), 'utf8'))) {
    const [id, fen, moves, rating, themes] = row;
    if (rating < MIN || rating > MAX) continue;
    all.push({ id, fen, moves, rating, themes: themes.split(' ') });
  }
}
// shuffle
for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
console.log(`candidates in ${MIN}-${MAX}: ${all.length}`);

const bands = []; for (let r = MIN; r < MAX; r += 100) bands.push(r);
const bandOf = (r) => Math.min(MAX - 100, Math.floor(r / 100) * 100);
const perThemeBand = Math.ceil(TARGET / THEMES.length / bands.length);
const chosen = new Map();
let rejected = 0;
const counts = Object.fromEntries(THEMES.map((t) => [t, 0]));

// Pass 1: fill each (theme, band) cell up to quota, counting overlap so rare themes get priority.
const order = [...THEMES].sort((a, b) => all.filter((p) => p.themes.includes(a)).length - all.filter((p) => p.themes.includes(b)).length);
for (const theme of order) {
  for (const band of bands) {
    let have = [...chosen.values()].filter((p) => bandOf(p.rating) === band && p.themes.includes(theme)).length;
    for (const p of all) {
      if (have >= perThemeBand) break;
      if (chosen.has(p.id) || bandOf(p.rating) !== band || !p.themes.includes(theme)) continue;
      if (!validate(p.fen, p.moves)) { rejected++; continue; }
      chosen.set(p.id, p); have++;
    }
  }
}
// Pass 2: top up to TARGET with any validated puzzles that carry at least one target theme.
for (const p of all) {
  if (chosen.size >= TARGET) break;
  if (chosen.has(p.id) || !p.themes.some((t) => THEMES.includes(t))) continue;
  if (!validate(p.fen, p.moves)) { rejected++; continue; }
  chosen.set(p.id, p);
}
for (const p of chosen.values()) for (const t of p.themes) if (t in counts) counts[t]++;

fs.rmSync(path.join(OUT, 'puzzles'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'puzzles'), { recursive: true });
const index = { source: 'Lichess puzzle database (CC0) https://database.lichess.org/#puzzles', note: 'Source mirror pre-filtered to popularity >= 80, plays >= 200, rating deviation <= 90; per-puzzle popularity not available.', builtAt: new Date().toISOString(), total: chosen.size, rejectedInvalid: rejected, themes: counts, bands: [] };
for (const band of bands) {
  const rows = [...chosen.values()].filter((p) => bandOf(p.rating) === band).sort((a, b) => a.rating - b.rating)
    .map((p) => [p.id, p.fen, p.moves, p.rating, p.themes.join(' ')]);
  const file = `p${String(band).padStart(4, '0')}.json`;
  fs.writeFileSync(path.join(OUT, 'puzzles', file), JSON.stringify(rows));
  index.bands.push({ min: band, max: band + 99, file, count: rows.length });
}
fs.writeFileSync(path.join(OUT, 'puzzles', 'index.json'), JSON.stringify(index, null, 1));
console.log(`selected ${chosen.size}, rejected invalid ${rejected}`);
console.log(counts);

// ---------- openings ----------
// Map position key (FEN without move counters) -> [eco, name, ply]. Keeps the deepest/most specific name per position.
const book = {};
let lines = 0;
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const rows = fs.readFileSync(path.join(SRC_O, `${f}.tsv`), 'utf8').trim().split('\n').slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const c = new Chess();
    try { c.loadPgn(pgn); } catch { continue; }
    lines++;
    const replay = new Chess();
    const hist = c.history();
    hist.forEach((san, i) => {
      replay.move(san);
      const key = replay.fen().split(' ').slice(0, 4).join(' ');
      const isFinal = i === hist.length - 1;
      if (!book[key]) book[key] = isFinal ? [eco, name] : 0; // 0 = in book, unnamed transit
      else if (isFinal && book[key] === 0) book[key] = [eco, name];
    });
  }
}
fs.writeFileSync(path.join(OUT, 'openings.json'), JSON.stringify(book));
console.log(`openings: ${lines} lines, ${Object.keys(book).length} book positions`);
