import { useEffect, useRef, type ReactNode } from 'react';
import { Chess } from 'chess.js';
import { VERDICT_META, type Verdict } from '../coach/config';
import { useUI } from '../state/ui';
import { winPct } from '../coach/classify';

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Icon = {
  tutor: () => (<svg viewBox="0 0 24 24" {...P}><path d="M7 20h10M8 20l1-5c-2-1-3-3-2.5-5.5L5 8l3-3 3 1c3-1 6 1 6 5 0 2-1 3.5-2 4.5l1 4.5" /><circle cx="10.5" cy="8.5" r=".6" fill="currentColor" /></svg>),
  puzzle: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 9V5h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H4v-4a2 2 0 1 0 0-4z" /></svg>),
  learn: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 5.5C6.5 4 9.5 4 12 5.5 14.5 4 17.5 4 20 5.5v13c-2.5-1.5-5.5-1.5-8 0-2.5-1.5-5.5-1.5-8 0z" /><path d="M12 5.5v13" /></svg>),
  progress: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 19h16" /><path d="M6 15l4-4 3 3 5-6" /></svg>),
  more: () => (<svg viewBox="0 0 24 24" {...P}><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></svg>),
  chev: () => (<svg className="chev" viewBox="0 0 24 24" {...P}><path d="M9 6l6 6-6 6" /></svg>),
  undo: () => (<svg viewBox="0 0 24 24" {...P}><path d="M9 7L4 12l5 5" /><path d="M4 12h10a6 6 0 0 1 0 12h-2" transform="translate(0 -6)" /></svg>),
  flag: () => (<svg viewBox="0 0 24 24" {...P}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>),
  bulb: () => (<svg viewBox="0 0 24 24" {...P}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z" /></svg>),
  arrow: () => (<svg viewBox="0 0 24 24" {...P}><path d="M5 19L19 5M10 5h9v9" /></svg>),
  retry: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 12a8 8 0 1 0 3-6.2" /><path d="M4 4v4h4" /></svg>),
  flip: () => (<svg viewBox="0 0 24 24" {...P}><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" /></svg>),
  prev: () => (<svg viewBox="0 0 24 24" {...P}><path d="M15 6l-6 6 6 6" /></svg>),
  next: () => (<svg viewBox="0 0 24 24" {...P}><path d="M9 6l6 6-6 6" /></svg>),
  close: () => (<svg viewBox="0 0 24 24" {...P}><path d="M6 6l12 12M18 6L6 18" /></svg>),
  why: () => (<svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></svg>),
};

export function VerdictIcon({ v, size = 22 }: { v: Verdict; size?: number }) {
  const m = VERDICT_META[v];
  return <span className="v-icon" data-v={v} style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden="true">{m.symbol}</span>;
}
export function VerdictBadge({ v }: { v: Verdict }) {
  return <span className="verdict" data-v={v}><VerdictIcon v={v} /><span className="v-label">{VERDICT_META[v].label}</span></span>;
}

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span className="t-text"><span>{label}</span>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span className="label" id={`seg-${label}`}>{label}</span>
      <div className="seg" role="group" aria-labelledby={`seg-${label}`}>
        {options.map((o) => <button type="button" key={String(o.value)} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}
      </div>
    </div>
  );
}

export function Dialog({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, [href], input')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>{children}</div>
    </div>
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismiss);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div className="toast" key={t.id} onClick={() => dismiss(t.id)} role="status"><strong>{t.title}</strong>{t.body && <span>{t.body}</span>}</div>)}
    </div>
  );
}

export function Announcer() {
  const msg = useUI((s) => s.announcement);
  return <div className="sr-only" aria-live="assertive" aria-atomic="true">{msg}</div>;
}

export function evalText(e: { cp: number | null; mate: number | null } | null | undefined) {
  if (!e) return '0.0';
  if (e.mate !== null && e.mate !== undefined) return `${e.mate > 0 ? '' : '−'}M${Math.abs(e.mate)}`;
  const v = (e.cp ?? 0) / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
}
/** White's share of the bar (0..100). */
export function evalShare(e: { cp: number | null; mate: number | null } | null | undefined) {
  if (!e) return 50;
  if (e.mate !== null && e.mate !== undefined) return e.mate > 0 ? 100 : 0;
  return winPct(e.cp ?? 0);
}

export function EvalBar({ e, orientation, vertical }: { e: { cp: number | null; mate: number | null } | null | undefined; orientation: 'w' | 'b'; vertical: boolean }) {
  const share = evalShare(e);
  const mine = orientation === 'w' ? share : 100 - share;
  return (
    <div className={`evalbar ${vertical ? 'v' : 'h'} ${orientation === 'b' ? 'flip' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share)} aria-label={`Evaluation ${evalText(e)} for White`}>
      <i style={{ transform: vertical ? `scaleY(${share / 100})` : `scaleX(${share / 100})` }} />
      <span className={`ev-num ${mine >= 50 ? 'low' : 'high'}`}>{evalText(e).replace('+', '')}</span>
    </div>
  );
}

const ORDER = ['q', 'r', 'b', 'n', 'p'] as const;
const START: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
/** Pieces captured from `color` (shown next to the side that captured them) + material lead. */
export function CapturedTray({ fen, color }: { fen: string; color: 'w' | 'b' }) {
  const c = new Chess(fen);
  const count = (col: 'w' | 'b') => {
    const n: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    for (const row of c.board()) for (const p of row) if (p && p.color === col && p.type !== 'k') n[p.type]++;
    return n;
  };
  const theirs = count(color === 'w' ? 'b' : 'w');
  const mine = count(color);
  const val: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const lost: string[] = [];
  for (const t of ORDER) for (let i = theirs[t]; i < START[t]; i++) lost.push(t);
  const diff = ORDER.reduce((s, t) => s + (mine[t] - theirs[t]) * val[t], 0);
  const opp = color === 'w' ? 'b' : 'w';
  const BASE = import.meta.env.BASE_URL;
  return (
    <span className="tray" aria-label={`Captured: ${lost.length ? lost.join(', ') : 'none'}${diff > 0 ? `, up ${diff}` : ''}`}>
      {lost.map((t, i) => <img key={i} src={`${BASE}pieces/${opp}${t.toUpperCase()}.svg`} alt="" className={`cap cap-${t}`} />)}
      {diff > 0 && <span className="lead">+{diff}</span>}
    </span>
  );
}

export function fmtClock(ms: number) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
