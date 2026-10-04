import assert from 'node:assert/strict';
import { collectCatalogExportRows } from './catalog_export_function.ts';
import { readFileSync } from 'node:fs';
const root=(process.env.RECONCILIATION_REPO || process.cwd());
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
 baseline:'2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6',
 method:'Exact selectedItems expression, export function and Gmail sync onSuccess callback extracted from source, deterministic fixtures; invalidation keys inspected statically. Does not execute React, Supabase SDK, network or database.',
 selection:{displayed_count:selectedIds.size,forwarded_count:selectedItems.length,forwarded:selectedItems.map(x=>x.id),omitted:['pdf-1']},
 selection_all_outside_filter:{displayed_count:selectedIds.size,forwarded_count:allOutsideItems.length,openForward_effect:'early return, as statically checked in FilesTab.tsx'},
 gmail_partial_sync:{http_status:207,http_ok:httpResponse.ok,backend_payload:syncData,toast_events:toastEvents,invalidated_keys:invalidated,account_invalidated:false},
 export:{legal_equal_name_orders:orders.map(a=>a.map(x=>x.id)),pages,returned:result.map(x=>x.id),missing:['C']},
 invalidation:{after_delete_keys:keys,missing_key:'contactMediaCountsKey'}
},null,2));
