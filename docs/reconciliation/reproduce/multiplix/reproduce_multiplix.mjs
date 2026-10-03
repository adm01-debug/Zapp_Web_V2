// Offline audit probe. Runs the checked-out worker with repository mock helpers.
// All DB operations and provider sends are in memory; global fetch throws.
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

const repo = resolve(process.argv[2] ?? (process.env.RECONCILIATION_REPO || process.cwd()));
const { personalize } = await import(pathToFileURL(resolve(repo, 'supabase/functions/_shared/messaging/personalize.ts')));
const { deliveryWindowStatus, DEFAULT_SCHEDULE_TIMEZONE } = await import(pathToFileURL(resolve(repo, 'supabase/functions/_shared/talkx-window.ts')));
const env = new Map(Object.entries({SUPABASE_URL:'https://offline.invalid', SUPABASE_SERVICE_ROLE_KEY:'FAKE-SERVICE', EVOLUTION_API_URL:'https://provider.invalid', EVOLUTION_API_KEY:'FAKE-GLOBAL', EVOLUTION_INSTANCE_TOKEN:'FAKE-INSTANCE', EVOLUTION_API_FLAVOR:'go'}));
globalThis.Deno = { env:{ get:k=>env.get(k), set:(k,v)=>env.set(k,v), delete:k=>env.delete(k) }, test:()=>{} };
globalThis.fetch = async () => { throw new Error('Network forbidden in audit probe'); };
let sends=[];
let responseStatus=200;
const imports={
 createClient(){throw new Error('Real DB client forbidden');},
 enforceRateLimit:async()=>({allowed:true}), getCorsHeaders:()=>({}), handleCors:()=>null,
 Logger:class {warn(){} error(){} done(){}},
 evoFetch:async()=>({}), extractMessageId:()=>null,
 deliveryWindowStatus, DEFAULT_SCHEDULE_TIMEZONE,
 resolvePrivateBucketUrl:async()=>{throw new Error('Storage forbidden in this text probe');},
 liveTalkXInstanceId:c=>c?.status==='connected'?c.instance_id:null,
 newCorrelationId:()=>crypto.randomUUID(), normalizePhone:p=>p,
 personalize,
 prepareMedia:async()=>{throw new Error('Media forbidden in text probe');},
 providerErrorInfo:()=>({class:'transient',code:'rate_limited',operatorMessage:'Limite do provedor'}),
 randomBetween:()=>0,sleep:async()=>{},
 send:async(item,deps)=>{
  sends.push({item,instanceTokenPresent:typeof deps.instanceToken==='string',flavor:deps.flavor});
  return {status:responseStatus,ok:responseStatus===200,body:responseStatus===200?{id:'fake-id'}:{error:'Too many requests'},messageId:responseStatus===200?'fake-id':null};
 },
};
let worker=stripTypeScriptTypes(readFileSync(resolve(repo,'supabase/functions/multiplix-send/index.ts'),'utf8'),{mode:'transform'});
worker=worker.replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];\s*$/gm,'').replace(/export\s*\{\s*personalize\s*\};?/,'').replace(/export async function handleMultiplixSend/,'async function handleMultiplixSend').replace(/if \(import\.meta\.main\) \{[\s\S]*?\}\s*$/,'');
const handleMultiplixSend=Function(...Object.keys(imports),worker+'\nreturn handleMultiplixSend;')(...Object.values(imports));
let test=stripTypeScriptTypes(readFileSync(resolve(repo,'supabase/functions/multiplix-send/index.test.ts'),'utf8'),{mode:'transform'}).replace(/^import.*$/gm,'');
const h=Function('handleMultiplixSend','personalize',test+'\nreturn {dispatchRow,recipientRow,newCtx,mockDeps,makePost,TEST_CRON_SECRET};')(handleMultiplixSend,personalize);
const result=[];
for(const [caseName,template,blockText,company,httpStatus] of [
 ['distinct_block_content','GLOBAL {{empresa}}','BLOCO CORRETO {{empresa}}','Empresa 1',200],
 ['missing_variable','Ola {{empresa}}','Ola {{empresa}}',null,200],
 ['provider_429','Teste {{empresa}}','Teste {{empresa}}','Empresa 1',429],
]){
 sends=[];responseStatus=httpStatus;
 const recipient={...h.recipientRow(1,'5511999990001'),company_name_snapshot:company};
 const opts={cronVaultResult:h.TEST_CRON_SECRET,dispatch:h.dispatchRow({message_template:template,total_recipients:1}),recipients:[recipient],blockContent:{text:blockText}};
 const ctx=h.newCtx(opts);
 const response=await handleMultiplixSend(h.makePost({cronSecret:h.TEST_CRON_SECRET}),h.mockDeps(opts,ctx));
 result.push({case:caseName,expectedBlockText:personalize(blockText,{company}).text,actualSends:sends,httpStatus:response.status,result:await response.json(),completionRpc:ctx.rpcCalls.filter(c=>c.name.includes('if_drained')),itemCompletions:ctx.completions,rescheduleCalls:ctx.rpcCalls.filter(c=>c.name==='reschedule_multiplix_item').length,personalization:personalize(template,{company})});
}
const output={baseline:'2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6',mode:'OFFLINE_WORKER_WITH_REPO_MOCKS',limitations:'Provider send, database, clock delays and auth helper integrations are injected in memory. Does not establish deployed runtime or SQL behavior.',cases:result};
writeFileSync(resolve(dirname(new URL(import.meta.url).pathname),'offline_probe_results.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
