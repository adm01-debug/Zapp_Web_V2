#!/usr/bin/env node
/**
 * width-regression.mjs — Etapa 28
 *
 * Verifica, em cada view, que (a) nada transborda o viewport horizontalmente e
 * (b) o conteúdo OCUPA o `main` — `main.clientWidth - content.clientWidth > 1`
 * reprova (faixa morta). Mede a 1280x800 e a 1920x1080.
 *
 * POR QUE (LT-LAYOUT-03): a versão anterior só comparava document.scrollWidth
 * com innerWidth a 1280x800. Uma view com conteúdo mais estreito que o main
 * passava sem preencher, porque não havia overflow. O predicado corrigido vive
 * em ./width-check.mjs e é provado por scripts/ci/width-regression.unit.mjs.
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
 * Exit 0 = nenhum overflow e nenhuma faixa morta. Exit 1 = problema detectado.
 *
 * O módulo não executa nada ao ser importado (o teste unitário importa as
 * constantes/protótipo reais daqui); `main()` só roda quando o arquivo é executado.
 */

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { avaliarLargura } from './width-check.mjs';

export const BASE_URL = process.env.APP_URL || `http://localhost:${process.env.VITE_PORT || 8080}`;

// 1280x800 mantem a cobertura antiga; 1920x1080 e o viewport pedido pelo
// aceite da etapa 28 para comparar conteudo e main.
export const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
];

// Views to check — subset covering the layout-critical paths
export const VIEWS_TO_CHECK = [
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

/**
 * Mede uma view: overflow do documento e ocupacao do main pelo conteudo.
 * A decisao fica no predicado puro `avaliarLargura`.
 */
export async function medirLargura(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
  // Wait for lazy views to render
  await page.waitForTimeout(500);

  // Sem sessao valida a rota cai em /auth e mediriamos a tela de login.
  if (new URL(page.url()).pathname.startsWith('/auth')) {
    throw new Error('redirecionado para /auth — STORAGE_STATE expirado ou invalido');
  }

  const medicao = await page.evaluate(() => {
    const innerWidth = window.innerWidth;
    const docScrollWidth = document.documentElement.scrollWidth;

    const main = document.querySelector('main, [role="main"]');
    let mainWidth = null;
    let contentWidth = null;
    if (main) {
      mainWidth = main.clientWidth;
      // Conteudo = a faixa que deve preencher o main: o filho direto mais largo
      // que participa do fluxo (overlays fixos/absolutos nao contam).
      const filhos = Array.from(main.children).filter((el) => {
        const cs = getComputedStyle(el);
        return cs.position !== 'fixed' && cs.position !== 'absolute' && el.clientWidth > 0;
      });
      if (filhos.length) contentWidth = Math.max(...filhos.map((el) => el.clientWidth));
    }

    // Culpados do overflow (so quando ha overflow)
    let offenders = [];
    if (docScrollWidth > innerWidth) {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const rect = el.getBoundingClientRect();
        if (rect.right > innerWidth + 1) {
          offenders.push({
            tag: el.tagName,
            id: el.id || '',
            classes: el.className.toString().slice(0, 80),
            right: Math.round(rect.right),
          });
          if (offenders.length >= 5) break;
        }
      }
    }

    return { innerWidth, docScrollWidth, mainWidth, contentWidth, offenders };
  });

  return { ...medicao, resultado: avaliarLargura(medicao) };
}

export async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('playwright nao instalado — este script e uma ferramenta local.');
    console.error('  npm i -D playwright && npx playwright install chromium');
    process.exit(1);
  }

  const STORAGE_STATE = process.env.STORAGE_STATE;
  if (!STORAGE_STATE || !existsSync(STORAGE_STATE)) {
    console.error('STORAGE_STATE ausente ou inexistente. As views exigem sessao;');
    console.error('sem ela toda rota cai em /auth e a medicao nao vale nada.');
    console.error('  npx playwright open --save-storage=.auth/state.json ' + BASE_URL);
    console.error('  STORAGE_STATE=.auth/state.json node scripts/ui-audit/width-regression.mjs');
    process.exit(1);
  }

  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });

  let failures = 0;
  let medidas = 0;

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport, storageState: STORAGE_STATE });
    const page = await context.newPage();
    const label = `${viewport.width}x${viewport.height}`;

    for (const path of VIEWS_TO_CHECK) {
      const url = BASE_URL + path;
      try {
        const { innerWidth, docScrollWidth, mainWidth, contentWidth, offenders, resultado } =
          await medirLargura(page, url);
        medidas++;

        if (resultado.overflow) {
          console.error(`OVERFLOW [${label}] ${path}`);
          console.error(`  doc=${docScrollWidth}px viewport=${innerWidth}px (+${docScrollWidth - innerWidth}px)`);
          for (const o of offenders) {
            console.error(`  <${o.tag} id="${o.id}" class="${o.classes}"> right=${o.right}px`);
          }
          console.error();
          failures++;
        }

        if (resultado.faixaMorta) {
          console.error(`FAIXA MORTA [${label}] ${path}`);
          console.error(
            `  main=${mainWidth}px content=${contentWidth}px (sobra ${resultado.diferenca}px; tolerancia 1px)`
          );
          console.error();
          failures++;
        }

        if (!resultado.overflow && !resultado.faixaMorta) {
          console.log(`✓ [${label}] ${path}`);
        }
      } catch (err) {
        console.error(`ERROR [${label}] ${path}: ${err.message}`);
        failures++;
      }
    }

    await context.close();
  }

  await browser.close();

  if (failures === 0) {
    console.log(`\n✓ width-regression: 0 overflows / 0 faixas mortas em ${medidas} medicoes`);
    process.exit(0);
  } else {
    console.error(`\n✗ width-regression: ${failures} medicao(oes) reprovada(s)`);
    process.exit(1);
  }
}

// Só executa quando o arquivo é o entrypoint (importável pelo teste sem efeitos).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(err); process.exit(1); });
}
