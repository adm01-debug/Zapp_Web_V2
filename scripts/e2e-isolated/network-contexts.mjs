import { appendFileSync, lstatSync, mkdirSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { tlsEnvironment, tlsMounts } from './tls.mjs';
import { CONTROL, protocolFileIdentity, readBoundedJson, writeAtomicJson } from './network-proof-browser.mjs';
import { NativeRuntime } from './network-proof.mjs';
import { ENGINES, assertCanary, fail, identity, object } from './network-proof-policy.mjs';
import { FIXED_SOURCES, verifySources, verifyTestOutput } from './network-contexts-browser.mjs';
import { SCOPE, SOURCE, TEST_OUTPUT, assertConfig, assertContextFailure, assertContextResult, assertTestRecord, assertTestRunner,
  contextResultPassed, envelope, publicContextFailure, summarizeContexts, validateContextsReport } from './network-contexts-policy.mjs';

const SCRIPT='/work/scripts/e2e-isolated/network-contexts-browser.mjs';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function writeContextSources(directory){
  mkdirSync(directory,{mode:0o700});for(const [name,content] of Object.entries(FIXED_SOURCES))writeFileSync(path.join(directory,name),content,{mode:0o400,flag:'wx'});
  return verifySources(directory);
}
export function collectContextOutcome({directory,sources,output,config,identities,sourceIdentities,running,exitCode,timedOut}){
  assertConfig(config);
  if(running!==false||timedOut!==false||!Number.isInteger(exitCode))fail('contexts-timeout');
  if(!same(verifySources(sources),sourceIdentities))fail('temporary-sources');
  for(const name of ['config.json','trust-ready.json'])if(protocolFileIdentity(path.join(directory,name))!==identities[name])fail('contexts-protocol');
  const names=readdirSync(directory).sort();
  const allowed=['config.json','trust-ready.json','test-default.json','test-runner.json',exitCode===0?'result.json':'failure.json'].sort();
  if(names.some(name=>!allowed.includes(name))||names.some(name=>protocolFileIdentity(path.join(directory,name)).length===0))fail('contexts-protocol');
  if(exitCode!==0){
    const failure=readBoundedJson(path.join(directory,'failure.json'),true);
    return {result:null,failure:failure===null?null:assertContextFailure(failure,config)};
  }
  if(!same(names,allowed))fail('contexts-protocol');
  const runner=readBoundedJson(path.join(directory,'test-runner.json'));assertTestRunner(runner,config);
  const record=assertTestRecord(readBoundedJson(path.join(directory,'test-default.json')),config);
  const result=assertContextResult(readBoundedJson(path.join(directory,'result.json')),config);
  if(!same(result.test_default,record.data))fail('contexts-protocol');verifyTestOutput(output);
  return {result,failure:null};
}
export async function orchestrateContexts(runtime,id){
  identity(id.run_id,id.source_sha);
  const r={schema:2,scope:SCOPE,run_id:id.run_id,source_sha:id.source_sha,status:'failed',stage:'preflight',failure_code:null,
    topology:'loopback-only',topology_verified:false,collection_complete:false,official_api_cycle_passed:false,native_online_all:null,test_default_online_all:null,
    engines:[],cleanup:false,native_contract_qualified:false,authenticated_admission:false,plan_fully_validated:false,
    unproved:{dummy:'not_run',veth:'not_run',default_route:'not_run',bun_egress:'not_run',edge_egress:'not_run',external_ipv6:'not_run'}};
  try{
    await runtime.prepare();r.stage='baseline';await runtime.startVariant('baseline');r.topology_verified=true;r.stage='contexts';
    for(const engine of ENGINES){
      const outcome=await runtime.runContext(engine);object(outcome,['result','failure']);
      if(outcome.result!==null)assertContextResult(outcome.result,{...id,engine});
      if(outcome.failure!==null)assertContextFailure(outcome.failure,{...id,engine});
      r.engines.push({engine,status:outcome.result!==null&&contextResultPassed(outcome.result)?'passed':'failed',...outcome,canary_verified:true});
    }
  }catch(error){r.failure_code=publicContextFailure(error);r.topology_verified=false;}
  finally{try{r.cleanup=(await runtime.cleanup())===true;}catch{r.cleanup=false;}if(!r.cleanup){r.stage='cleanup';r.failure_code='cleanup-failed';}}
  Object.assign(r,summarizeContexts(r.engines));
  if(r.cleanup&&r.topology_verified&&r.collection_complete&&r.engines.every(x=>x.status==='passed')){r.status='passed';r.stage='complete';}
  if(r.status==='failed'&&r.failure_code===null)r.failure_code='contexts-proof-failed';
  return validateContextsReport(r);
}
export class ContextRuntime extends NativeRuntime{
  async prepare(){await super.prepare(SCOPE);}
  async moduleAvailable(){fail('contexts-config');}
  async helper(){fail('contexts-config');}
  async create(role,variant,options){if(variant!=='baseline'||options?.helper)fail('contexts-config');return super.create(role,variant,options);}
  async startVariant(variant){if(variant!=='baseline')fail('contexts-config');return super.startVariant(variant);}
  async runContext(engine){
    if(!ENGINES.includes(engine))fail('contexts-config');await this.topology('baseline');
    const root=path.join(this.private,'contexts-'+engine);mkdirSync(root,{mode:0o700});
    const directory=path.join(root,'control'),sources=path.join(root,'source'),output=path.join(root,'test-output');
    mkdirSync(directory,{mode:0o700});mkdirSync(output,{mode:0o700});const sourceIdentities=writeContextSources(sources);
    const config={...envelope(this.id,engine),namespace:this.namespaces.baseline,canary_url:this.canary.url};assertConfig(config);
    writeAtomicJson(path.join(directory,'config.json'),config);const identities={'config.json':protocolFileIdentity(path.join(directory,'config.json'))};
    const before=await this.canary.positive();let driver=null,outcome={result:null,failure:null},exited=false,exitCode=null,timedOut=false;
    try{
      const mounts=[...tlsMounts(this.material,'driver').map(m=>({source:m.source,target:m.target,write:!m.readOnly})),
        {source:directory,target:CONTROL,write:true},{source:sources,target:SOURCE,write:false},{source:output,target:TEST_OUTPUT,write:true}];
      driver=await this.create('browser-contexts-'+engine,'baseline',{anchor:this.variants.baseline.anchor,mounts,
        env:{...tlsEnvironment(this.material,'driver'),ZAPP_NETWORK_NAMESPACE:config.namespace},command:['node',SCRIPT,'probe']});
      await this.trust(driver);writeAtomicJson(path.join(directory,'trust-ready.json'),{...envelope(this.id,engine),ready:true});
      identities['trust-ready.json']=protocolFileIdentity(path.join(directory,'trust-ready.json'));
      const deadline=Date.now()+90_000;
      while(Date.now()<deadline){
        if(this.abort.signal.aborted)fail('contexts-timeout');
        const c=await this.inspect(driver);if(c.State?.Running===false){exitCode=c.State.ExitCode;exited=true;break;}await pause(100);
      }
      timedOut=!exited;
      if(exited)outcome=collectContextOutcome({directory,sources,output,config,identities,sourceIdentities,running:false,exitCode,timedOut});
    }catch{outcome={result:null,failure:null};}
    finally{
      if(driver)await this.remove(driver);
      if(!same(verifySources(sources),sourceIdentities))fail('temporary-sources');
      await this.topology('baseline');const after=await this.canary.positive();assertCanary(before,after,false);
    }
    return outcome;
  }
  publish(report){
    if(!this.outputOwned||!report.cleanup)return false;
    validateContextsReport(report);writeAtomicJson(this.output,report);validateContextsReport(readBoundedJson(this.output));
    if(this.env.GITHUB_OUTPUT){const s=lstatSync(this.env.GITHUB_OUTPUT);if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid())fail('github-output');appendFileSync(this.env.GITHUB_OUTPUT,'report_ready=true\n');}
    return true;
  }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  try{
    if(process.argv.length!==3)fail('arguments');
    const id=identity('zapp-e2e-'+process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT+'-'+randomBytes(4).toString('hex'),process.env.ZAPP_PROOF_SHA);
    const runtime=new ContextRuntime({root:realpathSync(process.cwd()),output:path.resolve(process.argv[2]),id});
    const stop=()=>runtime.abort.abort();process.once('SIGTERM',stop);process.once('SIGINT',stop);
    const report=await orchestrateContexts(runtime,id);runtime.publish(report);
    process.stdout.write(JSON.stringify({scope:report.scope,status:report.status,collection_complete:report.collection_complete,official_api_cycle_passed:report.official_api_cycle_passed,
      native_online_all:report.native_online_all,test_default_online_all:report.test_default_online_all,native_contract_qualified:false,authenticated_admission:false,plan_fully_validated:false})+'\n');
    process.exitCode=report.status==='passed'?0:1;
  }catch{process.stderr.write('[network-proof/contexts-proof-failed]\n');process.exitCode=1;}
}
