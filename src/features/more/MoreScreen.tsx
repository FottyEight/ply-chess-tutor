import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../../state/settings';
import { exportBackup, importBackup } from '../../state/storage';
import { Segmented, Toggle } from '../../components/ui';
import { useUI } from '../../state/ui';
import { aiAvailable } from '../../coach/ai';
import { getEngine, isPhoneClass } from '../../engine/browser';
import { analyseBefore, defaultBudget } from '../../coach/coach';

const BENCH = [
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
  'r2q1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 9',
  '8/5pk1/6p1/3R4/1r5P/6P1/5PK1/8 w - - 0 40',
];

const LICENCES = [
  ['Stockfish 19 (lite, single-threaded WebAssembly build by Nathan Rugg)', 'GPL-3.0', 'https://github.com/nmrugg/stockfish.js'],
  ['chess.js 1.4.0', 'BSD-2-Clause', 'https://github.com/jhlywa/chess.js'],
  ['React 18 and React DOM', 'MIT', 'https://react.dev'],
  ['zustand', 'MIT', 'https://github.com/pmndrs/zustand'],
  ['idb-keyval', 'Apache-2.0', 'https://github.com/jakearchibald/idb-keyval'],
  ['Chess pieces “cburnett” by Colin M.L. Burnett', 'BSD-3-Clause (also GPLv2+, GFDL)', 'https://commons.wikimedia.org/wiki/Category:SVG_chess_pieces'],
  ['Newsreader typeface (Production Type)', 'SIL Open Font License 1.1', 'https://fonts.google.com/specimen/Newsreader'],
  ['Atkinson Hyperlegible typeface (Braille Institute)', 'SIL Open Font License 1.1', 'https://brailleinstitute.org/freefont'],
  ['Lichess puzzle database', 'CC0', 'https://database.lichess.org/#puzzles'],
  ['Lichess chess-openings dataset', 'CC0', 'https://github.com/lichess-org/chess-openings'],
  ['Vite, vite-plugin-pwa, Workbox', 'MIT', 'https://vitejs.dev'],
];

export default function MoreScreen() {
  const s = useSettings();
  const toast = useUI((x) => x.toast);
  const file = useRef<HTMLInputElement>(null);
  const [ai, setAi] = useState<boolean | null>(null);
  const [engineName, setEngineName] = useState('');
  const [bench, setBench] = useState<string | null>(null);
  const runBench = async () => {
    setBench('Running…');
    const phone = isPhoneClass();
    const b = defaultBudget(phone);
    const rows: string[] = [];
    let longest = 0;
    let last = performance.now();
    const probe = setInterval(() => { const now = performance.now(); longest = Math.max(longest, now - last - 50); last = now; }, 50);
    for (const f of BENCH) { const a = await analyseBefore(getEngine(), f, b); rows.push(`depth ${a.depth} in ${a.timeMs} ms`); }
    clearInterval(probe);
    const text = `${phone ? 'Phone' : 'Desktop'} budget (depth ${b.depth}, cap ${b.movetime} ms, 3 lines): ${rows.join('; ')}. Longest main-thread stall: ${Math.round(longest)} ms.`;
    setBench(text);
    (window as any).__plyBench = text;
  };
  useEffect(() => { aiAvailable().then(setAi); const e = getEngine(); e.whenReady().then(() => setEngineName(e.name)); }, []);
  const doExport = async () => {
    const json = await exportBackup();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `ply-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup saved', 'Keep the file somewhere safe.');
  };
  const doImport = async (f: File) => {
    try { await importBackup(await f.text()); toast('Backup restored', 'Reloading…'); setTimeout(() => location.reload(), 800); }
    catch (e) { toast('Could not restore', (e as Error).message); }
  };
  return (
    <div className="page">
      <div className="page-head"><div><h1>Settings</h1></div></div>
      <section className="section">
        <h2 className="h-sec">Look</h2>
        <Segmented label="Theme" value={s.theme} onChange={(v) => s.set({ theme: v })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        <Segmented label="Board" value={s.board} onChange={(v) => s.set({ board: v })} options={[{ value: 'slate', label: 'Slate' }, { value: 'walnut', label: 'Walnut' }, { value: 'moss', label: 'Moss' }]} />
        <Toggle label="Coordinates on the board" checked={s.coords} onChange={(v) => s.set({ coords: v })} />
      </section>
      <section className="section">
        <h2 className="h-sec">Coaching</h2>
        <Toggle label="Warn me before I blunder" hint="Asks you to double-check before a mistake is played." checked={s.warn} onChange={(v) => s.set({ warn: v })} />
        <Toggle label="Blunder-check habit" hint="Name your opponent’s threat before each move." checked={s.checklist} onChange={(v) => s.set({ checklist: v })} />
        <Toggle label="AI-written explanations" hint={ai === null ? 'Checking…' : ai ? 'Rewrites mistake explanations more naturally. Falls back to the built-in text offline.' : 'Not set up on this site. See the README to add an API key on the server.'} checked={s.aiExplain && !!ai} onChange={(v) => s.set({ aiExplain: v })} />
      </section>
      <section className="section">
        <h2 className="h-sec">Sound and touch</h2>
        <Toggle label="Sound effects" hint="Move, capture, check and error sounds." checked={s.sound} onChange={(v) => s.set({ sound: v })} />
        <Toggle label="Vibration" hint="On phones that support it." checked={s.haptics} onChange={(v) => s.set({ haptics: v })} />
      </section>
      <section className="section">
        <h2 className="h-sec">Your data</h2>
        <p className="muted small">Everything is stored on this device. Back it up to move to another device.</p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={doExport}>Export backup</button>
          <button type="button" className="btn" onClick={() => file.current?.click()}>Import backup</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
        </div>
      </section>
      <section className="section">
        <h2 className="h-sec">Engine</h2>
        <p className="muted small">{engineName || 'Stockfish'} runs on this device in a background thread.</p>
        <div className="btn-row"><button type="button" className="btn" onClick={runBench} id="bench">Test engine speed</button></div>
        {bench && <p className="small" id="bench-out" role="status">{bench}</p>}
      </section>
      <section className="section about">
        <h2 className="h-sec">About</h2>
        <p className="serif">Ply is a personal chess tutor. Analysis runs on your device with {engineName || 'Stockfish'}; nothing is sent to a server unless you turn on AI-written explanations.</p>
        <p className="small">Source code: <a href="/source/ply-source.zip">download the full source (GPL-3.0)</a>. Ply includes Stockfish, which is licensed under the GPL-3.0, so the whole app is published under the same licence.</p>
        <details>
          <summary>Open-source licences</summary>
          <ul className="licences">{LICENCES.map(([n, l, u]) => <li key={n}><a href={u} target="_blank" rel="noreferrer">{n}</a>: {l}</li>)}</ul>
        </details>
      </section>
    </div>
  );
}
