import { Fragment } from 'react';
import { Chess, type Square } from 'chess.js';
import type { LineRef } from '../coach/writer';
import { uciToMove } from '../chess/util';

export interface PreviewTarget { fen: string; lastMove: [Square, Square] | null; label: string }

/** Position after `n` plies of a line (n >= 1). */
export function lineStep(line: LineRef, n: number): PreviewTarget {
  const c = new Chess(line.fen);
  let last: [Square, Square] | null = null;
  for (let i = 0; i < n && i < line.uci.length; i++) {
    const m = c.move(uciToMove(line.uci[i]));
    last = [m.from, m.to];
  }
  return { fen: c.fen(), lastMove: last, label: `Previewing ${line.san.slice(0, n).join(' ')}` };
}

let timer: number | undefined;
/** Animates the board through the line up to ply `n`, one move every 420 ms. */
export function playLine(line: LineRef, n: number, show: (p: PreviewTarget) => void) {
  window.clearTimeout(timer);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { show(lineStep(line, n)); return; }
  let k = 1;
  const step = () => { show(lineStep(line, k)); if (k < n) { k++; timer = window.setTimeout(step, 420); } };
  step();
}
export function stopLine() { window.clearTimeout(timer); }

function moveLabels(line: LineRef) {
  const parts = line.fen.split(' ');
  let no = Number(parts[5] || 1);
  let white = parts[1] === 'w';
  return line.san.map((san, i) => {
    const label = white ? `${no}.${san}` : i === 0 ? `${no}…${san}` : san;
    if (!white) no++;
    white = !white;
    return label;
  });
}

export function LineChips({ line, onPick, active }: { line: LineRef; onPick: (n: number) => void; active?: number }) {
  const labels = moveLabels(line);
  return (
    <span className="chips" role="group" aria-label="Moves in this line">
      {labels.map((l, i) => (
        <button key={i} type="button" className={`chip${active === i + 1 ? ' on' : ''}`} onClick={() => onPick(i + 1)} aria-label={`Show the position after ${l}`}>{l}</button>
      ))}
    </span>
  );
}

const SAN_RE = /(\d+\.(?:\.\.|…)?)?((?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?)/g;

/** Text where move names that occur in one of the given lines become tappable chips. */
export function RichText({ text, lines, onPick }: { text: string; lines: (LineRef | null)[]; onPick: (line: LineRef, n: number) => void }) {
  const out: (string | JSX.Element)[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  SAN_RE.lastIndex = 0;
  let k = 0;
  while ((m = SAN_RE.exec(text))) {
    const san = m[2];
    let hit: { line: LineRef; n: number } | null = null;
    for (const l of lines) {
      if (!l) continue;
      const i = l.san.indexOf(san);
      if (i >= 0) { hit = { line: l, n: i + 1 }; break; }
    }
    if (!hit) continue;
    out.push(text.slice(last, m.index));
    const h = hit;
    out.push(<button key={k++} type="button" className="chip inline" onClick={() => onPick(h.line, h.n)}>{m[0]}</button>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out.map((x, i) => <Fragment key={i}>{x}</Fragment>)}</>;
}
