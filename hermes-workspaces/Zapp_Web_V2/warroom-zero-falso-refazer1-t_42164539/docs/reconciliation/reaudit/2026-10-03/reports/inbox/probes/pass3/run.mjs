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
function audioKit(){
 const elements=[],subscriptions=new Set();
 class AudioStub {
  constructor(src=''){this.src=src;this.volume=1;this.muted=false;this.currentTime=0;this.paused=true;this.events=new Map();this.pauseCalls=0;elements.push(this);}
  addEventListener(name,fn){const values=this.events.get(name)||new Set();values.add(fn);this.events.set(name,values);}
  removeEventListener(name,fn){this.events.get(name)?.delete(fn);}
  emit(name){for(const fn of this.events.get(name)||[])fn();this['on'+name]?.();}
  async play(){this.paused=false;this.emit('play');}
  pause(){this.pauseCalls++;this.paused=true;}
  removeAttribute(name){if(name==='src')this.src='';}
  load(){}
 }
 const media=load('src/lib/mediaVolumeElement.ts',['attachMediaVolume','bindMediaVolume','applyMediaVolume','applyMediaVolumeGain'],{
  document:{createElement:()=>new AudioStub()},subscribe:fn=>{subscriptions.add(fn);return()=>subscriptions.delete(fn);},
  getSnapshot:()=>({volume:50,muted:false}),toGain:n=>(n/100)**2,
 });
 return{AudioStub,elements,subscriptions,...media};
}

// P3.1: the real TTS hook receives its delayed audio after the component has gone.
{
 const h=new Hooks(),audio=audioKit(),request=deferred(),revoked=[];
 let created=0;
 const m=load('src/hooks/communication/useTextToSpeech.ts',['useTextToSpeech'],{
  ...h.deps(),Audio:audio.AudioStub,attachMediaVolume:audio.attachMediaVolume,SUPABASE_URL:'https://fixture.invalid',
  edgeAuthHeaders:async()=>({}),fetch:()=>request.promise,toast:{error(){}},
  URL:{createObjectURL:()=>`blob:fixture-${++created}`,revokeObjectURL:url=>revoked.push(url)},
 });
 const render=()=>m.useTextToSpeech();let hook=await h.settle(render);
 const pending=hook.speak('Texto da conversa anterior','m1');await flush();
 hook=await h.settle(render);assert.equal(hook.isLoading,true);
 h.unmount();
 request.resolve({ok:true,blob:async()=>new Blob(['fixture'])});await pending;
 const player=audio.elements.find(e=>e.src==='blob:fixture-1');
 assert.ok(player);assert.equal(player.paused,false);assert.equal(revoked.length,0);
 record('tts_starts_after_unmount','Resposta TTS atrasada cria e toca áudio depois do unmount',{createdAfterUnmount:created,playbackActive:!player.paused,urlRevoked:false,storeSubscriptions:audio.subscriptions.size},'Hook e binding de volume reais; Audio/fetch/hooks simulados. Demonstra ausência de cancelamento, não audibilidade/autoplay real; ChatPanel é desmontado ao trocar de contato.');
}

// P3.2: calling stop while speech is still being fetched does not invalidate it.
{
 const h=new Hooks(),audio=audioKit(),request=deferred();
 const m=load('src/hooks/communication/useTextToSpeech.ts',['useTextToSpeech'],{
  ...h.deps(),Audio:audio.AudioStub,attachMediaVolume:audio.attachMediaVolume,SUPABASE_URL:'https://fixture.invalid',
  edgeAuthHeaders:async()=>({}),fetch:()=>request.promise,toast:{error(){}},URL:{createObjectURL:()=> 'blob:after-stop',revokeObjectURL(){}},
 });
 const render=()=>m.useTextToSpeech();let hook=await h.settle(render);
 const pending=hook.speak('Texto interrompido','m1');await flush();hook=await h.settle(render);
 hook.stop();hook=await h.settle(render);assert.equal(hook.currentMessageId,null);
 request.resolve({ok:true,blob:async()=>new Blob(['fixture'])});await pending;hook=await h.settle(render);
 assert.equal(hook.isPlaying,true);assert.equal(hook.currentMessageId,null);
 record('tts_stop_does_not_cancel_request','stop durante fetch é seguido por áudio ativo sem currentMessageId',{isPlaying:hook.isPlaying,currentMessageId:hook.currentMessageId},'stop e speak reais; fronteiras simuladas. A UI expõe stop apenas durante reprodução, mas iniciar outro speak também usa esse mesmo stop sem cancelar o pedido anterior.');
}

// P3.3: stopped imperative players never call the detach returned by the real binding.
{
 const h=new Hooks(),audio=audioKit(),requests=[];
 const m=load('src/hooks/communication/useTextToSpeech.ts',['useTextToSpeech'],{
  ...h.deps(),Audio:audio.AudioStub,attachMediaVolume:audio.attachMediaVolume,SUPABASE_URL:'https://fixture.invalid',
  edgeAuthHeaders:async()=>({}),fetch:()=>{const d=deferred();requests.push(d);return d.promise;},toast:{error(){}},
  URL:{createObjectURL:()=>`blob:duplicate-${requests.filter(x=>x.finished).length}`,revokeObjectURL(){}},
 });
 const render=()=>m.useTextToSpeech();let hook=await h.settle(render);
 const pendingA=hook.speak('Texto repetido','m1');await flush();hook=await h.settle(render);
 const p='src/components/inbox/TextToSpeechButton.tsx';const code=source(p);
 assert.ok(code.includes('disabled={isLoading && currentMessageId !== messageId}'));
 assert.equal(hook.isLoading&&hook.currentMessageId!=='m1',false);
 let pendingB;
 const button=load(p,['handleClick'],{isThisPlaying:false,text:'Texto repetido',messageId:'m1',onSpeak:(...args)=>{pendingB=hook.speak(...args);},onStop:hook.stop},excerpt(p,'const handleClick = () => {',"  // Don't show for empty"));
 button.handleClick();await flush();assert.equal(requests.length,2);
 requests[1].finished=true;requests[1].resolve({ok:true,blob:async()=>new Blob(['b'])});await pendingB;
 requests[0].finished=true;requests[0].resolve({ok:true,blob:async()=>new Blob(['a'])});await pendingA;
 const playing=audio.elements.filter(x=>x.src.startsWith('blob:duplicate')&&!x.paused);assert.equal(playing.length,2);
 record('tts_loading_button_starts_duplicate','O botão da mensagem em loading aceita outro clique e as duas respostas tocam',{parallelRequests:requests.length,simultaneousPlayers:playing.length,loadingButtonDisabled:false},'Hook e handleClick reais; expressão disabled verificada no TSX fixado. Fronteiras simuladas, sem montagem DOM/autoplay real. Diferente de clicar outra mensagem, cujo botão está desabilitado durante loading.');
}

// P3.3: stopped imperative players never call the detach returned by the real binding.
{
 const h=new Hooks(),audio=audioKit();
 const m=load('src/hooks/communication/useAudioMemes.ts',['useAudioMemes'],{...h.deps(),Audio:audio.AudioStub,attachMediaVolume:audio.attachMediaVolume,supabase:{},toast:{}});
 const render=()=>m.useAudioMemes(false);let hook=await h.settle(render);
 const meme={id:'m1',audio_url:'https://fixture.invalid/meme.mp3'};
 hook.handlePreview(meme);hook=await h.settle(render);assert.equal(audio.subscriptions.size,1);
 hook.handlePreview(meme);hook=await h.settle(render);assert.equal(hook.playingId,null);assert.equal(audio.subscriptions.size,1);
 hook.handlePreview({...meme,id:'m2'});hook=await h.settle(render);hook.cleanup();h.unmount();
 const pausedMemesRetained=audio.subscriptions.size;assert.equal(pausedMemesRetained,2);
 const ht=new Hooks();
 const t=load('src/hooks/communication/useTextToSpeech.ts',['useTextToSpeech'],{
  ...ht.deps(),Audio:audio.AudioStub,attachMediaVolume:audio.attachMediaVolume,SUPABASE_URL:'https://fixture.invalid',edgeAuthHeaders:async()=>({}),
  fetch:async()=>({ok:true,blob:async()=>new Blob(['fixture'])}),toast:{error(){}},URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},
 });
 const rt=()=>t.useTextToSpeech();let tts=await ht.settle(rt);await tts.speak('fixture','m3');tts=await ht.settle(rt);tts.stop();ht.unmount();
 assert.equal(audio.subscriptions.size,3);
 record('imperative_audio_stops_keep_bindings','Pausar/fechar memes e parar TTS conserva inscrições dos elementos antigos',{memesRetainedAfterClose:pausedMemesRetained,totalBindingsAfterTtsStop:audio.subscriptions.size},'Código real de dois hooks e attachMediaVolume/bindMediaVolume; Set de subscribers e Audio simulados. A retenção é dos callbacks/elementos; não mede memória/bateria e não reconta o AudioContext sem GainNode do VOL-01.');
}

function memeFixture(){
 const h=new Hooks(),toasts=[],operations=[],objects=new Set(),rows=[{id:'m1',name:'fixture',audio_url:'https://fixture.invalid/storage/v1/object/public/audio-memes/m1.mp3',category:'outros',duration_seconds:1,is_favorite:false,use_count:0}];
 let databaseError={message:'fixture write rejected'},storageError=null;
 const db={
  rpc:async name=>name==='fn_list_audio_memes_for_user'?{data:rows.map(x=>({...x})),error:null}:{error:null},
  auth:{getUser:async()=>({data:{user:{id:'fixture-user'}}})},
  functions:{invoke:async()=>({data:{category:'outros'},error:null})},
  storage:{from:()=>({
   upload:async path=>{objects.add(path);operations.push('upload');return{error:null};},
   getPublicUrl:path=>({data:{publicUrl:`https://fixture.invalid/storage/v1/object/public/audio-memes/${path}`}}),
   remove:async paths=>{operations.push('remove-storage');if(!storageError)for(const p of paths)objects.delete(p);return{error:storageError};},
  })},
  from:()=>({
   update:()=>({eq:async()=>{operations.push('update-row');return{error:databaseError};}}),
   delete:()=>({eq:async()=>{operations.push('delete-row');return{error:databaseError};}}),
   insert:async()=>({error:databaseError}),
  }),
 };
 const m=load('src/hooks/communication/useAudioMemes.ts',['useAudioMemes'],{
  ...h.deps(),supabase:db,toast:{success:x=>toasts.push(['success',x]),error:x=>toasts.push(['error',x]),info(){}},
  convertAudioToMp3:async()=>({ok:true,blob:new Blob(['fixture']),durationSeconds:1}),
 });
 let open=true;const render=()=>m.useAudioMemes(open);
 return{h,render,toasts,operations,objects,rows,setOpen:value=>{open=value;},setErrors:(database,storage)=>{databaseError=database;storageError=storage;}};
}

// P3.4: fulfilled error results still produce success notifications and optimistic removal.
{
 const f=memeFixture();let hook=await f.h.settle(f.render);
 await hook.handleCategoryChange(hook.memes[0],'risada');hook=await f.h.settle(f.render);
 assert.equal(hook.memes[0].category,'risada');assert.equal(f.toasts[0][0],'success');assert.equal(f.rows[0].category,'outros');
 f.objects.add('m1.mp3');await hook.handleDelete({stopPropagation(){}},hook.memes[0]);hook=await f.h.settle(f.render);
 assert.equal(hook.memes.length,0);assert.equal(f.objects.size,0);assert.equal(f.rows.length,1);assert.equal(f.toasts.at(-1)[0],'success');
 record('audio_meme_writes_false_success','Escritas de categoria/exclusão rejeitadas continuam com sucesso; exclusão de objeto já aconteceu',{displayedCategory:'risada',persistedCategory:f.rows[0].category,visibleRows:hook.memes.length,persistedRows:f.rows.length,storageObjects:f.objects.size,operations:f.operations,toasts:f.toasts},'Hook real; banco/Storage simulados com {error} resolvido. O cenário define falha da linha e sucesso de Storage; não afirma políticas RLS ou incidência real.');
}

// P3.5: closing the popover clears the only pending locator without rolling back the upload.
{
 const f=memeFixture();let hook=await f.h.settle(f.render);
 await hook.handleFileSelect({target:{files:[new File(['fixture'],'clip.mp3',{type:'audio/mpeg'})]}});hook=await f.h.settle(f.render);
 assert.ok(hook.pendingUpload);assert.equal(f.objects.size,1);
 hook.cleanup();f.setOpen(false);hook=await f.h.settle(f.render);
 assert.equal(hook.pendingUpload,null);assert.equal(f.objects.size,1);assert.equal(f.operations.includes('remove-storage'),false);
 // Positive contrast: the explicit Cancel button calls remove.
 f.setOpen(true);hook=await f.h.settle(f.render);await hook.handleFileSelect({target:{files:[new File(['fixture'],'clip2.mp3',{type:'audio/mpeg'})]}});hook=await f.h.settle(f.render);
 await hook.handleCancelUpload();hook=await f.h.settle(f.render);assert.equal(f.objects.size,1);assert.equal(f.operations.filter(x=>x==='remove-storage').length,1);
 record('audio_meme_close_orphans_upload','Fechar o picker descarta pendingUpload e conserva objeto; Cancelar explícito remove',{objectsLeftByClose:1,pendingCleared:true,explicitCancelRemovesOwnObject:true},'Upload/conversão/IA simulados; callbacks reais. Não consulta objetos reais nem estima custo; o caminho visível onOpenChange chama cleanup, não handleCancelUpload.');
}

// P3.6: a delayed old onend clobbers the listening state of the new recognition object.
{
 const h=new Hooks(),instances=[],transcripts=[];
 class Recognition {constructor(){instances.push(this);this.active=false;}start(){this.active=true;}stop(){this.active=false;}}
 const m=load('src/hooks/communication/useSpeechToText.ts',['useSpeechToText'],{...h.deps(),window:{SpeechRecognition:Recognition},navigator:{},});
 const render=()=>m.useSpeechToText({continuous:false,onResult:text=>transcripts.push(text)});let hook=await h.settle(render);
 hook.startListening();hook=await h.settle(render);hook.stopListening();hook=await h.settle(render);hook.startListening();hook=await h.settle(render);
 assert.equal(instances.length,2);assert.equal(hook.isListening,true);
 instances[0].onend();hook=await h.settle(render);assert.equal(hook.isListening,false);assert.equal(instances[1].active,true);
 instances[1].onresult({resultIndex:0,results:[{0:{transcript:'texto novo'},isFinal:true,length:1}]});hook=await h.settle(render);assert.deepEqual(transcripts,['texto novo']);
 record('dictation_old_end_resets_new_session','onend atrasado da sessão anterior apaga isListening enquanto a nova continua ativa',{isListening:hook.isListening,newRecognitionActive:instances[1].active,transcripts},'Hook real e eventos SpeechRecognition controlados. Requer onend de A após início de B; não é teste de navegador físico. O teste de repositório chama onend sincronicamente dentro de stop.');
}

// P3.7: unsubscribe cannot invalidate an already awaited contact-name query.
{
 const h=new Hooks(),contact=deferred(),events=[],callbacks=[];
 let enabled=true;
 const settings={transcriptionNotificationEnabled:true,soundEnabled:true,browserNotifications:true,transcriptionSoundType:'soft',soundVolume:45};
 const channel={on(_name,_filters,callback){callbacks.push(callback);return this;},subscribe(){return this;}};
 const m=load('src/hooks/communication/useTranscriptionNotifications.ts',['useTranscriptionNotifications'],{
  ...h.deps(),supabase:{channel:()=>channel,removeChannel:()=>events.push('remove-channel'),from:()=>({select(){return this;},eq(){return this;},single:()=>contact.promise})},
  useNotificationSettings:()=>({settings,isQuietHours:()=>false}),requestNotificationPermission:async()=>false,
  toast:()=>events.push('toast'),playNotificationSound:()=>events.push('sound'),showBrowserNotification:()=>events.push('browser'),
 });
 const render=()=>m.useTranscriptionNotifications({enabled});await h.settle(render);
 const pending=callbacks[0]({new:{id:'m1',contact_id:'c1',transcription_status:'completed',transcription:'fixture'},old:{transcription_status:'processing'}});
 await flush();enabled=false;await h.settle(render);assert.deepEqual(events,['remove-channel']);
 contact.resolve({data:{name:'fixture contact'},error:null});await pending;
 assert.deepEqual(events,['remove-channel','toast','sound','browser']);
 record('transcription_notification_after_disable','Callback pendente publica os três alertas depois de enabled=false remover o canal',{events,enabledAtDelivery:false},'Hook real e query/canal/alertas simulados. Não alega entrega a usuário sem RLS; descreve aviso fora do ciclo ativo ou após desativação enquanto a consulta de nome estava pendente.');
}

// P3.8: the consumer forwards only a view ID, never any query/filter/sort payload.
{
 const h=new Hooks(),views=[],toasts=[];
 const m=load('src/hooks/voice/useVoiceAgent.ts',['useVoiceAgent'],{...h.deps(),toast:{success:x=>toasts.push(x),info:x=>toasts.push(x)}});
 const hook=h.render(()=>m.useVoiceAgent((...args)=>views.push(args)));
 for(const action of [
  {action:'search',response:'fixture',data:{query:'cliente específico'}},
  {action:'filter',response:'fixture',data:{filters:{unread:true}}},
  {action:'sort',response:'fixture',data:{sortBy:'unread'}},
  {action:'clear',response:'fixture'},
 ])hook.handleVoiceAction(action);
 assert.equal(views.length,2);assert.equal(JSON.stringify(views),JSON.stringify([['contacts'],['inbox']]));assert.equal(toasts.length,4);
 record('voice_actions_announce_without_applying','Busca/filtro só mudam view e sort/clear só mostram toast',{viewCalls:views,toasts,statePayloadCalls:0},'Corpo real do roteador consumidor de AppShell; onViewChange/toast simulados. Não infere inexistência de outro assistente separado: este é o LazyVoiceOverlay de desktop.');
}

function voiceFixture(playbackFactory){
 const h=new Hooks(),actions=[],tts=[],logs=[];let handlers;
 const scribe={isConnected:true,connect:async()=>{},disconnect(){this.isConnected=false;}};
 const m=load('src/hooks/communication/useVoiceAgent.ts',['useVoiceAgent'],{
  ...h.deps(),useScribe:options=>{handlers=options;return scribe;},CommitStrategy:{VAD:'fixture'},SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture-public',
  supabase:{auth:{getSession:async()=>({data:{session:{access_token:'fixture-session'}}})}},navigator:{},
  processVoiceTranscript:async text=>({action:'navigate',response:text,data:{route:text}}),withRetry:fn=>fn(),friendlyErrorMessage:err=>err.message,
  playTtsAudio:(...args)=>{const playback=playbackFactory(...args);tts.push(playback);return playback;},logVoiceCommand:args=>logs.push(args),
 });
 const render=()=>m.useVoiceAgent({onAction:action=>actions.push(action)});
 return{h,render,actions,tts,logs,commit:text=>handlers.onCommittedTranscript({text})};
}

// P3.9: real playTtsAudio.stop clears the only handlers that would settle playObjectUrl.
{
 const audio=audioKit(),revoked=[];
 const playback=load('src/hooks/voice/playTtsAudio.ts',['playTtsAudio'],{
  Audio:audio.AudioStub,attachMediaVolume:audio.attachMediaVolume,edgeAuthHeaders:async()=>({}),window:{speechSynthesis:{cancel(){}}},
  fetch:async()=>({ok:true,blob:async()=>new Blob(['fixture'])}),URL:{createObjectURL:()=> 'blob:voice',revokeObjectURL:url=>revoked.push(url)},
 });
 const f=voiceFixture((...args)=>playback.playTtsAudio(...args));let hook=await f.h.settle(f.render);
 f.commit('contacts');await flush();hook=await f.h.settle(f.render);assert.equal(hook.phase,'speaking');assert.equal(f.tts.length,1);
 let settled=false;f.tts[0].promise.then(()=>{settled=true;},()=>{settled=true;});
 const element=audio.elements.find(x=>x.src==='blob:voice');assert.equal(element.paused,false);assert.equal(typeof element.onended,'function');
 hook.stopSpeaking();await flush();hook=await f.h.settle(f.render);
 assert.equal(element.paused,true);assert.equal(element.onended,null);assert.equal(element.onerror,null);assert.equal(settled,false);assert.equal(f.actions.length,0);assert.equal(hook.phase,'listening');
 record('voice_stop_leaves_action_pending','Interromper resposta pausa áudio mas deixa promise e onAction pendentes',{phase:hook.phase,promiseSettled:settled,actionCalls:f.actions.length,endedHandler:element.onended,errorHandler:element.onerror,urlsRevoked:revoked.length},'playTtsAudio e useVoiceAgent reais; hooks/SDK/fetch/Audio simulados. O caminho já estava em playObjectUrl; não generaliza stop antes do fetch, que pode sair pelo sinal.');
}

// P3.10: the generation guard exists before TTS but not after awaiting it.
{
 const f=voiceFixture(()=>{const d=deferred();return{promise:d.promise,stop(){},complete:d.resolve};});await f.h.settle(f.render);
 f.commit('rota-a');await flush();await f.h.settle(f.render);assert.equal(f.tts.length,1);
 f.commit('rota-b');await flush();await f.h.settle(f.render);assert.equal(f.tts.length,2);
 f.tts[1].complete();await flush();await f.h.settle(f.render);assert.equal(f.actions[0].data.route,'rota-b');
 f.tts[0].complete();await flush();await f.h.settle(f.render);assert.equal(f.actions[1].data.route,'rota-a');
 record('voice_old_tts_applies_old_action','A finaliza sua fala depois de B e ainda aplica ação antiga apesar do abort',{appliedRoutes:f.actions.map(x=>x.data.route)},'Hook real; SDK/transcrição/TTS simulados com promessas independentes. Requer novo transcript durante fala anterior; onCommittedTranscript não possui guard de fase e o abort de A não é verificado depois do await TTS.');
}

// P3.11: bounded positive checks of microphone permission and cache contract.
{
 const h=new Hooks(),requests=[],tracks=[],toasts=[];let fail=true,now=10000,deviceHandler;
 const clock={now:()=>now};
 const m=load('src/hooks/communication/useMicrophoneGuard.ts',['useMicrophoneGuard','motivoDoMicrofone'],{
  ...h.deps(),Date:clock,toast:{error:x=>toasts.push(x)},describeReason:reason=>reason,
  navigator:{mediaDevices:{getUserMedia:async()=>{requests.push(now);if(fail)throw{name:'NotAllowedError'};const track={stopped:false,stop(){this.stopped=true;}};tracks.push(track);return{getTracks:()=>[track]};},addEventListener:(_name,fn)=>{deviceHandler=fn;},removeEventListener:()=>{deviceHandler=null;}}},
 });
 const render=()=>m.useMicrophoneGuard();let hook=await h.settle(render);
 assert.equal(await hook.garantirMicrofone(),false);hook=await h.settle(render);assert.equal(hook.micReason,'mic_blocked');
 fail=false;assert.equal(await hook.garantirMicrofone(),true);assert.equal(tracks[0].stopped,true);
 assert.equal(await hook.garantirMicrofone(),true);assert.equal(requests.length,2);
 now+=3001;assert.equal(await hook.garantirMicrofone(),true);assert.equal(requests.length,3);h.unmount();assert.equal(deviceHandler,null);
 assert.equal(m.motivoDoMicrofone({name:'NotFoundError'}),'mic_missing');assert.equal(m.motivoDoMicrofone({name:'NotReadableError'}),'mic_busy');
 record('microphone_guard_contract_positive','Sondagem interrompe tracks, reconsulta após negativa e reutiliza sucesso por três segundos',{requests:requests.length,stoppedTracks:tracks.every(x=>x.stopped),blockedFeedback:toasts,deviceListenerRemoved:deviceHandler===null},'Controle positivo, sem achado novo. Hook real, tempo/getUserMedia/eventos simulados; não prova discagem SIP nem aparelho físico.');
}

// P3.12: bounded positive checks of store/hook/per-element rebinding.
{
 const store=load('src/lib/mediaVolumeStore.ts',['getSnapshot','setVolume','setMuted','toggleMuted','toGain','subscribe']);
 const volume=load('src/hooks/communication/useMediaVolume.ts',['useMediaVolume'],{
  ...store,storeSetVolume:store.setVolume,storeSetMuted:store.setMuted,storeToggleMuted:store.toggleMuted,
  useSyncExternalStore:(_subscribe,getSnapshot)=>getSnapshot(),isMediaVolumeControllable:()=>true,
 });
 let snapshot=volume.useMediaVolume();assert.equal(snapshot.volume,80);snapshot.setVolume(200);snapshot=volume.useMediaVolume();assert.equal(snapshot.volume,100);snapshot.setVolume(50);snapshot=volume.useMediaVolume();assert.equal(snapshot.gain,0.25);snapshot.toggleMuted();snapshot=volume.useMediaVolume();assert.equal(snapshot.muted,true);
 const h=new Hooks(),calls=[],ref={current:{id:'a'}};
 const element=load('src/hooks/communication/useMediaElementVolume.ts',['useMediaElementVolume'],{
  ...h.deps(),useLayoutEffect:h.useEffect,useMediaVolume:()=>snapshot,getSnapshot:store.getSnapshot,toGain:store.toGain,
  applyMediaVolume:(el,gain,muted)=>calls.push(['apply',el.id,gain,muted]),applyMediaVolumeGain:(el,gain)=>calls.push(['gain',el.id,gain]),
  bindMediaVolume:(el,apply)=>{calls.push(['bind',el.id]);apply();return()=>calls.push(['detach',el.id]);},
 });
 const render=()=>element.useMediaElementVolume(ref);h.render(render);h.render(render);assert.equal(calls.filter(x=>x[0]==='bind').length,1);
 ref.current={id:'b'};h.render(render);h.unmount();assert.deepEqual(calls.filter(x=>x[0]==='detach').map(x=>x[1]),['a','b']);
 record('media_volume_contract_positive','Store mantém clamp/curva/mute e hook troca binding quando o elemento muda',{volume:snapshot.volume,gain:snapshot.gain,muted:snapshot.muted,bindings:calls.filter(x=>x[0]==='bind'),detachments:calls.filter(x=>x[0]==='detach')},'Controle positivo, sem achado novo. Store e dois hooks reais; useSyncExternalStore/layout effect, DOM e binding simulado neste caso. Não valida fallback WebAudio/Safari; VOL-01 permanece separado.');
}

fs.writeFileSync(resultPath,JSON.stringify({source_sha:observedHead,integrity,engine:process.version,no_network:true,method:'Terceira passagem: oito hooks de communication e consumidores locais; código TypeScript real com fronteiras controladas, sem React DOM ou serviços.',source_blob_hashes:hashes,results},null,2)+'\n');
console.log(JSON.stringify({probes:results.length,allAssertionsPassed:true,ids:results.map(x=>x.id)},null,2));
