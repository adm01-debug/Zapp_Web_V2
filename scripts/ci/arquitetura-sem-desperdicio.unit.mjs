/**
 * Contratos da arquitetura sem desperdício (docs/ci/ARQUITETURA_SEM_DESPERDICIO.md).
 *
 * Cada regra nasceu de um desperdício MEDIDO em 15/10/2026 (100 runs de CI em ~36 h,
 * ~1.000 min). Este arquivo existe para que a volta de qualquer um deles quebre o
 * check obrigatório "Lint & TypeCheck" em vez de passar despercebida.
 *
 *   R1  fila serial: o auto-update atualiza no máximo UMA PR por execução.
 *   R2  reuso de árvore: no push da main, nenhum job pesado roda se a árvore já
 *       foi aprovada na PR (8 de 9 pushes repetiam a mesma árvore).
 *   R3  a suíte de unidade roda uma vez: cobertura sai dos shards, nunca de uma
 *       segunda rodada (14 min em série na main).
 *   R4  nada espera o que não consome: o Build não depende dos testes.
 *   R5  run cancelado não pinta check obrigatório de vermelho (!cancelled(), não always()).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ler = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const CI = ler('.github/workflows/ci.yml');
const DB_GUARD = ler('.github/workflows/db-guard.yml');
let AUTO_UPDATE = '';
try { AUTO_UPDATE = ler('.github/workflows/auto-update-pr-branch.yml'); } catch {}
const VITEST = ler('vitest.config.ts');
const semComentarios = (t) => t.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

/** Jobs do workflow: { id: { bloco, needs: string[], if: string|null } }. */
function jobs(texto) {
  const corpo = texto.slice(texto.indexOf('\njobs:\n') + 7);
  const partes = corpo.split(/\n(?=  [A-Za-z0-9_-]+:\s*$)/m);
  const saida = {};
  for (const parte of partes) {
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/m.exec(parte);
    if (!m) continue;
    // Leitura por linha, sem regex com backtracking: valor = texto após "chave:",
    // sem o comentário final (" # ...").
    const valor = (chave) => {
      const linha = parte.split('\n').find((l) => l.startsWith(`    ${chave}:`));
      if (!linha) return null;
      const bruto = linha.slice(`    ${chave}:`.length);
      const comentario = bruto.indexOf(' #');
      return (comentario >= 0 ? bruto.slice(0, comentario) : bruto).trim();
    };
    const needsBruto = valor('needs');
    const needs = needsBruto ? needsBruto.replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean) : [];
    saida[m[1]] = { bloco: parte, needs, if: valor('if') };
  }
  return saida;
}

const JOBS_CI = jobs(CI);
const JOBS_DB = jobs(DB_GUARD);
