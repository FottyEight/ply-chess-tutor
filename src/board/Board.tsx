import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Chess, type Square, type PieceSymbol, type Color } from 'chess.js';
import { sqToXY, xyToSq, NAMES } from '../chess/util';
import './board.css';

export interface Arrow { from: Square; to: Square; kind?: 'best' | 'threat' | 'info' }

export interface BoardProps {
  fen: string;
  orientation: Color;
  /** colour whose pieces may be moved; null = view only */
  movable?: Color | null;
  onMove?: (uci: string) => void;
  lastMove?: [Square, Square] | null;
  arrows?: Arrow[];
  highlights?: Square[];
  /** squares to softly mark (e.g. puzzle hint) */
  hintSquares?: Square[];
  coords?: boolean;
  label?: string;
  /** called when the user taps a square (used by the threat-spotting checklist) */
  onSquareTap?: (sq: Square) => boolean | void;
}

interface PieceItem { key: string; sq: Square; type: PieceSymbol; color: Color }
const BASE = import.meta.env.BASE_URL;
const pieceUrl = (c: Color, t: PieceSymbol) => `${BASE}pieces/${c}${t.toUpperCase()}.svg`;
let keySeq = 0;

function piecesFrom(fen: string) {
  const c = new Chess(fen);
  const out: Omit<PieceItem, 'key'>[] = [];
  for (const row of c.board()) for (const p of row) if (p) out.push({ sq: p.square, type: p.type, color: p.color });
  return out;
}

/** Re-uses keys of pieces that stayed or moved (nearest same-type piece), so moves animate as slides. */
function matchKeys(prev: PieceItem[], next: Omit<PieceItem, 'key'>[]): PieceItem[] {
  const pool = [...prev];
  const result: (PieceItem | null)[] = next.map(() => null);
  next.forEach((p, i) => {
    const j = pool.findIndex((q) => q.sq === p.sq && q.type === p.type && q.color === p.color);
    if (j >= 0) { result[i] = { ...p, key: pool[j].key }; pool.splice(j, 1); }
  });
  next.forEach((p, i) => {
    if (result[i]) return;
    let best = -1, bestD = 99;
    pool.forEach((q, j) => {
      if (q.color !== p.color || q.type !== p.type) return;
      const [ax, ay] = sqToXY(q.sq), [bx, by] = sqToXY(p.sq);
      const d = Math.hypot(ax - bx, ay - by);
      if (d < bestD) { bestD = d; best = j; }
    });
    if (best >= 0 && bestD < 8) { result[i] = { ...p, key: pool[best].key }; pool.splice(best, 1); }
    else result[i] = { ...p, key: `p${keySeq++}` };
  });
  return result as PieceItem[];
}

export function Board(props: BoardProps) {
  const { fen, orientation, movable = null, onMove, lastMove, arrows = [], highlights = [], hintSquares = [], coords = true, label, onSquareTap } = props;
  const boardRef = useRef<HTMLDivElement>(null);
  const prevPieces = useRef<PieceItem[]>([]);
  const pieces = useMemo(() => {
    const next = matchKeys(prevPieces.current, piecesFrom(fen));
    prevPieces.current = next;
    return next;
  }, [fen]);
  const chess = useMemo(() => new Chess(fen), [fen]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [cursor, setCursor] = useState<Square | null>(null);
  const drag = useRef<{ sq: Square; key: string; startX: number; startY: number; active: boolean; pointerType: string; el: HTMLElement | null } | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [hover, setHover] = useState<Square | null>(null);

  useEffect(() => { setSelected(null); setPromo(null); }, [fen]);

  const canMove = !!movable && !!onMove && chess.turn() === movable;
  const targets = useMemo(() => {
    if (!selected || !canMove) return new Map<Square, boolean>();
    const m = new Map<Square, boolean>();
    for (const mv of chess.moves({ square: selected, verbose: true })) m.set(mv.to, !!mv.captured);
    return m;
  }, [selected, chess, canMove]);

  const flip = orientation === 'b';
  const toXY = (sq: Square): [number, number] => { const [x, y] = sqToXY(sq); return flip ? [7 - x, y] : [x, 7 - y]; };
  const fromXY = (cx: number, cy: number): Square | null => flip ? xyToSq(7 - cx, cy) : xyToSq(cx, 7 - cy);

  const squareFromPoint = (clientX: number, clientY: number): Square | null => {
    const r = boardRef.current!.getBoundingClientRect();
    const cx = Math.floor(((clientX - r.left) / r.width) * 8);
    const cy = Math.floor(((clientY - r.top) / r.height) * 8);
    if (cx < 0 || cx > 7 || cy < 0 || cy > 7) return null;
    return fromXY(cx, cy);
  };

  const tryMove = useCallback((from: Square, to: Square) => {
    const legal = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (!legal.length) return false;
    if (legal.some((m) => m.promotion)) { setPromo({ from, to }); return true; }
    setSelected(null);
    onMove?.(from + to);
    return true;
  }, [chess, onMove]);

  const ownPiece = (sq: Square) => { const p = chess.get(sq); return !!p && canMove && p.color === movable; };

  const onPointerDown = (e: React.PointerEvent) => {
    if (promo) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const sq = squareFromPoint(e.clientX, e.clientY);
    if (!sq) return;
    if (onSquareTap && onSquareTap(sq)) return;
    if (selected && targets.has(sq)) { tryMove(selected, sq); return; }
    if (ownPiece(sq)) {
      setSelected(sq);
      const item = pieces.find((p) => p.sq === sq)!;
      const el = boardRef.current!.querySelector<HTMLElement>(`[data-key="${item.key}"]`);
      drag.current = { sq, key: item.key, startX: e.clientX, startY: e.clientY, active: false, pointerType: e.pointerType, el };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } else {
      setSelected(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
    if (!d.active) { d.active = true; setDragKey(d.key); }
    const r = boardRef.current!.getBoundingClientRect();
    const size = r.width / 8;
    const lift = d.pointerType === 'touch' ? size * 0.75 : 0;
    const x = e.clientX - r.left - size / 2;
    const y = e.clientY - r.top - size / 2 - lift;
    if (d.el) d.el.style.transform = `translate(${x}px, ${y}px) scale(${d.pointerType === 'touch' ? 1.25 : 1.08})`;
    setHover(squareFromPoint(e.clientX, e.clientY - lift));
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragKey(null);
    setHover(null);
    if (!d) return;
    if (d.el) d.el.style.transform = '';
    if (!d.active) return; // a tap: keep the selection
    const r = boardRef.current!.getBoundingClientRect();
    const lift = d.pointerType === 'touch' ? (r.width / 8) * 0.75 : 0;
    const to = squareFromPoint(e.clientX, e.clientY - lift);
    if (to && to !== d.sq && tryMove(d.sq, to)) return;
    if (to !== d.sq) { setSelected(null); navigator.vibrate?.([12, 40, 12]); }
  };

  // keyboard: arrows move a cursor, Enter/Space selects or moves
  const onKeyDown = (e: React.KeyboardEvent) => {
    const cur = cursor ?? (orientation === 'w' ? 'e2' : 'e7');
    const [x, y] = sqToXY(cur);
    const dir = flip ? -1 : 1;
    let next: Square | null = null;
    if (e.key === 'ArrowUp') next = xyToSq(x, y + dir);
    else if (e.key === 'ArrowDown') next = xyToSq(x, y - dir);
    else if (e.key === 'ArrowLeft') next = xyToSq(x - dir, y);
    else if (e.key === 'ArrowRight') next = xyToSq(x + dir, y);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (onSquareTap && onSquareTap(cur)) return;
      if (selected && targets.has(cur)) tryMove(selected, cur);
      else if (ownPiece(cur)) setSelected(cur);
      else setSelected(null);
      return;
    } else if (e.key === 'Escape') { setSelected(null); return; }
    if (next) { e.preventDefault(); setCursor(next); }
  };

  const checkSq = chess.inCheck() ? chess.findPiece({ type: 'k', color: chess.turn() })[0] : null;
  const hl = new Set(highlights);
  const hints = new Set(hintSquares);
  const squares: JSX.Element[] = [];
  for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) {
    const sq = fromXY(cx, cy)!;
    const [fx, fy] = sqToXY(sq);
    const light = (fx + fy) % 2 === 1;
    const cls = ['sq', light ? 'light' : 'dark'];
    if (lastMove && (lastMove[0] === sq || lastMove[1] === sq)) cls.push('last');
    if (selected === sq) cls.push('sel');
    if (checkSq === sq) cls.push('check');
    if (hl.has(sq)) cls.push('explain');
    if (hints.has(sq)) cls.push('hint');
    if (hover === sq && dragKey) cls.push('hover');
    if (cursor === sq) cls.push('cursor');
    const t = targets.get(sq);
    squares.push(
      <div key={sq} className={cls.join(' ')} data-sq={sq}>
        {coords && cy === 7 && <span className="coord file">{sq[0]}</span>}
        {coords && cx === 0 && <span className="coord rank">{sq[1]}</span>}
        {t !== undefined && <span className={t ? 'ring' : 'dot'} />}
      </div>,
    );
  }

  const describe = () => {
    const turn = chess.turn() === 'w' ? 'White' : 'Black';
    return `${label ?? 'Chess board'}. ${turn} to move.${selected ? ` Selected ${selected}.` : ''}${cursor ? ` Cursor on ${cursor}${chess.get(cursor) ? `, ${chess.get(cursor)!.color === 'w' ? 'white' : 'black'} ${NAMES[chess.get(cursor)!.type]}` : ''}.` : ''}`;
  };

  return (
    <div className="board-wrap">
      <div
        ref={boardRef}
        className={`board${canMove ? ' movable' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onFocus={() => !cursor && setCursor(orientation === 'w' ? 'e2' : 'e7')}
        tabIndex={0}
        role="application"
        aria-label={describe()}
        aria-roledescription="chess board"
        data-fen={fen}
      >
        <div className="squares">{squares}</div>
        <div className="pieces" aria-hidden="true">
          {pieces.map((p) => {
            const [x, y] = toXY(p.sq);
            return (
              <img
                key={p.key}
                data-key={p.key}
                className={`piece${dragKey === p.key ? ' dragging' : ''}`}
                src={pieceUrl(p.color, p.type)}
                alt=""
                draggable={false}
                style={dragKey === p.key ? undefined : { transform: `translate(${x * 100}%, ${y * 100}%)` }}
              />
            );
          })}
        </div>
        {arrows.length > 0 && <Arrows arrows={arrows} toXY={toXY} />}
        {promo && (
          <PromotionPicker
            color={chess.turn()}
            x={toXY(promo.to)[0]}
            top={toXY(promo.to)[1] === 0}
            onPick={(t) => { const p = promo; setPromo(null); setSelected(null); onMove?.(p.from + p.to + t); }}
            onCancel={() => setPromo(null)}
          />
        )}
      </div>
    </div>
  );
}

function Arrows({ arrows, toXY }: { arrows: Arrow[]; toXY: (s: Square) => [number, number] }) {
  return (
    <svg className="arrows" viewBox="0 0 8 8" aria-hidden="true">
      <defs>
        {(['best', 'threat', 'info'] as const).map((k) => (
          <marker key={k} id={`ah-${k}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2.6" markerHeight="2.6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className={`ah ${k}`} />
          </marker>
        ))}
      </defs>
      {arrows.map((a, i) => {
        const [x1, y1] = toXY(a.from); const [x2, y2] = toXY(a.to);
        const sx = x1 + 0.5, sy = y1 + 0.5, ex = x2 + 0.5, ey = y2 + 0.5;
        const len = Math.hypot(ex - sx, ey - sy);
        const k = (len - 0.32) / len;
        const kind = a.kind ?? 'best';
        return <line key={i} x1={sx} y1={sy} x2={sx + (ex - sx) * k} y2={sy + (ey - sy) * k} className={`arrow ${kind}`} markerEnd={`url(#ah-${kind})`} />;
      })}
    </svg>
  );
}

function PromotionPicker({ color, x, top, onPick, onCancel }: { color: Color; x: number; top: boolean; onPick: (t: PieceSymbol) => void; onCancel: () => void }) {
  const types: PieceSymbol[] = ['q', 'n', 'r', 'b'];
  return (
    <div className="promo-scrim" onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onCancel(); }}>
      <div className="promo" style={{ left: `${x * 12.5}%`, [top ? 'top' : 'bottom']: 0 }} role="dialog" aria-label="Choose promotion piece">
        {types.map((t) => (
          <button key={t} type="button" onClick={() => onPick(t)} aria-label={`Promote to ${NAMES[t]}`}>
            <img src={pieceUrl(color, t)} alt="" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );
}
