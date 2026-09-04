#!/usr/bin/env node
/**
 * width-regression.mjs — Etapa 28
 *
 * Verifica que nenhum elemento da aplicação transborda o viewport horizontalmente.
 *
 * Ferramenta local, nao roda na CI: playwright nao e dependencia do projeto.
 *   npm i -D playwright && npx playwright install chromium
 *
 * As views exigem sessao. Sem estado autenticado toda rota cai em /auth e o
 * script reprovaria (ou passaria) medindo a tela errada — por isso ele exige
 * STORAGE_STATE, um storageState.json do playwright:
 *
 *   STORAGE_STATE=./.auth/state.json node scripts/ui-audit/width-regression.mjs
 *
 * Gerar uma vez: npx playwright open --save-storage=.auth/state.json http://localhost:8080
 *
 * Exit 0 = nenhum overflow. Exit 1 = overflow detectado.
 */

import { existsSync } from 'node:fs';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('playwright nao instalado — este script e uma ferramenta local.');
  console.error('  npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const BASE_URL = process.env.APP_URL || `http://localhost:${process.env.VITE_PORT || 8080}`;
const VIEWPORT = { width: 1280, height: 800 };

// Views to check — subset covering the layout-critical paths
const VIEWS_TO_CHECK = [
  '/#dashboard',
  '/#contacts',
  '/#queues',
  '/#agents',
  '/#settings',
  '/#reports',
  '/#integrations',
  '/#tags',
  '/#connections',
];

async function checkOverflow(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
  // Wait for lazy views to render
  await page.waitForTimeout(500);

  // Sem sessao valida a rota cai em /auth e mediriamos a tela de login.
  if (new URL(page.url()).pathname.startsWith('/auth')) {
    throw new Error('redirecionado para /auth — STORAGE_STATE expirado ou invalido');
  }

  const overflow = await page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const vpWidth = window.innerWidth;
    if (docWidth <= vpWidth) return null;

    // Find the culprit
    const all = document.querySelectorAll('*');
    const offenders = [];
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (rect.right > vpWidth + 1) {
        offenders.push({
          tag: el.tagName,
          id: el.id || '',
          classes: el.className.toString().slice(0, 80),
          right: Math.round(rect.right),
        });
        if (offenders.length >= 5) break;
      }
    }
    return { docWidth, vpWidth, offenders };
  });

  return overflow;
}

const STORAGE_STATE = process.env.STORAGE_STATE;
if (!STORAGE_STATE || !existsSync(STORAGE_STATE)) {
  console.error('STORAGE_STATE ausente ou inexistente. As views exigem sessao;');
  console.error('sem ela toda rota cai em /auth e a medicao nao vale nada.');
  console.error('  npx playwright open --save-storage=.auth/state.json ' + BASE_URL);
  console.error('  STORAGE_STATE=.auth/state.json node scripts/ui-audit/width-regression.mjs');
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const context = await browser.newContext({ viewport: VIEWPORT, storageState: STORAGE_STATE });
  const page = await context.newPage();

  let failures = 0;

  for (const path of VIEWS_TO_CHECK) {
    const url = BASE_URL + path;
    try {
      const overflow = await checkOverflow(page, url);
      if (overflow) {
        console.error(`OVERFLOW [${path}]`);
        console.error(`  doc=${overflow.docWidth}px viewport=${overflow.vpWidth}px (+${overflow.docWidth - overflow.vpWidth}px)`);
        for (const o of overflow.offenders) {
          console.error(`  <${o.tag} id="${o.id}" class="${o.classes}"> right=${o.right}px`);
        }
        console.error();
        failures++;
      } else {
        console.log(`✓ ${path}`);
      }
    } catch (err) {
      console.error(`ERROR [${path}]: ${err.message}`);
      failures++;
    }
  }

  await browser.close();

  if (failures === 0) {
    console.log(`\n✓ width-regression: 0 overflows across ${VIEWS_TO_CHECK.length} views`);
    process.exit(0);
  } else {
    console.error(`\n✗ width-regression: ${failures} view(s) with horizontal overflow`);
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
