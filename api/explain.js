// Optional Vercel Function: rewrites the coach's templated explanation in more natural language.
// Set ANTHROPIC_API_KEY in the Vercel project's Environment Variables to enable it. The key never reaches the browser.
const MODEL = process.env.EXPLAIN_MODEL || 'claude-haiku-5-5';

export function GET() {
  return Response.json({ configured: !!process.env.ANTHROPIC_API_KEY });
}

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'not configured' }, { status: 501 });
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
  const { fen, move, verdict, bestLine = [], punishLine = [], tags = [], draft = '' } = body || {};
  if (typeof fen !== 'string' || typeof move !== 'string' || fen.length > 120 || typeof draft !== 'string' || draft.length > 1500) {
    return Response.json({ error: 'bad input' }, { status: 400 });
  }
  const prompt = `You are a friendly chess coach for a 1000-rated player. Rewrite the explanation below in 2 to 4 short sentences of plain English. Say what went wrong, what it costs over the next moves, and what to play instead. Define any chess term in a few words. Do not invent moves: use only the moves given.

Position (FEN): ${fen}
Move played: ${move} (rated: ${verdict})
Opponent's best reply line: ${punishLine.join(' ')}
Better line: ${bestLine.join(' ')}
Detected patterns: ${JSON.stringify(tags).slice(0, 600)}
Draft explanation: ${draft}`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) return Response.json({ error: `upstream ${r.status}` }, { status: 502 });
    const data = await r.json();
    const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    return Response.json({ text }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ error: 'upstream failed' }, { status: 502 });
  }
}
