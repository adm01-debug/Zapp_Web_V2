'use strict';
// Offline only. Source remains untouched. No network, database, credentials or product scripts.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ts = require(process.env.REAUDIT_TYPESCRIPT || '/workspace/scratch/8b95153002da/audit/tools/ast/node_modules/typescript');
const ROOT = path.resolve(process.env.REAUDIT_SOURCE_ROOT || path.join(__dirname, '../../source'));
const PINS_PATH = path.resolve(process.env.REAUDIT_SOURCE_PINS || path.join(__dirname, 'source-pins.json'));
const INTEGRITY_PATH = path.resolve(process.env.REAUDIT_INTEGRITY || path.join(ROOT, '../source-integrity.json'));
const expectedPins=JSON.parse(fs.readFileSync(PINS_PATH,'utf8'));
const integrityBytes=fs.readFileSync(INTEGRITY_PATH);
assert.equal(crypto.createHash('sha256').update(integrityBytes).digest('hex'),expectedPins.integrity_manifest_sha256,'Integrity manifest digest changed');
const integrity=JSON.parse(integrityBytes.toString('utf8'));
assert.equal(integrity.head_sha,expectedPins.expected_head,'HEAD differs from persisted pins');
assert.equal(integrity.mismatches.length,0,'Integrity manifest contains mismatches');
if(fs.existsSync(path.join(ROOT,'.git'))) {
 const actualHead=require('node:child_process').execFileSync('git',['-C',ROOT,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.equal(actualHead,expectedPins.expected_head,'Git checkout HEAD differs from pins');
}
const verifiedSources=new Map();
const expectedByPath=new Map(expectedPins.files.map(x=>[x.path,x]));
const integrityByPath=new Map(integrity.files.map(x=>[x.path,x]));
function blobBytes(bytes) {return crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');}
// Preflight completes BEFORE loading/transpiling/executing any product source.
for(const pin of expectedPins.files) {
 assert.equal(integrityByPath.get(pin.path)?.git_blob_sha,pin.git_blob_sha,'Pins mismatch integrity: '+pin.path);
 const bytes=fs.readFileSync(path.join(ROOT,pin.path));
 assert.equal(bytes.length,pin.bytes,'Source size mismatch before execution: '+pin.path);
 assert.equal(blobBytes(bytes),pin.git_blob_sha,'Source hash mismatch before execution: '+pin.path);
 verifiedSources.set(pin.path,bytes.toString('utf8'));
}
const OUT = path.resolve(process.env.REAUDIT_OUTPUT || path.join(__dirname,'results.json'));
const results=[];
function source(file) { assert(verifiedSources.has(file),'Unpinned product source requested: '+file); return verifiedSources.get(file); }
function sha(file) { assert(expectedByPath.has(file),'Unpinned source hash: '+file); const data=fs.readFileSync(path.join(ROOT,file));assert.equal(blobBytes(data),expectedByPath.get(file).git_blob_sha,'Source changed during probe: '+file);return expectedByPath.get(file).git_blob_sha; }
function transpile(code) { return ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText; }
function load(file,mocks,globals={},sourceOverride) {
 const module={exports:{}};
 const sandbox={module,exports:module.exports,require:(name)=>{if(!(name in mocks))throw new Error('Unexpected import '+name);return mocks[name];},Buffer,TextEncoder,TextDecoder,URL,Uint8Array,ArrayBuffer,Date,JSON,Map,Set,Promise,Request,Response,Headers,atob,btoa,crypto:crypto.webcrypto,...globals};
 vm.runInNewContext(transpile(sourceOverride ?? source(file)),sandbox,{filename:file,timeout:2000});
 return module.exports;
}
function expression(file,name,globals) {
 const text=source(file); const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX); let match;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)match=n.initializer;ts.forEachChild(n,visit);}visit(ast);
 assert(match,'missing symbol '+name);
 if(ts.isCallExpression(match)&&match.expression.getText(ast)==='useCallback')match=match.arguments[0];
 assert(ts.isArrowFunction(match)||ts.isFunctionExpression(match),'expected callable '+name);
 const sandbox={...globals,exports:{},Date,JSON,Map,Set,Promise};
 vm.runInNewContext(transpile('exports.fn = '+match.getText(ast)+';'),sandbox,{filename:file+'#'+name,timeout:2000});
 return sandbox.exports.fn;
}
function record(id,files,observed,limit) { results.push({id,status:'PASS_REPRODUCED',source:files.map(file=>({file,blob_sha:sha(file)})),observed,limitation:limit}); }
const noLog={info(){},error(){},done(){},warn(){}};
async function webauthnProbe(){
 const file='supabase/functions/webauthn/index.ts'; let handler;const dbOps=[];
 const stored={id:'row-synthetic',user_id:'00000000-0000-4000-8000-000000000001',credential_id:'synthetic-public-id',public_key:'unused-synthetic-key',counter:7};
 const challenge={challenge:'synthetic-known-challenge',expires_at:'2000-01-01T00:00:00.000Z'};
 const admin={from(table){let op='select',payload=null;const filters=[];const q={select(v){dbOps.push({table,select:v});return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},single(){return Promise.resolve({data:table==='passkey_credentials'?stored:challenge,error:null});},update(v){op='update';payload=v;return q;},delete(){op='delete';return q;},insert(v){op='insert';payload=v;return q;},then(resolve,reject){dbOps.push({table,op,payload,filters});return Promise.resolve({data:null,error:null}).then(resolve,reject);}};return q;},auth:{admin:{getUserById:async()=>({data:{user:{email:'synthetic@example.test'}}})}}};
 const val={handleCors:()=>null,requireEnv:(n)=>n==='SUPABASE_URL'?'https://offline.invalid':('synthetic-'+n),Logger:class{info(){}error(){}done(){}},getCorsHeaders:()=>({}),jsonResponse:(obj,status)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}}),errorResponse:(msg,status)=>new Response(JSON.stringify({error:msg}),{status})};
 // Body follows the reviewed WebAuthnActionSchema: action enum + arbitrary credential record.
 load(file,{'https://esm.sh/@supabase/supabase-js@2.87.1':{createClient:()=>admin},'../_shared/validation.ts':val,'../_shared/schemas.ts':{WebAuthnActionSchema:{},parseBody:(_,raw)=>({success:true,data:raw}),validationErrorResponse:()=>{throw Error('unexpected');}}},{Deno:{serve:fn=>{handler=fn;}}});
 const clientDataJSON=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:challenge.challenge,origin:'https://wrong-origin.invalid'})).toString('base64url');
 const payload={action:'verify-authentication',credential:{id:stored.credential_id,response:{clientDataJSON}}};
 const response=await handler(new Request('https://offline.invalid/functions/v1/webauthn',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}));
 const data=await response.json();assert.equal(response.status,200);assert.equal(data.success,true);assert.equal(data.userEmail,'synthetic@example.test');
 assert(dbOps.some(x=>x.table==='passkey_credentials'&&x.op==='update'&&x.payload.counter===8));
 assert(dbOps.some(x=>x.table==='webauthn_challenges'&&x.op==='delete'));
 assert(!('access_token' in data));
 record('P-AUTH-01',[file,'supabase/functions/_shared/schemas.ts'],{http_status:response.status,success:data.success,missing:['signature','authenticatorData','userHandle','Authorization'],wrong_origin_accepted:true,expired_challenge_supplied:true,counter_incremented:true,challenge_delete_attempted:true,session_token_returned:false},'Actual handler transpiled; DB/claims/CORS/schema boundary mocked with valid schema-shape input and synthetic records. Proves verifier path, not live RLS, Internet access or authenticated session takeover.');
}
async function profileRaceProbe(){
 const file='src/hooks/auth/useAuth.tsx';let currentProfile=null;const pending={};const guard={current:false};
 const fn=expression(file,'fetchProfile',{fetchingRef:guard,AuthService:{fetchProfile:id=>new Promise(resolve=>{pending[id]=resolve;})},setProfile:p=>{currentProfile=p;},log:noLog});
 const old=fn('user-A');
 // Exact auth-listener cutpoint: resets fetchingRef before a new identity fetch.
 guard.current=false;const newer=fn('user-B');pending['user-B']({user_id:'user-B',id:'profile-B'});await newer;
 pending['user-A']({user_id:'user-A',id:'profile-A'});await old;
 assert.equal(currentProfile.user_id,'user-A');
 guard.current=false;const afterLogout=fn('user-A');currentProfile=null;pending['user-A']({user_id:'user-A',id:'profile-A'});await afterLogout;
 assert.equal(currentProfile.user_id,'user-A');
 record('P-AUTH-02',[file],{new_user_B_profile_overwritten_by_A:true,pending_fetch_repopulates_profile_after_clear:true},'Executes actual fetchProfile closure with deferred AuthService. Event/reset cutpoints from source are simulated, not a mounted React provider or browser.');
}
async function permissionProbe(){
 const hf='src/hooks/system/usePermissions.ts',uf='src/components/permissions/PermissionMatrix.tsx'; const toastCalls=[];let refetches=0;
 const q={delete(){return q;},eq(){return q;},then(resolve,reject){return Promise.resolve({error:{code:'42501',message:'synthetic denied'}}).then(resolve,reject);}};
 const remove=expression(hf,'removePermissionFromRole',{supabase:{from:()=>q},fetchRolePermissions:()=>{refetches++;}});
 const toggle=expression(uf,'handleToggle',{setUpdating:()=>{},hasPermission:()=>true,removePermissionFromRole:remove,addPermissionToRole:()=>{throw Error('unused');},toast:{success:s=>toastCalls.push(['success',s]),error:s=>toastCalls.push(['error',s])}});
 const result=await remove('agent','perm-synthetic');assert.equal(result,false);await toggle('agent','perm-synthetic');
 assert.deepEqual(toastCalls,[['success','Permissão removida']]);assert.equal(refetches,0);
 record('P-AUTH-03',[hf,uf],{backend_returned_error:'42501',hook_returned:false,toast:toastCalls[0],refetches},'Actual extracted hook and UI closures with an explicit SDK error object; no DB operation.');
}
async function draftProbe(){
 const file='src/hooks/chat/useTeamChatDraft.ts';const storage=new Map([['team_draft_B','original draft B']]);let tasks=new Map(),nextTimer=1;
 let cursor=0,states=[],effects=[],queue=[];let profile={id:'profile-A'};let replacements=[];
 const react={useCallback:fn=>fn,useRef:v=>({current:v}),useState:v=>{const ix=cursor++;if(!(ix in states))states[ix]=v;return[states[ix],value=>{states[ix]=value;}];},useEffect:(fn,deps)=>{const ix=cursor++;const old=effects[ix];if(!old||!deps.every((v,i)=>Object.is(v,old.deps[i]))){if(old&&old.cleanup)old.cleanup();queue.push(()=>{effects[ix]={deps,cleanup:fn()};});}}};
 const mod=load(file,{'react':react,'@/integrations/supabase/client':{supabase:{}},'@/hooks/auth/useAuth':{useAuth:()=>({profile})},'@/lib/logger':{getLogger:()=>noLog},'sonner':{toast:{error(){}}}},{localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},setTimeout:fn=>{const id=nextTimer++;tasks.set(id,fn);return id;},clearTimeout:id=>tasks.delete(id)});
 function render(conversationId,text){cursor=0;mod.useTeamChatDraft({conversationId,text,setText:value=>replacements.push(value),onFileSent(){}});const qs=queue;queue=[];qs.forEach(fn=>fn());}
 function flush(){const t=tasks;tasks=new Map();for(const fn of t.values())fn();}
 render('A','private draft A');flush();render('B','private draft A');flush();
 assert.equal(storage.get('team_draft_B'),'private draft A');assert.equal(replacements.length,0);
 // Remount as another identity. Existing conversation draft key is identity-independent.
 for(const e of effects)if(e&&e.cleanup)e.cleanup();states=[];effects=[];profile={id:'profile-B'};
 render('B','');assert.equal(replacements.at(-1),'private draft A');
 record('P-AUTH-04',[file,'src/components/team-chat/useTeamChatPanel.ts','src/components/team-chat/TeamChatView.tsx'],{switch_A_to_B_restores_B:false,draft_B_overwritten_with_A:true,different_profile_restores_A_draft:true},'Actual hook with a minimal effect/dependency scheduler and fake storage/timers. Parent panel state retention and absence of key verified statically; this is not browser E2E.');
}
async function roleProbe(){
 const file='src/components/admin/useAdminData.ts';let roles=['admin'];const calls=[];const toasts=[];
 const client={from(table){const q={delete(){calls.push('delete');return q;},eq(){return q;},insert(){calls.push('insert');return Promise.resolve({error:{code:'synthetic insert failure'}});},then(resolve,reject){roles=[];return Promise.resolve({error:null}).then(resolve,reject);}};return q;}};
 const fn=expression(file,'handleRoleChange',{supabase:client,toast:{error:s=>toasts.push(s),success:()=>{}},roleConfig:{agent:{label:'Agente'}},fetchData:()=>{}});
 await fn('user-synthetic','agent');assert.equal(roles.length,0);assert.deepEqual(calls,['delete','insert']);
 record('P-AUTH-05',[file],{initial_roles:['admin'],insert_failure:true,remaining_roles:roles,error_toast:toasts[0]},'Actual closure; synthetic storage models delete commit followed by failed insert. No live race or database transaction executed.');
}
async function bulkTagsProbe(){
 const file='src/components/contacts/ContactBulkTagDialog.tsx';const calls=[];const toasts=[];
 const q={select(){return q;},in(){return q;},eq(){return q;},update(payload){calls.push(payload);return q;},then(resolve,reject){return Promise.resolve(calls.length?{error:{code:'42501'}}:{data:[{id:'c1',tags:['existing']}],error:null}).then(resolve,reject);}};
 const fn=expression(file,'handleApply',{selectedTags:new Set(['new']),isWhatsAppTag:()=>false,setSaving:()=>{},supabase:{from:()=>q},contactIds:['c1','invisible-c2'],mode:'add',toast:{success:s=>toasts.push(['success',s]),error:s=>toasts.push(['error',s])},onComplete:()=>{},onOpenChange:()=>{},setSelectedTags:()=>{}});
 await fn();assert.equal(toasts[0][0],'success');assert(toasts[0][1].includes('2 contatos'));assert.equal(calls.length,1);
 record('P-AUTH-06',[file],{selected_contacts:2,readable_contacts:1,attempted_updates:1,update_result:'42501',toast:toasts[0]},'Actual handleApply closure with SDK-shaped resolved errors; no update executed.');
}

async function crmIdentityProbe(){
 const file='supabase/functions/crm-integration/index.ts';
 const contract=load('supabase/functions/_shared/crm-integration-contract.ts',{});
 const canonicalId='00000000-0000-4000-8000-000000000020';
 const sharedPhone='5511999990000';const externalCalls=[];
 const canonical={from(table){const q={select(){return q;},eq(){return q;},maybeSingle(){return Promise.resolve({data:table==='contacts'?{id:canonicalId,phone:sharedPhone}:{external_contact_id:'external-A',normalized_phone:sharedPhone},error:null});}};return q;}};
 const external={rpc:async(name,args)=>{externalCalls.push(name);return {data:{found:true,contact:{id:'external-B'},contact_id:'external-B',briefing:{contact_name:'Synthetic B'},rapport:{suggestions:[]}},error:null};}};
 const externalUrl='https://pgxfvjmuubtbowutlide.supabase.co';
 const syntheticKey='synthetic.'+Buffer.from(JSON.stringify({ref:'pgxfvjmuubtbowutlide',role:'service_role'})).toString('base64url')+'.synthetic';
 const validation={handleCors:()=>null,requireEnv:name=>({SUPABASE_SERVICE_ROLE_KEY:'synthetic-canonical-key',SUPABASE_URL:'https://offline.invalid',SUPABASE_ANON_KEY:'synthetic-anon',EXTERNAL_SUPABASE_URL:externalUrl,EXTERNAL_SUPABASE_SERVICE_ROLE_KEY:syntheticKey})[name],enforceRateLimit:async()=>({allowed:true}),getClientIP:()=> 'synthetic',requireAuth:async()=>({userId:'00000000-0000-4000-8000-000000000001'}),isValidUUID:value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value),jsonResponse:(obj,status)=>new Response(JSON.stringify(obj),{status}),errorResponse:(msg,status)=>new Response(JSON.stringify({error:msg}),{status})};
 const modules={'https://esm.sh/@supabase/supabase-js@2.87.1':{createClient:url=>url===externalUrl?external:canonical},'../_shared/validation.ts':validation,'../_shared/crm-integration-contract.ts':contract,'../_shared/ai-vocabulary.ts':{normalizeSentiment:()=>({value:null})}};
 // Remove only the Deno bootstrap condition; business handler is unchanged.
 const code=source(file).replace('if (import.meta.main) Deno.serve(handleCRMIntegrationRequest);','');
 const mod=load(file,modules,{Deno:{env:{get:()=>undefined}},performance,AbortSignal,setTimeout,clearTimeout,console:{warn(){},error(){}}},code);
 const req=lookup=>new Request('https://offline.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic-user'},body:JSON.stringify({action:'contactLookup',contactId:canonicalId,lookup})});
 const result360=await mod.handleCRMIntegrationRequest(req('360'));
 const resultIntel=await mod.handleCRMIntegrationRequest(req('intelligence'));
 const body=await resultIntel.json();assert.equal(result360.status,409);assert.equal(resultIntel.status,200);assert.equal(body.data.contact_id,'external-B');
 record('P-AUTH-07',[file,'supabase/functions/_shared/crm-integration-contract.ts','src/hooks/crm/useContactIntelligence.ts'],{canonical_link:'external-A',external_result:'external-B',unchanged_phone:true,lookup360_http:result360.status,intelligence_http:resultIntel.status,intelligence_returns_mismatched_id:true,external_rpc_names:externalCalls},'Actual full request handler and actual contract; Deno bootstrap omitted. Canonical Auth/DB, external CRM transport and unused sentiment boundary mocked; synthetic key used only for config validation. No network or external records accessed.');
}


async function authServiceFailureProbe(){
 const file='supabase/functions/auth-login/index.ts';let handler;const rpcCalls=[];
 const client={rpc:async(name)=>{rpcCalls.push(name);return {data:[{is_locked:false,locked_until:null,attempts:name==='record_failed_login'?1:0}],error:null};},auth:{signInWithPassword:async()=>({data:{session:null},error:{status:503,message:'synthetic auth service unavailable'}})}};
 const validation={handleCors:()=>null,requireEnv:name=>'synthetic-'+name,Logger:class{info(){}error(){}done(){}},enforceRateLimit:async()=>({allowed:true}),getClientIP:()=> '127.0.0.1',sanitizeString:value=>value,jsonResponse:(obj,status)=>new Response(JSON.stringify(obj),{status}),errorResponse:(msg,status)=>new Response(JSON.stringify({error:msg}),{status})};
 load(file,{'https://esm.sh/@supabase/supabase-js@2.87.1':{createClient:()=>client},'../_shared/validation.ts':validation},{Deno:{serve:fn=>{handler=fn;}}});
 const result=await handler(new Request('https://offline.invalid',{method:'POST',body:JSON.stringify({email:'synthetic@example.test',password:'synthetic-not-real'})}));
 const body=await result.json();assert.equal(result.status,401);assert(rpcCalls.includes('record_failed_login'));assert.equal(body.error,'Invalid login credentials');
 record('P-AUTH-08',[file,'src/lib/serverLogin.ts'],{upstream_auth_status:503,edge_http_status:result.status,record_failed_login_called:true,client_message:body.error},'Actual handler with synthetic Auth error object. Demonstrates wrong failure categorization; no real lockout or request.');
}

(async()=>{await webauthnProbe();await profileRaceProbe();await permissionProbe();await draftProbe();await roleProbe();await bulkTagsProbe();await crmIdentityProbe();await authServiceFailureProbe();const output={created_at:new Date().toISOString(),source_head:expectedPins.expected_head,provenance:{pins_path:PINS_PATH,integrity_path:INTEGRITY_PATH,integrity_manifest_sha256:expectedPins.integrity_manifest_sha256,verified_source_files:expectedPins.files.length,verified_before_execution:true,source_kind:fs.existsSync(path.join(ROOT,'.git'))?'git_checkout':'materialized_git_tree'},network_calls:0,database_calls:0,source_modified:false,method:'TypeScript transpilation / extracted actual source closures with explicit synthetic boundaries',results};fs.writeFileSync(OUT,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({passed:results.length,probes:results.map(r=>r.id),output:OUT}));})().catch(error=>{console.error(error);process.exitCode=1;});
