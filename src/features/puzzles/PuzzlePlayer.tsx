import { useEffect, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { Board, type Arrow } from '../../board/Board';
import { uciToMove } from '../../chess/util';
import { THEME_INFO, primaryTheme } from '../../data/puzzles';
import { getEngine } from '../../engine/browser';
import { coachMove, quickJudge } from '../../coach/coach';
import { useSettings } from '../../state/settings';
import { feedback } from '../../lib/feedback';
import { useUI } from '../../state/ui';
import { Icon } from '../../components/ui';

export interface PuzzleSpec {
  id: string;
  fen: string;
  /** solution in UCI; when `setup` is true the first move is the opponent's move that sets the puzzle up */
  moves: string[];
  setup: boolean;
  themes: string[];
  rating?: number;
  mode?: 'solve' | 'threat';
  /** 'engine': any move within a small loss of the best is accepted (used for puzzles from your games) */
  check?: 'line' | 'engine';
  title?: string;
}
export interface PuzzleOutcome { solved: boolean; hints: number; wrong: number; firstTry: boolean }

type Phase = 'intro' | 'solve' | 'won' | 'failed';

export function PuzzlePlayer({ spec, onDone, onNext, allowHints = true, allowRetry = true, compact = false, nextLabel = 'Next puzzle' }: {
  spec: PuzzleSpec; onDone?: (o: PuzzleOutcome) => void; onNext?: () => void; allowHints?: boolean; allowRetry?: boolean; compact?: boolean; nextLabel?: string;
}) {
  const coords = useSettings((s) => s.coords);
  const [fen, setFen] = useState(spec.fen);
  const [step, setStep] = useState(spec.setup ? 1 : 0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [last, setLast] = useState<[Square, Square] | null>(null);
  const [hints, setHints] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [msg, setMsg] = useState<string>('');
  const [checking, setChecking] = useState(false);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const reported = useRef(false);
  const mode = spec.mode ?? 'solve';
  const start = new Chess(spec.fen);
  const afterSetup = spec.setup ? (() => { const c = new Chess(spec.fen); c.move(uciToMove(spec.moves[0])); return c; })() : start;
  const solver = afterSetup.turn();
  const orientation = mode === 'threat' ? (solver === 'w' ? 'b' : 'w') : solver;
  const required = mode === 'threat' ? 2 : spec.moves.length; // threat mode: only the first solver move

  useEffect(() => {
    reported.current = false;
    setFen(spec.fen); setStep(spec.setup ? 1 : 0); setHints(0); setWrong(0); setMsg(''); setArrows([]); setLast(null);
    setPhase('intro');
    if (spec.setup) {
      const t = setTimeout(() => {
        const c = new Chess(spec.fen); const m = c.move(uciToMove(spec.moves[0]));
        setFen(c.fen()); setLast([m.from, m.to]); setPhase('solve');
      }, 600);
      return () => clearTimeout(t);
    }
    setPhase('solve');
  }, [spec.id]);

  const report = (solved: boolean) => {
    if (reported.current) return;
    reported.current = true;
    onDone?.({ solved, hints, wrong, firstTry: solved && wrong === 0 && hints === 0 });
  };

  const themeLine = () => {
    const t = primaryTheme(spec.themes);
    const info = THEME_INFO[t];
    return info ? `This was ${/^[aeiou]/i.test(info.name) ? 'an' : 'a'} ${info.name.toLowerCase()}: ${info.explain}` : '';
  };

  const onMove = async (uci: string) => {
    if (phase !== 'solve' || checking) return;
    const c = new Chess(fen);
    let m;
    try { m = c.move(uciToMove(uci)); } catch { return; }
    const expected = spec.moves[step];
    let ok = uci === expected || (expected && uci.slice(0, 4) === expected.slice(0, 4) && !expected[4]);
    if (!ok && c.isCheckmate()) ok = true; // alternative mates are accepted
    if (!ok && spec.check === 'engine') {
      setChecking(true);
      try { const j = await quickJudge(getEngine(), fen, uci, null); ok = j.loss <= 3; } catch { ok = false; }
      setChecking(false);
    }
    if (ok) {
      feedback(m.captured ? 'capture' : 'move');
      setFen(c.fen()); setLast([m.from, m.to]); setArrows([]);
      const nextStep = step + 1;
      if (nextStep >= required || c.isCheckmate() || spec.check === 'engine') {
        setPhase('won'); setStep(nextStep);
        setMsg(mode === 'threat' ? `Yes. ${m.san} is the threat. ${themeLine()}` : `${c.isCheckmate() ? 'Checkmate. ' : 'Solved. '}${themeLine()}`);
        useUI.getState().announce('Correct, puzzle solved');
        report(true);
        return;
      }
      setMsg('Good. Keep going.');
      setStep(nextStep);
      setTimeout(() => {
        const r = c.move(uciToMove(spec.moves[nextStep]));
        setFen(c.fen()); setLast([r.from, r.to]); setStep(nextStep + 1);
        feedback(r.captured ? 'capture' : 'move');
      }, 380);
      return;
    }
    // wrong move
    feedback('error');
    setWrong((w) => w + 1);
    setFen(c.fen()); setLast([m.from, m.to]);
    setPhase('failed');
    setMsg(mode === 'threat' ? `${m.san} isn’t the main threat.` : `${m.san} doesn’t work.`);
    useUI.getState().announce('Not the solution');
    report(false);
    try {
      setChecking(true);
      const r = await coachMove(getEngine(), { fenBefore: fen, move: uci, history: [], opponentPrevLoss: null, isBook: false, ply: 30, budget: { depth: 10, movetime: 700 } });
      const e = r.explanation;
      const reply = e.costLine?.san[0];
      const why = r.tags.length ? e.happened : reply ? `The reply ${reply} shows the problem.` : '';
      setMsg(`${mode === 'threat' ? `${m.san} isn’t the main threat.` : `${m.san} doesn’t work.`} ${why}`.trim());
      if (e.costLine?.uci[0]) { const u = uciToMove(e.costLine.uci[0]); setArrows([{ from: u.from, to: u.to, kind: 'threat' }]); }
    } catch { /* engine busy */ } finally { setChecking(false); }
  };

  const retry = () => {
    // undo the wrong move and let the user try again (no longer counts for rating)
    const c = new Chess(spec.fen);
    let lm: [Square, Square] | null = null;
    for (let i = 0; i < step; i++) { const r = c.move(uciToMove(spec.moves[i])); lm = [r.from, r.to]; }
    setFen(c.fen()); setLast(lm); setArrows([]); setPhase('solve'); setMsg('Try again.');
  };
  const showSolution = () => {
    const c = new Chess(fen);
    // go back to the puzzle position and show the expected move as an arrow
    const base = new Chess(spec.fen);
    let lm: [Square, Square] | null = null;
    for (let i = 0; i < step; i++) { const r = base.move(uciToMove(spec.moves[i])); lm = [r.from, r.to]; }
    void c;
    const exp = spec.moves[step];
    setFen(base.fen()); setLast(lm);
    if (exp) { const u = uciToMove(exp); setArrows([{ from: u.from, to: u.to, kind: 'best' }]); const san = new Chess(base.fen()).move(u).san; setMsg(`The solution was ${san}. ${themeLine()}`); }
    setPhase('won');
    report(false);
  };
  const hint = () => {
    const exp = spec.moves[step];
    if (!exp) return;
    setHints((h) => h + 1);
    const u = uciToMove(exp);
    if (hints === 0) setMsg('Hint: look at the highlighted piece.');
    else { setArrows([{ from: u.from, to: u.to, kind: 'info' }]); setMsg('Hint: the arrow shows the move.'); }
  };

  const exp = spec.moves[step];
  const hintSquares: Square[] = hints >= 1 && exp && phase === 'solve' ? [uciToMove(exp).from] : [];
  const prompt = mode === 'threat'
    ? `${solver === 'w' ? 'White' : 'Black'} (your opponent) is to move. Show their strongest threat by making the move for them.`
    : `${solver === 'w' ? 'White' : 'Black'} to move. Find the best move.`;

  return (
    <div className={`puzzle${compact ? ' compact' : ''}`}>
      <div className="puzzle-board">
        <Board fen={fen} orientation={orientation} movable={phase === 'solve' && !checking ? (new Chess(fen).turn() === solver ? solver : null) : null} onMove={onMove} lastMove={last} arrows={arrows} hintSquares={hintSquares} coords={coords} label="Puzzle board" />
      </div>
      <div className="puzzle-side">
        {spec.title && <h3>{spec.title}</h3>}
        <p className={`puzzle-msg serif ${phase}`} role="status">{msg || (phase === 'intro' ? 'Watch the opponent’s move…' : prompt)}</p>
        {checking && <p className="thinking small"><span className="pulse" aria-hidden="true" />Checking</p>}
        <div className="btn-row">
          {phase === 'solve' && allowHints && <button type="button" className="btn" onClick={hint} disabled={hints >= 2}><Icon.bulb />{hints === 0 ? 'Hint' : 'Show the move'}</button>}
          {phase === 'failed' && allowRetry && <button type="button" className="btn primary" onClick={retry}><Icon.retry />Try again</button>}
          {phase === 'failed' && <button type="button" className="btn" onClick={showSolution}>Show solution</button>}
          {(phase === 'won' || (phase === 'failed' && !allowRetry)) && onNext && <button type="button" className="btn primary" onClick={onNext}>{nextLabel}</button>}
        </div>
        {spec.rating && phase !== 'solve' && phase !== 'intro' && <p className="small muted">Puzzle rating {spec.rating}. Themes: {spec.themes.filter((t) => THEME_INFO[t]).map((t) => THEME_INFO[t].name).join(', ')}.</p>}
      </div>
    </div>
  );
}
