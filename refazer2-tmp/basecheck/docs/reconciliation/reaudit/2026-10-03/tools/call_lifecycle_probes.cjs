#!/usr/bin/env node
// Exact source, fake browser coordination and SIP classes; no product network.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const [source,integrityPath,tsPath,output]=process.argv.slice(2);
if(!output)throw new Error('Usage: node call_lifecycle_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT');
const integrityBytes=fs.readFileSync(integrityPath),integrity=JSON.parse(integrityBytes),ts=require(path.resolve(tsPath));
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),integrity.head_sha);
const pins=[],code={};
for(const p of ['src/lib/calls/tabLeaderStore.ts','src/hooks/sip/useSipConnection.ts']){
  const b=fs.readFileSync(path.join(source,p));
  const blob=crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
  assert.equal(blob,integrity.files.find(f=>f.path===p).git_blob_sha,'Source drift: '+p);
  pins.push({path:p,git_blob_sha:blob,sha256:crypto.createHash('sha256').update(b).digest('hex')});
  code[p]=ts.transpileModule(b.toString('utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};}
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function coordination(){
  let now=0;const storage=new Map(),channels=[],tabs=[];
  const localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  function tab(id){
    const timers=new Map(),intervals=new Map();let seq=0;
    class ClockDate extends Date{static now(){return now;}}
    class Channel{
      constructor(name){this.name=name;this.owner=id;channels.push(this);}
      postMessage(data){for(const c of channels)if(c!==this&&c.name===this.name)c.onmessage?.({data});}
    }
    const exports={};
    new Function('exports','require','Date','window','crypto','BroadcastChannel','setInterval','clearInterval','setTimeout','clearTimeout',code['src/lib/calls/tabLeaderStore.ts'])(
      exports,p=>{assert.equal(p,'../secureRandom');return {BASE36_MAIUSCULO:'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',secureRandomFloat:()=>0,secureRandomChars:()=>id};},
      ClockDate,{localStorage},{randomUUID:()=>id},Channel,
      fn=>{intervals.set(++seq,fn);return seq},key=>intervals.delete(key),
      fn=>{timers.set(++seq,fn);return seq},key=>timers.delete(key));
    const t={exports,flushTimeouts:()=>{for(const [key,fn] of [...timers]){timers.delete(key);fn();}},tick:()=>{for(const fn of intervals.values())fn();}};
    exports.subscribe(()=>{});tabs.push(t);return t;
  }
  return {tab,setNow:n=>{now=n},storage};
}
function sipHook(startBarrier){
  const instances=[],registerers=[],effects=[],states=[],logs=[];let leader=true;
  const react={useState:x=>{const i=states.length;states.push(typeof x==='function'?x():x);return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]},useRef:x=>({current:x}),useCallback:fn=>fn,useEffect:fn=>effects.push(fn)};
  class UA{
    static makeURI(v){return v;}
    constructor(config){this.config=config;this.transport={};this.stopped=false;instances.push(this);}
    async start(){if(startBarrier)await startBarrier.promise;}
    async stop(){this.stopped=true;}
  }
  class Registerer{
    constructor(ua){this.ua=ua;this.listeners=[];this.stateChange={addListener:fn=>this.listeners.push(fn)};registerers.push(this);}
    async register(){this.listeners.forEach(fn=>fn('Registered'));}
    async unregister(){this.listeners.forEach(fn=>fn('Unregistered'));}
  }
  const exports={};
  const deps={'react':react,'@/lib/logger':{getLogger:()=>({error:(...a)=>logs.push(a)})},'sonner':{toast:{info:()=>{},error:()=>{},success:()=>{}}},'@/lib/calls/capabilities':{REASON_LABEL:{}},'@/lib/calls/tabLeaderStore':{isLeader:()=>leader},'sip.js':{UserAgent:UA,Registerer}};
  new Function('exports','require','setTimeout','clearTimeout',code['src/hooks/sip/useSipConnection.ts'])(exports,p=>{assert(p in deps,'Unexpected dependency '+p);return deps[p]},()=>{throw new Error('Unexpected retry')},()=>{});
  const hook=exports.useSipConnection();
  const cleanups=effects.map(fn=>fn()).filter(fn=>typeof fn==='function');
  return {hook,instances,registerers,states,unmount:()=>cleanups.forEach(fn=>fn()),setLeader:v=>{leader=v}};
}
async function main(){
  const probes=[];
  {
    const c=coordination(),a=c.tab('tab-A'),b=c.tab('tab-B');
    a.exports.claimLeadership();a.flushTimeouts();b.exports.claimLeadership();b.flushTimeouts();
    assert.equal(a.exports.getSnapshot().role,'leader');assert.equal(b.exports.getSnapshot().role,'follower');
    c.setNow(11000); // A has no timer opportunity for longer than its 10-second lease.
    b.tick();b.flushTimeouts();assert.equal(b.exports.getSnapshot().role,'leader');
    a.tick(); // Resuming A overwrites B's live lease without rereading its owner.
    const roles=[a.exports.getSnapshot().role,b.exports.getSnapshot().role];
    assert.deepEqual(roles,['leader','leader']);
    const lock=JSON.parse(c.storage.get(a.exports.TAB_LEADER_STORAGE_KEY));assert.equal(lock.tabId,'tab-A');
    probes.push({id:'CALL-P04',status:'PASS',title:'Suspended leader resumes after follower promotion; both retain leader role',observed:{ttl_ms:10000,resume_ms:11000,roles,lock_owner:lock.tabId},limitations:'Two exact module instances, shared fake localStorage and delivered BroadcastChannel messages, deterministic withheld timer. Proves coordination violation under scheduling precondition; no real browser or SIP registration.'});
  }
  {
    const s=sipHook(),config={server:'fixture.invalid',user:'fixture',password:'synthetic'};
    await s.hook.connect(config);await s.hook.disconnect();const retained=s.hook.uaRef.current!==null;
    await s.hook.connect(config);
    assert.equal(s.instances.length,1);assert.equal(s.instances[0].stopped,true);assert.equal(retained,true);
    probes.push({id:'CALL-P05',status:'PASS',title:'disconnect retains stopped UA and next connect exits at the existing-UA guard',observed:{user_agents_created:s.instances.length,retained_stopped_reference:retained,status:s.states[0]},limitations:'Exact exported hook with minimal state/ref/effect substitutions. Contract sequence is reproduced; current visible disconnect-button reachability is not claimed.'});
  }
  {
    const gate=deferred(),s=sipHook(gate),config={server:'fixture.invalid',user:'fixture',password:'synthetic'};
    const pending=s.hook.connect(config);await flush();assert.equal(s.instances.length,1);
    await s.hook.disconnect();s.setLeader(false);s.unmount();gate.resolve();await pending;
    assert.equal(s.registerers.length,1);assert.equal(s.instances[0].stopped,false);assert.equal(s.states[0],'registered');
    probes.push({id:'CALL-P06',status:'PASS',title:'In-flight connect continues to REGISTER after disconnect, leadership loss and unmount',observed:{registered_after_cancel:true,user_agent_stopped:s.instances[0].stopped,status:s.states[0]},limitations:'Pending fake ua.start at a real await boundary. Unmount/leadership flags are deliberate scenario inputs; this does not prove these events happened in production.'});
  }
  {
    const gate=deferred(),s=sipHook(gate),config={server:'fixture.invalid',user:'fixture',password:'synthetic'};
    const first=s.hook.connect(config),second=s.hook.connect(config);await flush();
    assert.equal(s.instances.length,2);gate.resolve();await Promise.all([first,second]);
    assert.equal(s.registerers.length,2);
    probes.push({id:'CALL-P07',status:'PASS',title:'Two connect invocations before the first await completes each allocate and register a UA',observed:{user_agents_created:s.instances.length,registerers_created:s.registerers.length},limitations:'Concurrent exported-hook calls; browser click timing and actual SIP server behavior are outside this probe. Variant of missing pending-operation lifecycle, not a separate counted defect.'});
  }
  const result={schema_version:1,source_head:integrity.head_sha,source_integrity_sha256:crypto.createHash('sha256').update(integrityBytes).digest('hex'),source_files:pins,
    script_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),typescript_version:ts.version,probes,network_calls:0,product_writes:0,
    method:'Exact source modules transpiled only after HEAD and every consumed blob validated. Synthetic browser clocks/storage/channels, React hook primitives and SIP classes.'};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({probes:probes.length,passed:probes.length,output}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
