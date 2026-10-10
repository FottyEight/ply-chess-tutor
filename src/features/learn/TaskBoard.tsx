import { useEffect, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { Board, type Arrow } from '../../board/Board';
import type { Task } from '../../data/lessons';
import { uciToMove } from '../../chess/util';
import { feedback } from '../../lib/feedback';
import { useSettings } from '../../state/settings';
import { useUI } from '../../state/ui';

/** One "find the move" exercise used in lessons and the placement quiz. */
export function TaskBoard({ task, onResult, label }: { task: Task; onResult?: (firstTry: boolean) => void; label?: string }) {
  const coords = useSettings((s) => s.coords);
  const [fen, setFen] = useState(task.fen);
  const [state, setState] = useState<'ask' | 'right' | 'wrong'>('ask');
  const [tries, setTries] = useState(0);
  const [last, setLast] = useState<[Square, Square] | null>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [reported, setReported] = useState(false);
  useEffect(() => { setFen(task.fen); setState('ask'); setTries(0); setLast(null); setArrows([]); setReported(false); }, [task.fen, task.prompt]);
  const side = new Chess(task.fen).turn();

  const onMove = (uci: string) => {
    const c = new Chess(fen);
    let m;
    try { m = c.move(uciToMove(uci)); } catch { return; }
    const ok = task.accept.some((a) => a.slice(0, 4) === uci.slice(0, 4)) || c.isCheckmate();
    setFen(c.fen()); setLast([m.from, m.to]);
    if (ok) {
      setState('right'); setArrows([]); feedback(m.captured ? 'capture' : 'move');
      useUI.getState().announce('Correct');
      if (!reported) { setReported(true); onResult?.(tries === 0); }
    } else {
      setState('wrong'); setTries((n) => n + 1); feedback('error');
      useUI.getState().announce('Not quite');
      if (!reported && tries >= 1) { setReported(true); onResult?.(false); }
    }
  };
  const retry = () => {
    setFen(task.fen); setLast(null); setState('ask');
    if (tries >= 2) { const u = uciToMove(task.accept[0]); setArrows([{ from: u.from, to: u.to, kind: 'info' }]); }
  };
  return (
    <div className="taskboard">
      <div className="task-board"><Board fen={fen} orientation={side} movable={state === 'ask' ? side : null} onMove={onMove} lastMove={last} arrows={arrows} coords={coords} label={label ?? 'Exercise board'} /></div>
      <div className="task-text">
        <p className="serif task-prompt">{task.prompt}</p>
        {state === 'right' && <p className="task-ok serif" role="status">Correct. {task.explain}</p>}
        {state === 'wrong' && (
          <div className="task-no" role="status">
            <p className="serif">Not quite. {tries >= 2 ? 'The arrow will show the answer.' : `Hint: ${task.hint}`}</p>
            <button type="button" className="btn" onClick={retry}>Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}
