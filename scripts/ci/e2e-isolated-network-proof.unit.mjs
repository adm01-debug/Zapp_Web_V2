import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { X509Certificate } from 'node:crypto';
import { chmodSync, linkSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rootCertificates } from 'node:tls';
import { ADDRESS, DEVICE, DRIVER, VERSION, assertCanary, assertContainer, assertControl, assertEngineResult, assertFailure, assertTopology,
  commandOutput, digest, dummyIsLoaded, identity, parseJson, publicFailureCode, requestScope } from '../e2e-isolated/network-proof-policy.mjs';
import { passiveDummy, probeBrowserTlsControl, protocolFileIdentity, readBoundedJson, tlsControlRejected, waitForJson, writeAtomicJson } from '../e2e-isolated/network-proof-browser.mjs';
import { tlsEnvironment, tlsMounts, TLS_ORIGIN, TLS_PUBLIC } from '../e2e-isolated/tls.mjs';
import { browserEnvironment } from '../e2e-isolated/runtime-contract.mjs';
import { HostCanary, NativeRuntime, collectCompletedProof, orchestrateProof, runCommand, validatePublicReport } from '../e2e-isolated/network-proof.mjs';

const ID=identity('zapp-e2e-unit-00000000','1'.repeat(40));
const clone=x=>structuredClone(x);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function topology(variant='baseline',state='up',ipv6=true){
  const lo={ifindex:1,ifname:'lo',flags:['LOOPBACK','UP','LOWER_UP'],operstate:'UNKNOWN',link_type:'loopback'};
  const dummy={ifindex:2,ifname:DEVICE,flags:['BROADCAST','NOARP',...(state==='up'?['UP','LOWER_UP']:[])],operstate:state==='up'?'UNKNOWN':'DOWN',link_type:'ether',linkinfo:{info_kind:'dummy'}};
  const route=(type,dst,dev,prefsrc)=>({type,dst,dev,prefsrc,table:'local',protocol:'kernel',scope:'host',flags:state==='down'&&dev===DEVICE?['linkdown']:[]});
  return {namespace:'net:[1234]',official_host_local:true,links:variant==='baseline'?[lo]:[lo,dummy],
    syslinks:(variant==='baseline'?[lo]:[lo,dummy]).map(x=>({name:x.ifname,ifindex:x.ifindex,iflink:x.ifindex})),
    addresses:[{ifname:'lo',ifindex:1,addr_info:[{family:'inet',local:'127.0.0.1',prefixlen:8,scope:'host'},...(ipv6?[{family:'inet6',local:'::1',prefixlen:128,scope:'host'}]:[])]},
      ...(variant==='candidate'?[{ifname:DEVICE,ifindex:2,addr_info:[{family:'inet',local:ADDRESS,prefixlen:32,scope:'global'}]}]:[])],
    routes4:[route('local','127.0.0.0/8','lo','127.0.0.1'),route('local','127.0.0.1','lo','127.0.0.1'),route('broadcast','127.255.255.255','lo','127.0.0.1'),
      ...(variant==='candidate'?[route('local',ADDRESS,DEVICE,ADDRESS)]:[])],
    routes6:ipv6?[{type:'local',dst:'::1',dev:'lo',table:'local',protocol:'kernel',metric:0,flags:[],pref:'medium'}]:[],
    rules4:[{priority:0,src:'all',table:'local'},{priority:32766,src:'all',table:'main'},{priority:32767,src:'all',table:'default'}],
    rules6:[{priority:0,src:'all',table:'local'},{priority:32766,src:'all',table:'main'}]};
}
function engineProof(variant='baseline',engine='chromium'){
  return {...ID,variant,engine,native:{online:variant==='candidate',https:true,node_https:true,tls_untrusted_rejected:true,tls_wrong_san_rejected:true},
    emulation:variant==='candidate'?{offline_online:false,offline_blocked:true,offline_event:true,online_online:true,online_https:true,online_event:true}:null,
    link:variant==='candidate'?{down_online:false,down_event:true,up_online:true,up_event:true,https_after_up:true,unemulated:true}:null,
    fresh:{online:variant==='candidate',https:true,unemulated:true},external:{node_blocked:true,browser_blocked:true},
    versions:{node:'v22.16.0',playwright:VERSION,browser:'146.0.0.0'},node_navigator_online:'unavailable'};
}
function containerFixture(helper=false){
  const expected={...ID,name:'unit',id:'a'.repeat(64),image_id:'sha256:'+'b'.repeat(64),user:helper?'0:0':'1001:1001',helper,network:'none',mounts:[{source:'/repo',target:'/work',write:false}]};
  const c={Id:expected.id,Image:expected.image_id,Name:'/unit',Config:{Image:DRIVER,User:expected.user,Labels:{'zapp.e2e.owner':ID.run_id,'zapp.e2e.purpose':'network-proof','zapp.e2e.source':ID.source_sha}},
    HostConfig:{NetworkMode:'none',Privileged:false,PublishAllPorts:false,PortBindings:{},PidMode:'',IpcMode:'private',UTSMode:'',UsernsMode:'',CapDrop:['ALL'],CapAdd:helper?['NET_ADMIN']:null,SecurityOpt:['no-new-privileges:true']},
    NetworkSettings:{Ports:{},Networks:{none:{}}},Mounts:[{Type:'bind',Source:'/repo',Destination:'/work',RW:false}]};
  return {expected,c};
}
for(const [variant,state,ipv6] of [['baseline','up',true],['baseline','up',false],['candidate','up',true],['candidate','down',true],['candidate','up',false]])
  test('accept exact topology '+[variant,state,ipv6].join('/'),()=>assert.equal(assertTopology(topology(variant,state,ipv6),variant,state).topology_valid,true));
const topologyMutations={
  'extra interface':s=>s.links.push({...s.links[1],ifname:'eth0',ifindex:3}),
  'missing lo':s=>s.links.shift(),'duplicate ifindex':s=>s.links[1].ifindex=1,
  'peer ifindex':s=>s.links[1].link_index=3,'namespace peer':s=>s.links[1].link_netnsid=0,
  'master':s=>s.links[1].master='bridge0','iflink points elsewhere':s=>s.syslinks[1].iflink=3,
  'sysfs interface absent':s=>s.syslinks.pop(),'wrong dummy kind':s=>s.links[1].linkinfo.info_kind='veth',
  'slave kind':s=>s.links[1].linkinfo.info_slave_kind='bridge','wrong link type':s=>s.links[1].link_type='none',
  'dummy no admin up':s=>s.links[1].flags=s.links[1].flags.filter(x=>x!=='UP'),
  'dummy no carrier':s=>s.links[1].flags=s.links[1].flags.filter(x=>x!=='LOWER_UP'),
  'dummy dormant':s=>s.links[1].operstate='DORMANT','extra flag':s=>s.links[1].flags.push('MULTICAST'),
  'lo down':s=>s.links[0].operstate='DOWN','lo no v4':s=>s.addresses[0].addr_info.shift(),
  'wrong dummy address':s=>s.addresses[1].addr_info[0].local='10.0.0.1',
  'wrong dummy prefix':s=>s.addresses[1].addr_info[0].prefixlen=24,
  'extra dummy ipv6':s=>s.addresses[1].addr_info.push({family:'inet6',local:'fe80::1',prefixlen:64,scope:'link'}),
  'duplicate address':s=>s.addresses[0].addr_info.push(clone(s.addresses[0].addr_info[0])),
  'point to point address':s=>s.addresses[1].addr_info[0].peer='192.0.2.2',
  'address wrong interface':s=>s.addresses[1].ifindex=19,
  'default route':s=>s.routes4.push({dst:'default',dev:DEVICE,protocol:'kernel',gateway:'192.0.2.2'}),
  'unicast route':s=>s.routes4.push({dst:'192.0.2.0/24',dev:DEVICE,protocol:'kernel',scope:'link'}),
  'gateway attached to local route':s=>s.routes4[0].gateway='10.0.0.1',
  'unknown route property':s=>s.routes4[0].nexthops=[],
  'nonkernel route':s=>s.routes4[0].protocol='static',
  'duplicate route':s=>s.routes4.push(clone(s.routes4[0])),
  'missing local route':s=>s.routes4.shift(),'missing dummy local route':s=>s.routes4.pop(),
  'ipv6 external route':s=>s.routes6.push({dst:'2001:db8::/64',dev:DEVICE,table:'main',protocol:'kernel'}),
  'ipv6 multicast remains unproved':s=>s.routes6.push({dst:'ff00::/8',dev:DEVICE,table:'local',protocol:'kernel'}),
  'ipv6 loopback route absent':s=>s.routes6=[],
  'extra routing rule':s=>s.rules4.push({priority:100,src:'all',table:100}),
  'missing routing rule':s=>s.rules4.shift(),'routing selector':s=>s.rules6[0].fwmark='0x1',
  'duplicate rule':s=>s.rules6.push(clone(s.rules6[0])),
  'wrong source rule':s=>s.rules4[0].src='10.0.0.0/8',
  'official host not neutralized':s=>s.official_host_local=false,
  'invalid namespace':s=>s.namespace='host','extra raw data':s=>s.stdout='secret',
};
for(const [name,mutate] of Object.entries(topologyMutations))test('reject topology: '+name,()=>{const s=topology('candidate');mutate(s);assert.throws(()=>assertTopology(s,'candidate'));});
test('down topology cannot be mistaken for ready',()=>assert.throws(()=>assertTopology(topology('candidate','down'),'candidate','up')));
test('baseline does not admit candidate interface',()=>assert.throws(()=>assertTopology(topology('candidate'),'baseline')));
const live='dummy 16384 0 - Live 0x0000000000000000\n';
test('passive module requires both kernel sources',()=>assert.equal(dummyIsLoaded(live,'live\n'),true));
for(const [name,modules,sys] of [['absent','','live'],['coming',live.replace('Live','Coming'),'live'],['going',live.replace('Live','Going'),'live'],
  ['duplicate',live+live,'live'],['missing sysfs',live,''],['not live sysfs',live,'coming'],['ko path','/lib/modules/dummy.ko','live'],['builtin unproved','','live'],['read error',null,'live']])
  test('reject module '+name,()=>assert.equal(dummyIsLoaded(modules,sys),false));
test('sysfs access error stays unavailable',()=>assert.equal(passiveDummy(()=>{throw Error('no access');}),false));
const goodCommand={code:0,stdout:'{}',signal:null,error:null,timedOut:false,truncated:false};
test('command accepts complete zero exit',()=>assert.equal(commandOutput(goodCommand),'{}'));
for(const [key,value] of [['code',1],['code',null],['signal','SIGKILL'],['error',new Error('failed')],['timedOut',true],['truncated',true],['stdout',null],['stdout','x'.repeat(1024*1024+1)]])
  test('reject command '+key+':'+String(value).slice(0,15),()=>assert.throws(()=>commandOutput({...goodCommand,[key]:value})));
for(const text of ['{','[]\0','x'.repeat(65537)])test('reject malformed or oversized JSON '+text.length,()=>assert.throws(()=>parseJson(text)));
for(const action of ['down','up'])test('accept bound control '+action,()=>{const c={...ID,variant:'candidate',engine:'chromium',sequence:action==='down'?1:2,action};assertControl(c,c);assertControl({...c,accepted:true},c,true);});
const control={...ID,variant:'candidate',engine:'chromium',sequence:1,action:'down'};
for(const [key,value] of [['run_id','zapp-e2e-other-00000000'],['source_sha','2'.repeat(40)],['variant','baseline'],['engine','webkit'],['sequence',2],['action','up'],['action','shell'],['schema',2],['command','ip route add default']])
  test('reject unbound control '+key+':'+String(value).slice(0,8),()=>assert.throws(()=>assertControl({...control,[key]:value},control)));
test('ack must be positive and bound',()=>assert.throws(()=>assertControl({...control,accepted:false},control,true)));
for(const helper of [false,true])test('accept exact container capabilities helper='+helper,()=>{const {c,expected}=containerFixture(helper);assertContainer(c,expected);});
const containerMutations={
  'identity':c=>c.Id='c'.repeat(64),'name':c=>c.Name='/foreign','owner':c=>c.Config.Labels['zapp.e2e.owner']='foreign',
  'source':c=>c.Config.Labels['zapp.e2e.source']='2'.repeat(40),'purpose':c=>c.Config.Labels['zapp.e2e.purpose']='isolated-auth',
  'unpinned image':c=>c.Config.Image='playwright:latest','wrong image bytes':c=>c.Image='sha256:'+'c'.repeat(64),
  'root browser':c=>c.Config.User='0:0','host network':c=>c.HostConfig.NetworkMode='host','bridge network':c=>c.HostConfig.NetworkMode='bridge',
  'privileged':c=>c.HostConfig.Privileged=true,'host pid':c=>c.HostConfig.PidMode='host','host ipc':c=>c.HostConfig.IpcMode='host',
  'published port':c=>c.HostConfig.PortBindings={'5173/tcp':[{HostPort:'5173'}]},
  'extra capability':c=>c.HostConfig.CapAdd=['NET_ADMIN'],'raw capability':c=>c.HostConfig.CapDrop=['NET_RAW'],
  'lost nnp':c=>c.HostConfig.SecurityOpt=[],'docker socket':c=>c.Mounts[0].Source='/var/run/docker.sock',
  'writable source':c=>c.Mounts[0].RW=true,'extra mount':c=>c.Mounts.push({Type:'bind',Source:'/private',Destination:'/key',RW:false}),
  'bridge endpoint':c=>c.NetworkSettings.Networks.bridge={},
};
for(const [name,mutate] of Object.entries(containerMutations))test('reject container '+name,()=>{const {c,expected}=containerFixture();mutate(c);assert.throws(()=>assertContainer(c,expected));});
test('NET_ADMIN helper rejects extra capability',()=>{const {c,expected}=containerFixture(true);c.HostConfig.CapAdd.push('SYS_MODULE');assert.throws(()=>assertContainer(c,expected));});
for(const variant of ['baseline','candidate'])test('accept complete engine '+variant,()=>assertEngineResult(engineProof(variant),{...ID,variant,engine:'chromium'}));
const engineMutations={
  'native offline':p=>p.native.online=false,'native value missing':p=>delete p.native.online,'local https missing':p=>p.native.https=false,
  'node https missing':p=>p.native.node_https=false,'untrusted certificate accepted':p=>p.native.tls_untrusted_rejected=false,
  'wrong SAN accepted':p=>p.native.tls_wrong_san_rejected=false,'emulated fetch still works':p=>p.emulation.offline_blocked=false,
  'emulated offline event missing':p=>p.emulation.offline_event=false,'emulated online event missing':p=>p.emulation.online_event=false,
  'physical offline event missing':p=>p.link.down_event=false,'physical offline missing':p=>p.link.down_online=true,
  'physical recovery missing':p=>p.link.up_online=false,'fresh context emulated':p=>p.fresh.unemulated=false,
  'fresh context offline':p=>p.fresh.online=false,'node egress available':p=>p.external.node_blocked=false,'browser egress available':p=>p.external.browser_blocked=false,
  'version mismatch':p=>p.versions.playwright='1.64.0','free text in version':p=>p.versions.browser='secret','raw screenshot':p=>p.screenshot='raw',
};
for(const [name,mutate] of Object.entries(engineMutations))test('reject engine '+name,()=>{const p=engineProof('candidate');mutate(p);assert.throws(()=>assertEngineResult(p,{...ID,variant:'candidate',engine:'chromium'}));});
const failure={...ID,variant:'candidate',engine:'chromium',phase:'native',observations:{native_online:false,native_https:true,node_https:true}};
test('failure preserves native false as bounded observation',()=>assert.equal(assertFailure(failure,failure).observations.native_online,false));
for(const [key,value] of [['phase','free stack'],['run_id','zapp-e2e-other-00000000'],['source_sha','2'.repeat(40)],['engine','firefox'],['raw','secret']])
  test('failure rejects '+key,()=>assert.throws(()=>assertFailure({...failure,[key]:value},failure)));
test('failure rejects raw observation',()=>assert.throws(()=>assertFailure({...failure,observations:{...failure.observations,native_online:'secret'}},failure)));
for(const [kind,code,message,expected,engine='chromium'] of [
  ['tls_wrong_san_rejected','ERR_TLS_CERT_ALTNAME_INVALID','net::ERR_CERT_COMMON_NAME_INVALID',true],
  ['tls_untrusted_rejected','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SEC_ERROR_UNKNOWN_ISSUER',true,'firefox'],
  ['tls_untrusted_rejected','SELF_SIGNED_CERT_IN_CHAIN','Unacceptable TLS certificate',true,'webkit'],
  ['tls_wrong_san_rejected','CERT_HAS_EXPIRED','net::ERR_CERT_DATE_INVALID',false],
  ['tls_wrong_san_rejected','ECONNREFUSED','net::ERR_CERT_COMMON_NAME_INVALID',false],
  ['tls_untrusted_rejected','UNABLE_TO_VERIFY_LEAF_SIGNATURE','Timeout 5000ms exceeded',false],
  ['tls_untrusted_rejected','ERR_TLS_CERT_ALTNAME_INVALID','Unacceptable TLS certificate',false],
  ['tls_untrusted_rejected',null,'net::ERR_CERT_AUTHORITY_INVALID',false],
])test('TLS negative classification '+code+'/'+expected,()=>assert.equal(tlsControlRejected(kind,code,message,engine),expected));
function tlsPage(message, failureText = message) {
  const listeners = new Map(), frame = {}, calls = [];
  let current = 'about:blank';
  return {
    calls,
    mainFrame: () => frame,
    url: () => current,
    on(event, listener) { listeners.set(event, listener); },
    off(event, listener) { if (listeners.get(event) === listener) listeners.delete(event); },
    async goto(url, options) {
      calls.push({ url, options }); current = url;
      if (calls.length === 1) return { status: () => 200, json: async () => ({ ...ID, origin: TLS_ORIGIN }) };
      const request = {
        url: () => url,
        method: () => 'GET',
        resourceType: () => 'document',
        isNavigationRequest: () => true,
        frame: () => frame,
        failure: () => ({ errorText: failureText }),
      };
      listeners.get('request')?.(request);
      listeners.get('requestfailed')?.(request);
      throw Error(message);
    },
  };
}
for(const kind of ['untrusted','wrong_san'])for(const engine of ['chromium','firefox','webkit']){
  const name=kind==='untrusted'?'tls_untrusted_rejected':'tls_wrong_san_rejected';
  const node=kind==='untrusted'?'UNABLE_TO_GET_ISSUER_CERT_LOCALLY':'ERR_TLS_CERT_ALTNAME_INVALID';
  const other=kind==='untrusted'?'ERR_TLS_CERT_ALTNAME_INVALID':'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
  const message=engine==='webkit'?'SSL error has occurred':engine==='firefox'?
    (kind==='untrusted'?'SEC_ERROR_UNKNOWN_ISSUER':'SSL_ERROR_BAD_CERT_DOMAIN'):
    (kind==='untrusted'?'net::ERR_CERT_AUTHORITY_INVALID':'net::ERR_CERT_COMMON_NAME_INVALID');
  for(const [label,code,text,expected] of [
    ['certificate',node,message,true],['different Node cause',other,message,false],['refused','ECONNREFUSED',message,false],
    ['timed out','ETIMEDOUT',message,false],['expired','CERT_HAS_EXPIRED',message,false],['browser timeout',node,'Timeout 5000ms exceeded',false],
    ['browser reset',node,'ECONNRESET',false],['provisional cancellation',node,'Load request cancelled',false],
    ['accepted navigation',node,undefined,false],['no Node rejection',undefined,message,false],
  ])test('existing classifier parity '+kind+'/'+engine+'/'+label,()=>assert.equal(tlsControlRejected(name,code,text,engine),expected));
  test('warm same page before negative TLS '+kind+'/'+engine,async()=>{
    const page=tlsPage(message);
    assert.equal(await probeBrowserTlsControl({page,id:ID,kind:name,engine,nodeCode:node}),true);
    assert.deepEqual(page.calls.map(x=>x.url),[TLS_ORIGIN+'/identity','https://127.0.0.1:'+(kind==='untrusted'?5175:5176)]);
    assert(page.calls.every(x=>x.options.waitUntil==='load'&&x.options.timeout===8000));
  });
}
test('network proof aceita cancelamento nativo WebKit somente com lifecycle exato', async()=>{
  const page=tlsPage('Operation was cancelled; maybe frame was detached?','Operation was cancelled');
  assert.equal(await probeBrowserTlsControl({page,id:ID,kind:'tls_untrusted_rejected',engine:'webkit',nodeCode:'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'}),true);
});
for(const fault of ['status-302','status-500','wrong-url','wrong-run','wrong-source','wrong-origin','wrong-schema','extra-field','warmup-throw','invalid-json'])
  test('reject negative TLS before invalid warmup: '+fault,async()=>{
    let calls=0;const url=TLS_ORIGIN+'/identity';
    const page={url:()=>fault==='wrong-url'?'about:blank':url,async goto(){
      calls++;if(calls>1)throw Error('negative reached');if(fault==='warmup-throw')throw Error('warmup failed');
      return {status:()=>fault.startsWith('status-')?Number(fault.slice(7)):200,json:async()=>{
        if(fault==='invalid-json')throw Error('not json');const value={...ID,origin:TLS_ORIGIN};
        if(fault==='wrong-run')value.run_id='zapp-e2e-other-00000000';if(fault==='wrong-source')value.source_sha='2'.repeat(40);
        if(fault==='wrong-origin')value.origin='https://127.0.0.2:5173';if(fault==='wrong-schema')value.schema=2;if(fault==='extra-field')value.raw='secret';return value;
      }};
    }};
    await assert.rejects(probeBrowserTlsControl({page,id:ID,kind:'tls_untrusted_rejected',engine:'webkit',nodeCode:'UNABLE_TO_VERIFY_LEAF_SIGNATURE'}));
    assert.equal(calls,1);
  });
const trustMaterial={directory:'/tmp/network-proof-review/tls',publicDirectory:'/tmp/network-proof-review/tls/public',privateDirectory:'/tmp/network-proof-review/tls/private',
  homeDirectory:'/tmp/network-proof-review/tls/home',runId:ID.run_id,sourceSha:ID.source_sha,caSha256:'a'.repeat(64)};
test('existing TLS mount retains NSS HOME absolute path and excludes private key',()=>{
  const mounts=tlsMounts(trustMaterial,'driver');
  assert.deepEqual(mounts,[{type:'bind',source:trustMaterial.publicDirectory,target:TLS_PUBLIC,readOnly:true},
    {type:'bind',source:trustMaterial.homeDirectory,target:trustMaterial.homeDirectory,readOnly:false}]);
});
test('existing TLS/browser environment preserves HOME and Firefox policy',()=>{
  const env=tlsEnvironment(trustMaterial,'driver'),filtered=browserEnvironment(env);
  assert.equal(env.NODE_EXTRA_CA_CERTS,TLS_PUBLIC+'/ca.crt');assert.equal(env.SSL_CERT_FILE,TLS_PUBLIC+'/ca.crt');
  assert.deepEqual(filtered,{HOME:trustMaterial.homeDirectory,PLAYWRIGHT_FIREFOX_POLICIES_JSON:TLS_PUBLIC+'/firefox-policies.json'});
});
test('actual runtime wires the unchanged driver TLS mounts and environment',()=>temporary(async dir=>{
  const rt=new NativeRuntime({root:'/repo',output:'/tmp/unopened',id:ID,env:{}});rt.private=dir;rt.material=trustMaterial;
  rt.namespaces={baseline:'net:[1234]'};rt.variants={baseline:{anchor:{id:'a'.repeat(64)}}};rt.topology=async()=>({});
  let captured,count=0;rt.canary={url:'http://192.0.2.2:43210/canary/'+'a'.repeat(32),positive:async()=>({valid:true,count:++count,connections:count})};
  rt.create=async(role,variant,options)=>{captured=options;writeAtomicJson(path.join(dir,'baseline-chromium','result.json'),engineProof());return {id:'b'.repeat(64)};};
  rt.trust=async()=>{};rt.inspect=async()=>({State:{Running:false,ExitCode:0}});rt.remove=async()=>{};
  const result=await rt.runEngine('baseline','chromium');assert(result.proof);assert.equal(result.failure,null);
  assert.deepEqual(captured.env,{...tlsEnvironment(trustMaterial,'driver'),ZAPP_NETWORK_NAMESPACE:'net:[1234]'});
  assert(captured.mounts.some(m=>m.source===trustMaterial.homeDirectory&&m.target===trustMaterial.homeDirectory&&m.write===true));
  assert(captured.mounts.some(m=>m.source===trustMaterial.publicDirectory&&m.target===TLS_PUBLIC&&m.write===false));
  assert(!captured.mounts.some(m=>m.source===trustMaterial.privateDirectory));
}));
test('actual runtime executes both original trust commands with identity checks',()=>temporary(async dir=>{
  // A public bundled root is used only to parse/hash X509 in this offline test.
  const pem=rootCertificates[0];writeFileSync(path.join(dir,'ca.crt'),pem);
  const rt=new NativeRuntime({root:'/repo',output:'/tmp/unopened',id:ID,env:{}});
  rt.material={publicDirectory:dir,caSha256:digest(new X509Certificate(pem).raw)};
  const calls=[];let inspected=0;rt.inspect=async()=>{inspected++;return {State:{Running:true}};};rt.docker=async args=>{calls.push(args);return '';};
  const id='a'.repeat(64);await rt.trust({id});assert.equal(inspected,3);
  assert.deepEqual(calls,[['exec','--user','0:0',id,'install','-m','0644',TLS_PUBLIC+'/ca.crt','/usr/local/share/ca-certificates/zapp-e2e-local.crt'],
    ['exec','--user','0:0',id,'update-ca-certificates']]);
}));
test('baseline offline remains observation',()=>assert.equal(assertEngineResult(engineProof(),{...ID,variant:'baseline',engine:'chromium'}).native.online,false));
const canaryBefore={valid:true,count:1,connections:1};
test('canary requires alive before and after',()=>assertCanary(canaryBefore,{valid:true,count:2,connections:2},false));
for(const [name,after,unexpected] of [['dead',{valid:false,count:2,connections:2},false],['extra request',{valid:true,count:3,connections:2},false],
  ['TCP reaches host',{valid:true,count:2,connections:3},false],['bad counter',{valid:true,count:1,connections:2},false],['unexpected',{valid:true,count:2,connections:2},true]])
  test('canary rejects '+name,()=>assert.throws(()=>assertCanary(canaryBefore,after,unexpected)));
function fakeRuntime(fault){
  const events=[];const touch=name=>{events.push(name);if(fault===name)throw Error(name);};
  return {events,async prepare(){touch('prepare');},async moduleAvailable(){touch('module');return fault!=='module-unavailable';},
    async startVariant(v){touch('start-'+v);},async runEngine(v,e){touch(v+'-'+e);return {proof:fault==='behavior-'+v+'-'+e?null:engineProof(v,e),failure:null};},async cleanup(){touch('cleanup');return fault!=='cleanup-false';}};
}
test('actual orchestration executes baseline before module check and candidate',async()=>{const rt=fakeRuntime();const r=await orchestrateProof(rt,ID);assert.equal(r.status,'passed');assert(rt.events.indexOf('baseline-webkit')<rt.events.indexOf('module'));assert.equal(r.plan_fully_validated,false);});
for(const failure of ['prepare','start-baseline','baseline-chromium','baseline-firefox','baseline-webkit','module','module-unavailable','start-candidate','candidate-chromium','candidate-firefox','candidate-webkit','cleanup','cleanup-false'])
  test('actual orchestration failure '+failure,async()=>{const rt=fakeRuntime(failure);const r=await orchestrateProof(rt,ID);assert.equal(r.status,'failed');assert(rt.events.includes('cleanup'));if(failure==='module-unavailable'){assert.equal(r.baseline.engines.length,3);assert.equal(r.candidate.status,'not_run');}});
test('behavior failure collects remaining safe engines without promoting',async()=>{const r=await orchestrateProof(fakeRuntime('behavior-candidate-firefox'),ID);assert.equal(r.status,'failed');assert.equal(r.candidate.engines.length,3);assert.equal(r.candidate.engines[1].proof,null);});
test('report cannot promote full validation',async()=>{const r=await orchestrateProof(fakeRuntime(),ID);r.plan_fully_validated=true;assert.throws(()=>validatePublicReport(r));});
test('report rejects free error detail',async()=>{const r=await orchestrateProof(fakeRuntime(),ID);r.error='secret';assert.throws(()=>validatePublicReport(r));});
test('public failure code never echoes raw text',()=>assert.equal(publicFailureCode(Error('https://secret.example/token')),'execution-failed'));
test('public failure code rejects unknown enum',()=>assert.equal(publicFailureCode(Error('[network-proof/secret]')),'execution-failed'));
test('public failure code preserves known invariant',()=>assert.equal(publicFailureCode(Error('[network-proof/namespace-changed]')),'namespace-changed'));
test('report rejects late promotion without cleanup',async()=>{const r=await orchestrateProof(fakeRuntime(),ID);r.cleanup=false;assert.throws(()=>validatePublicReport(r));});
for(const [event,input,expected] of [['pull_request','network-proof','login'],['workflow_dispatch','network-proof','network-proof'],['workflow_dispatch','full-suite','full-suite'],['workflow_dispatch','','login']])
  test('scope gate '+event+'/'+input,()=>assert.equal(requestScope(event,input,ID.source_sha),expected));
for(const [event,input,sha] of [['push','network-proof',ID.source_sha],['workflow_dispatch','free',ID.source_sha],['workflow_dispatch','network-proof','0'.repeat(40)],['workflow_dispatch','network-proof','HEAD']])
  test('reject request '+event+'/'+input+'/'+sha.slice(0,4),()=>assert.throws(()=>requestScope(event,input,sha)));

function temporary(fn){const dir=mkdtempSync(path.join(tmpdir(),'network-proof-unit-'));chmodSync(dir,0o700);return Promise.resolve().then(()=>fn(dir)).finally(()=>rmSync(dir,{recursive:true,force:true}));}
test('bounded protocol atomic write and exact read',()=>temporary(dir=>{const file=path.join(dir,'data.json');writeAtomicJson(file,control);assert.deepEqual(readBoundedJson(file),control);}));
test('protocol rejects symlink',()=>temporary(dir=>{writeFileSync(path.join(dir,'target'),'{}');symlinkSync(path.join(dir,'target'),path.join(dir,'data'));assert.throws(()=>readBoundedJson(path.join(dir,'data')));}));
test('protocol rejects hardlink',()=>temporary(dir=>{writeFileSync(path.join(dir,'target'),'{}');linkSync(path.join(dir,'target'),path.join(dir,'data'));assert.throws(()=>readBoundedJson(path.join(dir,'data')));}));
test('protocol rejects oversized JSON',()=>temporary(dir=>{writeFileSync(path.join(dir,'data'),' '.repeat(65537));assert.throws(()=>readBoundedJson(path.join(dir,'data')));}));
test('protocol rejects invalid UTF-8',()=>temporary(dir=>{writeFileSync(path.join(dir,'data'),Buffer.from([0x7b,0x22,0xff,0x22,0x3a,0x31,0x7d]));assert.throws(()=>readBoundedJson(path.join(dir,'data')));}));
test('protocol rejects partial file',()=>temporary(dir=>{writeFileSync(path.join(dir,'data'),'{');assert.throws(()=>readBoundedJson(path.join(dir,'data')));}));
test('protocol optional only accepts ENOENT',()=>temporary(dir=>{assert.equal(readBoundedJson(path.join(dir,'absent'),true),null);mkdirSync(path.join(dir,'directory'));assert.throws(()=>readBoundedJson(path.join(dir,'directory'),true));}));
test('atomic output rejects overwrite',()=>temporary(dir=>{const f=path.join(dir,'data');writeAtomicJson(f,{});assert.throws(()=>writeAtomicJson(f,{}));}));
test('atomic output rejects dangling symlink',()=>temporary(dir=>{const f=path.join(dir,'data');symlinkSync('/does-not-exist',f);assert.throws(()=>writeAtomicJson(f,{}));}));
test('atomic output rejects public directory',()=>temporary(dir=>{chmodSync(dir,0o777);assert.throws(()=>writeAtomicJson(path.join(dir,'data'),{}));chmodSync(dir,0o700);}));
test('deadline rejects result arriving late',()=>temporary(async dir=>{const f=path.join(dir,'data');await assert.rejects(waitForJson(f,10,x=>x));writeAtomicJson(f,control);assert.deepEqual(readBoundedJson(f),control);}));
function completed(dir,variant='baseline'){
  const config={...ID,variant,engine:'chromium',canary_url:'http://192.0.2.2:43210/canary/'+'a'.repeat(32),namespace:'net:[1234]'};
  writeAtomicJson(path.join(dir,'config.json'),config);writeAtomicJson(path.join(dir,'trust-ready.json'),{...ID,ready:true});
  if(variant==='candidate')for(const n of [1,2]){const c={...ID,variant,engine:'chromium',sequence:n,action:n===1?'down':'up'};writeAtomicJson(path.join(dir,'request-'+n+'.json'),c);writeAtomicJson(path.join(dir,'ack-'+n+'.json'),{...c,accepted:true});}
  writeAtomicJson(path.join(dir,'result.json'),engineProof(variant));return config;
}
for(const variant of ['baseline','candidate'])test('collect only complete exited proof '+variant,()=>temporary(dir=>{const config=completed(dir,variant);assert.equal(collectCompletedProof(dir,config,{running:false,exitCode:0,sequence:variant==='candidate'?3:1}).engine,'chromium');}));
for(const [name,status] of [['still-running',{running:true,exitCode:0,sequence:1}],['bad-exit',{running:false,exitCode:1,sequence:1}],['unknown-exit',{running:false,exitCode:null,sequence:1}],['incomplete-control',{running:false,exitCode:0,sequence:2}]])
  test('reject completed file with '+name,()=>temporary(dir=>{const config=completed(dir);assert.throws(()=>collectCompletedProof(dir,config,status));}));
test('reject extra late protocol file',()=>temporary(dir=>{const c=completed(dir);writeAtomicJson(path.join(dir,'request-3.json'),control);assert.throws(()=>collectCompletedProof(dir,c,{running:false,exitCode:0,sequence:1}));}));
test('reject modified control configuration',()=>temporary(dir=>{const c=completed(dir);writeFileSync(path.join(dir,'config.json'),JSON.stringify({...c,namespace:'net:[9999]'}));assert.throws(()=>collectCompletedProof(dir,c,{running:false,exitCode:0,sequence:1}));}));
test('reject modified acknowledgment after process exit',()=>temporary(dir=>{const c=completed(dir,'candidate');writeFileSync(path.join(dir,'ack-2.json'),JSON.stringify({...control,accepted:true}));assert.throws(()=>collectCompletedProof(dir,c,{running:false,exitCode:0,sequence:3}));}));
test('reject identical duplicate control rewritten after acknowledgment',()=>temporary(dir=>{
  const c=completed(dir,'candidate'),file=path.join(dir,'request-1.json'),value=readBoundedJson(file),identities={'request-1.json':protocolFileIdentity(file)};
  rmSync(file);writeAtomicJson(file,value);
  assert.throws(()=>collectCompletedProof(dir,c,{running:false,exitCode:0,sequence:3,identities}));
}));

test('async subprocess keeps callbacks alive while waiting',async()=>{let ticks=0;const timer=setInterval(()=>ticks++,10);try{const r=await runCommand(process.execPath,['-e','setTimeout(()=>process.exit(0),120)'],{env:{},timeout:10000});assert.equal(r.code,0);assert(ticks>=4);}finally{clearInterval(timer);}});
test('async subprocess rejects nonzero',async()=>{const r=await runCommand(process.execPath,['-e','process.exit(7)'],{env:{},timeout:10000});assert.equal(r.code,7);assert.throws(()=>commandOutput(r));});
test('async subprocess timeout is observable',async()=>{const r=await runCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{env:{},timeout:30});assert.equal(r.timedOut,true);assert.throws(()=>commandOutput(r));});
test('async subprocess bounds combined output',async()=>{const r=await runCommand(process.execPath,['-e','process.stdout.write("x".repeat(4096))'],{env:{},timeout:10000,maxBytes:64});assert.equal(r.truncated,true);assert.throws(()=>commandOutput(r));});
test('async subprocess handles missing executable',async()=>{const r=await runCommand('/nonexistent-network-proof-tool',[],{env:{},timeout:10000});assert(r.error);assert.throws(()=>commandOutput(r));});
test('async subprocess abort cannot become success',async()=>{const c=new AbortController();const pending=runCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{env:{},timeout:10000,signal:c.signal});setTimeout(()=>c.abort(),20);const r=await pending;assert.throws(()=>commandOutput(r));});

function memoryTransport(){
  let server,handler;
  return {interfaces:()=>({eth0:[{family:'IPv4',internal:false,address:'192.0.2.2'}]}),
    createServer:fn=>{handler=fn;server=new EventEmitter();server.listen=(port,address,ready)=>setImmediate(ready);server.address=()=>({address:'192.0.2.2',port:43210,family:'IPv4'});server.closeAllConnections=()=>{};server.close=cb=>setImmediate(cb);return server;},
    request:(options,ready)=>{
      const req=new EventEmitter();req.destroy=e=>req.emit('error',e);
      setImmediate(()=>{
        server.emit('connection');const response=new EventEmitter();response.statusCode=200;
        const res={setHeader(){},writeHead(code){response.statusCode=code;},end(body){ready(response);setImmediate(()=>{if(body)response.emit('data',Buffer.from(body));response.emit('end');});}};
        handler({method:'GET',url:options.path},res);
      });return req;
    },extraConnection:()=>server.emit('connection')};
}
test('real canary controller positive callbacks stay live during async child (transport simulated)',async()=>{
  const transport=memoryTransport(),canary=new HostCanary(ID,transport);await canary.start();
  try{
    const before=await canary.positive();let childDone=false;
    const child=runCommand(process.execPath,['-e','setTimeout(()=>process.exit(0),120)'],{env:{},timeout:10000}).then(r=>{childDone=true;return r;});
    const during=await canary.positive();assert.equal(childDone,false);assertCanary(before,during,false);commandOutput(await child);
    const after=await canary.positive();assertCanary(during,after,false);
  }finally{await canary.close();}
});
test('actual canary controller observes unexpected TCP connection (transport simulated)',async()=>{
  const t=memoryTransport(),c=new HostCanary(ID,t);await c.start();try{const before=await c.positive();t.extraConnection();const after=await c.positive();assert.throws(()=>assertCanary(before,after,false));}finally{await c.close();}
});
test('canary cannot invent an unavailable external interface',async()=>{const c=new HostCanary(ID,{...memoryTransport(),interfaces:()=>({lo:[{family:'IPv4',internal:true,address:'127.0.0.1'}]})});await assert.rejects(c.start());});
function topologyRuntime(s){
  const rt=new NativeRuntime({root:'/repo',output:'/tmp/unopened',id:ID,env:{}});
  rt.variants={baseline:{anchor:{id:'a'.repeat(64)}}};rt.namespaces={baseline:'net:[1234]'};rt.hostNamespace='net:[1]';
  rt.inspect=async()=>({State:{Running:true}});rt.docker=async()=>JSON.stringify(s);return rt;
}
test('runtime verifies recorded namespace',async()=>assert.equal((await topologyRuntime(topology()).topology('baseline')).namespace,'net:[1234]'));
test('runtime rejects changed namespace',async()=>{const s=topology();s.namespace='net:[5678]';await assert.rejects(topologyRuntime(s).topology('baseline'));});
test('runtime rejects host namespace',async()=>{const rt=topologyRuntime(topology());rt.hostNamespace='net:[1234]';await assert.rejects(rt.topology('baseline'));});
test('runtime rejects collision with other variant',async()=>{const rt=topologyRuntime(topology());rt.namespaces.candidate='net:[1234]';await assert.rejects(rt.topology('baseline'));});
test('cleanup never removes replaced container identity',async()=>{
  const {c,expected}=containerFixture();c.Id='c'.repeat(64);const rt=new NativeRuntime({root:'/repo',output:'/tmp/unopened',id:ID,env:{}});let removed=false;
  rt.docker=async args=>{if(args[0]==='rm'){removed=true;return '';}return JSON.stringify([c]);};
  await assert.rejects(rt.remove({...expected,removed:false}));assert.equal(removed,false);
});
test('cleanup refuses a foreign purpose even with same name',async()=>{
  const {c,expected}=containerFixture();c.Config.Labels['zapp.e2e.purpose']='foreign';const rt=new NativeRuntime({root:'/repo',output:'/tmp/unopened',id:ID,env:{}});let removed=false;
  rt.docker=async args=>{if(args[0]==='rm'){removed=true;return '';}return JSON.stringify([c]);};await assert.rejects(rt.remove({...expected,removed:false}));assert.equal(removed,false);
});
for(const helper of [false,true])test('actual Docker arguments cap-drop ALL with scoped helper='+helper,async()=>{
  const rt=new NativeRuntime({root:'/repo',output:'/tmp/unopened',id:ID,env:{}});rt.tools='/tools';rt.uid='1001:1001';rt.imageId='sha256:'+'b'.repeat(64);
  let created;rt.docker=async args=>{if(args[0]==='create')created=args;return 'a'.repeat(64);};rt.inspect=async()=>({State:{Running:true}});
  await rt.create(helper?'helper-up-unit':'browser-chromium','baseline',{helper,command:['node','probe']});
  assert.equal(created[created.indexOf('--network')+1],'none');assert.equal(created[created.indexOf('--cap-drop')+1],'ALL');
  assert.equal(created.includes('--cap-add'),helper);if(helper)assert.equal(created[created.indexOf('--cap-add')+1],'NET_ADMIN');
  assert(!created.includes('--privileged'));assert(!created.some(x=>x.includes('SYS_MODULE')));assert(!created.some(x=>x.includes('docker.sock')));
});
