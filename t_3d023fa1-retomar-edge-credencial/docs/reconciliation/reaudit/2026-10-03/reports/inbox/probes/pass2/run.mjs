import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2);
const opt = name => { const i=argv.indexOf(name); if(i<0)return undefined; if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error(`Missing value for ${name}`);return argv[i+1]; };
const root = path.resolve(opt('--source') || process.env.SOURCE || process.env.INBOX_SOURCE_ROOT || path.join(here,'../../../../source'));
const pinsPath = path.resolve(opt('--pins') || process.env.INBOX_SOURCE_PINS || path.join(here,'pins.json'));
const resultPath = path.resolve(opt('--out') || process.env.INBOX_RESULTS_PATH || path.join(here,'results.json'));
const pinsBytes=fs.readFileSync(pinsPath);
const pins=JSON.parse(pinsBytes);
const observedHead=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(observedHead!==pins.source_sha)throw Error(`Source HEAD mismatch: expected ${pins.source_sha}, observed ${observedHead}`);
const sourceCache=new Map();
const hashes={};
for(const [p,expected] of Object.entries(pins.files)) {
  const fullPath=path.resolve(root,p);
  if(!fullPath.startsWith(root+path.sep))throw Error(`Unsafe pin path: ${p}`);
  const bytes=fs.readFileSync(fullPath);
  const observed=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if(observed!==expected)throw Error(`Source blob mismatch before execution: ${p}; expected ${expected}, observed ${observed}`);
  sourceCache.set(p,bytes.toString('utf8'));
}
function source(p) {
  if(!sourceCache.has(p))throw Error(`Unpinned source refused: ${p}`);
  hashes[p]=pins.files[p];
  return sourceCache.get(p);
}
const integrity={head_verified:true,source_blobs_verified:sourceCache.size,pins_sha256:createHash('sha256').update(pinsBytes).digest('hex'),derived_from_manifest_sha256:pins.derived_from_manifest_sha256,runner_sha256:createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex')};
function same(a,b){return a && b && a.length===b.length && a.every((v,i)=>Object.is(v,b[i]));}
class Hooks {
  cells=[]; i=0; effects=[]; dirty=false;
  useState=(initial)=>{ const i=this.i++; const c=this.cells[i]??=( { value:typeof initial==='function'?initial():initial }); if(!c.setter)c.setter=(v)=>{const n=typeof v==='function'?v(c.value):v;if(!Object.is(n,c.value)){c.value=n;this.dirty=true;}}; return [c.value,c.setter]; };
  useRef=(initial)=>{const i=this.i++;return this.cells[i]??={current:initial};};
  useMemo=(fn,deps)=>{const i=this.i++;const c=this.cells[i]; if(c&&same(c.deps,deps))return c.value;const value=fn();this.cells[i]={value,deps};return value;};
  useCallback=(fn,deps)=>this.useMemo(()=>fn,deps);
  useEffect=(fn,deps)=>{const i=this.i++;const c=this.cells[i];if(c&&same(c.deps,deps))return;this.cells[i]={deps,cleanup:c?.cleanup};this.effects.push(()=>{this.cells[i].cleanup?.();this.cells[i].cleanup=fn();});};
  deps(){return {useState:this.useState,useRef:this.useRef,useMemo:this.useMemo,useCallback:this.useCallback,useEffect:this.useEffect};}
  render(fn){this.dirty=false;this.i=0;const result=fn();const effects=this.effects.splice(0);for(const f of effects)f();return result;}
  async settle(fn){let result;for(let i=0;i<20;i++){result=this.render(fn);for(let turn=0;turn<12;turn++)await Promise.resolve();if(!this.dirty)return result;}throw Error('hook harness failed to settle');}
}
const silentLog={debug(){},error(){},warn(){},info(){}};
let serial=0;
const safeCrypto={randomUUID:()=>`00000000-0000-4000-a000-${String(++serial).padStart(12,'0')}`};
const inertTimers={setTimeout:()=>1,clearTimeout(){},setInterval:()=>2,clearInterval(){}};
function load(p,names,deps={},snippet){
  let code=snippet??source(p);
  code=stripTypeScriptTypes(code,{mode:'strip'}).replace(/^[ \t]*import\s[\s\S]*?;[ \t]*/gm,'').replace(/\bexport\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/g,'').replace(/^\s*export\s*\{[^}]*\};?/gm,'');
  const context=vm.createContext({ ...inertTimers,console:{log(){},error(){},warn(){}},URL,Blob,File,Date,Map,Set,Promise,EventTarget,CustomEvent,Error,crypto:safeCrypto,log:silentLog,getLogger:()=>silentLog,...deps });
  return vm.runInContext(`${code}\n;({${names.join(',')}})`,context,{filename:p});
}
const results=[];
function record(id,description,observed,limitations='Código TypeScript real com fronteiras simuladas; não é render React nem execução de banco/provedor.') {results.push({id,description,observed,limitations});}

function excerpt(p,start,end){const raw=source(p);const a=raw.indexOf(start);const b=raw.indexOf(end,a);if(a<0||b<0)throw Error(`missing excerpt markers ${p}`);return raw.slice(a,b);}

// P2.1. Compare the actual document and image download handlers under denied permission.
{
 let permissionQuery;
 const permission=load('src/hooks/system/useDownloadPermission.ts',['useDownloadPermission'],{
  useAuth:()=>({user:{id:'fixture-user'}}),
  useQuery:options=>{permissionQuery=options.queryFn;return{data:false,isLoading:false};},
  supabase:{from:()=>({select(){return this;},eq(){return this;},async single(){return{data:{can_download:false},error:null};}})}
 });
 const access=permission.useDownloadPermission();assert.equal(access.canDownload,false);assert.equal(await permissionQuery(),false);
 const events=[];
 const documentStub={body:{appendChild(){},removeChild(){}},createElement:()=>({click(){events.push('anchor-click');},download:'',href:''})};
 const fetchStub=async()=>{events.push('fetch');return{ok:true,blob:async()=>new Blob(['fixture-document'])};};
 const deps={canDownload:access.canDownload,toast:{error:()=>events.push('blocked'),success:()=>events.push('success')},fetch:fetchStub,document:documentStub,URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}}};
 const imagePath='src/components/inbox/ImagePreview.tsx';
 const imageHandler=load(imagePath,['handleDownload'],{...deps,src:'https://fixture.invalid/document',alt:'fixture'},excerpt(imagePath,'const handleDownload = async () => {','  // Portal para document.body'));
 await imageHandler.handleDownload();assert.deepEqual(events,['blocked']);events.length=0;
 const h=new Hooks();const docPath='src/components/inbox/MediaPreview.tsx';
 const docCode=excerpt(docPath,'export function DocumentPreview','  return (\n    <motion.div')+'return {handleDownload};\n}';
 const doc=load(docPath,['DocumentPreview'],{...deps,...h.deps(),getFileExtension:()=> 'pdf',useResolvedStorageUrl:()=>({url:'https://fixture.invalid/signed-document',isLoading:false})},docCode);
 const mounted=h.render(()=>doc.DocumentPreview({url:'fixture-locator',fileName:'fixture.pdf',isSent:false}));
 await mounted.handleDownload();assert.deepEqual(events,['fetch','anchor-click']);
 record('document_download_permission','Documento inicia download mesmo com can_download=false; imagem bloqueia a mesma ação',{profilePermission:false,imageBlockedBeforeFetch:true,documentEvents:[...events]},'Query de permissão e handlers reais; URL autorizada para leitura e fetch/anchor simulados. Não prova barreira de segurança do Storage nem render DOM; o problema é a ausência de controle na ação de download versionada.');
}

// P2.2. Both reaction mutations fulfill after provider rejection, leaving the local write committed.
{
 const mutations=[],invalidations=[],toasts=[],providerCalls=[];
 let localRow=null;
 const db={from(table){
  if(table==='messages')return{select(){return this;},eq(){return this;},async maybeSingle(){return{data:{contact_id:'c1'},error:null};}};
  if(table!=='message_reactions')throw Error(`Unexpected table ${table}`);
  return{
   upsert(row){localRow={...row,id:'r1'};return{select(){return this;},async single(){return{data:localRow,error:null};}};},
   delete(){return{eq(){return this;},then(resolve,reject){localRow=null;return Promise.resolve({error:null}).then(resolve,reject);}};}
  };
 }};
 const m=load('src/hooks/reactions/useReactionMutations.ts',['useReactionMutations'],{
  supabase:db,toast:x=>toasts.push(x),useQueryClient:()=>({invalidateQueries:x=>invalidations.push(x)}),
  useMutation:options=>{mutations.push(options);return{mutateAsync:async arg=>{try{const value=await options.mutationFn(arg);await options.onSuccess?.(value);return value;}catch(error){await options.onError?.(error);throw error;}}};},
  useEvolutionApi:()=>({sendReaction:async(...args)=>{providerCalls.push(args);throw Error('fixture provider rejected');}})
 });
 const hook=m.useReactionMutations('m1','p1',{instanceName:'fixture',contactJid:'fixture@s.whatsapp.net',externalId:'wa1',senderType:'contact'});
 const result=await hook.addMutation.mutateAsync('👍');assert.equal(result.id,'r1');assert.equal(localRow.emoji,'👍');
 const addedDespiteProviderFailure=!!localRow;
 await hook.removeMutation.mutateAsync('👍');assert.equal(localRow,null);assert.equal(providerCalls.length,2);assert.equal(providerCalls[1][2],'');assert.equal(toasts.length,0);assert.equal(invalidations.length,2);
 record('reaction_remote_failure_accepted','Adicionar/remover reação resolve e invalida cache apesar da rejeição do transporte',{addMutationFulfilled:true,localRowAddedDespiteProviderFailure:addedDespiteProviderFailure,removeMutationFulfilled:true,localRowRemovedDespiteProviderFailure:localRow===null,providerRejections:providerCalls.length,errorToasts:toasts.length,successInvalidations:invalidations.length},'Corpo real de useReactionMutations; contrato mutateAsync/onSuccess modelado, banco e envio simulados. Não afirma entrega nem convergência posterior de webhook real.');
}

// P2.3. An old refresh resolves after a new source's initial resolution.
{
 const refs=load('src/lib/storage_object_reference.ts',['parseSupabaseStorageObjectUrl','PRIVATE_MEDIA_BUCKETS']);
 const h=new Hooks(),calls=[];
 let completeOldRefresh;
 const a='https://fixture.invalid/storage/v1/object/public/whatsapp-media/a.jpg';
 const b='https://fixture.invalid/storage/v1/object/public/whatsapp-media/b.jpg';
 let current=a;
 const db={storage:{from:bucket=>({createSignedUrl(objectPath,ttl){calls.push({bucket,objectPath,ttl});if(objectPath==='a.jpg'&&calls.length===2)return new Promise(resolve=>{completeOldRefresh=()=>resolve({data:{signedUrl:'https://fixture.invalid/signed/a-refreshed'},error:null});});return Promise.resolve({data:{signedUrl:`https://fixture.invalid/signed/${objectPath}`},error:null});}})}};
 const m=load('src/hooks/storage/useResolvedStorageUrl.ts',['useResolvedStorageUrl'],{...h.deps(),...refs,SUPABASE_URL:'https://fixture.invalid',supabase:db});
 const render=()=>m.useResolvedStorageUrl(current);
 let hook=await h.settle(render);assert.equal(hook.url,'https://fixture.invalid/signed/a.jpg');
 const pending=hook.refresh();hook=await h.settle(render);assert.equal(hook.isLoading,true);
 current=b;hook=await h.settle(render);assert.equal(hook.url,'https://fixture.invalid/signed/b.jpg');assert.equal(hook.isLoading,false);
 const before={source:hook.source,url:hook.url,isLoading:hook.isLoading};
 completeOldRefresh();await pending;hook=await h.settle(render);
 assert.equal(hook.source,b);assert.equal(hook.url,'');assert.equal(hook.isLoading,true);assert.equal(hook.error,null);assert.equal(calls.length,3);
 hook=await h.settle(render);assert.equal(hook.isLoading,true);assert.equal(calls.length,3);
 record('signed_url_refresh_cross_source','Refresh de A termina depois de B e devolve B para loading sem URL ou nova requisição',{beforeOldRefreshCompletes:before,after:{source:hook.source,url:hook.url,isLoading:hook.isLoading,error:hook.error},signCalls:calls},'Hook e parser reais; scheduler/hook harness e Storage simulados. activeState impede exibir A como B, mas fica em loading; navegação in-place da galeria confirmada estaticamente.');
}

// P2.4. The UI limit never widens the underlying fixed query windows.
{
 const day=load('src/lib/localDay.ts',['localDayKey']);
 const fixtureEvents=Array.from({length:201},(_,i)=>({id:`e${i}`,event_type:'transfer',created_at:new Date(Date.UTC(2026,8,1,0,i)).toISOString()}));
 const fixtureMessages=Array.from({length:501},(_,i)=>({id:`m${i}`,sender:i%2?'agent':'contact',content:'fixture',created_at:new Date(Date.UTC(2026,8,1,0,i)).toISOString(),media_url:null,media_filename:null,media_size:null}));
 let queryFn,mode='transfers';const queries=[];
 const db={from(table){let cap=Infinity;return{select(){return this;},eq(){return this;},order(){return this;},limit(n){cap=n;return this;},gte(){return this;},then(resolve,reject){const rows=table==='conversation_events'&&mode==='transfers'?fixtureEvents:table==='messages'&&mode==='messages'?fixtureMessages:[];queries.push({table,cap:Number.isFinite(cap)?cap:null});return Promise.resolve({data:[...rows].sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,cap),error:null}).then(resolve,reject);}};}};
 const m=load('src/hooks/chat/useConversationHistoryTimeline.ts',['useConversationHistoryTimeline','buildTimeline'],{...day,supabase:db,useQuery:options=>{queryFn=options.queryFn;return{};}});
 m.useConversationHistoryTimeline('c1',0,'transfers',200);const eventResult=await queryFn();assert.equal(eventResult.hasMore,false);assert.equal(eventResult.days.flatMap(d=>d.events).length,200);assert.equal(eventResult.metrics.total,200);
 mode='messages';const counts=[];
 for(const limit of [200,400,600]){m.useConversationHistoryTimeline('c1',0,'messages',limit);const result=await queryFn();counts.push({uiLimit:limit,rendered:result.days.flatMap(d=>d.events).length,hasMore:result.hasMore,total:result.metrics.total});}
 assert.deepEqual(counts,[{uiLimit:200,rendered:200,hasMore:true,total:500},{uiLimit:400,rendered:400,hasMore:true,total:500},{uiLimit:600,rendered:500,hasMore:false,total:500}]);
 record('timeline_fixed_query_caps','Carregar mais só amplia o slice; 201 transferências ou 501 mensagens terminam com dados omitidos',{fixtureEvents:201,visibleEvents:200,canLoadOlderEvents:eventResult.hasMore,fixtureMessages:501,messageSteps:counts,queryCaps:queries.filter(q=>q.cap!==null)},'QueryFn e buildTimeline reais, PostgREST modelado com os limits solicitados. Volume real não consultado; não é o cap de useMessages nem a amostra superior de ContactStatsStrip (SV-002).');
 const machine=load('src/hooks/tasks/workItemMachine.ts',['applyTransition']);
 const completed=machine.applyTransition({id:'t1',title:'fixture',status:'todo',created_at:'2026-09-01T00:00:00Z',started_at:null,completed_at:null},'done',new Date('2026-09-01T01:00:00Z'));
 const taskResult=m.buildTimeline({messages:[],events:[],notes:[],tasks:[completed],deals:[],activities:[]});
 assert.equal(completed.status,'done');assert.equal(taskResult.days[0].events[0].pill.label,'Pendente');
 record('timeline_done_shown_pending','Tarefa concluída pela máquina atual aparece Pendente na Jornada',{persistedStatus:completed.status,completedAt:completed.completed_at,renderedPill:taskResult.days[0].events[0].pill.label},'applyTransition e buildTimeline reais; escrita persistida com status=done confirmada estaticamente no useMyWorkItems. Sem banco real.');
}

// P2.5. A late GPS callback wins over a newer manual selection while the picker remains open.
{
 const h=new Hooks();let gpsSuccess;
 const m=load('src/components/inbox/location-picker/useLocationPicker.ts',['useLocationPicker'],{
  ...h.deps(),AbortController,toast(){},getMapboxToken:async()=> 'fixture-token',reverseGeocodePlace:async()=>({name:'GPS antigo',address:'fixture'}),
  navigator:{geolocation:{getCurrentPosition:success=>{gpsSuccess=success;}}}
 });
 const render=()=>m.useLocationPicker(true,'map');let hook=await h.settle(render);
 hook.getCurrentLocation();hook=await h.settle(render);assert.equal(hook.isLoadingLocation,true);
 hook.chooseSearchResult({lat:1,lng:2,name:'Escolha mais nova',address:'fixture'});hook=await h.settle(render);
 const before={...hook.selectedLocation,origin:hook.selectedOrigin};assert.equal(before.name,'Escolha mais nova');
 await gpsSuccess({coords:{latitude:3,longitude:4}});hook=await h.settle(render);
 assert.equal(hook.selectedLocation.name,'GPS antigo');assert.equal(hook.selectedOrigin,'gps');
 record('gps_overwrites_newer_choice','GPS pedido antes substitui depois o ponto manual escolhido mais recentemente',{beforeGpsCallback:before,afterGpsCallback:{...hook.selectedLocation,origin:hook.selectedOrigin}},'Hook real, navegador/GPS/geocoding simulados. Picker permanece montado/aberto; não se alega reaparecimento após fechar, pois ChatDialogs desmonta o picker.');
}

// P2.6. Typing a new query invalidates suggest responses, but not an earlier retrieve selection.
{
 const h=new Hooks();
 const useReducer=(reducer,initial)=>{const [state,setState]=h.useState(initial);const cell=h.cells[h.i-1];cell.dispatch??=action=>setState(old=>reducer(old,action));return[state,cell.dispatch];};
 let completeRetrieve;const chosen=[];
 const m=load('src/components/inbox/location-picker/useAddressAutocomplete.ts',['useAddressAutocomplete'],{
  ...h.deps(),useReducer,AbortController,isSearchBudgetOk:()=>true,peekSearchSession:()=>null,getCachedSuggest:()=>undefined,getSearchSession:()=> 'fixture-session',noteSuggestCall(){},noteRetrieveCall(){},endSearchSession(){},logAudit:async()=>{},
  suggestPlaces:async()=>({ok:true,suggestions:[{id:'a',name:'Lugar A',address:'fixture',kind:'place'}]}),
  retrievePlaceResult:()=>new Promise(resolve=>{completeRetrieve=()=>resolve({ok:true,place:{name:'Lugar A',address:'fixture',lat:1,lng:2}});})
 });
 const render=()=>m.useAddressAutocomplete({token:'fixture-token',enabled:true});
 let hook=await h.settle(render);hook.setQuery('Lugar A');hook=await h.settle(render);hook.retrySuggest();hook=await h.settle(render);assert.equal(hook.suggestions.length,1);
 const p='src/components/inbox/LocationPicker.tsx';
 const consumer=load(p,['handleSelectSuggestion'],{autocomplete:hook,setAddressListOpen(){},chooseSearchResult:place=>chosen.push(place)},excerpt(p,'const handleSelectSuggestion = async (index: number) => {','  const handleSend = async () => {'));
 const pending=consumer.handleSelectSuggestion(0);hook=await h.settle(render);hook.setQuery('Lugar B');hook=await h.settle(render);assert.equal(hook.query,'Lugar B');
 completeRetrieve();await pending;assert.equal(chosen.length,1);assert.equal(chosen[0].name,'Lugar A');
 record('retrieve_survives_query_change','Digite B durante retrieve de A: o consumidor ainda aplica a seleção antiga A',{queryAtCompletion:hook.query,appliedPlace:chosen[0].name,retrieveStillAccepted:true},'Hook com reducer e callback do consumidor reais, requests e hooks simulados. Não invalida os guards já presentes para clear, disabled ou outra seleção; demonstra especificamente setQuery durante retrieve.');
}

// P2.7. Manual forward search retains several candidates only in the hook's unconsumed state.
{
 const h=new Hooks();
 let placeCount=2;
 const m=load('src/components/inbox/location-picker/useLocationPicker.ts',['useLocationPicker'],{
  ...h.deps(),AbortController,getMapboxToken:async()=> 'fixture-token',toast(){},
  searchPlaces:async()=>({ok:true,places:Array.from({length:placeCount},(_,i)=>({lat:i+1,lng:i+2,name:`Lugar ${i+1}`,address:'fixture'}))})
 });
 const render=()=>m.useLocationPicker(true,'map');let hook=await h.settle(render);
 await hook.searchLocation('termo manual');hook=await h.settle(render);assert.equal(hook.searchResults.length,2);assert.equal(hook.selectedLocation,null);
 const p='src/components/inbox/LocationPicker.tsx';const componentSource=source(p);
 assert.equal(/\bsearchResults\b/.test(componentSource),false);
 assert.ok(componentSource.includes('suggestions={autocomplete.suggestions}'));
 const multiple={candidatesInHook:hook.searchResults.length,selectedLocation:hook.selectedLocation,consumerReadsSearchResults:false};
 placeCount=1;await hook.searchLocation('termo único');hook=await h.settle(render);assert.equal(hook.selectedLocation.name,'Lugar 1');
 record('manual_forward_candidates_unrendered','Forward com vários candidatos não seleciona ponto e o componente não consome a lista',{multiple,singleResultSelectsAutomatically:hook.selectedLocation.name},'Hook real executado e ligação do componente conferida no TSX inteiro previamente fixado. Não monta DOM; a ausência da lista é evidência estática de consumidor, não inferência de dead code do hook.');
}

fs.writeFileSync(resultPath,JSON.stringify({source_sha:observedHead,integrity,engine:process.version,no_network:true,method:'Segunda passagem: TypeScript real e callbacks extraídos, fronteiras simuladas; sem React DOM.',source_blob_hashes:hashes,results},null,2)+'\n');
console.log(JSON.stringify({probes:results.length,allAssertionsPassed:true,ids:results.map(x=>x.id)},null,2));
