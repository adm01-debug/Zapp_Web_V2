#!/usr/bin/env node
/**
 * v4-status.mjs — placar automático do plano V4 do Talk X (etapa X002).
 *
 * Lê as etapas em docs/talkx/v4/etapas.json (campo `fecha`, o formato de máquina
 * designado "Base do placar" em v4/README.md), lê os elementos do mock em
 * docs/talkx/v4/inventario/*.md (IDs `T<tela>-<seq>` e estado inicial `Hoje`),
 * descobre as etapas concluídas pelos commits em `origin/main` cujo título contém
 * `(X<NNN>)` e gera docs/talkx/v4/STATUS.md.
 *
 *   node scripts/talkx/v4-status.mjs                # gera STATUS.md
 *   node scripts/talkx/v4-status.mjs --check        # falha se STATUS.md divergir
 *   node scripts/talkx/v4-status.mjs --ref <ref>    # usa outra ref (padrão origin/main)
 *
 * Um elemento só conta como fechado quando o `Hoje` é `OK` OU todas as etapas que o
 * citam em `fecha` estão concluídas.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolverExecutavel } from '../lib/seguranca-processo.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..', '..');
const ETAPAS_JSON = join(ROOT, 'docs/talkx/v4/etapas.json');
const INVENTARIO_DIR = join(ROOT, 'docs/talkx/v4/inventario');
const STATUS_PATH = join(ROOT, 'docs/talkx/v4/STATUS.md');

/**
 * Fachada fina sobre o módulo compartilhado: caminho ABSOLUTO do `git`, resolvido
 * pelo PATH do processo pai — o mesmo binário que o shell usaria (no workspace, o
 * shim de guarda). O filho recebe um caminho absoluto, então não procura o binário
 * no PATH: é o que a regra S4036 exige.
 */
export const resolveGit = () => resolverExecutavel('git');

const FASE_NAMES = {
  0: 'Régua e governança',
  1: 'Correções imediatas',
  2: 'Motor seguro para o primeiro disparo',
  3: 'Integridade, observabilidade e ensaio real',
  4: 'Dados comerciais e vínculo com o CRM',
  5: 'Kit, estados, modais e navegação',
  6: 'Capacidades novas do motor e agregações',
  7: 'Visão geral',
  8: 'Templates',
  9: 'Segmentos',
  10: 'Criar, revisar e agendar campanha',
  11: 'Acompanhar campanha',
  12: 'Relatório',
  13: 'Importação e vínculo com o CRM',
  14: 'Supressão e Analytics',
  15: 'Ajuda',
  16: 'Qualidade e release',
};

const TELA_NAMES = {
  '01': 'Campanhas · visão geral',
  '02': 'Segmentos · biblioteca e detalhes',
  '03': 'Segmentos · criar e editar',
  '04': 'Templates · biblioteca',
  '05': 'Templates · criar e editar',
  '06': 'Lista de supressão',
  '07': 'Analytics',
  '08': 'Nova campanha',
  '09': 'Revisão final e confirmação',
  10: 'Campanha agendada',
  11: 'Monitor ao vivo',
  12: 'Campanha em andamento',
  13: 'Campanha pausada e retomada',
  14: 'Relatório de campanha concluída',
  15: 'Importação e vinculação CRM 360°',
  16: 'Ajuda do Talk X',
  17: 'Estados do sistema e modais',
};

/** Carrega as 200 etapas de etapas.json: [{id, fase, titulo, fecha[]}]. */
export function loadEtapas(jsonPath = ETAPAS_JSON) {
  const raw = readFileSync(jsonPath, 'utf8');
  const list = JSON.parse(raw);
  if (!Array.isArray(list)) throw new Error('etapas.json não é uma lista');
  for (const e of list) {
    if (!/^X\d{3}$/.test(e.id)) throw new Error(`id de etapa inválido: ${e.id}`);
  }
  return list;
}

/** Carrega os elementos `T<tela>-<seq>` dos inventários A–G: [{id, tela, hoje}]. */
export function loadElementos(invDir = INVENTARIO_DIR) {
  const files = readdirSync(invDir)
    .filter((f) => /^[A-G]_.*\.md$/.test(f))
    .sort();
  const elementos = [];
  const seen = new Set();
  for (const f of files) {
    const text = readFileSync(join(invDir, f), 'utf8');
    for (const line of text.split('\n')) {
      if (!line.startsWith('|')) continue;
      // `\|` é pipe literal (escape markdown) dentro de uma célula — mascarar antes de dividir.
      const cols = line.replace(/\\\|/g, '\u0001').split('|').map((s) => s.trim());
      const id = cols[1];
      const hoje = cols[5];
      if (!/^T\d{2}-\d{3}$/.test(id)) continue;
      if (!/^(OK|PARCIAL|AUSENTE|FALSO)$/.test(hoje)) {
        throw new Error(`estado inesperado no inventário ${f}: ${id} → "${hoje}"`);
      }
      if (seen.has(id)) throw new Error(`elemento duplicado no inventário: ${id}`);
      seen.add(id);
      elementos.push({ id, tela: id.slice(1, 3), hoje });
    }
  }
  return elementos;
}

/**
 * Extrai os ids de etapa (`X<NNN>`) de uma lista de títulos de commit.
 * Lança `etapa inexistente: X<NNN>` se o título referencia uma etapa desconhecida.
 */
export function extractStepIds(titles, knownIds) {
  const done = new Set();
  for (const title of titles) {
    // Só contam commits com escopo `talkx` no conventional commit (ex.:
    // `feat(talkx): ... (X016)`). Falso positivo real: `fix(ci): ... (X028)` —
    // um commit de CI que cita um id X<NNN> de OUTRO plano, mas não é etapa
    // do Talk X. Sem este filtro o placar infla (X028 fantasma).
    if (!/^[a-z]+\(talkx\):/.test(title)) continue;
    for (const m of title.matchAll(/\(X(\d{3})\)/g)) {
      const id = `X${m[1]}`;
      if (!knownIds.has(id)) throw new Error(`etapa inexistente: ${id}`);
      done.add(id);
    }
  }
  return done;
}

/** Devolve as linhas de `git log --format=%s <ref>` (uma por commit). */
export function gitLogTitles(ref, cwd = ROOT) {
  const out = execFileSync(resolveGit(), ['log', '--format=%s', ref], {
    encoding: 'utf8',
    cwd,
    maxBuffer: 64 * 1024 * 1024,
    // Sem `env`: o filho herda o ambiente do pai (inclusive o PATH), preservando
    // exatamente o binário resolvido acima — o S4036 já é atendido pelo caminho absoluto.
  });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

/** Etapas concluídas = ids extraídos dos commits em `ref` (padrão origin/main). */
export function detectDoneSteps(ref, knownIds, cwd = ROOT) {
  return extractStepIds(gitLogTitles(ref, cwd), knownIds);
}

/** Calcula o status: etapas concluídas por fase e elementos fechados por tela. */
export function computeStatus(etapas, elementos, doneSet) {
  // elemento -> conjunto de etapas que o citam em `fecha`.
  const citing = new Map();
  for (const e of etapas) {
    for (const fid of e.fecha || []) {
      if (!/^T\d{2}-\d{3}$/.test(fid)) continue; // só elementos do mock são por tela
      if (!citing.has(fid)) citing.set(fid, new Set());
      citing.get(fid).add(e.id);
    }
  }

  let doneCount = 0;
  const fases = new Map();
  for (const e of etapas) {
    const concluida = doneSet.has(e.id);
    if (concluida) doneCount++;
    if (!fases.has(e.fase)) fases.set(e.fase, { total: 0, concluidas: 0 });
    const f = fases.get(e.fase);
    f.total++;
    if (concluida) f.concluidas++;
  }

  let fechadosTotal = 0;
  let elementosTotal = 0;
  const telas = new Map();
  for (const el of elementos) {
    const c = citing.get(el.id) || new Set();
    // "fechado" exige OU Hoje=OK (já pronto) OU ao menos uma etapa que o cita E todas concluídas.
    // Elemento sem etapa citante e Hoje≠OK (os 20 "excluídos") nunca conta como fechado.
    const fechado = el.hoje === 'OK' || (c.size > 0 && [...c].every((id) => doneSet.has(id)));
    if (!telas.has(el.tela)) telas.set(el.tela, { total: 0, fechados: 0 });
    const t = telas.get(el.tela);
    t.total++;
    if (fechado) t.fechados++;
    elementosTotal++;
    if (fechado) fechadosTotal++;
  }

  return { etapas, doneCount, fases, telas, fechadosTotal, elementosTotal };
}

/** Gera o markdown determinístico do STATUS.md (sem timestamps voláteis). */
export function generateMarkdown(status) {
  const L = [];
  L.push('# STATUS — Talk X · Plano V4 (placar)');
  L.push('');
  L.push('> Gerado por `scripts/talkx/v4-status.mjs`. Não editar à mão — o CI confere com `--check`.');
  L.push('> Etapas concluídas = commits em `origin/main` cujo título contém `(X<NNN>)`.');
  L.push('');
  L.push('## Etapas concluídas');
  L.push('');
  L.push(`**${status.doneCount} de ${status.etapas.length}** concluídas.`);
  L.push('');
  L.push('| Fase | Concluídas | Total |');
  L.push('|---|---|---|');
  for (let f = 0; f <= 16; f++) {
    const fs = status.fases.get(f) || { total: 0, concluidas: 0 };
    L.push(`| ${f} · ${FASE_NAMES[f]} | ${fs.concluidas} | ${fs.total} |`);
  }
  L.push('');
  L.push('## Elementos do mock por tela');
  L.push('');
  L.push(`**${status.fechadosTotal} de ${status.elementosTotal}** elementos fechados.`);
  L.push('');
  L.push('| Tela | Fechados | Total |');
  L.push('|---|---|---|');
  for (let t = 1; t <= 17; t++) {
    const key = String(t).padStart(2, '0');
    const ts = status.telas.get(key) || { total: 0, fechados: 0 };
    L.push(`| ${key} · ${TELA_NAMES[key]} | ${ts.fechados} | ${ts.total} |`);
  }
  L.push('');
  return L.join('\n');
}

export function main(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const refIdx = argv.indexOf('--ref');
  const ref = refIdx >= 0 ? argv[refIdx + 1] : 'origin/main';

  const etapas = loadEtapas();
  const elementos = loadElementos();
  const knownIds = new Set(etapas.map((e) => e.id));
  const doneSet = detectDoneSteps(ref, knownIds);
  const status = computeStatus(etapas, elementos, doneSet);
  const md = generateMarkdown(status);

  if (check) {
    const committed = readFileSync(STATUS_PATH, 'utf8');
    if (committed !== md) {
      process.stderr.write(
        'STATUS.md divergente do gerado. Rode `node scripts/talkx/v4-status.mjs` para regenerar.\n',
      );
      process.exit(1);
    }
    process.stdout.write(
      `STATUS.md confere: ${status.doneCount}/200 etapas, ${status.fechadosTotal}/${status.elementosTotal} elementos.\n`,
    );
    return;
  }

  writeFileSync(STATUS_PATH, md);
  process.stdout.write(
    `STATUS.md gerado: ${status.doneCount}/200 etapas, ${status.fechadosTotal}/${status.elementosTotal} elementos.\n`,
  );
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
