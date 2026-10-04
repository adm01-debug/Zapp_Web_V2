#!/usr/bin/env node
// Offline counterexamples from exact pinned components/hooks. No ReactDOM or network.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const [source,integrityPath,tsPath,output]=process.argv.slice(2);
if(!output)throw new Error('Usage: node queue_tail_probes.cjs SOURCE INTEGRITY TYPESCRIPT OUTPUT');
const integrityBytes=fs.readFileSync(integrityPath),integrity=JSON.parse(integrityBytes);
assert.equal(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),integrity.head_sha);
const paths=['src/components/queues/PeriodSelector.tsx','src/components/queues/QueuesComparisonCharts.tsx',
  'src/components/queues/AddMemberDialog.tsx','src/hooks/business/useQueuesComparison.ts',
  'src/components/queues/QueuesComparisonDashboard.tsx','src/components/queues/QueuesView.tsx',
  'supabase/migrations/20251220130243_14f0f8fe-6186-499e-8eee-e7d0f8e9cfd8.sql'];
const code={},pins=[];
for(const p of paths){const b=fs.readFileSync(path.join(source,p));const blob=crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
  assert.equal(blob,integrity.files.find(x=>x.path===p).git_blob_sha,p);code[p]=b.toString();pins.push({path:p,git_blob_sha:blob,sha256:crypto.createHash('sha256').update(b).digest('hex')});}
const ts=require(path.resolve(tsPath));
const jsx=(type,props,key)=>({type,props:props||{},key});
function stateHarness(){const states=[],refs=[],callbacks=[];let cursor=0,refCursor=0;return {states,callbacks,reset(){cursor=0;refCursor=0;callbacks.length=0},
  react:{useState:init=>{const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]},
  useRef:init=>{const i=refCursor++;return refs[i]??(refs[i]={current:init})},useEffect:()=>{},useMemo:fn=>fn(),useCallback:fn=>{callbacks.push(fn);return fn;}}};}
const componentStubs=new Proxy({},{get:(_,name)=>String(name)});
function load(p,h,extra={}){const deps={'react':h.react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
  'date-fns':{format:d=>d.toISOString(),subDays:(d,n)=>new Date(d.getTime()-n*864e5)},'date-fns/locale':{ptBR:{}},
  '@/lib/utils':{cn:(...x)=>x.filter(Boolean).join(' ')},'@/lib/logger':{log:{error:()=>{}}},...extra};
  const js=ts.transpileModule(code[p],{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const ex={};new Function('exports','require',js)(ex,n=>{if(n in deps)return deps[n];assert(n.startsWith('@/components/ui/')||n==='lucide-react'||n==='recharts',n);return componentStubs});return ex;}
function nodes(tree){if(tree===null||tree===undefined||typeof tree==='boolean')return [];if(Array.isArray(tree))return tree.flatMap(nodes);if(typeof tree!=='object')return [tree];return [tree,...nodes(tree.props?.children)];}
function find(tree,type){return nodes(tree).filter(x=>x&&typeof x==='object'&&x.type===type);}
function text(tree){return nodes(tree).filter(x=>typeof x==='string').join(' ');}
function chain(result,log){const q=new Proxy({},{get:(_,key)=>key==='then'?(resolve,reject)=>Promise.resolve(typeof result==='function'?result(log):result).then(resolve,reject):(...args)=>{log?.push([key,...args]);return q}});return q;}
const probes=[];
async function main(){
  const h=stateHarness(),period=load(paths[0],h).PeriodSelector;let emitted=null;
  const props={value:'custom',dateRange:{from:new Date('2000-01-01T00:00:00Z'),to:new Date('2000-01-10T00:00:00Z')},onChange:(v,r)=>{emitted={value:v,range:r}}};
  function renderPeriod(){h.reset();return period(props)}
  let tree=renderPeriod();find(tree,'Calendar')[0].props.onSelect(new Date('2000-01-15T00:00:00Z'));
  tree=renderPeriod();const apply=find(tree,'Button').find(x=>text(x).includes('Aplicar'));
  assert.equal(apply.props.disabled,false);apply.props.onClick();assert(emitted.range.from>emitted.range.to);
  const logs=[],qh=stateHarness();const supabase={from:table=>{const log=[['from',table]];logs.push(log);return chain(table==='queues'?{data:[{id:'q1',name:'Fila',color:'#123456'}],error:null}:table==='contacts'?{data:[{id:'c1',queue_id:'q1',assigned_to:null}],error:null}:table==='queue_members'?{data:[],error:null}:{data:[],error:null},log)}};
  const hook=load(paths[3],qh,{'@/integrations/supabase/client':{supabase}}).useQueuesComparison;
  qh.reset();await hook(emitted.range).refetch();const messageQuery=logs.find(x=>x[0][1]==='messages');
  assert.equal(messageQuery.find(x=>x[0]==='gte')[2],'2000-01-15T00:00:00.000Z');assert.equal(messageQuery.find(x=>x[0]==='lte')[2],'2000-01-10T00:00:00.000Z');
  find(tree,'Calendar')[1].props.onSelect(new Date('2000-01-20T00:00:00Z'));tree=renderPeriod();find(tree,'Button').find(x=>text(x).includes('Aplicar')).props.onClick();assert(emitted.range.from<=emitted.range.to);
  probes.push({id:'ROOT-P07',status:'PASS',title:'Custom period sends reversed bounds through the actual comparison hook',observed:{apply_enabled_for_reversed_range:true,message_query:messageQuery,positive_control_ordered_range:true},limits:'Whole selector and hook with captured JSX/state and synthetic PostgREST builder. Confirms transmitted bounds, not a live database response or calendar interaction.'});

  const charts=load(paths[1],stateHarness()).QueuesComparisonCharts;
  const queues=[{id:'q1',name:'Suporte',color:'#112233',totalContacts:10,totalMessages:10,agentsCount:1,avgMessagesPerContact:1,assignedContacts:10},
    {id:'q2',name:'Suporte',color:'#334455',totalContacts:5,totalMessages:5,agentsCount:2,avgMessagesPerContact:1,assignedContacts:0}];
  tree=charts({queuesPerformance:queues});const radar=find(tree,'RadarChart')[0],series=find(tree,'Radar');
  assert.equal(series.length,2);assert.deepEqual(series.map(x=>x.props.dataKey),['Suporte','Suporte']);assert.equal(radar.props.data[0].Suporte,50);assert.equal(radar.props.data[4].Suporte,0);
  const distinct=charts({queuesPerformance:[queues[0],{...queues[1],name:'Vendas'}]});assert.equal(find(distinct,'RadarChart')[0].props.data[0].Suporte,100);assert.equal(find(distinct,'RadarChart')[0].props.data[0].Vendas,50);
  probes.push({id:'ROOT-P08',status:'PASS',title:'Two allowed equal queue names collapse the radar series',observed:{queue_ids:queues.map(x=>x.id),radar_keys:series.map(x=>x.props.dataKey),contact_axis:radar.props.data[0],assigned_axis:radar.props.data[4],positive_control_distinct_names:true},limits:'Exact chart component projected to JSX/data; no Recharts rendering. Local schema/history adjudication establishes names are not unique; live schema and live queue data were not inspected.'});

  const ah=stateHarness();let profileResult={data:null,error:{code:'42501',message:'fixture denied'}};
  const dialog=load(paths[2],ah,{'@/integrations/supabase/client':{supabase:{from:()=>chain(()=>profileResult)}}}).AddMemberDialog;
  const dialogProps={open:true,onOpenChange:()=>{},queueId:'q1',existingMemberIds:[],onAddMember:async()=>{}};
  function renderDialog(){ah.reset();return dialog(dialogProps)}renderDialog();await ah.callbacks[0]();tree=renderDialog();assert(text(tree).includes('Todos os atendentes já estão nesta fila.'));
  const errorText=text(tree);profileResult={data:[{id:'p1',name:'Atendente',avatar_url:null,is_active:true}],error:null};await ah.callbacks[0]();tree=renderDialog();assert(!text(tree).includes('Todos os atendentes já estão'));assert(text(tree).includes('Atendente'));
  probes.push({id:'ROOT-P09',status:'PASS',title:'Profile query denial is presented as all agents already belonging to the queue',observed:{error_code:'42501',visible_text_after_denial:errorText,positive_control_available_profile_visible:true},limits:'Whole dialog, callback and synthetic query/state. No permission bypass, live account, actual add operation or browser rendering.'});

  const rh=stateHarness(),pending=[],a={from:new Date('2000-01-01'),to:new Date('2000-01-07')},b={from:new Date('2000-01-10'),to:new Date('2000-01-20')};
  const rs={from:table=>table==='messages'?chain(()=>new Promise(resolve=>pending.push(resolve))):chain(table==='queues'?{data:[{id:'q1',name:'Fila',color:'#123456'}],error:null}:table==='contacts'?{data:[{id:'c1',queue_id:'q1',assigned_to:null}],error:null}:{data:[],error:null})};
  const raceHook=load(paths[3],rh,{'@/integrations/supabase/client':{supabase:rs}}).useQueuesComparison;
  rh.reset();const old=raceHook(a).refetch();for(let i=0;i<30&&pending.length<1;i++)await Promise.resolve();assert.equal(pending.length,1);
  rh.reset();const newer=raceHook(b).refetch();for(let i=0;i<30&&pending.length<2;i++)await Promise.resolve();assert.equal(pending.length,2);
  pending[1]({data:[{contact_id:'c1'},{contact_id:'c1'}],error:null});await newer;assert.equal(rh.states[0][0].totalMessages,2);
  pending[0]({data:[{contact_id:'c1'}],error:null});await old;assert.equal(rh.states[0][0].totalMessages,1);
  probes.push({id:'ROOT-P10',status:'PASS',title:'An older period response overwrites the completed newer period',observed:{newer_result_before_old_return:2,result_after_old_return:1,current_selected_period:b},limits:'Two exact callbacks from the same mounted hook with shared synthetic state and deliberately reordered promise resolution. Effect scheduling, ReactDOM and actual network latency were not exercised.'});

  const result={schema_version:1,source_head:integrity.head_sha,source_integrity_sha256:crypto.createHash('sha256').update(integrityBytes).digest('hex'),source_files:pins,script_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),typescript_version:ts.version,probes,network_calls:0,product_writes:0};
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({probes:probes.length,passed:probes.length,output}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
