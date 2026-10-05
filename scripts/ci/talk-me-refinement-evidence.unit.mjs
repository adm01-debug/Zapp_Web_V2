import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const report = readFileSync(
  new URL('../../docs/design/RELATORIO_REFINAMENTO_TALK_ME_50_ETAPAS_2026-10-01.md', import.meta.url),
  'utf8',
);

test('fechamento distingue publicação de revisão visual autenticada', () => {
  assert.match(
    report,
    /\*\*Status:\*\* 49 de 50 etapas concluídas; etapa 049 parcialmente concluída\./,
  );
  assert.match(report, /\| 049 \| Parcial \|[^\n]+revisão visual autenticada[^\n]+pendente/i);
  assert.match(
    report,
    /O `buildId` comprova somente o código publicado; não comprova revisão visual\/funcional autenticada\./,
  );
  assert.match(
    report,
    /A revisão visual autenticada do ambiente publicado não foi executada e permanece pendente\./,
  );
});

test('fechamento não volta a declarar 50 de 50 nem etapa 049 concluída', () => {
  assert.doesNotMatch(report, /\*\*Status:\*\* 50 de 50 etapas concluídas\./);
  assert.doesNotMatch(report, /\| 049 \| Concluída \|/);
});
