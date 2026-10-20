import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { installMocks, REF, fakeSession } from './w5-mocks.mjs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173';
const OUT = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/auditoria-onda2-2609291646adae/w5-artefatos';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const { traffic } = await installMocks(ctx, {});
try { await ctx.routeWebSocket('wss://**', (ws) => ws.close()); } catch {}

await ctx.addInitScript(
  ([key, val]) => { try { window.localStorage.setItem(key, val); } catch {} },
  [`sb-${REF}-auth-token`, JSON.stringify(fakeSession())],
);

const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);

// Dispensa o tour de boas-vindas, se aparecer.
for (const label of ['Pular tour']) {
  const b = page.getByRole('button', { name: label });
  if (await b.count()) { await b.first().click().catch(() => {}); await page.waitForTimeout(1200); }
}

const distinct = {};
for (const t of traffic) {
  const u = new URL(t.url);
  const key = `${t.method} ${u.origin}${u.pathname}`;
  distinct[key] = (distinct[key] ?? 0) + 1;
}
const lines = Object.entries(distinct).sort().map(([k, v]) => `${v}x ${k}`);
fs.writeFileSync(`${OUT}/explore-endpoints.txt`, lines.join('\n'));
console.log(lines.join('\n'));

const st = await page.evaluate(() => ({ body: document.body.innerText.slice(0, 800) }));
console.log('--- BODY ---');
console.log(st.body);
await browser.close();
