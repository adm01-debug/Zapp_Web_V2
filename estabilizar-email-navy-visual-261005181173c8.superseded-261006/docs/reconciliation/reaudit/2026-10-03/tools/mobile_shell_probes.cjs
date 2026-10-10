#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const [source,integrityPath,tsPath,output]=process.argv.slice(2);
if(!output)throw new Error('Usage: node mobile_shell_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT');
const bytes=fs.readFileSync(integrityPath),integrity=JSON.parse(bytes),pins=[],code={};
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),integrity.head_sha);
const paths=['src/components/mobile/MobileShell.tsx','src/components/mobile/MobileHeader.tsx','src/components/mobile/NotificationsPanel.tsx','src/pages/Index.tsx','src/components/layout/AppShell.tsx'];
for(const p of paths){
  const b=fs.readFileSync(path.join(source,p)),sha=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
  assert.equal(sha,integrity.files.find(x=>x.path===p).git_blob_sha,p);
  code[p]=b.toString('utf8');pins.push({path:p,git_blob_sha:sha,sha256:crypto.createHash('sha256').update(b).digest('hex')});
}
const ts=require(path.resolve(tsPath));
const jsx=(type,props,key)=>({type,props,key}),states=[];let cursor=0;
const react={useState:init=>{const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]},useCallback:fn=>fn,useMemo:fn=>fn()};
const deps={'react':react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'@/hooks/ui/useKeyboardHeight':{useKeyboardHeight:()=>({isKeyboardOpen:false})},'lucide-react':Object.fromEntries(['MessageSquare','BarChart3','Users','MessagesSquare','Mail','Menu'].map(k=>[k,k]))};
for(const name of ['MobileHeader','MobileDrawerMenu','NotificationsPanel','MobileFAB'])deps['@/components/mobile/'+name]={[name]:name};
deps['@/components/ui/mobile-components']={BottomNavigation:'BottomNavigation'};
const ex={},js=ts.transpileModule(code[paths[0]],{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('exports','require',js)(ex,n=>{assert(n in deps,n);return deps[n]});
const props={currentView:'inbox',setCurrentView:()=>{},profile:{name:'Fixture'},userEmail:'fixture@example.invalid',signOut:()=>{},unreadNotifications:0};
function render(){cursor=0;return ex.MobileShell(props);}
function children(tree){return tree.props.children.flat().filter(Boolean);}
function child(tree,type){const matches=children(tree).filter(x=>x.type===type);assert.equal(matches.length,1,type);return matches[0];}
const initial=render(),initialTypes=children(initial).map(x=>x.type);
child(initial,'MobileHeader').props.onSearchOpen();
const afterSearch=render();assert.equal(states[1],true);assert.deepEqual(children(afterSearch).map(x=>x.type),initialTypes);
assert.equal(child(afterSearch,'MobileDrawerMenu').props.isOpen,false);assert.equal(child(afterSearch,'NotificationsPanel').props.isOpen,false);
const probes=[{id:'PLAT-P09',status:'PASS',title:'Mobile search changes an unused flag without rendering a search surface',observed:{search_state:true,rendered_child_types:initialTypes,drawer_open:false,notifications_open:false},limitations:'Whole MobileShell with captured JSX and synthetic hook state. The header button wiring is source-verified; no ReactDOM, actual click, CSS or browser rendering.'}];
child(afterSearch,'MobileHeader').props.onNotificationsOpen();
const afterBell=render(),panel=child(afterBell,'NotificationsPanel'),header=child(afterBell,'MobileHeader');
assert.equal(panel.props.isOpen,true);assert.equal(panel.props.notifications.length,0);assert.equal(header.props.unreadCount,0);
const sf=ts.createSourceFile(paths[3],code[paths[3]],ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),attrs=[];
function visit(n){if(ts.isJsxAttribute(n)&&n.name.getText(sf)==='unreadNotifications')attrs.push(n);ts.forEachChild(n,visit)}visit(sf);
assert.equal(attrs.length,1);assert.equal(attrs[0].initializer.expression.getText(sf),'0');
probes.push({id:'PLAT-P10',status:'PASS',title:'Mobile notification panel opens with the disconnected empty state and the actual hardcoded zero badge',observed:{panel_open:true,notifications:0,header_unread:0,index_prop_literal:0,notification_data_dependencies:0},limitations:'Whole shell, JSX and literal prop from Index. Existing real notifications are a conditional precondition for the user-facing mismatch, not data read from a live account. The parent has no query/subscription to populate its private notification array; desktop hooks are separate.'});
const result={schema_version:1,source_head:integrity.head_sha,source_integrity_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),source_files:pins,script_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),typescript_version:ts.version,probes,network_calls:0,product_writes:0,method:'All HEAD/blob checks before TypeScript/evaluation. Full shell with captured JSX; explicit React and component boundaries. No browser or product write.'};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({probes:probes.length,passed:probes.length,output}));
