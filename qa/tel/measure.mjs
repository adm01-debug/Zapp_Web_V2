#!/usr/bin/env node
/**
 * T81 / E.2 — `measure.mjs`: mede a geometria da tela de Telefonia.
 *
 * Aceite: todos os eixos do E.2 OK (contentX, chips, kpi, kpiTile, tab, toolbar,
 * rows, pager, panel, segmented, picker, key, cta, selectedPanel,
 * kpiTotal==historyCount, scrollW/innerW, reducedMotion). A tabela com alvos e
 * tolerâncias vive em `lib/especificacao.mjs`; aqui só se coleta e se publica.
 *
 * Uso (alvo local — dev server do cartão ou fixture `file://`):
 *   TEL_URL=http://127.0.0.1:5173 TEL_EMAIL=... TEL_SENHA=... node qa/tel/measure.mjs
 *   TEL_URL=file:///.../fixture.html node qa/tel/measure.mjs
 *
 * Saída: JSON com `ok`, `total`, `fail[]`, `consoleErrors` e o detalhe de cada eixo.
 * Vermelho (exit 1) quando algum eixo reprova ou há erro de console no módulo.
 */
import { abrirModulo, abrirNavegador, entrar, hostDe, medirE2, medirReducedMotion, vigiarConsole } from './lib/coleta.mjs';
import { avaliarE2 } from './lib/especificacao.mjs';
import { ambiente, publicar } from './lib/ambiente.mjs';
import { resumo } from './lib/regras.mjs';

const env = ambiente();
const principal = await abrirNavegador({ largura: env.largura, altura: env.altura });
const consoleErros = vigiarConsole(principal.page);
let login = false;

try {
  ({ login } = await entrar(principal.page, env));
  consoleErros.zerar(); // só os erros do MÓDULO interessam
  await abrirModulo(principal.page, env);
  const observado = await medirE2(principal.page);

  // T75: com `prefers-reduced-motion: reduce` a transição tem de ser ~0. Contexto
  // separado — emular no mesmo contamina a medição de geometria.
  const reduzido = await abrirNavegador({ largura: env.largura, altura: env.altura, reducedMotion: 'reduce' });
  try {
    await entrar(reduzido.page, env);
    await abrirModulo(reduzido.page, env);
    observado.reducedMotion = (await medirReducedMotion(reduzido.page)).reducedMotion;
  } finally {
    await reduzido.browser.close();
  }

  const checks = avaliarE2(observado);
  publicar({ ...resumo('T81/E.2', checks, consoleErros.errors), alvo: hostDe(env.base), login, viewport: { largura: env.largura, altura: env.altura } });
} finally {
  await principal.browser.close();
}
