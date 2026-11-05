import { spawn } from 'node:child_process';
import { randomBytes, X509Certificate } from 'node:crypto';
import { appendFileSync, chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { OFFICIAL_HOST } from './runtime-contract.mjs';
import { createTlsMaterial, preflightTlsTools, tlsEnvironment, tlsMounts, TLS_PUBLIC } from './tls.mjs';
import { CONTROL, TOOLS, passiveDummy, protocolFileIdentity, readBoundedJson, writeAtomicJson } from './network-proof-browser.mjs';
import { DRIVER, ENGINES, FAILURE_CODES, PURPOSE, VARIANTS, VERSION, assertCanary, assertContainer, assertControl, assertEngineResult, assertFailure,
  assertTopology, commandOutput, digest, fail, identity, object, parseJson, publicFailureCode, requestScope } from './network-proof-policy.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
const SCRIPT = '/work/scripts/e2e-isolated/network-proof-browser.mjs';

/** Async even for short commands: a synchronous Docker call would freeze the
 * host canary and manufacture the very negative this proof is meant to measure. */
export function runCommand(program,args,{env={},cwd,timeout=30_000,signal,maxBytes=1024*1024}={}) {
  if (!Number.isSafeInteger(timeout) || timeout<1 || timeout>240_000 || !Number.isSafeInteger(maxBytes) || maxBytes<1 || maxBytes>1024*1024) fail('command-bounds');
  return new Promise(resolve => {
    let child,stdout='',stderr='',size=0,done=false,timedOut=false,truncated=false,error=null;
    const finish=(code,childSignal) => {if(done)return;done=true;clearTimeout(timer);resolve({code,signal:childSignal,stdout,stderr,error,timedOut,truncated});};
    let timer;
    try {child=spawn(program,args,{env,cwd,signal,stdio:['ignore','pipe','pipe']});}
    catch(e){error=e;finish(null,null);return;}
    timer=setTimeout(() => {timedOut=true;child.kill('SIGKILL');},timeout);
    for(const [stream,key] of [[child.stdout,'stdout'],[child.stderr,'stderr']]) stream.on('data',b => {
      size+=b.length;if(size>maxBytes){truncated=true;child.kill('SIGKILL');return;}
      if(key==='stdout')stdout+=b.toString('utf8');else stderr+=b.toString('utf8');
    });
    child.on('error',e => {error=e;});child.on('close',finish);
  });
}

export function validatePublicReport(r) {
  object(r,['schema','run_id','source_sha','scope','status','stage','failure_code','module_preloaded','baseline','candidate','cleanup','plan_fully_validated','unproved']);
  identity(r.run_id,r.source_sha);
  if(r.schema!==1 || r.scope!=='network-proof' || !['passed','failed'].includes(r.status) ||
     !['preflight','baseline','module','candidate','cleanup','complete'].includes(r.stage) ||
     ![true,false,null].includes(r.module_preloaded) || typeof r.cleanup!=='boolean' || r.plan_fully_validated!==false ||
     (r.status==='passed'?r.failure_code!==null:!FAILURE_CODES.includes(r.failure_code)))fail('report-shape');
  object(r.unproved,['bun_egress','edge_egress','external_ipv6']);
  if(Object.values(r.unproved).some(x=>x!=='not_run'))fail('report-overclaim');
  for(const variant of VARIANTS){
    object(r[variant],['status','topology_verified','engines']);
    if(!['passed','failed','not_run'].includes(r[variant].status) || typeof r[variant].topology_verified!=='boolean' ||
      !Array.isArray(r[variant].engines) || r[variant].engines.length>3)fail('report-variant');
    const seen=new Set();
    for(const e of r[variant].engines){
      object(e,['engine','status','proof','failure','canary_verified']);
      if(!ENGINES.includes(e.engine)||seen.has(e.engine)||!['passed','failed'].includes(e.status)||e.canary_verified!==true)fail('report-engine');seen.add(e.engine);
      if(e.status==='passed'){assertEngineResult(e.proof,{...r,variant,engine:e.engine});if(e.failure!==null)fail('report-conflicting-proof');}
      else{if(e.proof!==null)fail('report-failed-proof');if(e.failure!==null)assertFailure(e.failure,{...r,variant,engine:e.engine});}
    }
    const complete=r[variant].topology_verified && r[variant].engines.length===3 && r[variant].engines.every(e=>e.status==='passed');
    if((r[variant].status==='passed')!==complete || (r[variant].status==='not_run'&&r[variant].engines.length))fail('report-variant-status');
  }
  const passed=r.cleanup && r.module_preloaded===true && VARIANTS.every(v=>r[v].status==='passed');
  if((r.status==='passed')!==passed || (passed&&r.stage!=='complete'))fail('report-status');
  return r;
}

/** Actual orchestration, shared by native CLI and offline fault-injection tests. */
export async function orchestrateProof(runtime,id) {
  identity(id.run_id,id.source_sha);
  const r={...id,scope:'network-proof',status:'failed',stage:'preflight',failure_code:null,module_preloaded:null,
    baseline:{status:'not_run',topology_verified:false,engines:[]},candidate:{status:'not_run',topology_verified:false,engines:[]},
    cleanup:false,plan_fully_validated:false,unproved:{bun_egress:'not_run',edge_egress:'not_run',external_ipv6:'not_run'}};
  try {
    await runtime.prepare();
    for(const variant of VARIANTS){
      if(variant==='candidate'){
        r.stage='module';r.module_preloaded=await runtime.moduleAvailable();
        if(r.module_preloaded!==true){r.module_preloaded=false;r.failure_code='dummy-not-preloaded';break;}
      }
      r.stage=variant;r[variant].status='failed';await runtime.startVariant(variant);r[variant].topology_verified=true;
      for(const engine of ENGINES){
        const outcome=await runtime.runEngine(variant,engine);object(outcome,['proof','failure']);const {proof,failure}=outcome;
        if(proof!==null)assertEngineResult(proof,{...id,variant,engine});
        if(failure!==null)assertFailure(failure,{...id,variant,engine});
        r[variant].engines.push({engine,status:proof===null?'failed':'passed',proof,failure,canary_verified:true});
      }
      if(r[variant].engines.every(e=>e.status==='passed'))r[variant].status='passed';
    }
  } catch(error) {r.failure_code=publicFailureCode(error);}
  finally {try {r.cleanup=(await runtime.cleanup())===true;} catch {r.cleanup=false;} if(!r.cleanup){r.stage='cleanup';r.failure_code='cleanup-failed';}}
  if(r.cleanup&&r.module_preloaded===true&&VARIANTS.every(v=>r[v].status==='passed')){r.status='passed';r.stage='complete';}
  if(r.status==='failed'&&r.failure_code===null)r.failure_code='browser-proof-failed';
  return validatePublicReport(r);
}

function safeSystemFile(file) {
  const resolved=realpathSync(file),s=lstatSync(resolved);
  if(!/^\/(?:usr\/(?:bin|sbin|lib|lib64)|lib|lib64)\//.test(resolved) || !s.isFile() || s.uid!==0 || (s.mode&0o022) ||
     s.size<4 || s.size>32*1024*1024 || readFileSync(resolved).subarray(0,4).toString('hex')!=='7f454c46')fail('net-tool-provenance');
  return resolved;
}
export async function prepareNetworkTools(directory,command=runCommand) {
  mkdirSync(directory,{mode:0o700});mkdirSync(path.join(directory,'lib'),{mode:0o700});
  const candidate=['/usr/sbin/ip','/usr/bin/ip','/sbin/ip'].find(existsSync);if(!candidate)fail('iproute2-unavailable');
  const source=safeSystemFile(candidate);
  const output=commandOutput(await command('/usr/bin/ldd',[source],{env:{PATH:'/usr/bin:/bin',LC_ALL:'C'},timeout:5000}));
  const libraries=[],loaders=[];
  for(const line of output.trim().split('\n')){
    if(/^\s*linux-vdso\.so\.1\s+\(0x[0-9a-f]+\)$/.test(line))continue;
    let m=line.match(/^\s*([A-Za-z0-9_.+-]+)\s+=>\s+(\/[^\s]+)\s+\(0x[0-9a-f]+\)$/);
    if(m){libraries.push({name:m[1],source:safeSystemFile(m[2])});continue;}
    m=line.match(/^\s*(\/[^\s]+)\s+\(0x[0-9a-f]+\)$/);
    if(m){loaders.push(safeSystemFile(m[1]));continue;}
    fail('net-tool-ldd-shape');
  }
  if(loaders.length!==1||libraries.length<1||libraries.length>24||new Set(libraries.map(x=>x.name)).size!==libraries.length)fail('net-tool-dependencies');
  const copy=(from,to,mode) => {const data=readFileSync(from);writeFileSync(to,data,{flag:'wx',mode});return digest(data);};
  const hashes={ip:copy(source,path.join(directory,'ip'),0o555),loader:copy(loaders[0],path.join(directory,'loader'),0o555)};
  for(const lib of libraries)hashes[lib.name]=copy(lib.source,path.join(directory,'lib',lib.name),0o444);
  chmodSync(path.join(directory,'lib'),0o555);chmodSync(directory,0o555);
  return hashes;
}

export class HostCanary {
  constructor(id,{interfaces=networkInterfaces,createServer=http.createServer,request=http.get}={}){
    this.id=id;this.count=0;this.connections=0;this.server=null;this.interfaces=interfaces;this.createServer=createServer;this.request=request;
  }
  async start(){
    const addresses=Object.values(this.interfaces()).flat().filter(x=>x.family==='IPv4'&&!x.internal&&!x.address.startsWith('127.'));
    if(!addresses.length)fail('canary-interface');
    this.address=addresses[0].address;this.token=randomBytes(16).toString('hex');this.pathname='/canary/'+this.token;
    this.body=JSON.stringify({...this.id,canary:this.token});
    this.server=this.createServer((req,res)=>{
      this.count++;res.setHeader('Connection','close');res.setHeader('Cache-Control','no-store');
      if(req.method!=='GET'||req.url!==this.pathname){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':'application/json'});res.end(this.body);
    });
    this.server.on('connection',()=>{this.connections++;});this.server.requestTimeout=3000;this.server.headersTimeout=3000;
    await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(0,this.address,resolve);});
    const bound=this.server.address();if(!bound||bound.address!==this.address||bound.family!=='IPv4')fail('canary-bind');
    this.port=bound.port;this.url='http://'+this.address+':'+this.port+this.pathname;
    await this.positive();
  }
  async positive(){
    const value=await new Promise((resolve,reject)=>{
      const req=this.request({hostname:this.address,port:this.port,path:this.pathname,agent:false,timeout:3000},res=>{
        let data='';res.on('data',b=>{data+=b.toString('utf8');if(data.length>4096)req.destroy(Error('bound'));});
        res.on('end',()=>resolve(res.statusCode===200&&data===this.body));res.on('error',reject);
      });req.on('timeout',()=>req.destroy(Error('timeout')));req.on('error',reject);
    });
    if(value!==true)fail('canary-positive');
    return {valid:true,count:this.count,connections:this.connections};
  }
  async close(){
    if(!this.server)return;this.server.closeAllConnections();
    await Promise.race([new Promise(resolve=>this.server.close(resolve)),delay(1000).then(()=>{throw Error('canary-close');})]);
  }
}

export function collectCompletedProof(directory,config,{running,exitCode,sequence,identities={}}) {
  if(running!==false||exitCode!==0||(config.variant==='candidate'&&sequence!==3)||(config.variant==='baseline'&&sequence!==1))fail('driver-incomplete');
  const names=['config.json','trust-ready.json','result.json',...(config.variant==='candidate'?['request-1.json','ack-1.json','request-2.json','ack-2.json']:[])];
  const files=readdirSync(directory);if(files.length!==names.length||files.some(x=>!names.includes(x)))fail('control-inventory');
  for(const [name,expected] of Object.entries(identities)){
    if(!names.includes(name)||protocolFileIdentity(path.join(directory,name))!==expected)fail('control-rewritten');
  }
  if(JSON.stringify(readBoundedJson(path.join(directory,'config.json')))!==JSON.stringify(config))fail('config-changed');
  const trust=readBoundedJson(path.join(directory,'trust-ready.json'));object(trust,['schema','run_id','source_sha','ready']);
  if(trust.schema!==1||trust.run_id!==config.run_id||trust.source_sha!==config.source_sha||trust.ready!==true)fail('trust-ack');
  if(config.variant==='candidate')for(const n of [1,2]){
    const expected={...config,sequence:n,action:n===1?'down':'up'};
    assertControl(readBoundedJson(path.join(directory,'request-'+n+'.json')),expected);
    assertControl(readBoundedJson(path.join(directory,'ack-'+n+'.json')),expected,true);
  }
  const result=readBoundedJson(path.join(directory,'result.json'));assertEngineResult(result,config);return result;
}

export class NativeRuntime {
  constructor({root,output,id,env=process.env}){
    this.root=root;this.output=output;this.id=id;this.env=env;this.records=[];this.namespaces={};this.variants={};this.outputOwned=false;
    this.abort=new AbortController();this.canary=null;this.imageId=null;
  }
  async cmd(program,args,options={}){return commandOutput(await runCommand(program,args,{env:{PATH:this.env.PATH},cwd:this.root,signal:this.abort.signal,...options}));}
  async docker(args,{cleanup=false,timeout=30_000}={}){
    return commandOutput(await runCommand('docker',['--host','unix:///var/run/docker.sock',...args],{
      env:{PATH:this.env.PATH,DOCKER_CONFIG:this.dockerConfig},cwd:this.root,timeout,signal:cleanup?undefined:this.abort.signal}));
  }
  async prepare(){
    const e=this.env;
    if(process.platform!=='linux'||process.arch!=='x64'||typeof process.getuid!=='function'||e.GITHUB_EVENT_NAME!=='workflow_dispatch'||
       requestScope(e.GITHUB_EVENT_NAME,e.ZAPP_PROOF_SCOPE,e.ZAPP_PROOF_SHA)!=='network-proof'||e.ZAPP_PROOF_SHA!==this.id.source_sha||
       e.GITHUB_SHA!==this.id.source_sha)fail('native-invocation');
    if((await this.cmd('git',['rev-parse','HEAD'])).trim()!==this.id.source_sha||(await this.cmd('git',['status','--porcelain','--untracked-files=no'])).trim())fail('checkout-state');
    const pkg=parseJson(readFileSync(path.join(this.root,'node_modules/@playwright/test/package.json'),'utf8'));
    if(pkg.version!==VERSION||parseJson(readFileSync(path.join(this.root,'scripts/e2e-isolated/images.lock.json'),'utf8')).images?.driver!==DRIVER)fail('driver-version');
    if(!e.RUNNER_TEMP||realpathSync(e.RUNNER_TEMP)!==e.RUNNER_TEMP||this.output!==path.join(e.RUNNER_TEMP,'e2e-network-proof','report.json')||/[,\r\n\0]/.test(this.output))fail('output-path');
    this.outdir=path.dirname(this.output);mkdirSync(this.outdir,{mode:0o700});this.outputOwned=true;
    this.private=path.join(this.outdir,'private');mkdirSync(this.private,{mode:0o700});
    this.dockerConfig=path.join(this.private,'docker');mkdirSync(this.dockerConfig,{mode:0o700});
    this.uid=process.getuid()+':'+process.getgid();
    this.hostNamespace=readlinkSync('/proc/self/ns/net');if(!/^net:\[\d+\]$/.test(this.hostNamespace))fail('host-namespace');
    const endpoint=(await this.cmd('docker',['context','inspect','--format','{{json .Endpoints.docker.Host}}'],{env:{PATH:e.PATH,DOCKER_CONFIG:this.dockerConfig}})).trim();
    if(endpoint!=='"unix:///var/run/docker.sock"')fail('docker-endpoint');
    preflightTlsTools({directory:path.join(this.private,'tls-preflight')});
    this.material=createTlsMaterial({directory:path.join(this.private,'tls'),runId:this.id.run_id,sourceSha:this.id.source_sha});
    this.tools=path.join(this.private,'network-tools');this.toolHashes=await prepareNetworkTools(this.tools);
    await this.docker(['pull',DRIVER],{timeout:240_000});
    const image=parseJson(await this.docker(['image','inspect',DRIVER]));
    if(!Array.isArray(image)||image.length!==1||!/^sha256:[0-9a-f]{64}$/.test(image[0]?.Id)||
       !image[0].RepoDigests?.includes('mcr.microsoft.com/playwright@'+DRIVER.split('@')[1])||image[0].Architecture!=='amd64')fail('driver-image');
    this.imageId=image[0].Id;
    // All synchronous setup is complete before the positive canary is started.
    this.canary=new HostCanary(this.id);await this.canary.start();
  }
  async moduleAvailable(){return passiveDummy();}
  baseMounts(){return [{source:this.root,target:'/work',write:false},{source:this.tools,target:TOOLS,write:false}];}
  async inspect(record,{cleanup=false}={}){
    const rows=parseJson(await this.docker(['inspect',record.id||record.name],{cleanup}));
    if(!Array.isArray(rows)||rows.length!==1)fail('container-inspect');
    if(!record.id)record.id=rows[0].Id;
    assertContainer(rows[0],record);return rows[0];
  }
  async create(role,variant,{anchor=null,helper=false,mounts=[],env={},command}={}){
    const name=this.id.run_id+'-'+variant+'-'+role;
    if(!/^[a-z0-9-]{1,120}$/.test(name)||this.records.some(r=>r.name===name))fail('container-name');
    const record={...this.id,name,id:null,image_id:this.imageId,user:helper?'0:0':this.uid,helper,network:anchor?'container:'+anchor.id:'none',mounts:[...this.baseMounts(),...mounts],removed:false};
    this.records.push(record);
    const args=['create','--name',name,'--label','zapp.e2e.owner='+this.id.run_id,'--label','zapp.e2e.purpose='+PURPOSE,
      '--label','zapp.e2e.source='+this.id.source_sha,'--network',record.network,'--cap-drop','ALL','--security-opt','no-new-privileges:true',
      '--user',record.user,'--memory',role.startsWith('browser-')?'2g':'256m','--pids-limit','512','--shm-size','256m','--workdir','/work'];
    if(helper)args.push('--cap-add','NET_ADMIN');
    if(!anchor)args.push('--add-host',OFFICIAL_HOST+':127.0.0.1');
    for(const m of record.mounts){if(/[,\r\n\0]/.test(m.source+m.target))fail('mount-path');args.push('--mount','type=bind,source='+m.source+',target='+m.target+(m.write?'':',readonly'));}
    const childEnv={ZAPP_NETWORK_RUN:this.id.run_id,ZAPP_NETWORK_SHA:this.id.source_sha,ZAPP_NETWORK_VARIANT:variant,...env};
    for(const [k,v] of Object.entries(childEnv))args.push('--env',k+'='+v);
    args.push(DRIVER,...command);
    const output=(await this.docker(args)).trim();if(!/^[a-f0-9]{64}$/.test(output))fail('container-create');record.id=output;
    await this.inspect(record);await this.docker(['start',record.id]);const c=await this.inspect(record);
    if(!c.State?.Running&&!helper)fail('container-not-running');return record;
  }
  async topology(variant,state='up'){
    const anchor=this.variants[variant].anchor;const c=await this.inspect(anchor);if(c.State?.Running!==true)fail('anchor-not-running');
    const s=parseJson(await this.docker(['exec',anchor.id,'node',SCRIPT,'snapshot']));assertTopology(s,variant,state);
    if(s.namespace!==this.namespaces[variant]||s.namespace===this.hostNamespace||Object.entries(this.namespaces).some(([k,n])=>k!==variant&&n===s.namespace))fail('namespace-changed');
    return s;
  }
  async helper(variant,action){
    const group=this.variants[variant];if(variant!=='candidate'||!['create','down','up'].includes(action))fail('helper-request');
    const suffix='helper-'+action+'-'+randomBytes(4).toString('hex');
    const helper=await this.create(suffix,variant,{anchor:group.anchor,helper:true,env:{ZAPP_NETWORK_NAMESPACE:this.namespaces[variant]},command:['node',SCRIPT,'helper',action]});
    try {
      const code=(await this.docker(['wait',helper.id],{timeout:45_000})).trim();const c=await this.inspect(helper);
      if(code!=='0'||c.State?.Running!==false||c.State?.ExitCode!==0)fail('helper-exit');
      const value=parseJson(await this.docker(['logs',helper.id]));object(value,['schema','action','ok']);
      if(value.schema!==1||value.action!==action||value.ok!==true)fail('helper-result');
    } finally {await this.remove(helper);}
  }
  async startVariant(variant){
    if(!VARIANTS.includes(variant)||this.variants[variant])fail('variant-order');
    const anchor=await this.create('anchor',variant,{command:['node','-e','setInterval(()=>{},1000)']});this.variants[variant]={anchor};
    const s=parseJson(await this.docker(['exec',anchor.id,'node',SCRIPT,'snapshot']));assertTopology(s,'baseline');
    if(s.namespace===this.hostNamespace||Object.values(this.namespaces).includes(s.namespace))fail('namespace-not-isolated');this.namespaces[variant]=s.namespace;
    if(variant==='candidate')await this.helper(variant,'create');
    await this.topology(variant);
    const mounts=tlsMounts(this.material,'gateway').map(m=>({source:m.source,target:m.target,write:!m.readOnly}));
    this.variants[variant].server=await this.create('https',variant,{anchor,mounts,env:{ZAPP_NETWORK_NAMESPACE:s.namespace},command:['node',SCRIPT,'server']});
  }
  async trust(record){
    const verify=async()=>{const c=await this.inspect(record);if(!c.State?.Running||digest(new X509Certificate(readFileSync(this.material.publicDirectory+'/ca.crt')).raw)!==this.material.caSha256)fail('trust-identity');};
    await verify();await this.docker(['exec','--user','0:0',record.id,'install','-m','0644',TLS_PUBLIC+'/ca.crt','/usr/local/share/ca-certificates/zapp-e2e-local.crt']);
    await verify();await this.docker(['exec','--user','0:0',record.id,'update-ca-certificates']);await verify();
  }
  async runEngine(variant,engine){
    if(!ENGINES.includes(engine))fail('engine-name');await this.topology(variant);
    const directory=path.join(this.private,variant+'-'+engine);mkdirSync(directory,{mode:0o700});
    const config={...this.id,variant,engine,canary_url:this.canary.url,namespace:this.namespaces[variant]};writeAtomicJson(path.join(directory,'config.json'),config);
    const identities={'config.json':protocolFileIdentity(path.join(directory,'config.json'))};
    const before=await this.canary.positive();let driver=null,result=null,behaviorFailed=false,sequence=1,down=false,exited=false,exitCode=null;
    try {
      const mounts=[...tlsMounts(this.material,'driver').map(m=>({source:m.source,target:m.target,write:!m.readOnly})),{source:directory,target:CONTROL,write:true}];
      driver=await this.create('browser-'+engine,variant,{anchor:this.variants[variant].anchor,mounts,env:{...tlsEnvironment(this.material,'driver'),ZAPP_NETWORK_NAMESPACE:config.namespace},command:['node',SCRIPT,'browser']});
      await this.trust(driver);writeAtomicJson(path.join(directory,'trust-ready.json'),{...this.id,ready:true});
      identities['trust-ready.json']=protocolFileIdentity(path.join(directory,'trust-ready.json'));
      const deadline=Date.now()+(variant==='candidate'?150_000:90_000);
      while(Date.now()<deadline){
        if(this.abort.signal.aborted)fail('aborted');
        if(variant==='candidate'){
          if(readBoundedJson(path.join(directory,'request-3.json'),true)!==null ||
             (sequence===1&&readBoundedJson(path.join(directory,'request-2.json'),true)!==null))fail('unexpected-control');
          const next=sequence<=2?readBoundedJson(path.join(directory,'request-'+sequence+'.json'),true):null;
          if(next){
            const action=sequence===1?'down':'up';assertControl(next,{...config,sequence,action});
            identities['request-'+sequence+'.json']=protocolFileIdentity(path.join(directory,'request-'+sequence+'.json'));
            if(readBoundedJson(path.join(directory,'result.json'),true)!==null)fail('early-result');
            await this.helper(variant,action);down=action==='down';await this.topology(variant,action);
            writeAtomicJson(path.join(directory,'ack-'+sequence+'.json'),{...next,accepted:true});
            identities['ack-'+sequence+'.json']=protocolFileIdentity(path.join(directory,'ack-'+sequence+'.json'));sequence++;
          }
        }else if(readBoundedJson(path.join(directory,'request-1.json'),true)!==null)fail('baseline-control');
        const c=await this.inspect(driver);
        if(c.State?.Running===false){exitCode=c.State.ExitCode;if(exitCode!==0)behaviorFailed=true;exited=true;break;}
        await delay(100);
      }
      if(!exited)behaviorFailed=true;
      // Result is read only after PID1 exited successfully, never while a late
      // or timed-out writer could still complete the file.
      if(!behaviorFailed && (variant==='baseline'||sequence===3)){
        result=collectCompletedProof(directory,config,{running:!exited,exitCode,sequence,identities});
      }else behaviorFailed=true;
    } catch {behaviorFailed=true;}
    finally {
      if(driver)await this.remove(driver);
      if(down)await this.helper(variant,'up');
      await this.topology(variant);
      const after=await this.canary.positive();assertCanary(before,after,false);
    }
    let failure=null;
    if(behaviorFailed&&exited&&exitCode!==0)try{
      if(readBoundedJson(path.join(directory,'result.json'),true)===null){const value=readBoundedJson(path.join(directory,'failure.json'),true);if(value)failure=assertFailure(value,config);}
    }catch{}
    return {proof:behaviorFailed?null:result,failure};
  }
  async remove(record){
    if(record.removed)return;
    await this.inspect(record,{cleanup:true});await this.docker(['rm','--force',record.id],{cleanup:true});
    // Exact ID was inspected immediately before removal. Do not retry by a name
    // which could now refer to another owner's container.
    const all=(await this.docker(['ps','--all','--no-trunc','--format','{{.ID}}'],{cleanup:true})).trim().split('\n').filter(Boolean);
    if(all.includes(record.id))fail('container-remains');record.removed=true;
  }
  async cleanup(){
    let ok=true;
    for(const r of [...this.records].reverse())try{await this.remove(r);}catch{ok=false;}
    if(this.canary)try{await this.canary.close();}catch{ok=false;}
    if(ok&&this.private){try{chmodSync(path.join(this.private,'network-tools'),0o700);chmodSync(path.join(this.private,'network-tools','lib'),0o700);}catch{}
      rmSync(this.private,{recursive:true,force:true});if(existsSync(this.private))ok=false;}
    return ok;
  }
  publish(report){
    if(!this.outputOwned||!report.cleanup)return false;
    validatePublicReport(report);writeAtomicJson(this.output,report);validatePublicReport(readBoundedJson(this.output));
    if(this.env.GITHUB_OUTPUT){const s=lstatSync(this.env.GITHUB_OUTPUT);if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid())fail('github-output');appendFileSync(this.env.GITHUB_OUTPUT,'report_ready=true\n');}
    return true;
  }
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{
    if(process.argv.length!==3)fail('arguments');
    const sha=process.env.ZAPP_PROOF_SHA,id=identity('zapp-e2e-'+process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT+'-'+randomBytes(4).toString('hex'),sha);
    const runtime=new NativeRuntime({root:realpathSync(process.cwd()),output:path.resolve(process.argv[2]),id});
    const stop=()=>runtime.abort.abort();process.once('SIGTERM',stop);process.once('SIGINT',stop);
    const report=await orchestrateProof(runtime,id);runtime.publish(report);
    process.stdout.write(JSON.stringify({scope:report.scope,status:report.status,stage:report.stage,failure_code:report.failure_code,plan_fully_validated:false})+'\n');
    process.exitCode=report.status==='passed'?0:1;
  }catch{process.stderr.write('[network-proof/execution-failed]\n');process.exitCode=1;}
}
