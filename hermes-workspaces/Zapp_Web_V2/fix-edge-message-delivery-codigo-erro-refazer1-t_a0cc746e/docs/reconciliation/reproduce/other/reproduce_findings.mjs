import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attestProvenance, installNetworkBlock, sha256Of } from '../lib/source-provenance.mjs';
const root=(process.env.RECONCILIATION_REPO || process.cwd());
// Atesta HEAD e os hashes das fontes antes de ler ou executar qualquer coisa; recusa divergência.
const pins=JSON.parse(readFileSync(new URL('./source-pins.json', import.meta.url),'utf8'));
const provenance=attestProvenance({ root, pins });
const network=installNetworkBlock(globalThis);
const adaptedBytes=readFileSync(new URL('./catalog_export_function.ts', import.meta.url));
const adapted_source_sha256={file:'catalog_export_function.ts',expected:'4691d46aa786cf6cf2d51d51ed1f804fa8bedeccb5fe8239dd429ea92493bb55',observed:sha256Of(adaptedBytes)};
assert.equal(adapted_source_sha256.observed,adapted_source_sha256.expected,'harness-adapted code changed since the pinned extraction');
const { collectCatalogExportRows } = await import('./catalog_export_function.ts');
const selectedIds=new Set(['image-1','pdf-1']);
const all=[{id:'image-1',type:'image'},{id:'pdf-1',type:'document'}];
let filtered=all.filter(x=>x.type==='image');
const selection={selectedIds};
const selectedItems=filtered.filter((item) => selection.selectedIds.has(item.id));
assert.equal(selectedIds.size,2);
assert.equal(selectedItems.length,1);
filtered=[];
const allOutsideItems=filtered.filter((item) => selection.selectedIds.has(item.id));
assert.equal(allOutsideItems.length,0);
const syncData={success:false,synced:4,failed:1,failures:[{id:'failed-message',error:'controlled failure'}]};
const httpResponse=new Response(JSON.stringify(syncData),{status:207});
assert.equal(httpResponse.ok,true);
const toastEvents=[];
const invalidated=[];
const toast={success:message=>toastEvents.push({kind:'success',message})};
const queryClient={invalidateQueries:({queryKey})=>invalidated.push(queryKey)};
const invalidateThreadData=()=>invalidated.push(['gmail-threads'],['gmail-thread-counts']);
const onSyncSuccess=(data)=>{  invalidateThreadData(); queryClient.invalidateQueries({ queryKey: ['gmail-labels'] }); toast.success(`${data.synced} emails sincronizados`);  };
onSyncSuccess(syncData);
assert.deepEqual(toastEvents,[{kind:'success',message:'4 emails sincronizados'}]);
assert.equal(invalidated.some(key=>key[0]==='gmail-accounts'),false);
const records=['A','B','C','D'].map(id=>({id,name:'Produto empatado'}));
const orders=[records,[records[2],records[0],records[1],records[3]]];
const pages=[];
const result=await collectCatalogExportRows(async ({offset,limit})=>{
 const order=orders[offset===0?0:1];
 const data=order.slice(offset,offset+limit);pages.push(data.map(x=>x.id));return {data};
},{maxRows:4,pageSize:2});
assert.deepEqual(result.map(x=>x.id),['A','B','D']);
const actions=readFileSync(root+'/src/hooks/chat/useFilesActions.ts','utf8');
const keys=[...actions.matchAll(/invalidateQueries\(\{ queryKey: (\w+)\(contactId\)/g)].map(m=>m[1]);
assert.deepEqual(keys,['contactMediaKey','conversationTabCountsKey']);
assert.ok(!keys.includes('contactMediaCountsKey'));
console.log(JSON.stringify({
 baseline_commit:provenance.observed.head,
 baseline_sha_expected:provenance.expected.baseline_sha,
 provenance,
 adapted_source_sha256,
 network_requests:network.attempts.length,
 network_attempts:network.attempts,
 method:'Exact selectedItems expression, export function and Gmail sync onSuccess callback extracted from source, deterministic fixtures; invalidation keys inspected statically. Does not execute React, Supabase SDK, network or database.',
 selection:{displayed_count:selectedIds.size,forwarded_count:selectedItems.length,forwarded:selectedItems.map(x=>x.id),omitted:['pdf-1']},
 selection_all_outside_filter:{displayed_count:selectedIds.size,forwarded_count:allOutsideItems.length,openForward_effect:'early return, as statically checked in FilesTab.tsx'},
 gmail_partial_sync:{http_status:207,http_ok:httpResponse.ok,backend_payload:syncData,toast_events:toastEvents,invalidated_keys:invalidated,account_invalidated:false},
 export:{legal_equal_name_orders:orders.map(a=>a.map(x=>x.id)),pages,returned:result.map(x=>x.id),missing:['C']},
 invalidation:{after_delete_keys:keys,missing_key:'contactMediaCountsKey'}
},null,2));
