import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { installMocks, REF, fakeSession } from './w5-mocks.mjs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173';
const OUT = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/auditoria-onda2-2609291646adae/w5-artefatos';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

const logs = [];
ctx.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
ctx.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
ctx.on('requestfailed', (r) => {
  if (/supabase|mapbox/.test(r.url())) logs.push(`[requestfailed] ${r.method()} ${r.url()} :: ${r.failure()?.errorText}`);
});

await installMocks(ctx, {});
try {
  await ctx.routeWebSocket('wss://**', (ws) => ws.close());
} catch (e) {
  logs.push(`[warn] routeWebSocket indisponivel: ${e.message}`);
}

await ctx.addInitScript(
  ([key, val]) => {
    try { window.localStorage.setItem(key, val); } catch { /* noop */ }
  },
  [`sb-${REF}-auth-token`, JSON.stringify(fakeSession())],
);

const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);

const info = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  bodyText: (document.body.innerText || '').slice(0, 2500),
  hasMainNav: !!document.querySelector('#main-navigation'),
  buttons: [...document.querySelectorAll('button,[role="tab"]')].map((b) => (b.textContent || '').trim()).filter(Boolean).slice(0, 60),
}));

fs.writeFileSync(`${OUT}/explore-dom.json`, JSON.stringify(info, null, 2));
fs.writeFileSync(`${OUT}/explore-console.log`, logs.join('\n'));
await page.screenshot({ path: `${OUT}/explore-01.png`, fullPage: false });

console.log('URL:', info.url);
console.log('hasMainNav:', info.hasMainNav);
console.log('--- BUTTONS ---');
console.log(info.buttons.join(' | '));
console.log('--- BODY (first 1800) ---');
console.log(info.bodyText.slice(0, 1800));
console.log('--- LOGS (last 40) ---');
console.log(logs.slice(-40).join('\n'));

await browser.close();
