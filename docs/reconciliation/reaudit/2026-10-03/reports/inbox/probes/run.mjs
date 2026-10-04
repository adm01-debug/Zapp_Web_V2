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
const root = path.resolve(opt('--source') || process.env.SOURCE || process.env.INBOX_SOURCE_ROOT || path.join(here,'../../../source'));
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

// 1. Composer routing: quote and forward metadata must travel beyond UI.
{
 const h=new Hooks(), calls=[],toasts=[]; const m=load('src/components/inbox/chat/useChatPanelHandlers.ts',['useChatPanelHandlers'],{...h.deps(),toast:(x)=>toasts.push(x),supabase:{},undoToast(){},useConversationActions:()=>({}),useMyWorkItems:()=>({createAndGetId:async()=>null}),normalizeOperationalPriority:()=>({value:'high'})});
 const options={contactId:'c1',conversationId:'c1',contactPhone:'5511000000000',instanceName:'fixture',onSendMessage:async(...args)=>calls.push(args),editMessageApi:async()=>{},applySignature:x=>x,handleTypingStart(){},handleTypingStop(){},openDialog(){},closeDialog(){},handleSetActiveTool(){}};
 const render=()=>m.useChatPanelHandlers(options);
 let hook=await h.settle(render);hook.handleReplyToMessage({id:'quoted-1',timestamp:new Date(),content:'Orçamento',sender:'contact'});hook.setInputValue('Aprovado');hook=await h.settle(render);await hook.handleSend();
 assert.equal(calls.length,1);assert.equal(calls[0].length,1);assert.equal(calls[0][0],'Aprovado');
 record('reply_metadata','Resposta selecionada não chega ao callback de transporte',{transportArguments:calls[0],replyId:'quoted-1',metadataSent:false});
 const before=calls.length;hook.handleForwardToTargets(['destino-1'],'contact');hook.handleSendInteractiveMessage({body:'Escolha',buttons:[{id:'b1',title:'Sim'}]});
 assert.equal(calls.length,before);assert.ok(toasts.some(x=>x.title==='Mensagem interativa enviada!'));
 record('forward_interactive_noop','Handlers de encaminhar e interativo não invocam transporte',{newTransportCalls:calls.length-before,interactiveToast:toasts.at(-1).title});
 // The Enter handler calls the same transport even though the button is disabled by CHAR_LIMIT.
 hook=await h.settle(render);hook.setInputValue('a'.repeat(4097));hook=await h.settle(render);hook.handleKeyDown({key:'Enter',shiftKey:false,preventDefault(){}},false);await Promise.resolve();assert.equal(calls.at(-1)[0].length,4097);
 record('enter_limit','Enter contorna o limite visual 4096 do botão',{sentCharacters:calls.at(-1)[0].length});
}

// 2. A persisted message and its uploaded object straddle two async operations.
{
 const objects=new Map(),queued=[],events=[];let dispatchFails=true;
 const db={storage:{from(bucket){return{async upload(p,f){objects.set(`${bucket}/${p}`,f);events.push('uploaded');return{error:null};},getPublicUrl(p){return{data:{publicUrl:`https://fixture.invalid/storage/v1/object/public/${bucket}/${p}`}};},async remove(paths){for(const p of paths)objects.delete(`${bucket}/${p}`);events.push('removed');return{error:null};}};}},async rpc(name,p){queued.push({...p,id:`msg-${queued.length+1}`});events.push('enqueued');return{data:{id:queued.at(-1).id,status:'pending'},error:null};},functions:{async invoke(){events.push('dispatch');return dispatchFails?{data:null,error:new Error('dispatch response lost')}:{data:{messageId:queued.at(-1).id,status:'sent'},error:null};}}};
 const outbound=load('src/services/outbound-message.service.ts',['sendOutboundMessage'],{supabase:db});
 const storage=load('src/lib/storage_object_upload.ts',['createStorageObjectId','removeStoredObjectBestEffort','sanitizeStorageFileName'],{supabase:db});
 const h=new Hooks(),toast=Object.fromEntries(['info','success','error','warning'].map(k=>[k,()=>{}]));
 const m=load('src/components/inbox/useFileUploadLogic.ts',['useFileUploadLogic'],{...h.deps(),...storage,supabase:db,sendOutboundMessage:outbound.sendOutboundMessage,toast,validateFile:()=>({valid:true,category:'document'}),compressImage:async file=>({file,wasCompressed:false}),formatCompressionInfo:()=>'',URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}}});
 const render=()=>m.useFileUploadLogic({contactId:'contact-1'});let hook=await h.settle(render);const file=new File(['fixture'],'proposta.pdf',{type:'application/pdf'});hook.handleExternalFile(file);hook=await h.settle(render);await hook.handleSendFile();
 assert.equal(queued.length,1);assert.equal(objects.size,0);assert.deepEqual(events,['uploaded','enqueued','dispatch','removed']);
 dispatchFails=false;hook=await h.settle(render);hook.handleExternalFile(file);hook=await h.settle(render);await hook.handleSendFile();
 assert.equal(queued.length,2);assert.notEqual(queued[0].p_client_message_id,queued[1].p_client_message_id);
 record('media_rollback','Falha após enqueue apaga objeto já referenciado; reenviar cria outro ID',{firstAttemptEvents:events.slice(0,4),persistedMessages:queued.length,objectsRemaining:objects.size,firstMessageObjectDeleted:true,retryUsesNewId:true});
 // Native file input is multiple but the actual handler consumes only the first file.
 hook=await h.settle(render);hook.handleFileChange({target:{files:[file,new File(['second'],'segundo.pdf',{type:'application/pdf'})]}});hook=await h.settle(render);assert.equal(hook.filePreview.file.name,'proposta.pdf');assert.equal(hook.fileQueue.length,0);
 record('native_multiple_files','Seletor nativo multiple encaminha somente files[0]',{selected:2,previewFiles:1,queueFiles:hook.fileQueue.length});
}

// 3. Signature restoration breaks the idempotency key on an ambiguous text send.
{
 const queued=[];let fail=true;
 const db={auth:{async getUser(){return{data:{user:{id:'u1'}}};}},from(){return{select(){return this;},eq(){return this;},async maybeSingle(){return{data:{name:'Ana Lima',job_title:'Vendas'},error:null};}};},async rpc(name,p){queued.push({...p,id:`q${queued.length+1}`});return{data:{id:queued.at(-1).id,status:'pending'},error:null};},functions:{async invoke(){return fail?{error:new Error('response lost')}:{data:{messageId:queued.at(-1).id,status:'sent'},error:null};}}};
 const outbound=load('src/services/outbound-message.service.ts',['sendOutboundMessage'],{supabase:db});
 const hs=new Hooks();const signature=load('src/hooks/chat/useMessageSignature.ts',['useMessageSignature'],{...hs.deps(),supabase:db,localStorage:{getItem:()=>null,setItem(){}}});const sig=await hs.settle(()=>signature.useMessageSignature());assert.equal(sig.agentName,'Ana - Vendas');
 const h=new Hooks();const m=load('src/components/inbox/chat/useChatPanelHandlers.ts',['useChatPanelHandlers'],{...h.deps(),toast(){},supabase:db,undoToast(){},useConversationActions:()=>({}),useMyWorkItems:()=>({createAndGetId:async()=>null})});
 const opts={contactId:'c1',conversationId:'c1',contactPhone:'5511000000000',onSendMessage:content=>outbound.sendOutboundMessage({contactId:'c1',content,messageType:'text'}),applySignature:sig.applySignature,handleTypingStart(){},handleTypingStop(){},openDialog(){},closeDialog(){},handleSetActiveTool(){}};
 const render=()=>m.useChatPanelHandlers(opts);let hook=await h.settle(render);hook.setInputValue('Proposta aprovada');hook=await h.settle(render);await hook.handleSend();hook=await h.settle(render);const restored=hook.inputValue;fail=false;await hook.handleSend();
 assert.equal(queued.length,2);assert.notEqual(queued[0].p_client_message_id,queued[1].p_client_message_id);assert.notEqual(queued[0].p_content,queued[1].p_content);
 record('signature_retry','Retry de texto restaura payload já assinado e adiciona outra assinatura',{first:queued[0].p_content,restored,second:queued[1].p_content,differentIdempotencyKey:true});
}

// 4. The recorder's mount cleanup and auto-stop capture the initial false state.
{
 const h=new Hooks();let interval,stops=0,trackStops=0;const made=[];
 class Recorder{constructor(){this.state='inactive';made.push(this);}start(){this.state='recording';}stop(){stops++;this.state='inactive';}}
 const m=load('src/hooks/communication/useAudioRecorder.ts',['useAudioRecorder'],{...h.deps(),toast(){},supabase:{},MediaRecorder:Recorder,navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){trackStops++;}}]})}},setInterval:(fn)=>{interval=fn;return 1;},clearInterval(){}});
 const render=()=>m.useAudioRecorder({maxDuration:2});let hook=h.render(render);const cancelCapturedAtMount=hook.cancelRecording;await hook.startRecording();hook=await h.settle(render);assert.equal(hook.isRecording,true);
 for(let i=0;i<4;i++){interval();hook=await h.settle(render);}const beforeUnmount={reportedDuration:hook.duration,recorderState:made[0].state,stops};cancelCapturedAtMount();
 assert.equal(stops,0);assert.equal(trackStops,0);assert.equal(made[0].state,'recording');
 record('recorder_lifecycle','Tempo máximo e cleanup do mount não param MediaRecorder',{beforeUnmount,afterUnmount:{recorderState:made[0].state,recorderStopCalls:stops,trackStopCalls:trackStops}},'Hook real em harness com semântica de closure/deps; função de cleanup escolhida é exatamente a captura useEffect([]) do componente. Sem microfone ou browser real.');
}

// 5. A realtime overlay from an earlier request overrides a newer authoritative refetch.
{
 const h=new Hooks();let subscriptions=[], rows=[{id:'m1',contact_id:'c1',created_at:'2026-10-01T00:00:00Z',content:'antigo',sender:'agent',status:'sent'}];
 const m=load('src/hooks/chat/useMessages.ts',['useMessages'],{...h.deps(),useQueryClient:()=>({invalidateQueries(){}}),ChatService:{async fetchMessages(){return{data:rows,error:null};}},mapMessageRowToMessage:r=>({...r,timestamp:new Date(r.created_at)}),useSupabaseRealtime:c=>{subscriptions.push(c);},contactMediaKey:id=>['media-gallery',id],contactMediaCountsKey:id=>['media-gallery-counts',id],conversationTabCountsKey:id=>['conversation-tab-counts',id]});
 const render=()=>m.useMessages({contactId:'c1'});let hook=await h.settle(render);subscriptions.at(-1).onUpdate({new:{...rows[0],content:'edição vista em realtime',status:'delivered'}});hook=await h.settle(render);
 rows=[{...rows[0],content:'edição posterior no servidor',status:'read'}];await hook.refetch();hook=await h.settle(render);
 assert.equal(hook.messages[0].status,'delivered');assert.equal(hook.messages[0].content,'edição vista em realtime');
 record('overlay_stale','Refetch novo perde para overlay antigo que nunca é descartado',{serverStatus:'read',renderedStatus:hook.messages[0].status,serverContent:rows[0].content,renderedContent:hook.messages[0].content});
}

// 6. The gallery's fallback classifier disagrees with the canonical message_type.
{
 const m=load('src/components/inbox/media-gallery/mediaUtils.ts',['getMediaType']);
 assert.equal(m.getMediaType('https://fixture.invalid/contact/1.webm','audio'),'video');
 record('gallery_webm_audio','Arquivo produzido por uploadAudio(.webm) é vídeo na galeria',{urlSuffix:'.webm',messageType:'audio',classified:m.getMediaType('https://fixture.invalid/contact/1.webm','audio')});
}

// 7. Source-extracted TSX callbacks retain their production bodies (no JSX engine).
function excerpt(p,start,end){const raw=source(p);const a=raw.indexOf(start);const b=raw.indexOf(end,a);if(a<0||b<0)throw Error(`missing excerpt markers ${p}`);return raw.slice(a,b);}
{
 const p='src/components/inbox/ScheduleMessageDialog.tsx',events=[];
 let finish;const pending=new Promise(r=>finish=r);
 const code=excerpt(p,'const handleSchedule = () => {','  const handleQuickSchedule');
 const m=load(p,['handleSchedule'],{message:'Lembrete',date:'2030-01-01',time:'09:00',attachment:null,localInstantFromDayAndTime:()=>new Date('2030-01-01T09:00:00Z'),onSchedule:()=>{events.push('pending-persistence');return pending;},toast:x=>events.push(x.title),format:()=> '01/01/2030',ptBR:{},onOpenChange:x=>events.push(`open:${x}`),setMessage:x=>events.push(`draft:${x}`),setAttachment:x=>events.push(`attachment:${x}`)},code);
 m.handleSchedule();assert.deepEqual(events,['pending-persistence','Mensagem agendada!','open:false','draft:','attachment:null']);finish();
 record('schedule_before_persistence','Dialog anuncia sucesso e elimina draft enquanto onSchedule está pendente',{eventsBeforePersistence:events},'Callback extraído por marcadores do TSX real, com funções externas simuladas. Não monta DOM nem cria agendamento real.');
}
{
 const panel='src/components/inbox/ChatPanel.tsx',dialog='src/components/inbox/TransferDialog.tsx',writes=[],events=[];
 const db={from:()=>({update:p=>{writes.push(p);return{eq:async()=>({error:new Error('foreign key rejected')})};}})};
 const m=load(panel,['handleTransfer'],{supabase:db,conversation:{contact:{id:'c1'}},toast:x=>events.push(x.title)},excerpt(panel,"const handleTransfer = async (type: 'agent' | 'queue'",'  const handleScheduleMessage'));
 const d=load(dialog,['handleTransfer'],{selectedTarget:'connection-1',transferType:'connection',isTransferring:false,message:'Contexto da transferência',setIsTransferring:x=>events.push(`busy:${x}`),onTransfer:m.handleTransfer,onOpenChange:x=>events.push(`open:${x}`),setSelectedTarget(){},setMessage(){}},excerpt(dialog,'const handleTransfer = async () => {','  const handleDialogOpenChange'));
 await d.handleTransfer();assert.equal(writes[0].queue_id,'connection-1');assert.ok(events.includes('open:false'));
 record('transfer_wrong_kind','Tipo connection vira queue_id; erro resolvido pelo callback fecha diálogo',{writtenFields:writes[0],events},'Callbacks extraídos dos dois TSX reais. Erro FK simulado; não executa schema nem serviço.');
}
{
 const p='src/components/inbox/chat/MessageHoverToolbar.tsx',events=[];
 const m=load(p,['handleDelete'],{useCallback:x=>x,externalId:'wa-id-1',instanceName:'fixture',contactJid:'fixture@s.whatsapp.net',isSent:true,message:{id:'m1'},deleteMessage:async()=>{events.push('provider-rejected');throw Error('fixture failure');},supabase:{from:()=>({update:()=>({eq:async()=>{events.push('db-rejected');return{error:Error('fixture failure')};}})})},toast:{success:x=>events.push(x),error:x=>events.push(x)},onMessageDeleted:x=>events.push(`delete-callback:${x}`)},excerpt(p,'const handleDelete = useCallback(async () => {','  const handleMarkRead'));
 await m.handleDelete();assert.deepEqual(events,['provider-rejected','db-rejected','Mensagem deletada para todos','delete-callback:m1']);
 record('delete_false_success','Exclusão falha no provedor e banco mas anuncia para todos e invoca callback de exclusão',{events},'Callback real extraído do TSX ativo; respostas externas simuladas. Não exclui mensagem real.');
}
{
 const h=new Hooks(),toasts=[];let remoteCalls=0;
 const db={from:()=>({update:()=>({eq:async()=>({error:Error('fixture rejected')})})})};
 const m=load('src/components/inbox/chat/useChatPanelHandlers.ts',['useChatPanelHandlers'],{...h.deps(),toast:x=>toasts.push(x),supabase:db,undoToast(){},useConversationActions:()=>({}),useMyWorkItems:()=>({createAndGetId:async()=>null})});
 const render=()=>m.useChatPanelHandlers({contactId:'c1',conversationId:'c1',contactPhone:'fixture',instanceName:undefined,onSendMessage:async()=>{},editMessageApi:async()=>remoteCalls++,applySignature:x=>x,handleTypingStart(){},handleTypingStop(){},openDialog(){},closeDialog(){},handleSetActiveTool(){}});
 let hook=await h.settle(render);hook.handleEditStart({id:'m1',timestamp:new Date(),content:'Antes',external_id:'wa-1'});hook.setInputValue('Depois');hook=await h.settle(render);await hook.handleSend();hook=await h.settle(render);
 assert.ok(toasts.some(t=>t.title==='✏️ Mensagem editada'));assert.equal(hook.inputValue,'');assert.equal(remoteCalls,0);
 record('edit_false_success','Edição sem conexão resolvida e update rejeitado ainda anuncia sucesso',{remoteCalls,toast:toasts.at(-1).title,draftAfter:hook.inputValue});
}

// 8. Actual initial-fetch builder and filters with a deliberately truncated fixture.
{
 const utils=load('src/hooks/realtime/realtimeUtils.ts',['normalizeMessage','buildConversations','getUniqueMessageContactIds','chunkArray','dedupeContacts','buildConversation']);
 const contacts=['a','b'].map(id=>({id,name:id,phone:'fixture',created_at:'2026-09-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',conversation_status:'open',assigned_to:'u1'}));
 const messages=Array.from({length:1000},(_,i)=>({id:`ma-${i}`,contact_id:'a',created_at:'2026-10-01T00:00:00Z',sender:'contact',is_read:true,content:'recente'}));messages.push({id:'mb-1',contact_id:'b',created_at:'2026-09-30T00:00:00Z',sender:'contact',is_read:false,content:'aguardando resposta'});
 const queries=[];const db={from(table){return{select(){return this;},not(){return this;},order(){return this;},async limit(n){queries.push({table,limit:n});return{data:(table==='contacts'?contacts:messages).slice(0,n),error:null};}};}};
 const svc=load('src/services/realtime.service.ts',['RealtimeService'],{...utils,supabase:db});const convs=await svc.RealtimeService.fetchInitialConversations();const b=convs.find(c=>c.contact.id==='b');assert.equal(b.unreadCount,0);assert.equal(b.lastMessage,null);
 const h=new Hooks();const filters=load('src/hooks/inbox/useInboxFilters.ts',['useInboxFilters'],{...h.deps(),URLSearchParams,window:{location:{search:''}},useFeatureFlag:()=>true,useUrlFilters:()=>({filters:{search:'',status:[],tags:[],agentId:null,dateFrom:null,dateTo:null},setFilters(){},clearFilters(){}}),filterByContactType:x=>x});
 const active=await h.settle(()=>filters.useInboxFilters({conversations:convs,profileId:'u1'}));assert.equal(active.filteredConversations.some(c=>c.contact.id==='b'),false);
 record('global_window_hides_contact','1000 mensagens globais ocupadas por A removem B ativo da lista aberta',{fixtureMessageCount:messages.length,queries,contactB:{actualUnread:1,sampledUnread:b.unreadCount,lastMessage:b.lastMessage,visibleInOpen:false}});
}
{
 const h=new Hooks();const cache=[{contact:{id:'b'},messages:[{id:'mb-1'}]}];let loading=true;
 const m=load('src/hooks/system/useOfflineCache.ts',['useOfflineCache'],{...h.deps(),navigator:{onLine:false},window:{addEventListener(){},removeEventListener(){}},localStorage:{getItem:()=>JSON.stringify({data:cache,timestamp:Date.now()}),setItem(){},removeItem(){}}});
 const render=()=>m.useOfflineCache([],loading);let hook=await h.settle(render);assert.equal(hook.conversations.length,1);loading=false;hook=await h.settle(render);assert.equal(hook.conversations.length,0);
 record('offline_cache_dropped','Cache válido desaparece ao concluir fetch offline falho',{offline:true,cachedConversations:1,whileLoading:1,afterFailureLoadingFalse:hook.conversations.length,usingCache:hook.usingCache});
}

// 9. Real keyboard callback when zero results become nonzero before query changes.
{
 const p='src/components/inbox/GlobalSearch.tsx';let handler,index=0,selected=0;const h=new Hooks();let rows=[];
 const code=excerpt(p,'useEffect(() => {\n    if (!open) return;','  const activeFiltersCount');
 function render(){load(p,[],{...h.deps(),open:true,results:rows,tagSuggestions:[],selectedIndex:index,handleSelect(){selected++;},handleTagSelect(){},onOpenChange(){},setSelectedIndex:fn=>{index=fn(index);},document:{addEventListener:(event,f)=>{handler=f;},removeEventListener(){}}},code);}
 h.render(render);handler({key:'ArrowDown',preventDefault(){}});assert.ok(Number.isNaN(index));rows=[{id:'r1'}];h.render(render);handler({key:'ArrowDown',preventDefault(){}});handler({key:'Enter',preventDefault(){}});assert.equal(selected,0);
 record('global_search_nan_index','Navegação com total zero torna índice NaN e bloqueia Enter após resultados chegarem',{indexIsNaN:Number.isNaN(index),resultsAfter:rows.length,selectedByEnter:selected},'Effect/handler extraídos do TSX, simulação do listener e transição de resultados. Sem browser real.');
}

// 10. Audio failures discard the only retained recording in the parent UI.
{
 const h=new Hooks();const m=load('src/components/inbox/chat/useChatPanelHandlers.ts',['useChatPanelHandlers'],{...h.deps(),toast(){},supabase:{},undoToast(){},useConversationActions:()=>({}),useMyWorkItems:()=>({createAndGetId:async()=>null})});
 const render=()=>m.useChatPanelHandlers({contactId:'c1',conversationId:'c1',contactPhone:'fixture',onSendMessage:async()=>{},applySignature:x=>x,handleTypingStart(){},handleTypingStop(){},openDialog(){},closeDialog(){},handleSetActiveTool(){}});let hook=await h.settle(render);hook.setIsRecordingAudio(true);hook=await h.settle(render);await hook.handleAudioSend(new Blob(['fixture']),async()=>{throw Error('fixture send failure');});hook=await h.settle(render);assert.equal(hook.isRecordingAudio,false);
 record('audio_error_closes_recorder','Mesmo com rejeição explícita, parent desmonta gravador e perde blob local',{sendRejected:true,isRecordingAudioAfter:false});
}

// 11. Popup re-maps a message already adapted by useMessages and discards required data.
{
 const adapter=load('src/adapters/inboxAdapter.ts',['mapMessageRowToMessage']);const p='src/pages/ChatPopup.tsx';const popup=load(p,['mapToLegacyMessages'],{},excerpt(p,'function mapToLegacyMessages','export default function ChatPopup'));
 const original={id:'m1',contact_id:'c1',created_at:'2026-10-01T00:00:00Z',message_type:'location',content:'{"latitude":-23.5,"longitude":-46.6}',sender:'agent',status:'sent',external_id:'wa-1',is_deleted:true,link_preview:{title:'fixture'},is_edited:true};
 const inbox=adapter.mapMessageRowToMessage(original);const mapped=popup.mapToLegacyMessages([inbox],'c1')[0];assert.ok(inbox.location);assert.equal(mapped.location,undefined);assert.equal(mapped.external_id,undefined);assert.equal(mapped.is_deleted,undefined);
 record('popup_discards_fields','Mapper do popup apaga campos que useMessages já forneceu',{inboxFields:{location:!!inbox.location,external_id:!!inbox.external_id,is_deleted:inbox.is_deleted,isEdited:inbox.isEdited},popupFields:{location:!!mapped.location,external_id:!!mapped.external_id,is_deleted:!!mapped.is_deleted,isEdited:!!mapped.isEdited}});
}

// 12. A selected tag does not scope message search and is applied too late to contacts.
{
 const h=new Hooks();const contacts=Array.from({length:11},(_,i)=>({id:`c${i}`,name:`Contato ${String(i).padStart(2,'0')}`,phone:'fixture',created_at:'2026-10-01T00:00:00Z',tags:i===10?['VIP']:[]}));
 const messageRows=[{id:'m1',content:'oi',created_at:'2026-10-01T00:00:00Z',contact_id:'other',contacts:{id:'other',name:'Outro'},message_type:'text'}];
 const ops=[];const db={from(table){let cap=Infinity;return{select(){return this;},eq(){return this;},order(){return this;},limit(n){cap=n;return this;},ilike(){return this;},then(resolve){ops.push({table,limit:cap});return Promise.resolve({data:(table==='contacts'?contacts:messageRows).slice(0,cap),error:null}).then(resolve);}};}};
 const m=load('src/components/inbox/useGlobalSearchData.ts',['useGlobalSearchData'],{...h.deps(),supabase:db,useUserRole:()=>({isSupervisor:false}),useCRMIntegrationEnabled:()=>false,useSearchHistory:()=>({history:[],addToHistory(){},removeFromHistory(){},clearHistory(){}}),window:{...inertTimers}});
 const render=()=>m.useGlobalSearchData(false);let hook=await h.settle(render);await hook.performSearch('',new Set(['contact']),'all',['VIP']);hook=await h.settle(render);assert.equal(hook.results.length,0);const contactResultCount=hook.results.length;await hook.performSearch('oi',new Set(['message']),'all',['VIP']);hook=await h.settle(render);assert.equal(hook.results[0].contactId,'other');
 record('global_search_tag_semantics','Tag limita contatos só depois de LIMIT e não restringe mensagens',{matchingContactExistsAtPosition:11,contactLimit:10,returnedContactCount:contactResultCount,messageReturnedFromContactWithoutSelectedTag:hook.results[0].contactId,queries:ops});
}

// 13. Ctrl+F bubbles from the controlled textarea handler into the window handler.
{
 const h=new Hooks();let active=null,toggles=0;
 const change=tool=>{active=active===tool?null:tool;toggles++;};
 const m=load('src/components/inbox/chat/useChatPanelHandlers.ts',['useChatPanelHandlers'],{...h.deps(),toast(){},supabase:{},undoToast(){},useConversationActions:()=>({}),useMyWorkItems:()=>({createAndGetId:async()=>null})});
 const hook=await h.settle(()=>m.useChatPanelHandlers({contactId:'c1',conversationId:'c1',contactPhone:'fixture',onSendMessage:async()=>{},applySignature:x=>x,handleTypingStart(){},handleTypingStop(){},openDialog(){},closeDialog(){},handleSetActiveTool:change}));
 const p='src/components/inbox/ChatPanel.tsx';const global=load(p,['h'],{handleSetActiveTool:change},excerpt(p,"const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'f')", "    window.addEventListener('keydown', h);"));
 const event={key:'f',ctrlKey:true,preventDefault(){}};hook.handleKeyDown(event,false);global.h(event);assert.equal(active,null);assert.equal(toggles,2);
 record('ctrl_f_double_toggle','Dois handlers de Ctrl+F desfazem a abertura do painel de busca',{calls:toggles,activeSearchAfter:null},'Callbacks reais; ordem de propagação textarea→window modelada explicitamente. Sem React DOM.');
}

fs.writeFileSync(resultPath,JSON.stringify({source_sha:observedHead,integrity,engine:process.version,no_network:true,method:'TypeScript real carregado com stripTypeScriptTypes; stubs apenas para fronteiras e hooks, sem React DOM.',source_blob_hashes:hashes,results},null,2)+'\n');
console.log(JSON.stringify({probes:results.length,allAssertionsPassed:true,ids:results.map(x=>x.id)},null,2));
