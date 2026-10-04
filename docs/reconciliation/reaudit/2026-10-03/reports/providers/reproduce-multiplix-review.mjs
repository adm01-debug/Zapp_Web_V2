// Offline audit. Executes the complete inspect module after TypeScript erasure
// and wiring its imports to explicit boundaries. All source is verified first.
// Zod is a valid-input boundary (these probes do not test input validation).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { verifyProviderSource } from './verify-source.mjs';
const source = path.resolve(process.argv[2] || '/workspace/scratch/f8f9b9cbce53/reaudit/source');
const sourceVerification = verifyProviderSource(source, process.argv[3]);
globalThis.Deno = { env: { get: () => undefined } };
globalThis.fetch = () => { throw new Error('Network forbidden in audit probe'); };
const importSource = rel => import(pathToFileURL(path.join(source, rel)).href);
const validation = await importSource('supabase/functions/_shared/validation.ts');
const windowModule = await importSource('supabase/functions/_shared/talkx-window.ts');
const eligibilityModule = await importSource('supabase/functions/_shared/multiplix-eligibility.ts');
const messaging = await importSource('supabase/functions/_shared/messaging/index.ts');
const sourcePath = 'supabase/functions/multiplix-dispatch/actions/inspect.ts';
const input = fs.readFileSync(path.join(source, sourcePath), 'utf8');
const imports = input.match(/^import .+;$/gm);
assert.equal(imports.length, 6, 'Import wiring changed; review probe before execution');
const executable = stripTypeScriptTypes(input.replace(/^import .+;$/gm, '').replace(/^export /gm, ''));
class DispatchError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const schema = new Proxy(() => schema, {
  get(_target, key) {
    if (key === 'safeParse') return body => ({ success: true, data: structuredClone(body) });
    return schema;
  },
});
const vmScope = {
  z: schema, DispatchError, ...validation,
  DEFAULT_SCHEDULE_TIMEZONE: windowModule.DEFAULT_SCHEDULE_TIMEZONE,
  MULTIPLIX_ELIGIBILITY_VALUES: eligibilityModule.MULTIPLIX_ELIGIBILITY_VALUES,
  eligibility: messaging.eligibility, getGreeting: messaging.getGreeting, personalize: messaging.personalize,
};
runInNewContext(executable + '\nglobalThis.auditFns = { handlePreview, handleValidate, handleEligibilitySummary, handleEstimate };', vmScope);
const api = vmScope.auditFns;
const ownDispatch = '11111111-1111-4111-8111-111111111111';
const foreignDispatch = '22222222-2222-4222-8222-222222222222';
const profileId = '33333333-3333-4333-8333-333333333333';
const foreignRecipient = '44444444-4444-4444-8444-444444444444';
const calls = [];
let mode = 'foreign';
const ownRow = { id: ownDispatch, created_by: profileId, schedule_timezone: 'America/Sao_Paulo', message_template: 'Olá {{empresa}}', media_url: null, media_type: null };
const foreignRow = { id: foreignRecipient, dispatch_id: foreignDispatch, company_id: 'fixture-company', company_name_snapshot: 'Foreign fixture company', destino_e164: '+5511000000000', singu_contact_id: 'fixture-singu', eligibility: 'eligible', variables_snapshot: {} };
const block = { id: 'fixture-block', dispatch_id: ownDispatch, block_order: 0, block_type: 'text', content: { text: 'Olá {{empresa}}' }, personalization_mode: 'personalized', content_version: 1, asset_id: null };
const db = {
  from(table) {
    const query = { table, columns: '*', filters: [] };
    const q = {};
    q.select = columns => { query.columns = columns; return q; };
    q.eq = (key, value) => { query.filters.push({ key, value }); return q; };
    q.order = () => q;
    function execute(single) {
      calls.push(structuredClone(query));
      let rows = table === 'profiles' ? [{ id: profileId, user_id: 'fixture-user' }]
        : table === 'multiplix_dispatches' ? [ownRow]
        : table === 'multiplix_blocks' ? [block]
        : table === 'multiplix_recipients' ? (mode === 'foreign' ? [foreignRow]
          : Array.from({ length: 2500 }, (_, i) => ({ ...foreignRow, id: 'own-' + i, dispatch_id: ownDispatch })))
        : [];
      rows = rows.filter(row => query.filters.every(f => row[f.key] === f.value));
      // Enforce SELECT projection. Returning unselected dispatch_id in a mock
      // would conceal the production guard defect.
      rows = rows.slice(0, 1000).map(row => query.columns === '*' ? row : Object.fromEntries(query.columns.split(',').map(k => k.trim()).map(k => [k, row[k]])));
      return { data: single ? rows[0] ?? null : rows, error: null };
    }
    q.maybeSingle = () => Promise.resolve(execute(true));
    q.then = (resolve, reject) => Promise.resolve().then(() => execute(false)).then(resolve, reject);
    return q;
  },
};
const req = new Request('https://edge.invalid/multiplix-dispatch', { method: 'POST' });
const ctx = payload => ({ action: 'fixture', payload, userId: 'fixture-user', supabase: db, correlationId: 'fixture-correlation', req });
const results = [];
const payload = { dispatch_id: ownDispatch, recipient_id: foreignRecipient };
assert.match(payload.dispatch_id, /^[0-9a-f-]{36}$/);
assert.match(payload.recipient_id, /^[0-9a-f-]{36}$/);

const preview = await api.handlePreview(ctx(payload));
const previewBody = await preview.json();
assert.equal(preview.status, 200);
assert.equal(previewBody.data.recipient.company_name, foreignRow.company_name_snapshot);
assert.equal(previewBody.data.recipient.destino_e164, foreignRow.destino_e164);
assert(calls.filter(x => x.table === 'multiplix_recipients').every(x => !x.columns.split(',').includes('dispatch_id')));
results.push({ id: 'P19', status: preview.status, response: previewBody, recipientQuery: calls.filter(x => x.table === 'multiplix_recipients'), outcome: 'owned dispatch plus foreign recipient returns foreign company and destination; selected projection omits membership key' });

calls.length = 0;
const validated = await api.handleValidate(ctx(payload));
const validatedBody = await validated.json();
assert.equal(validated.status, 200);
assert.equal(validatedBody.data.placeholders[0].raw_value, foreignRow.company_name_snapshot);
results.push({ id: 'P20', status: validated.status, sampleRecipientId: validatedBody.data.sample_recipient_id, disclosedValue: validatedBody.data.placeholders[0].raw_value, outcome: 'validate also accepts a foreign sample recipient without membership check' });

mode = 'large';
calls.length = 0;
const summary = await (await api.handleEligibilitySummary(ctx({ dispatch_id: ownDispatch }))).json();
const estimate = await (await api.handleEstimate(ctx({ dispatch_id: ownDispatch }))).json();
assert.equal(summary.data.total, 1000);
assert.equal(estimate.data.messages, 1000);
results.push({ id: 'P21', realRecipientRowsInFixture: 2500, simulatedPostgrestCap: 1000, returnedSummaryTotal: summary.data.total, returnedEstimateMessages: estimate.data.messages, outcome: 'summary and estimate accept only the first capped page as the total population' });

const out = {
  head: sourceVerification.actual_head, source_verification: sourceVerification,
  actual_network_requests: 0, actual_database_requests: 0, actual_environment_reads: 0, source_changes: 0,
  method: 'Complete unchanged inspect function bodies evaluated after type/import/export wiring; actual pure messaging helpers imported. Zod replaced only as a valid-input boundary, custom DispatchError boundary, faithful PostgREST select projection and 1000-row cap. No claim to execute the router or live RLS.',
  source_hashes: { [sourcePath]: createHash('sha256').update(input).digest('hex') }, results,
};
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'multiplix-review-probe-results.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ passed: results.length, ids: results.map(x => x.id), network: 0, database: 0, sourceChanges: 0 }));
