import { useEffect, useRef } from 'react';
import type { Verdict } from '../../coach/config';
import { VERDICT_META } from '../../coach/config';

export interface ListMove { san: string; verdict?: Verdict; color: 'w' | 'b'; ply: number }

const CRITICAL: Verdict[] = ['brilliant', 'great', 'mistake', 'blunder', 'miss'];

export function MoveList({ moves, current, onJump, startNo = 1 }: { moves: ListMove[]; current: number; onJump: (ply: number) => void; startNo?: number }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => { ref.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [current, moves.length]);
  const rows: { no: number; w?: ListMove; b?: ListMove }[] = [];
  let no = startNo;
  for (const m of moves) {
    if (m.color === 'w') rows.push({ no, w: m });
    else {
      const last = rows[rows.length - 1];
      if (last && last.no === no && last.w && !last.b) last.b = m; else rows.push({ no, b: m });
      no++;
    }
  }
  const cell = (m?: ListMove) => m ? (
    <button type="button" className={`mv${current === m.ply ? ' on' : ''}${m.verdict && CRITICAL.includes(m.verdict) ? ' crit' : ''}`} onClick={() => onJump(m.ply)} data-v={m.verdict}
      aria-label={`${m.san}${m.verdict ? `, ${VERDICT_META[m.verdict].label}` : ''}`}>
      {m.verdict && <span className="v-dot" aria-hidden="true" />}{m.san}
    </button>
  ) : <span className="mv empty" />;
  return (
    <ol className="movelist" ref={ref} aria-label="Moves">
      {rows.map((r, i) => (
        <li key={i}><span className="no num">{r.no}.</span>{cell(r.w)}{cell(r.b)}</li>
      ))}
    </ol>
  );
}
