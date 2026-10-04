// Offline audit only. Verifies source before imports. P16/P17 compose the exact
// URL-selection block and downloadAudio source with the actual visibility and
// URL helpers. P18 imports the complete auto-close handler. No real network,
// database, environment credentials, package downloads or source changes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { verifyProviderSource } from './verify-source.mjs';

const source = path.resolve(process.argv[2] || '/workspace/scratch/f8f9b9cbce53/reaudit/source');
const sourceVerification = verifyProviderSource(source, process.argv[3]);
const fixtureEnv = {
  SUPABASE_URL: 'https://db.invalid',
  SUPABASE_ANON_KEY: 'synthetic-public-marker',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-marker',
};
let handler;
globalThis.Deno = { env: { get: name => fixtureEnv[name] }, serve: fn => { handler = fn; } };
globalThis.fetch = () => { throw new Error('Real fetch forbidden in audit probe'); };
const ownMessage = '22222222-2222-4222-8222-222222222222';
const privateTarget = 'https://db.invalid/storage/v1/object/sign/whatsapp-media/other-contact/private.ogg';
const ownMedia = 'https://db.invalid/storage/v1/object/sign/whatsapp-media/own-contact/own.ogg';
let visibleMedia = null;
let mode = 'audio';
let dbOps = [];
let downloads = [];
let authChecks = 0;
const factory = (_url, key) => {
  const scope = key === fixtureEnv.SUPABASE_SERVICE_ROLE_KEY ? 'service' : 'caller';
  return {
    auth: { getUser: async () => { authChecks++; return { data: { user: { id: 'caller-fixture' } }, error: null }; } },
    storage: { from: bucket => ({ download: async objectPath => {
      downloads.push({ scope, bucket, path: objectPath });
      return { data: new Blob(['synthetic audio bytes'], { type: 'audio/ogg' }), error: null };
    } }) },
    from(table) {
      const query = { table, scope, operation: 'select', filters: [], payload: null };
      const q = {};
      for (const method of ['select', 'eq', 'lt', 'not', 'insert', 'update']) {
        q[method] = (...args) => {
          if (method === 'insert' || method === 'update') { query.operation = method; query.payload = args[0]; }
          else query.filters.push({ method, args });
          return q;
        };
      }
      function execute() {
        dbOps.push(structuredClone(query));
        if (mode === 'audio') {
          assert.equal(table, 'messages');
          assert.equal(scope, 'caller');
          assert(query.filters.some(x => x.method === 'eq' && x.args[0] === 'id' && x.args[1] === ownMessage));
          return { data: { id: ownMessage, media_url: visibleMedia }, error: null };
        }
        if (table === 'auto_close_config') return { data: { is_enabled: true, inactivity_hours: 24, close_message: 'synthetic closure' }, error: null };
        if (table === 'contacts' && query.operation === 'select') return { data: [{ id: 'fixture-contact', name: 'Fixture', phone: '000', assigned_to: 'fixture-agent' }], error: null };
        return { data: null, error: { code: 'SYNTHETIC_WRITE_FAILURE', message: 'offline write refused' } };
      }
      q.maybeSingle = () => Promise.resolve(execute());
      q.single = () => Promise.resolve(execute());
      q.then = (resolve, reject) => Promise.resolve().then(execute).then(resolve, reject);
      return q;
    },
  };
};
globalThis.__privilegedAuditClient = factory;
const stub = s => `data:text/javascript,${encodeURIComponent(s)}`;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'https://esm.sh/@supabase/supabase-js@2.87.1') {
    return { url: stub('export const createClient = (...args) => globalThis.__privilegedAuditClient(...args);'), shortCircuit: true };
  }
  return next(specifier, context);
} });
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
const logCapture = [];
for (const key of Object.keys(originalConsole)) console[key] = (...args) => logCapture.push({ key, args });

const importSource = rel => import(pathToFileURL(path.join(source, rel)).href);
const { assertMessageVisibleToCaller } = await importSource('supabase/functions/_shared/ai-audio-authz.ts');
const { parseApprovedStorageUrl } = await importSource('supabase/functions/_shared/ssrf.ts');
const transcribePath = 'supabase/functions/ai-transcribe-audio/index.ts';
const transcribe = fs.readFileSync(path.join(source, transcribePath), 'utf8');
const downloadStart = transcribe.indexOf('const MAX_AUDIO_SIZE =');
const downloadEnd = transcribe.indexOf('Deno.serve(', downloadStart);
assert(downloadStart > 0 && downloadEnd > downloadStart);
const vmScope = { Blob, ArrayBuffer, Deno: globalThis.Deno, createClient: factory, parseApprovedStorageUrl };
runInNewContext(stripTypeScriptTypes(transcribe.slice(downloadStart, downloadEnd)) + '\nglobalThis.capturedDownload = downloadAudio;', vmScope);
const selectionStart = transcribe.indexOf('let audioUrl = requestedAudioUrl;');
const selectionEnd = transcribe.indexOf('log.info("Starting transcription"', selectionStart);
assert(selectionStart > 0 && selectionEnd > selectionStart);
const selection = stripTypeScriptTypes('(async () => {' + transcribe.slice(selectionStart, selectionEnd) + '\nreturn audioUrl;})()');
const req = new Request('https://edge.invalid/transcribe', { headers: { Authorization: 'Bearer synthetic-caller-marker' } });
const log = { info() {}, error() {} };
const results = [];
async function chooseAndDownload() {
  const selected = await runInNewContext(selection, {
    requestedAudioUrl: privateTarget, identity: { kind: 'user', userId: 'caller-fixture' },
    assertMessageVisibleToCaller, req, messageId: ownMessage,
    errorResponse: () => { throw new Error('Unexpected authorization denial'); },
  });
  const downloaded = await vmScope.capturedDownload(selected, log);
  assert(!('error' in downloaded));
  return selected;
}

// P16: a visible text message has no media_url. The caller-selected private
// path survives and is downloaded with service scope.
visibleMedia = null;
const selectedNull = await chooseAndDownload();
assert.equal(selectedNull, privateTarget);
assert.deepEqual(downloads.at(-1), { scope: 'service', bucket: 'whatsapp-media', path: 'other-contact/private.ogg' });
results.push({ id: 'P16', visibleMessageMedia: null, selected: selectedNull, download: downloads.at(-1), outcome: 'visible text message authorizes caller-selected storage object under service scope' });

// P17: control. A canonical media_url correctly replaces the supplied path;
// the defect is specifically the missing-media branch, not every request.
visibleMedia = ownMedia;
const selectedOwn = await chooseAndDownload();
assert.equal(selectedOwn, ownMedia);
assert.equal(downloads.at(-1).path, 'own-contact/own.ogg');
results.push({ id: 'P17', visibleMessageMedia: ownMedia, selected: selectedOwn, download: downloads.at(-1), outcome: 'control: non-null canonical media_url wins' });

// P18: actual complete handler. The scan succeeds, every attempted write fails
// with a PostgREST-style error result, and the response still counts one close.
mode = 'auto-close';
dbOps = [];
authChecks = 0;
await importSource('supabase/functions/auto-close-conversations/index.ts');
assert.equal(typeof handler, 'function');
const response = await handler(new Request('https://edge.invalid/auto-close', { method: 'POST' }));
const body = await response.json();
assert.equal(response.status, 200);
assert.equal(body.closed, 1);
assert.equal(authChecks, 0);
assert.equal(dbOps.filter(x => x.operation === 'insert' || x.operation === 'update').length, 3);
results.push({ id: 'P18', responseStatus: response.status, body, authChecks, writesAttempted: dbOps.filter(x => x.operation !== 'select'), outcome: 'all three writes refused; actual handler still returns closed=1' });

for (const key of Object.keys(originalConsole)) console[key] = originalConsole[key];
const files = [transcribePath, 'supabase/functions/_shared/ai-audio-authz.ts', 'supabase/functions/_shared/ssrf.ts', 'supabase/functions/auto-close-conversations/index.ts'];
const output = {
  head: sourceVerification.actual_head,
  source_verification: sourceVerification,
  actual_network_requests: 0, actual_database_requests: 0, actual_environment_reads: 0, source_changes: 0,
  method: 'P16/P17 exact source URL-selection and download blocks + imported visibility/storage parser; P18 full unchanged handler. Only SDK and runtime boundaries replaced. User identity and valid input are preconditions; no claim to execute the full transcription endpoint or its schema/provider.',
  source_hashes: Object.fromEntries(files.map(rel => [rel, createHash('sha256').update(fs.readFileSync(path.join(source, rel))).digest('hex')])),
  results,
};
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'privileged-effects-probe-results.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ passed: results.length, ids: results.map(x => x.id), network: 0, database: 0, sourceChanges: 0 }));
