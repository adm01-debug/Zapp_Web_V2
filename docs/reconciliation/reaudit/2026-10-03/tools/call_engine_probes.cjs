#!/usr/bin/env node
// Execute the exact CallEngine class with a fake SIP adapter, sink and clock.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const [source,integrityPath,tsPath,output]=process.argv.slice(2);
if(!output)throw new Error('Usage: node call_engine_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT');
const integrityBytes=fs.readFileSync(integrityPath),integrity=JSON.parse(integrityBytes),ts=require(path.resolve(tsPath));
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),integrity.head_sha);
const relative='src/lib/calls/adapters/CallEngine.ts';
const b=fs.readFileSync(path.join(source,relative));
const blob=crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
assert.equal(blob,integrity.files.find(f=>f.path===relative).git_blob_sha);
const js=ts.transpileModule(b.toString('utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};}
function setup(create){
  let now=0,next=0;const timers=new Map(),sessions=[],finished=[],answered=[],statuses=[];let hangups=0;
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const setTimer=(fn,delay)=>{const id=++next;timers.set(id,{fn,delay});return id;};
  const clearTimer=id=>timers.delete(id);
  const exports={};
  new Function('exports','require','Date','setTimeout','clearTimeout',js)(exports,()=>{throw new Error('Unexpected runtime dependency')},ClockDate,setTimer,clearTimer);
  const adapter={
    isDialable:async()=>true,
    createInviter:async()=>{const listeners=[];const session={id:'provider-'+(sessions.length+1),stateChange:{addListener:fn=>listeners.push(fn)},emit:state=>listeners.forEach(fn=>fn(state))};sessions.push(session);return session;},
    invite:async()=>{},hangup:()=>{hangups++},attachRemoteAudio:()=>{},disposeRemoteAudio:()=>{},
  };
  let created=0;
  const sink={onStatus:s=>statuses.push(s),onSession:()=>{},onEstablished:()=>{},onTerminated:()=>{},onMuted:()=>{},onError:e=>{throw new Error(e)},onBusyHere:()=>{},
    create:()=>create?create(++created):Promise.resolve('call-'+(++created)),onAnswered:id=>answered.push(id),onFinished:(id,seconds,outcome)=>finished.push({id,seconds,outcome})};
  const engine=new exports.CallEngine(adapter,sink);
  return {engine,sessions,finished,answered,statuses,get hangups(){return hangups},setNow:x=>{now=x},fire:delay=>{const e=[...timers.entries()].find(([,v])=>v.delay===delay);assert(e,'Timer '+delay);timers.delete(e[0]);e[1].fn();}};
}
async function main(){
  const probes=[];
  {
    const s=setup();await s.engine.makeCall('fixture-A',{},true);s.setNow(40000);s.fire(40000);await flush();s.setNow(42000);s.fire(2000);
    await s.engine.makeCall('fixture-B',{},true);assert.equal(s.statuses.at(-1),'calling');
    s.sessions[0].emit('Terminated');await flush();
    assert(s.finished.some(f=>f.id==='call-2'),'Old A termination must expose incorrect finish of B');assert.equal(s.statuses.at(-1),'ended');
    probes.push({id:'CALL-P01',status:'PASS',title:'Late Terminated from timed-out session A finishes new session B',observed:{sequence:['A starts','A local watchdog','idle','B starts','old A Terminated'],finished_call_ids:s.finished.map(x=>x.id),current_status:s.statuses.at(-1),provider_hangups_at_watchdog:s.hangups},limits:'Fake provider event after local timeout; proves missing session fence in the exact engine, not real SIP/provider timing.'});s.engine.dispose();
  }
  {
    const s=setup();await s.engine.makeCall('fixture-A',{},true);s.setNow(40000);s.fire(40000);await flush();s.setNow(42000);s.fire(2000);
    await s.engine.makeCall('fixture-B',{},true);s.sessions[0].emit('Established');await flush();
    assert.deepEqual(s.answered,['call-2']);assert.equal(s.statuses.at(-1),'active');
    probes.push({id:'CALL-P02',status:'PASS',title:'Late Established from A marks B as answered',observed:{answered_call_ids:s.answered,current_status:s.statuses.at(-1)},limits:'Same stale-session precondition; a second event variant of CALL-P01, not another independent defect.'});s.engine.dispose();
  }
  {
    const pending=deferred(),s=setup(()=>pending.promise);s.setNow(1000);await s.engine.makeCall('fixture-A',{},true);s.sessions[0].emit('Established');
    s.setNow(11000);s.sessions[0].emit('Terminated');assert.equal(s.finished.length,0);
    s.setNow(21000);pending.resolve('call-A');await flush();
    assert.equal(s.finished[0].seconds,20);
    probes.push({id:'CALL-P03',status:'PASS',title:'Deferred call creation adds post-termination wait to talk seconds',observed:{answered_at_ms:1000,terminated_at_ms:11000,initial_persistence_resolved_at_ms:21000,actual_interval_seconds:10,reported_talk_seconds:20},limits:'Synthetic clock and delayed initial create promise. Database latency was not measured.'});s.engine.dispose();
  }
  const result={schema_version:1,source_head:integrity.head_sha,source_integrity_sha256:crypto.createHash('sha256').update(integrityBytes).digest('hex'),
    source_files:[{path:relative,git_blob_sha:blob,sha256:crypto.createHash('sha256').update(b).digest('hex')}],
    script_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),typescript_version:ts.version,
    probes,method:'Exact whole CallEngine class transpiled; deterministic fake adapter, sink, Date and timers. No network, SIP registration, media or database.',network_calls:0,product_writes:0};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({probes:probes.length,passed:probes.length,output}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
