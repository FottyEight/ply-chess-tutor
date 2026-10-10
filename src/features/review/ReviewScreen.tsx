import { useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { useProgress, type SavedGame } from '../../state/progress';
import { Board, type Arrow } from '../../board/Board';
import { MoveList } from '../tutor/MoveList';
import { VerdictIcon, Icon } from '../../components/ui';
import { VERDICT_META, type Verdict } from '../../coach/config';
import { uciToMove } from '../../chess/util';
import { levelById } from '../../engine/levels';
import { useUI } from '../../state/ui';
import { TAG_NAMES } from '../tutor/CoachCard';
import './review.css';

const ORDER: Verdict[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

export default function ReviewScreen({ id }: { id?: string }) {
  const games = useProgress((s) => s.games);
  const g = games.find((x) => x.id === id) ?? games[0];
  if (!g) return <div className="page"><h2>No games yet</h2><p className="muted">Finish a game in the Tutor tab and its review appears here.</p><div><a className="btn primary" href="#/tutor">Play a game</a></div></div>;
  return <Review g={g} />;
}

function Review({ g }: { g: SavedGame }) {
  const P = useProgress();
  const toast = useUI((s) => s.toast);
  const { fens, moves } = useMemo(() => {
    const c = new Chess();
    c.loadPgn(g.pgn);
    const hist = c.history({ verbose: true });
    const start = hist[0]?.before ?? c.fen();
    return { fens: [start, ...hist.map((h) => h.after)], moves: hist };
  }, [g.pgn]);
  const [ply, setPly] = useState(moves.length);
  const opp = g.userColor === 'w' ? 'b' : 'w';
  const counts = (color: 'w' | 'b') => {
    const out: Partial<Record<Verdict, number>> = {};
    g.verdicts.forEach((v, i) => { if (v && moves[i]?.color === color) out[v] = (out[v] ?? 0) + 1; });
    return out;
  };
  const mine = counts(g.userColor), theirs = counts(opp);
  const top = [...g.mistakes].filter((m) => m.verdict !== 'inaccuracy').sort((a, b) => b.loss - a.loss).slice(0, 3);
  const top3 = top.length ? top : [...g.mistakes].sort((a, b) => b.loss - a.loss).slice(0, 3);
  const won = (g.result === '1-0') === (g.userColor === 'w') && g.result !== '1/2-1/2';
  const title = g.result === '1/2-1/2' ? 'Draw' : won ? 'You won' : 'You lost';
  const lastMove: [Square, Square] | null = ply > 0 ? [moves[ply - 1].from, moves[ply - 1].to] : null;

  const fix = (m: SavedGame['mistakes'][number]) => {
    P.addMyPuzzle({ id: `${g.id}:${m.ply}`, fen: m.fenBefore, solution: [m.best], summary: `Move ${Math.ceil(m.ply / 2)}: find the better move`, tag: m.tags[0] ?? 'middlegame', gameId: g.id });
    toast('Added to your puzzles', 'Find it under Puzzles, From your games.');
  };
  const copyPgn = async () => { try { await navigator.clipboard.writeText(g.pgn); toast('PGN copied'); } catch { toast('Copy failed', 'Use Download instead.'); } };
  const downloadPgn = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([g.pgn], { type: 'application/x-chess-pgn' }));
    a.download = `ply-${g.date.slice(0, 10)}.pgn`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="page review">
      <div className="page-head">
        <div>
          <a className="back" href="#/progress"><Icon.prev />Progress</a>
          <h1>{title}</h1>
          <p className="muted">{g.kind === 'endgame' ? 'Endgame practice' : `Against ${levelById(g.level).name}`}, by {g.reason}, {new Date(g.date).toLocaleDateString()}</p>
        </div>
      </div>

      {g.opening && <p className="serif lead-text">You played the {g.opening.name} ({g.opening.eco}){g.opening.leftAtPly ? `, and left known theory on move ${Math.ceil(g.opening.leftAtPly / 2)}` : ''}.</p>}

      <div className="acc-compare">
        <div><span className="acc-num num">{g.accuracy[g.userColor]}%</span><span className="muted small">your accuracy</span></div>
        <div><span className="acc-num num muted">{g.accuracy[opp]}%</span><span className="muted small">engine’s accuracy</span></div>
      </div>

      <table className="counts">
        <caption className="sr-only">Move classifications</caption>
        <thead><tr><th scope="col">Move type</th><th scope="col">You</th><th scope="col">Engine</th></tr></thead>
        <tbody>
          {ORDER.filter((v) => mine[v] || theirs[v]).map((v) => (
            <tr key={v} data-v={v}><th scope="row"><span className="verdict"><VerdictIcon v={v} size={20} /><span>{VERDICT_META[v].label}</span></span></th><td className="num">{mine[v] ?? 0}</td><td className="num">{theirs[v] ?? 0}</td></tr>
          ))}
        </tbody>
      </table>

      <section className="section">
        <h2 className="h-sec">{top3.length ? 'Your biggest mistakes' : 'No real mistakes this game'}</h2>
        {top3.map((m) => {
          const b = uciToMove(m.best), mv = uciToMove(m.move);
          const arrows: Arrow[] = [{ from: b.from, to: b.to, kind: 'best' }, { from: mv.from, to: mv.to, kind: 'threat' }];
          return (
            <article key={m.ply} className="mistake" data-v={m.verdict}>
              <div className="mistake-board"><Board fen={m.fenBefore} orientation={g.userColor} arrows={arrows} coords={false} label={`Position before move ${Math.ceil(m.ply / 2)}`} /></div>
              <div className="mistake-text">
                <div className="coach-hero"><span className="coach-move serif">{Math.ceil(m.ply / 2)}{m.ply % 2 ? '.' : '…'}{m.san}</span><span className="verdict"><VerdictIcon v={m.verdict} /><span>{VERDICT_META[m.verdict].label}</span></span></div>
                <p className="serif strong">{m.summary}</p>
                <p className="serif">{m.happened}</p>
                <p className="serif muted">{m.cost}</p>
                <p className="serif">{m.instead}</p>
                {m.tags.length > 0 && <p className="small muted">Pattern: {m.tags.map((t) => TAG_NAMES[t] ?? t).join(', ')}</p>}
                <div className="btn-row"><button type="button" className="btn primary" onClick={() => fix(m)} disabled={P.myPuzzles.some((x) => x.id === `${g.id}:${m.ply}`)}>{P.myPuzzles.some((x) => x.id === `${g.id}:${m.ply}`) ? 'Added to puzzles' : 'Fix this'}</button>
                  <button type="button" className="btn" onClick={() => setPly(m.ply)}>Show in game</button></div>
              </div>
            </article>
          );
        })}
        {g.mistakes.length > 0 && <button type="button" className="btn" onClick={() => { g.mistakes.forEach(fix); }}>Turn all {g.mistakes.length} into puzzles</button>}
      </section>

      <section className="section replay">
        <h2 className="h-sec">Replay</h2>
        <div className="replay-grid">
          <div className="replay-board"><Board fen={fens[ply]} orientation={g.userColor} lastMove={lastMove} label="Replay board" /></div>
          <div className="replay-side">
            <div className="game-ctrl">
              <button type="button" className="btn icon" aria-label="Start" onClick={() => setPly(0)}>«</button>
              <button type="button" className="btn icon" aria-label="Previous move" onClick={() => setPly(Math.max(0, ply - 1))}><Icon.prev /></button>
              <button type="button" className="btn icon" aria-label="Next move" onClick={() => setPly(Math.min(moves.length, ply + 1))}><Icon.next /></button>
              <button type="button" className="btn icon" aria-label="End" onClick={() => setPly(moves.length)}>»</button>
            </div>
            <MoveList moves={moves.map((m, i) => ({ san: m.san, verdict: g.verdicts[i] ?? undefined, color: m.color, ply: i + 1 }))} current={ply} onJump={setPly} startNo={Number(fens[0].split(' ')[5] ?? 1)} />
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="h-sec">PGN</h2>
        <pre className="pgn">{g.pgn}</pre>
        <div className="btn-row"><button type="button" className="btn" onClick={copyPgn}>Copy PGN</button><button type="button" className="btn" onClick={downloadPgn}>Download PGN</button></div>
      </section>
    </div>
  );
}
