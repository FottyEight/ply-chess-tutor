import { spawn } from 'node:child_process';
import path from 'node:path';
import { Engine, type Transport } from '../src/engine/uci';

import fs from 'node:fs';

/** The browser engine file is reused in Node; it needs a .cjs name because package.json says "type": "module". */
function enginePath() {
  const dir = path.resolve(__dirname, 'engine-node');
  const js = path.join(dir, 'sf.cjs');
  if (!fs.existsSync(js)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, '../public/engine/stockfish-19-lite-single.js'), js);
    fs.copyFileSync(path.resolve(__dirname, '../public/engine/stockfish-19-lite-single.wasm'), path.join(dir, 'sf.wasm'));
  }
  return js;
}

export function nodeEngine(): Engine {
  const p = spawn(process.execPath, [enginePath()], { stdio: 'pipe' });
  let cb: (l: string) => void = () => {};
  let buf = '';
  p.stdout.on('data', (d) => {
    buf += d.toString();
    const parts = buf.split('\n');
    buf = parts.pop()!;
    for (const l of parts) if (l.trim()) cb(l.trim());
  });
  const t: Transport = { post: (c) => p.stdin.write(c + '\n'), onLine: (f) => (cb = f), terminate: () => p.kill() };
  return new Engine(t);
}
