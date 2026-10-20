'use strict';
// Offline only. Source remains untouched. No network, database, credentials or product scripts.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ts = require(process.env.REAUDIT_TYPESCRIPT || '/workspace/scratch/8b95153002da/audit/tools/ast/node_modules/typescript');
const ROOT = path.resolve(process.env.REAUDIT_SOURCE_ROOT || path.join(__dirname, '../../source'));
const PINS_PATH = path.resolve(process.env.REAUDIT_SOURCE_PINS || path.join(__dirname, 'second-pass-pins.json'));
const INTEGRITY_PATH = path.resolve(process.env.REAUDIT_INTEGRITY || path.join(ROOT, '../source-integrity.json'));
const expectedPins=JSON.parse(fs.readFileSync(PINS_PATH,'utf8'));
const integrityBytes=fs.readFileSync(INTEGRITY_PATH);
assert.equal(crypto.createHash('sha256').update(integrityBytes).digest('hex'),expectedPins.integrity_manifest_sha256,'Integrity manifest digest changed');
const integrity=JSON.parse(integrityBytes.toString('utf8'));
assert.equal(integrity.head_sha,expectedPins.expected_head,'HEAD differs from persisted pins');
assert.equal(integrity.mismatches.length,0,'Integrity manifest contains mismatches');
if(fs.existsSync(path.join(ROOT,'.git'))) {
 const actualHead=require('node:child_process').execFileSync('git',['-C',ROOT,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.equal(actualHead,expectedPins.expected_head,'Git checkout HEAD differs from pins');
}
const verifiedSources=new Map();
const expectedByPath=new Map(expectedPins.files.map(x=>[x.path,x]));
const integrityByPath=new Map(integrity.files.map(x=>[x.path,x]));
function blobBytes(bytes) {return crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');}
// Preflight completes BEFORE loading/transpiling/executing any product source.
for(const pin of expectedPins.files) {
 assert.equal(integrityByPath.get(pin.path)?.git_blob_sha,pin.git_blob_sha,'Pins mismatch integrity: '+pin.path);
 const bytes=fs.readFileSync(path.join(ROOT,pin.path));
 assert.equal(bytes.length,pin.bytes,'Source size mismatch before execution: '+pin.path);
 assert.equal(blobBytes(bytes),pin.git_blob_sha,'Source hash mismatch before execution: '+pin.path);
 verifiedSources.set(pin.path,bytes.toString('utf8'));
}
const OUT = path.resolve(process.env.REAUDIT_OUTPUT || path.join(__dirname,'second-pass-results.json'));
const results=[];
function source(file) { assert(verifiedSources.has(file),'Unpinned product source requested: '+file); return verifiedSources.get(file); }
function sha(file) { assert(expectedByPath.has(file),'Unpinned source hash: '+file); const data=fs.readFileSync(path.join(ROOT,file));assert.equal(blobBytes(data),expectedByPath.get(file).git_blob_sha,'Source changed during probe: '+file);return expectedByPath.get(file).git_blob_sha; }
function transpile(code) { return ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText; }
function load(file,mocks,globals={},sourceOverride) {
 const module={exports:{}};
 const sandbox={module,exports:module.exports,require:(name)=>{if(!(name in mocks))throw new Error('Unexpected import '+name);return mocks[name];},Buffer,TextEncoder,TextDecoder,URL,Uint8Array,ArrayBuffer,Date,JSON,Map,Set,Promise,Request,Response,Headers,atob,btoa,crypto:crypto.webcrypto,...globals};
 vm.runInNewContext(transpile(sourceOverride ?? source(file)),sandbox,{filename:file,timeout:2000});
 return module.exports;
}
function expression(file,name,globals) {
 const text=source(file); const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX); let match;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)===name)match=n.initializer;ts.forEachChild(n,visit);}visit(ast);
 assert(match,'missing symbol '+name);
 if(ts.isCallExpression(match)&&match.expression.getText(ast)==='useCallback')match=match.arguments[0];
 assert(ts.isArrowFunction(match)||ts.isFunctionExpression(match),'expected callable '+name);
 const sandbox={...globals,exports:{},Date,JSON,Map,Set,Promise};
 vm.runInNewContext(transpile('exports.fn = '+match.getText(ast)+';'),sandbox,{filename:file+'#'+name,timeout:2000});
 return sandbox.exports.fn;
}
function record(id,files,observed,limit) { results.push({id,status:'PASS_REPRODUCED',source:files.map(file=>({file,blob_sha:sha(file)})),observed,limitation:limit}); }
function declaration(file,name,globals) {
 const raw=source(file),ast=ts.createSourceFile(file,raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
 assert(node,'Missing function declaration '+name);
 const sandbox={exports:{},...globals};
 vm.runInNewContext(transpile(node.getText(ast)+'\nexports.Component = '+name+';'),sandbox,{filename:file+'#'+name,timeout:2000});
 return sandbox.exports.Component;
}
function findElement(tree,predicate) {
 if(!tree || typeof tree!=='object')return null;
 if(predicate(tree))return tree;
 for(const child of tree.children||[]){const found=findElement(child,predicate);if(found)return found;}
 return null;
}
async function editableFieldProbe() {
 const file='src/components/inbox/contact-details/ContactInfoSection.tsx';
 const writes=[],toasts=[],slots=[];let cursor=0;
 const hooks={
  useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
  useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
  useEffect(fn,deps){const i=cursor++;if(!(i in slots)){slots[i]={deps,cleanup:fn()};}},
  useCallback(fn){cursor++;return fn;},
 };
 const client={from(table){let patch;return {update(value){patch=value;return this;},eq(field,id){writes.push({table,field,id,patch});return Promise.resolve({error:null});}};}};
 const update=expression(file,'updateContact',{supabase:client,contact:{id:'contact-synthetic'},queryClient:{invalidateQueries(){}}});
 const Component=declaration(file,'EditableField',{...hooks,React:{createElement:(type,props,...children)=>({type,props:props||{},children})},Input:'Input',Button:'Button',Pencil:'Pencil',Check:'Check',X:'X',toast:{success:s=>toasts.push(['success',s]),error:s=>toasts.push(['error',s])}});
 function render(value){cursor=0;return Component({value,icon:null,onSave:value=>update('company',value),placeholder:'Adicionar empresa',label:'Empresa'});}
 // Same mounted field; async enriched query first has no data, then resolves.
 render('');
 let tree=render('Empresa sintética existente');
 const edit=findElement(tree,x=>x.type==='Button'&&x.children.some(c=>c?.type==='Pencil'));
 assert(edit,'Edit button after enriched value arrival');edit.props.onClick();
 tree=render('Empresa sintética existente');
 const input=findElement(tree,x=>x.type==='Input');assert(input);assert.equal(input.props.value,'');
 const save=findElement(tree,x=>x.type==='Button'&&x.children.some(c=>c?.type==='Check'));
 assert(save);await save.props.onClick();
 assert.equal(writes.length,1);assert.equal(writes[0].id,'contact-synthetic');assert.equal(writes[0].patch.company,'');
 assert.equal(toasts[0][0],'success');
 record('P-AUTH-09',[file,'src/components/inbox/contact-details/ContactAccordionSections.tsx','src/components/inbox/contact-details/contactDetailSections.ts','src/hooks/crm/useContactEnrichedData.ts','src/components/inbox/ContactDetails.tsx','src/components/inbox/RealtimeInboxView.tsx'],{initial_prop:'',resolved_prop:'Empresa sintética existente',input_on_first_edit:'',update_id:writes[0].id,company_update:writes[0].patch.company,toast:toasts[0],same_component_same_contact:true},'Actual EditableField declaration and updateContact closure, transpiled unchanged. Minimal React hook/JSX scheduler models same-instance prop update; SDK is a recording stub. Parent info-open default and asynchronous query are source evidence. No browser, network, database or cross-contact claim.');
}
async function rateLimitSaveProbe() {
 const file='src/components/security/RateLimitConfigPanel.tsx';
 let rows=[{id:'prior-rule',name:'Anterior'}],failInsert=true;const writes=[],toasts=[];let displayed=[];
 const client={from(table){let op='read';const q={select(){return q;},order(){return q;},delete(){op='delete';return q;},neq(){return q;},insert(value){writes.push(value);if(failInsert)return Promise.resolve({error:{code:'synthetic insertion failure'}});rows=value;return Promise.resolve({error:null});},then(resolve,reject){if(op==='delete')rows=[];return Promise.resolve({data:rows,error:null}).then(resolve,reject);}};return q;}};
 const fetchRules=expression(file,'fetchRules',{supabase:client,setLoading(){},setRules:value=>{displayed=value;},DEFAULT_RULES:[]});
 const rules=[{id:'ui-rule',name:'Webhooks',endpoint:'/webhooks/*',max_requests:500,window_seconds:60,is_active:true,action:'alert'}];
 const saveRules=expression(file,'saveRules',{supabase:client,rules,setSaving(){},fetchRules,toast:{success:s=>toasts.push(['success',s]),error:s=>toasts.push(['error',s])}});
 await saveRules();assert.equal(rows.length,0);assert.equal(toasts[0][0],'error');
 const lostOnError=rows.length;
 failInsert=false;await saveRules();
 assert.equal(rows.length,1);assert.equal('action' in rows[0],false);assert.equal(displayed[0].action,'block');
 record('P-AUTH-10',[file],{insert_error_after_delete_remaining_rows:lostOnError,input_action:'alert',persisted_action_present:'action' in rows[0],reloaded_action:displayed[0].action,final_toast:toasts.at(-1)},'Actual saveRules and fetchRules closures with sequential SDK-shaped responses. Demonstrates committed-delete loss and non-persistence of action, not live enforcement; R2-AUTH-022 separately addresses disconnected enforcement.');
}
(async()=>{
 await editableFieldProbe();await rateLimitSaveProbe();
 const output={created_at:new Date().toISOString(),source_head:expectedPins.expected_head,provenance:{pins_path:PINS_PATH,integrity_path:INTEGRITY_PATH,integrity_manifest_sha256:expectedPins.integrity_manifest_sha256,verified_source_files:expectedPins.files.length,verified_before_execution:true,source_kind:fs.existsSync(path.join(ROOT,'.git'))?'git_checkout':'materialized_git_tree'},network_calls:0,database_calls:0,source_modified:false,method:'Actual source declarations/closures, TypeScript transpilation, explicit synthetic React/SDK boundaries',results};
 fs.writeFileSync(OUT,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({passed:results.length,probes:results.map(r=>r.id),output:OUT}));
})().catch(error=>{console.error(error);process.exitCode=1;});
