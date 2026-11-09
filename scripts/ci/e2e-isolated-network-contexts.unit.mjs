import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { identity, VERSION, requestScope } from '../e2e-isolated/network-proof-policy.mjs';
import { CONTROL, protocolFileIdentity, writeAtomicJson } from '../e2e-isolated/network-proof-browser.mjs';
import { SCOPE, SOURCE, TEST_OUTPUT, TEST_RESULTS, TEST_TITLE, assertConfig, assertContextFailure, assertContextResult, assertTestRecord, assertTestRunner,
  contextResultPassed, envelope, qualifications, summarizeContexts, validateContextsReport } from '../e2e-isolated/network-contexts-policy.mjs';
import { ContextsReporter, FIXED_SOURCES, localRequest, makeTestConfiguration, observeCycle, observeExplicitFalse, runRealTest, testEnvironment, verifySources, verifyTestOutput } from '../e2e-isolated/network-contexts-browser.mjs';
import { ContextRuntime, collectContextOutcome, orchestrateContexts, writeContextSources } from '../e2e-isolated/network-contexts.mjs';
import { jobOf, nestedValue, onlyStep, runOf, stepsOf, valueOf } from './workflow-test-support.mjs';

const ID=identity('zapp-e2e-context-unit-00000000','a'.repeat(40)),clone=x=>structuredClone(x);
const cfg=(engine='chromium')=>({...envelope(ID,engine),namespace:'net:[2345]',canary_url:'http://192.0.2.22:4444/canary/'+'b'.repeat(32)});
const events=(offline=0,online=0)=>({offline,online});
function fixture(engine='chromium'){
  const initial=engine==='firefox';
  return {...envelope(ID,engine),native:{online:initial,https:true,node_https:true,tls_untrusted_rejected:true,tls_wrong_san_rejected:true,external_node_blocked:true,external_browser_blocked:true},
    test_default:{online:true,https:true,tls_untrusted_rejected:true,tls_wrong_san_rejected:true,external_browser_blocked:true,fixture_offline:false,ignore_https_errors:false,service_workers:'block',source:'playwright-test-fixture',browser_version:'156.0.0'},
    explicit_option_false:{online:engine!=='chromium',https:true},explicit_false:{before:initial,after:initial,https:true,events:events()},
    api_cycle:[{requested_offline:true,before:initial,after:false,request:'blocked',events:events(initial?1:0)},
      {requested_offline:false,before:false,after:true,request:'passed',events:events(0,1)},
      {requested_offline:true,before:true,after:false,request:'blocked',events:events(1)},
      {requested_offline:false,before:false,after:true,request:'passed',events:events(0,1)}],
    fresh:{online:initial,https:true,unemulated:true},versions:{node:'v24.22.1',playwright:VERSION,browser:'156.0.0'}};
}
const runnerRecord=engine=>({...envelope(ID,engine),tests:1,passed:1,failed:0,skipped:0,retries:0,status:'passed',error:false});
for(const [key,value] of [['tests',0],['passed',0],['failed',1],['skipped',1],['retries',1],['status','failed'],['error',true]])
  test('Test runner independently rejects '+key,()=>assert.throws(()=>assertTestRunner({...runnerRecord('chromium'),[key]:value},cfg())));
const temp=fn=>{const directory=mkdtempSync(path.join(tmpdir(),'contexts-unit-'));chmodSync(directory,0o700);return Promise.resolve().then(()=>fn(directory)).finally(()=>rmSync(directory,{recursive:true,force:true}));};
const put=(file,data)=>writeFileSync(file,JSON.stringify(data)+'\n',{mode:0o600});
for(const engine of ['chromium','firefox','webkit'])test('closed context result accepts observed natural '+engine,()=>{const r=fixture(engine);assertContextResult(r,cfg(engine));assert.equal(contextResultPassed(r),true);});
const malformed={
  'schema':r=>r.schema=1,'scope':r=>r.scope='network-proof','run':r=>r.run_id='zapp-e2e-other-00000000','sha':r=>r.source_sha='b'.repeat(40),
  'engine':r=>r.engine='firefox','raw output':r=>r.stderr='secret','missing native':r=>delete r.native.online,'nonboolean':r=>r.native.online='false',
  'skip Test substitute':r=>r.test_default.source='mock','wrong fixture default':r=>r.test_default.fixture_offline=true,
  'TLS bypass':r=>r.test_default.ignore_https_errors=true,'service workers':r=>r.test_default.service_workers='allow',
  'missing second cycle':r=>r.api_cycle.pop(),'wrong requested direction':r=>r.api_cycle[0].requested_offline=false,
  'discontinuous cycle':r=>r.api_cycle[2].before=false,'raw fetch error':r=>r.api_cycle[0].request='TLS failed',
  'negative events':r=>r.api_cycle[0].events.offline=-1,'event overflow':r=>r.api_cycle[0].events.offline=9,
  'fresh emulated':r=>r.fresh.unemulated=false,'version mismatch':r=>r.versions.playwright='1.64.0',
  'Test browser mismatch':r=>r.test_default.browser_version='1.2','raw browser version':r=>r.versions.browser='secret',
};
for(const [name,mutate] of Object.entries(malformed))test('policy rejects '+name,()=>{const r=fixture();mutate(r);assert.throws(()=>assertContextResult(r,cfg()));});
const behavior={
  'native HTTPS':r=>r.native.https=false,'Node HTTPS':r=>r.native.node_https=false,'CA accepted':r=>r.native.tls_untrusted_rejected=false,
  'SAN accepted':r=>r.native.tls_wrong_san_rejected=false,'Node egress':r=>r.native.external_node_blocked=false,'browser egress':r=>r.native.external_browser_blocked=false,
  'Test HTTPS':r=>r.test_default.https=false,'Test CA':r=>r.test_default.tls_untrusted_rejected=false,'Test SAN':r=>r.test_default.tls_wrong_san_rejected=false,
  'Test egress':r=>r.test_default.external_browser_blocked=false,'option HTTPS':r=>r.explicit_option_false.https=false,
  'setter HTTPS':r=>r.explicit_false.https=false,'setter causes offline':r=>r.explicit_false.events.offline=1,
  'setter context contaminated':r=>r.explicit_false.before=true,'cycle context contaminated':r=>r.api_cycle[0].before=true,
  'offline request succeeds':r=>r.api_cycle[0].request='passed','timeout is not offline proof':r=>r.api_cycle[0].request='timeout',
  'HTTP error is not offline proof':r=>r.api_cycle[0].request='failed','offline event missing':r=>r.api_cycle[2].events.offline=0,
  'online event missing':r=>r.api_cycle[3].events.online=0,'opposite stale event':r=>r.api_cycle[2].events.online=1,
  'fresh context contaminated':r=>r.fresh.online=true,'fresh HTTPS':r=>r.fresh.https=false,
};
for(const [name,mutate] of Object.entries(behavior))test('qualified failure stays failure: '+name,()=>{const r=fixture();mutate(r);assertContextResult(r,cfg());assert.equal(contextResultPassed(r),false);});
test('unchanged native false does not manufacture first offline event',()=>{const r=fixture();assert.equal(r.api_cycle[0].events.offline,0);assert.equal(qualifications(r).api,true);});
test('test_default false is a measured distinction, not natural qualification',()=>{const r=fixture();r.test_default.online=false;assert.equal(contextResultPassed(r),true);assert.equal(qualifications(r).test_default_online,false);});
for(const [key,value] of [['schema',1],['scope','network-proof'],['namespace','host'],['canary_url',null],['extra',true]])
  test('config rejects '+key,()=>assert.throws(()=>assertConfig({...cfg(),[key]:value},cfg())));
const failure={...envelope(ID,'chromium'),phase:'test-default',observations:{native_online:false,test_default_online:null}};
test('bounded failure preserves native false',()=>assertContextFailure(failure,cfg()));
for(const [key,value] of [['phase','raw-stack'],['engine','webkit'],['stack','secret']])test('failure rejects '+key,()=>assert.throws(()=>assertContextFailure({...failure,[key]:value},cfg())));

function modelRuntime(){const trace=[];return {trace,prepare:async()=>trace.push('prepare'),startVariant:async v=>{assert.equal(v,'baseline');trace.push(v);},runContext:async engine=>{trace.push(engine);return {result:fixture(engine),failure:null};},cleanup:async()=>{trace.push('cleanup');return true;}};}
test('actual orchestration preserves all four outcome dimensions',async()=>{const rt=modelRuntime(),r=await orchestrateContexts(rt,ID);assert.equal(r.status,'passed');assert.equal(r.collection_complete,true);assert.equal(r.official_api_cycle_passed,true);assert.equal(r.test_default_online_all,true);assert.equal(r.native_online_all,false);assert.equal(r.native_contract_qualified,false);assert.equal(r.authenticated_admission,false);assert.equal(r.plan_fully_validated,false);assert.deepEqual(rt.trace,['prepare','baseline','chromium','firefox','webkit','cleanup']);});
for(const stage of ['prepare','startVariant','runContext','cleanup'])test('actual orchestration cleans and fails at '+stage,async()=>{const rt=modelRuntime();rt[stage]=async()=>{rt.trace.push(stage);throw Error('injected');};const r=await orchestrateContexts(rt,ID);assert.equal(r.status,'failed');assert.ok(rt.trace.includes('cleanup'));assert.equal(r.native_contract_qualified,false);});
test('actual orchestration reports complete measurements with failed API cycle',async()=>{const rt=modelRuntime();rt.runContext=async engine=>{const r=fixture(engine);r.api_cycle[2].events.offline=0;return {result:r,failure:null};};const r=await orchestrateContexts(rt,ID);assert.equal(r.collection_complete,true);assert.equal(r.official_api_cycle_passed,false);assert.equal(r.status,'failed');});
test('failed process never counts as complete Test measurement',async()=>{const rt=modelRuntime();rt.runContext=async engine=>({result:null,failure:{...failure,engine}});const r=await orchestrateContexts(rt,ID);assert.equal(r.collection_complete,false);assert.equal(r.native_online_all,null);assert.equal(r.test_default_online_all,null);});
for(const [name,mutate] of Object.entries({'overclaim native':r=>r.native_contract_qualified=true,'overclaim admission':r=>r.authenticated_admission=true,'overclaim plan':r=>r.plan_fully_validated=true,'overclaim veth':r=>r.unproved.veth='passed','wrong aggregate':r=>r.native_online_all=true,'wrong Test aggregate':r=>r.test_default_online_all=false,'partial complete':r=>r.engines.pop(),'duplicate engine':r=>r.engines[1]=clone(r.engines[0]),'cleanup hidden':r=>r.cleanup=false,'raw report':r=>r.log='secret'}))
  test('public report rejects '+name,async()=>{const r=await orchestrateContexts(modelRuntime(),ID);mutate(r);assert.throws(()=>validateContextsReport(r));});
test('summary of zero engines is incomplete, not vacuous all-online',()=>assert.deepEqual(summarizeContexts([]),{collection_complete:false,official_api_cycle_passed:false,native_online_all:null,test_default_online_all:null}));

test('fixed sources are exact, read only and versioned by identity',()=>temp(directory=>{const source=path.join(directory,'source');const ids=writeContextSources(source);assert.deepEqual(verifySources(source),ids);assert.deepEqual(Object.keys(ids).sort(),Object.keys(FIXED_SOURCES).sort());}));
for(const mutation of ['bytes','writable','extra','missing','symlink','hardlink'])test('fixed source rejects '+mutation,()=>temp(directory=>{
  const source=path.join(directory,'source');writeContextSources(source);const file=path.join(source,'reporter.mjs');
  if(mutation==='bytes'){chmodSync(file,0o600);writeFileSync(file,'different');chmodSync(file,0o400);}
  if(mutation==='writable')chmodSync(file,0o600);
  if(mutation==='extra')writeFileSync(path.join(source,'foreign.mjs'),'');
  if(mutation==='missing')rmSync(file);
  if(mutation==='symlink'){rmSync(file);symlinkSync(path.join(source,'context.spec.mjs'),file);}
  if(mutation==='hardlink')linkSync(file,path.join(directory,'second-link'));
  assert.throws(()=>verifySources(source));
}));
test('source directory symlink is not accepted',()=>temp(directory=>{const source=path.join(directory,'source');writeContextSources(source);symlinkSync(source,path.join(directory,'alias'));assert.throws(()=>verifySources(path.join(directory,'alias')));}));
function protocolFixture(directory){
  const control=path.join(directory,'control'),source=path.join(directory,'source'),output=path.join(directory,'output');
  mkdirSync(control,{mode:0o700});mkdirSync(output,{mode:0o700});mkdirSync(path.join(output,'results'),{mode:0o700});
  const sourceIdentities=writeContextSources(source),config=cfg(),identities={};
  for(const [name,value] of [['config.json',config],['trust-ready.json',{...envelope(ID,'chromium'),ready:true}]]){writeAtomicJson(path.join(control,name),value);identities[name]=protocolFileIdentity(path.join(control,name));}
  writeAtomicJson(path.join(control,'test-default.json'),{...envelope(ID,'chromium'),data:fixture().test_default});
  writeAtomicJson(path.join(control,'test-runner.json'),runnerRecord('chromium'));
  writeAtomicJson(path.join(control,'result.json'),fixture());put(path.join(output,'results/.last-run.json'),{status:'passed',failedTests:[]});
  return {directory:control,sources:source,output,config,identities,sourceIdentities,running:false,exitCode:0,timedOut:false};
}
test('actual collector requires closed Test proof after PID1 exit',()=>temp(directory=>assert.deepEqual(collectContextOutcome(protocolFixture(directory)),{result:fixture(),failure:null})));
for(const [name,mutate] of Object.entries({
  'running PID1':s=>s.running=true,'timed out late result':s=>s.timedOut=true,'nonzero with result':s=>s.exitCode=1,
  'missing exit':s=>s.exitCode=null,'config replaced':s=>put(path.join(s.directory,'config.json'),s.config),
  'source rewritten with same bytes':s=>{const f=path.join(s.sources,'reporter.mjs');chmodSync(f,0o600);writeFileSync(f,FIXED_SOURCES['reporter.mjs']);chmodSync(f,0o400);},
  'unexpected helper request':s=>put(path.join(s.directory,'request-1.json'),{}),'missing reporter':s=>rmSync(path.join(s.directory,'test-runner.json')),
  'missing Test data':s=>rmSync(path.join(s.directory,'test-default.json')),'different Test data':s=>put(path.join(s.directory,'test-default.json'),{...envelope(ID,'chromium'),data:{...fixture().test_default,online:false}}),
  'skipped test exit zero':s=>put(path.join(s.directory,'test-runner.json'),{...runnerRecord('chromium'),passed:0,skipped:1}),
  'retried test exit zero':s=>put(path.join(s.directory,'test-runner.json'),{...runnerRecord('chromium'),retries:1}),
  'zero tests exit zero':s=>put(path.join(s.directory,'test-runner.json'),{...runnerRecord('chromium'),tests:0,passed:0}),
  'last run failed':s=>put(path.join(s.output,'results/.last-run.json'),{status:'failed',failedTests:['x']}),
  'extra private output cannot count pass':s=>put(path.join(s.output,'raw.json'),{}),
  'extra nested Test artifact cannot count pass':s=>put(path.join(s.output,'results/raw.json'),{}),
  'wrong mode Test':s=>put(path.join(s.directory,'test-default.json'),{...envelope(ID,'chromium'),scope:'network-proof',data:fixture().test_default}),
}))test('collector rejects '+name,()=>temp(directory=>{const s=protocolFixture(directory);mutate(s);assert.throws(()=>collectContextOutcome(s));}));
test('nonzero PID1 accepts only bounded failure, never result',()=>temp(directory=>{const s=protocolFixture(directory);s.exitCode=1;rmSync(path.join(s.directory,'result.json'));put(path.join(s.directory,'failure.json'),failure);assert.deepEqual(collectContextOutcome(s),{result:null,failure});}));
test('output symlink is rejected',()=>temp(directory=>{const s=protocolFixture(directory);const last=path.join(s.output,'results/.last-run.json');rmSync(last);symlinkSync(path.join(s.directory,'result.json'),last);assert.throws(()=>verifyTestOutput(s.output));}));

function reporterRun(mutator=()=>{}){const writes=[],c=cfg();const r=new ContextsReporter({configReader:()=>c,writer:(file,value)=>writes.push({file,value})});
  const tc={title:TEST_TITLE,location:{file:SOURCE+'/context.spec.mjs'},expectedStatus:'passed'};
  const setup={workers:1,projects:[{name:'chromium',retries:0,outputDir:TEST_RESULTS}]},result={status:'passed',retry:0};
  mutator({r,tc,setup,result});r.onBegin(setup,{allTests:()=>[tc]});r.onTestEnd(tc,result);r.onEnd({status:'passed'});assert.equal(writes.length,1);return writes[0].value;}
test('actual reporter records one real fixture test',()=>assertTestRunner(reporterRun(),cfg()));
for(const [name,mutate] of Object.entries({'wrong title':x=>x.tc.title='other','wrong file':x=>x.tc.location.file='/work/e2e/auth.setup.ts','expected skip':x=>x.tc.expectedStatus='skipped','worker count':x=>x.setup.workers=2,'wrong project':x=>x.setup.projects[0].name='other','configured retries':x=>x.setup.projects[0].retries=1,'global error':x=>x.r.onError(),'skipped result':x=>x.result.status='skipped','retry result':x=>x.result.retry=1,'failed result':x=>x.result.status='failed'}))
  test('actual reporter rejects '+name,()=>assert.throws(()=>assertTestRunner(reporterRun(mutate),cfg())));
test('Test config deliberately omits offline and all app hooks',()=>{const c=makeTestConfiguration(cfg(),{PATH:'/usr/bin',HOME:'/home/unit'});assert.equal(Object.hasOwn(c.use,'offline'),false);assert.equal(Object.hasOwn(c,'globalSetup'),false);assert.equal(Object.hasOwn(c,'webServer'),false);assert.equal(c.workers,1);assert.equal(c.retries,0);assert.equal(c.timeout,30000);assert.equal(c.globalTimeout,45000);assert.equal(c.use.ignoreHTTPSErrors,false);assert.equal(c.use.serviceWorkers,'block');assert.equal(c.testDir,SOURCE);assert.equal(c.outputDir,TEST_RESULTS);assert.deepEqual(c.projects,[{name:'chromium'}]);});
test('fixed Test source has no skip, FIXME, app import or init script',()=>{const source=Object.values(FIXED_SOURCES).join('\n');assert.match(source,/createRequire\('\/work\/package.json'\)\('@playwright\/test'\)/);assert.match(source,/offline, ignoreHTTPSErrors, serviceWorkers/);assert.doesNotMatch(source,/test\.(skip|fixme|only|use)|addInitScript|src\/|auth\.setup|playwright\.config\.ts/);});
test('Test subprocess environment keeps TLS and strips Node injections',()=>{const e=testEnvironment({PATH:'/bin',HOME:'/safe',NODE_EXTRA_CA_CERTS:'/ca',SSL_CERT_FILE:'/bundle',NODE_OPTIONS:'--import malicious',PLAYWRIGHT_LAST_RUN_OUTPUT_FILE:'/foreign',ZAPP_NETWORK_RUN:ID.run_id});assert.equal(e.NODE_EXTRA_CA_CERTS,'/ca');assert.equal(e.SSL_CERT_FILE,'/bundle');assert.equal(e.NODE_OPTIONS,undefined);assert.equal(e.PLAYWRIGHT_LAST_RUN_OUTPUT_FILE,undefined);assert.equal(e.CI,'1');});
test('Test subprocess rejects proxy',()=>assert.throws(()=>testEnvironment({HTTPS_PROXY:'http://proxy.invalid'})));
function runnerDependencies(){const calls=[],data={...envelope(ID,'chromium'),data:fixture().test_default};return {calls,env:{PATH:'/bin'},cliPath:'/fixed/cli.js',verify:()=>({fixed:'identity'}),output:()=>true,
  runner:async(...args)=>{calls.push(args);return {code:0,stdout:'',signal:null,error:null,timedOut:false,truncated:false};},
  read:file=>file.endsWith('test-default.json')?clone(data):runnerRecord('chromium')};}
test('actual runner protocol invokes explicit fixed config, no app config',async()=>{const d=runnerDependencies();assert.deepEqual(await runRealTest(cfg(),d),fixture().test_default);assert.equal(d.calls.length,1);assert.deepEqual(d.calls[0][1],['/fixed/cli.js','test','--config',SOURCE+'/playwright.config.mjs']);assert.equal(d.calls[0][2].cwd,SOURCE);assert.equal(d.calls[0][2].timeout,45000);});
for(const [name,mutate] of Object.entries({'nonzero':d=>d.runner=async()=>({code:1,stdout:''}),'timeout':d=>d.runner=async()=>({code:0,stdout:'',timedOut:true}),'truncated':d=>d.runner=async()=>({code:0,stdout:'',truncated:true}),'signal':d=>d.runner=async()=>({code:0,stdout:'',signal:'SIGTERM'}),'missing Test output':d=>{const read=d.read;d.read=file=>file.endsWith('test-default.json')?null:read(file);},'source changed during runner':d=>{let n=0;d.verify=()=>({fixed:++n});},'unexpected output':d=>d.output=()=>{throw Error('extra');},'skip despite zero CLI':d=>{const read=d.read;d.read=file=>file.endsWith('test-runner.json')?{...runnerRecord('chromium'),passed:0,skipped:1}:read(file);}}))
  test('actual runner protocol rejects '+name,async()=>{const d=runnerDependencies();mutate(d);await assert.rejects(()=>runRealTest(cfg(),d));});

function fakePage(initial,{noOpFalse=true,omitEvent=null,fetchKind=null}={}){
  const listeners={},sandbox={navigator:{onLine:initial},window:{},AbortController,setTimeout,clearTimeout};let offline=false;
  sandbox.addEventListener=(name,fn)=>{(listeners[name]??=[]).push(fn);};
  sandbox.fetch=async()=>{if(fetchKind==='http')return {status:500,json:async()=>({})};if(fetchKind==='identity')return {status:200,json:async()=>({schema:1,run_id:'wrong',source_sha:ID.source_sha})};if(fetchKind==='timeout'){const e=Error('abort');e.name='AbortError';throw e;}if(offline)throw new TypeError('network blocked');return {status:200,json:async()=>({schema:1,run_id:ID.run_id,source_sha:ID.source_sha})};};
  const world=vm.createContext(sandbox);
  const page={evaluate:async(fn,arg)=>structuredClone(await vm.runInContext('('+fn.toString()+')('+JSON.stringify(arg)+')',world)),
    waitForFunction:async(fn,arg)=>{if(!await page.evaluate(fn,arg))throw Error('simulated wait deadline');}};
  const context={setOffline:async value=>{if(noOpFalse&&value===offline)return;offline=value;const next=!value;if(next!==sandbox.navigator.onLine){sandbox.navigator.onLine=next;const event=next?'online':'offline';if(event!==omitEvent)for(const fn of listeners[event]??[])fn();}}};
  return {page,context};
}
for(const initial of [false,true])test('actual cycle function executes two complete cycles from '+initial,async()=>{const {page,context}=fakePage(initial);const steps=await observeCycle(context,page,ID);assert.equal(steps.length,4);assert.deepEqual(steps.map(x=>x.request),['blocked','passed','blocked','passed']);assert.equal(steps[0].events.offline,initial?1:0);assert.equal(steps[2].events.offline,1);assert.equal(steps[3].events.online,1);});
test('actual setter false records Chromium no-op without inventing event',async()=>{const {page,context}=fakePage(false);const r=await observeExplicitFalse(context,page,ID);assert.deepEqual(r,{before:false,after:false,https:true,events:events()});});
test('actual setter false records engine that explicitly forces online',async()=>{const {page,context}=fakePage(false,{noOpFalse:false});const r=await observeExplicitFalse(context,page,ID);assert.equal(r.after,true);assert.equal(r.events.online,1);});
for(const event of ['offline','online'])test('actual cycle missing '+event+' event cannot qualify',async()=>{const r=fixture(),{page,context}=fakePage(false,{omitEvent:event});r.api_cycle=await observeCycle(context,page,ID);assert.equal(contextResultPassed(r),false);});
for(const kind of ['http','identity','timeout'])test('actual local request distinguishes '+kind+' from blocked network',async()=>{const {page}=fakePage(false,{fetchKind:kind});assert.equal(await localRequest(page,ID),kind==='timeout'?'timeout':'failed');});

for(const operation of ['moduleAvailable','helper'])test('context runtime forbids '+operation,async()=>{const r=new ContextRuntime({root:'/repo',output:'/tmp/report',id:ID,env:{}});await assert.rejects(()=>r[operation]());});
test('context runtime forbids candidate namespace and NET_ADMIN helper before Docker',async()=>{const r=new ContextRuntime({root:'/repo',output:'/tmp/report',id:ID,env:{}});let called=false;r.docker=async()=>{called=true;throw Error('must not run');};await assert.rejects(()=>r.startVariant('candidate'));await assert.rejects(()=>r.create('helper','baseline',{helper:true,command:['node']}));assert.equal(called,false);});
test('native context runtime cannot accept dummy scope',async()=>{const r=new ContextRuntime({root:'/repo',output:'/tmp/report',id:ID,env:{GITHUB_EVENT_NAME:'workflow_dispatch',ZAPP_PROOF_SCOPE:'network-proof',ZAPP_PROOF_SHA:ID.source_sha,GITHUB_SHA:ID.source_sha}});let called=false;r.cmd=async()=>{called=true;throw Error('must not run');};await assert.rejects(()=>r.prepare());assert.equal(called,false);});
test('actual Docker argv uses none and cap-drop ALL with no sysctl/module/helper',async()=>{const r=new ContextRuntime({root:'/repo',output:'/tmp/report',id:ID,env:{}});r.uid='1001:1001';r.tools='/tools';r.imageId='sha256:'+'b'.repeat(64);const calls=[];r.docker=async args=>{calls.push(args);return args[0]==='create'?'c'.repeat(64):'';};r.inspect=async()=>({State:{Running:true}});await r.create('anchor','baseline',{command:['node','-e','setInterval(()=>{},1000)']});const create=calls.find(x=>x[0]==='create');assert.equal(create[create.indexOf('--network')+1],'none');assert.equal(create[create.indexOf('--cap-drop')+1],'ALL');assert.ok(!create.includes('--cap-add'));assert.ok(!create.includes('--sysctl'));assert.doesNotMatch(create.join(' '),/modprobe|insmod|docker\.sock|--privileged|--network host|--network bridge/);});

async function exerciseController(directory,fault=null){
  const r=new ContextRuntime({root:'/repo',output:'/unused/report',id:ID,env:{}}),trace=[];
  r.private=directory;r.namespaces.baseline='net:[2345]';r.variants.baseline={anchor:{id:'a'.repeat(64)}};
  const tls=path.join(directory,'tls');r.material={directory:tls,publicDirectory:tls+'/public',privateDirectory:tls+'/private',homeDirectory:tls+'/home',runId:ID.run_id,sourceSha:ID.source_sha,caSha256:'a'.repeat(64)};
  let positives=0,topologies=0,options;
  r.canary={url:cfg().canary_url,positive:async()=>{trace.push('positive');positives++;return {valid:true,count:positives,connections:positives+(fault==='extra-connection'&&positives===2?1:0)};}};
  r.topology=async()=>{trace.push('topology');if(++topologies===2&&fault==='namespace-change')throw Error('[network-proof/namespace-changed]');};
  r.create=async(role,variant,o)=>{assert.equal(role,'browser-contexts-chromium');assert.equal(variant,'baseline');options=o;trace.push('create');return {id:'b'.repeat(64)};};
  r.trust=async()=>{trace.push('trust');};r.remove=async()=>{trace.push('remove');};
  r.inspect=async()=>{
    trace.push('inspect');const control=options.mounts.find(m=>m.target===CONTROL).source,output=options.mounts.find(m=>m.target===TEST_OUTPUT).source;
    if(fault==='nonzero'){put(path.join(control,'failure.json'),failure);return {State:{Running:false,ExitCode:1}};}
    put(path.join(control,'test-default.json'),{...envelope(ID,'chromium'),data:fixture().test_default});put(path.join(control,'test-runner.json'),runnerRecord('chromium'));put(path.join(control,'result.json'),fixture());
    mkdirSync(path.join(output,'results'),{mode:0o700});put(path.join(output,'results/.last-run.json'),{status:'passed',failedTests:[]});
    if(fault==='config-replaced')put(path.join(control,'config.json'),cfg());
    if(fault==='source-replaced'){const file=options.mounts.find(m=>m.target===SOURCE).source+'/reporter.mjs';chmodSync(file,0o600);writeFileSync(file,FIXED_SOURCES['reporter.mjs']);chmodSync(file,0o400);}
    if(fault==='aborted-late-writer'){r.abort.abort();return {State:{Running:true,ExitCode:0}};}
    return {State:{Running:false,ExitCode:0}};
  };
  const outcome=await r.runContext('chromium');return {outcome,trace,options};
}
test('actual context controller collects proof and closes driver before canary after',()=>temp(async directory=>{const {outcome,trace,options}=await exerciseController(directory);assert.deepEqual(outcome,{result:fixture(),failure:null});assert.deepEqual(trace,['topology','positive','create','trust','inspect','remove','topology','positive']);assert.equal(options.mounts.find(x=>x.target===SOURCE).write,false);assert.equal(options.mounts.find(x=>x.target===CONTROL).write,true);assert.equal(options.helper,undefined);}));
for(const fault of ['nonzero','config-replaced','aborted-late-writer'])test('actual context controller refuses '+fault,()=>temp(async directory=>{const {outcome,trace}=await exerciseController(directory,fault);assert.equal(outcome.result,null);assert.ok(trace.includes('remove'));assert.equal(trace.filter(x=>x==='positive').length,2);}));
for(const fault of ['extra-connection','namespace-change','source-replaced'])test('actual context controller rejects '+fault,()=>temp(async directory=>{await assert.rejects(()=>exerciseController(directory,fault));}));

const yaml=readFileSync(new URL('../../.github/workflows/e2e-logado-isolado.yml',import.meta.url),'utf8');
const network=jobOf(yaml,'network-proof');const controller=onlyStep(stepsOf(network),s=>valueOf(s,'id')==='network','network controller');
test('network workflow keeps time budgets, propagates validated scope and runs both regressions',()=>{assert.equal(valueOf(network,'timeout-minutes',4),'20');assert.equal(nestedValue(controller,'env','ZAPP_PROOF_SCOPE'),'${{ needs.image-metadata.outputs.scope }}');assert.match(yaml,/node --test scripts\/ci\/e2e-isolated-network-proof\.unit\.mjs scripts\/ci\/e2e-isolated-network-contexts\.unit\.mjs/);});
for(const scope of ['network-proof','network-proof-contexts','network-proof-veth','network-proof-veth-route','auto','network-proof-contexts ','$(id)',''])test('actual workflow controller dispatch '+JSON.stringify(scope),()=>temp(directory=>{
  const bin=path.join(directory,'bin');mkdirSync(bin);const record=path.join(directory,'argv.json');
  writeFileSync(path.join(bin,'node'),'#!'+process.execPath+'\nrequire("node:fs").writeFileSync(process.env.RECORDED, JSON.stringify(process.argv.slice(2)));\n',{mode:0o700});
  const r=spawnSync('bash',['-s'],{input:runOf(controller),encoding:'utf8',cwd:directory,env:{PATH:bin+':'+process.env.PATH,ZAPP_PROOF_SCOPE:scope,RUNNER_TEMP:directory,RECORDED:record},timeout:10000});
  const permitted=['network-proof','network-proof-contexts'].includes(scope);assert.equal(r.status,permitted?0:1,r.stderr);
  if(permitted){const expected=scope==='network-proof'?'network-proof.mjs':'network-contexts.mjs';assert.deepEqual(JSON.parse(readFileSync(record,'utf8')),['scripts/e2e-isolated/'+expected,directory+'/e2e-network-proof/report.json']);}
}));
test('scope extension remains explicit and PR always login',()=>{assert.equal(requestScope('workflow_dispatch',SCOPE,ID.source_sha),SCOPE);assert.equal(requestScope('pull_request',SCOPE,ID.source_sha),'login');for(const scope of ['network-proof-veth','network-proof-veth-route','auto'])assert.throws(()=>requestScope('workflow_dispatch',scope,ID.source_sha));});
