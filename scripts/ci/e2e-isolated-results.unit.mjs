import assert from 'node:assert/strict';
import test from 'node:test';
import { readPlaywrightInventory, summarizePlaywrightResult } from '../e2e-isolated/results.mjs';

const clone = value => structuredClone(value);
function fixture({ project = 'setup', title = 'authenticate', expected = 'passed', outcome = 'expected', status = 'passed', worker = 0, listed = false } = {}) {
  return {
    config: { projects: [{ name: project, repeatEach: 1 }] },
    suites: [{ title: 'auth.setup.ts', file: 'auth.setup.ts', specs: [{
      title, file: 'auth.setup.ts', line: 8, column: 1,
      tests: [{ projectName: project, projectId: project, expectedStatus: expected,
        status: listed ? 'skipped' : outcome, annotations: [],
        results: listed ? [] : [{ status, workerIndex: worker, retry: 0, errors: [] }],
      }],
    }] }],
    errors: [],
    stats: { expected: !listed && outcome === 'expected' ? 1 : 0, unexpected: !listed && outcome === 'unexpected' ? 1 : 0, flaky: !listed && outcome === 'flaky' ? 1 : 0, skipped: listed || outcome === 'skipped' ? 1 : 0 },
  };
}
const item = json => json.suites[0].specs[0].tests[0];
const inv = options => readPlaywrightInventory(fixture({ ...options, listed: true }), { projects: [options?.project || 'setup'] });
const summarize = (json, inventory = inv(), options = {}) => summarizePlaywrightResult(json, { scope: 'login', expectedProjects: ['setup'], inventory, ...options });

test('login: um caso listado e executado realmente é aprovado', () => {
  const result = summarize(fixture());
  assert.equal(result.ok, true); assert.equal(result.allPassed, true);
  assert.equal(result.counts.total, 1); assert.equal(result.counts.passed, 1);
  assert.equal(result.counts.executed, 1); assert.equal(result.counts.collection_errors, 0);
});
test('falha esperada declarada permanece separada de aprovação', () => {
  const result = summarize(fixture({ expected: 'failed', status: 'failed' }), inv({ expected: 'failed' }));
  assert.equal(result.ok, true); assert.equal(result.allPassed, false);
  assert.equal(result.counts.expected_failure, 1); assert.equal(result.counts.passed, 0);
});
test('teste inesperadamente aprovado não apaga a expectativa de falha', () => {
  const result = summarize(fixture({ expected: 'failed', outcome: 'unexpected' }), inv({ expected: 'failed' }));
  assert.equal(result.ok, false); assert.equal(result.counts.unexpected_pass, 1);
});
test('skip declarado no inventário não é passe nem execução de assertions', () => {
  const result = summarize(fixture({ expected: 'skipped', outcome: 'skipped', status: 'skipped', worker: -1 }), inv({ expected: 'skipped' }));
  assert.equal(result.ok, true); assert.equal(result.allPassed, false);
  assert.equal(result.counts.skipped_explicit, 1); assert.equal(result.counts.passed, 0); assert.equal(result.counts.executed, 0);
});
test('fixme declarado também permanece como skip explícito', () => {
  const list = fixture({ expected: 'skipped', listed: true }); item(list).annotations = [{ type: 'fixme', description: 'known condition' }];
  const report = fixture({ expected: 'skipped', outcome: 'skipped', status: 'skipped', worker: -1 }); item(report).annotations = clone(item(list).annotations);
  const result = summarize(report, readPlaywrightInventory(list));
  assert.equal(result.counts.skipped_explicit, 1); assert.equal(result.allPassed, false);
});
test('skip surgido somente no runtime reprova e não é skip declarado', () => {
  const result = summarize(fixture({ expected: 'skipped', outcome: 'skipped', status: 'skipped' }));
  assert.equal(result.ok, false); assert.equal(result.counts.skipped_runtime, 1); assert.equal(result.counts.skipped_explicit, 0);
});
test('dependente com worker -1 é não executado, sem inventar a causa', () => {
  const result = summarize(fixture({ outcome: 'skipped', status: 'skipped', worker: -1 }));
  assert.equal(result.counts.not_run, 1); assert.equal(result.counts.skipped_runtime, 0); assert.equal(result.ok, false);
});
test('resultado sem tentativas é não executado', () => {
  const report = fixture({ listed: true });
  const result = summarize(report); assert.equal(result.counts.not_run, 1); assert.equal(result.ok, false);
});
for (const status of ['failed', 'timedOut', 'interrupted']) {
  test('estado final ' + status + ' reprova o caso', () => {
    const result = summarize(fixture({ outcome: 'unexpected', status }));
    assert.equal(result.ok, false); assert.equal(result.counts.failed, 1); assert.equal(result.counts.passed, 0);
  });
}
test('marcar falha esperada durante runtime não transforma falha nova em sucesso', () => {
  const result = summarize(fixture({ expected: 'failed', status: 'failed' }));
  assert.equal(result.ok, false); assert.equal(result.counts.failed, 1); assert.equal(result.counts.expected_failure, 0);
});
test('flaky conta uma vez por teste e reprova, mesmo com último retry aprovado', () => {
  const report = fixture({ outcome: 'flaky' });
  item(report).results = [{ status: 'failed', workerIndex: 0, retry: 0, errors: [{}] }, { status: 'passed', workerIndex: 1, retry: 1, errors: [] }];
  const result = summarize(report);
  assert.equal(result.counts.total, 1); assert.equal(result.counts.flaky, 1); assert.equal(result.counts.passed, 0); assert.equal(result.ok, false);
});
test('retry falho escondido sob outcome expected não gera aprovação', () => {
  const report = fixture(); item(report).results.unshift({ status: 'failed', workerIndex: 0, retry: 0, errors: [{}] }); item(report).results[1].retry = 1;
  const result = summarize(report); assert.equal(result.ok, false); assert.equal(result.counts.failed, 1);
});
test('aprovação com errors contraditórios é rejeitada', () => {
  const report = fixture(); item(report).results[0].errors = [{ message: 'sentinel-secret-error' }];
  const result = summarize(report); assert.equal(result.ok, false); assert.equal(result.counts.passed, 0);
});
test('aprovação sem worker efetivo não é aceita', () => {
  const result = summarize(fixture({ worker: -1 })); assert.equal(result.ok, false); assert.equal(result.counts.passed, 0);
});
test('skip explícito com tentativa anterior falha é contraditório', () => {
  const report = fixture({ expected: 'skipped', outcome: 'skipped', status: 'skipped', worker: -1 });
  item(report).results.unshift({ status: 'failed', workerIndex: 0, retry: 0, errors: [{}] }); item(report).results[1].retry = 1;
  const result = summarize(report, inv({ expected: 'skipped' })); assert.equal(result.ok, false); assert.equal(result.counts.failed, 1);
});
test('caso listado ausente do relatório é contado e reprova', () => {
  const report = fixture(); report.suites = []; report.stats.expected = 0;
  const result = summarize(report); assert.equal(result.counts.missing_from_report, 1); assert.equal(result.ok, false);
});
test('caso extra não substitui o listado que desapareceu', () => {
  const result = summarize(fixture({ title: 'different test' }));
  assert.equal(result.counts.extra_reported, 1); assert.equal(result.counts.missing_from_report, 1); assert.equal(result.ok, false);
});
test('erro global de coleta reprova mesmo com caso aprovado', () => {
  const report = fixture(); report.errors = [{ message: 'sentinel-secret-global' }];
  const result = summarize(report); assert.equal(result.counts.passed, 1); assert.equal(result.counts.collection_errors, 1); assert.equal(result.ok, false);
});
for (const name of ['expected', 'unexpected', 'flaky', 'skipped']) {
  test('contador ' + name + ' divergente reprova', () => {
    const report = fixture(); report.stats[name] += 1;
    const result = summarize(report); assert.equal(result.ok, false); assert.ok(result.reasons.includes('stats_mismatch'));
  });
}
for (const value of [-1, 0.5, '1', null, Number.NaN]) {
  test('contador de estatística inválido: ' + String(value), () => {
    const report = fixture(); report.stats.expected = value;
    assert.equal(summarize(report).ok, false);
  });
}
for (const field of ['config', 'suites', 'errors', 'stats']) {
  test('relatório sem ' + field + ' é erro de coleta, não zero testes aprovado', () => {
    const report = fixture(); delete report[field]; const result = summarize(report);
    assert.equal(result.ok, false); assert.ok(result.counts.collection_errors > 0);
  });
}
test('inventário é obrigatório para afirmar completude', () => {
  const result = summarizePlaywrightResult(fixture(), { scope: 'login' });
  assert.equal(result.ok, false); assert.equal(result.inventoryVerified, false);
});
test('inventário vazio é rejeitado', () => {
  const report = fixture({ listed: true }); report.suites = [];
  assert.throws(() => readPlaywrightInventory(report), /EMPTY_INVENTORY/);
});
test('inventário com erro de coleta é rejeitado', () => {
  const report = fixture({ listed: true }); report.errors = [{}];
  assert.throws(() => readPlaywrightInventory(report), /INVENTORY_COLLECTION_ERRORS/);
});
test('inventário não pode ser substituído por relatório já executado', () => {
  assert.throws(() => readPlaywrightInventory(fixture()), /INVENTORY_CONTAINS_EXECUTIONS/);
});
test('inventário não pode omitir um projeto exigido', () => {
  assert.throws(() => readPlaywrightInventory(fixture({ listed: true }), { projects: ['setup', 'chromium-authenticated'] }), /PROJECT_INVENTORY_MISMATCH/);
});
test('projetos exigidos duplicados são rejeitados', () => {
  assert.throws(() => readPlaywrightInventory(fixture({ listed: true }), { projects: ['setup', 'setup'] }), /INVALID_PROJECTS/);
});
test('projeto desconhecido pelo config não é aceito', () => {
  const report = fixture(); item(report).projectName = 'foreign';
  assert.equal(summarize(report).ok, false);
});
test('repeatEach maior que um exige identificação adicional, não colapsa casos', () => {
  const report = fixture({ listed: true }); report.config.projects[0].repeatEach = 2;
  assert.throws(() => readPlaywrightInventory(report), /REPEAT_EACH_UNSUPPORTED/);
});
test('duas ocorrências iguais são rejeitadas em vez de duplicar passes', () => {
  const report = fixture(); report.suites[0].specs.push(clone(report.suites[0].specs[0])); report.stats.expected = 2;
  const result = summarize(report); assert.equal(result.ok, false); assert.ok(result.reasons.includes('PLAYWRIGHT_REPORT_DUPLICATE_CASE'));
});
for (const mutate of [
  value => { value.expectedStatus = 'unknown'; },
  value => { value.status = 'passed'; },
  value => { value.results[0].status = 'unknown'; },
  value => { value.results[0].workerIndex = -2; },
  value => { value.results[0].retry = -1; },
  value => { value.results[0].errors = null; },
  value => { value.annotations = null; },
]) {
  test('schema de teste inválido é recusado: ' + mutate.toString(), () => {
    const report = fixture(); mutate(item(report)); assert.equal(summarize(report).ok, false);
  });
}
test('mesmo spec em dois projetos mantém dois casos e dois resultados', () => {
  const list = fixture({ listed: true });
  list.config.projects.push({ name: 'chromium-authenticated', repeatEach: 1 });
  const second = clone(item(list)); second.projectName = 'chromium-authenticated'; second.projectId = second.projectName;
  list.suites[0].specs[0].tests.push(second);
  const inventory = readPlaywrightInventory(list, { projects: ['setup', 'chromium-authenticated'] });
  const report = clone(list); for (const entry of report.suites[0].specs[0].tests) { entry.status = 'expected'; entry.results = [{ status: 'passed', workerIndex: 0, retry: 0, errors: [] }]; }
  report.stats.expected = 2; report.stats.skipped = 0;
  const result = summarize(report, inventory, { expectedProjects: ['setup', 'chromium-authenticated'] });
  assert.equal(result.ok, true); assert.equal(result.counts.total, 2); assert.equal(result.counts.passed, 2);
});
test('títulos iguais em suites diferentes não colapsam testes', () => {
  const list = fixture({ listed: true }); const spec = clone(list.suites[0].specs[0]);
  list.suites[0].suites = [{ title: 'nested', specs: [spec] }];
  const inventory = readPlaywrightInventory(list); assert.equal(inventory.total, 2); assert.notEqual(inventory.cases[0].key, inventory.cases[1].key);
});
test('inventário forjado com caso duplicado não é aceito', () => {
  const inventory = inv(); inventory.cases.push(clone(inventory.cases[0])); inventory.total = 2;
  assert.equal(summarize(fixture(), inventory).ok, false);
});
test('escopo inválido é redigido em vez de refletido no resumo', () => {
  const result = summarize(fixture(), inv(), { scope: 'sentinel-secret-scope\n' });
  assert.equal(result.ok, false); assert.equal(JSON.stringify(result).includes('sentinel-secret'), false);
});
test('resumo não publica títulos, corpos de erro, stdout, stderr ou anexos', () => {
  const secret = 'sentinel-secret-never-publish';
  const list = fixture({ listed: true, title: secret });
  const report = fixture({ title: secret }); report.config.metadata = { value: secret };
  Object.assign(item(report).results[0], { stdout: [{ text: secret }], stderr: [{ text: secret }], attachments: [{ body: secret }], steps: [{ title: secret }] });
  const result = summarize(report, readPlaywrightInventory(list));
  assert.equal(result.ok, true); assert.equal(JSON.stringify(result).includes(secret), false);
});

test('contradição: erro singular sem errors também impede aprovação', () => {
  const report = fixture(); item(report).results[0].error = { message: 'sentinel-secret-singular' };
  const result = summarize(report); assert.equal(result.ok, false); assert.equal(result.counts.passed, 0);
  assert.equal(JSON.stringify(result).includes('sentinel-secret'), false);
});
test('contradição: duas tentativas aprovadas não são outcome expected válido', () => {
  const report = fixture(); item(report).results.push({ status: 'passed', workerIndex: 1, retry: 1, errors: [] });
  const result = summarize(report); assert.equal(result.ok, false); assert.equal(result.counts.passed, 0);
});
test('contradição: falha esperada com retry adicional exige outcome distinto', () => {
  const report = fixture({ expected: 'failed', status: 'failed' }); item(report).results.push({ status: 'failed', workerIndex: 1, retry: 1, errors: [{}] });
  const result = summarize(report, inv({ expected: 'failed' })); assert.equal(result.ok, false);
});
test('contradição: índice de retry sem tentativa inicial é rejeitado', () => {
  const report = fixture(); item(report).results[0].retry = 1;
  assert.equal(summarize(report).ok, false);
});
