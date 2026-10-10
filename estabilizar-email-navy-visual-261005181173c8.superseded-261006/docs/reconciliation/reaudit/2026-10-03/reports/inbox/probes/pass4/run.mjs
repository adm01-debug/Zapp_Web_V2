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

const mediaLibraryPath='src/components/settings/media-library/useMediaLibrary.ts';
const stickerPath='src/hooks/sticker-picker/useStickerPicker.ts';
const stickerTypes=load('src/components/inbox/stickers/StickerTypes.ts',['CATEGORY_LABELS']);
function fixture(seed=[]){
 const rows=seed.map(x=>({...x})),objects=new Set(),operations=[],toasts=[];
 const behavior={writeError:null,storageError:null,classifyError:null};
 let nextId=0;
 const db={
  from(table){
   const apply=(kind,values,field,ids)=>{
    operations.push({kind,table,field,ids:[...ids],values});
    if(behavior.writeError)return Promise.resolve({error:behavior.writeError});
    if(kind==='delete')for(let i=rows.length-1;i>=0;i--)if(ids.includes(rows[i][field]))rows.splice(i,1);
    if(kind==='update')for(const row of rows)if(ids.includes(row[field]))Object.assign(row,values);
    return Promise.resolve({error:null});
   };
   return{
    select(){let orderBy='created_at',ascending=false;return{order(field,options){orderBy=field;ascending=options.ascending;return this;},limit(n){operations.push({kind:'select',table,limit:n,orderBy});const sorted=[...rows].sort((a,b)=>{const av=a[orderBy],bv=b[orderBy];return(av<bv?-1:av>bv?1:0)*(ascending?1:-1);});return Promise.resolve({data:sorted.slice(0,n).map(x=>({...x})),error:null});}};},
    update:values=>({eq:(field,id)=>apply('update',values,field,[id]),in:(field,ids)=>apply('update',values,field,ids)}),
    delete:()=>({eq:(field,id)=>apply('delete',null,field,[id]),in:(field,ids)=>apply('delete',null,field,ids)}),
    insert:async row=>{operations.push({kind:'insert',table,row:{...row}});if(behavior.writeError)return{error:behavior.writeError};rows.push({...row,id:`saved-${++nextId}`,created_at:'2026-10-01T00:00:00Z'});return{error:null};},
   };
  },
  auth:{getUser:async()=>({data:{user:{id:'fixture-user'}}})},
  functions:{invoke:async()=>behavior.classifyError?{data:null,error:behavior.classifyError}:{data:{category:'outros'},error:null}},
  storage:{from:bucket=>({
   upload:async objectPath=>{objects.add(`${bucket}/${objectPath}`);operations.push({kind:'upload',bucket,path:objectPath});return{error:null};},
   getPublicUrl:objectPath=>({data:{publicUrl:`https://fixture.invalid/storage/v1/object/public/${bucket}/${objectPath}`}}),
   remove:async paths=>{operations.push({kind:'remove',bucket,paths:[...paths]});if(!behavior.storageError)for(const objectPath of paths)objects.delete(`${bucket}/${objectPath}`);return{error:behavior.storageError};},
  })},
 };
 const toast={success:x=>toasts.push(['success',x]),error:x=>toasts.push(['error',x]),info:x=>toasts.push(['info',x])};
 return{rows,objects,operations,toasts,behavior,db,toast};
}
function stickerHook(f){
 const h=new Hooks();
 const m=load(stickerPath,['useStickerPicker'],{...h.deps(),...stickerTypes,supabase:f.db,toast:f.toast,window:{addEventListener(){},removeEventListener(){}},getFileExtensionWithDefault:(name,fallback)=>name.split('.').pop()||fallback});
 const render=()=>m.useStickerPicker(()=>{});return{h,render};
}
function libraryHook(f,type='stickers'){
 const h=new Hooks();const m=load(mediaLibraryPath,['useMediaLibrary','getBucket','MAX_UPLOAD_SIZE_BYTES','MAX_UPLOAD_SIZE_MB'],{...h.deps(),supabase:f.db,toast:f.toast});
 const render=()=>m.useMediaLibrary(type);return{h,render,...m};
}

// P4.1: the exact save INSERT aliases the message URL, and delete removes its object.
{
 const f=fixture(),message={id:'original-message',mediaUrl:'https://fixture.invalid/storage/v1/object/public/whatsapp-media/contact/original.webp'};
 f.objects.add('whatsapp-media/contact/original.webp');
 const path='src/components/inbox/chat/MessageBubble.tsx',code=source(path);
 const start=code.indexOf("await supabase.from('stickers').insert({ name: `Recebida");assert.ok(start>=0);const end=code.indexOf('\n',start);
 const producer=load(path,['save'],{supabase:f.db,message,category:'recebidas'},`async function save(){${code.slice(start,end)}}`);
 await producer.save();assert.equal(f.rows[0].image_url,message.mediaUrl);
 const {h,render}=stickerHook(f);let hook=await h.settle(render);hook.setOpen(true);hook=await h.settle(render);
 await hook.handleDelete({stopPropagation(){}},hook.stickers[0]);hook=await h.settle(render);
 assert.equal(f.objects.has('whatsapp-media/contact/original.webp'),false);assert.equal(message.mediaUrl,'https://fixture.invalid/storage/v1/object/public/whatsapp-media/contact/original.webp');assert.equal(f.rows.length,0);
 record('sticker_delete_dangles_message_reference','Excluir a entrada remove o arquivo compartilhado, mas a mensagem conserva sua URL',{messageStillReferencesOriginal:true,originalObjectExists:false,removedObjects:f.operations.filter(x=>x.kind==='remove'),libraryRows:f.rows.length},'INSERT exato do handler de salvar e hook de exclusão reais; banco/Storage simulados com escritas autorizadas. Não reconstrói o endpoint de mídia/RLS nem afirma que toda tentativa de salvar do balão passe suas policies. A precondição é a existência da entrada compartilhada e permissão de remover o objeto.');
}

// P4.2: upload precedes insert, with no rollback when the latter is rejected.
{
 const f=fixture(),lib=libraryHook(f);f.behavior.writeError={message:'fixture insert rejected'};
 const h=new Hooks();let complete=0;
 const m=load('src/components/settings/media-library/useMediaUpload.ts',['useMediaUpload'],{
  ...h.deps(),getBucket:lib.getBucket,MAX_UPLOAD_SIZE_BYTES:lib.MAX_UPLOAD_SIZE_BYTES,MAX_UPLOAD_SIZE_MB:lib.MAX_UPLOAD_SIZE_MB,supabase:f.db,toast:f.toast,
 });
 const render=()=>m.useMediaUpload('stickers',()=>complete++);let hook=await h.settle(render);
 const event={target:{files:[new File(['fixture'],'asset.webp',{type:'image/webp'})]}};
 await hook.handleBulkUpload(event);hook=await h.settle(render);assert.equal(f.objects.size,1);assert.equal(f.rows.length,0);assert.equal(f.operations.some(x=>x.kind==='remove'),false);
 f.behavior.writeError=null;await hook.handleBulkUpload(event);assert.equal(f.objects.size,2);assert.equal(f.rows.length,1);
 const bulk={objectsAfterFailureAndRetry:f.objects.size,rowsAfterRetry:f.rows.length,removeCalls:0,toasts:[...f.toasts]};
 const generated=fixture();generated.behavior.writeError={message:'fixture generated insert rejected'};
 const p='src/components/settings/media-library/AIGenerateDialog.tsx';
 const save=load(p,['handleSaveGenerated'],{
  supabase:generated.db,toast:generated.toast,genPreviewUrl:'data:audio/mpeg;base64,Zml4dHVyZQ==',genPrompt:'fixture prompt',setGenerating(){},setGenPrompt(){},setGenPreviewUrl(){},onOpenChange(){},onSaved(){},fetch:async()=>({blob:async()=>new Blob(['fixture'])}),
 },excerpt(p,'const handleSaveGenerated = async () => {','  return (\n    <Dialog'));
 await save.handleSaveGenerated();assert.equal(generated.objects.size,1);assert.equal(generated.rows.length,0);assert.equal(generated.operations.some(x=>x.kind==='remove'),false);
 record('media_import_insert_failure_keeps_objects','Falha no INSERT conserva objetos do upload em massa e do áudio gerado; retry cria outro',{bulk,generated:{objects:generated.objects.size,rows:generated.rows.length,removeCalls:0}},'Hook de upload e callback real de salvar IA; conversão/fetch/banco/Storage simulados. O contador 0/1 do primeiro upload é honesto sobre quantidade importada; a falha comprovada é objeto órfão sem tratamento/reuso no retry.');
}

// P4.3: sticker favorite/category/delete callbacks share the unexamined-result defect.
{
 const f=fixture([{id:'s1',name:'fixture',category:'outros',is_favorite:false,use_count:0,image_url:'https://fixture.invalid/storage/v1/object/public/stickers/asset.webp'}]);
 f.behavior.writeError={message:'fixture write denied'};f.behavior.storageError={message:'fixture remove denied'};
 const {h,render}=stickerHook(f);let hook=await h.settle(render);hook.setOpen(true);hook=await h.settle(render);
 await hook.toggleFavorite({stopPropagation(){}},hook.stickers[0]);hook=await h.settle(render);const optimisticFavorite=hook.stickers[0].is_favorite;
 await hook.handleCategoryChange(hook.stickers[0],'amor');hook=await h.settle(render);const optimisticCategory=hook.stickers[0].category;
 await hook.handleDelete({stopPropagation(){}},hook.stickers[0]);hook=await h.settle(render);
 assert.equal(optimisticFavorite,true);assert.equal(optimisticCategory,'amor');assert.equal(hook.stickers.length,0);assert.equal(f.rows[0].is_favorite,false);assert.equal(f.rows[0].category,'outros');assert.equal(f.toasts.filter(x=>x[0]==='success').length,3);
 record('sticker_mutations_ignore_errors','Favorito/categoria/exclusão de sticker seguem otimistas e anunciam sucesso após error',{optimisticFavorite,optimisticCategory,visibleItems:hook.stickers.length,persistedItems:f.rows.length,toasts:f.toasts},'Extensão de R2-INB-042; corpo real de useStickerPicker e fronteiras simuladas. Não cria novo ID para o mesmo padrão de resultado ignorado.');
}

// P4.4: the close binding discards a pending upload, unlike explicit Cancel.
{
 const f=fixture();const {h,render}=stickerHook(f);let hook=await h.settle(render);hook.setOpen(true);hook=await h.settle(render);
 hook.handleFileSelect({target:{files:[new File(['fixture'],'asset.webp',{type:'image/webp'})]}});await flush();hook=await h.settle(render);assert.ok(hook.pendingUpload);assert.equal(f.objects.size,1);
 const consumer=source('src/components/inbox/StickerPicker.tsx');assert.ok(consumer.includes('onOpenChange={(v) => { setOpen(v); if (!v) { setPendingUpload(null); setSearch(\'\'); } }}'));
 hook.setOpen(false);hook.setPendingUpload(null);hook.setSearch('');hook=await h.settle(render);
 assert.equal(hook.pendingUpload,null);assert.equal(f.objects.size,1);assert.equal(f.operations.some(x=>x.kind==='remove'),false);
 record('sticker_close_leaves_upload','Fechamento do StickerPicker apaga pendingUpload sem remover o arquivo',{pendingCleared:true,objectsRemaining:f.objects.size,storageRemoveCalls:0},'Extensão de R2-INB-043. Upload/callbacks reais e ligação onOpenChange conferida literalmente; sem DOM. Não duplica o mesmo contrato já encontrado no picker de áudio.');
}

// P4.5: both consumers search an initial cap, and stats label the cap as a total.
{
 const rows=Array.from({length:1001},(_,i)=>({id:`s${i}`,name:i===1000?'item-omitido':`visível-${i}`,category:'outros',is_favorite:i===1000,use_count:1001-i,created_at:String(1001-i).padStart(4,'0'),image_url:`https://fixture.invalid/stickers/${i}.webp`}));
 const f=fixture(rows);const library=libraryHook(f);let lib=await library.h.settle(library.render);assert.equal(lib.items.length,1000);
 const p='src/components/settings/media-library/StatsCards.tsx';const code=source(p);const marker=code.indexOf('  return (');
 const stats=load(p,['StatsCards'],{},code.slice(0,marker)+'return {total,totalUses,favorites,categories,topUsed};\n}').StatsCards({items:lib.items,type:'stickers'});
 assert.equal(stats.total,1000);assert.equal(stats.favorites,0);lib.setSearch('item-omitido');lib=await library.h.settle(library.render);assert.equal(lib.filtered.length,0);
 const s=stickerHook(f);let picker=await s.h.settle(s.render);picker.setOpen(true);picker=await s.h.settle(s.render);assert.equal(picker.stickers.length,1000);picker.setSearch('item-omitido');picker=await s.h.settle(s.render);assert.equal(picker.filtered.length,0);
 record('media_catalog_fixed_windows','Item 1001 não pode ser encontrado; favoritos e totais refletem apenas mil linhas',{databaseItems:1001,libraryItems:lib.items.length,librarySearchResults:lib.filtered.length,stickerItems:picker.stickers.length,stickerSearchResults:picker.filtered.length,stats:{total:stats.total,favorites:stats.favorites},queries:f.operations.filter(x=>x.kind==='select')},'Dois hooks e derivação real dos StatsCards; PostgREST modelado obedecendo order/limit. Não mede cardinalidade produtiva; ausência de paginação é conferida nos consumidores integrais.');
}

// P4.6: private legacy locators are signed in the canonical hook, not in the sticker grid.
{
 const refs=load('src/lib/storage_object_reference.ts',['parseSupabaseStorageObjectUrl','PRIVATE_MEDIA_BUCKETS']);
 const locator='https://fixture.invalid/storage/v1/object/public/whatsapp-media/contact/sticker.webp';
 assert.equal(refs.parseSupabaseStorageObjectUrl(locator,refs.PRIVATE_MEDIA_BUCKETS,['https://fixture.invalid']).bucket,'whatsapp-media');
 const h=new Hooks(),calls=[];
 const resolver=load('src/hooks/storage/useResolvedStorageUrl.ts',['useResolvedStorageUrl'],{
  ...h.deps(),...refs,SUPABASE_URL:'https://fixture.invalid',supabase:{storage:{from:bucket=>({createSignedUrl:async objectPath=>{calls.push({bucket,path:objectPath});return{data:{signedUrl:'https://fixture.invalid/storage/v1/object/sign/whatsapp-media/contact/sticker.webp?token=fixture'},error:null};}})}},
 });
 const resolved=await h.settle(()=>resolver.useResolvedStorageUrl(locator));assert.notEqual(resolved.url,locator);assert.equal(calls.length,1);
 const grid=source('src/components/inbox/stickers/StickerGrid.tsx');assert.ok(grid.includes('src={sticker.image_url}'));assert.ok(grid.includes('src={deleteTarget.image_url}'));assert.equal(grid.includes('useResolvedStorageUrl'),false);
 record('private_sticker_grid_skips_resolution','Grid usa locator privado cru que o resolvedor canônico reconhece e assina',{storedLocator:locator,gridSource:locator,canonicalResolvedUrl:resolved.url,signCalls:calls},'Resolvedor/parser reais, assinatura simulada e TSX do grid conferido. Estado privado vem do DDL citado no relatório. Não foi feito HTTP de imagem; não atribui erro de entrega outbound, cujo backend pode assinar a referência.');
}

// P4.7: admin delete checks the table result but discards the Storage result.
{
 const observations=[];
 for(const bulk of [false,true]){
  const f=fixture([{id:'s1',name:'fixture',category:'outros',is_favorite:false,use_count:0,created_at:'2026-10-01',image_url:'https://fixture.invalid/storage/v1/object/public/stickers/asset.webp'}]);
  f.objects.add('stickers/asset.webp');f.behavior.storageError={message:'fixture Storage rejected'};
  const {h,render}=libraryHook(f);let hook=await h.settle(render);
  if(bulk){hook.toggleSelect('s1');hook=await h.settle(render);await hook.handleBulkDelete();}else await hook.handleDelete(hook.items[0]);
  hook=await h.settle(render);assert.equal(f.rows.length,0);assert.equal(f.objects.size,1);assert.equal(f.toasts.at(-1)[0],'success');
  observations.push({bulk,rows:f.rows.length,objects:f.objects.size,toast:f.toasts.at(-1)});
 }
 record('library_storage_delete_failure_accepted','Exclusão simples e em lote concluem a linha mesmo quando Storage devolve error',{observations},'Extensão de R2-INB-042: helper/handlers reais com erro Storage resolvido. Diferente de alegar que o administrador ignora também error do DELETE da linha: esse erro é tratado.');
}

// P4.8: a resolved invocation error is indistinguishable from an unchanged category.
{
 const f=fixture([{id:'s1',name:'fixture',category:'outros',is_favorite:false,use_count:0,created_at:'2026-10-01',image_url:'https://fixture.invalid/stickers/asset.webp'}]);
 f.behavior.classifyError={message:'fixture classifier rejected'};
 const {h,render}=libraryHook(f);let hook=await h.settle(render);hook.toggleSelect('s1');hook=await h.settle(render);
 await hook.handleBulkReclassify();hook=await h.settle(render);
 assert.equal(f.toasts.length,1);assert.equal(f.toasts[0][0],'success');assert.equal(f.toasts[0][1],'0/1 itens reclassificados com IA');assert.equal(hook.selected.size,0);
 record('library_reclassify_errors_not_counted','Erro da função de classificação recebe toast success sem contagem de erro e limpa seleção',{functionErrorReturned:true,toast:f.toasts[0],selectionAfterFailure:hook.selected.size},'Hook real com invoke retornando {data:null,error}; não é rejeição lançada, que o catch conta corretamente. Não afirma que houve 1/1 atualizações; o contador exibe zero, mas não distingue falha de categoria já correta.');
}

fs.writeFileSync(resultPath,JSON.stringify({source_sha:observedHead,integrity,engine:process.version,no_network:true,method:'Quarta passagem: biblioteca de mídia e seletor de stickers, TypeScript e trechos TSX reais com fronteiras locais; sem serviços/DOM.',source_blob_hashes:hashes,results},null,2)+'\n');
console.log(JSON.stringify({probes:results.length,allAssertionsPassed:true,ids:results.map(x=>x.id)},null,2));
