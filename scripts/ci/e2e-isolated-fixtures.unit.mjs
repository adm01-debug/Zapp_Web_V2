import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ORIGIN = 'https://127.0.0.1:5173';
const jwt = (role, exp = 4102444800) => [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({role,exp,iat:1})).toString('base64url'),'synthetic-signature'].join('.');
const ANON = jwt('anon');
const pair = () => ({ ZAPP_E2E_LOCAL:'1', E2E_SUPABASE_URL_OVERRIDE:ORIGIN,E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE:ANON,VITE_ZAPP_LOCAL_SUPABASE_URL:ORIGIN,VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY:ANON });
function javascript(relative) {
  return stripTypeScriptTypes(readFileSync(path.join(ROOT, relative), 'utf8'), { mode:'strip' })
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\s*$/gm,'')
    .replace(/^export (const|function|async function|class) /gm,'$1 ')
    .replaceAll('import.meta.dirname', JSON.stringify(path.join(ROOT,'e2e/fixtures')));
}
const fixtureSource = javascript('e2e/fixtures/supabase-env.ts') + '\nglobalThis.result={url:SUPABASE_URL,key:SUPABASE_ANON_KEY,storageKey:SUPABASE_STORAGE_KEY};';
function evaluateFixture(env, exists) {
  let reads=0;
  const context={process:{env,cwd:()=>ROOT},Buffer,URL,Date,resolve:path.resolve,readFileSync:()=>{
    reads++;
    if(!exists)throw new Error('controlled missing file');
    return 'VITE_SUPABASE_URL=https://official.invalid\nVITE_SUPABASE_PUBLISHABLE_KEY='+ANON+'\n';
  }};
  let failure;
  try{vm.runInNewContext(fixtureSource,context);}catch(error){failure=error;}
  return {result:context.result,reads,failure};
}
const cases = [
  ['completo', env=>{}, true],
  ['sem URL fixture',env=>{delete env.E2E_SUPABASE_URL_OVERRIDE;},false],
  ['sem chave fixture',env=>{delete env.E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE;},false],
  ['sem URL app',env=>{delete env.VITE_ZAPP_LOCAL_SUPABASE_URL;},false],
  ['sem chave app',env=>{delete env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY;},false],
  ['URL app divergente',env=>{env.VITE_ZAPP_LOCAL_SUPABASE_URL='http://127.0.0.1:5174';},false],
  ['chave app divergente',env=>{env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY=jwt('anon',4102444801);},false],
  ['host remoto',env=>{env.E2E_SUPABASE_URL_OVERRIDE=env.VITE_ZAPP_LOCAL_SUPABASE_URL='https://official.invalid';},false],
  ['HTTP divergente',env=>{env.E2E_SUPABASE_URL_OVERRIDE=env.VITE_ZAPP_LOCAL_SUPABASE_URL='http://127.0.0.1:5173';},false],
  ['path',env=>{env.E2E_SUPABASE_URL_OVERRIDE=env.VITE_ZAPP_LOCAL_SUPABASE_URL=ORIGIN+'/path';},false],
  ['userinfo',env=>{env.E2E_SUPABASE_URL_OVERRIDE=env.VITE_ZAPP_LOCAL_SUPABASE_URL='http://user:pass@127.0.0.1:5173';},false],
  ['query',env=>{env.E2E_SUPABASE_URL_OVERRIDE=env.VITE_ZAPP_LOCAL_SUPABASE_URL=ORIGIN+'?x=1';},false],
  ['service role',env=>{env.E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE=env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY=jwt('service_role');},false],
  ['anon expirada',env=>{env.E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE=env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY=jwt('anon',1);},false],
  ['JWT inválido',env=>{env.E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE=env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY='not-a-jwt';},false],
  ['flag ambígua',env=>{env.ZAPP_E2E_LOCAL='true';},false],
];
for(const exists of [true,false])for(const [name,mutate,accept] of cases) {
  test('fixture real: '+name+' com arquivo primário '+(exists?'presente':'ausente'),()=>{
    const env=pair();mutate(env);
    const outcome=evaluateFixture(env,exists);
    assert.equal(outcome.reads,0,'isolated mode never reads the production env file');
    if(accept){
      assert.equal(outcome.failure,undefined);
      assert.equal(outcome.result.url,ORIGIN);
      assert.equal(outcome.result.key,ANON);
      assert.equal(outcome.result.storageKey,'sb-127-auth-token');
    }else assert.match(String(outcome.failure?.message),/isolated-fixture/);
  });
}
for(const [name,env,exists,accept] of [
  ['arquivo primário',{},true,true],
  ['override dedicado',{E2E_SUPABASE_URL_OVERRIDE:ORIGIN,E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE:ANON},true,true],
  ['sem arquivo',{},false,false],
  ['override sem fonte primária',{E2E_SUPABASE_URL_OVERRIDE:ORIGIN,E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE:ANON},false,false],
]) {
  test('fixture fora do modo isolado preserva '+name,()=>{
    const outcome=evaluateFixture(env,exists);
    assert.equal(Boolean(outcome.result),accept);
    assert.ok(outcome.reads>0);
  });
}

async function mapRoutes() {
  const registered=[];
  const context={SUPABASE_URL:ORIGIN,URL,join:path.join,readFileSync:()=>{throw new Error('unexpected file read');}};
  vm.runInNewContext(javascript('e2e/fixtures/mapa-mocks.ts')+'\nglobalThis.guard=bloquearRedeReal;',context);
  const registry={};
  await context.guard({route:async(matcher,callback)=>registered.push({matcher,callback})},registry);
  return {registered,registry};
}
for(const [pathname,expected] of [
  ['/auth/v1/token',true],['/rest/v1/rpc/example?x=1',true],['/functions/v1/example',true],
  ['/storage/v1/object/x',true],['/realtime/v1/websocket',true],
  ['/auth',false],['/src/main.tsx',false],['/@vite/client',false],
  ['/rest/v10/example',false],['/assets/icon.svg',false],['/',false],
]) {
  test('guarda Mapa real distingue API e frontend na mesma origem: '+pathname,async()=>{
    const {registered}=await mapRoutes();
    assert.equal(registered[0].matcher(new URL(ORIGIN+pathname)),expected);
  });
}
test('guarda Mapa real registra e nega uma API sem mock específico',async()=>{
  const {registered,registry}=await mapRoutes();
  const url=ORIGIN+'/rest/v1/unknown';
  let response;
  await registered[0].callback({request:()=>({url:()=>url}),fulfill:async value=>{response=value;}});
  assert.equal(response.status,403);
  assert.deepEqual(Array.from(registry.redeBarrada),[url]);
});

for(const origin of [ORIGIN,'https://official.invalid']) {
  test('sessão falsa real deriva storage e issuer do backend '+origin,async()=>{
    const key='sb-'+new URL(origin).hostname.split('.')[0]+'-auth-token';
    const context={SUPABASE_URL:origin,SUPABASE_STORAGE_KEY:key,Buffer,join:path.join};
    vm.runInNewContext(javascript('e2e/fixtures/talkx-demo.ts')+'\nglobalThis.install=installFakeSession;',context);
    let payload;
    await context.install({addInitScript:async(_callback,data)=>{payload=data;}});
    assert.equal(payload.storageKey,key);
    const claims=JSON.parse(Buffer.from(payload.session.access_token.split('.')[1],'base64url').toString());
    assert.equal(claims.iss,origin+'/auth/v1');
    assert.equal(payload.session.refresh_token,'fake-refresh-token','existing fake-session contract is preserved');
  });
}

test('Talk X real preserva a série diária zero-fill e o fuso da RPC',()=>{
  const context={SUPABASE_URL:ORIGIN,SUPABASE_STORAGE_KEY:'sb-127-auth-token',Buffer,join:path.join};
  vm.runInNewContext(
    javascript('e2e/fixtures/talkx-demo.ts')+'\nglobalThis.stats=overviewStatsFromFixture;',
    context,
  );
  const result=context.stats({
    talkx_campaigns:[
      {status:'completed',started_at:'2026-10-01T15:00:00.000Z',failed_count:2,outcome_unknown_count:1},
    ],
    talkx_recipients:[
      {
        contact_id:'contact-1',
        sent_at:'2026-10-02T02:59:59.000Z',
        delivered_at:'2026-10-02T03:00:00.000Z',
        replied_at:'2026-10-03T03:00:00.000Z',
      },
    ],
  },{
    p_from:'2026-10-01T03:00:00.000Z',
    p_to:'2026-10-04T03:00:00.000Z',
    p_timezone:'America/Sao_Paulo',
  });
  assert.equal(result.period.timezone,'America/Sao_Paulo');
  assert.deepEqual(JSON.parse(JSON.stringify(result.daily)),[
    {day:'2026-10-01',sent:1,delivered:0,replied:0},
    {day:'2026-10-02',sent:0,delivered:1,replied:0},
    {day:'2026-10-03',sent:0,delivered:0,replied:1},
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.current)),{
    campaigns_sent:1,completed:1,contacts_reached:1,sent:1,delivered:1,replied:1,
    failed:2,unknown:1,delivery_rate_pct:100,reply_rate_pct:100,active:0,
  });
});

test('catálogo real usa o par local sem depender de secrets legados',()=>{
  const register=()=>{};
  register.describe=(_title,callback)=>callback();
  register.describe.configure=()=>{};
  register.beforeEach=()=>{};
  register.afterEach=()=>{};
  let skipped;
  register.skip=(condition)=>{skipped=condition;};
  const context={process:{env:pair()},SUPABASE_URL:ORIGIN,FIXTURE_SUPABASE_ANON_KEY:ANON,E2E_CATALOG_PRODUCT_SKU_VERIFIED:true,E2E_CATALOG_PRODUCT_SKU:'SYNTHETIC',test:register};
  vm.runInNewContext(javascript('e2e/catalog.spec.ts')+'\nglobalThis.result={url:SUPABASE_URL,key:SUPABASE_ANON_KEY};',context);
  assert.equal(context.result.url,ORIGIN);
  assert.equal(context.result.key,ANON);
  assert.equal(skipped,false,'verified local catalog does not skip for a missing legacy key');
});
