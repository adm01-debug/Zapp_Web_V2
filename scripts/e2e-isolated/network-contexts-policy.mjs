import { ENGINES, FAILURE_CODES, VERSION, fail, identity, object } from './network-proof-policy.mjs';

export const SCOPE='network-proof-contexts';
export const SOURCE='/run/zapp-network-contexts-source';
export const TEST_OUTPUT='/run/zapp-network-contexts-test-output';
export const TEST_RESULTS=TEST_OUTPUT+'/results';
export const TEST_TITLE='isolated real Playwright Test default';
export const PHASES=Object.freeze(['preflight','native','test-default','explicit-option','explicit-false','api-cycle','fresh','result']);
export const CONTEXT_FAILURES=Object.freeze([...FAILURE_CODES,'contexts-proof-failed','contexts-protocol','contexts-config','contexts-timeout','temporary-sources','temporary-output','test-runner-failed']);
const bool=x=>typeof x==='boolean';
const count=x=>Number.isSafeInteger(x)&&x>=0&&x<=8;
const version=x=>typeof x==='string'&&/^[0-9]+(?:\.[0-9]+){1,3}$/.test(x)&&x.length<=64;
export function envelope(id,engine){identity(id.run_id,id.source_sha);if(!ENGINES.includes(engine))fail('contexts-config');return {schema:2,scope:SCOPE,run_id:id.run_id,source_sha:id.source_sha,engine};}
export function assertEnvelope(v,e){
  identity(v.run_id,v.source_sha);
  if(v.schema!==2||v.scope!==SCOPE||v.run_id!==e.run_id||v.source_sha!==e.source_sha||v.engine!==e.engine||!ENGINES.includes(v.engine))fail('contexts-protocol');
  return v;
}
export function assertConfig(v,e=v){
  object(v,['schema','scope','run_id','source_sha','engine','namespace','canary_url']);assertEnvelope(v,e);
  if(typeof v.namespace!=='string'||!/^net:\[\d+\]$/.test(v.namespace)||typeof v.canary_url!=='string')fail('contexts-config');
  return v;
}
export function assertEvents(e){object(e,['offline','online']);if(!count(e.offline)||!count(e.online))fail('contexts-protocol');return e;}
function allBooleans(v,fields){object(v,fields);if(fields.some(k=>!bool(v[k])))fail('contexts-protocol');}
export function assertTestDefault(v){
  object(v,['online','https','tls_untrusted_rejected','tls_wrong_san_rejected','external_browser_blocked','fixture_offline','ignore_https_errors','service_workers','source','browser_version']);
  if(['online','https','tls_untrusted_rejected','tls_wrong_san_rejected','external_browser_blocked'].some(k=>!bool(v[k]))||
     v.fixture_offline!==false||v.ignore_https_errors!==false||v.service_workers!=='block'||v.source!=='playwright-test-fixture'||!version(v.browser_version))fail('contexts-protocol');
  return v;
}
export function assertTestRecord(v,e){object(v,['schema','scope','run_id','source_sha','engine','data']);assertEnvelope(v,e);assertTestDefault(v.data);return v;}
export function assertTestRunner(v,e,successful=true){
  object(v,['schema','scope','run_id','source_sha','engine','tests','passed','failed','skipped','retries','status','error']);assertEnvelope(v,e);
  if(['tests','passed','failed','skipped','retries'].some(k=>!count(v[k]))||!['passed','failed','timedout','interrupted'].includes(v.status)||!bool(v.error))fail('contexts-protocol');
  if(successful&&(v.tests!==1||v.passed!==1||v.failed!==0||v.skipped!==0||v.retries!==0||v.status!=='passed'||v.error!==false))fail('test-runner-failed');
  return v;
}
export function assertContextResult(v,e){
  object(v,['schema','scope','run_id','source_sha','engine','native','test_default','explicit_option_false','explicit_false','api_cycle','fresh','versions']);assertEnvelope(v,e);
  allBooleans(v.native,['online','https','node_https','tls_untrusted_rejected','tls_wrong_san_rejected','external_node_blocked','external_browser_blocked']);
  assertTestDefault(v.test_default);allBooleans(v.explicit_option_false,['online','https']);
  object(v.explicit_false,['before','after','https','events']);if(['before','after','https'].some(k=>!bool(v.explicit_false[k])))fail('contexts-protocol');assertEvents(v.explicit_false.events);
  if(!Array.isArray(v.api_cycle)||v.api_cycle.length!==4)fail('contexts-protocol');
  for(const [i,step] of v.api_cycle.entries()){
    object(step,['requested_offline','before','after','request','events']);
    if(step.requested_offline!==(i%2===0)||!bool(step.before)||!bool(step.after)||!['passed','blocked','failed','timeout'].includes(step.request))fail('contexts-protocol');
    assertEvents(step.events);if(i&&step.before!==v.api_cycle[i-1].after)fail('contexts-protocol');
  }
  allBooleans(v.fresh,['online','https','unemulated']);if(v.fresh.unemulated!==true)fail('contexts-protocol');
  object(v.versions,['node','playwright','browser']);
  if(typeof v.versions.node!=='string'||!/^v\d+\.\d+\.\d+$/.test(v.versions.node)||v.versions.playwright!==VERSION||!version(v.versions.browser)||v.versions.browser!==v.test_default.browser_version)fail('contexts-protocol');
  return v;
}
export function qualifications(v){
  const security=Object.entries(v.native).every(([k,x])=>k==='online'||x===true)&&
    ['https','tls_untrusted_rejected','tls_wrong_san_rejected','external_browser_blocked'].every(k=>v.test_default[k]===true)&&
    v.explicit_option_false.https===true&&v.explicit_false.https===true&&v.fresh.https===true;
  const api=v.api_cycle.every(step=>{
    const desired=!step.requested_offline,event=desired?'online':'offline',other=desired?'offline':'online';
    return step.after===desired&&step.request===(desired?'passed':'blocked')&&step.events[other]===0&&
      (step.before===desired||step.events[event]>=1);
  });
  const explicit=v.explicit_false.events.offline===0&&
    (v.explicit_false.before===v.explicit_false.after||(v.explicit_false.after===true&&v.explicit_false.events.online>=1));
  return {security,api,contexts_consistent:explicit&&v.explicit_false.before===v.native.online&&v.api_cycle[0].before===v.native.online&&v.fresh.online===v.native.online,
    native_online:v.native.online,test_default_online:v.test_default.online};
}
export function contextResultPassed(v){const q=qualifications(v);return q.security&&q.api&&q.contexts_consistent;}
export function assertContextFailure(v,e){
  object(v,['schema','scope','run_id','source_sha','engine','phase','observations']);assertEnvelope(v,e);
  object(v.observations,['native_online','test_default_online']);
  if(!PHASES.includes(v.phase)||Object.values(v.observations).some(x=>x!==null&&!bool(x)))fail('contexts-protocol');return v;
}
export function publicContextFailure(error){
  const code=typeof error?.message==='string'?error.message.match(/^\[network-proof\/([a-z0-9-]+)\]$/)?.[1]:null;
  return CONTEXT_FAILURES.includes(code)?code:'execution-failed';
}
export function summarizeContexts(engines){
  const complete=engines.length===3&&new Set(engines.map(x=>x.engine)).size===3&&engines.every(x=>x.result!==null);
  return {collection_complete:complete,official_api_cycle_passed:complete&&engines.every(x=>qualifications(x.result).api),
    native_online_all:complete?engines.every(x=>x.result.native.online):null,
    test_default_online_all:complete?engines.every(x=>x.result.test_default.online):null};
}
export function validateContextsReport(r){
  object(r,['schema','scope','run_id','source_sha','status','stage','failure_code','topology','topology_verified','collection_complete','official_api_cycle_passed','native_online_all','test_default_online_all','engines','cleanup','native_contract_qualified','authenticated_admission','plan_fully_validated','unproved']);
  identity(r.run_id,r.source_sha);
  if(r.schema!==2||r.scope!==SCOPE||!['passed','failed'].includes(r.status)||!['preflight','baseline','contexts','cleanup','complete'].includes(r.stage)||
     r.topology!=='loopback-only'||!bool(r.topology_verified)||!bool(r.cleanup)||r.native_contract_qualified!==false||r.authenticated_admission!==false||r.plan_fully_validated!==false||
     (r.status==='passed'?r.failure_code!==null:!CONTEXT_FAILURES.includes(r.failure_code)))fail('contexts-protocol');
  object(r.unproved,['dummy','veth','default_route','bun_egress','edge_egress','external_ipv6']);if(Object.values(r.unproved).some(x=>x!=='not_run'))fail('contexts-protocol');
  if(!Array.isArray(r.engines)||r.engines.length>3)fail('contexts-protocol');const seen=new Set();
  for(const e of r.engines){
    object(e,['engine','status','result','failure','canary_verified']);
    if(!ENGINES.includes(e.engine)||seen.has(e.engine)||!['passed','failed'].includes(e.status)||e.canary_verified!==true)fail('contexts-protocol');seen.add(e.engine);
    if(e.result!==null){assertContextResult(e.result,{...r,engine:e.engine});if(e.failure!==null||(e.status==='passed')!==contextResultPassed(e.result))fail('contexts-protocol');}
    else{if(e.status!=='failed')fail('contexts-protocol');if(e.failure!==null)assertContextFailure(e.failure,{...r,engine:e.engine});}
  }
  const summary=summarizeContexts(r.engines);for(const [key,value] of Object.entries(summary))if(r[key]!==value)fail('contexts-protocol');
  const passed=r.cleanup&&r.topology_verified&&summary.collection_complete&&r.engines.every(x=>x.status==='passed');
  if((r.status==='passed')!==passed||(passed&&r.stage!=='complete'))fail('contexts-protocol');return r;
}
