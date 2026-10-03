// E60 (auditoria de GitHub Actions, plano de 2026-10-01): a rastreabilidade do
// deploy de edge e' uma TAG `edge-deploy/<data>-<sha8>-<run>`. Tag nao aparece na
// aba Deployments, nao tem link para o run e nao sobrevive a limpeza de tags.
//
// ARMADILHA MEDIDA (03/10/2026): o job ja declara
// `environment: producao-edge-functions`, entao o GitHub JA cria um Deployment por
// run -- medido pela API: id=6824596526, `ref=main`, sha do run. Ou seja, a
// verificacao escrita no plano ("a aba lista o deploy com SHA e run") JA e' verdade
// antes de qualquer codigo meu. Quem olhasse so' a aba concluiria "etapa cumprida"
// sem nada ter sido feito.
//
// O que o Deployment do GitHub NAO faz -- e o que justifica esta etapa: ele aponta
// para `ref=main`, que ANDA. Em rollback, o que foi publicado e' um ANCESTRAL da
// main, nao ela (o passo "Provar checkout imutavel" publica um sha antigo). A tag
// prendia o sha deployado; o Deployment da plataforma nao prende. Este modulo cria
// o Deployment que prende: `ref` = sha DEPLOYADO (nao a branch), `payload` com run
// e escopo.

export const AMBIENTE_PADRAO = 'producao-edge-functions';

const SHA40 = /^[a-f0-9]{40}$/;

export function construirDeployment({ shaDeployado, ambiente = AMBIENTE_PADRAO, runId, runUrl, escopo }) {
  const sha = String(shaDeployado ?? '').trim().toLowerCase();
  if (!SHA40.test(sha)) {
    throw new Error(`shaDeployado precisa ser um sha de 40 hex: recebido "${shaDeployado}"`);
  }
  return {
    // `ref` e' o sha deployado -- NAO `main`. E' o unico campo que prende o que
    // esta no ar; se voltar a ser a branch, a etapa nao entregou nada.
    ref: sha,
    environment: ambiente,
    description: `Deploy de edge functions — run ${runId}${escopo ? ` (escopo ${escopo})` : ''}`,
    // Sem `required_contexts: []` o GitHub recusa o deployment quando o sha nao tem
    // todos os commit statuses (caso de um ancestral antigo, no rollback).
    required_contexts: [],
    auto_merge: false,
    transient_environment: false,
    production_environment: true,
    payload: {
      deployed_sha: sha,
      run_id: String(runId ?? ''),
      run_url: runUrl ?? '',
      escopo: escopo || 'all',
    },
  };
}

export function construirStatus({ id, estado = 'success', ambiente = AMBIENTE_PADRAO, runUrl, descricao }) {
  if (!id) throw new Error('status exige o id do deployment');
  return {
    deployment_id: id,
    state: estado,
    environment: ambiente,
    log_url: runUrl ?? '',
    description: descricao || `Deploy de edge functions (${estado})`,
    auto_inactive: false,
  };
}

export function resumirDeployment(d) {
  return `${d.environment} @ ${d.ref.slice(0, 8)} (run ${d.payload.run_id})`;
}
