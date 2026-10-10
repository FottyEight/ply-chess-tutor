import { get, set } from 'idb-keyval';
import type { CoachResult } from './coach';

/**
 * Optional: asks the serverless function (api/explain.js, a Vercel Function) to rewrite the templated
 * explanation in more natural language. The API key stays on the server. Returns null when
 * offline, unconfigured or on any error, so the templated text is always the fallback.
 */
export async function rewriteExplanation(fen: string, san: string, coach: CoachResult): Promise<string | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
  const key = `ply:ai:${fen}:${san}`;
  try { const c = await get(key); if (typeof c === 'string') return c; } catch { /* no cache */ }
  const e = coach.explanation;
  try {
    const res = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fen, move: san, verdict: coach.verdict, bestLine: e.bestLine?.san ?? [], punishLine: e.costLine?.san ?? [], tags: coach.tags.map((t) => ({ id: t.id, facts: t.facts })), draft: [e.happened, e.cost, e.instead].join(' ') }),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) return null;
    try { await set(key, text); } catch { /* ignore */ }
    return text;
  } catch { return null; }
}

export async function aiAvailable(): Promise<boolean> {
  try { const r = await fetch('/api/explain', { method: 'GET', signal: AbortSignal.timeout(4000) }); return r.ok && (await r.json()).configured === true; } catch { return false; }
}
