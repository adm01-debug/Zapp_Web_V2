#!/usr/bin/env node
/**
 * GA23 — Gate 1b do types-sync: suprime a issue SOMENTE quando a falha de
 * TypeScript e explicada pelas versions pendentes de apply E a pendencia
 * tem ate 24 h (lote recem-mergeado, apply no ciclo do dia).
 *
 * ANTES: qualquer `lote-pendente.mjs` com exit 2 marcava awaiting_apply=true,
 * mesmo quando o erro de tsc nada tinha a ver com o lote (W23 valia para
 * qualquer pendencia, sem limite de tempo).
 *
 * Entradas:
 *   --tsc-log libertado pelo Gate 1 (/tmp/tsc.log)
 *   --pending lista de versions pendentes, uma por linha (/tmp/pending-versions.txt)
 *   --migrations-dir supabase/migrations
 *   --head-ct / --head-files: sobrepoe o git (só para teste offline)
 *
 * Saida: escreve `awaiting_apply=true|false` no GITHUB_OUTPUT (e imprime).
 * Exit 0 = decisao tomada; exit 2 = erro de entrada (fail-closed no workflow).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { identificadoresDoTsc, mencionado } from './drift-explicado.mjs';

const LIMITE_HORAS = 24;

function arg(nome) {
  const i = process.argv.indexOf('--' + nome);
  if (i === -1 || i + 1 >= process.argv.length) return null;
  return process.argv[i + 1];
}

function git(campo) {
  try {
    if (campo === 'ct') return Number(execFileSync('git', ['show', '-s', '--format=%ct', 'HEAD'], { encoding: 'utf8' }).trim());
    return execFileSync('git', ['show', '--name-only', '--pretty=format:', 'HEAD'], { encoding: 'utf8' });
  } catch {
    return campo === 'ct' ? NaN : '';
  }
}

function decidir({ tscTexto, pendentes, dir, headCt, headArquivos, agora }) {
  if (pendentes.length === 0) return { awaiting: false, motivo: 'sem versions pendentes' };
  const idadeH = (agora - headCt) / 3600;
  if (!Number.isFinite(idadeH) || idadeH < 0) return { awaiting: false, motivo: 'idade do HEAD indeterminada' };
  const loteNoHead = pendentes.some((v) => headArquivos.split('\n').some((f) => f.includes(v)));
  if (!(idadeH <= LIMITE_HORAS && loteNoHead)) {
    return { awaiting: false, motivo: 'pendencia stale (HEAD ha ' + idadeH.toFixed(1) + ' h ou lote fora do HEAD)' };
  }
  const ids = identificadoresDoTsc(tscTexto);
  if (ids.length === 0) return { awaiting: false, motivo: 'nenhum identificador no log do tsc' };
  const sqls = pendentes.map((v) => {
    const arq = fs.readdirSync(dir).find((f) => f.startsWith(v) && f.endsWith('.sql'));
    return arq ? fs.readFileSync(path.join(dir, arq), 'utf8') : '';
  });
  const fora = ids.filter((id) => !sqls.some((sql) => sql && mencionado(id, sql)));
  if (fora.length > 0) return { awaiting: false, motivo: 'tsc cita objetos fora do lote: ' + fora.join(', ') };
  return { awaiting: true, motivo: ids.length + ' identificador(es) do tsc explicados pelo lote' };
}

if (process.argv[1] && process.argv[1].endsWith('gate1-pendente.mjs')) {
  const tscLog = arg('tsc-log');
  const pendFile = arg('pending');
  const dir = arg('migrations-dir') || path.join(process.cwd(), 'supabase/migrations');
  if (!tscLog || !pendFile) {
    console.error('ERRO: informe --tsc-log e --pending.');
    process.exit(2);
  }
  if (!fs.existsSync(tscLog) || !fs.existsSync(pendFile) || !fs.existsSync(dir)) {
    console.error('ERRO: entrada ausente (log, pendentes ou migrations).');
    process.exit(2);
  }
  const headCt = arg('head-ct') !== null ? Number(arg('head-ct')) : git('ct');
  const headArquivos = arg('head-files') !== null ? String(arg('head-files')).split(',').join('\n') : git('files');
  const { awaiting, motivo } = decidir({
    tscTexto: fs.readFileSync(tscLog, 'utf8'),
    pendentes: fs.readFileSync(pendFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean),
    dir,
    headCt,
    headArquivos,
    agora: Date.now() / 1000,
  });
  console.log('awaiting_apply=' + awaiting + ' (' + motivo + ')');
  const saida = process.env.GITHUB_OUTPUT;
  if (saida) fs.appendFileSync(saida, 'awaiting_apply=' + awaiting + '\n');
  // Exit sempre 0: e uma decisao (suprime ou nao), nao um erro.
}
