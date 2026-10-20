#!/usr/bin/env node
// Source contracts only. No real React renderer, audio, SIP, database or network.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const [source,integrityPath,tsPath,output]=process.argv.slice(2);
if(!output)throw new Error('Usage: node call_overlay_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT');
const integrityBytes=fs.readFileSync(integrityPath),integrity=JSON.parse(integrityBytes);
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),integrity.head_sha);
const P={listener:'src/hooks/communication/useIncomingCallListener.ts',alert:'src/components/calls/IncomingCallAlert.tsx',dialog:'src/components/calls/CallDialog.tsx',remote:'src/hooks/calls/useTerminoRemoto.ts',rule:'src/lib/calls/terminoRemoto.ts',ring:'src/lib/calls/toqueDaChamada.ts',session:'src/lib/calls/session.ts',status:'src/lib/calls/callStatus.ts',provider:'src/providers/CallSessionProvider.tsx',channels:'src/hooks/calls/useCallChannels.ts',sip:'src/hooks/communication/useSipClient.ts',app:'src/App.tsx'};
const code={},pins=[];
for(const p of Object.values(P)){
  const b=fs.readFileSync(path.join(source,p)),blob=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
  assert.equal(blob,integrity.files.find(f=>f.path===p).git_blob_sha,p);
  code[p]=b.toString('utf8');pins.push({path:p,git_blob_sha:blob,sha256:crypto.createHash('sha256').update(b).digest('hex')});
}
const ts=require(path.resolve(tsPath)),asts={};
for(const p of Object.values(P))asts[p]=ts.createSourceFile(p,code[p],ts.ScriptTarget.Latest,true,p.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
function nodes(p,pred){const out=[];function visit(n){if(pred(n))out.push(n);ts.forEachChild(n,visit)}visit(asts[p]);return out;}
function expression(p,name){
  const found=nodes(p,n=>(ts.isVariableDeclaration(n)||ts.isFunctionDeclaration(n))&&n.name?.getText(asts[p])===name);assert.equal(found.length,1,name);
  let n=found[0];if(ts.isVariableDeclaration(n)){n=n.initializer;if(ts.isCallExpression(n)&&n.expression.getText(asts[p])==='useCallback')n=n.arguments[0];}
  return n.getText(asts[p]).replace(/^export\s+/,'');
}
function compile(s,env={}){
  const js=ts.transpileModule('return ('+s+');',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  return new Function(...Object.keys(env),js)(...Object.values(env));
}
function whole(p,deps={}){
  const ex={},js=ts.transpileModule(code[p],{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('exports','require','console',js)(ex,n=>{assert(n in deps,'Unmocked dependency: '+n);return deps[n]},{warn:()=>{},info:()=>{},error:()=>{}});
  return ex;
}
const status=whole(P.status),session=whole(P.session,{'./callStatus':status}),remoteRule=whole(P.rule),ring=whole(P.ring);
function stateAt(id,active=false){
  let s=session.reduce(session.initialState(),{type:'INVITE_RECEIVED',sessionId:id,channel:'voip',at:100});
  if(active){s=session.reduce(s,{type:'ACCEPT',at:200});s=session.reduce(s,{type:'ESTABLISHED',at:300});}
  return s;
}
function remoteCallback(callId,dispatch){
  const on=nodes(P.remote,n=>ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='on');
  assert.equal(on.length,1);return compile(on[0].arguments[2].getText(asts[P.remote]),{callIdEmCurso:callId,dispatch,terminoRemotoDaChamada:remoteRule.terminoRemotoDaChamada});
}
function listenerHarness(){
  const states=[],refs=[],effects=new Map(),channels=[],user={id:'fixture-user'};let stateIndex=0,refIndex=0,effectIndex=0;
  const react={
    useState:init=>{const i=stateIndex++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]},
    useRef:init=>{const i=refIndex++;return refs[i]??(refs[i]={current:init})},
    useCallback:fn=>fn,
    useEffect:(fn,deps)=>{const i=effectIndex++,previous=effects.get(i);if(!previous||deps.some((v,k)=>!Object.is(v,previous.deps[k]))){previous?.cleanup?.();effects.set(i,{deps,cleanup:fn()});}}
  };
  const supabase={
    from:table=>{assert.equal(table,'calls');return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{status:'ringing'},error:null})})})}},
    channel:name=>{const c={name,on:(event,filter,fn)=>{c.filter=filter;c.fn=fn;return c},subscribe:()=>c};channels.push(c);return c},
    removeChannel:()=>{}
  };
  const hook=whole(P.listener,{'react':react,'@/integrations/supabase/client':{supabase},'../auth/useAuth':{useAuth:()=>({user})},'@/lib/logger':{log:{info:()=>{}}},'@/lib/realtimeTopic':{uniqueRealtimeTopic:x=>x},'@/lib/calls/callStatus':status});
  function render(){stateIndex=refIndex=effectIndex=0;return hook.useIncomingCallListener();}
  render();
  return {render,async receive(id){await channels[0].fn({new:{id:'notification-'+id,type:'incoming_call',created_at:'2026-10-03T00:00:00Z',metadata:{call_id:id,contact_id:'contact-'+id,contact_name:'Fixture '+id,phone:'5511000000000',whatsapp_connection_id:'fixture-whatsapp',call_status:'ringing'}}});return render();}};
}
async function main(){
  const probes=[];
  {
    const h=listenerHarness();await h.receive('A');let current=stateAt('A',true);
    const remote=remoteCallback('A',e=>{current=session.reduce(current,e)});remote({new:{id:'A',status:'ended'}});
    assert.equal(current.status,'ended');const after=h.render();assert.equal(after.incomingCall.callId,'A');
    const tone=ring.proximoToque('tocando',after.incomingCall?'INVITE_RECEIVED':'TIMEOUT');assert.equal(ring.deveTocar(tone),true);
    after.dismissCall();assert.equal(h.render().incomingCall,null);
    probes.push({id:'CALL-P08',status:'PASS',title:'Ending the matching provider session does not remove the notification overlay input',observed:{provider_status:current.status,notification_call_id_after_end:'A',ring_state_from_unchanged_input:tone,explicit_dismiss_clears:true},limitations:'Whole listener hook and reducer, exact remote callback and pure ring rule. React primitives, successful calls query and notification delivery are synthetic. No mounted overlay or audible ringtone; UI effect is verified statically against the retained input.'});
  }
  {
    const h=listenerHarness(),a=await h.receive('A');let showDialog=false,accepted=0;
    const answer=compile(expression(P.alert,'handleAnswer'),{incomingCall:a.incomingCall,accept:async()=>{accepted++},setShowDialog:v=>{showDialog=v}});
    answer();const b=await h.receive('B');assert.equal(showDialog,true);assert.equal(b.incomingCall.callId,'B');assert.equal(accepted,1);
    const visual=compile(expression(P.dialog,'visualStatus'));
    const attr=nodes(P.alert,n=>ts.isJsxAttribute(n)&&n.name.getText(asts[P.alert])==='initialStatus');assert.equal(attr.length,1);
    const initial=attr[0].initializer.text;assert.equal(initial,'answered');assert.equal(visual('ringing_in',initial),'answered');
    probes.push({id:'CALL-P09',status:'PASS',title:'The prior answer flag maps a new incoming call to the answered dialog without accepting it',observed:{new_notification_call_id:b.incomingCall.callId,retained_show_dialog:showDialog,accept_calls:accepted,new_call_visual_status:visual('ringing_in',initial)},limitations:'Exact answer callback, whole listener and exact visualStatus; the initialStatus literal is read from actual JSX. Preserved component instance and no explicit dialog-close action are scenario preconditions. Does not claim B was answered at the transport.'});
  }
  {
    const voipRef={current:stateAt('unrelated-voip',false)},dispatched=[],sipCalls=[];let showDialog=false;
    const accept=compile(expression(P.provider,'accept'),{estadoRef:voipRef,dispatch:e=>{dispatched.push(e);voipRef.current=session.reduce(voipRef.current,e)},sip:{acceptIncomingCall:async()=>{sipCalls.push('acceptIncomingCall')}}});
    const answer=compile(expression(P.alert,'handleAnswer'),{incomingCall:{callId:'whatsapp-B',whatsapp_connection_id:'fixture-whatsapp'},accept,setShowDialog:v=>{showDialog=v}});
    answer();await Promise.resolve();
    assert.deepEqual(sipCalls,['acceptIncomingCall']);assert.equal(voipRef.current.sessionId,'unrelated-voip');assert.equal(voipRef.current.status,'connecting');assert.equal(showDialog,true);
    const capability=compile(expression(P.channels,'capacidadeWhatsapp'),{linhaDoCanal:compile(expression(P.channels,'linhaDoCanal'),{ehLinhaE2E:compile(expression(P.channels,'ehLinhaE2E'),{PREFIXO_E2E:'[E2E]'})}),CANAL_WHATSAPP:'whatsapp'});
    assert.equal(capability([{id:'fixture-whatsapp',name:'Fixture',is_default:true,status:'connected'}],true).canReceive,true);
    probes.push({id:'CALL-P10',status:'PASS',title:'Answer on a WhatsApp notification invokes the SIP session API without notification identity',observed:{notification_call_id:'whatsapp-B',current_provider_session_id:voipRef.current.sessionId,sip_calls:sipCalls,provider_status_after_click:voipRef.current.status,connected_whatsapp_exposes_answer:true},limitations:'Exact alert/provider callbacks and capability functions; SIP boundary is a spy. Concurrent unrelated SIP ringing is an explicit scenario, not observed traffic. Independently, an idle SIP engine has no WhatsApp adapter dispatch or WhatsApp persistence through this path.'});
  }
  {
    let ringing=stateAt('A'),activeOther=stateAt('A',true);
    remoteCallback('A',e=>{ringing=session.reduce(ringing,e)})({new:{id:'A',status:'ended'}});
    assert.equal(ringing.status,'ringing_in');
    remoteCallback('B',e=>{activeOther=session.reduce(activeOther,e)})({new:{id:'B',status:'ended'}});
    assert.equal(activeOther.sessionId,'A');assert.equal(activeOther.status,'ended');
    let positive=stateAt('A',true);
    remoteCallback('A',e=>{positive=session.reduce(positive,e)})({new:{id:'B',status:'ended'}});
    assert.equal(positive.status,'active');
    probes.push({id:'CALL-P11',status:'PASS',title:'Remote call update validates the watched ID but neither the live session ID nor the valid event for ringing',observed:{matching_ringing_session_after_end:ringing.status,watched_call:'B',unrelated_live_session:'A',unrelated_live_session_after_end:activeOther.status,payload_id_mismatch_ignored:true},limitations:'Exact remote callback plus whole reducer. The positive control preserves the existing comparison against the subscribed ID. The cross-call scenario assumes the overlay is watching B while the provider owns A; only provider state, not SIP transport hangup, is demonstrated.'});
  }
  const result={schema_version:1,source_head:integrity.head_sha,source_integrity_sha256:crypto.createHash('sha256').update(integrityBytes).digest('hex'),source_files:pins,script_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),typescript_version:ts.version,probes,network_calls:0,product_writes:0,method:'HEAD and all source blobs verified before parsing/evaluation. Exact AST callbacks, whole pure modules and whole listener hook; synthetic React state, query, notification and SIP boundaries. No browser rendering or provider acceptance.'};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({probes:probes.length,passed:probes.length,output}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
