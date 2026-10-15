#!/usr/bin/env node
// Reuso de árvore já testada: o push na `main` não refaz a CI que a PR acabou de provar.
//
// Com `strict=true` + squash, a PR só entra atualizada com a main, então o commit de
// squash tem EXATAMENTE a mesma árvore (tree SHA) do head da PR. Medido em 15/10/2026:
// 8 dos 9 runs de CI em push na main repetiam uma árvore já aprovada no PR — o run
// 38759168550 levou 26 min para provar de novo o que o PR #1945 já tinha provado.
//
// Regra: no push, se (a) o commit veio de uma PR mergeada, (b) a árvore do commit é
// igual à do head da PR e (c) o último run DESTE workflow no head da PR terminou em
// sucesso com TODOS os jobs em `success`, a CI do push é dispensada.
// Qualquer dúvida ou erro de API cai para "roda tudo" (fail-open para mais teste,
// nunca para menos). Job pulado por draft (`skipped`) não conta como aprovado.
//
// Uso: node scripts/ci/reuso-arvore.mjs --workflow ci.yml
// Grava `reusar=true|false` em $GITHUB_OUTPUT.

import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Jobs que podem falhar sem bloquear merge não impedem o reuso — o push também não os bloquearia.
const NAO_BLOQUEANTE = /não bloqueante/i;
// O próprio job de reuso só roda em push: em todo run de PR ele aparece `skipped`.
// Sem esta exceção nenhum run de PR seria aceito e o reuso nunca dispararia
// (achado da revisão da PR #1949). O nome é conferido nos dois workflows pelo
// contrato da arquitetura.
export const JOB_REUSO = '♻️ Reuso de árvore já testada';

export async function decidirReuso({ evento, sha, repo, workflow, api }) {
  if (evento !== 'push') return { reusar: false, motivo: `evento ${evento}: roda tudo` };
  const pulls = await api(`/repos/${repo}/commits/${sha}/pulls`);
  const pr = (pulls ?? []).find((p) => p.merged_at && p.merge_commit_sha === sha && p.base?.ref === 'main');
  if (!pr) return { reusar: false, motivo: 'commit sem PR mergeada correspondente: roda tudo' };

  const headSha = pr.head.sha;
  const [commitMain, commitHead] = await Promise.all([
    api(`/repos/${repo}/git/commits/${sha}`),
    api(`/repos/${repo}/git/commits/${headSha}`),
  ]);
  if (!commitMain?.tree?.sha || commitMain.tree.sha !== commitHead?.tree?.sha) {
    return { reusar: false, motivo: `árvore do push difere do head da PR #${pr.number}: roda tudo` };
  }

  const runs = await api(`/repos/${repo}/actions/workflows/${workflow}/runs?head_sha=${headSha}&event=pull_request&per_page=20`);
  const ultimo = (runs?.workflow_runs ?? []).sort((a, b) => (b.run_number - a.run_number) || (b.run_attempt - a.run_attempt))[0];
  if (!ultimo) return { reusar: false, motivo: `nenhum run de ${workflow} no head da PR #${pr.number}: roda tudo` };
  if (ultimo.status !== 'completed' || ultimo.conclusion !== 'success') {
    return { reusar: false, motivo: `último run de ${workflow} na PR #${pr.number} terminou em ${ultimo.conclusion ?? ultimo.status}: roda tudo` };
  }

  const jobs = await api(`/repos/${repo}/actions/runs/${ultimo.id}/jobs?filter=latest&per_page=100`);
  const lista = jobs?.jobs ?? [];
  if (lista.length === 0) return { reusar: false, motivo: `run ${ultimo.id} sem jobs listados: roda tudo` };
  const naoAprovados = lista.filter((j) => j.name !== JOB_REUSO && j.conclusion !== 'success' && !NAO_BLOQUEANTE.test(j.name));
  if (naoAprovados.length > 0) {
    const nomes = naoAprovados.map((j) => `${j.name}=${j.conclusion}`).join(', ');
    return { reusar: false, motivo: `run ${ultimo.id} tem job não aprovado (${nomes}): roda tudo` };
  }
  return {
    reusar: true,
    motivo: `árvore ${commitMain.tree.sha.slice(0, 12)} já aprovada por ${workflow} no run ${ultimo.id} (PR #${pr.number}, head ${headSha.slice(0, 8)})`,
  };
}

function criarApi(token) {
  return async (caminho) => {
    const r = await fetch(`https://api.github.com${caminho}`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`GET ${caminho} → HTTP ${r.status}`);
    return r.json();
  };
}

async function main() {
  const i = process.argv.indexOf('--workflow');
  const workflow = i > 0 ? process.argv[i + 1] : '';
  let decisao;
  try {
    if (!workflow) throw new Error('--workflow ausente');
    decisao = await decidirReuso({
      evento: process.env.GITHUB_EVENT_NAME,
      sha: process.env.GITHUB_SHA,
      repo: process.env.GITHUB_REPOSITORY,
      workflow,
      api: criarApi(process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? ''),
    });
  } catch (erro) {
    decisao = { reusar: false, motivo: `erro ao decidir (${erro.message}): roda tudo` };
  }
  console.log(`reusar=${decisao.reusar} — ${decisao.motivo}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `reusar=${decisao.reusar}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Reuso de árvore\n\n${decisao.reusar ? '♻️ CI dispensada' : '▶️ CI completa'}: ${decisao.motivo}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
