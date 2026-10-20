#!/usr/bin/env node
/**
 * Guarda: workflow que usa as credenciais de E2E nao pode publicar o report do
 * Playwright **sem redigir as credenciais antes**.
 *
 * MOTIVO (medido em 02/10/2026): quando o `auth.setup` falha, o Playwright grava
 * a arvore de acessibilidade da pagina da falha em `test-results/.../error-context.md`
 * e o relatorio HTML embute esse conteudo. O campo de senha aparece com o VALOR
 * DIGITADO em texto claro. O `upload-artifact` de `playwright-report/` publicaria
 * isso como artifact de um repositorio publico.
 *
 * EXCECAO (03/10/2026): publicar passa a ser permitido quando o proprio workflow redige
 * o report ANTES do upload, cobrindo TODAS as credenciais de E2E, e condiciona o upload
 * ao sucesso da redacao. Mascarar o log (`::add-mask::`) NAO conta: ele esconde o valor
 * na saida do run, nao no arquivo -- e o vazamento esta no arquivo. Redigir so o e-mail
 * tambem nao conta: o que vaza em texto claro e a SENHA. A excecao existe para o
 * diagnostico ficar acessivel sem publicar credencial; a proibicao do upload cru
 * continua de pe.
 *
 * Uso: node scripts/ci/check-e2e-artifact-secrets.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Caminhos que carregam a arvore de acessibilidade com o valor digitado. */
export const CAMINHOS_SENSIVEIS = ['playwright-report', 'test-results', 'e2e/.auth'];

/** Variaveis cujo uso ativo marca o workflow como "com credencial". */
export const VARIAVEIS_CREDENCIAL = ['E2E_TEST_EMAIL', 'E2E_TEST_PASSWORD'];

/** Script que redige o report; a excecao exige a invocacao dele antes do upload. */
export const REDATOR = 'scripts/ci/redigir-relatorio.mjs';

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

/** O trecho do workflow que antecede a linha do upload. */
function antesDe(fonte, linhaDoUpload) {
  return semComentarios(fonte)
    .split('\n')
    .slice(0, Math.max(0, linhaDoUpload - 1))
    .join('\n');
}

/**
 * O bloco do passo de upload, completo. Em YAML a ordem das chaves do passo nao e
 * garantida -- o `if:` pode vir antes OU depois do `uses:` --, entao o bloco e delimitado
 * pelo item da lista (a linha que comeca com `- `), para tras e para frente. Olhar so um
 * dos lados deixaria a exigencia insatisfazivel em uma das duas ordens.
 */
function blocoDoUpload(fonte, linhaDoUpload) {
  const linhas = semComentarios(fonte).split('\n');
  const inicio = linhaDoUpload - 1;
  let de = inicio;
  while (de > 0 && !/^\s*- /.test(linhas[de])) de -= 1;
  let ate = inicio;
  while (ate + 1 < linhas.length && !/^\s*- /.test(linhas[ate + 1])) ate += 1;
  return linhas.slice(de, ate + 1).join('\n');
}

/**
 * O workflow redige o report, cobrindo todas as credenciais, antes de publicar?
 * Tres exigencias, e nenhuma delas e cosmetica:
 *  1. o redator foi invocado antes do upload;
 *  2. nomeia TODAS as credenciais de E2E -- redigir so o e-mail deixaria a senha
 *     digitada no error-context.md, que e o vazamento medido no motivo da guarda;
 *  3. o upload esta condicionado ao sucesso da redacao (`steps.<id>.outcome == 'success'`)
 *     -- se a redacao falhar, o report nao sobe de jeito nenhum.
 */
export function redigeAntesDoUpload(fonte, linhaDoUpload) {
  const antes = antesDe(fonte, linhaDoUpload);
  if (!antes.includes(REDATOR)) return false;
  const cobreTodas = VARIAVEIS_CREDENCIAL.every((variavel) =>
    new RegExp(`segredo-env=${variavel}\\b`, 'u').test(antes),
  );
  if (!cobreTodas) return false;
  return /steps\.[A-Za-z0-9_-]+\.outcome\s*==\s*'success'/u.test(blocoDoUpload(fonte, linhaDoUpload));
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
    if (!sensivel) continue;
    if (redigeAntesDoUpload(fonte, envio.linha)) continue;
    violations.push(
      `${nome}: linha ${envio.linha} publica "${envio.caminho}" (contem ${sensivel}) ` +
        'num workflow que usa E2E_TEST_EMAIL/E2E_TEST_PASSWORD sem redigir as credenciais ' +
        'antes. O report do Playwright embute o error-context com o valor do campo de ' +
        'senha. Ou tire as credenciais deste workflow, ou nao publique o report, ou ' +
        `redija-o antes com ${REDATOR} --segredo-env=E2E_TEST_EMAIL ` +
        "--segredo-env=E2E_TEST_PASSWORD e condicione o upload ao sucesso dela.",
    );
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
