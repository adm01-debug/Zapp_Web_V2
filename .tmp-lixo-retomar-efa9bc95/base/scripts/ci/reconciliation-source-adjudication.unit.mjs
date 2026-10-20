#!/usr/bin/env node
// R2-GOV-001 / item 305 — duas fontes catalogadas (prompts do Lovable) declaram
// tarefas explícitas ("### TAREFA n") mas ficaram catalogadas como SUPPORTING_DOCUMENT
// e sem adjudicação no registro de planos. Parte dos requisitos já vive em consumidores
// atuais; parte existe em componentes substituídos. O registro precisa dizer isso
// explicitamente, sem fabricar trabalho novo.
//
// Este portão trava duas pontas ao mesmo tempo:
//   (a) o papel da fonte no SOURCE_CATALOG (deixa de ser documento de apoio);
//   (b) a adjudicação correspondente em PLAN_REGISTRY.source_adjudications,
//       apontando para a comparação real e sem acrescentar tarefas ao ledger.
//
// Uma fonte com tarefas explícitas só é aceita se (i) resolve para um plano do
// registro, (ii) está adjudicada em source_adjudications, ou (iii) já carrega um
// papel que expressamente a declara fora do conjunto de planos.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ler = (rel) => JSON.parse(readFileSync(path.join(raiz, rel), 'utf8'));
const texto = (rel) => readFileSync(path.join(raiz, rel), 'utf8');

const catalogo = ler('docs/reconciliation/SOURCE_CATALOG.json');
const registro = ler('docs/reconciliation/PLAN_REGISTRY.json');
const adjudicacoes = registro.source_adjudications ?? [];

// Cabeçalho de tarefa explícita: "### TAREFA 1 — ..." / "#### TAREFA 10 — ...".
const CABECALHO = /^#{1,6}[^\S\n]+TAREFA[^\S\n]+\d+\b/gm;
// Papel que já declara, por si, que a fonte não é um plano adicional.
const PAPEIS_QUE_ADJUDICAM = new Set(['EVIDENCE_OR_HANDOFF_NOT_AN_ADDITIONAL_PLAN']);

const contarCabecalhos = (rel) => (texto(rel).match(CABECALHO) ?? []).length;

const fontesComTarefasExplicitas = () => catalogo.markdown_sources
  .filter((fonte) => existsSync(path.join(raiz, fonte.path)) && contarCabecalhos(fonte.path) > 0);

test('toda fonte catalogada com tarefas explícitas está adjudicada', () => {
  const fontes = fontesComTarefasExplicitas();
  assert.ok(
    fontes.length >= 2,
    'detector não encontrou fontes com "### TAREFA n" — o teste perdeu o alvo',
  );
  const idsDePlano = new Set(registro.plans.map((plano) => plano.record_id));
  const adjudicadas = new Set(adjudicacoes.map((entrada) => entrada.path));
  const semAdjudicacao = fontes
    .filter((fonte) => !idsDePlano.has(fonte.plan_id)
      && !adjudicadas.has(fonte.path)
      && !PAPEIS_QUE_ADJUDICAM.has(fonte.role))
    .map((fonte) => `${fonte.path} (role=${fonte.role}, plan_id=${fonte.plan_id ?? 'null'})`);
  assert.deepEqual(
    semAdjudicacao,
    [],
    `fontes com tarefas explícitas sem adjudicação no registro de planos:\n${semAdjudicacao.join('\n')}`,
  );
});

test('fonte adjudicada deixa de ficar catalogada como documento de apoio', () => {
  const porCaminho = new Map(catalogo.markdown_sources.map((fonte) => [fonte.path, fonte]));
  for (const entrada of adjudicacoes) {
    const fonte = porCaminho.get(entrada.path);
    assert.ok(fonte, `${entrada.path} está adjudicada mas não existe no SOURCE_CATALOG`);
    assert.notEqual(
      fonte.role,
      'SUPPORTING_DOCUMENT',
      `${entrada.path} tem tarefas explícitas mas segue como SUPPORTING_DOCUMENT`,
    );
    assert.equal(fonte.role, entrada.role, `papel divergente entre catálogo e adjudicação: ${entrada.path}`);
  }
});

test('a adjudicação aponta para comparação existente e não fabrica tarefas novas', () => {
  assert.ok(adjudicacoes.length > 0, 'PLAN_REGISTRY.source_adjudications está vazio');
  for (const entrada of adjudicacoes) {
    assert.ok(
      Number.isInteger(entrada.task_headings) && entrada.task_headings > 0,
      `${entrada.path} sem contagem de tarefas explícitas`,
    );
    assert.equal(entrada.new_tasks_added_to_ledger, 0, `${entrada.path} não pode acrescentar tarefas ao ledger`);
    assert.equal(entrada.automatic_execution_authorized, false, `${entrada.path} não autoriza execução automática`);
    const ref = path.join(raiz, 'docs/reconciliation', entrada.adjudication_ref);
    assert.ok(existsSync(ref), `artefato de adjudicação ausente para ${entrada.path}: ${entrada.adjudication_ref}`);
    const artefato = JSON.parse(readFileSync(ref, 'utf8'));
    const ids = new Set((artefato.tasks ?? []).map((tarefa) => tarefa.id));
    assert.ok(ids.size > 0, `artefato de adjudicação sem tarefas: ${entrada.adjudication_ref}`);
    assert.equal(
      entrada.requirement_ids?.length,
      entrada.task_headings,
      `${entrada.path} declara ${entrada.task_headings} tarefas e lista ${entrada.requirement_ids?.length ?? 0}`,
    );
    for (const id of entrada.requirement_ids) {
      assert.ok(ids.has(id), `${entrada.path}: ${id} ausente no artefato de adjudicação`);
    }
  }
});

test('o número de cabeçalhos declarado casa com o texto da fonte', () => {
  for (const entrada of adjudicacoes) {
    assert.equal(
      contarCabecalhos(entrada.path),
      entrada.task_headings,
      `${entrada.path}: adjudicação declara ${entrada.task_headings} tarefas explícitas e o texto tem outro número`,
    );
  }
});
