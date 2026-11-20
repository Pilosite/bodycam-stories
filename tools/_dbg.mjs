import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [,, page, fichePath, mobile] = process.argv;
const fiche = JSON.parse(readFileSync(fichePath, 'utf8'));
const b = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const p = await b.newPage({ viewport: mobile ? { width: 390, height: 780 } : { width: 640, height: 400 } });
p.on('console', m => console.log('console', m.type(), m.text().slice(0, 300)));
p.on('pageerror', e => console.log('pageerror', e.message));
p.on('crash', () => console.log('CRASH'));
const cfg = mobile ? { still: true, nohud: true, nowalk: true, v3: true, full: false, mobile: true, z: 22 } : { still: true, nohud: true, nowalk: true, v3: true, full: true, bureau: false, w: 640, h: 400, z: 22 };
await p.addInitScript(c => { window.__CFG = c; }, { ...cfg, scene: fiche });
try { await p.goto('file://' + page, { timeout: 300000 }); } catch (e) { console.log('goto', e.message.split('\n')[0]); }
for (let i = 0; i < 60; i++) { await p.waitForTimeout(2000).catch(() => {}); const s = await p.evaluate(() => window.__state && { n: window.__state.n }).catch(e => 'ERR ' + e.message.split('\n')[0]); console.log(i, JSON.stringify(s)); if (s && s.n >= 3 || String(s).startsWith('ERR')) break; }
await b.close();
