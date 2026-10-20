#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const [source,integrityPath,tsPath,output]=process.argv.slice(2);
if(!output)throw new Error('Usage: node platform_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT');
const integrityBytes=fs.readFileSync(integrityPath),integrity=JSON.parse(integrityBytes),ts=require(path.resolve(tsPath));
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),integrity.head_sha);
const paths=['src/hooks/system/useNavigationHistory.ts','src/hooks/system/useNotifications.ts','src/hooks/system/useNotificationSettings.ts','src/lib/emailHtml.ts','src/hooks/system/useSearchHistory.ts','src/hooks/system/useUndoableAction.ts','src/hooks/ui/useCustomShortcuts.ts'],pins=[],parsed={},codes={};
for(const p of paths){const b=fs.readFileSync(path.join(source,p));const blob=crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');assert.equal(blob,integrity.files.find(f=>f.path===p).git_blob_sha,p);pins.push({path:p,git_blob_sha:blob,sha256:crypto.createHash('sha256').update(b).digest('hex')});parsed[p]=ts.createSourceFile(p,b.toString('utf8'),ts.ScriptTarget.Latest,true);codes[p]=b.toString('utf8');}
function nodes(sf,pred){const out=[];function visit(n){if(pred(n))out.push(n);ts.forEachChild(n,visit)}visit(sf);return out}
function expr(p,name){const sf=parsed[p],found=nodes(sf,n=>(ts.isVariableDeclaration(n)||ts.isFunctionDeclaration(n))&&n.name?.getText(sf)===name);assert.equal(found.length,1,name);let n=found[0];if(ts.isVariableDeclaration(n)){n=n.initializer;if(ts.isCallExpression(n)&&['useCallback','useMemo'].includes(n.expression.getText(sf)))n=n.arguments[0];}return n.getText(sf).replace(/^export\s+/,'')}
function compile(text,env={}){const js=ts.transpileModule(`return (${text});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;return new Function(...Object.keys(env),js)(...Object.values(env))}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve};}
const probes=[];
function note(id,title,observed,limitations){probes.push({id,title,status:'PASS',observed,limitations});}
async function main(){
  {
    let state={entries:['A','B','C','B','D'].map((viewId,i)=>({viewId,timestamp:i})),index:2,previousView:'B'};
    const pop=compile(expr(paths[0],'onPopState'),{defaultView:'A',getViewFromUrl:()=> 'B',MAX_HISTORY:50,setState:fn=>{state=fn(state)}});
    pop();assert.equal(state.index,1);
    note('PLAT-P01','Forward traversal to repeated view chooses the earlier occurrence',{history:['A','B','C','B','D'],before_index:2,expected_forward_index:3,actual_index:state.index},'Exact popstate callback with synthetic browser target; does not render the browser back button. URL view is correct but internal traversal index is not.');
  }
  const notif=paths[1];
  function notificationState(rows){
    let list=rows,count=rows.filter(n=>!n.is_read).length;const pending=deferred();
    const env={setNotifications:f=>{list=typeof f==='function'?f(list):f},setUnreadCount:f=>{count=typeof f==='function'?f(count):f},supabase:{from:()=>({update:()=>({eq:()=>pending.promise})})},log:{error:()=>{}},toast:{custom:()=>{}},createElement:()=>null,ReminderToast:()=>null};
    const mark=compile(expr(notif,'markAsRead'),env),sf=parsed[notif];
    const on=nodes(sf,n=>ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='on');assert.equal(on.length,1);
    const realtime=compile(on[0].arguments[2].getText(sf),env);
    return {mark,realtime,pending,get list(){return list},get count(){return count}};
  }
  {
    const s=notificationState([{id:'A',is_read:true},{id:'B',is_read:false}]);const op=s.mark('A');s.pending.resolve({error:null});await op;
    assert.equal(s.count,0);assert.equal(s.list.filter(n=>!n.is_read).length,1);
    note('PLAT-P02','Clicking an already read notification subtracts another unread item',{visible_unread_items:1,badge_count:s.count},'Exact mutation callback; NotificationItem invokes it even for a read row. Simulated successful update, no database write.');
  }
  {
    const s=notificationState([{id:'A',is_read:false},{id:'B',is_read:false}]);const op=s.mark('A');
    s.realtime({eventType:'UPDATE',new:{id:'A',is_read:true}});assert.equal(s.count,1);s.pending.resolve({error:null});await op;
    assert.equal(s.count,0);assert.equal(s.list.filter(n=>!n.is_read).length,1);
    note('PLAT-P03','Realtime update before mutation completion causes a second unread decrement',{event_order:['UPDATE A read','HTTP update completion'],visible_unread_items:1,badge_count:s.count},'Exact event and mutation callbacks with synthetic event order. Variant of the counter reconciliation defect; no actual Supabase subscription.');
  }
  function settingsHook(fail){
    let options,cache,calls=0;const db={from:()=>{calls++;return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{},error:null})})}),upsert:async()=>({error:fail?{message:'synthetic failure'}:null})}}};
    const queryClient={setQueryData:(_,v)=>{cache=typeof v==='function'?v(cache):v},invalidateQueries:()=>{}};
    const deps={'react':{useCallback:fn=>fn,useRef:v=>({current:v})},'@tanstack/react-query':{useQuery:o=>{options=o;return {isLoading:false}},useQueryClient:()=>queryClient},'@/integrations/supabase/client':{supabase:db},'@/hooks/auth/useAuth':{useAuth:()=>({user:{id:'fixture-user'}})},'@/lib/logger':{log:{warn:()=>{}}},'@/hooks/ui/use-toast':{toast:()=>{}}};
    const ex={},js=ts.transpileModule(codes[paths[2]],{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    new Function('exports','require',js)(ex,p=>{assert(p in deps,p);return deps[p]});const hook=ex.useNotificationSettings();
    return {hook,reload:()=>options.queryFn(),get cache(){return cache},get calls(){return calls}};
  }
  {
    const s=settingsHook(false);await s.hook.updateSettings({newMessageSound:false,mentionSound:false,slaBreachSound:false});assert.equal(s.calls,0);assert.equal(s.cache.mentionSound,false);
    const reloaded=await s.reload();assert.equal(reloaded.mentionSound,true);
    note('PLAT-P04','Three notification toggles change cache without issuing a database write',{writes_for_three_toggles:0,optimistic_mention_sound:false,mention_sound_after_reload:reloaded.mentionSound},'Exact whole settings hook with React Query/Auth/DB stubs. The current NotificationTypeSection exposes all three controls.');
  }
  {
    const s=settingsHook(true);let rejected=false;try{await s.hook.resetSettings()}catch{rejected=true}
    assert.equal(s.calls,1);assert.equal(rejected,false);assert.equal(s.cache.soundEnabled,true);
    note('PLAT-P05','Reset leaves defaults in cache and resolves despite returned database error',{db_error_returned:true,promise_rejected:rejected,cached_default_sound_enabled:s.cache.soundEnabled},'Exact reset hook. Static consumer announces reset before awaiting this promise; no real preference changed.');
  }
  {
    class FakeElement{constructor(tag,attrs){this.tagName=tag;this.attrs=new Map(Object.entries(attrs))}getAttribute(k){return this.attrs.get(k)??null}setAttribute(k,v){this.attrs.set(k,v)}removeAttribute(k){this.attrs.delete(k)}}
    const hooks={},install=compile(expr(paths[3],'installHooks'),{Element:FakeElement,STYLE_BLOCKED_PROPS:new Set(),cssUnescape:x=>x});install({addHook:(name,fn)=>{hooks[name]=fn}});
    const relative=new FakeElement('IMG',{src:'//tracker.example.invalid/pixel'}),absolute=new FakeElement('IMG',{src:'https://tracker.example.invalid/pixel'});
    hooks.afterSanitizeAttributes(relative);hooks.afterSanitizeAttributes(absolute);assert.equal(relative.getAttribute('src'),'//tracker.example.invalid/pixel');assert.equal(absolute.getAttribute('src'),null);
    note('COM-P10','Email image hook preserves protocol-relative remote URL while blocking its absolute equivalent',{relative_src_survives:true,absolute_src_removed:true,resolved_origin:new URL(relative.getAttribute('src'),'https://app.example.invalid/').origin},'Executes exact privacy hook with an Element substitute, not DOMPurify or a DOM/network stack. Official DOMPurify docs permit protocol-relative URLs by default; actual browser request and deployment CSP were not measured.');
  }
  {
    const storage=new Map(),localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
    function mountHistory(){
      let history;const effects=[];
      const react={useCallback:f=>f,useEffect:f=>effects.push(f),useState:initial=>{history=initial;return [history,v=>{history=typeof v==='function'?v(history):v}]}};
      const ex={},js=ts.transpileModule(codes[paths[4]],{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
      new Function('exports','require','localStorage',js)(ex,p=>{assert.equal(p,'react');return react},localStorage);
      const hook=ex.useSearchHistory();effects.forEach(f=>f());return {hook,get history(){return history}};
    }
    const first=mountHistory();first.hook.addToHistory('synthetic private query',3);
    const second=mountHistory();assert.equal(second.history[0].query,'synthetic private query');assert.equal(second.history[0].resultCount,3);
    note('PLAT-P06','A new hook instance reads the previous instance search history from a global key',{stored_key:[...storage.keys()][0],second_instance_query:second.history[0].query,second_instance_result_count:3},'Exact whole hook with synthetic React/localStorage. No actual login/logout or browser profile was exercised. Static Auth logout paths clear other caches but neither this key nor all localStorage; finding requires two sessions in the same browser origin/profile.');
  }
  {
    const notices=[],undone=[],pendingActionRef={current:null};let state,nextTimer=1;
    const execute=compile(expr(paths[5],'execute'),{timeoutRef:{current:null},intervalRef:{current:null},pendingActionRef,setState:v=>{state=typeof v==='function'?v(state):v},setTimeout:()=>nextTimer++,setInterval:()=>nextTimer++,clearTimeout:()=>{},clearInterval:()=>{},toast:{success:(message,options)=>notices.push({message,options}),error:message=>{throw new Error(message)}}});
    await execute({successMessage:'archive A',action:async()=>{},undoAction:async()=>{undone.push('A')}});
    await execute({successMessage:'archive B',action:async()=>{},undoAction:async()=>{undone.push('B')}});
    assert.equal(notices.length,2);await notices[0].options.action.onClick();assert.deepEqual(undone,['B']);
    note('PLAT-P07','Undo action from the older toast reverts the newer operation',{clicked_toast:'archive A',actual_undo:['B'],expected_undo:['A']},'Exact execute callback and its emitted toast closure with synthetic non-firing timers and no-op forward actions. Current bulkArchive consumer permits another operation after its mutation resolves; no Sonner UI, database or real archive executed.');
  }
  {
    const storage=new Map(),localStorage={setItem:(k,v)=>storage.set(k,v)};
    const saveShortcuts=compile(expr(paths[6],'saveShortcuts'),{localStorage,STORAGE_KEY:'custom-keyboard-shortcuts'});
    function instance(){let state=[{id:'A',defaultKey:'a',defaultModifiers:{}},{id:'B',defaultKey:'b',defaultModifiers:{}}];return {update:compile(expr(paths[6],'updateShortcut'),{saveShortcuts,setShortcuts:f=>{state=f(state)}}),get state(){return state}}}
    const rowA=instance(),rowB=instance(),global=instance();
    rowA.update('A','z',{ctrlKey:true});assert.equal(JSON.parse(storage.get('custom-keyboard-shortcuts')).A.key,'z');
    assert.equal(global.state[0].customKey,undefined);rowB.update('B','x',{altKey:true});const persisted=JSON.parse(storage.get('custom-keyboard-shortcuts'));
    assert.equal(persisted.A,undefined);assert.equal(persisted.B.key,'x');
    note('PLAT-P08','Independent shortcut instances overwrite the prior row customization',{first_save_keys:['A'],second_save_keys:Object.keys(persisted),first_customization_lost:true,mounted_global_still_default:true},'Exact saveShortcuts/updateShortcut callbacks, synthetic two-entry registry and localStorage. Current settings uses one hook per row plus a parent hook; global listener has another. This proves isolated state/write behavior, not a mounted React or keyboard interaction test.');
  }
  const result={schema_version:1,source_head:integrity.head_sha,source_integrity_sha256:crypto.createHash('sha256').update(integrityBytes).digest('hex'),source_files:pins,script_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),typescript_version:ts.version,probes,network_calls:0,product_writes:0,method:'Exact AST callbacks or whole modules, all HEAD/blob checks before evaluation. Explicit synthetic state/DB/Element boundaries; no browser rendering.'};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({probes:probes.length,passed:probes.length,output}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
