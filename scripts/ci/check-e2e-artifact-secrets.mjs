#!/usr/bin/env node
/**
 * Guarda: workflow que usa as credenciais de E2E nao pode publicar o report do
 * Playwright.
 *
 * MOTIVO (medido em 02/10/2026): quando o `auth.setup` falha, o Playwright grava
 * a arvore de acessibilidade da pagina da falha em `test-results/.../error-context.md`
 * e o relatorio HTML embute esse conteudo. O campo de senha aparece com o VALOR
 * DIGITADO em texto claro. O `upload-artifact` de `playwright-report/` publicaria
 * isso como artifact de um repositorio publico.
 *
 * Hoje nenhum workflow viola a regra: `ci.yml` sobe o report mas roda apenas
 * projetos sem autenticacao, e quem tem as credenciais (`e2e-logado.yml`) nao
 * publica artifact. A regra existe para que essa separacao nao se perca por
 * descuido no futuro -- mover o projeto `setup` para o `ci.yml` passa a reprovar
 * aqui em vez de vazar em silencio.
 *
 * Uso: node scripts/ci/check-e2e-artifact-secrets.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Caminhos que carregam a arvore de acessibilidade com o valor digitado. */
export const CAMINHOS_SENSIVEIS = ['playwright-report', 'test-results', 'e2e/.auth'];

/** Variaveis cujo uso ativo marca o workflow como "com credencial". */
export const VARIAVEIS_CREDENCIAL = ['E2E_TEST_EMAIL', 'E2E_TEST_PASSWORD'];

/** Remove comentarios de linha para nao confundir citacao em prosa com uso real. */
export function semComentarios(fonte) {
  return fonte
    .split(/\r?\n/u)
    .map((linha) => linha.replace(/(^|\s)#.*$/u, '$1'))
    .join('\n');
}

/** O workflow referencia alguma credencial de E2E de verdade? */
export function usaCredencial(fonte) {
  const limpo = semComentarios(fonte);
  return VARIAVEIS_CREDENCIAL.some((variavel) =>
    new RegExp(`secrets\\.${variavel}\\b`, 'u').test(limpo),
  );
}

/** Blocos de upload-artifact: o que cada um publica. */
export function uploads(fonte) {
  const limpo = semComentarios(fonte);
  const achados = [];
  const linhas = limpo.split('\n');
  for (let i = 0; i < linhas.length; i += 1) {
    if (!/uses:\s*actions\/upload-artifact@/u.test(linhas[i])) continue;
    let caminho = '';
    for (let j = i + 1; j < Math.min(i + 20, linhas.length); j += 1) {
      if (/^\s*uses:\s*/u.test(linhas[j])) break;
      const m = /^\s*path:\s*(.+?)\s*$/u.exec(linhas[j]);
      if (m) {
        caminho = m[1].replace(/^['"]|['"]$/gu, '');
        break;
      }
    }
    achados.push({ linha: i + 1, caminho });
  }
  return achados;
}

/**
 * Avalia um workflow. Devolve [] quando esta em conformidade, ou uma lista de
 * violacoes legiveis.
 */
export function avaliarWorkflow(nome, fonte) {
  const violations = [];
  if (!usaCredencial(fonte)) return violations;
  for (const envio of uploads(fonte)) {
    const sensivel = CAMINHOS_SENSIVEIS.find((alvo) => envio.caminho.includes(alvo));
    if (sensivel) {
      violations.push(
        `${nome}: linha ${envio.linha} publica "${envio.caminho}" (contem ${sensivel}) ` +
          'num workflow que usa E2E_TEST_EMAIL/E2E_TEST_PASSWORD. O report do Playwright ' +
          'embute o error-context com o valor do campo de senha. Ou tire as credenciais ' +
          'deste workflow, ou nao publique o report.',
      );
    }
  }
  return violations;
}

export function guarda(diretorio = '.github/workflows') {
  const violations = [];
  for (const arquivo of readdirSync(diretorio).sort()) {
    if (!/\.ya?ml$/u.test(arquivo)) continue;
    const fonte = readFileSync(join(diretorio, arquivo), 'utf8');
    violations.push(...avaliarWorkflow(arquivo, fonte));
  }
  return violations;
}

const executadoDireto = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (executadoDireto) {
  const violations = guarda();
  if (violations.length > 0) {
    console.error('VIOLACAO: credencial de E2E + publicacao do report do Playwright\n');
    for (const v of violations) console.error(` - ${v}`);
    console.error(
      `\n${violations.length} violacao(oes). O artifact de um repo publico nao pode conter ` +
        'valor de senha digitada.',
    );
    process.exit(1);
  }
  console.log('OK: nenhum workflow publica o report do Playwright junto das credenciais de E2E.');
}
