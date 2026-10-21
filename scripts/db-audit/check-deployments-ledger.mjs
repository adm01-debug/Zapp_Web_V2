#!/usr/bin/env node
/**
 * GA25 — detector de DDL fora do fluxo.
 *
 * Regra (plano de 15/10/2026): toda version nova no ledger precisa de um
 * Deployment `producao-ddl` registrado pelo db-migrate (o job de apply passa
 * a registrar; ver db-migrate.yml). O guarda vivo acusa version sem
 * Deployment desde 16/10/2026. Motivo: a version 20261015200000 foi aplicada
 * por fora em 15/10 (2o caso) — anterior ao corte, documentada, nao acusada.
 *
 * Entradas (arquivos, para rodar offline e com fixture):
 *   --ledger versions.json (array de strings "YYYYMMDDHHMMSS")
 *   --deployments deployments.json (array da API {environment, payload})
 *   --since 20261016000000
 *   --environment producao-ddl
 *
 * Saida: exit 0 = tudo registrado; exit 1 = version sem Deployment (lista);
 * exit 2 = erro de entrada.
 */

import fs from 'node:fs';

function arg(nome) {
  const i = process.argv.indexOf('--' + nome);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

function lerJson(arquivo, rotulo) {
  if (!fs.existsSync(arquivo)) {
    console.error('ERRO: ' + rotulo + ' nao encontrado: ' + arquivo);
    process.exit(2);
  }
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch (error) {
    console.error('ERRO: ' + rotulo + ' invalido (' + arquivo + '): ' + error.message);
    process.exit(2);
  }
}

export function versoesSemDeployment({ ledger, deployments, since, environment }) {
  const registradas = new Set();
  for (const d of deployments) {
    if (d.environment !== environment) continue;
    const lista = d?.payload?.versions;
    if (Array.isArray(lista)) for (const v of lista) registradas.add(String(v));
  }
  return ledger.map(String).filter((v) => v >= since && !registradas.has(v));
}

if (process.argv[1] && process.argv[1].endsWith('check-deployments-ledger.mjs')) {
  const ledger = lerJson(arg('ledger'), 'ledger');
  const deployments = lerJson(arg('deployments'), 'deployments');
  const since = arg('since') || '20261016000000';
  const environment = arg('environment') || 'producao-ddl';
  if (!Array.isArray(ledger) || !Array.isArray(deployments) || !/^\d{14}$/.test(since)) {
    console.error('ERRO: entradas invalidas (ledger/deployments devem ser arrays, since 14 digitos).');
    process.exit(2);
  }
  const faltando = versoesSemDeployment({ ledger, deployments, since, environment });
  if (faltando.length > 0) {
    console.error('DDL FORA DO FLUXO: ' + faltando.length + ' version(s) no ledger sem Deployment ' + environment + ':');
    for (const v of faltando) console.error('  - ' + v);
    process.exit(1);
  }
  console.log('OK: ' + ledger.filter((v) => String(v) >= since).length + ' version(s) desde ' + since + ' com Deployment ' + environment + '.');
}
