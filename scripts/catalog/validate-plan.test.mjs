import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./validate-plan.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '../..');

function executar(argumento) {
  const args = argumento === undefined ? [SCRIPT] : [SCRIPT, argumento];
  return spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
}

/**
 * Plano sintetico minimamente valido: 100 etapas (E01..E100), cada uma com 10
 * sub-etapas numeradas, `**Objetivo:**` e um checklist de 3 itens. Cada etapa
 * recebe uma mistura de itens pendentes (`[ ]`), concluidos minusculo (`[x]`) e
 * concluidos maiusculo (`[X]`), para provar que o estado de conclusao nao altera
 * a contagem estrutural do checklist (defeito OTH-011).
 */
function planoComChecklistMisto() {
  const blocos = [];
  for (let n = 1; n <= 100; n++) {
    const id = String(n).padStart(2, '0');
    const linhas = [`### E${id} · Etapa ${id}`, '**Objetivo:** objetivo sintetico'];
    for (let i = 1; i <= 10; i++) linhas.push(`${i}. sub-etapa ${i} da etapa ${id}`);
    linhas.push('**Checklist**');
    linhas.push('- [ ] item pendente da etapa ' + id);
    linhas.push('- [x] item concluido da etapa ' + id);
    linhas.push('- [X] item concluido maiusculo da etapa ' + id);
    blocos.push(linhas.join('\n'));
  }
  return blocos.join('\n\n') + '\n';
}

test('rejeita caminho relativo que escapa do repositorio', () => {
  const result = executar('../../../../etc/passwd');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fora das raizes permitidas/);
});

test('rejeita caminho absoluto fora do repositorio e do temporario', () => {
  const fora = path.resolve(ROOT, '..', '..', 'fora-da-raiz.json');
  const result = executar(fora);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fora das raizes permitidas/);
});

test('aceita o caminho default do plano dentro do repositorio', () => {
  // O plano pode estar valido ou nao (divida conhecida do E54); o que este caso
  // garante e que o caminho default do repositorio nao e barrado pela guarda.
  const result = executar();
  assert.doesNotMatch(result.stderr, /fora das raizes permitidas/);
});

test('aceita plano valido cujo checklist mistura [ ], [x] e [X]', () => {
  // OTH-011: o total do checklist deve contar itens marcados E nao marcados.
  // Com o parser antigo (so `- [ ]`) cada etapa tinha 1 item contado e o plano
  // inteiro era rejeitado ("checklist com 1 itens").
  const dir = mkdtempSync(path.join(os.tmpdir(), 'validate-plan-'));
  const arquivo = path.join(dir, 'PLANO_MISTO.md');
  try {
    writeFileSync(arquivo, planoComChecklistMisto(), 'utf8');
    const result = executar(arquivo);
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.match(result.stdout, /OK: 100 etapas/);
    assert.doesNotMatch(result.stderr, /checklist com/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
