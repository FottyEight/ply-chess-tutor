import { useSettings } from '../state/settings';

let ctx: AudioContext | null = null;
function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.08, delay = 0) {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch { /* audio unavailable */ }
}

/** Sound (off by default) and haptics for move, capture, check and error. */
export function feedback(kind: 'move' | 'capture' | 'check' | 'error') {
  const s = useSettings.getState();
  if (s.haptics && 'vibrate' in navigator) {
    try { navigator.vibrate(kind === 'error' ? [18, 50, 18] : kind === 'capture' ? 22 : 10); } catch { /* ignore */ }
  }
  if (!s.sound) return;
  if (kind === 'move') tone(520, 0.07, 'triangle', 0.07);
  else if (kind === 'capture') { tone(330, 0.09, 'triangle', 0.09); tone(220, 0.08, 'triangle', 0.06, 0.03); }
  else if (kind === 'check') { tone(660, 0.08, 'sine', 0.07); tone(880, 0.1, 'sine', 0.05, 0.07); }
  else tone(180, 0.18, 'sawtooth', 0.04);
}
