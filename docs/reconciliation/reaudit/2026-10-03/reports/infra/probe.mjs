// Offline evidence for the infrastructure re-audit. Never invokes PostgreSQL,
// Docker, GitHub, Supabase, browsers or real network endpoints.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';

const root='/workspace/scratch/f8f9b9cbce53/reaudit/source';
const output='/workspace/scratch/f8f9b9cbce53/reaudit/reports/infra';
const pins=JSON.parse(readFileSync(join(output,'probe-source-pins.json'),'utf8'));
const head=spawnSync('/usr/bin/git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'});
assert.equal(head.status,0);assert.equal(head.stdout.trim(),pins.baseline_sha);
for(const [p,expected] of Object.entries(pins.source_sha256)) {
  assert.equal(createHash('sha256').update(readFileSync(join(root,p))).digest('hex'),expected,`Source changed: ${p}`);
}
const temp=mkdtempSync(join(tmpdir(),'r2-infra-offline-'));
globalThis.fetch=async()=>{throw new Error('Network prohibited in infra re-audit probe');};
const sourceHashes={};
const source=(p)=>{const s=readFileSync(join(root,p),'utf8');sourceHashes[p]=createHash('sha256').update(s).digest('hex');return s;};
const imported=async(p)=>{source(p);return import(pathToFileURL(join(root,p)).href);};
const results=[];
const record=(id,actual,expected)=>{results.push({id,actual,expected});};

const {withPsqlEnvironment}=await imported('scripts/db-audit/psql-environment.mjs');
const {endurecerDestinoTls}=await imported('scripts/db-audit/database-identity.mjs');
const raw='postgresql://postgres:synthetic-password@db.tnnnlkbymytvtqngbbqh.supabase.co/postgres';
const hardened=endurecerDestinoTls(raw);
assert.equal(hardened.erros.length,0);
const projection=(e)=>({sslmode:e.PGSSLMODE??null,sslrootcert:e.PGSSLROOTCERT??null,uriLeaked:'DESTINO_URL' in e});
const tlsRaw=withPsqlEnvironment(raw,projection,{baseEnv:{PGSSLMODE:'verify-full'}});
const tlsHardened=withPsqlEnvironment(hardened.connectionString,projection,{baseEnv:{PGSSLMODE:'verify-full'}});
assert.equal(tlsRaw.sslmode,null);assert.equal(tlsHardened.sslmode,'verify-full');
record('tls_raw_override', {raw:tlsRaw,hardened:tlsHardened}, 'The caller must pass the hardened URI; inherited PGSSLMODE is discarded.');

const {lerContrato}=await imported('scripts/db-audit/run-runtime-contract.mjs');
const contract=lerContrato('20260830170000');
assert.ok(contract.trimStart().startsWith('RUNTIME=$('));
let missing=false;try{lerContrato('20260909250000');}catch(e){missing=/contrato de runtime ausente/.test(e.message);}
assert.ok(missing);
record('runtime_contract_shell', {firstToken:contract.trimStart().split(/\s/)[0],existingMigrationContractMissing:missing}, 'SQL runner receives shell text; other existing versions cannot reach generic fallback.');

const {main:checkTypes}=await imported('scripts/ci/typecheck-ratchet.mjs');
const badCompilerOutput=join(temp,'compiler-error.txt');
writeFileSync(badCompilerOutput,"error TS5083: Cannot read file '/synthetic/missing-tsconfig.json'.\n");
const typeExit=checkTypes(['--root',root,'--output',badCompilerOutput]);assert.equal(typeExit,0);
record('global_compiler_error_passes',{exit:typeExit,diagnostic:'TS5083'},'A global TypeScript error must not pass the ratchet.');
const isolated=join(temp,'implicit');mkdirSync(join(isolated,'scripts/ci'),{recursive:true});
for(const f of ['implicit-any-ratchet.mjs','implicit-any-baseline.json']){source('scripts/ci/'+f);copyFileSync(join(root,'scripts/ci',f),join(isolated,'scripts/ci',f));}
const implicit=spawnSync(process.execPath,[join(isolated,'scripts/ci/implicit-any-ratchet.mjs')],{cwd:isolated,encoding:'utf8',env:{PATH:'/usr/bin:/bin'}});
assert.equal(implicit.status,0);assert.match(implicit.stdout,/implicit-any errors: 0/);
record('missing_compiler_passes',{exit:implicit.status,report:implicit.stdout.trim()},'Missing local compiler must be an operational failure, not zero errors.');

const {main:auditProd}=await imported('scripts/ci/audit-prod.mjs');
const failedAudit=join(temp,'failed-audit.txt');writeFileSync(failedAudit,'error: Could not retrieve the vulnerability database.\n');
const auditExit=auditProd(['--input',failedAudit],root);assert.equal(auditExit,0);
record('invalid_audit_report_passes',{exit:auditExit,input:'error: Could not retrieve the vulnerability database.'},'An error containing the word vulnerability must not qualify as an audit report.');

const {decidirReescrita}=await imported('scripts/edge-deploy/secrets-scope.mjs');
const secretDecisions=[{rotateSecrets:true,nomesRemotos:['CRON_SECRET']},{nomesRemotos:null},{nomesRemotos:[],nomesEsperados:['CRON_SECRET']}].map(decidirReescrita);
assert.ok(secretDecisions.every(x=>x.reescrever));
record('dry_run_secret_decisions',{decisions:secretDecisions.map(x=>x.reescrever)},'The workflow must gate the write step independently on dry_run.');

const fixture=source('e2e/fixtures/e2e-contact.ts');
const start=fixture.indexOf('export async function cleanupE2EReactions(');
const end=fixture.indexOf('// Garante que o alvo NAO',start);
assert.ok(start>0&&end>start);
const functionCode=stripTypeScriptTypes(fixture.slice(start,end)).replace('export async function','async function');
const captures=[];
const cleanup=Function('getSession','getCurrentProfileId','SUPABASE_ANON_KEY','SUPABASE_URL',functionCode+'\nreturn cleanupE2EReactions;')(
  async()=>({accessToken:'synthetic-access-token'}),async()=> 'synthetic-profile', 'synthetic-key','https://example.invalid');
await cleanup({request:{delete:async(url)=>{captures.push(url);return {ok:()=>true,status:()=>200,json:async()=>[{id:'synthetic-row'}]};}}});
assert.equal(captures.length,1);assert.equal(new URL(captures[0]).search,'?user_id=eq.synthetic-profile');
record('reaction_cleanup_scope',{query:new URL(captures[0]).search},'Deletion should be restricted to E2E-owned message IDs or a run-specific fixture, not every reaction of the logged-in profile.');

source('scripts/db-tests/run-all.mjs');
function runDbHarness(payload){
 const stub='globalThis.fetch=async()=>({ok:true,json:async()=>('+JSON.stringify(payload)+')});';
 return spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(stub),join(root,'scripts/db-tests/run-all.mjs')],{encoding:'utf8',env:{PATH:'/usr/bin:/bin',SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_KEY:'synthetic-key'}});
}
const wrapped=runDbHarness({rows:[{result:'PASS',test:'synthetic'}],row_count:1,truncated:false,ms:1});
const empty=runDbHarness([]);
assert.equal(wrapped.status,1);assert.match(wrapped.stderr,/rows.filter is not a function/);assert.equal(empty.status,0);
record('db_tests_response_contract',{actualRpcEnvelopeExit:wrapped.status,emptyArrayExit:empty.status,emptyReport:empty.stdout.trim().split('\n').at(-1)},'RPC envelopes must be decoded and each expected assertion must return a result; zero assertions is not a pass.');

const {acharExposicoes}=await imported('scripts/ci/check-edge-error-exposure.mjs');
const multi='return new Response(JSON.stringify({error: err.message}), {\n  status: 500\n});';
assert.equal(acharExposicoes(multi).length,0);
const current=[
 'supabase/functions/searchbox-budget-alert/index.ts',
 'supabase/functions/webhook-diagnostic/index.ts',
].map(path=>({path,matches:acharExposicoes(source(path)).length}));
assert.ok(current.every(x=>x.matches===0));
record('multiline_error_guard',{matches:acharExposicoes(multi).length,currentSourceScan:current},'Line-based matching misses raw 5xx Response bodies when message precedes status; the shared errorResponse helper separately sanitizes 5xx.');

writeFileSync(join(output,'offline-probes.json'),JSON.stringify({baseline_sha:'da307ba5626dce892f0b37cb6762463f55d14a96',mode:'offline-only',network_requests:0,database_statements:0,sourceHashes,results},null,2)+'\n');
console.log('INFRA_OFFLINE_PROBES',results.length,'completed with synthetic inputs. No network or database calls.');
