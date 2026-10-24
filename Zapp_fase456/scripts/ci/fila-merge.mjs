#!/usr/bin/env node
// Fila de merge serial (substitui a fila nativa, indisponível em conta `User`).
//
// Problema medido em 15/10/2026: com `strict=true`, cada merge na `main` deixava
// todas as PRs com auto-merge BEHIND, e o auto-update-pr-branch atualizava TODAS
// de uma vez. As N PRs recomeçavam a CI completa, só uma entrava, e as outras
// voltavam a BEHIND e recomeçavam do zero — trabalho O(N²), runners disputados
// (até 3 min de fila por job) e nenhuma PR andando mais rápido por isso.
//
// Regra desta fila:
//   1. Só uma PR "em voo" por vez (atualizada com a main e com checks rodando,
//      ou verde esperando o auto-merge disparar). Havendo uma, ninguém mais é
//      atualizado.
//   2. Sem PR em voo, atualiza só a PRÓXIMA: a BEHIND com auto-merge que habilitou
//      o auto-merge primeiro (FIFO por `enabledAt`) — ninguém volta para o fim da fila.
//   3. PR com check obrigatório falhando não é atualizada: rodaria de novo para
//      falhar de novo. Ela volta para a fila quando o autor empurrar a correção.
//
// Uso no workflow: `node scripts/ci/fila-merge.mjs` (lê `gh pr list` e grava
// `pr=<número>` em $GITHUB_OUTPUT quando há alguém a atualizar).

import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolverExecutavel } from '../lib/seguranca-processo.mjs';

const RAIZ = new URL('../../', import.meta.url);

export function checksObrigatorios() {
  const baseline = JSON.parse(readFileSync(new URL('scripts/ci/github-settings-baseline.json', RAIZ), 'utf8'));
  return baseline.branch_protection_main.required_status_checks;
}

const PASSOU = new Set(['SUCCESS', 'SKIPPED', 'NEUTRAL']);
const FALHOU = new Set(['FAILURE', 'TIMED_OUT', 'STARTUP_FAILURE', 'ERROR']);
// GA49: COMPLETED com conclusion fora de PASSOU (inclui CANCELLED e
// ACTION_REQUIRED) e' defeito travado: sem isso a PR ficava "pendente eterna"
// e segurava a fila. Ausente/ainda rodando continua pendente.
function estadoConclusao(conclusion) {
  if (PASSOU.has(conclusion)) return 'passou';
  if (FALHOU.has(conclusion)) return 'falhou';
  return 'bloqueado';
}
// GA49: teto de 45 min sem check em andamento (PR em dia mas travada).
export const TETO_TRAVADA_MS = 45 * 60 * 1000;

// Estado de UM check obrigatório no head da PR: 'passou' | 'falhou' | 'pendente'.
// CANCELLED e ACTION_REQUIRED contam como pendente: não são defeito do código, e
// a próxima atualização roda o check de novo.
export function estadoDoCheck(rollup, nome) {
  const entradas = (rollup ?? []).filter((c) => (c.name ?? c.context) === nome);
  if (entradas.length === 0) return 'pendente';
  // Mais de uma entrada com o mesmo nome = runs repetidos no mesmo head; vale a mais recente.
  const atual = entradas.reduce((a, b) => (String(b.startedAt ?? '') > String(a.startedAt ?? '') ? b : a));
  if (atual.__typename === 'StatusContext' || atual.state) {
    if (atual.state === 'SUCCESS') return 'passou';
    if (atual.state === 'FAILURE' || atual.state === 'ERROR') return 'falhou';
    return 'pendente';
  }
  if (atual.status !== 'COMPLETED') return 'pendente';
  return estadoConclusao(atual.conclusion);
}

// GA50: motivo de estar fora da fila (para o resumo listar as PRs com auto-merge
// ligado que nao entram: "fora" sem motivo visivel travava a fila sem explicar).
export function motivoFora(pr) {
  if (pr.isDraft) return 'draft';
  if (!pr.autoMergeRequest) return 'sem auto-merge';
  if (pr.baseRefName && pr.baseRefName !== 'main') return `base ${pr.baseRefName}`;
  // GA50: `mergeable === CONFLICTING` (REST) equivale a DIRTY (GraphQL):
  // conflito, so o autor resolve (antes, a #1930 era escolhida a cada push e devolvia 422).
  if (pr.mergeStateStatus === 'DIRTY' || pr.mergeable === 'CONFLICTING') return 'conflito';
  if (pr.mergeStateStatus === 'BEHIND' && pr.isCrossRepository) return 'fork atrasada';
  return null;
}

// Algum check obrigatorio com run em andamento (CheckRun nao COMPLETED ou
// StatusContext ainda nao final)?
function temCheckEmAndamento(rollup, obrigatorios) {
  for (const nome of obrigatorios) {
    for (const c of (rollup ?? []).filter((e) => (e.name ?? e.context) === nome)) {
      if (c.__typename === 'StatusContext' || c.state) {
        if (c.state !== 'SUCCESS' && c.state !== 'FAILURE' && c.state !== 'ERROR') return true;
      } else if (c.status !== 'COMPLETED') {
        return true;
      }
    }
  }
  return false;
}

// startedAt mais recente entre os checks obrigatorios (null = nunca reportou).
function ultimoStartedAt(rollup, obrigatorios) {
  let max = null;
  for (const nome of obrigatorios) {
    for (const c of (rollup ?? []).filter((e) => (e.name ?? e.context) === nome)) {
      const t = Date.parse(c.startedAt ?? '');
      if (Number.isFinite(t) && (max === null || t > max)) max = t;
    }
  }
  return max;
}

// 'fora' | 'em-voo' | 'aguardando' | 'bloqueada'
export function classificar(pr, obrigatorios, agoraMs = Date.now()) {
  if (motivoFora(pr)) return 'fora';
  const estados = obrigatorios.map((n) => estadoDoCheck(pr.statusCheckRollup, n));
  if (estados.includes('falhou') || estados.includes('bloqueado')) return 'bloqueada';
  // PR de fork ATRASADA fica fora: o GITHUB_TOKEN não escreve no repositório de
  // origem, então o update-branch nunca funcionaria. Fork já em dia com a main
  // continua contando como em voo (abaixo): ignorá-la deixaria outra PR ser
  // atualizada junto, e essa outra ficaria velha assim que a fork entrasse.
  if (pr.mergeStateStatus === 'BEHIND') return pr.isCrossRepository ? 'fora' : 'aguardando';
  // Atualizada com a main (CLEAN/BLOCKED/UNSTABLE/HAS_HOOKS/UNKNOWN): checks
  // rodando ou verde esperando o auto-merge — em ambos os casos ocupa a vez.
  // GA49: em dia mas sem check em andamento ha mais de 45 min esta travada
  // (CI morreu sem conclusion ou nunca reportou): vira bloqueada e libera a vez.
  if (!temCheckEmAndamento(pr.statusCheckRollup, obrigatorios)) {
    const ultimo = ultimoStartedAt(pr.statusCheckRollup, obrigatorios);
    if (ultimo !== null && agoraMs - ultimo > TETO_TRAVADA_MS) return 'bloqueada';
  }
  return 'em-voo';
}

export function decidir(prs, obrigatorios, agoraMs = Date.now()) {
  const classes = prs.map((pr) => ({ pr, classe: classificar(pr, obrigatorios, agoraMs) }));
  const emVoo = classes.filter((c) => c.classe === 'em-voo');
  const bloqueadas = classes.filter((c) => c.classe === 'bloqueada').map((c) => c.pr.number);
  // GA50: resumo das PRs com auto-merge que estao fora (e por que).
  const fora = classes
    .filter((c) => c.classe === 'fora' && c.pr.autoMergeRequest)
    .map((c) => ({ number: c.pr.number, motivo: motivoFora(c.pr) ?? 'fora' }));
  if (emVoo.length > 0) {
    return { acao: 'esperar', emVoo: emVoo.map((c) => c.pr.number), bloqueadas, fora };
  }
  const fila = classes
    .filter((c) => c.classe === 'aguardando')
    .map((c) => c.pr)
    .sort((a, b) => {
      const ea = String(a.autoMergeRequest.enabledAt ?? '');
      const eb = String(b.autoMergeRequest.enabledAt ?? '');
      return ea === eb ? a.number - b.number : ea < eb ? -1 : 1;
    });
  if (fila.length === 0) return { acao: 'nada', bloqueadas, fora };
  // `fila` vai inteira, em ordem: se o update-branch da primeira for recusado
  // (403/422), o workflow tenta a próxima na mesma execução em vez de travar.
  return { acao: 'atualizar', pr: fila[0].number, fila: fila.map((p) => p.number), restantes: fila.slice(1).map((p) => p.number), bloqueadas, fora };
}

// Depois de uma recusa 403/422, o laço do workflow só tenta o próximo candidato se uma
// decisão recalculada AGORA ainda o autoriza: nenhuma PR em voo e ele é a PRIMEIRA da
// fila recalculada que ainda não foi recusada nesta execução. A lista lida no início pode
// estar velha: outra PR pode ter entrado em voo, ou uma PR mais antiga ter ficado elegível
// e passado à frente (Codex, PRs #1950 e #1951).
export function confirmarCandidato(decisao, numero, recusadas = []) {
  if (decisao.acao !== 'atualizar') return false;
  return decisao.fila.find((n) => !recusadas.includes(n)) === numero;
}

// `gh pr list` devolve mergeStateStatus=UNKNOWN enquanto o GitHub nao calculou a
// mergeabilidade (calculo assincrono). Tratar UNKNOWN como "em voo" travaria a fila;
// por isso, para PRs com auto-merge em UNKNOWN, a defasagem vem de uma comparacao
// direta (compare main...head → behind_by), que nao depende desse calculo.
export async function resolverDesconhecidos(prs, behindBy) {
  const saida = [];
  for (const pr of prs) {
    if (pr.mergeStateStatus !== 'UNKNOWN' || pr.isDraft || !pr.autoMergeRequest || !pr.headRefOid) {
      saida.push(pr);
      continue;
    }
    let atras = null;
    try {
      atras = await behindBy(pr.headRefOid);
    } catch {
      atras = null; // sem resposta: continua UNKNOWN (conservador: ocupa a vez)
    }
    saida.push(atras > 0 ? { ...pr, mergeStateStatus: 'BEHIND' } : pr);
  }
  return saida;
}

async function decisaoAtual(repo) {
  const json = execFileSync(resolverExecutavel('gh'), [
    'pr', 'list', '--repo', repo, '--state', 'open', '--base', 'main', '--limit', '100',
    '--json', 'number,isDraft,isCrossRepository,baseRefName,headRefOid,autoMergeRequest,mergeStateStatus,mergeable,statusCheckRollup',
  ], { encoding: 'utf8' });
  const behindBy = async (head) => Number(execFileSync(resolverExecutavel('gh'), [
    'api', `repos/${repo}/compare/main...${head}`, '--jq', '.behind_by',
  ], { encoding: 'utf8' }).trim());
  const prs = await resolverDesconhecidos(JSON.parse(json), behindBy);
  return decidir(prs, checksObrigatorios());
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    console.error('GITHUB_REPOSITORY ausente');
    process.exit(2);
  }
  // `--confirmar N [--recusadas "A B"]`: exit 0 se N é a próxima da fila recalculada,
  // desconsideradas as já recusadas nesta execução; 3 se não (alguém em voo, outra PR à
  // frente, N fora da fila). Não escreve output nem summary.
  const iConfirmar = process.argv.indexOf('--confirmar');
  if (iConfirmar !== -1) {
    const numero = Number(process.argv[iConfirmar + 1]);
    if (!Number.isInteger(numero) || numero <= 0) {
      console.error('--confirmar exige o número da PR');
      process.exit(2);
    }
    const iRecusadas = process.argv.indexOf('--recusadas');
    const recusadas = iRecusadas === -1 ? [] : String(process.argv[iRecusadas + 1] ?? '')
      .split(/\s+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const decisao = await decisaoAtual(repo);
    if (confirmarCandidato(decisao, numero, recusadas)) return;
    const motivo = decisao.acao === 'esperar' ? `em voo: #${decisao.emVoo.join(', #')}` : `#${numero} não é mais a próxima da fila`;
    console.log(`Fila recalculada não autoriza #${numero} (${motivo}).`);
    process.exit(3);
  }
  const decisao = await decisaoAtual(repo);
  const linhas = [];
  if (decisao.acao === 'esperar') linhas.push(`Em voo: #${decisao.emVoo.join(', #')} — ninguém mais é atualizado agora.`);
  if (decisao.acao === 'nada') linhas.push('Nenhuma PR com auto-merge esperando atualização.');
  if (decisao.acao === 'atualizar') {
    linhas.push(`Próxima da fila: #${decisao.pr}.`);
    if (decisao.restantes.length) linhas.push(`Esperando a vez (sem gastar CI): #${decisao.restantes.join(', #')}.`);
  }
  if (decisao.bloqueadas.length) linhas.push(`Fora da fila até corrigir check obrigatório: #${decisao.bloqueadas.join(', #')}.`);
  if (decisao.fora.length) linhas.push(`Fora da fila (auto-merge ligado): ${decisao.fora.map((f) => `#${f.number} (${f.motivo})`).join(', ')}.`);
  for (const l of linhas) console.log(l);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Fila de merge\n\n${linhas.map((l) => `- ${l}`).join('\n')}\n`);
  if (process.env.GITHUB_OUTPUT && decisao.acao === 'atualizar') {
    // Só inteiros saem daqui: o workflow itera sobre esta lista no shell.
    const fila = decisao.fila.filter((n) => Number.isInteger(n) && n > 0).join(' ');
    appendFileSync(process.env.GITHUB_OUTPUT, `pr=${decisao.pr}\nfila=${fila}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
