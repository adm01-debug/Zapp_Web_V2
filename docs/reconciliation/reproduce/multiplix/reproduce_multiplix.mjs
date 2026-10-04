// Offline audit probe for ONE audited Git baseline, not a general code runner.
// All DB operations and provider sends are in memory; global fetch throws.
// Requires Node >= 24 and /usr/bin/git. Run a scratch copy: the JSON output is
// written beside this script. CLI/environment input selects a repository only;
// it is never interpolated into executable JavaScript or a shell command.
import {
 closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync,
 realpathSync, writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, isAbsolute, parse, relative, sep } from 'node:path';

const BASELINE = '2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6';
// SHA-256 and byte lengths were derived from `git show BASELINE:path`, not from
// an arbitrary checkout. This is the complete allowlist of repository sources
// read or executed, including personalize's otherwise transitive dependency.
const SOURCE_ALLOWLIST = Object.freeze({
 window: Object.freeze({
  path: 'supabase/functions/_shared/talkx-window.ts', bytes: 5007,
  sha256: '18833512cfb4500ff281be4c8d2ce61a82801c9bd66cecd514e929c52c3b6304',
 }),
 personalize: Object.freeze({
  path: 'supabase/functions/_shared/messaging/personalize.ts', bytes: 9884,
  sha256: '04f9405526d62f1d9b42278697073b6d4451dfe4e51a6644d6cd51dd257fb33a',
 }),
 worker: Object.freeze({
  path: 'supabase/functions/multiplix-send/index.ts', bytes: 40505,
  sha256: 'c14c543d34b52761a77dccf371cbdb3a26d8952aa2e35d1e4c00fc4acebcadfc',
 }),
 mocks: Object.freeze({
  path: 'supabase/functions/multiplix-send/index.test.ts', bytes: 62114,
  sha256: '73052b058b26cb52950a131245095eea56dcdeda9f8d5180c770a4bfd9ba9005',
 }),
});

function rejectSymlinkComponents(path) {
 const root = parse(path).root;
 let current = root;
 for (const part of path.slice(root.length).split(sep).filter(Boolean)) {
  current = resolve(current, part);
  if (lstatSync(current).isSymbolicLink()) throw new Error('Symlink paths are forbidden in this probe');
 }
}

function canonicalPath(path, kind) {
 rejectSymlinkComponents(path);
 if (realpathSync(path) !== path) throw new Error('Path must be canonical');
 const stat = lstatSync(path);
 if (kind === 'directory' ? !stat.isDirectory() : !stat.isFile()) {
  throw new Error(`Expected a regular ${kind}`);
 }
 return stat;
}

function readGit(repo, args) {
 // Fixed executable and environment: neither PATH nor inherited GIT_* may
 // select another program, worktree, object replacement, or configuration.
 return execFileSync('/usr/bin/git', [
  '--no-replace-objects', '-c', 'core.fsmonitor=false', '-C', repo, ...args,
 ], {
  encoding: 'utf8', timeout: 10000, maxBuffer: 16384,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
   PATH: '/usr/bin:/bin', LANG: 'C', GIT_CONFIG_NOSYSTEM: '1',
   GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0',
  },
 }).trim();
}

function requireBaseline(repo) {
 if (readGit(repo, ['rev-parse', '--verify', 'HEAD^{commit}']) !== BASELINE) {
  throw new Error(`Repository HEAD must equal audited baseline ${BASELINE}`);
 }
}

function repositoryRoot() {
 if (process.argv.length > 3) throw new Error('Expected at most one repository root argument');
 const selected = process.argv[2] ?? (process.env.RECONCILIATION_REPO || process.cwd());
 if (!selected || selected.includes('\0')) throw new Error('Invalid repository root');
 // Check the original traversal too: resolve() alone would erase a symlink
 // component followed by ".." before the canonical-path check could see it.
 rejectSymlinkComponents(isAbsolute(selected) ? selected : `${process.cwd()}${sep}${selected}`);
 const repo = resolve(selected);
 canonicalPath(repo, 'directory');
 if (readGit(repo, ['rev-parse', '--show-toplevel']) !== repo) {
  throw new Error('Repository root must equal the canonical Git toplevel');
 }
 requireBaseline(repo);
 return repo;
}

function attestSources(repo) {
 const verified = {};
 for (const [name, source] of Object.entries(SOURCE_ALLOWLIST)) {
  const path = resolve(repo, source.path);
  const within = relative(repo, path);
  if (!within || within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) {
   throw new Error('Source escapes the attested repository root');
  }
  const before = canonicalPath(path, 'file');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
   const opened = fstatSync(fd);
   if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
    throw new Error(`Source changed while opening: ${source.path}`);
   }
   if (opened.size !== source.bytes) throw new Error(`Source byte length mismatch: ${source.path}`);
   bytes = readFileSync(fd);
   const after = canonicalPath(path, 'file');
   if (after.dev !== opened.dev || after.ino !== opened.ino) {
    throw new Error(`Source changed while reading: ${source.path}`);
   }
  } finally {
   closeSync(fd);
  }
  if (bytes.length !== source.bytes || createHash('sha256').update(bytes).digest('hex') !== source.sha256) {
   throw new Error(`Source SHA-256 mismatch: ${source.path}`);
  }
  verified[name] = bytes.toString('utf8');
 }
 requireBaseline(repo);
 // Strings are immutable snapshots. No source is reopened or imported after
 // this complete attestation barrier, including when compiling dependencies.
 return Object.freeze(verified);
}

function uniqueOffset(source, marker) {
 const offset = source.indexOf(marker);
 if (offset < 0 || source.indexOf(marker, offset + marker.length) !== -1) {
  throw new Error('Pinned source marker must occur exactly once');
 }
 return offset;
}

function pinnedSlice(source, start, end) {
 const first = uniqueOffset(source, start);
 const last = uniqueOffset(source, end);
 if (last <= first) throw new Error('Invalid pinned source boundaries');
 return source.slice(first, last);
}

function replaceOnce(source, from, to) {
 const offset = uniqueOffset(source, from);
 return source.slice(0, offset) + to + source.slice(offset + from.length);
}

const sources = attestSources(repositoryRoot());
// Deterministic cuts apply to the pinned TypeScript, before the Node transform.
// They exclude module imports/reexports, the server entrypoint, Deno.test calls
// and the test helpers that replace global fetch. No multiline import regex or
// dynamic module loader is involved. Changing the baseline requires review of
// both the hashes and these exact boundaries/exports.
let windowSource = sources.window;
for (const declaration of [
 'const DEFAULT_SCHEDULE_TIMEZONE', 'function parseBusinessHours',
 'function localClockInTimezone', 'function deliveryWindowStatus',
]) windowSource = replaceOnce(windowSource, `export ${declaration}`, declaration);
let personalizeSource = pinnedSlice(sources.personalize,
 'export function getGreeting(', '\n/**\n * Dialeto Multiplix: conjunto FIXO de placeholders');
for (const declaration of ['function getGreeting', 'function formatDateInTimezone', 'function personalize(']) {
 personalizeSource = replaceOnce(personalizeSource, `export ${declaration}`, declaration);
}
let workerSource = pinnedSlice(sources.worker,
 'function timingSafeStringEqual(', '\nif (import.meta.main) {');
workerSource = replaceOnce(workerSource, 'export async function handleMultiplixSend(', 'async function handleMultiplixSend(');
const mockSource = pinnedSlice(sources.mocks, 'const TEST_CRON_SECRET = ',
 '\n// Stub do fetch para provar que nenhum POST de mensagem sai para o provedor.');
const transform = source => stripTypeScriptTypes(source, {mode: 'transform'});
// Function is intentional here: only the four fully attested, fixed source
// snapshots above become code, with literal bindings/return statements. This
// executes trusted baseline code with offline dependencies; it is not a sandbox
// for arbitrary JavaScript. No CLI text, file path or unverified source is code.
const { deliveryWindowStatus, DEFAULT_SCHEDULE_TIMEZONE } = Function(
 '"use strict";\n' + transform(windowSource) + '\nreturn {deliveryWindowStatus, DEFAULT_SCHEDULE_TIMEZONE};',
)();
const personalize = Function('DEFAULT_SCHEDULE_TIMEZONE',
 '"use strict";\n' + transform(personalizeSource) + '\nreturn personalize;',
)(DEFAULT_SCHEDULE_TIMEZONE);
const env = new Map(Object.entries({SUPABASE_URL:'https://offline.invalid', SUPABASE_SERVICE_ROLE_KEY:'FAKE-SERVICE', EVOLUTION_API_URL:'https://provider.invalid', EVOLUTION_API_KEY:'FAKE-GLOBAL', EVOLUTION_INSTANCE_TOKEN:'FAKE-INSTANCE', EVOLUTION_API_FLAVOR:'go'}));
globalThis.Deno = { env:{ get:k=>env.get(k), set:(k,v)=>env.set(k,v), delete:k=>env.delete(k) }, test:()=>{} };
globalThis.fetch = async () => { throw new Error('Network forbidden in audit probe'); };
let sends=[];
let responseStatus=200;
const imports={
 createClient(){throw new Error('Real DB client forbidden');},
 enforceRateLimit:async()=>({allowed:true}), getCorsHeaders:()=>({}), handleCors:()=>null,
 Logger:class {warn(){} error(){} done(){}},
 evoFetch:async()=>({}), extractMessageId:()=>null,
 deliveryWindowStatus, DEFAULT_SCHEDULE_TIMEZONE,
 resolvePrivateBucketUrl:async()=>{throw new Error('Storage forbidden in this text probe');},
 liveTalkXInstanceId:c=>c?.status==='connected'?c.instance_id:null,
 newCorrelationId:()=>crypto.randomUUID(), normalizePhone:p=>p,
 personalize,
 prepareMedia:async()=>{throw new Error('Media forbidden in text probe');},
 providerErrorInfo:()=>({class:'transient',code:'rate_limited',operatorMessage:'Limite do provedor'}),
 randomBetween:()=>0,sleep:async()=>{},
 send:async(item,deps)=>{
  sends.push({item,instanceTokenPresent:typeof deps.instanceToken==='string',flavor:deps.flavor});
  return {status:responseStatus,ok:responseStatus===200,body:responseStatus===200?{id:'fake-id'}:{error:'Too many requests'},messageId:responseStatus===200?'fake-id':null};
 },
};
const handleMultiplixSend=Function(...Object.keys(imports),'"use strict";\n'+transform(workerSource)+'\nreturn handleMultiplixSend;')(...Object.values(imports));
const h=Function('"use strict";\n'+transform(mockSource)+'\nreturn {dispatchRow,recipientRow,newCtx,mockDeps,makePost,TEST_CRON_SECRET};')();
const result=[];
for(const [caseName,template,blockText,company,httpStatus] of [
 ['distinct_block_content','GLOBAL {{empresa}}','BLOCO CORRETO {{empresa}}','Empresa 1',200],
 ['missing_variable','Ola {{empresa}}','Ola {{empresa}}',null,200],
 ['provider_429','Teste {{empresa}}','Teste {{empresa}}','Empresa 1',429],
]){
 sends=[];responseStatus=httpStatus;
 const recipient={...h.recipientRow(1,'5511999990001'),company_name_snapshot:company};
 const opts={cronVaultResult:h.TEST_CRON_SECRET,dispatch:h.dispatchRow({message_template:template,total_recipients:1}),recipients:[recipient],blockContent:{text:blockText}};
 const ctx=h.newCtx(opts);
 const response=await handleMultiplixSend(h.makePost({cronSecret:h.TEST_CRON_SECRET}),h.mockDeps(opts,ctx));
 result.push({case:caseName,expectedBlockText:personalize(blockText,{company}).text,actualSends:sends,httpStatus:response.status,result:await response.json(),completionRpc:ctx.rpcCalls.filter(c=>c.name.includes('if_drained')),itemCompletions:ctx.completions,rescheduleCalls:ctx.rpcCalls.filter(c=>c.name==='reschedule_multiplix_item').length,personalization:personalize(template,{company})});
}
const output={baseline:BASELINE,mode:'OFFLINE_WORKER_WITH_REPO_MOCKS',limitations:'Provider send, database, clock delays and auth helper integrations are injected in memory. Does not establish deployed runtime or SQL behavior.',cases:result};
const outputDirectory = dirname(fileURLToPath(import.meta.url));
canonicalPath(outputDirectory, 'directory');
const outputPath = resolve(outputDirectory, 'offline_probe_results.json');
if (existsSync(outputPath)) canonicalPath(outputPath, 'file');
writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n', {
 flag: constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
});
console.log(JSON.stringify(output,null,2));
