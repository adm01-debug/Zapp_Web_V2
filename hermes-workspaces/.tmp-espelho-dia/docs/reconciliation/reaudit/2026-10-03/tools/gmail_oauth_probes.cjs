#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const [source,integrityPath,tsPath,output]=process.argv.slice(2);
if(!output)throw new Error('Usage: node gmail_oauth_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT');
const integrityBytes=fs.readFileSync(integrityPath),integrity=JSON.parse(integrityBytes),ts=require(path.resolve(tsPath));
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),integrity.head_sha);
const files=['src/lib/gmailOAuth.ts','src/hooks/integrations/useGmailOAuth.ts','supabase/functions/gmail-oauth/index.ts'],pins=[],code={};
for(const p of files){const b=fs.readFileSync(path.join(source,p));const blob=crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');assert.equal(blob,integrity.files.find(f=>f.path===p).git_blob_sha,p);pins.push({path:p,git_blob_sha:blob,sha256:crypto.createHash('sha256').update(b).digest('hex')});code[p]=ts.transpileModule(b.toString('utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;}
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function oauthHook(state,storedNonce){
  const values=new Map(storedNonce?[['gmail-oauth-nonce',storedNonce]]:[]),invocations=[],notices=[],effects=[];
  const url=new URL('https://fixture.invalid/?code=synthetic-unredeemed-code');if(state!==undefined)url.searchParams.set('state',JSON.stringify(state));
  const win={location:{search:url.search,href:url.href},history:{replaceState:()=>{}},sessionStorage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}};
  const lib={};new Function('exports','window',code[files[0]])(lib,win);
  const deps={'react':{useRef:v=>({current:v}),useEffect:fn=>effects.push(fn)},'@tanstack/react-query':{useQueryClient:()=>({invalidateQueries:async()=>{}})},'@/integrations/supabase/client':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic-session'}}})},functions:{invoke:async(...a)=>{invocations.push(a);return {data:{success:true},error:null}}}}},'sonner':{toast:{error:x=>notices.push({type:'error',x}),success:x=>notices.push({type:'success',x})}},'@/lib/gmailOAuth':lib};
  const exp={};new Function('exports','require','window',code[files[1]])(exp,p=>{assert(p in deps,p);return deps[p]},win);
  exp.useGmailOAuth({id:'fixture-user'},false,()=>{});effects.forEach(fn=>fn());
  return {invocations,notices,values};
}
function endpoint(){
  let handler;const writes=[],http=[];const owner='11111111-1111-4111-8111-111111111111',account='22222222-2222-4222-8222-222222222222';
  const row={id:account,user_id:owner,email_address:'fixture@example.invalid',is_active:true};
  const db={
    auth:{getUser:async()=>({data:{user:{id:owner}},error:null})},
    rpc:async(name,args)=>{writes.push({kind:'rpc',name});if(name==='get_gmail_tokens')return {data:[{access_token:'synthetic-access',refresh_token:'synthetic-refresh'}],error:null};assert.equal(name,'store_gmail_tokens');return {data:null,error:{code:'XX000',message:'synthetic storage failure'}};},
    from:name=>{assert.equal(name,'gmail_accounts');let operation='select';const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:null}),single:async()=>({data:row,error:null}),upsert:()=>{operation='upsert';writes.push({kind:'upsert'});return q},update:()=>{operation='update';writes.push({kind:'update'});return q},then:(resolve,reject)=>Promise.resolve(operation==='update'?{data:null,error:{code:'XX000',message:'synthetic update failure'}}:{data:[row],error:null}).then(resolve,reject)};return q},
  };
  const response=(body,status)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  class Logger{done(){}error(){}}
  const deps={'https://esm.sh/@supabase/supabase-js@2.87.1':{createClient:()=>db},'../_shared/validation.ts':{handleCors:()=>null,errorResponse:(m,s)=>response({error:m},s),jsonResponse:response,requireEnv:()=> 'synthetic-env',Logger},'../_shared/schemas.ts':{GmailOAuthActionSchema:{},parseBody:(_,body)=>({success:true,data:body}),validationErrorResponse:()=>{throw new Error('Unexpected invalid fixture')}}};
  new Function('exports','require','Deno','fetch',code[files[2]])({},p=>{assert(p in deps,p);return deps[p]}, {serve:fn=>{handler=fn}},async url=>{
    const u=String(url);http.push(u.split('?')[0]);
    if(u==='https://oauth2.googleapis.com/token')return response({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,token_type:'Bearer',scope:'fixture'},200);
    if(u==='https://gmail.googleapis.com/gmail/v1/users/me/profile')return response({emailAddress:'fixture@example.invalid'},200);
    if(u.startsWith('https://oauth2.googleapis.com/revoke?'))return response({error:'synthetic provider denial'},503);
    throw new Error('Unexpected mocked URL');
  });
  return {call:body=>handler(new Request('https://fixture.invalid/gmail-oauth',{method:'POST',headers:{Authorization:'Bearer synthetic-session','content-type':'application/json'},body:JSON.stringify(body)})),writes,http,account};
}
async function main(){
  const probes=[];
  for(const [id,state,nonce] of [
    ['COM-P06',{view:'integrations',nonce:'wrong-nonce'},'expected-nonce'],
    ['COM-P07',undefined,undefined],
  ]){
    const h=oauthHook(state,nonce);await flush();assert.equal(h.invocations.length,1);assert.equal(h.invocations[0][1].body.action,'exchange-code');
    probes.push({id,status:'PASS',title:id==='COM-P06'?'Mismatched OAuth state still reaches code exchange':'Absent OAuth state still reaches code exchange',observed:{exchanges:h.invocations.length,contains_state_in_exchange:Object.hasOwn(h.invocations[0][1].body,'state'),success_notice:h.notices.some(n=>n.type==='success')},limitations:'Exact state parser and effect hook; fake Auth and Edge invoke. No real Google code, credential or account link. Two variants of one missing binding defect.'});
  }
  {
    const e=endpoint(),res=await e.call({action:'exchange-code',code:'synthetic-code'}),body=await res.json();
    assert.equal(res.status,200);assert.equal(body.success,true);assert(e.writes.some(w=>w.name==='store_gmail_tokens'));
    probes.push({id:'COM-P08',status:'PASS',title:'Code exchange reports success after the token-storage RPC returns an error',observed:{response_status:res.status,response_success:body.success,token_storage_rejected:true},limitations:'Exact Edge handler, mocked schema/auth/DB/Google boundaries; fixture is valid for this action. The real validators and provider were not exercised.'});
  }
  {
    const e=endpoint(),res=await e.call({action:'disconnect',account_id:e.account}),body=await res.json();
    assert.equal(res.status,200);assert.equal(body.success,true);assert(e.writes.some(w=>w.kind==='update'));
    probes.push({id:'COM-P09',status:'PASS',title:'Disconnect reports success when revocation and local deactivation both fail',observed:{response_status:res.status,response_success:body.success,revocation_status:503,deactivation_error:'synthetic update failure'},limitations:'Exact Edge handler with both external effects simulated as failures. No actual revocation, database mutation or account disconnect.'});
  }
  const result={schema_version:1,source_head:integrity.head_sha,source_integrity_sha256:crypto.createHash('sha256').update(integrityBytes).digest('hex'),source_files:pins,script_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),typescript_version:ts.version,probes,network_calls:0,product_writes:0,method:'Whole exact parser/hook/Edge modules transpiled after HEAD and all consumed blobs verified; explicit mocked imports and I/O.'};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({probes:probes.length,passed:probes.length,output}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
