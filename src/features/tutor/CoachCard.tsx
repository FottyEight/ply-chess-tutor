import { useState, useEffect } from 'react';
import type { CoachResult } from '../../coach/coach';
import { VERDICT_META, type Verdict } from '../../coach/config';
import { VerdictBadge, Icon } from '../../components/ui';
import { LineChips, RichText, playLine, type PreviewTarget } from '../../components/lines';
import type { LineRef } from '../../coach/writer';
import { fmtEval } from '../../coach/writer';

export interface CoachCardProps {
  moveNo: string; // e.g. "14." or "14…"
  san: string;
  verdict?: Verdict;
  coach?: CoachResult;
  pending?: boolean;
  onPreview: (p: PreviewTarget | null) => void;
  onShowBest?: () => void;
  showingBest?: boolean;
  onTryAgain?: () => void;
  onContinue?: () => void;
  compact?: boolean;
}

const BAD: Verdict[] = ['inaccuracy', 'mistake', 'blunder', 'miss'];

export function CoachCard(p: CoachCardProps) {
  const { coach, verdict } = p;
  const [open, setOpen] = useState(false);
  const [deep, setDeep] = useState(false);
  useEffect(() => { setOpen(!!verdict && ['mistake', 'blunder', 'miss'].includes(verdict)); setDeep(false); }, [p.san, p.moveNo, verdict]);

  if (p.pending || !coach || !verdict) {
    return (
      <div className="coach-card pending" aria-busy="true">
        <div className="coach-hero">
          <span className="coach-move serif">{p.moveNo}{p.san}</span>
          <span className="thinking"><span className="pulse" aria-hidden="true" />Checking your move</span>
        </div>
      </div>
    );
  }

  const e = coach.explanation;
  const meta = VERDICT_META[verdict];
  const bad = BAD.includes(verdict);
  const preview = (line: LineRef, n: number) => playLine(line, n, p.onPreview);

  return (
    <div className="coach-card" data-v={verdict}>
      <div className="coach-hero">
        <span className="coach-move serif">
          {p.moveNo}{p.san}<span className="annot" aria-hidden="true">{['brilliant', 'great', 'inaccuracy', 'mistake', 'blunder'].includes(verdict) ? meta.symbol : ''}</span>
        </span>
        <VerdictBadge v={verdict} />
      </div>
      <p className="coach-summary serif">{e.summary}</p>

      <div className="coach-actions">
        {p.onContinue && <button type="button" className="btn primary" onClick={p.onContinue}>Continue</button>}
        {p.onTryAgain && bad && <button type="button" className="btn" onClick={p.onTryAgain}><Icon.retry />Try again</button>}
        {p.onShowBest && e.bestLine && verdict !== 'best' && verdict !== 'book' && (
          <button type="button" className="btn" aria-pressed={!!p.showingBest} onClick={p.onShowBest}><Icon.arrow />{p.showingBest ? 'Hide best move' : 'Show best move'}</button>
        )}
        <button type="button" className="btn ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Less' : 'Details'}</button>
      </div>

      {open && (
        <div className="coach-detail">
          {e.ai && <p className="ai-text serif">{e.ai}</p>}
          <section>
            <h4>What happened</h4>
            <p><RichText text={e.happened} lines={[e.costLine, e.bestLine]} onPick={preview} /></p>
          </section>
          {e.cost && (
            <section>
              <h4>{bad ? 'What it costs' : 'The numbers'}</h4>
              <p><RichText text={e.cost} lines={[e.costLine, e.bestLine]} onPick={preview} /></p>
              {bad && e.costLine && verdict !== 'miss' && <LineChips line={e.costLine} onPick={(n) => preview(e.costLine!, n)} />}
            </section>
          )}
          {e.instead && (
            <section>
              <h4>{bad ? 'What to play instead' : 'Engine’s choice'}</h4>
              <p><RichText text={e.instead} lines={[e.bestLine]} onPick={preview} /></p>
              {e.bestLine && <LineChips line={e.bestLine} onPick={(n) => preview(e.bestLine!, n)} />}
            </section>
          )}
          <button type="button" className="btn ghost why" aria-expanded={deep} onClick={() => setDeep(!deep)}><Icon.why />Why?</button>
          {deep && (
            <ul className="deeper">
              {e.deeper.map((d, i) => <li key={i}><RichText text={d} lines={[e.costLine, e.bestLine]} onPick={preview} /></li>)}
              <li>Engine depth {coach.before.depth}{coach.after ? `/${coach.after.depth}` : ''}; best line evaluation {fmtEval(coach.ev.cpBest)}.</li>
              {coach.tags.length > 0 && <li>Detected: {coach.tags.map((t) => TAG_NAMES[t.id] ?? t.id).join(', ')}.</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export const TAG_NAMES: Record<string, string> = {
  hangingPiece: 'hanging piece', attackedByLesser: 'piece attacked by a cheaper piece', badTrade: 'bad trade', missedFreeCapture: 'missed free capture',
  fork: 'fork', missedFork: 'missed fork', pin: 'pin', skewer: 'skewer', discoveredAttack: 'discovered attack', backRank: 'back-rank weakness',
  mateThreat: 'mate threat', forcedMateMissed: 'missed forced mate', trappedPiece: 'trapped piece', exposedKing: 'exposed king',
  unprotectedPawnLost: 'unprotected pawn', openingDevelopment: 'slow development', earlyQueen: 'early queen move', notCastling: 'king safety (castling)',
  enPriseAfterCheck: 'piece left hanging after a check', overlookedThreat: 'overlooked threat', losesMaterial: 'loses material', positional: 'positional',
};
