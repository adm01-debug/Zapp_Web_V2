#!/usr/bin/env node
// Veredito do contrato vivo do DB Live Guard (.github/workflows/db-live-guard.yml).
//
// Por que esta logica vive aqui e nao num heredoc do YAML: os passos de
// verificacao do job saem com `continue-on-error` (E58) de proposito — um drift
// de migration nao pode esconder os outros checks —, entao quem decide se o
// guarda vivo fica vermelho e a consolidacao. A lista de passos consolidados era
// escrita a mao no YAML e saiu de sincronia com os passos reais: o check de
// fixtures de E2E (E85) rodava com continue-on-error e SEM `id`, fora da tabela
// do Job Summary, da causa e do alerta. O job passava verde com o fixture
// faltando (R2-INF-021, item 368 do BACKLOG_VERIFICADO).
//
// Aqui a lista e FECHADA (PASSOS) e o veredito FALHA FECHADO: passo de PASSOS que
// nao aparecer no contexto `steps` do job (sem `id:` ou sem executar) conta como
// falha, em vez de sumir. Era esse modo de falha — sumir em silencio — que criou
// o defeito. O outro lado da garantia (todo passo que grava /tmp/step-<id>.log
// tem de estar registrado) e provado em consolidar-veredito.test.mjs.
//
// Saidas, iguais as do heredoc que este script substitui:
//   $GITHUB_STEP_SUMMARY   tabela do veredito + primeiras 20 linhas de cada log
//   $GITHUB_OUTPUT         causa, falhas_lista, logs_falhas (JSON), passos
// Entrada: $STEPS_JSON = `${{ toJSON(steps) }}` do job.
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Passos do contrato vivo, na ordem em que rodam no job. `log` e o caminho que o
// passo grava com `tee` (convencao E43: /tmp/step-<id>.log).
export const PASSOS = [
  { id: 'migrations', nome: 'Comparar migrations com schema_migrations', log: '/tmp/step-migrations.log' },
  { id: 'acl-mcp-exec', nome: 'Verificar ACL e contrato de mcp_exec', log: '/tmp/step-acl-mcp-exec.log' },
  { id: 'acl-webhook', nome: 'Verificar ACL da dead-letter queue de webhooks', log: '/tmp/step-acl-webhook.log' },
  { id: 'acl-talkx-metrics', nome: 'Verificar security_invoker da view de metricas Talk X', log: '/tmp/step-acl-talkx-metrics.log' },
  // E85: os tres fixtures de E2E vivem em producao. Faltando um, o sintoma nao e
  // "fixture sumiu": e um spec logado vermelho que parece bug de aplicacao.
  { id: 'e2e-fixtures', nome: 'Fixtures de E2E em producao (E85)', log: '/tmp/step-e2e-fixtures.log' },
  { id: 'contract-talkx-transition', nome: 'Verificar contrato de transicao de campanha do Talk X', log: '/tmp/step-contract-talkx-transition.log' },
  { id: 'catalog', nome: 'Regenerar catalogo e comparar com o commitado', log: '/tmp/step-catalog.log' },
  { id: 'manifest', nome: 'Regenerar manifesto e comparar com o commitado', log: '/tmp/step-manifest.log' },
  { id: 'types', nome: 'Verificar frescor do types.ts', log: '/tmp/step-types.log' },
  { id: 'triple-parity', nome: 'Paridade tripla (migrations, edges, grants)', log: '/tmp/step-triple-parity.log' },
  { id: 'runtime-config', nome: 'Auditar configuracao runtime sem dados de clientes', log: '/tmp/step-runtime-config.log' },
];

// E44: CAUSA = sha256 do passo mais a esquerda nesta ordem canonica — hash estavel
// do passo raiz, nao do conjunto, que e o que o dedupe do alerta usa. O check de
// fixtures entra por ultimo de proposito: fixture faltando costuma ser SINTOMA de
// outro drift (migration, reset de ambiente), e a raiz deve apontar o estrutural.
export const ORDEM_CAUSA = [
  'migrations',
  'catalog',
  'manifest',
  'types',
  'acl-mcp-exec',
  'acl-webhook',
  'acl-talkx-metrics',
  'contract-talkx-transition',
  'runtime-config',
  'triple-parity',
  'e2e-fixtures',
];

/** Redacao de credencial em qualquer trecho que for para summary/alert/artefato. */
export function redigir(texto) {
  return String(texto)
    .replace(/postgres(?:ql)?:\/\/[^@\s]+@\S+/gi, 'postgres://***@***')
    .replace(/password=[^\s&]+/g, 'password=***');
}

/**
 * Consolida o veredito a partir do contexto `steps` do job.
 * `steps` e o objeto de `${{ toJSON(steps) }}`: { <id>: { outcome, ... } }.
 */
export function consolidar(steps) {
  const tabela = PASSOS.map((passo) => {
    const bruto = steps && typeof steps === 'object' ? steps[passo.id] : null;
    const outcome = bruto && typeof bruto.outcome === 'string' ? bruto.outcome : '';
    return { ...passo, outcome, passou: outcome === 'success' };
  });
  const falhas = tabela.filter((linha) => !linha.passou);
  const raiz =
    ORDEM_CAUSA.map((id) => falhas.find((falha) => falha.id === id)).find(Boolean) ?? falhas[0] ?? null;
  return {
    tabela,
    falhas,
    raizId: raiz ? raiz.id : '',
    causa: raiz ? createHash('sha256').update(raiz.nome, 'utf8').digest('hex') : '',
    nomes: falhas.map((falha) => falha.nome),
    // O alerta recebe daqui nome+log de cada falha: assim ele nao mantem a
    // propria copia da lista (a do YAML ficou sem o passo de fixtures).
    logs: falhas.map((falha) => ({ nome: falha.nome, log: falha.log })),
  };
}

function resultadoTexto(outcome) {
  if (outcome === 'success') return '✅';
  // '' = o passo nao existe no contexto do job: sem `id:` ou nao executou.
  return outcome === '' ? '❌ (ausente)' : `❌ (${outcome})`;
}

/** Linhas do Job Summary (E59) com a tabela e a saida dos passos que falharam. */
export function linhasResumo(resultado, lerLog = (caminho) => readFileSync(caminho, 'utf8')) {
  const linhas = [
    `## Contrato DB vivo — ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`,
    '',
    '| Passo | Resultado |',
    '|---|---|',
  ];
  for (const linha of resultado.tabela) {
    linhas.push(`| ${linha.nome} | ${resultadoTexto(linha.outcome)} |`);
  }
  if (resultado.falhas.length > 0) {
    linhas.push('', '### Saída (primeiras 20 linhas por passo)');
    for (const falha of resultado.falhas) {
      let conteudo;
      try {
        conteudo = lerLog(falha.log);
      } catch {
        continue; // passo que falhou antes de gravar log (ex.: id ausente)
      }
      linhas.push('', `#### \`${falha.nome}\``, '```', redigir(conteudo.split('\n').slice(0, 20).join('\n')), '```');
    }
  }
  return linhas;
}

/** Linhas para o $GITHUB_OUTPUT, no formato do sed do heredoc que saiu do YAML. */
export function linhasSaida(resultado) {
  if (resultado.falhas.length === 0) return ['causa=', 'falhas_lista='];
  return [
    `causa=${resultado.causa}`,
    `falhas_lista=${[...resultado.nomes].sort().join(',')}`,
    'logs_falhas<<EOF_LOGS_FALHAS_DB_LIVE_GUARD',
    JSON.stringify(resultado.logs),
    'EOF_LOGS_FALHAS_DB_LIVE_GUARD',
    'passos<<EOF_PASSOS_DB_LIVE_GUARD',
    ...resultado.nomes.map((nome) => `- ${nome}`),
    'EOF_PASSOS_DB_LIVE_GUARD',
  ];
}

/**
 * Executa o veredito sem tocar em processo/exit — e o que os testes chamam.
 * Devolve { codigo, resumo, saida, erro } para quem for escrever nos arquivos.
 */
export function executar({ stepsJson, lerLog } = {}) {
  let steps = null;
  try {
    steps = JSON.parse(stepsJson ?? 'null');
  } catch {
    steps = null;
  }
  if (!steps || typeof steps !== 'object' || Array.isArray(steps)) {
    const erro =
      '::error::db-live-guard: STEPS_JSON ausente ou invalido; sem o contexto dos passos o veredito do contrato vivo nao pode ser calculado.';
    return { codigo: 1, resumo: `## Contrato DB vivo — falha ao consolidar\n\n${erro}`, saida: 'causa=\nfalhas_lista=', erro };
  }
  const resultado = consolidar(steps);
  const falhou = resultado.falhas.length > 0;
  return {
    codigo: falhou ? 1 : 0,
    resumo: linhasResumo(resultado, lerLog).join('\n'),
    saida: linhasSaida(resultado).join('\n'),
    erro: falhou ? `::error::Contrato vivo quebrado em: ${resultado.nomes.join(', ')}` : '',
    resultado,
  };
}

export function main(env = process.env) {
  const saidaProcesso = executar({ stepsJson: env.STEPS_JSON });
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${saidaProcesso.resumo}\n`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${saidaProcesso.saida}\n`);
  if (saidaProcesso.erro) console.error(saidaProcesso.erro);
  else console.log('OK: todos os passos do contrato vivo passaram.');
  process.exitCode = saidaProcesso.codigo;
  return saidaProcesso;
}

const entrada = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entrada === fileURLToPath(import.meta.url)) main();
