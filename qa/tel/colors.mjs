#!/usr/bin/env node
/**
 * T82 / E.3 — `colors.mjs`: prova que cada elemento da tela pinta com o TOKEN
 * que ele diz usar, com ΔE ≤ 2 (CIE76).
 *
 * As duas pontas são independentes: o esperado vem da variável CSS que a
 * PRÓPRIA página declara (`--card`, `--foreground`, `--success`, …) e o obtido
 * do `getComputedStyle` do elemento. Não existe cor nova aqui — o script só
 * converte e compara. Se acusar, o conserto é usar o token (regra do cartão),
 * nunca inventar hex.
 *
 * Uso:
 *   TEL_URL=http://127.0.0.1:5173 TEL_EMAIL=... TEL_SENHA=... node qa/tel/colors.mjs
 *   TEL_URL=file:///.../fixture.html node qa/tel/colors.mjs
 */
import { abrirModulo, abrirNavegador, entrar, hostDe, medirE3, vigiarConsole } from './lib/coleta.mjs';
import { TOKENS_E3, avaliarE3, prepararE3 } from './lib/especificacao.mjs';
import { ambiente, publicar } from './lib/ambiente.mjs';
import { resumo } from './lib/regras.mjs';

const env = ambiente();
const { browser, page } = await abrirNavegador({ largura: env.largura, altura: env.altura });
const consoleErros = vigiarConsole(page);

try {
  const { login } = await entrar(page, env);
  consoleErros.zerar();
  await abrirModulo(page, env);

  const bruto = await medirE3(page, TOKENS_E3.map(({ eixo, seletor, propriedade, token }) => ({ eixo, seletor, propriedade, token })));
  const checks = avaliarE3(prepararE3(bruto));

  publicar({ ...resumo('T82/E.3', checks, consoleErros.errors), alvo: hostDe(env.base), login });
} finally {
  await browser.close();
}
