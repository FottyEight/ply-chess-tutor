import lighthouse from 'lighthouse';
import { launch } from './browser.mjs';
import fs from 'node:fs';
const URL = process.env.URL || 'http://localhost:4173';
const b = await launch();
const port = Number(new globalThis.URL(b.wsEndpoint()).port);
const out = {};
for (const r of ['puzzles', 'tutor', 'learn', 'tutor']) {
  const res = await lighthouse(`${URL}/#/${r}`, { port, output: 'json', logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], formFactor: 'mobile' });
  if (out[r] && out[r].performance > 0) continue;
  out[r] = Object.fromEntries(Object.entries(res.lhr.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  out[r].metrics = { FCP: res.lhr.audits['first-contentful-paint'].displayValue, LCP: res.lhr.audits['largest-contentful-paint'].displayValue, TBT: res.lhr.audits['total-blocking-time'].displayValue, CLS: res.lhr.audits['cumulative-layout-shift'].displayValue };
  const failing = Object.values(res.lhr.audits).filter((a) => a.score !== null && a.score < 0.9 && a.scoreDisplayMode === 'binary').map((a) => a.id);
  out[r].failingAudits = failing;
  console.log(r, JSON.stringify(out[r]));
}
fs.writeFileSync('reports/lighthouse.json', JSON.stringify(out, null, 1));
await b.close();
