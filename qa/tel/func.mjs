#!/usr/bin/env node
/**
 * T83 / E.5 — `func.mjs`: os 20 passos funcionais da tela de Telefonia.
 *
 * Aceite: JSON `{ ok, fail, consoleErrors }` com 20/20 — e nenhum erro de
 * console. A LISTA dos 20 nomes é o contrato (vive em `lib/especificacao.mjs →
 * CHECKS_E5`); os passos vivem em `lib/coleta.mjs → passosE5`.
 *
 * Um passo que falha ou estoura NÃO derruba os outros: o erro vira o motivo
 * daquele check. O passo que ESCREVE no banco (discar/Cancelar) só roda com
 * `TEL_MUTACAO=1` e só no ambiente LOCAL do cartão — nunca em produção (R1).
 *
 * Uso:
 *   TEL_URL=http://127.0.0.1:5173 TEL_EMAIL=... TEL_SENHA=... node qa/tel/func.mjs
 *   TEL_URL=file:///.../fixture.html node qa/tel/func.mjs
 */
import { abrirModulo, abrirNavegador, entrar, hostDe, passosE5, vigiarConsole } from './lib/coleta.mjs';
import { CHECKS_E5 } from './lib/especificacao.mjs';
import { ambiente, publicar } from './lib/ambiente.mjs';
import { medir, resumo } from './lib/regras.mjs';

const env = ambiente();
const { browser, page } = await abrirNavegador({ largura: env.largura, altura: env.altura });
const consoleErros = vigiarConsole(page);
const checks = [];

try {
  const { login } = await entrar(page, env);
  consoleErros.zerar();
  await abrirModulo(page, env);

  for (const passo of passosE5(page)) {
    if (passo.nome === 'console sem error') {
      checks.push(medir(passo.nome, consoleErros.errors.length, 0, 0, { erros: consoleErros.errors.slice(0, 5) }));
      continue;
    }
    try {
      const feito = await passo.executar();
      checks.push(medir(passo.nome, feito === true ? 1 : 0, 1, 0));
    } catch (erro) {
      checks.push(medir(passo.nome, 0, 1, 0, { motivo: String(erro?.message ?? erro).slice(0, 200) }));
    }
  }

  // O contrato é a lista: nome fora dela (ou ausente) também reprova.
  const nomes = checks.map((c) => c.eixo);
  if (JSON.stringify(nomes) !== JSON.stringify([...CHECKS_E5])) {
    checks.push(medir('contrato E.5 (20 passos)', 0, 1, 0, { esperado: [...CHECKS_E5], obtido: nomes }));
  }

  publicar({ ...resumo('T83/E.5-func', checks, consoleErros.errors), alvo: hostDe(env.base), login, mutacao: process.env.TEL_MUTACAO === '1' });
} finally {
  await browser.close();
}
