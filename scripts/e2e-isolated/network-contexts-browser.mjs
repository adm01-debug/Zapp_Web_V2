import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isIPv4 } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertNoProxy, browserEnvironment } from './runtime-contract.mjs';
import { TLS_ORIGIN } from './tls.mjs';
import { CONTROL, assertNamespace, fetchIdentity, probeBrowserTlsControl, protocolFileIdentity, readBoundedJson, snapshot, tlsIdentity, waitForJson, writeAtomicJson } from './network-proof-browser.mjs';
import { ADDRESS, VERSION, assertTopology, commandOutput, fail, identity, object } from './network-proof-policy.mjs';
import { runCommand } from './network-proof.mjs';
import { SCOPE, SOURCE, TEST_OUTPUT, TEST_RESULTS, TEST_TITLE, assertConfig, assertContextFailure, assertContextResult, assertEnvelope, assertEvents, assertTestDefault, assertTestRecord, assertTestRunner, envelope } from './network-contexts-policy.mjs';

const require=createRequire(import.meta.url);
const SCRIPT='/work/scripts/e2e-isolated/network-contexts-browser.mjs';
export const FIXED_SOURCES=Object.freeze({
  'context.spec.mjs':"import { createRequire } from 'node:module';\nconst { test } = createRequire('/work/package.json')('@playwright/test');\nimport { runTestDefault } from '"+SCRIPT+"';\ntest('"+TEST_TITLE+"', async ({ browser, context, page, browserName, offline, ignoreHTTPSErrors, serviceWorkers }, testInfo) => {\n  await runTestDefault({ browser, context, page, browserName, offline, ignoreHTTPSErrors, serviceWorkers }, testInfo);\n});\n",
  'playwright.config.mjs':"import { testConfiguration } from '"+SCRIPT+"';\nexport default testConfiguration();\n",
  'reporter.mjs':"export { ContextsReporter as default } from '"+SCRIPT+"';\n",
});
let failureEvidence=null;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function envIdentity(){return identity(process.env.ZAPP_NETWORK_RUN,process.env.ZAPP_NETWORK_SHA);}
export function verifySources(directory=SOURCE){
  const d=lstatSync(directory);if(!d.isDirectory()||d.isSymbolicLink()||d.uid!==process.getuid()||realpathSync(directory)!==directory||(d.mode&0o077))fail('temporary-sources');
  const names=readdirSync(directory).sort();if(JSON.stringify(names)!==JSON.stringify(Object.keys(FIXED_SOURCES).sort()))fail('temporary-sources');
  const result={};
  for(const name of names){
    const file=path.join(directory,name),before=protocolFileIdentity(file);let fd;
    try{
      fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);const s=fstatSync(fd);
      if(!s.isFile()||s.nlink!==1||s.uid!==process.getuid()||(s.mode&0o222)||s.size!==Buffer.byteLength(FIXED_SOURCES[name]))fail('temporary-sources');
      if(readFileSync(fd,'utf8')!==FIXED_SOURCES[name]||protocolFileIdentity(file)!==before)fail('temporary-sources');
    }finally{if(fd!==undefined)closeSync(fd);}
    result[name]=before;
  }
  return result;
}
export function verifyTestOutput(directory=TEST_OUTPUT){
  const s=lstatSync(directory);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()||realpathSync(directory)!==directory||(s.mode&0o077))fail('temporary-output');
  if(JSON.stringify(readdirSync(directory))!==JSON.stringify(['results']))fail('temporary-output');
  const results=path.join(directory,'results'),resultStat=lstatSync(results);
  if(!resultStat.isDirectory()||resultStat.isSymbolicLink()||resultStat.uid!==process.getuid()||realpathSync(results)!==results||
     JSON.stringify(readdirSync(results))!==JSON.stringify(['.last-run.json']))fail('temporary-output');
  const last=readBoundedJson(path.join(results,'.last-run.json'));object(last,['status','failedTests']);
  if(last.status!=='passed'||!Array.isArray(last.failedTests)||last.failedTests.length!==0)fail('temporary-output');return true;
}
export function readConfig(){
  assertNoProxy(process.env);const raw=readBoundedJson(CONTROL+'/config.json');const cfg=assertConfig(raw,{...envIdentity(),engine:raw?.engine});
  if(process.env.ZAPP_NETWORK_NAMESPACE!==cfg.namespace)fail('contexts-config');
  const target=new URL(cfg.canary_url);
  if(target.protocol!=='http:'||!isIPv4(target.hostname)||target.hostname.startsWith('127.')||target.hostname===ADDRESS||
     !/^\d+$/.test(target.port)||target.username||target.password||target.search||target.hash||!/^\/canary\/[0-9a-f]{32}$/.test(target.pathname))fail('contexts-config');
  return cfg;
}
export function checkContextTopology(cfg){assertNamespace(cfg.namespace);const s=snapshot();assertTopology(s,'baseline');if(s.namespace!==cfg.namespace)fail('namespace-changed');assertNamespace(cfg.namespace);return true;}
export function testConfiguration(){
  const cfg=readConfig();verifySources();return makeTestConfiguration(cfg,process.env);
}
export function makeTestConfiguration(cfg,env){
  assertConfig(cfg);assertNoProxy(env);
  // offline is intentionally absent: the real Test fixture must supply its default.
  return {testDir:SOURCE,testMatch:'context.spec.mjs',outputDir:TEST_RESULTS,forbidOnly:true,fullyParallel:false,workers:1,retries:0,
    timeout:30_000,globalTimeout:45_000,maxFailures:1,reporter:[[SOURCE+'/reporter.mjs']],projects:[{name:cfg.engine}],
    use:{browserName:cfg.engine,headless:true,ignoreHTTPSErrors:false,serviceWorkers:'block',
      screenshot:'off',trace:'off',video:'off',launchOptions:{env:browserEnvironment(env)}}};
}
export class ContextsReporter{
  constructor({configReader=readConfig,writer=writeAtomicJson}={}){this.cfg=configReader();this.writer=writer;this.tests=0;this.passed=0;this.failed=0;this.skipped=0;this.retries=0;this.error=false;}
  printsToStdio(){return false;}
  onBegin(config,suite){
    const tests=suite.allTests();this.tests=tests.length;
    if(tests.length!==1||tests[0].title!==TEST_TITLE||tests[0].location.file!==SOURCE+'/context.spec.mjs'||tests[0].expectedStatus!=='passed'||
       config.workers!==1||config.projects.length!==1||config.projects[0].name!==this.cfg.engine||config.projects[0].retries!==0||config.projects[0].outputDir!==TEST_RESULTS)this.error=true;
  }
  onTestEnd(test,result){
    if(test.title!==TEST_TITLE||test.location.file!==SOURCE+'/context.spec.mjs'||test.expectedStatus!=='passed')this.error=true;
    this.retries+=result.retry;
    if(result.status==='passed')this.passed++;else if(result.status==='skipped')this.skipped++;else this.failed++;
  }
  onError(){this.error=true;}
  onEnd(result){
    const value={...envelope(this.cfg,this.cfg.engine),tests:this.tests,passed:this.passed,failed:this.failed,skipped:this.skipped,retries:this.retries,status:result.status,error:this.error};
    assertTestRunner(value,this.cfg,false);this.writer(CONTROL+'/test-runner.json',value);
  }
}
async function openPage(context,id,page=null){
  page??=await context.newPage();page.setDefaultTimeout(8000);page.setDefaultNavigationTimeout(8000);
  const r=await page.goto(TLS_ORIGIN,{waitUntil:'domcontentloaded'});
  if(r?.status()!==200||await page.locator('#proof').textContent()!==id.run_id)fail('browser-proof-failed');
  return page;
}
export async function localRequest(page,id){
  return page.evaluate(async expected=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);let response;
    try{response=await fetch('/identity?contexts='+Date.now(),{cache:'no-store',redirect:'error',signal:controller.signal});}
    catch(error){clearTimeout(timer);return error?.name==='AbortError'?'timeout':error?.name==='TypeError'||error?.name==='NetworkError'?'blocked':'failed';}
    clearTimeout(timer);
    try{const v=await response.json();return response.status===200&&v.schema===1&&v.run_id===expected.run_id&&v.source_sha===expected.source_sha?'passed':'failed';}
    catch{return 'failed';}
  },{run_id:id.run_id,source_sha:id.source_sha});
}
const online=page=>page.evaluate(()=>navigator.onLine);
async function eventsStart(page){await page.evaluate(()=>{window.__contextProofEvents={offline:0,online:0};for(const e of ['offline','online'])addEventListener(e,()=>window.__contextProofEvents[e]++);});}
async function eventsReset(page){await page.evaluate(()=>{window.__contextProofEvents={offline:0,online:0};});}
async function eventsRead(page){return assertEvents(await page.evaluate(()=>window.__contextProofEvents));}
export async function tlsChecks(context,cfg){
  const result={tls_untrusted_rejected:false,tls_wrong_san_rejected:false};
  for(const [name,port] of [['tls_untrusted_rejected',5175],['tls_wrong_san_rejected',5176]]){
    let nodeCode=null;
    try{await fetch('https://127.0.0.1:'+port,{signal:AbortSignal.timeout(4000),redirect:'error'});}catch(error){nodeCode=error.cause?.code;}
    const page=await context.newPage();try{result[name]=await probeBrowserTlsControl({page,id:cfg,kind:name,engine:cfg.engine,nodeCode});}finally{await page.close();}
  }
  return result;
}
async function externalBrowser(context,cfg){const page=await context.newPage();try{await page.goto(cfg.canary_url,{timeout:5000,waitUntil:'domcontentloaded'});return false;}catch{return true;}finally{await page.close();}}
async function externalNode(cfg){try{await fetch(cfg.canary_url,{signal:AbortSignal.timeout(4000),redirect:'error'});return false;}catch{return true;}}
export async function runTestDefault({browser,context,page,browserName,offline,ignoreHTTPSErrors,serviceWorkers},testInfo){
  const cfg=readConfig();checkContextTopology(cfg);tlsIdentity(cfg);verifySources();
  if(require('@playwright/test/package.json').version!==VERSION||browserName!==cfg.engine||offline!==false||ignoreHTTPSErrors!==false||serviceWorkers!=='block'||
     testInfo.file!==SOURCE+'/context.spec.mjs'||testInfo.title!==TEST_TITLE||testInfo.retry!==0||testInfo.repeatEachIndex!==0)fail('test-runner-failed');
  await openPage(context,cfg,page);
  const data={online:await online(page),https:await localRequest(page,cfg)==='passed',...await tlsChecks(context,cfg),
    external_browser_blocked:await externalBrowser(context,cfg),fixture_offline:offline,ignore_https_errors:ignoreHTTPSErrors,
    service_workers:serviceWorkers,source:'playwright-test-fixture',browser_version:browser.version()};
  if(await localRequest(page,cfg)!=='passed')data.https=false;
  assertTestDefault(data);checkContextTopology(cfg);verifySources();
  writeAtomicJson(CONTROL+'/test-default.json',{...envelope(cfg,cfg.engine),data});
  if(['https','tls_untrusted_rejected','tls_wrong_san_rejected','external_browser_blocked'].some(k=>data[k]!==true))fail('contexts-proof-failed');
}
export function testEnvironment(env){
  assertNoProxy(env);const result=browserEnvironment(env);
  for(const key of ['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','PLAYWRIGHT_BROWSERS_PATH','ZAPP_NETWORK_RUN','ZAPP_NETWORK_SHA','ZAPP_NETWORK_NAMESPACE'])if(typeof env[key]==='string')result[key]=env[key];
  return {...result,CI:'1',NO_COLOR:'1'};
}
export async function runRealTest(cfg,{runner=runCommand,read=readBoundedJson,verify=verifySources,output=verifyTestOutput,cliPath=null,env=process.env}={}){
  assertConfig(cfg);const identities=verify();const cli=cliPath??path.join(path.dirname(require.resolve('@playwright/test/package.json')),'cli.js');
  const run=await runner(process.execPath,[cli,'test','--config',SOURCE+'/playwright.config.mjs'],{env:testEnvironment(env),cwd:SOURCE,timeout:45_000,maxBytes:128*1024});
  const record=read(CONTROL+'/test-default.json',true);
  if(record!==null){assertTestRecord(record,cfg);if(failureEvidence)failureEvidence.observations.test_default_online=record.data.online;}
  if(JSON.stringify(verify())!==JSON.stringify(identities))fail('temporary-sources');
  try{commandOutput(run);}catch{fail('test-runner-failed');}
  assertTestRunner(read(CONTROL+'/test-runner.json'),cfg);output();
  if(record===null)fail('test-runner-failed');return record.data;
}
export async function observeExplicitFalse(context,page,cfg){
  await eventsStart(page);const before=await online(page);await context.setOffline(false);
  // A false setter may intentionally be a no-op (Chromium v1.64.1). Bound the
  // observation window; no-change is an observation, never a fabricated event.
  if(!before)await page.waitForFunction(()=>navigator.onLine===true,null,{timeout:1000}).catch(()=>{});
  return {before,after:await online(page),https:await localRequest(page,cfg)==='passed',events:await eventsRead(page)};
}
export async function observeCycle(context,page,cfg){
  await eventsStart(page);const steps=[];
  // The second full cycle has both real transitions even when natural starts false.
  for(const requested_offline of [true,false,true,false]){
    const before=await online(page);await eventsReset(page);await context.setOffline(requested_offline);
    const desired=!requested_offline,event=desired?'online':'offline';
    await page.waitForFunction(({desired,event,changed})=>navigator.onLine===desired&&(!changed||window.__contextProofEvents[event]>0),
      {desired,event,changed:before!==desired},{timeout:8000}).catch(()=>{});
    steps.push({requested_offline,before,after:await online(page),request:await localRequest(page,cfg),events:await eventsRead(page)});
  }
  return steps;
}
async function probe(){
  const cfg=readConfig();failureEvidence={...envelope(cfg,cfg.engine),phase:'preflight',observations:{native_online:null,test_default_online:null}};
  verifySources();checkContextTopology(cfg);tlsIdentity(cfg);
  await waitForJson(CONTROL+'/trust-ready.json',45_000,v=>{object(v,['schema','scope','run_id','source_sha','engine','ready']);assertEnvelope(v,cfg);if(v.ready!==true)fail('contexts-protocol');return v;});
  const deadline=Date.now()+20_000;while(true){try{await fetchIdentity(cfg);break;}catch{if(Date.now()>=deadline)fail('tls-preflight-failed');await pause(100);}}
  if(require('@playwright/test/package.json').version!==VERSION)fail('driver-version');
  const pw=await import('@playwright/test');let browser=null;const launch=()=>pw[cfg.engine].launch({headless:true,env:browserEnvironment(process.env)});
  const context=options=>browser.newContext({ignoreHTTPSErrors:false,serviceWorkers:'block',...options});
  try{
    failureEvidence.phase='native';browser=await launch();const version=browser.version();let c=await context();let page=await openPage(c,cfg);
    const initialOnline=await online(page);failureEvidence.observations.native_online=initialOnline;
    const native={online:initialOnline,https:await localRequest(page,cfg)==='passed',node_https:await fetchIdentity(cfg),...await tlsChecks(c,cfg),
      external_node_blocked:await externalNode(cfg),external_browser_blocked:await externalBrowser(c,cfg)};
    if(await localRequest(page,cfg)!=='passed')native.https=false;
    await c.close();await browser.close();browser=null;checkContextTopology(cfg);
    failureEvidence.phase='test-default';const test_default=await runRealTest(cfg);checkContextTopology(cfg);
    browser=await launch();if(browser.version()!==version)fail('driver-version');
    failureEvidence.phase='explicit-option';c=await context({offline:false});page=await openPage(c,cfg);
    const explicit_option_false={online:await online(page),https:await localRequest(page,cfg)==='passed'};await c.close();checkContextTopology(cfg);
    failureEvidence.phase='explicit-false';c=await context();page=await openPage(c,cfg);const explicit_false=await observeExplicitFalse(c,page,cfg);await c.close();checkContextTopology(cfg);
    failureEvidence.phase='api-cycle';c=await context();page=await openPage(c,cfg);const api_cycle=await observeCycle(c,page,cfg);await c.close();checkContextTopology(cfg);
    failureEvidence.phase='fresh';c=await context();page=await openPage(c,cfg);const fresh={online:await online(page),https:await localRequest(page,cfg)==='passed',unemulated:true};await c.close();
    const result={...envelope(cfg,cfg.engine),native,test_default,explicit_option_false,explicit_false,api_cycle,fresh,versions:{node:process.version,playwright:VERSION,browser:version}};
    failureEvidence.phase='result';assertContextResult(result,cfg);checkContextTopology(cfg);verifySources();await browser.close();browser=null;
    writeAtomicJson(CONTROL+'/result.json',result);
  }finally{if(browser)await browser.close().catch(()=>{});}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{if(process.argv.length!==3||process.argv[2]!=='probe')fail('contexts-config');await probe();}
  catch{if(failureEvidence)try{assertContextFailure(failureEvidence,failureEvidence);writeAtomicJson(CONTROL+'/failure.json',failureEvidence);}catch{}
    process.stderr.write('[network-proof/contexts-proof-failed]\n');process.exitCode=1;}
}
