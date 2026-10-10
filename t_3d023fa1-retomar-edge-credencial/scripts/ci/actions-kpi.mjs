#!/usr/bin/env node
// E79: KPI de uso do GitHub Actions, para o branch-hygiene-audit semanal.
//
// Medido antes de escrever (03/10/2026): a API devolve `run_started_at` e
// `updated_at` por run, e o `/timing` devolve `billable: {}` em repositorio publico
// -- por isso a duracao sai da diferenca entre os dois carimbos, e nao do endpoint
// de faturamento (que e a fonte "certa" mas nao existe aqui).
//
// O nucleo e puro de proposito: `agregar`, `maisLentos` e `tabela` nao tocam rede
// nem disco, entao a conta e testavel com runs sinteticos. O CLI so busca, chama e
// publica.
import { appendFileSync } from 'node:fs';

const CANCELADOS = new Set(['cancelled']);
const FALHAS = new Set(['failure', 'timed_out', 'startup_failure']);

export function duracaoMinutos(run) {
  const inicio = Date.parse(run.run_started_at ?? '');
  const fim = Date.parse(run.updated_at ?? '');
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio) return 0;
  return (fim - inicio) / 60000;
}

export function agregar(runs, { janelaDias = 7, agora = Date.now() } = {}) {
  const corte = agora - janelaDias * 24 * 60 * 60 * 1000;
  const porWorkflow = new Map();
  for (const run of runs ?? []) {
    const inicio = Date.parse(run.run_started_at ?? '');
    if (!Number.isFinite(inicio) || inicio < corte) continue;
    const nome = run.name || run.workflow_id || '(sem nome)';
    const atual = porWorkflow.get(nome) ?? { workflow: nome, runs: 0, cancelados: 0, falhas: 0, minutos: 0 };
    atual.runs += 1;
    if (CANCELADOS.has(run.conclusion)) atual.cancelados += 1;
    if (FALHAS.has(run.conclusion)) atual.falhas += 1;
    atual.minutos += duracaoMinutos(run);
    porWorkflow.set(nome, atual);
  }
  const linhas = [...porWorkflow.values()]
    .map((l) => ({
      ...l,
      minutos: Math.round(l.minutos * 10) / 10,
      taxaCancelamento: l.runs ? Math.round((l.cancelados / l.runs) * 1000) / 10 : 0,
      taxaFalha: l.runs ? Math.round((l.falhas / l.runs) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.runs - a.runs || b.minutos - a.minutos);
  return linhas;
}

export function maisLentos(jobs, { limite = 5 } = {}) {
  return (jobs ?? [])
    .map((j) => ({
      job: j.name,
      workflow: j.workflow_name ?? '',
      minutos: Math.round(duracaoMinutos({ run_started_at: j.started_at, updated_at: j.completed_at }) * 10) / 10,
    }))
    .sort((a, b) => b.minutos - a.minutos)
    .slice(0, limite);
}

export function tabela(agregado, { titulo = 'KPI do GitHub Actions — 7 dias' } = {}) {
  const linhas = [
    `## ${titulo}`,
    '',
    '| workflow | runs | cancelados | taxa cancel. | falhas | taxa falha | minutos |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...agregado.map(
      (l) =>
        `| ${l.workflow} | ${l.runs} | ${l.cancelados} | ${l.taxaCancelamento}% | ${l.falhas} | ${l.taxaFalha}% | ${l.minutos} |`,
    ),
  ];
  const totalRuns = agregado.reduce((a, l) => a + l.runs, 0);
  const totalMin = Math.round(agregado.reduce((a, l) => a + l.minutos, 0) * 10) / 10;
  linhas.push('', `Total: **${totalRuns}** runs, **${totalMin}** minutos.`);
  return linhas.join('\n');
}

export function tabelaLentos(lentos) {
  if (!lentos.length) return '_nenhum job registrado na janela_';
  return [
    '### 5 jobs mais lentos',
    '',
    '| job | workflow | minutos |',
    '| --- | --- | ---: |',
    ...lentos.map((l) => `| ${l.job} | ${l.workflow} | ${l.minutos} |`),
  ].join('\n');
}

// ---------------------------------------------------------------- CLI
const API = process.env.GITHUB_API_URL || 'https://api.github.com';
const CABECALHOS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});

async function pedir(caminho, token, { metodo = 'GET', corpo } = {}) {
  const r = await fetch(`${API}${caminho}`, {
    method: metodo,
    headers: { ...CABECALHOS(token), ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`${metodo} ${caminho} -> ${r.status}`);
  return r.json();
}

export async function publicarIssue({ repo, token, marca, corpo }) {
  // Uma issue por semana, nao uma pilha: procura a aberta com a etiqueta e atualiza;
  // se nao houver, cria com o corpo do dia. Idempotente roda duas vezes no mesmo dia
  // nao duplica nada.
  const abertas = await pedir(`/repos/${repo}/issues?state=open&labels=kpi-actions&per_page=10`, token);
  const existente = (abertas ?? []).find((i) => !i.pull_request && String(i.title).startsWith('[kpi-actions]'));
  if (existente) {
    await pedir(`/repos/${repo}/issues/${existente.number}`, token, {
      metodo: 'PATCH',
      corpo: { body: corpo },
    });
    return { acao: 'atualizada', numero: existente.number };
  }
  const criada = await pedir(`/repos/${repo}/issues`, token, {
    metodo: 'POST',
    corpo: { title: marca, body: corpo, labels: ['kpi-actions'] },
  });
  return { acao: 'criada', numero: criada.number };
}

async function principal() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    console.error('::error::GITHUB_REPOSITORY e GH_TOKEN sao obrigatorios');
    process.exit(2);
  }
  const janela = Number(process.env.JANELA_DIAS ?? 7);
  const { workflow_runs: runs = [] } = await pedir(`/repos/${repo}/actions/runs?per_page=100`, token);
  const agregado = agregar(runs, { janelaDias: janela });
  const corpo = [tabela(agregado, { titulo: `KPI do GitHub Actions — ${janela} dias` }), '', tabelaLentos(maisLentos([]))].join('\n');
  console.log(corpo);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, corpo + '\n');
  const marca = `[kpi-actions] Semana de ${new Date().toISOString().slice(0, 10)}`;
  const r = await publicarIssue({ repo, token, marca, corpo });
  console.log(`issue ${r.acao}: #${r.numero}`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  principal().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}
