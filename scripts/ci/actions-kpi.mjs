#!/usr/bin/env node
// E79: KPI de uso do GitHub Actions, para o branch-hygiene-audit semanal.
//
// Medido antes de escrever (03/10/2026): a API devolve `run_started_at` e
// `updated_at` por run, e o `/timing` devolve `billable: {}` em repositorio publico
// -- por isso a duracao sai da diferenca entre os dois carimbos, e nao do endpoint
// de faturamento (que e a fonte "certa" mas nao existe aqui).
//
// #365: a primeira versao lia UMA pagina de runs (`per_page=100`) e publicava o
// ranking dos "5 jobs mais lentos" a partir de `maisLentos([])` -- nunca consultava
// os jobs. Agora `coletarRuns` pagina ate a ultima pagina cair fora da janela, e
// `coletarJobs` busca os jobs de cada run da janela antes de montar o ranking.
//
// O nucleo e puro de proposito: `agregar`, `maisLentos`, `paginaTemMais` e `tabela`
// nao tocam rede nem disco, entao a conta e testavel com runs sinteticos. O CLI so
// busca, chama e publica.
import { appendFileSync } from 'node:fs';

const CANCELADOS = new Set(['cancelled']);
const FALHAS = new Set(['failure', 'timed_out', 'startup_failure']);
const UM_DIA = 24 * 60 * 60 * 1000;
const POR_PAGINA = 100; // teto da API do GitHub

export function duracaoMinutos(run) {
  const inicio = Date.parse(run.run_started_at ?? '');
  const fim = Date.parse(run.updated_at ?? '');
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio) return 0;
  return (fim - inicio) / 60000;
}

export function runsNaJanela(runs, { janelaDias = 7, agora = Date.now() } = {}) {
  const corte = agora - janelaDias * UM_DIA;
  return (runs ?? []).filter((run) => {
    const inicio = Date.parse(run.run_started_at ?? '');
    return Number.isFinite(inicio) && inicio >= corte;
  });
}

export function agregar(runs, { janelaDias = 7, agora = Date.now() } = {}) {
  const porWorkflow = new Map();
  for (const run of runsNaJanela(runs, { janelaDias, agora })) {
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

// A API devolve os runs do mais novo para o mais antigo. Se a pagina veio cheia E o
// run mais antigo dela ainda esta dentro da janela, pode haver run da janela na
// pagina seguinte -- entao vale continuar. Pagina incompleta e' a ultima; pagina cujo
// run mais antigo ja saiu da janela significa que a proxima so' teria coisa velha.
export function paginaTemMais(pagina, { janelaDias = 7, agora = Date.now(), porPagina = POR_PAGINA } = {}) {
  const runs = pagina ?? [];
  if (runs.length < porPagina) return false;
  const tempos = runs.map((r) => Date.parse(r.run_started_at ?? '')).filter(Number.isFinite);
  if (!tempos.length) return false;
  const maisAntigo = Math.min(...tempos);
  return maisAntigo >= agora - janelaDias * UM_DIA;
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

// Monta o corpo publicado (Job Summary + issue): tabela por workflow + ranking dos
// jobs. Puro, para o teste provar que o ranking saem dos jobs reais e nao vazio.
export function corpoDoKpi(runs, jobs, { janelaDias = 7, agora = Date.now(), titulo } = {}) {
  const agregado = agregar(runs, { janelaDias, agora });
  return [
    tabela(agregado, { titulo: titulo ?? `KPI do GitHub Actions — ${janelaDias} dias` }),
    '',
    tabelaLentos(maisLentos(jobs, { limite: 5 })),
  ].join('\n');
}

// GA93: percentil de duracoes (p50/p95 por workflow, em minutos).
export function percentil(valores, p) {
  const xs = [...(valores ?? [])].filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const pos = Math.min(xs.length - 1, Math.floor((p / 100) * xs.length));
  return Math.round(xs[pos] * 10) / 10;
}

// GA93: monta o kpi.json por arquivo de workflow (chave = nome do .yml, que e o
// que o render-workflow-docs le). `mapaNomeArquivo` traduz `run.name` (nome
// amigavel do workflow) para o arquivo .yml — construido lendo o `name:` de cada
// YAML. Campos por arquivo: custo_semana_min, taxa_falha_7d (lidos pelo render),
// cancelados_precoces (cancelado com < 1 min, nem comecou), minutos_desperdicados
// (soma dos cancelados), p50_min/p95_min e causas (contagem por conclusion).
export function montarKpi(runs, jobs, { janelaDias = 7, agora = Date.now(), mapaNomeArquivo = {} } = {}) {
  const naJanela = runsNaJanela(runs, { janelaDias, agora });
  const porArquivo = new Map();
  const paraArquivo = (nome) => mapaNomeArquivo[nome] ?? nome;
  for (const run of naJanela) {
    const arq = paraArquivo(run.name || run.workflow_id || '(sem nome)');
    if (!porArquivo.has(arq)) {
      porArquivo.set(arq, { runs: [], conclusoes: {}, canceladosPrecoces: 0, minutosDesperdicados: 0 });
    }
    const e = porArquivo.get(arq);
    e.runs.push(run);
    const c = run.conclusion ?? 'desconhecida';
    e.conclusoes[c] = (e.conclusoes[c] ?? 0) + 1;
    const min = duracaoMinutos(run);
    if (CANCELADOS.has(run.conclusion)) {
      e.minutosDesperdicados = Math.round((e.minutosDesperdicados + min) * 10) / 10;
      if (min < 1) e.canceladosPrecoces += 1;
    }
  }
  const saidas = {};
  for (const [arq, e] of porArquivo) {
    const duracoes = e.runs.map(duracaoMinutos);
    const falhas = e.runs.filter((r) => FALHAS.has(r.conclusion)).length;
    saidas[arq] = {
      custo_semana_min: Math.round(duracoes.reduce((a, b) => a + b, 0) * 10) / 10,
      taxa_falha_7d: e.runs.length ? Math.round((falhas / e.runs.length) * 1000) / 10 : 0,
      cancelados_precoces: e.canceladosPrecoces,
      minutos_desperdicados: e.minutosDesperdicados,
      p50_min: percentil(duracoes, 50),
      p95_min: percentil(duracoes, 95),
      causas: e.conclusoes,
    };
  }
  return saidas;
}

export async function gravarKpi(caminho, kpi) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, `${JSON.stringify(kpi, null, 2)}\n`);
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

// Pagina os runs ate cobrir a janela inteira. `pedir` e' injetavel para o teste
// exercitar a paginacao sem rede. O teto de paginas e' so' uma trava anti-loop (100
// paginas = 10k runs); a janela de 7 dias nunca chega perto disso.
export async function coletarRuns({
  repo,
  token,
  janelaDias = 7,
  agora = Date.now(),
  porPagina = POR_PAGINA,
  maxPaginas = 100,
  pedir: buscar = pedir,
} = {}) {
  const todos = [];
  for (let pagina = 1; pagina <= maxPaginas; pagina += 1) {
    const { workflow_runs: runs = [] } = await buscar(
      `/repos/${repo}/actions/runs?per_page=${porPagina}&page=${pagina}`,
      token,
    );
    todos.push(...runs);
    if (!paginaTemMais(runs, { janelaDias, agora, porPagina })) {
      if (pagina === maxPaginas && runs.length >= porPagina) {
        console.error(`::warning::paginacao de runs parou no teto de ${maxPaginas} paginas`);
      }
      break;
    }
  }
  return todos;
}

// Busca os jobs de cada run (paginando o proprio run, que tambem corta em 100) e
// preenche `workflow_name` com o nome do run quando o endpoint de jobs nao o traz.
// GA92: 1 GET por run estourava o limite de 1.000/h do GITHUB_TOKEN (1.014 runs em
// 7 d). Agora so coleta jobs de runs com falha/cancelamento (o ranking "mais lentos"
// e o p50/p95 importam onde doi) com teto de runs — fixture com 1.500 runs gera
// < 300 chamadas.
const COM_FALHA = new Set([...FALHAS, ...CANCELADOS]);
export async function coletarJobs(
  runs,
  { repo, token, porPagina = POR_PAGINA, maxPaginas = 100, maxRuns = 200, pedir: buscar = pedir } = {},
) {
  const alvos = (runs ?? []).filter((r) => COM_FALHA.has(r.conclusion)).slice(0, maxRuns);
  if ((runs ?? []).length > alvos.length) {
    console.error(
      `::notice::coletarJobs: ${alvos.length} de ${runs.length} runs (so falha/cancelamento, teto ${maxRuns})`,
    );
  }
  const jobs = [];
  for (const run of alvos) {
    const id = run.id ?? run.run_id;
    if (id === undefined || id === null) continue;
    for (let pagina = 1; pagina <= maxPaginas; pagina += 1) {
      const { jobs: paginaJobs = [] } = await buscar(
        `/repos/${repo}/actions/runs/${id}/jobs?per_page=${porPagina}&page=${pagina}`,
        token,
      );
      for (const job of paginaJobs) {
        jobs.push({ ...job, workflow_name: job.workflow_name ?? run.name ?? '' });
      }
      if (paginaJobs.length < porPagina) break;
    }
  }
  return jobs;
}

export async function publicarIssue({ repo, token, marca, corpo }) {
  // Uma issue por semana, nao uma pilha: procura a aberta com a etiqueta e atualiza;
  // se nao houver, cria com o corpo do dia. Idempotente roda duas vezes no mesmo dia
  // nao duplica nada.
  const abertas = await pedir(`/repos/${repo}/issues?state=open&labels=kpi-actions&per_page=10`, token);
  const existente = (abertas ?? []).find((i) => !i.pull_request && String(i.title).startsWith('[kpi-actions]'));
  if (existente) {
    // W92: atualiza o titulo tambem para refletir a semana corrente
    // (sem isso o titulo fica preso na semana em que a issue foi criada).
    await pedir(`/repos/${repo}/issues/${existente.number}`, token, {
      metodo: 'PATCH',
      corpo: { title: marca, body: corpo },
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
  const runs = await coletarRuns({ repo, token, janelaDias: janela });
  const jobs = await coletarJobs(runsNaJanela(runs, { janelaDias: janela }), { repo, token });
  // GA93: mapa nome-amigavel -> arquivo .yml (o render indexa por arquivo).
  const mapaNomeArquivo = {};
  try {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join, dirname: dir } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dirWf = join(dir(fileURLToPath(import.meta.url)), '..', '..', '.github', 'workflows');
    for (const arq of readdirSync(dirWf).filter((f) => f.endsWith('.yml'))) {
      const texto = readFileSync(join(dirWf, arq), 'utf8');
      const m = /^name:\s*(.+?)\s*$/m.exec(texto);
      if (m) mapaNomeArquivo[m[1]] = arq;
    }
  } catch {
    // fora do repo (teste): chaves ficam com o nome amigavel.
  }
  const kpi = montarKpi(runs, jobs, { janelaDias: janela, mapaNomeArquivo });
  if (process.env.KPI_JSON_PATH) {
    await gravarKpi(process.env.KPI_JSON_PATH, kpi);
    console.log(`kpi.json gravado em ${process.env.KPI_JSON_PATH}`);
  }
  const corpo = corpoDoKpi(runs, jobs, { janelaDias: janela });
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
