import { useRef, useState, type ReactNode } from 'react';

/**
 * Draggable bottom sheet (phones). Collapsed it shows its first ~150px (verdict + summary + actions);
 * drag the handle up or tap it to expand. Uses transform only.
 */
export function Sheet({ open, onOpenChange, label, children }: { open: boolean; onOpenChange: (v: boolean) => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; base: number; moved: boolean } | null>(null);
  const [dy, setDy] = useState<number | null>(null);

  const collapsedOffset = () => {
    const el = ref.current;
    const h = el?.offsetHeight ?? 0;
    const peek = el ? parseFloat(getComputedStyle(el).getPropertyValue('--peek')) || SHEET_PEEK : SHEET_PEEK;
    return Math.max(0, h - peek);
  };
  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, base: open ? 0 : collapsedOffset(), moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const delta = e.clientY - d.y;
    if (Math.abs(delta) > 4) d.moved = true;
    setDy(Math.min(collapsedOffset(), Math.max(0, d.base + delta)));
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (!d.moved) { onOpenChange(!open); setDy(null); return; }
    const delta = e.clientY - d.y;
    onOpenChange(delta < -40 ? true : delta > 40 ? false : open);
    setDy(null);
  };
  const style = dy !== null ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined;
  return (
    <div className={`sheet${open ? ' open' : ''}`} ref={ref} style={style} role="region" aria-label={label}>
      <button type="button" className="sheet-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        aria-expanded={open} aria-label={open ? 'Collapse coach panel' : 'Expand coach panel'}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenChange(!open); } }}>
        <span aria-hidden="true" />
      </button>
      <div className="sheet-body">{children}</div>
    </div>
  );
}
export const SHEET_PEEK = 168;
