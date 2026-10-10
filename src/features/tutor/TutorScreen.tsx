import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { Chess, type Square } from 'chess.js';
import { Board, type Arrow } from '../../board/Board';
import { useTutor, TIME_CONTROLS, type TutorOptions } from './tutorStore';
import { CoachCard } from './CoachCard';
import { MoveList } from './MoveList';
import { LEVELS, levelById } from '../../engine/levels';
import { useSettings } from '../../state/settings';
import { Segmented, Toggle, Icon, EvalBar, CapturedTray, fmtClock, Dialog } from '../../components/ui';
import { stopLine } from '../../components/lines';
import { uciToMove } from '../../chess/util';
import { navigate } from '../../lib/router';
import { Sheet } from '../../components/Sheet';
import { useMedia } from '../../lib/useMedia';
import './tutor.css';

export function TutorScreen() {
  const phase = useTutor((s) => s.phase);
  return phase === 'setup' ? <Setup /> : <Play />;
}

function Setup() {
  const opts = useTutor((s) => s.opts);
  const start = useTutor((s) => s.start);
  const settings = useSettings();
  const [color, setColor] = useState<TutorOptions['color']>(opts.color);
  const [level, setLevel] = useState(opts.level);
  const [tc, setTc] = useState(opts.tc ? TIME_CONTROLS.findIndex((t) => t?.label === opts.tc!.label) : 0);
  const [practice, setPractice] = useState(opts.practice);
  const lvl = levelById(level);
  return (
    <div className="page setup">
      <div className="page-head">
        <div>
          <h1>Play with a coach</h1>
          <p className="muted">After every move you get a verdict and, when it goes wrong, the reason and a better move.</p>
        </div>
      </div>
      <Segmented label="Your colour" value={color} onChange={setColor} options={[{ value: 'w', label: 'White' }, { value: 'random', label: 'Random' }, { value: 'b', label: 'Black' }]} />
      <div className="field">
        <span className="label">Opponent</span>
        <div className="rows">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" className="row" aria-pressed={level === l.id} onClick={() => setLevel(l.id)}>
              <span className={`radio${level === l.id ? ' on' : ''}`} aria-hidden="true" />
              <span className="grow"><span className="title">{l.name}</span><span className="sub">{LEVEL_NOTES[l.id]}</span></span>
              <span className="meta num">{l.elo}</span>
            </button>
          ))}
        </div>
      </div>
      <Segmented label="Time control" value={tc} onChange={setTc} options={TIME_CONTROLS.map((t, i) => ({ value: i, label: t ? t.label : 'Untimed' }))} />
      <div className="panel">
        <Toggle label="Practice mode" hint="Takebacks allowed; the game pauses after a mistake so you can try again." checked={practice} onChange={setPractice} />
        <Toggle label="Warn me before I blunder" hint="A gentle check before a bad move is played. No answers given away." checked={settings.warn} onChange={(v) => settings.set({ warn: v })} />
        <Toggle label="Blunder-check habit" hint="Before each move, name what your opponent’s last move threatens." checked={settings.checklist} onChange={(v) => settings.set({ checklist: v })} />
      </div>
      <button type="button" className="btn primary big" onClick={() => start({ color, level, tc: TIME_CONTROLS[tc], practice })}>Start game against {lvl.name}</button>
    </div>
  );
}

const LEVEL_NOTES: Record<string, string> = {
  beginner: 'Makes frequent human-style mistakes. Good for practising conversions.',
  casual: 'Plays sensibly but leaves chances. A fair game for 1000.',
  club: 'Punishes loose pieces. Expect a real fight.',
  challenge: 'A step above you. Win this and you are improving.',
};

function Play() {
  const s = useTutor();
  const settings = useSettings();
  const wide = useMedia('(min-width: 900px), (orientation: landscape) and (max-height: 600px)');
  const tablet = useMedia('(min-width: 700px)') && !wide;
  const [confirmResign, setConfirmResign] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moveInput, setMoveInput] = useState('');
  const [inputError, setInputError] = useState('');

  // clock
  useEffect(() => {
    if (!s.opts.tc || s.phase !== 'playing') return;
    let last = performance.now();
    const id = window.setInterval(() => { const now = performance.now(); s.tick(now - last); last = now; }, 200);
    return () => window.clearInterval(id);
  }, [s.opts.tc, s.phase, s.tick]);

  useEffect(() => () => stopLine(), []);

  // the bottom sheet shows whatever height is left under the board (at least 168px)
  const rootRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (wide || tablet) return;
    const fit = () => {
      const col = colRef.current, root = rootRef.current;
      if (!col || !root) return;
      const tabbar = document.querySelector('.tabbar')?.getBoundingClientRect().height ?? 60;
      const used = col.getBoundingClientRect().height;
      const left = window.innerHeight - tabbar - used;
      root.style.setProperty('--peek', `${Math.max(168, Math.floor(left))}px`);
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [wide, tablet, s.result]);

  const recs = s.records;
  const viewing = s.viewPly !== null ? recs[s.viewPly - 1] : null;
  const lastUser = [...recs].reverse().find((r) => r.by === 'user');
  const focus = viewing ?? lastUser ?? null; // the move the coach card talks about
  const live = s.viewPly === null && !s.preview;

  let fen = s.fen;
  let lastMove: [Square, Square] | null = recs.length ? [recs[recs.length - 1].from, recs[recs.length - 1].to] : null;
  let arrows: Arrow[] = [];
  let highlights: Square[] = [];
  let banner = '';
  if (viewing) { fen = viewing.fenAfter; lastMove = [viewing.from, viewing.to]; banner = `Viewing move ${Math.ceil(viewing.ply / 2)}${viewing.color === 'w' ? '.' : '…'}${viewing.san}`; }
  if (s.showBest && focus?.coach) {
    fen = focus.fenBefore;
    const b = focus.coach.explanation.bestLine?.uci[0];
    if (b) { const m = uciToMove(b); arrows = [{ from: m.from, to: m.to, kind: 'best' }]; }
    arrows.push({ from: focus.from, to: focus.to, kind: 'threat' });
    lastMove = null;
    banner = 'Before your move: green is the better move, red is what you played.';
  } else if (focus?.coach && (s.paused || viewing) && !s.preview) {
    // explanation highlights on the position after the move
    highlights = focus.coach.explanation.highlights;
    arrows = focus.coach.explanation.arrows.map(([from, to]) => ({ from, to, kind: 'threat' as const }));
  }
  if (s.preview) { fen = s.preview.fen; lastMove = s.preview.lastMove; banner = s.preview.label; arrows = []; highlights = []; }

  const movable = live && !s.showBest && s.phase === 'playing' && s.thinking === 'idle' && !s.paused && !s.pendingWarn ? s.userColor : null;
  const checklistActive = !!s.checklist && !s.checklist.answered && live;

  const opp = s.userColor === 'w' ? 'b' : 'w';
  const lvl = levelById(s.opts.level);
  const acc = (c: 'w' | 'b') => {
    const a = recs.filter((r) => r.color === c && r.accuracy !== undefined).map((r) => r.accuracy!);
    return a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  };
  const evalNow = viewing?.evalWhite ?? (s.showBest ? null : s.liveEval);

  const submitTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const c = new Chess(s.fen);
    const txt = moveInput.trim();
    if (!txt) return;
    let uci: string | null = null;
    try { const m = c.move(txt); uci = m.lan; } catch {
      try { const m = c.move(uciToMove(txt.toLowerCase())); uci = m.lan; } catch { uci = null; }
    }
    if (!uci) { setInputError(`“${txt}” isn’t a legal move here.`); return; }
    setInputError(''); setMoveInput('');
    s.userMove(uci);
  };

  const moveNo = (r: { ply: number; color: 'w' | 'b' }) => `${Math.ceil(r.ply / 2)}${r.color === 'w' ? '.' : '…'}`;
  const startNo = Number(new Chess(recs[0]?.fenBefore ?? s.fen).moveNumber());

  const coachPanel = (
    <div className="coach-panel">
      {s.pendingWarn ? (
        <div className="warn" role="alertdialog" aria-label="Check this move">
          <h3>Hold on a moment</h3>
          <p className="serif">Check what this move leaves undefended, and what your opponent could do next.</p>
          <div className="btn-row">
            <button type="button" className="btn primary" onClick={() => s.confirmWarn(false)}>Take it back</button>
            <button type="button" className="btn" onClick={() => s.confirmWarn(true)}>Play it anyway</button>
          </div>
        </div>
      ) : checklistActive ? (
        <div className="checklist">
          <h3>Before you move</h3>
          <p className="serif">What does your opponent’s last move threaten? Tap the piece it attacks.</p>
          <div className="btn-row"><button type="button" className="btn" onClick={() => s.answerChecklist('none')}>Nothing new</button></div>
        </div>
      ) : s.checklist?.answered && live && s.thinking === 'idle' && !recs[recs.length - 1]?.coach ? (
        <div className={`checklist ${s.checklist.ok ? 'ok' : 'no'}`}>
          <h3>{s.checklist.ok ? 'Well spotted' : 'Not quite'}</h3>
          <p className="serif">{s.checklist.explain}</p>
        </div>
      ) : focus ? (
        <CoachCard
          moveNo={moveNo(focus)}
          san={focus.san}
          verdict={focus.verdict}
          coach={focus.coach}
          pending={focus.by === 'user' && !focus.coach && s.thinking === 'analysing'}
          onPreview={(p) => { if (p) setSheetOpen(false); s.setPreview(p); }}
          onShowBest={() => { setSheetOpen(false); s.toggleBest(); }}
          showingBest={s.showBest}
          onTryAgain={s.opts.practice && s.phase === 'playing' && focus === lastUser && !viewing ? () => s.takeback() : undefined}
          onContinue={s.paused && !viewing ? () => s.resume() : undefined}
        />
      ) : (
        <div className="coach-card empty"><p className="serif coach-summary">{s.userColor === 'w' ? 'Your move. The coach will comment on each one.' : 'The engine is opening. Your move is next.'}</p></div>
      )}

      <div className="acc-row" aria-label="Accuracy">
        <span><b className="num">{acc(s.userColor) ?? '–'}{acc(s.userColor) !== null && '%'}</b> your accuracy</span>
        <span><b className="num">{acc(opp) ?? '–'}{acc(opp) !== null && '%'}</b> {lvl.name}</span>
      </div>

      <MoveList moves={recs.map((r) => ({ san: r.san, verdict: r.verdict, color: r.color, ply: r.ply }))} current={s.viewPly ?? recs.length} onJump={(p) => s.setView(p === recs.length ? null : p)} startNo={startNo} />

      <div className="game-ctrl">
        <button type="button" className="btn icon" aria-label="Previous move" disabled={(s.viewPly ?? recs.length) <= 1} onClick={() => s.setView(Math.max(1, (s.viewPly ?? recs.length) - 1))}><Icon.prev /></button>
        <button type="button" className="btn icon" aria-label="Next move" disabled={s.viewPly === null} onClick={() => s.setView(s.viewPly! + 1 >= recs.length ? null : s.viewPly! + 1)}><Icon.next /></button>
        {s.phase === 'playing' && s.opts.practice && <button type="button" className="btn" onClick={() => s.takeback()} disabled={!lastUser || s.thinking === 'opponent'}><Icon.undo />Takeback</button>}
        {s.phase === 'playing' && <button type="button" className="btn ghost danger" onClick={() => setConfirmResign(true)}><Icon.flag />Resign</button>}
        {s.phase === 'over' && <button type="button" className="btn primary" onClick={() => navigate(`/review/${s.savedId ?? ''}`)} disabled={!s.savedId}>Review game</button>}
        {s.phase === 'over' && <button type="button" className="btn" onClick={() => s.toSetup()}>New game</button>}
      </div>

      <form className="type-move" onSubmit={submitTyped}>
        <label htmlFor="typed" className="sr-only">Type a move</label>
        <input id="typed" className="text-input" placeholder="Type a move, e.g. Nf3" value={moveInput} onChange={(e) => setMoveInput(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={!movable} />
        <button type="submit" className="btn" disabled={!movable}>Play</button>
        {inputError && <p className="small err" role="alert">{inputError}</p>}
      </form>
    </div>
  );

  return (
    <div className={`tutor ${wide ? 'wide' : tablet ? 'stack' : 'narrow'}`} ref={rootRef}>
      <div className="play-col" ref={colRef}>
        <div className="strip opp">
          <span className="who"><span className="name">{s.opts.kind === 'endgame' ? s.opts.title : `Stockfish (${lvl.name})`}</span>
            {s.thinking === 'opponent' && <span className="thinking small"><span className="pulse" aria-hidden="true" />thinking</span>}
          </span>
          <CapturedTray fen={fen} color={opp} />
          {s.opts.tc && <span className={`clock num${s.fen.split(' ')[1] === opp ? ' run' : ''}`}>{fmtClock(s.clocks[opp])}</span>}
        </div>
        {!wide && !tablet && <EvalBar e={evalNow} orientation={s.userColor} vertical={false} />}
        <div className="board-area">
          {(wide || tablet) && <EvalBar e={evalNow} orientation={s.userColor} vertical />}
          <div className="board-box">
            <Board
              fen={fen}
              orientation={s.userColor}
              movable={checklistActive ? null : movable}
              onMove={(u) => s.userMove(u)}
              lastMove={lastMove}
              arrows={arrows}
              highlights={checklistActive ? [] : highlights}
              coords={settings.coords}
              onSquareTap={checklistActive ? (sq) => { s.answerChecklist(sq); return true; } : undefined}
              label="Game board"
            />
            {banner && (
              <button type="button" className="board-banner" onClick={() => { stopLine(); s.setPreview(null); s.toggleBest(false); s.setView(null); }}>
                {banner}<span className="small"> Tap to return</span>
              </button>
            )}
          </div>
        </div>
        <div className="strip me">
          <span className="who"><span className="name">You</span>{s.thinking === 'analysing' && <span className="thinking small"><span className="pulse" aria-hidden="true" />analysing</span>}</span>
          <CapturedTray fen={fen} color={s.userColor} />
          {s.opts.tc && <span className={`clock num${s.fen.split(' ')[1] === s.userColor ? ' run' : ''}`}>{fmtClock(s.clocks[s.userColor])}</span>}
        </div>
        {s.result && (
          <div className="result-strip" role="status">
            <strong className="serif">{resultText(s.result, s.userColor)}</strong>
            <span className="muted small">{s.result.reason}</span>
          </div>
        )}
      </div>
      {wide ? <aside className="side">{coachPanel}</aside> : tablet ? coachPanel : <Sheet open={sheetOpen} onOpenChange={setSheetOpen} label="Coach">{coachPanel}</Sheet>}

      {confirmResign && (
        <Dialog title="Resign this game?" onClose={() => setConfirmResign(false)}>
          <h3>Resign this game?</h3>
          <p className="muted">It will be saved and you can review it.</p>
          <div className="btn-row">
            <button type="button" className="btn danger" onClick={() => { setConfirmResign(false); s.resign(); }}>Resign</button>
            <button type="button" className="btn" onClick={() => setConfirmResign(false)}>Keep playing</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function resultText(r: { outcome: string; reason: string }, me: 'w' | 'b') {
  if (r.outcome === '1/2-1/2') return 'Draw';
  const won = (r.outcome === '1-0') === (me === 'w');
  return won ? 'You won' : 'You lost';
}
