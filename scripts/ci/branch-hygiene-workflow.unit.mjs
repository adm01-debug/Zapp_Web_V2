// branch-hygiene-audit.yml foi removido no CI mínimo (16/10/2026).
// Todos os testes abaixo ficam em test.skip até o workflow ser restaurado.

import test from 'node:test';

test.skip('E91: o relatorio vai para a issue, alem do Job Summary', () => {});
test.skip('W83/W98: secoes geradas depois da copia do relatorio tambem vao para o Job Summary', () => {});
test.skip('E91: o upsert e idempotente (procura a aberta antes de criar)', () => {});
test.skip('E91: PR parado e medido por updatedAt com corte de 7 dias', () => {});
test.skip('E91: o passo que publica recalcula o caminho do relatorio', () => {});
test.skip('E91: o ref simbolico `origin` nao entra na lista de branches', () => {});
test.skip('t_ff817d9f: a contagem de commits unicos nao engole falha do git cherry', () => {});
test.skip('t_ff817d9f: git cherry sem commits unicos mantem a branch como equivalente', async () => {});
test.skip('t_ff817d9f: falha do git cherry derruba a auditoria em vez de classificar como equivalente', async () => {});
