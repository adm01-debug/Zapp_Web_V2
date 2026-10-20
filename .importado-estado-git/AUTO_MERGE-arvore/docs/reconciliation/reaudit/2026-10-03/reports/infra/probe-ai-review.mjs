// Offline, bounded synthetic probes. No imports of handlers, SDKs, React or Zod.
// SHA pins are checked before importing TypeScript or evaluating any source.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const dir = path.dirname(new URL(import.meta.url).pathname);
const pins = JSON.parse(fs.readFileSync(path.join(dir, 'ai-review-probe-pins.json'), 'utf8'));
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const files = new Map();
for (const entry of pins.files) {
  const data = fs.readFileSync(entry.absolute_path);
  assert.equal(sha(data), entry.sha256, `source pin failed: ${entry.path}`);
  files.set(entry.path, data.toString('utf8'));
}
const tsBytes = fs.readFileSync(pins.transpiler.absolute_path);
assert.equal(sha(tsBytes), pins.transpiler.sha256, 'transpiler pin failed');
const ts = createRequire(import.meta.url)(pins.transpiler.absolute_path);
let deniedGlobalFetchCalls = 0;
const denyFetch = () => { deniedGlobalFetchCalls++; throw new Error('NETWORK_DISABLED_BY_PROBE'); };
globalThis.fetch = denyFetch;
const compile = code => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function moduleFrom(pathname, dependencies = {}) {
  const exports = {};
  const context = vm.createContext({
    exports, module: { exports }, URL, Response, Request, Uint8Array,
    TextEncoder, AbortController, setTimeout, clearTimeout, btoa,
    fetch: denyFetch,
    require: name => {
      assert.ok(Object.hasOwn(dependencies, name), `unreviewed import: ${name}`);
      return dependencies[name];
    },
  });
  vm.runInContext(compile(files.get(pathname)), context, { timeout: 1000, filename: pathname });
  return exports;
}
function ast(pathname) {
  return ts.createSourceFile(pathname, files.get(pathname), ts.ScriptTarget.Latest, true,
    pathname.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function findNode(root, predicate) {
  let result;
  function visit(node) {
    if (result) return;
    if (predicate(node)) { result = node; return; }
    ts.forEachChild(node, visit);
  }
  visit(root);
  assert.ok(result, 'source extraction target missing');
  return result;
}
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
const results = [];

// INF-AI-P01: actual image helper + actual local URL parser; only fetch is fake.
const parser = moduleFrom('supabase/functions/_shared/ssrf.ts');
const image = moduleFrom('supabase/functions/_shared/ai-image-input.ts', { './ssrf.ts': parser });
const virtualCalls = [];
const fakeServiceKey = 'AUDIT_SYNTHETIC_SERVICE_KEY_NOT_A_CREDENTIAL';
const imageOptions = {
  supabaseUrl: 'https://audit-project.example', serviceRoleKey: fakeServiceKey,
  fetchImpl: async (url, init) => {
    virtualCalls.push({ pathname: new URL(url).pathname, method: init.method,
      authenticated_with_synthetic_service_key: init.headers.apikey === fakeServiceKey && init.headers.Authorization === `Bearer ${fakeServiceKey}` });
    // A tiny fixed PNG fixture, unrelated to users, Storage or a provider.
    const body = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    return new Response(body, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(body.length) } });
  },
};
const inline = await image.toInlineImage('https://audit-project.example/storage/v1/object/public/whatsapp-media/other-contact/private.png', imageOptions);
assert.equal(inline.bucket, 'whatsapp-media');
assert.equal(inline.path, 'other-contact/private.png');
assert.equal(inline.bytes, 68);
assert.equal(virtualCalls.length, 1);
assert.equal(virtualCalls[0].authenticated_with_synthetic_service_key, true);
assert.match(inline.dataUrl, /^data:image\/png;base64,/);
await assert.rejects(image.toInlineImage('https://other-project.example/storage/v1/object/public/whatsapp-media/other-contact/private.png', imageOptions), e => e.code === 'IMAGE_URL_INVALID');
await assert.rejects(image.toInlineImage('https://audit-project.example/storage/v1/object/public/not-allowed/private.png', imageOptions), e => e.code === 'IMAGE_URL_INVALID');
assert.equal(virtualCalls.length, 1);
results.push({ id: 'INF-AI-P01', finding_id: 'R2-INF-022', status: 'REPRODUCED_OFFLINE',
  execution: 'Actual toInlineImage and parseApprovedStorageUrl; fetchImpl synthetic; no handler, RLS or provider executed.',
  observed: { inline_bytes: inline.bytes, inline_bucket: inline.bucket, synthetic_request: virtualCalls[0], rejected_other_origin: true, rejected_other_bucket: true },
  limits: 'Shows privileged conversion of a known permitted-bucket locator with no user identity in helper contract. Authorization gates and private policy are established separately by static source. Does not prove real data disclosure or deployment.' });

// INF-AI-P02: actual revalidation helper + explicit model of pinned SQL predicate.
const schemaTree = ast('supabase/functions/_shared/schemas.ts');
const names = new Set(['toInstant', 'evaluateContextVersionSupersession', 'revalidateContextBeforeEffect']);
const schemaParts = schemaTree.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(schemaTree));
assert.equal(schemaParts.length, 3);
const constants = schemaTree.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ['CONTACT_NOT_VISIBLE_REASON', 'CONTEXT_SUPERSEDED_REASON'].includes(d.name.getText()))).map(node => node.getText(schemaTree));
assert.equal(constants.length, 2);
const exported = {};
const schemaContext = vm.createContext({ exports: exported, Date, fetch: denyFetch });
vm.runInContext(compile([...constants, ...schemaParts].join('\n')), schemaContext, { timeout: 1000 });
const base = '2026-10-04T10:00:00.000Z';
const newerCommitTime = '2026-10-04T10:00:01.000Z';
const oldRequestFinishTime = '2026-10-04T10:00:02.000Z';
let stored = { version: base, projection: 'base' };
const captured = deferred();
const release = deferred();
const revalidation = exported.revalidateContextBeforeEffect({
  expectedContactId: 'synthetic-same-contact', versionAtRequestStart: base,
  reloadVisibleContactId: async () => 'synthetic-same-contact',
  loadCurrentVersion: async () => {
    const snapshot = stored.version;
    captured.resolve();
    await release.promise; // prior read's response in transit while other request commits
    return snapshot;
  },
});
await captured.promise;
stored = { version: newerCommitTime, projection: 'newer-context' };
release.resolve();
const oldDecision = await revalidation;
assert.equal(oldDecision.current, true);
const sql = files.get('supabase/migrations/20260930110000_ai_block03_analysis_persistence.sql');
assert.ok(sql.includes('and (c.ai_projection_updated_at is null or c.ai_projection_updated_at <= p_analyzed_at)'));
// Deliberately a model of that exact predicate, not a PostgreSQL execution.
const sqlPredicateAllowsOld = stored.version === null || Date.parse(stored.version) <= Date.parse(oldRequestFinishTime);
assert.equal(sqlPredicateAllowsOld, true);
if (sqlPredicateAllowsOld) stored = { version: oldRequestFinishTime, projection: 'older-context' };
assert.equal(stored.projection, 'older-context');
const freshDecision = await exported.revalidateContextBeforeEffect({ expectedContactId: 'synthetic-same-contact', versionAtRequestStart: base,
  reloadVisibleContactId: async () => 'synthetic-same-contact', loadCurrentVersion: async () => newerCommitTime });
assert.equal(freshDecision.current, false);
assert.equal(freshDecision.reason, 'context_superseded');
results.push({ id: 'INF-AI-P02', finding_id: 'R2-INF-023', status: 'REPRODUCED_HELPER_AND_PREDICATE_MODEL',
  execution: 'Actual three schema functions extracted by AST; no remote Zod import. SQL effect modeled from pinned predicate, not executed.',
  observed: { old_snapshot_revalidation_current: oldDecision.current, newer_commit_between_snapshot_and_response: true,
    old_finish_timestamp_passes_pinned_sql_predicate: sqlPredicateAllowsOld, resulting_projection_in_model: stored.projection,
    control_fresh_read_cancels: !freshDecision.current },
  limits: 'Establishes an allowed interleaving of the current two-step protocol; no PostgreSQL, real handler concurrency, real timestamps or runtime incidence measured.' });

// INF-AI-P03: actual parse/fallback statements from suggestion handler, not a copy.
const suggestionTree = ast('supabase/functions/ai-suggest-reply/index.ts');
const declaration = findNode(suggestionTree, node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText() === 'suggestions'));
const statements = declaration.parent.statements;
const declarationIndex = statements.indexOf(declaration);
const parseTry = statements[declarationIndex + 1];
assert.ok(ts.isTryStatement(parseTry));
const suggestionContext = vm.createContext({ log: { warn() {} }, fetch: denyFetch });
const parseSuggestions = vm.runInContext(compile(`(function(content: unknown) { ${declaration.getText(suggestionTree)}\n${parseTry.getText(suggestionTree)}\nreturn suggestions; })`), suggestionContext, { timeout: 1000 });
const wrongShape = parseSuggestions('{"suggestions":"x"}');
assert.equal(typeof wrongShape.suggestions, 'string');
assert.equal(wrongShape.suggestions.length > 0, true);
assert.equal(typeof wrongShape.suggestions.map, 'undefined');
const noJson = parseSuggestions('synthetic provider response without JSON');
assert.equal(noJson.suggestions.length, 3);
assert.ok(noJson.suggestions.every(s => typeof s.text === 'string' && s.source === null));
assert.equal('status' in noJson, false);
const valid = parseSuggestions('{"suggestions":[{"type":"direct","text":"A"},{"type":"empathetic","text":"B"},{"type":"followup","text":"C"}]}');
assert.equal(valid.suggestions.length, 3);
results.push({ id: 'INF-AI-P03', finding_id: 'R2-INF-024', status: 'REPRODUCED_PRODUCER_WITH_CONSUMER_TYPE_CHECK',
  execution: 'Actual AST-extracted parse/fallback statements; UI render precondition evaluated as a type contract, no React/browser.',
  observed: { valid_json_wrong_shape_retained: true, suggestions_type: typeof wrongShape.suggestions, consumer_length_positive: true,
    consumer_map_is_function: false, malformed_json_fallback_count: noJson.suggestions.length, fallback_has_degraded_status: false,
    control_valid_three_suggestions_retained: true },
  limits: 'No model called; malformed provider fixtures are synthetic. Render crash is inferred from the actual .map consumer, not observed in a browser.' });

// INF-AI-P04: actual handlers of both rewrite buttons with delayed fake invoke.
const draftResults = [];
for (const [pathname, handlerName, callbackName] of [
  ['src/components/inbox/chat/AIRewriteButton.tsx', 'handleRewrite', 'onRewrite'],
  ['src/components/inbox/chat/AIEnhanceButton.tsx', 'handleEnhance', 'onInputChange'],
]) {
  const tree = ast(pathname);
  const decl = findNode(tree, node => ts.isVariableDeclaration(node) && node.name.getText() === handlerName);
  const handler = ts.isCallExpression(decl.initializer) ? decl.initializer.arguments[0] : decl.initializer;
  assert.ok(ts.isArrowFunction(handler));
  const pending = deferred();
  let currentDraft = 'original draft';
  const noOp = () => {};
  const toast = Object.assign(noOp, { success: noOp, warning: noOp, error: noOp });
  const context = vm.createContext({ inputValue: currentDraft, contactName: 'Synthetic',
    [callbackName]: value => { currentDraft = value; },
    setIsLoading: noOp, setLoadingTone: noOp, setIsOpen: noOp, setOriginalMessage: noOp,
    supabase: { functions: { invoke: async () => pending.promise } }, toast,
    log: { error: noOp }, fetch: denyFetch });
  const fn = vm.runInContext(compile(`(${handler.getText(tree)})`), context, { timeout: 1000 });
  const running = fn('professional');
  currentDraft = 'manual edit while waiting';
  pending.resolve({ data: { enhanced: 'rewrite of original draft' }, error: null });
  await running;
  assert.equal(currentDraft, 'rewrite of original draft');
  draftResults.push({ pathname, manual_edit_replaced: true, same_contact_and_mounted_component: true });
}
results.push({ id: 'INF-AI-P04', finding_id: 'R2-INF-025', status: 'REPRODUCED_CALLBACKS_OFFLINE',
  execution: 'Actual AST-extracted async callbacks; fake invoke and setters, no React mounting, DOM, network or message send.',
  observed: draftResults,
  limits: 'Counterexample is limited to a still-mounted button on the same conversation while a newer draft is typed. No cross-contact effect or automatic send claimed.' });

assert.equal(deniedGlobalFetchCalls, 0);
const output = { schema_version: 1, baseline_sha: pins.baseline_sha,
  source_pins: 'ai-review-probe-pins.json', source_pin_count: pins.files.length,
  transpiler_sha256: pins.transpiler.sha256,
  probe_script_sha256: sha(fs.readFileSync(new URL(import.meta.url))),
  safety: { product_network: 'No product network capability in evaluated VM; only injected fixtures.',
    global_fetch_denials: deniedGlobalFetchCalls, synthetic_fetch_calls: virtualCalls.length,
    product_sql_executed: false, product_handlers_started: false, source_mutated: false,
    writes: ['reports/infra/ai-review-probes.json'] }, results };
fs.writeFileSync(path.join(dir, 'ai-review-probes.json'), JSON.stringify(output, null, 2) + '\n');
process.stdout.write(JSON.stringify({ artifact: 'ai-review-probes.json', results: results.map(r => ({ id: r.id, status: r.status })), global_fetch_denials: deniedGlobalFetchCalls }) + '\n');
