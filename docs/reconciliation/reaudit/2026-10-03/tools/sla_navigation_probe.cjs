#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const [source,integrityPath,tsPath,output]=process.argv.slice(2);
if(!output)throw new Error('Usage: node sla_navigation_probe.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT');
const bytes=fs.readFileSync(integrityPath),integrity=JSON.parse(bytes),code={},pins=[];
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),integrity.head_sha);
const paths=['src/pages/SLADashboard.tsx','src/pages/SLAHistory.tsx','src/components/layout/SidebarNavItem.tsx','src/components/layout/Sidebar.tsx','src/routes/AppRoutes.tsx'];
for(const p of paths){const b=fs.readFileSync(path.join(source,p)),blob=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');assert.equal(blob,integrity.files.find(x=>x.path===p).git_blob_sha,p);code[p]=b.toString();pins.push({path:p,git_blob_sha:blob,sha256:crypto.createHash('sha256').update(b).digest('hex')});}
const ts=require(path.resolve(tsPath)),jsx=(type,props,key)=>({type,props:props||{},key});
function nodes(t){if(t==null||typeof t==='boolean')return [];if(Array.isArray(t))return t.flatMap(nodes);return typeof t==='object'?[t,...nodes(t.props?.children)]:[];}
const observations=[];
for(const p of paths.slice(0,2)){
  let state,initialized=false;
  const react={useState:init=>{if(!initialized){state=init;initialized=true}return [state,v=>{state=typeof v==='function'?v(state):v}]}};
  const deps={'react':react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/components/layout/Sidebar':{Sidebar:'Sidebar'},'@/components/queues/SLADashboard':{SLADashboard:'SLADashboard'},'@/components/sla/SLAHistoryDashboard':{SLAHistoryDashboard:'SLAHistoryDashboard'},'@/components/dashboard/FloatingParticles':{FloatingParticles:'FloatingParticles'},'@/components/effects/AuroraBorealis':{AuroraBorealis:'AuroraBorealis'}};
  const ex={},js=ts.transpileModule(code[p],{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('exports','require',js)(ex,n=>{assert(n in deps,n);return deps[n]});
  const before=ex.default(),beforeTypes=nodes(before).map(x=>x.type);nodes(before).find(x=>x.type==='Sidebar').props.onViewChange('inbox');
  const after=ex.default(),side=nodes(after).find(x=>x.type==='Sidebar');assert.equal(side.props.currentView,'inbox');assert.deepEqual(nodes(after).map(x=>x.type),beforeTypes);
  observations.push({path:p,selected_view:side.props.currentView,rendered_component_types:beforeTypes});
}
const result={schema_version:1,source_head:integrity.head_sha,source_integrity_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),source_files:pins,script_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),typescript_version:ts.version,
  probes:[{id:'PLAT-P11',status:'PASS',title:'SLA route sidebars change a local selection while keeping the SLA body',observations,limits:'Both exact page components with captured JSX and synthetic useState. Real SidebarNavItem wiring and AppRoutes are source-reviewed. No browser routing, click, accessibility tree or authenticated account was exercised.'}],network_calls:0,product_writes:0};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({probes:1,passed:1,output}));
