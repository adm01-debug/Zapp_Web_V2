import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { prepareContext, openInbox, OUT } from './w5-app.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await prepareContext(ctx);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await openInbox(page);
await page.screenshot({ path: `${OUT}/explore3-chat.png` });

const info = await page.evaluate(() => ({
  body: document.body.innerText.slice(0, 1500),
  buttons: [...document.querySelectorAll('button,[role="button"]')]
    .map((b) => ({ t: (b.textContent || '').trim().slice(0, 40), aria: b.getAttribute('aria-label'), title: b.getAttribute('title') }))
    .filter((b) => b.t || b.aria || b.title),
}));
fs.writeFileSync(`${OUT}/explore3-dom.json`, JSON.stringify(info, null, 2));
console.log('--- BODY ---');
console.log(info.body);
console.log('--- BUTTONS ---');
console.log(info.buttons.map((b) => JSON.stringify(b)).join('\n'));
await browser.close();
