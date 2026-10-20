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
  unmount(){for(const cell of this.cells)cell?.cleanup?.();}
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
  const context=vm.createContext({ ...inertTimers,AbortController,queueMicrotask,console:{log(){},error(){},warn(){}},URL,Blob,File,Date,Map,Set,Promise,EventTarget,CustomEvent,Error,crypto:safeCrypto,log:silentLog,getLogger:()=>silentLog,...deps });
  return vm.runInContext(`${code}\n;({${names.join(',')}})`,context,{filename:p});
}
const results=[];
function record(id,description,observed,limitations='Código TypeScript real com fronteiras simuladas; não é render React nem execução de banco/provedor.') {results.push({id,description,observed,limitations});}

function excerpt(p,start,end){const raw=source(p);const a=raw.indexOf(start);const b=raw.indexOf(end,a);if(a<0||b<0)throw Error(`missing excerpt markers ${p}`);return raw.slice(a,b);}

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
async function flush(){for(let i=0;i<24;i++)await Promise.resolve();}

function prefixFunction(p,start,end,returns,extra='') {
 return excerpt(p,start,end)+extra+`\nreturn {${returns}};\n}`;
}
function imageErrorCallback(p,componentStart) {
 const raw=source(p),start=raw.indexOf('onError={() => {',raw.indexOf(componentStart))+ 'onError={'.length;
 assert.ok(start>=12);
 const end=raw.indexOf('\n      }}',start);
 if(end<0)throw Error('Missing multiline image error callback');
 return raw.slice(start,end+'\n      }'.length);
}
const dialogPath='src/components/inbox/quick-replies/QuickReplyDialog.tsx';
const managerPath='src/components/inbox/QuickRepliesManager.tsx';
const pickerPath='src/components/inbox/VoiceChangerPicker.tsx';
const textAudioPath='src/components/inbox/TextToAudioButton.tsx';
const thumbPath='src/components/inbox/tabs/FileThumb.tsx';
const detailPath='src/components/inbox/tabs/FileDetailPanel.tsx';
const refs=load('src/lib/storage_object_reference.ts',['parseSupabaseStorageObjectUrl','PRIVATE_MEDIA_BUCKETS']);
const providerUrl='https://fixture.invalid';
function makeToast(events,label='toast') {
 return {success:x=>events.push([label,'success',x]),error:x=>events.push([label,'error',x]),info:x=>events.push([label,'info',x])};
}
const localUrl={createObjectURL:()=>`blob:fixture-${++serial}`,revokeObjectURL(){}};
class FakeAudio { currentTime=0;paused=true;async play(){this.paused=false;}pause(){this.paused=true;} }

// P5.1: same mounted dialog receives a new editing target without a new state initializer.
{
 const h=new Hooks(),updates=[];
 let props={open:false,editingTemplate:null,isSubmitting:false,onClose(){props={...props,open:false,editingTemplate:null};},onCreate:async()=>{},onUpdate:async(id,data)=>updates.push({id,data:{...data}})};
 const m=load(dialogPath,['QuickReplyDialog'],h.deps(),prefixFunction(dialogPath,'export function QuickReplyDialog','  return (','formData,setFormData,handleSubmit,handleOpenChange'));
 let dialog=await h.settle(()=>m.QuickReplyDialog(props));
 const a={id:'template-A',title:'Original A',content:'A original',shortcut:'/a',category:'geral'};
 const b={id:'template-B',title:'Original B',content:'B original',shortcut:'/b',category:'vendas'};
 props={...props,open:true,editingTemplate:a};dialog=await h.settle(()=>m.QuickReplyDialog(props));
 assert.equal(dialog.formData.title,'');
 dialog.setFormData({title:'Draft A',content:'Text intended for A',shortcut:'/a',category:'geral'});
 dialog=await h.settle(()=>m.QuickReplyDialog(props));await dialog.handleSubmit();
 dialog=await h.settle(()=>m.QuickReplyDialog(props));
 props={...props,open:true,editingTemplate:b};dialog=await h.settle(()=>m.QuickReplyDialog(props));
 assert.equal(dialog.formData.title,'Draft A');await dialog.handleSubmit();
 assert.equal(updates.at(-1).id,'template-B');assert.equal(updates.at(-1).data.content,'Text intended for A');
 const parent=source(managerPath);assert.match(parent,/<QuickReplyDialog\s+open=\{showCreateDialog \|\| !!editingTemplate\}/);assert.match(parent,/onEdit=\{\(t\) => setEditingTemplate\(t\)\}/);
 assert.ok(source('src/components/settings/SettingsView.tsx').includes('<QuickRepliesManager compact={false} />'));
 const fresh=new Hooks();const freshM=load(dialogPath,['QuickReplyDialog'],fresh.deps(),prefixFunction(dialogPath,'export function QuickReplyDialog','  return (','formData'));
 const control=fresh.render(()=>freshM.QuickReplyDialog({...props,editingTemplate:b}));assert.equal(control.formData.title,'Original B');
 record('quick_reply_dialog_stale_target','Editar B reutiliza o formulário de A; primeira edição após montagem vazia abre sem o registro',{firstEditInitiallyBlank:true,updates,remountedControlTitle:control.formData.title},'Estado/hooks reais sem DOM; props seguem o pai persistente atual, verificado no TSX. Banco não chamado; o efeito provado é ID B receber payload de A no callback de atualização.');
}

// P5.2: normalization destroys the only character required by the group classifier.
{
 const p='src/components/inbox/ContactTypeFilter.tsx';
 const names=['Users','MessageSquare','UsersRound','FileText','ShieldCheck','ClipboardList','Handshake','UserCheck','Truck','Wrench'];
 const icons=Object.fromEntries(names.map(n=>[n,()=>null]));
 const code=excerpt(p,'const isGroup =','// Separators go')+source(p).slice(source(p).indexOf('export function filterByContactType('));
 const m=load(p,['isGroup','FILTER_OPTIONS','filterByContactType'],icons,code);
 const conversations=[{contact:{id:'group',phone:'12345-67890',group_category:'orcamentos',contact_type:'cliente'}},{contact:{id:'person',phone:'5511999999999',contact_type:'cliente'}}];
 const groups=m.filterByContactType(conversations,'grupo'),individuals=m.filterByContactType(conversations,'individual');
 assert.equal(groups.length,0);assert.equal(individuals.length,2);assert.equal(m.isGroup('12345-67890'),false);
 const all=m.filterByContactType(conversations,'all');assert.equal(all.length,2);
 const groupCounts=m.FILTER_OPTIONS.filter(x=>x.value.startsWith('grupo')).map(x=>({filter:x.value,count:conversations.filter(x.match).length}));assert.ok(groupCounts.every(x=>x.count===0));
 assert.ok(source('src/hooks/inbox/useInboxFilters.ts').includes('filterByContactType(result, selectedContactType)'));
 record('group_filter_removes_required_hyphen','Filtro de grupos rejeita até o formato que sua própria regex espera e inclui grupo em individuais',{groupCounts,individualIds:individuals.map(x=>x.contact.id),allControl:all.length},'Predicado, opções e função de filtro reais; fixture explicita um grupo já presente na lista. Não depende de dados/quantidade de grupos produtivos.');
}

// P5.3: two UI consumers compare a profile FK with auth user.id.
{
 const p='src/components/inbox/conversation-list/StatusChips.tsx';
 const conversation={contact:{id:'contact-1',assigned_to:'profile-1'},messages:[{id:'message-1'}],unreadCount:0};
 function countsFor(userId){const h=new Hooks();const m=load(p,['StatusChips'],{...h.deps(),useAuth:()=>({user:{id:userId}})},prefixFunction(p,'export function StatusChips','  const chips:','counts'));return h.render(()=>m.StatusChips({conversations:[conversation],chipTab:'attending',onChipTabChange(){}})).counts;}
 const p2='src/components/inbox/VirtualizedRealtimeList.tsx';
 const parentId=excerpt(p2,'  const { user } = useAuth();','  const agentsMap =');
 const row=excerpt(p2,'  const assignedToId =','  // conversation_sla');
 const badge=load(p2,['assigned'],{},`function assigned(conversation,useAuth,agentsMap){${parentId}${row}\nreturn assignedAgent;}`);
 const map=new Map([['profile-1',{id:'profile-1',name:'Self agent'}]]);
 const mismatch=countsFor('auth-1'),control=countsFor('profile-1');
 const selfBadge=badge.assigned(conversation,()=>({user:{id:'auth-1'}}),map);
 assert.equal(mismatch.attending,0);assert.equal(control.attending,1);assert.equal(selfBadge.name,'Self agent');
 assert.equal(badge.assigned(conversation,()=>({user:{id:'profile-1'}}),map),null);
 assert.ok(source('src/hooks/inbox/useInboxFilters.ts').includes('c.contact.assigned_to === profileId'));
 assert.ok(source('src/components/inbox/RealtimeInboxView.tsx').includes('profileId: inbox.profile?.id'));
 const test=source('src/components/inbox/__tests__/StatusChips.test.tsx');assert.ok(test.includes("user: { id: 'user-1' }"));assert.ok(test.includes("assigned_to: 'user-1'"));
 record('status_chip_uses_auth_id_for_profile_fk','Contato próprio fica com contador zero quando auth.id difere de profile.id; badge de outro atendente inclui o próprio',{mismatchedIdentityCounts:mismatch,identicalIdentityControl:control,selfBadgeRenderedByRowCondition:!!selfBadge},'Contagem e condição de badge reais; não demonstra dados produtivos. Fixture separa identidades que os testes existentes igualam; filtro ativo usa profileId conforme contrato.');
}

function pickerHarness({permission=Promise.resolve(),onSendAudio=()=>{},events=[]}={}) {
 const h=new Hooks(),tracks=[{stops:0,stop(){this.stops++;}}],recorders=[],objects=[];
 const stream={getTracks:()=>tracks};
 class Recorder {state='inactive';constructor(s){this.stream=s;recorders.push(this);}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['recording'])});this.onstop?.();}}
 const m=load(pickerPath,['VoiceChangerPicker'],{
  ...h.deps(),navigator:{mediaDevices:{getUserMedia:async()=>{await permission;return stream;}}},MediaRecorder:Recorder,URL:localUrl,Audio:FakeAudio,attachMediaVolume:()=>()=>{},toast:makeToast(events,'picker'),fetch:async()=>({ok:true,blob:async()=>new Blob(['converted'])}),
  supabase:{storage:{from:bucket=>({upload:async objectPath=>{objects.push({bucket,path:objectPath});return{error:null};},getPublicUrl:objectPath=>({data:{publicUrl:`https://fixture.invalid/storage/v1/object/public/audio-memes/${objectPath}`}})})}},
 },prefixFunction(pickerPath,'export function VoiceChangerPicker','  return (','open,isRecording,transformedUrl,recordedBlob,setTransformedUrl,setOpen,startRecording,stopRecording,cleanup,handleSend',`\n`));
 const render=()=>m.VoiceChangerPicker({onSendAudio});
 return{h,render,tracks,recorders,objects,events};
}

// P5.4/5: unmount and pending permission are different lifecycle boundaries of the same recorder.
{
 const f=pickerHarness();let view=await f.h.settle(f.render);view.setOpen(true);view=await f.h.settle(f.render);await view.startRecording();view=await f.h.settle(f.render);
 assert.equal(view.isRecording,true);assert.equal(f.recorders.length,1);f.h.unmount();assert.equal(f.tracks[0].stops,0);assert.equal(f.recorders[0].state,'recording');
 const beforeCleanup=f.tracks[0].stops;view.cleanup();assert.equal(f.tracks[0].stops,1);
 assert.equal(source(pickerPath).includes('useEffect'),false);
 assert.match(source('src/components/inbox/RealtimeInboxView.tsx'),/key=\{inbox\.legacyConversation\.id\}|key=\{legacyConversation\.id\}/);
 record('voice_picker_unmount_keeps_stream','Desmontagem do VoiceChangerPicker não aciona a limpeza que para tracks',{stopCallsAfterUnmount:beforeCleanup,recordingAfterUnmount:true,explicitCleanupControlStops:f.tracks[0].stops},'MediaRecorder e tracks sintéticos; corpo real do componente sem efeito de desmontagem. Não abre microfone físico. A remontagem keyed no consumidor elimina o componente sem chamar seu onOpenChange.');
}
{
 const pending=deferred(),f=pickerHarness({permission:pending.promise});let view=await f.h.settle(f.render);view.setOpen(true);view=await f.h.settle(f.render);const starting=view.startRecording();
 const raw=source(pickerPath),match=raw.match(/onOpenChange=\{(\(v\) => \{ setOpen\(v\); if \(!v\) cleanup\(\); \})\}/);assert.ok(match);
 const close=load(pickerPath,['close'],{setOpen:view.setOpen,cleanup:view.cleanup},`const close=${match[1]};`);close.close(false);
 pending.resolve();await starting;view=await f.h.settle(f.render);
 assert.equal(view.open,false);assert.equal(view.isRecording,true);assert.equal(f.tracks[0].stops,0);assert.equal(f.recorders.length,1);
 record('voice_picker_permission_resolves_after_close','Permissão simulada concedida após fechar inicia gravação com popover fechado',{popoverOpen:view.open,isRecording:view.isRecording,recordersStarted:f.recorders.length,trackStops:f.tracks[0].stops},'Callback onOpenChange extraído literalmente do TSX; getUserMedia é promessa controlada. Prova de ordem de operações, sem teste de permissão/driver físico.');view.cleanup();
}

// P5.6: generated TTS is discarded before the parent finishes sending.
{
 const pending=deferred(),events=[],h=new Hooks();let deliverySettled=false;
 const parentPath='src/components/inbox/chat/useChatPanelHandlers.ts';
 const parent=load(parentPath,['handleAudioSend'],{useCallback:fn=>fn,log:silentLog,toast:x=>events.push(['parent','error',x.title]),setIsRecordingAudio(){}},excerpt(parentPath,'  const handleAudioSend =','  return {'));
 const m=load(textAudioPath,['TextToAudioButton'],{...h.deps(),SUPABASE_URL:providerUrl,edgeAuthHeaders:async()=>({}),URL:localUrl,Audio:FakeAudio,attachMediaVolume:()=>()=>{},toast:makeToast(events,'tts'),fetch:async()=>({ok:true,blob:async()=>new Blob(['generated'])})},prefixFunction(textAudioPath,'export function TextToAudioButton','  const togglePlayback =','open,convertedBlob,convertedUrl,setOpen,handleConvert,handleSendAudio'));
 const render=()=>m.TextToAudioButton({inputValue:'fixture speech',onAudioReady:blob=>parent.handleAudioSend(blob,async()=>{events.push(['parent','begin']);try{await pending.promise;}finally{deliverySettled=true;}})});
 let view=await h.settle(render);view.setOpen(true);view=await h.settle(render);await view.handleConvert({id:'voice-fixture',name:'Fixture'});view=await h.settle(render);assert.ok(view.convertedBlob);
 view.handleSendAudio();view=await h.settle(render);assert.equal(deliverySettled,false);assert.equal(view.open,false);assert.equal(view.convertedBlob,null);assert.ok(events.some(x=>x[0]==='tts'&&x[1]==='success'&&x[2]==='Áudio enviado!'));
 const before=[...events];pending.reject(Error('fixture outbound failure'));await flush();assert.equal(deliverySettled,true);assert.ok(events.some(x=>x[0]==='parent'&&x[1]==='error'));
 assert.ok(source('src/components/inbox/chat/ChatInputToolbars.tsx').includes('<TextToAudioButton inputValue={inputValue} onAudioReady={onAudioSend} />'));
 record('generated_tts_send_before_outbound','TTS fecha e descarta blob com sucesso antes de o envio falhar no pai',{eventsBeforeDeliverySettled:before,eventsAfterFailure:events,convertedBlobRetained:false},'Conversão/fetch/player e envio simulados; handlers reais da UI e pai. Texto original pode continuar no editor; perda provada é a prévia de áudio gerada, sem afirmar entrega ao provedor.');
}

// P5.7: transformed voice also resolves its UI before the canonical send callback.
{
 const pending=deferred(),events=[];let outboundSettled=false;
 const p='src/components/inbox/useChatMediaSending.ts';
 const sender=load(p,['handleSendAudioMeme'],{useCallback:fn=>fn,ensureInstance:async()=>'fixture-instance',normalizeMediaUrl:x=>x,contactId:'fixture-contact',sendOutboundMessage:async()=>{events.push(['outbound','begin']);try{await pending.promise;}finally{outboundSettled=true;}},toast:x=>events.push(['parent',x.variant==='destructive'?'error':'success',x.title])},excerpt(p,'  const handleSendAudioMeme =','  return {'));
 const f=pickerHarness({onSendAudio:sender.handleSendAudioMeme,events});let view=await f.h.settle(f.render);view.setOpen(true);view.setTransformedUrl('blob:fixture-converted');view=await f.h.settle(f.render);
 await view.handleSend();view=await f.h.settle(f.render);assert.equal(outboundSettled,false);assert.equal(view.open,false);assert.equal(view.transformedUrl,null);assert.equal(f.objects.length,1);assert.ok(events.some(x=>x[0]==='picker'&&x[1]==='success'));
 const before=[...events];pending.reject(Error('fixture pre-enqueue rejection'));await flush();assert.ok(events.some(x=>x[0]==='parent'&&x[1]==='error'));
 assert.ok(source('src/components/inbox/chat/ChatInputToolbars.tsx').includes('<VoiceChangerPicker onSendAudio={onSendAudioMeme} />'));
 record('transformed_voice_send_before_outbound','Voz transformada limpa prévia e confirma envio enquanto sendOutboundMessage ainda está pendente',{eventsBeforeOutboundSettled:before,eventsAfterFailure:events,uploadedObjects:f.objects.length,previewRetained:false},'Storage/fetch e transporte simulados; callback normalizador tratado como identidade nesta prova, pois não é o contrato sob teste. Não afirma objeto órfão em toda rejeição incerta do provedor.');
}

function resolverFor(h,calls) {
 return load('src/hooks/storage/useResolvedStorageUrl.ts',['useResolvedStorageUrl'],{...h.deps(),...refs,SUPABASE_URL:providerUrl,supabase:{storage:{from:bucket=>({createSignedUrl:async objectPath=>{calls.push({bucket,path:objectPath});return{data:{signedUrl:`https://fixture.invalid/storage/v1/object/sign/${bucket}/${objectPath}?token=fresh-fixture`},error:null};}})}}}).useResolvedStorageUrl;
}
// P5.8: the batch path supplies signedUrl, disabling the hook expected to refresh it.
{
 const p='src/hooks/chat/useContactMedia.ts',batchCalls=[];
 const batch=load(p,['signInBatch'],{...refs,STORAGE_ORIGINS:[providerUrl],SIGNED_URL_TTL_SECONDS:3600,supabase:{storage:{from:bucket=>({createSignedUrls:async(paths,ttl)=>{batchCalls.push({bucket,paths,ttl});return{data:paths.map(path=>({path,signedUrl:`https://fixture.invalid/storage/v1/object/sign/${bucket}/${path}?token=expired-fixture`})),error:null};}})}}},excerpt(p,'async function signInBatch(','interface MediaRow'));
 const base={id:'image-A',type:'image',url:'https://fixture.invalid/storage/v1/object/public/whatsapp-media/contact/a.png',displayName:'A'};
 const signed=await batch.signInBatch([base]),item={...base,...signed.get(base.id)};assert.ok(item.signedUrl);assert.equal(batchCalls[0].ttl,3600);
 function thumbHarness(input){const h=new Hooks(),calls=[];const m=load(thumbPath,['ThumbImage'],{...h.deps(),useResolvedStorageUrl:resolverFor(h,calls)},prefixFunction(thumbPath,'function ThumbImage(','  if (isLoading && !src)','src,failed,isLoading,onError',`\nconst onError=${imageErrorCallback(thumbPath,'function ThumbImage(')};\n`));return{h,calls,render:()=>m.ThumbImage({item:input,size:'row'})};}
 const f=thumbHarness(item);let view=await f.h.settle(f.render);view.onError();view=await f.h.settle(f.render);assert.equal(f.calls.length,0);assert.equal(view.failed,true);assert.equal(view.src,item.signedUrl);
 const c=thumbHarness(base);let control=await c.h.settle(c.render);assert.equal(c.calls.length,1);control.onError();control=await c.h.settle(c.render);assert.equal(c.calls.length,2);assert.equal(control.failed,false);
 const tests=source('src/components/inbox/tabs/__tests__/FileThumb.test.tsx');assert.ok(tests.includes('useResolvedStorageUrl: () => hooks.current'));
 record('batch_signed_thumbnail_cannot_refresh','Imagem que já recebeu assinatura em lote chama refresh de source vazio e permanece indisponível',{batch:batchCalls,failedBatchThumb:{signCalls:f.calls.length,failed:view.failed,srcUnchanged:view.src===item.signedUrl},individualFallbackControl:{signCalls:c.calls.length,failed:control.failed}},'Assinador em lote, hook de resolução e estado/callback ThumbImage reais. Falha de imagem injetada modela assinatura expirada/invalidada; nenhum HTTP real. O teste existente simula resolver sem conferir seu argumento.');
}

// P5.9: detail error is not keyed by item, unlike ThumbImage.failedSrc.
{
 const h=new Hooks(),calls=[];let item={id:'A',type:'image',url:'https://fixture.invalid/a.png',displayName:'A',filename:'a.png'};
 const raw=source(detailPath),errorExpr=raw.match(/onError=\{(\(\) => \{ setHasError\(true\); void refresh\(\); \})\}/);assert.ok(errorExpr);
 const snippet=prefixFunction(detailPath,'export function FileDetailContent(','  return (','hasError,displayUrl,onError',`\nconst onError=${errorExpr[1]};\n`);
 const m=load(detailPath,['FileDetailContent'],{...h.deps(),useResolvedStorageUrl:resolverFor(h,calls),formatSize:()=>null},snippet);
 const render=()=>m.FileDetailContent({item,contactName:'Fixture',onClose(){},onRequestDelete(){}});
 let view=await h.settle(render);assert.equal(view.hasError,false);view.onError();view=await h.settle(render);assert.equal(view.hasError,true);
 item={...item,id:'B',url:'https://fixture.invalid/b.png',displayName:'B',filename:'b.png'};view=await h.settle(render);assert.equal(view.displayUrl,item.url);assert.equal(view.hasError,true);
 const parent=source('src/components/inbox/tabs/FilesTab.tsx');assert.ok(parent.includes('<FileDetailPanel {...detailProps} />'));assert.ok(parent.includes('<FileDetailContent {...detailProps} />'));assert.ok(raw.includes("item.type === 'image' && !hasError && displayUrl"));
 const fresh=new Hooks(),freshM=load(detailPath,['FileDetailContent'],{...fresh.deps(),useResolvedStorageUrl:resolverFor(fresh,[]),formatSize:()=>null},snippet);const control=await fresh.settle(()=>freshM.FileDetailContent({item,contactName:'Fixture'}));assert.equal(control.hasError,false);
 record('file_detail_error_persists_into_next_item','Erro de imagem A mantém placeholder quando detalhes passam para B com URL válida',{afterSwitch:{itemId:item.id,displayUrl:view.displayUrl,hasError:view.hasError,imageBranchAvailable:!view.hasError&&!!view.displayUrl},remountControlHasError:control.hasError},'Estado e onError reais; FilesTab preserva instância sem key ao trocar selected. Não é o refresh A→B de INB-033 e não depende de URL assinada. Nenhum DOM/HTTP real.');
}

// P5.10: conditional ChatPanel mount omits sendWhisper's target; no opening action established.
{
 const p='src/components/inbox/WhisperMode.tsx',inserted=[],h=new Hooks();
 const channel={on(){return this;},subscribe(){return this;}};
 const m=load(p,['WhisperMode'],{...h.deps(),useAuth:()=>({profile:{id:'supervisor-1',role:'supervisor'}}),useQueryClient:()=>({invalidateQueries(){}}),useQuery:()=>({data:[]}),supabase:{channel:()=>channel,removeChannel(){},from:()=>({insert:async payload=>{inserted.push({...payload});return{error:null};}})}},prefixFunction(p,'export function WhisperMode(','  if (!isSupervisor','message,setMessage,sendWhisper'));
 let props={contactId:'contact-1'};let view=await h.settle(()=>m.WhisperMode(props));view.setMessage('Fixture coaching');view=await h.settle(()=>m.WhisperMode(props));await view.sendWhisper();view=await h.settle(()=>m.WhisperMode(props));assert.equal(inserted.length,0);assert.equal(view.message,'Fixture coaching');
 const parent=source('src/components/inbox/ChatPanel.tsx'),invocation=parent.match(/<WhisperMode\s+[^>]+\/>/);assert.ok(invocation);assert.equal(invocation[0].includes('targetAgentId'),false);
 props={...props,targetAgentId:'agent-1'};view=await h.settle(()=>m.WhisperMode(props));await view.sendWhisper();assert.equal(inserted.length,1);assert.equal(inserted[0].target_agent_id,'agent-1');
 record('whisper_conditional_consumer_omits_target','Se montado com as props condicionais de ChatPanel, Sussurro retorna antes do INSERT por falta de targetAgentId',{conditionalMountInsertCalls:0,draftRetained:true,explicitTargetControlInsert:inserted[0]},'Contrato condicional, sem finding de jornada ativa: ChatPanel inicia whisper=false e a leitura dos comandos/ações não estabeleceu uma abertura desse estado. Hook state/handler reais com query/realtime/DB locais; nenhum envio a pessoa, INSERT apenas em array de fixture.');
}

// P5.11: failed SELECT is converted into editable defaults, and Save writes every field.
{
 const p='src/components/inbox/LeadRiskScorePanel.tsx';
 async function scenario(readFails){const h=new Hooks(),writes=[],row={lead_score:85,risk_score:35,lead_origin:'website',consent_status:'granted'};const m=load(p,['LeadRiskScorePanel'],{...h.deps(),toast:makeToast([]),supabase:{from:()=>({select:()=>({eq:()=>({single:async()=>readFails?{data:null,error:{message:'fixture temporary read failure'}}:{data:{...row},error:null}})}),update:payload=>({eq:async()=>{writes.push({...payload});Object.assign(row,payload);return{error:null};}})})}},prefixFunction(p,'export function LeadRiskScorePanel(','  if (!loaded)','loaded,leadScore,riskScore,leadOrigin,consentStatus,setLeadOrigin,save'));
 const render=()=>m.LeadRiskScorePanel({contactId:'contact-1'});let view=await h.settle(render);assert.equal(view.loaded,true);view.setLeadOrigin('referral');view=await h.settle(render);await view.save();return{writes,row};}
 const failed=await scenario(true),control=await scenario(false);
 assert.equal(failed.row.lead_score,0);assert.equal(failed.row.risk_score,0);assert.equal(failed.row.consent_status,null);assert.equal(failed.row.lead_origin,'referral');assert.equal(control.row.lead_score,85);assert.equal(control.row.consent_status,'granted');
 assert.ok(source('src/components/inbox/contact-details/ContactAccordionSections.tsx').includes('<LeadRiskScorePanel contactId={contact.id} />'));
 record('lead_score_failed_load_writes_defaults','Depois de SELECT falhar, editar só origem e salvar sobrescreve scores/consentimento com defaults',{failedReadThenAuthorizedWrite:failed,successfulReadControl:control},'Consulta/mutation e estado reais; banco é modelo local com escrita autorizada. Pré-condição: falha transitória de leitura e recuperação no save do mesmo contato; não há alegação de mistura entre contatos keyed.');
}

// P5.12: Recentes is state-only in the shared sticker manager.
{
 const p='src/components/inbox/stickers/StickerManager.tsx',h=new Hooks();
 const fixtures=[{id:'older-popular',name:'Popular',use_count:20,is_favorite:false,category:'outros'},{id:'new-unused',name:'Novo',use_count:0,is_favorite:false,category:'outros'}];
 const m=load(p,['StickerManager'],{...h.deps(),useQueryClient:()=>({invalidateQueries(){}}),useQuery:()=>({data:fixtures,isLoading:false}),useMutation:x=>x},prefixFunction(p,'export function StickerManager(','\n  return (\n    <div className="space-y-4">','showRecent,setShowRecent,filteredStickers'));
 let view=await h.settle(()=>m.StickerManager({}));const before=view.filteredStickers.map(x=>x.id);view.setShowRecent(true);view=await h.settle(()=>m.StickerManager({}));assert.equal(view.showRecent,true);assert.deepEqual(view.filteredStickers.map(x=>x.id),before);
 const raw=source(p);assert.ok(raw.includes('onToggleRecent={() => setShowRecent(!showRecent)}'));assert.ok(raw.includes('stickers={filteredStickers}'));
 record('sticker_manager_recent_toggle_no_effect','Controle Recentes muda estado visual sem alterar itens, ordem ou consulta',{before,after:view.filteredStickers.map(x=>x.id),showRecent:view.showRecent},'Estado/filter useMemo e wiring TSX reais; query é fixture. Não afirma que o picker principal de stickers tenha a mesma falha: é o administrador de figurinhas compartilhadas.');
}

// P5.13: Settings manager has no selection callback or clipboard call in its main card handler.
{
 const p=managerPath,events=[],uses=[],writes=[];
 const m=load(p,['handleSelect','handleCopy'],{incrementUseCount:id=>uses.push(id),onSelect:undefined,toast:makeToast(events),navigator:{clipboard:{writeText:async x=>writes.push(x)}}},excerpt(p,'  const handleSelect =','  const displayedTemplates ='));
 m.handleSelect({id:'reply-1',content:'Fixture quick reply'});assert.equal(writes.length,0);assert.equal(events.at(-1)[2],'Resposta copiada!');
 m.handleCopy('Fixture quick reply');assert.equal(writes.length,1);assert.ok(source('src/components/settings/SettingsView.tsx').includes('<QuickRepliesManager compact={false} />'));
 record('quick_reply_card_reports_copy_without_clipboard','Clique no card de resposta rápida em Configurações anuncia cópia sem escrever no clipboard',{copyWritesAfterCard:0,successAfterCard:events[0],explicitCopyControlWrites:writes.length,useCountCalls:uses.length},'Handlers reais e contrato Settings sem onSelect; clipboard é array local. O botão específico Copiar funciona como controle e não é incluído na falha.');
}

// P5.14 is additional evidence of existing INB-009, not a new counted finding.
{
 const p='src/components/inbox/RealtimeCollaboration.tsx',events=[],operations=[];
 const db={from:table=>({update:payload=>({eq:async(field,id)=>{operations.push({table,payload,field,id});return{error:{message:'fixture rejected transfer'}};}})})};
 const parent=load(p,['handleHandoff'],{supabase:db,contactId:'fixture-contact'},excerpt(p,'  const handleHandoff =','  return ('));
 const dialog='src/components/inbox/collaboration/HandoffDialog.tsx';
 const m=load(dialog,['handleSubmit'],{selectedAgent:'target-agent',comment:'',onHandoff:parent.handleHandoff,onOpenChange:v=>events.push(['open',v]),setIsSubmitting(){},setSelectedAgent(){},setComment(){},toast:makeToast(events)},excerpt(dialog,'  const handleSubmit =','  return ('));
 await m.handleSubmit();assert.equal(operations.length,1);assert.ok(events.some(x=>x[1]==='success'));
 assert.ok(source('src/components/inbox/contact-details/ContactActionButtons.tsx').includes('<RealtimeCollaboration contactId={contact.id} />'));
 record('collaboration_handoff_error_variant','Rota Adicionar participante → Transferir anuncia sucesso após UPDATE devolver error',{operations,events},'Extensão de evidência do contrato INB-009, preservado literalmente. Callback/pai reais; não executa transferência, lookup Auth ou nota (comment vazio).');
}

// P5.15: active sentiment notifications expose actions without a conversation navigation contract.
{
 const localPath='src/hooks/inbox/useSentimentAlerts.ts',realtimePath='src/hooks/inbox/useRealtimeSentimentAlerts.ts';
 const settings={sentimentAlertEnabled:true,soundEnabled:false,browserNotifications:false};
 const notices=[],debug=[],queried=[];
 const toast={error:(title,options)=>notices.push({title,options})};
 const common={toast,useNotificationSettings:()=>({settings,isQuietHours:()=>false}),claimNotificationEvent:()=>true,playNotificationSound(){throw Error('unexpected sound');},requestNotificationPermission(){throw Error('unexpected permission');},showBrowserNotification(){throw Error('unexpected browser notification');},log:{...silentLog,debug:(...args)=>debug.push(args)}};
 const h=new Hooks(),m=load(localPath,['useSentimentAlerts'],{...common,...h.deps(),supabase:{functions:{invoke:async()=>({data:{alerted:true,notifyCaller:true,consecutiveLow:3},error:null})}}});
 const local=await h.settle(()=>m.useSentimentAlerts());
 await local.checkAndTriggerAlert({contactId:'fixture-contact',contactName:'Fixture',sentimentScore:12,analysisId:'fixture-analysis'});
 const localAction=notices.at(-1).options.action;assert.equal(localAction.label,'Ver conversa');const before=debug.length;localAction.onClick();assert.equal(debug.length,before+1);assert.equal(debug.at(-1)[1],'fixture-contact');
 let deliver;const channel={on(_kind,_filter,callback){deliver=callback;return this;},subscribe(){return this;}};
 let target=null,targetClicks=0;
 const rh=new Hooks(),rm=load(realtimePath,['useRealtimeSentimentAlerts'],{...common,...rh.deps(),useAuth:()=>({user:{id:'fixture-user'}}),uniqueRealtimeTopic:x=>x,normalizeScore:x=>({value:x}),getLogger:()=>common.log,document:{querySelector:selector=>{queried.push(selector);return target;}},supabase:{channel:()=>channel,removeChannel(){}}});
 await rh.settle(()=>rm.useRealtimeSentimentAlerts());deliver({new:{id:'fixture-notification',type:'sentiment_alert',metadata:{contact_id:'fixture-contact',contact_name:'Fixture',analysis_id:'fixture-analysis',sentiment_score:12,consecutive_low:3}}});await flush();
 const realtimeAction=notices.at(-1).options.action;assert.equal(realtimeAction.label,'Ver detalhes');realtimeAction.onClick();assert.equal(targetClicks,0);assert.equal(queried.at(-1),'[value="ai"]');
 target={click(){targetClicks++;}};realtimeAction.onClick();assert.equal(targetClicks,1);rh.unmount();
 assert.ok(source('src/App.tsx').includes('<RealtimeSentimentAlertProvider />'));
 assert.ok(source('src/pages/ViewRouter.tsx').includes("'inbox': Views.RealtimeInboxView"));
 assert.ok(source('src/components/dashboard/DashboardView.tsx').includes("{ value: 'ai',"));
 assert.ok(source('src/components/inbox/AIConversationAssistant.tsx').includes('await checkAndTriggerAlert({'));
 record('sentiment_actions_without_conversation_navigation','Ver conversa apenas loga; Ver detalhes depende de elemento da aba IA sem rota alternativa',{localAction:localAction.label,localActionEffect:debug.at(-1),withoutMatchingElementClicks:0,matchingElementControlClicks:targetClicks,selectors:queried},'Hooks e handlers reais; DOM é uma fronteira mínima, sem render Radix. Dashboard define ai dinamicamente, portanto não se alega ausência universal do alvo nem falha de um botão real no Dashboard. A variante global exige tela sem elemento correspondente; a local não navega em nenhuma ramificação do handler. Nenhum alerta/mensagem/serviço real.');
}

fs.writeFileSync(resultPath,JSON.stringify({source_sha:observedHead,integrity,engine:process.version,no_network:true,method:'Quinta passagem: consumidores Inbox e chat, TypeScript/TSX extraídos com estado, mídia e SDK sintéticos; nenhuma operação real.',source_blob_hashes:hashes,results},null,2)+'\n');
console.log(JSON.stringify({probes:results.length,allAssertionsPassed:true,ids:results.map(x=>x.id)},null,2));
