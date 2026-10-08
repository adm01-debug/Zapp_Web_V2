#!/usr/bin/env node
/**
 * T84 / E.5 — `axe.mjs`: acessibilidade da tela de Telefonia em dois estados —
 * ociosa e com o painel de detalhe ativo (uma ligação selecionada).
 *
 * Aceite: 0 violações `serious`/`critical` (o mesmo corte do
 * `e2e/a11y-contraste.spec.ts`, via `lib/especificacao.mjs → IMPACTOS_BLOQUEANTES`).
 * O axe vem da dependência que o repositório já tem (`axe-core`), rodando no
 * Chromium headless — nenhuma instalação nova.
 *
 * Uso:
 *   TEL_URL=http://127.0.0.1:5173 TEL_EMAIL=... TEL_SENHA=... node qa/tel/axe.mjs
 *   TEL_URL=file:///.../fixture.html node qa/tel/axe.mjs
 */
import { createRequire } from 'node:module';
import { abrirModulo, abrirNavegador, entrar, hostDe, medirAxe, vigiarConsole } from './lib/coleta.mjs';
import { avaliarAxe } from './lib/especificacao.mjs';
import { ambiente, publicar } from './lib/ambiente.mjs';
import { medir, resumo } from './lib/regras.mjs';

const require = createRequire(import.meta.url);
const CAMINHO_AXE = require.resolve('axe-core/axe.min.js');

const env = ambiente();
const { browser, page } = await abrirNavegador({ largura: env.largura, altura: env.altura });
const consoleErros = vigiarConsole(page);
const checks = [];

try {
  const { login } = await entrar(page, env);
  consoleErros.zerar();
  await abrirModulo(page, env);

  const ociosa = avaliarAxe(await medirAxe(page, CAMINHO_AXE));
  checks.push(medir('axe/tela-ociosa', ociosa.bloqueantes.length, 0, 0, { violacoes: ociosa.bloqueantes }));

  // Painel ativo (T84 pede os dois estados): só existe se houver ligação no
  // histórico. Sem linha, o eixo é declarado não aplicável — nunca um verde mudo.
  const linhas = await page.locator('[data-testid="tel-row"]').count();
  if (linhas > 0) {
    await page.locator('[data-testid="tel-row"]').first().click();
    await page.locator('[data-testid="tel-selected-panel"]').first().waitFor({ state: 'visible', timeout: 15_000 });
    const ativa = avaliarAxe(await medirAxe(page, CAMINHO_AXE));
    checks.push(medir('axe/painel-ativo', ativa.bloqueantes.length, 0, 0, { violacoes: ativa.bloqueantes }));
  } else {
    checks.push(medir('axe/painel-ativo', null, 0, 0, { skip: true, motivo: 'histórico vazio: nenhuma ligação para selecionar' }));
  }

  publicar({ ...resumo('T84/E.5-axe', checks, consoleErros.errors), alvo: hostDe(env.base), login, linhas });
} finally {
  await browser.close();
}
