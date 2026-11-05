import { spawnSync } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readlinkSync, readSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { isIPv4 } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertNoProxy, assertOfficialHostIsLocal, browserEnvironment } from './runtime-contract.mjs';
import { TLS_ORIGIN, TLS_PUBLIC, TLS_PRIVATE } from './tls.mjs';
import { certificateFailure } from './tls-probe.mjs';
import { ADDRESS, DEVICE, ENGINES, MAX_JSON, VARIANTS, VERSION, assertControl, assertEngineResult, assertFailure, assertTopology,
  commandOutput, digest, dummyIsLoaded, fail, identity, object, parseJson } from './network-proof-policy.mjs';

export const CONTROL = '/run/zapp-network-control';
export const TOOLS = '/run/zapp-network-tools';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let failureEvidence=null;
export function tlsControlRejected(kind,nodeCode,browserMessage,engine='chromium') {
  if(!['tls_wrong_san_rejected','tls_untrusted_rejected'].includes(kind)||!ENGINES.includes(engine))fail('tls-control-kind');
  const control=kind==='tls_wrong_san_rejected'?'wrong_san':'untrusted';
  return certificateFailure({code:nodeCode},control,'node')&&certificateFailure({message:browserMessage},control,engine);
}
export async function probeBrowserTlsControl({page,id,kind,engine,nodeCode}) {
  identity(id.run_id,id.source_sha);
  if(!['tls_wrong_san_rejected','tls_untrusted_rejected'].includes(kind)||!ENGINES.includes(engine))fail('tls-control-kind');
  // Match tls-probe's committed trusted document on THIS page before the
  // negative navigation. WebKit can cancel a provisional about:blank load.
  const warmupUrl=TLS_ORIGIN+'/identity';
  const warmup=await page.goto(warmupUrl,{waitUntil:'load',timeout:8000});
  if(warmup?.status()!==200||page.url()!==warmupUrl)fail('tls-warmup-document');
  const value=await warmup.json();object(value,['schema','run_id','source_sha','origin']);
  if(value.schema!==1||value.run_id!==id.run_id||value.source_sha!==id.source_sha||value.origin!==TLS_ORIGIN)fail('tls-warmup-identity');
  let message;
  try{await page.goto('https://127.0.0.1:'+(kind==='tls_wrong_san_rejected'?5176:5175),{waitUntil:'load',timeout:8000});}
  catch(error){message=error.message;}
  return tlsControlRejected(kind,nodeCode,message,engine);
}
export function readBoundedJson(file, optional = false) {
  let fd;
  try { fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (e) { if (optional && e.code === 'ENOENT') return null; fail('protocol-file-open'); }
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid() || before.size < 2 || before.size > MAX_JSON) fail('protocol-file-shape');
    const bytes = Buffer.alloc(MAX_JSON + 1);
    let size = 0, n;
    while ((n = readSync(fd, bytes, size, bytes.length - size, null)) > 0) {
      size += n; if (size > MAX_JSON) fail('protocol-file-size');
    }
    const after = fstatSync(fd), current = lstatSync(file);
    if (size !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs ||
        current.ino !== before.ino || current.dev !== before.dev || !current.isFile()) fail('protocol-file-changed');
    let text;
    try { text = new TextDecoder('utf-8', {fatal:true}).decode(bytes.subarray(0,size)); } catch { fail('protocol-utf8'); }
    return parseJson(text);
  } finally { closeSync(fd); }
}
export function writeAtomicJson(file, value) {
  const parent = path.dirname(file), stat = lstatSync(parent);
  const present = name => {try {lstatSync(name);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
  if (realpathSync(parent) !== parent || !stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o077) || present(file)) fail('protocol-directory');
  const text = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(text) > MAX_JSON) fail('protocol-output-size');
  writeFileSync(file + '.tmp', text, {mode:0o600, flag:'wx'});
  if (present(file)) fail('protocol-output-replaced');
  renameSync(file + '.tmp', file);
}
export function protocolFileIdentity(file) {
  const s=lstatSync(file,{bigint:true});
  if(!s.isFile()||s.nlink!==1n||s.uid!==BigInt(process.getuid()))fail('protocol-file-identity');
  return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
}
export async function waitForJson(file, timeoutMs, validate) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 45_000) fail('protocol-timeout-value');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = readBoundedJson(file, true);
    if (value !== null) return validate(value);
    await wait(Math.min(100, Math.max(1,deadline-Date.now())));
  }
  fail('protocol-timeout');
}
function ip(args) {
  // Only the small NET_ADMIN helper changes links. This synchronous child runs INSIDE
  // that container, never in the host event loop which serves the positive canary.
  const r = spawnSync(TOOLS + '/loader', ['--library-path', TOOLS + '/lib', TOOLS + '/ip', ...args], {
    env:{PATH:'/usr/sbin:/usr/bin:/sbin:/bin',LC_ALL:'C'},encoding:'utf8',timeout:5000,maxBuffer:MAX_JSON,
    stdio:['ignore','pipe','pipe'],
  });
  return commandOutput({code:r.status,signal:r.signal,error:r.error,stdout:r.stdout,timedOut:r.error?.code === 'ETIMEDOUT',truncated:r.error?.code === 'ENOBUFS'});
}
export function passiveDummy(read = readFileSync) {
  try { return dummyIsLoaded(read('/proc/modules','utf8'),read('/sys/module/dummy/initstate','utf8')); }
  catch { return false; }
}
export function namespace() { const n = readlinkSync('/proc/self/ns/net'); if (!/^net:\[\d+\]$/.test(n)) fail('namespace-shape'); return n; }
export function snapshot() {
  const links = parseJson(ip(['-j','-d','link','show']));
  if (!Array.isArray(links) || links.length > 2 || links.some(x => !['lo',DEVICE].includes(x.ifname))) fail('snapshot-interface');
  assertOfficialHostIsLocal(readFileSync('/etc/hosts','utf8'));
  return {namespace:namespace(),links,addresses:parseJson(ip(['-j','address','show'])),
    routes4:parseJson(ip(['-4','-j','route','show','table','all'])),routes6:parseJson(ip(['-6','-j','route','show','table','all'])),
    rules4:parseJson(ip(['-4','-j','rule','show'])),rules6:parseJson(ip(['-6','-j','rule','show'])),
    syslinks:links.map(x => ({name:x.ifname,ifindex:Number(readFileSync('/sys/class/net/'+x.ifname+'/ifindex','utf8').trim()),
      iflink:Number(readFileSync('/sys/class/net/'+x.ifname+'/iflink','utf8').trim())})),official_host_local:true};
}
function envIdentity() { return identity(process.env.ZAPP_NETWORK_RUN,process.env.ZAPP_NETWORK_SHA); }
export function assertNamespace(expected) { if (namespace() !== expected) fail('namespace-changed'); }
function helper(action) {
  envIdentity();
  const expected = process.env.ZAPP_NETWORK_NAMESPACE;
  if (!['create','down','up'].includes(action) || !/^net:\[\d+\]$/.test(expected || '')) fail('helper-action');
  assertNamespace(expected);
  if (action === 'create') {
    assertTopology(snapshot(),'baseline');
    // Never probe by loading. Both passive observations must be true immediately
    // before RTM_NEWLINK; a privileged external module unload remains out of scope.
    if (!passiveDummy()) fail('dummy-not-preloaded');
    ip(['link','add',DEVICE,'type','dummy']);
    ip(['link','set','dev',DEVICE,'addrgenmode','none']);
    ip(['address','add',ADDRESS+'/32','dev',DEVICE,'noprefixroute']);
    ip(['link','set','dev',DEVICE,'up']);
  } else {
    assertTopology(snapshot(),'candidate',action === 'down' ? 'up' : 'down');
    ip(['link','set','dev',DEVICE,action]);
  }
  assertNamespace(expected);
  assertTopology(snapshot(),'candidate',action === 'down' ? 'down' : 'up');
  return {schema:1,action,ok:true};
}
export function tlsIdentity(expected) {
  const manifest = parseJson(readFileSync(TLS_PUBLIC+'/manifest.json','utf8'));
  object(manifest,['schema','run_id','source_sha','origin','ca_sha256','server_sha256','expires_at']);
  if (manifest.schema !== 1 || manifest.run_id !== expected.run_id || manifest.source_sha !== expected.source_sha || manifest.origin !== TLS_ORIGIN ||
      manifest.ca_sha256 !== digest(new X509Certificate(readFileSync(TLS_PUBLIC+'/ca.crt')).raw) || Date.parse(manifest.expires_at) <= Date.now()) fail('tls-identity');
  return manifest;
}
async function serve() {
  const id = envIdentity(), variant = process.env.ZAPP_NETWORK_VARIANT;
  if (!VARIANTS.includes(variant)) fail('server-variant');
  assertNamespace(process.env.ZAPP_NETWORK_NAMESPACE); assertTopology(snapshot(),variant); tlsIdentity(id);
  const body = JSON.stringify({...id,origin:TLS_ORIGIN});
  const servers = [];
  for (const [name,port] of [['server',5173],['untrusted',5175],['wrong_san',5176]]) {
    const server = https.createServer({key:readFileSync(TLS_PRIVATE+'/'+name+'.key'),cert:readFileSync(TLS_PRIVATE+'/'+name+'.crt'),minVersion:'TLSv1.2'},(req,res) => {
      res.setHeader('Cache-Control','no-store'); res.setHeader('Content-Security-Policy',"default-src 'none'; connect-src 'self'; base-uri 'none'");
      if (req.method !== 'GET' || !['/','/identity'].includes((req.url || '').split('?')[0])) {res.writeHead(404);res.end();return;}
      res.setHeader('Content-Type',req.url.startsWith('/identity')?'application/json':'text/html');
      res.end(req.url.startsWith('/identity') ? body : '<!doctype html><meta charset="utf-8"><title>Network proof</title><p id="proof">'+id.run_id+'</p>');
    });
    server.requestTimeout = 5000; server.headersTimeout = 5000;
    await new Promise((resolve,reject) => {server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    servers.push(server);
  }
  const stop = () => { for (const s of servers) s.close(); process.exit(0); };
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  process.stdout.write('{"schema":1,"ready":true}\n');
}
export async function fetchIdentity(expected) {
  const r = await fetch(TLS_ORIGIN+'/identity?node='+Date.now(),{redirect:'error',signal:AbortSignal.timeout(5000),cache:'no-store'});
  if (!r.ok) fail('node-https'); const value = await r.json();
  object(value,['schema','run_id','source_sha','origin']);
  if (value.schema!==1 || value.run_id!==expected.run_id || value.source_sha!==expected.source_sha || value.origin!==TLS_ORIGIN) fail('node-https-identity');
  return true;
}
async function browserProof() {
  assertNoProxy(process.env);
  const config = readBoundedJson(CONTROL+'/config.json');
  object(config,['schema','run_id','source_sha','variant','engine','canary_url','namespace']);
  const id = envIdentity();
  if (config.schema!==1 || config.run_id!==id.run_id || config.source_sha!==id.source_sha || !VARIANTS.includes(config.variant) || !ENGINES.includes(config.engine)) fail('browser-config');
  failureEvidence={...id,variant:config.variant,engine:config.engine,phase:'preflight',observations:{native_online:null,native_https:null,node_https:null}};
  const target = new URL(config.canary_url);
  if (target.protocol!=='http:' || !isIPv4(target.hostname) || target.hostname.startsWith('127.') || target.hostname===ADDRESS ||
      !/^\d+$/.test(target.port) || target.username || target.password || target.search || target.hash || !/^\/canary\/[0-9a-f]{32}$/.test(target.pathname)) fail('canary-target');
  assertNamespace(config.namespace); assertTopology(snapshot(),config.variant); tlsIdentity(id);
  await waitForJson(CONTROL+'/trust-ready.json',45_000,v => {
    object(v,['schema','run_id','source_sha','ready']); if (v.schema!==1 || v.run_id!==id.run_id || v.source_sha!==id.source_sha || v.ready!==true) fail('trust-ack'); return v;
  });
  const deadline = Date.now()+20_000;
  while (true) {try {await fetchIdentity(id);break;} catch {if(Date.now()>=deadline)fail('server-not-ready');await wait(100);}}
  const {createRequire} = await import('node:module');
  const require = createRequire(import.meta.url);
  if (require('@playwright/test/package.json').version !== VERSION) fail('playwright-version');
  const pw = await import('@playwright/test');
  failureEvidence.phase='browser-launch';
  const browser = await pw[config.engine].launch({headless:true,env:browserEnvironment(process.env)});
  const contexts = [];
  const fresh = async () => {
    const context = await browser.newContext({ignoreHTTPSErrors:false,serviceWorkers:'block'}); contexts.push(context);
    const page = await context.newPage(); page.setDefaultTimeout(8000); page.setDefaultNavigationTimeout(8000);
    const response = await page.goto(TLS_ORIGIN,{waitUntil:'domcontentloaded'});
    if (response?.status()!==200 || await page.locator('#proof').textContent()!==id.run_id) fail('browser-https');
    await page.evaluate(() => {window.__networkProofEvents=[]; for (const e of ['online','offline']) addEventListener(e,() => window.__networkProofEvents.push(e));});
    return {context,page};
  };
  const local = async page => page.evaluate(async expected => {
    try {const r=await fetch('/identity?browser='+Date.now(),{cache:'no-store',redirect:'error'});const v=await r.json();
      return r.status===200 && v.schema===1 && v.run_id===expected.run_id && v.source_sha===expected.source_sha;
    } catch {return false;}
  },id);
  const online = page => page.evaluate(() => navigator.onLine);
  const waitEvent = async (page,value,event) => {await page.waitForFunction(({value,event}) => navigator.onLine===value && window.__networkProofEvents.includes(event),{value,event},{timeout:8000});};
  const control = async (sequence,action) => {
    const request={...id,variant:config.variant,engine:config.engine,sequence,action}; assertControl(request,request);
    writeAtomicJson(CONTROL+'/request-'+sequence+'.json',request);
    await waitForJson(CONTROL+'/ack-'+sequence+'.json',45_000,v => assertControl(v,request,true));
    assertNamespace(config.namespace); assertTopology(snapshot(),'candidate',action);
  };
  try {
    failureEvidence.phase='native';
    const first=await fresh();
    // Read the native value before any context has ever received setOffline.
    const facts=failureEvidence.observations;
    facts.native_online=await online(first.page);facts.native_https=await local(first.page);facts.node_https=await fetchIdentity(id);
    const native={online:facts.native_online,https:facts.native_https,node_https:facts.node_https,tls_untrusted_rejected:false,tls_wrong_san_rejected:false};
    failureEvidence.phase='tls-controls';
    for (const [name,port] of [['tls_untrusted_rejected',5175],['tls_wrong_san_rejected',5176]]) {
      let nodeCode=null;
      try {await fetch('https://127.0.0.1:'+port,{signal:AbortSignal.timeout(4000),redirect:'error'});} catch(e) {
        nodeCode=e.cause?.code;
      }
      const page=await first.context.newPage();
      try {native[name]=await probeBrowserTlsControl({page,id,kind:name,engine:config.engine,nodeCode});}
      finally {await page.close();}
    }
    if (!await local(first.page)) fail('tls-positive-after-controls');
    failureEvidence.phase='external';
    let nodeBlocked=false, browserBlocked=false;
    try {await fetch(config.canary_url,{signal:AbortSignal.timeout(4000),redirect:'error'});} catch {nodeBlocked=true;}
    const outside=await first.context.newPage();
    try {await outside.goto(config.canary_url,{timeout:5000,waitUntil:'domcontentloaded'});} catch {browserBlocked=true;}
    await outside.close(); await first.context.close();
    let emulation=null,link=null;
    if (config.variant==='candidate') {
      failureEvidence.phase='emulation';
      const emulated=await fresh();
      await emulated.context.setOffline(true);await waitEvent(emulated.page,false,'offline');
      emulation={offline_online:await online(emulated.page),offline_blocked:!await local(emulated.page),offline_event:true,online_online:false,online_https:false,online_event:false};
      await emulated.context.setOffline(false);await waitEvent(emulated.page,true,'online');
      Object.assign(emulation,{online_online:await online(emulated.page),online_https:await local(emulated.page),online_event:true});
      await emulated.context.close();
      // A distinct context has NEVER received setOffline: these events must be native.
      const physical=await fresh();
      failureEvidence.phase='link-down';
      await control(1,'down');await waitEvent(physical.page,false,'offline');
      link={down_online:await online(physical.page),down_event:true,up_online:false,up_event:false,https_after_up:false,unemulated:true};
      failureEvidence.phase='link-up';
      await control(2,'up');await waitEvent(physical.page,true,'online');
      Object.assign(link,{up_online:await online(physical.page),up_event:true,https_after_up:await local(physical.page)});
      await physical.context.close();
    }
    failureEvidence.phase='fresh';
    const final=await fresh();
    const result={...id,variant:config.variant,engine:config.engine,native,emulation,link,
      fresh:{online:await online(final.page),https:await local(final.page),unemulated:true},external:{node_blocked:nodeBlocked,browser_blocked:browserBlocked},
      versions:{node:process.version,playwright:VERSION,browser:browser.version()},
      node_navigator_online:typeof globalThis.navigator?.onLine==='boolean'?globalThis.navigator.onLine:'unavailable'};
    failureEvidence.phase='result';assertEngineResult(result,config); assertNamespace(config.namespace); assertTopology(snapshot(),config.variant);
    await final.context.close(); await browser.close();
    writeAtomicJson(CONTROL+'/result.json',result);
  } finally {await browser.close().catch(() => {});}
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const [mode,action,...extra]=process.argv.slice(2); if(extra.length)fail('arguments');
    if(mode==='snapshot'&&!action) process.stdout.write(JSON.stringify(snapshot())+'\n');
    else if(mode==='helper') process.stdout.write(JSON.stringify(helper(action))+'\n');
    else if(mode==='server'&&!action) await serve();
    else if(mode==='browser'&&!action) await browserProof();
    else fail('mode');
  } catch {
    if(failureEvidence)try{assertFailure(failureEvidence,failureEvidence);writeAtomicJson(CONTROL+'/failure.json',failureEvidence);}catch{}
    process.stderr.write('[network-proof/container-proof-failed]\n');process.exitCode=1;
  }
}
