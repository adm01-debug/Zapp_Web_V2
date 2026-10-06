#!/usr/bin/env node
// TC-013 (P2) — "Dois planos de finalizacao coexistem sem autoridade reconciliada e
// contem contratos divergentes".
//
// Duas fontes de finalizacao do Team Chat (F100 da PR1171 e TC-100 da PR1174, 114 s
// depois) coexistem sem autoridade reconciliada. Este guard le a reconciliacao
// (scripts/db-audit/team-chat-plan-authority.json) e falha quando ela nao existe, quando
// a cobertura dos 100 itens quebra, quando a publication deixa de cobrir os consumidores
// de realtime ou quando uma etapa marcada DO_NOT_REPLAY passa a ser segura (ou vice-versa).
//
// Nao acessa banco: os contratos de RPC que ele cita sao provados contra o PostgreSQL
// descartavel em team-chat-plan-authority.test.sh.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluateRealtimeSubscriptions } from './check-realtime-subscriptions.mjs';

const DEFAULT_MANIFEST = path.join('scripts', 'db-audit', 'team-chat-plan-authority.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function teamTables(baseline) {
  return baseline.tables.filter(table => table.startsWith('public.team_')).sort();
}

function guardFailure(guard, root) {
  if (!guard || typeof guard !== 'object') return 'guard sem objeto de checagem';
  switch (guard.kind) {
    case 'migration_files_present': {
      const dir = path.join(root, guard.dir);
      const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
      const missing = (guard.versions || []).filter(version => !files.some(name => name.startsWith(`${version}_`) || name === `${version}.sql`));
      return missing.length ? `migrations ausentes: ${missing.join(',')}` : null;
    }
    case 'src_reference': {
      const file = path.join(root, guard.file);
      if (!fs.existsSync(file)) return `arquivo ausente: ${guard.file}`;
      return fs.readFileSync(file, 'utf8').includes(guard.token) ? null : `token nao encontrado em ${guard.file}: ${guard.token}`;
    }
    case 'baseline_table': {
      const baseline = readJson(path.join(root, 'scripts', 'db-audit', 'realtime-publication-baseline.json'));
      return baseline.tables.includes(guard.table) ? null : `tabela fora do baseline canonico: ${guard.table}`;
    }
    default:
      return `tipo de guard desconhecido: ${guard.kind}`;
  }
}

export function evaluateTeamChatPlanAuthority({
  root = process.cwd(),
  manifestPath = process.env.TEAM_CHAT_AUTHORITY_MANIFEST || DEFAULT_MANIFEST,
  subscriptions = null,
} = {}) {
  const failures = [];
  const info = [];
  const full = path.isAbsolute(manifestPath) ? manifestPath : path.join(root, manifestPath);

  if (!fs.existsSync(full)) {
    failures.push(`sem autoridade reconciliada: ${manifestPath} nao existe (os dois planos de finalizacao coexistem — TC-013)`);
    return { ok: false, failures, info };
  }
  let manifest;
  try {
    manifest = readJson(full);
  } catch (error) {
    failures.push(`manifesto de autoridade invalido: ${error.message}`);
    return { ok: false, failures, info };
  }

  // 1) Um unico ledger vivo; a outra fonte retida e preservada (nada apagado).
  const ledgers = Array.isArray(manifest.live_ledger) ? manifest.live_ledger : [];
  if (ledgers.length !== 1) {
    failures.push(`autoridade nao reconciliada: ${ledgers.length} ledgers vivos declarados (esperado exatamente 1)`);
  }
  for (const ledger of ledgers) {
    if (!fs.existsSync(path.join(root, ledger.path))) failures.push(`ledger vivo declarado nao existe: ${ledger.path}`);
  }
  const retained = Array.isArray(manifest.retained_for_lineage) ? manifest.retained_for_lineage : [];
  if (retained.length === 0) failures.push('nenhuma linhagem retida: o outro plano precisa ser preservado explicitamente');
  for (const entry of retained) {
    if (!fs.existsSync(path.join(root, entry.path))) failures.push(`linhagem declarada nao existe: ${entry.path}`);
  }
  info.push(`ledger vivo: ${ledgers.map(l => `${l.prefix}${path.basename(l.path)}`).join(', ') || 'nenhum'}; linhagem retida: ${retained.map(r => r.prefix).join(',')}`);

  // 2) Todos os 100 itens com status, origem, evidencia e pendencia (via crosswalk + plano vivo).
  const crosswalkFile = path.join(root, manifest.items_source || '');
  if (!manifest.items_source || !fs.existsSync(crosswalkFile)) {
    failures.push(`crosswalk dos itens ausente: ${manifest.items_source}`);
  } else {
    const mapping = readJson(crosswalkFile).mapping || [];
    if (mapping.length !== 100) failures.push(`itens cobertos: ${mapping.length} (esperado 100)`);
    const seen = new Set();
    const livePath = ledgers[0] ? path.join(root, ledgers[0].path) : null;
    const liveLines = livePath && fs.existsSync(livePath) ? fs.readFileSync(livePath, 'utf8').split(/\r?\n/) : [];
    for (const item of mapping) {
      const id = item.tc_step;
      if (!id) { failures.push('item sem id (tc_step)'); continue; }
      if (seen.has(id)) failures.push(`item duplicado no crosswalk: ${id}`);
      seen.add(id);
      if (!item.tc_status) failures.push(`item ${id} sem status`);
      if (!item.related_f_steps || item.related_f_steps.length === 0) failures.push(`item ${id} sem origem`);
      if (!item.tc_source_line) { failures.push(`item ${id} sem linha de evidencia`); continue; }
      const line = liveLines[item.tc_source_line - 1];
      if (!line || !line.includes(`**${id}**`)) failures.push(`evidencia de ${id} nao bate: linha ${item.tc_source_line} do ledger vivo nao contem **${id}**`);
    }
    for (let i = 1; i <= 100; i += 1) {
      const id = `TC-${String(i).padStart(2, '0')}`;
      if (!seen.has(id)) failures.push(`item ausente na reconciliacao: ${id}`);
    }
    info.push(`itens: ${mapping.length} com status/origem/evidencia`);
  }

  // 3) As 7 divergencias F/TC precisam de decisao registrada.
  const conflictsFile = path.join(root, manifest.conflicts_source || '');
  if (!manifest.conflicts_source || !fs.existsSync(conflictsFile)) {
    failures.push(`fonte das divergencias ausente: ${manifest.conflicts_source}`);
  } else {
    const conflictIds = (readJson(conflictsFile).conflicts || []).map(c => c.id);
    const resolved = new Set((manifest.contract_resolutions || []).map(r => r.id));
    const open = conflictIds.filter(id => !resolved.has(id));
    if (open.length) failures.push(`divergencias sem decisao registrada: ${open.join(', ')}`);
    info.push(`divergencias resolvidas: ${resolved.size}/${conflictIds.length}`);
  }

  // 4) Publication tem de cobrir os consumidores de realtime (src) e casar com o baseline.
  const baselineFile = path.join(root, manifest.publication_decision?.baseline || path.join('scripts', 'db-audit', 'realtime-publication-baseline.json'));
  if (!fs.existsSync(baselineFile)) {
    failures.push(`baseline de publication ausente: ${manifest.publication_decision?.baseline}`);
  } else {
    const baseline = readJson(baselineFile);
    const declared = (manifest.publication_decision?.tables || []).slice().sort();
    const canonical = teamTables(baseline);
    if (JSON.stringify(declared) !== JSON.stringify(canonical)) {
      failures.push(`publication declarada != baseline canonico (declarado=${declared.length}, canonico=${canonical.length})`);
    }
    const subs = subscriptions || evaluateRealtimeSubscriptions(path.join(root, 'src'));
    if (subs.unresolved.length) failures.push(`subscricao de realtime nao resolvida em src: ${subs.unresolved.length}`);
    if (subs.absentFromPublication.length) failures.push(`consumidor de realtime fora da publication: ${subs.absentFromPublication.join(',')}`);
    const teamConsumers = subs.subscriptions.filter(table => table.startsWith('public.team_'));
    const uncovered = teamConsumers.filter(table => !baseline.tables.includes(table));
    if (uncovered.length) failures.push(`consumidor de Team Chat fora do baseline: ${uncovered.join(',')}`);
    info.push(`consumidores de Team Chat cobertos: ${teamConsumers.length}; tabelas de Team Chat no baseline: ${canonical.length}`);
  }

  // 5) Guardas de DO_NOT_REPLAY e das acoes externas fechadas: se a guarda deixar de valer,
  //    a reconciliacao esta velha e o guard falha (nunca passa em silencio).
  for (const entry of manifest.do_not_replay || []) {
    const bad = guardFailure(entry.guard, root);
    if (bad) failures.push(`DO_NOT_REPLAY ${ (entry.steps || []).join('/') } desatualizado: ${bad}`);
  }
  for (const entry of manifest.closed_external_actions || []) {
    const bad = guardFailure(entry.closed_evidence, root);
    if (bad) failures.push(`acao externa fechada ${ (entry.steps || []).join('/') } sem evidencia: ${bad}`);
  }

  return { ok: failures.length === 0, failures, info };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = evaluateTeamChatPlanAuthority();
  for (const line of result.info) console.log(`[info] ${line}`);
  if (!result.ok) {
    for (const failure of result.failures) console.error(`[FAIL] ${failure}`);
    console.error(`[FAIL] autoridade dos planos de finalizacao do Team Chat NAO reconciliada (${result.failures.length} problema(s))`);
    process.exitCode = 1;
  } else {
    console.log('[OK] TC-013: autoridade reconciliada (1 ledger vivo + linhagem), 100 itens cobertos, publication cobre os consumidores e etapas historicas em DO_NOT_REPLAY.');
  }
}
