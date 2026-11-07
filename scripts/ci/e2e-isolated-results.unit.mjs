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

// Protocol fixtures follow the pinned Playwright 1.64.1 JSON reporter. These
// are parser controls, not a native browser run or a native --list artifact.
const PLATFORM_PROJECTS = ['chromium-e2e-core', 'firefox-conversation', 'webkit-conversation'];
const PLATFORM_REASON = "CloseConversationDialog coberto em Chromium; Radix Select portal nao responde a getByRole('option') de forma confiavel em Firefox/WebKit no CI";
const PLATFORM_BLOB = 'd94d957b155492b06272980816e75b6d9cabd15b';
const PLATFORM_FILE = 'e2e/conversation.spec.ts';
const SOURCE_SHA = 'a96bbd4cbaeed5a8bad7c42af347e56960e6cac7';
const platformSpec = json => json.suites[0].suites[0].specs[0];
const platformItem = (json, project = 'firefox-conversation') => platformSpec(json).tests.find(item => item.projectName === project);
const skipAnnotation = () => ({ type: 'skip', description: PLATFORM_REASON });

function platformFixture() {
  const listed = {
    config: { rootDir: '/repo/e2e', projects: PLATFORM_PROJECTS.map(name => ({ name, repeatEach: 1 })) },
    suites: [{ title: 'conversation.spec.ts', file: 'conversation.spec.ts', specs: [], suites: [{
      title: 'Conversation state transitions', file: 'conversation.spec.ts', line: 43, column: 6,
      specs: [{ title: 'resolving conversation via CloseConversationDialog succeeds', file: 'conversation.spec.ts', line: 59, column: 7,
        tests: PLATFORM_PROJECTS.map(projectName => ({ projectName, projectId: projectName, expectedStatus: 'passed', status: 'skipped', annotations: [], results: [] })) }],
    }] }], errors: [], stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 3 },
  };
  const report = clone(listed);
  for (const entry of platformSpec(report).tests) {
    const skipped = entry.projectName !== 'chromium-e2e-core';
    entry.expectedStatus = skipped ? 'skipped' : 'passed';
    entry.status = skipped ? 'skipped' : 'expected';
    entry.annotations = skipped ? [skipAnnotation()] : [];
    entry.results = [{ status: skipped ? 'skipped' : 'passed', workerIndex: 0, retry: 0, errors: [], annotations: clone(entry.annotations) }];
  }
  report.stats = { expected: 1, unexpected: 0, flaky: 0, skipped: 2 };
  return { listed, report, projects: [...PLATFORM_PROJECTS], options: { scope: 'authenticated-suite', conversationPlatformSkips: { sourceSha: SOURCE_SHA, sourceBlobs: { [PLATFORM_FILE]: PLATFORM_BLOB } } } };
}

function evaluatePlatform(context, parser = summarizePlaywrightResult) {
  let inventory;
  try {
    inventory = readPlaywrightInventory(context.listed, { projects: context.projects });
    context.mutateInventory?.(inventory);
  } catch { return { ok: false, allPassed: false, counts: {}, cases: [], inventoryRejected: true }; }
  return parser(context.report, { expectedProjects: context.projects, inventory, ...context.options });
}

const PLATFORM_CASES = [];
const platformCase = (name, change = () => {}, ok = false, known) => PLATFORM_CASES.push({ name, change, ok, known });
platformCase('duas exceções exatas permanecem separadas de passed', () => {}, true, 2);
platformCase('HEAD pode avançar com o mesmo blob revisado', c => { c.options.conversationPlatformSkips.sourceSha = '5431b966463ee764177a600d776b3353f7f14e1a'; }, true, 2);
platformCase('anotações informativas iguais em ordem diferente são aceitas', c => {
  for (const project of PLATFORM_PROJECTS.slice(1)) {
    const entry = platformItem(c.report, project);
    entry.annotations = [{ type: 'issue', description: 'sentinel-secret-info' }, skipAnnotation(), { type: 'owner' }];
    entry.results[0].annotations = [skipAnnotation(), { type: 'owner' }, { type: 'issue', description: 'sentinel-secret-info' }];
  }
}, true, 2);
platformCase('informação pré-coletada não é autorização para skip', c => {
  for (const entry of platformSpec(c.listed).tests) entry.annotations = [{ type: 'issue', description: 'reviewed info' }];
  for (const entry of platformSpec(c.report).tests) { entry.annotations.push({ type: 'issue', description: 'reviewed info' }); entry.results[0].annotations = clone(entry.annotations); }
}, true, 2);
platformCase('nenhuma exceção necessária quando os três realmente passam', c => {
  for (const entry of platformSpec(c.report).tests) Object.assign(entry, { expectedStatus: 'passed', status: 'expected', annotations: [], results: [{ status: 'passed', workerIndex: 0, retry: 0, errors: [], annotations: [] }] });
  c.report.stats = { expected: 3, unexpected: 0, flaky: 0, skipped: 0 };
}, true, 0);
for (const project of PLATFORM_PROJECTS.slice(1)) platformCase(`apenas ${project} precisa da exceção`, c => {
  const other = PLATFORM_PROJECTS.slice(1).find(name => name !== project);
  Object.assign(platformItem(c.report, other), { expectedStatus: 'passed', status: 'expected', annotations: [], results: [{ status: 'passed', workerIndex: 0, retry: 0, errors: [], annotations: [] }] });
  c.report.stats = { expected: 2, unexpected: 0, flaky: 0, skipped: 1 };
}, true, 1);

platformCase('sem opção específica mantém a rejeição padrão', c => { delete c.options.conversationPlatformSkips; });
platformCase('allowRuntimeSkip genérico não autoriza nada', c => { delete c.options.conversationPlatformSkips; c.options.allowRuntimeSkip = true; });
platformCase('prova dentro do relatório não substitui a prova do checkout', c => { c.report.config.metadata = clone(c.options.conversationPlatformSkips); delete c.options.conversationPlatformSkips; });
for (const value of [null, false, true, [], 'sentinel-secret-proof', {}]) platformCase(`prova inválida ${JSON.stringify(value)}`, c => { c.options.conversationPlatformSkips = value; });
for (const value of ['', 'a'.repeat(39), 'A'.repeat(40), 'g'.repeat(40), '0'.repeat(40), SOURCE_SHA + '\n']) platformCase(`SHA inválido ${JSON.stringify(value)}`, c => { c.options.conversationPlatformSkips.sourceSha = value; });
platformCase('blob diferente exige nova revisão', c => { c.options.conversationPlatformSkips.sourceBlobs[PLATFORM_FILE] = 'a'.repeat(40); });
platformCase('blob ausente', c => { delete c.options.conversationPlatformSkips.sourceBlobs[PLATFORM_FILE]; });
platformCase('mapa de blobs ausente', c => { delete c.options.conversationPlatformSkips.sourceBlobs; });
platformCase('mapa de blobs não aceita array', c => { c.options.conversationPlatformSkips.sourceBlobs = [PLATFORM_BLOB]; });
platformCase('outro arquivo não substitui a fonte revisada', c => { c.options.conversationPlatformSkips.sourceBlobs = { 'conversation.spec.ts': PLATFORM_BLOB }; });
platformCase('campos extras não viram allowlist livre', c => { c.options.conversationPlatformSkips.allowedProjects = ['setup']; });
for (const scope of ['login', 'bootstrap-and-login', 'unknown', 'authenticated_suite']) platformCase(`escopo ${scope} não ativa a política`, c => { c.options.scope = scope; });

for (const file of ['./conversation.spec.ts', 'e2e/conversation.spec.ts', '/repo/e2e/conversation.spec.ts', 'nested/conversation.spec.ts', 'Conversation.spec.ts', 'e2e\\conversation.spec.ts']) platformCase(`arquivo exato: ${file}`, c => { platformSpec(c.listed).file = file; platformSpec(c.report).file = file; });
platformCase('linha diferente não é o caso revisado', c => { platformSpec(c.listed).line = 60; platformSpec(c.report).line = 60; });
platformCase('coluna diferente entre inventário e execução reprova', c => { platformSpec(c.report).column += 1; });
platformCase('coluna inválida não recebe exceção', c => { platformSpec(c.listed).column = 0; platformSpec(c.report).column = 0; });
platformCase('título diferente não herda a exceção', c => { platformSpec(c.listed).title += ' extra'; platformSpec(c.report).title += ' extra'; });
platformCase('describe diferente não herda a exceção', c => { c.listed.suites[0].suites[0].title += ' extra'; c.report.suites[0].suites[0].title += ' extra'; });
platformCase('suíte de arquivo diferente não herda a exceção', c => { c.listed.suites[0].title = 'other.spec.ts'; c.report.suites[0].title = 'other.spec.ts'; });
platformCase('outro projeto com mesmo teste e motivo não é permitido', c => {
  for (const json of [c.listed, c.report]) { const entry = platformItem(json); entry.projectName = entry.projectId = 'firefox-other'; json.config.projects.find(p => p.name === 'firefox-conversation').name = 'firefox-other'; }
  c.projects = c.projects.map(p => p === 'firefox-conversation' ? 'firefox-other' : p);
});
platformCase('inventário sem o Chromium equivalente reprova', c => {
  for (const json of [c.listed, c.report]) { platformSpec(json).tests = platformSpec(json).tests.filter(t => t.projectName !== 'chromium-e2e-core'); json.config.projects = json.config.projects.filter(p => p.name !== 'chromium-e2e-core'); }
  c.projects = c.projects.slice(1); c.report.stats.expected = 0;
});
platformCase('chave do inventário não pode ser fabricada', c => { c.mutateInventory = inventory => { inventory.cases[1].key = 'a'.repeat(64); }; });
platformCase('skip pré-coletado não vira exceção runtime', c => { platformItem(c.listed).expectedStatus = 'skipped'; platformItem(c.listed).annotations = [skipAnnotation()]; });
platformCase('expectativa de falha pré-coletada não vira exceção', c => { platformItem(c.listed).expectedStatus = 'failed'; });
platformCase('flag skip pré-coletada contraditória reprova', c => { platformItem(c.listed).annotations = [skipAnnotation()]; });

for (const reason of ['', ' ', PLATFORM_REASON + ' ', PLATFORM_REASON.toLowerCase(), 'fixture missing', 'auth missing', 'RPC missing', 'service unavailable', 'seed missing', 'sentinel-secret-reason']) platformCase(`motivo não aprovado ${JSON.stringify(reason)}`, c => {
  const entry = platformItem(c.report); entry.annotations[0].description = reason; entry.results[0].annotations[0].description = reason;
});
for (const type of ['fixme', 'fail', 'Skip', 'info']) platformCase(`tipo ${type} não substitui skip`, c => { const entry = platformItem(c.report); entry.annotations[0].type = type; entry.results[0].annotations[0].type = type; });
platformCase('TestCase sem motivo', c => { delete platformItem(c.report).annotations[0].description; });
platformCase('TestResult sem motivo', c => { delete platformItem(c.report).results[0].annotations[0].description; });
platformCase('TestCase sem anotação', c => { platformItem(c.report).annotations = []; });
platformCase('TestResult sem anotações', c => { delete platformItem(c.report).results[0].annotations; });
platformCase('motivos diferentes entre TestCase e TestResult', c => { platformItem(c.report).results[0].annotations[0].description = 'fixture missing'; });
platformCase('skip duplicado não passa por cardinalidade', c => { const entry = platformItem(c.report); entry.annotations.push(skipAnnotation()); entry.results[0].annotations.push(skipAnnotation()); });
platformCase('fixme adicional não é informação inofensiva', c => { const entry = platformItem(c.report); entry.annotations.push({ type: 'fixme' }); entry.results[0].annotations.push({ type: 'fixme' }); });
platformCase('fail adicional não é informação inofensiva', c => { const entry = platformItem(c.report); entry.annotations.push({ type: 'fail' }); entry.results[0].annotations.push({ type: 'fail' }); });
platformCase('informação contraditória entre caso e tentativa reprova', c => { platformItem(c.report).annotations.push({ type: 'issue', description: 'new' }); });
platformCase('anotação inválida não vira informação', c => { const entry = platformItem(c.report); entry.annotations.push(null); entry.results[0].annotations.push(null); });
platformCase('erro na tentativa de skip não é permitido', c => { platformItem(c.report).results[0].errors = [{ message: 'sentinel-secret-error' }]; });
platformCase('erro singular também invalida a exceção', c => { platformItem(c.report).results[0].error = { message: 'sentinel-secret-error' }; });
platformCase('error null não é ausência do campo de erro', c => { platformItem(c.report).results[0].error = null; });
platformCase('worker -1 nunca é skip runtime conhecido', c => { platformItem(c.report).results[0].workerIndex = -1; });
platformCase('sem tentativa não é execução conhecida', c => { platformItem(c.report).results = []; });
platformCase('expectedStatus passed contradiz skip runtime', c => { platformItem(c.report).expectedStatus = 'passed'; });
for (const outcome of ['expected', 'unexpected', 'flaky']) platformCase(`outcome ${outcome} contradiz skip`, c => { platformItem(c.report).status = outcome; c.report.stats.skipped -= 1; c.report.stats[outcome] += 1; });
for (const prior of ['passed', 'failed', 'timedOut', 'interrupted', 'skipped']) platformCase(`tentativa anterior ${prior} não desaparece`, c => {
  const entry = platformItem(c.report); entry.results[0].retry = 1;
  entry.results.unshift({ status: prior, workerIndex: 0, retry: 0, errors: prior === 'failed' ? [{}] : [], annotations: [] });
});
platformCase('status passed com anotação skip não conta como passed', c => {
  const entry = platformItem(c.report); entry.status = 'expected'; entry.expectedStatus = 'passed'; entry.results[0].status = 'passed'; c.report.stats.skipped -= 1; c.report.stats.expected += 1;
});
for (const status of ['failed', 'timedOut', 'interrupted']) platformCase(`Chromium ${status} não fornece cobertura`, c => {
  const entry = platformItem(c.report, 'chromium-e2e-core'); entry.status = 'unexpected'; entry.results[0].status = status; c.report.stats.expected = 0; c.report.stats.unexpected = 1;
});
platformCase('Chromium com erro oculto não fornece cobertura', c => { platformItem(c.report, 'chromium-e2e-core').results[0].errors = [{}]; });
platformCase('Chromium não executado não fornece cobertura', c => { const entry = platformItem(c.report, 'chromium-e2e-core'); entry.status = 'skipped'; entry.results[0].status = 'skipped'; entry.results[0].workerIndex = -1; c.report.stats.expected = 0; c.report.stats.skipped = 3; });
platformCase('Chromium com falha esperada não fornece cobertura', c => { platformItem(c.listed, 'chromium-e2e-core').expectedStatus = 'failed'; const entry = platformItem(c.report, 'chromium-e2e-core'); entry.expectedStatus = 'failed'; entry.results[0].status = 'failed'; });
platformCase('Chromium flaky não fornece cobertura', c => { const entry = platformItem(c.report, 'chromium-e2e-core'); entry.status = 'flaky'; entry.results[0].retry = 1; entry.results.unshift({ status:'failed', workerIndex:0, retry:0, errors:[{}], annotations:[] }); c.report.stats.expected = 0; c.report.stats.flaky = 1; });
platformCase('Chromium sem resultado não fornece cobertura', c => { platformItem(c.report, 'chromium-e2e-core').results = []; });
platformCase('Chromium com anotação skip contraditória não fornece cobertura', c => { const entry = platformItem(c.report, 'chromium-e2e-core'); entry.annotations = [skipAnnotation()]; entry.results[0].annotations = [skipAnnotation()]; });
platformCase('estatística não pode converter skips em passes', c => { c.report.stats.expected = 3; c.report.stats.skipped = 0; });
platformCase('erro de coleta não desaparece com exceções conhecidas', c => { c.report.errors = [{ message: 'sentinel-secret-collection' }]; });
platformCase('caso inventariado ausente continua falhando', c => { platformSpec(c.report).tests.pop(); c.report.stats.skipped -= 1; });
platformCase('outro skip explícito de fixture ausente reprova a fullsuite', c => {
  for (const json of [c.listed, c.report]) {
    const spec = clone(platformSpec(json)); spec.title = 'fixture availability'; spec.line = 110;
    spec.tests = [clone(platformItem(json, 'chromium-e2e-core'))];
    const entry = spec.tests[0]; entry.expectedStatus = 'skipped'; entry.status = 'skipped'; entry.annotations = [{ type:'skip', description:'fixture missing' }];
    entry.results = json === c.listed ? [] : [{ status:'skipped', workerIndex:-1, retry:0, errors:[], annotations:clone(entry.annotations) }];
    json.suites[0].suites[0].specs.push(spec);
  }
  c.report.stats.skipped += 1;
});

for (const scenario of PLATFORM_CASES) {
  test('runtime platform: ' + scenario.name, () => {
    const context = platformFixture(); scenario.change(context);
    const result = evaluatePlatform(context);
    assert.equal(result.ok, scenario.ok, JSON.stringify(result));
    if (scenario.known !== undefined) assert.equal(result.counts.known_runtime_skip, scenario.known);
    if ((result.counts.known_runtime_skip || 0) > 0) {
      assert.equal(result.allPassed, false);
      assert.ok(result.cases.filter(item => item.outcome === 'known_runtime_skip').every(item => item.project !== 'chromium-e2e-core'));
    }
    if (scenario.known === 2) { assert.equal(result.counts.passed, 1); assert.equal(result.counts.executed, 1); }
    assert.equal(JSON.stringify(result).includes('sentinel-secret'), false);
  });
}
