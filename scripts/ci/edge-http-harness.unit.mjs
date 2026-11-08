import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const execute = promisify(execFile);
const BIN = JSON.parse(execFileSync('python3', ['-c', 'import json,shutil; print(json.dumps({n:shutil.which(n) for n in ["python3","bash","dirname","cat","rm","mktemp","grep","head","sed"]}))'], { encoding: 'utf8' }));
const HARNESSES = {
  x034: 'scripts/db-audit/talkx-engine-provider.test.sh',
  gmail: 'scripts/db-audit/gmail-cas-postgrest.test.sh',
};

// Somente doubles de processo. Python real executa extração SQL, JWT e JUnit;
// PostgreSQL/PostgREST/Deno e a semântica de CAS/RLS não são simulados aqui.
const DOUBLE = String.raw`#!PYTHON
import base64,copy,fcntl,hashlib,hmac,json,os,re,signal,sys,time
from pathlib import Path
from urllib.parse import urlsplit
kind=Path(sys.argv[0]).name
args=sys.argv[1:]
state_path=Path(os.environ["HARNESS_TEST_STATE"])
lock=open(str(state_path)+".lock","a")
fcntl.flock(lock,fcntl.LOCK_EX)
state=json.loads(state_path.read_text());cfg=state["config"]
def save(): state_path.write_text(json.dumps(state))
def out(code=0,text=""):
    save()
    if text: print(text)
    raise SystemExit(code)
def event(name,**fields): state["events"].append(dict(event=name,**fields))
def resource(value):
    return next(((key,item) for key,item in state["resources"].items() if key==value or item["name"]==value),(None,None))
def claims(token,secret):
    header,payload,signature=token.split(".")
    expected=base64.urlsafe_b64encode(hmac.new(secret.encode(),(header+"."+payload).encode(),hashlib.sha256).digest()).rstrip(b"=").decode()
    assert hmac.compare_digest(signature,expected),"synthetic JWT signature"
    result=json.loads(base64.urlsafe_b64decode(payload+"="*((-len(payload))%4)))
    assert 0 < result["exp"]-int(time.time()) <= 3600
    return result
if kind=="sleep": out()
if kind=="seq": out(text="1\n2\n3") # Limita só as esperas do fixture offline.
if kind=="curl":
    url=args[-1]
    try:
        parsed=urlsplit(url)
        assert parsed.scheme=="http" and parsed.port==3000
        assert args[args.index("--noproxy")+1]=="*"
        target=next(item for item in state["resources"].values() if item.get("ip")==parsed.hostname and item["kind"]=="pgrst")
    except Exception: out(22,"invalid local endpoint")
    event("http",url=url)
    if "/profiles?" in url:
        if cfg.get("auth_status"): out(22,"synthetic HTTP authentication failure")
        try:
            token=args[args.index("-H")+1].split("Bearer ",1)[1]
            assert claims(token,target["secret"])["role"]=="service_role"
        except Exception: out(22,"synthetic JWT mismatch")
        rows=[] if cfg.get("profile_empty") else [{"user_id":"20000000-0000-4000-8000-0000000000b1"}]
        if cfg.get("profile_wrong"): rows=[{"user_id":"different-synthetic-user"}]
        out(text=json.dumps(rows))
    state["http_probes"]+=1
    if cfg.get("http_never") or state["http_probes"]<cfg.get("http_after",1): out(22)
    out(text="{}")
if kind=="deno":
    state["deno_calls"]+=1
    number=state["deno_calls"]
    is_gmail="gmail-" in args[-1]
    count=7 if args[-1].endswith("gmail-cursor-cas-db.test.ts") else 1 if args[-1].endswith("gmail-history-cas-db.test.ts") else 8
    prefix="GMAIL_CAS" if is_gmail else "TALKX_ENGINE"
    url=os.environ.get(prefix+"_POSTGREST_URL","")
    try:
        parsed=urlsplit(url)
        assert parsed.scheme=="http" and parsed.port==3000
        target=next(item for item in state["resources"].values() if item.get("ip")==parsed.hostname and item["kind"]=="pgrst")
        assert claims(os.environ[prefix+"_JWT"],target["secret"])["role"]=="service_role"
        if not is_gmail:
            other=claims(os.environ["TALKX_ENGINE_ANON_JWT"],target["secret"])
            assert other["role"]=="authenticated" and other["sub"]=="20000000-0000-4000-8000-0000000000aa"
        assert "--frozen" in args and "--allow-net=127.0.0.1,"+parsed.hostname+":3000" in args
        assert len([arg for arg in args if arg.startswith("--allow-net")])==1
        assert parsed.hostname in os.environ.get("NO_PROXY","").split(",")
        assert parsed.hostname in os.environ.get("no_proxy","").split(",")
        assert Path(args[-1]).is_file()
    except Exception: out(3,"local runtime precondition mismatch")
    event("deno",file=Path(args[-1]).name,count=count,url=url,role="service_role")
    if cfg.get("signal"):
        save();os.kill(os.getppid(),getattr(signal,cfg["signal"]));out()
    if cfg.get("deno_failure")==number: out(17,"injected Deno failure")
    report_mode=cfg.get("report_mode") if number==cfg.get("report_call",1) else None
    if "--junit-path" in args and report_mode!="missing":
        report=Path(args[args.index("--junit-path")+1])
        if report_mode=="malformed": xml="<testsuite>"
        elif report_mode=="ignored": xml='<testsuite tests="1" skipped="1"><testcase name="ignored"><skipped/></testcase></testsuite>'
        else:
            actual=0 if report_mode=="zero" else count+1 if report_mode=="extra" else count
            xml='<testsuite tests="'+str(actual)+'" failures="0" errors="0" skipped="0">'+''.join('<testcase name="case-'+str(i)+'"/>' for i in range(actual))+'</testsuite>'
        report.write_text(xml)
    out(text="synthetic Deno result; no integration executed")
if kind!="docker": out(88,"unknown test double")
if args==["info"]: out(1 if cfg.get("daemon_failure") else 0)
if args[:2]==["network","create"]:
    name=args[-1];rid=hashlib.sha256(name.encode()).hexdigest()
    if cfg.get("network_collision"):
        state["resources"][rid]={"kind":"network","name":name,"owner":"foreign"};out(1)
    if cfg.get("network_failure"): out(1)
    state["network_counter"]+=1
    state["resources"][rid]={"kind":"network","name":name,"owner":"ours","label":args[args.index("--label")+1].split("=",1)[1],"prefix":"172.23."+str(state["network_counter"])}
    event("network_create",internal="--internal" in args,id=rid)
    out(text=rid)
if args and args[0] in {"create","run"}:
    name=args[args.index("--name")+1];net=args[args.index("--network")+1]
    typ="pgrst" if "-pgrst-" in name else "pg"
    rid=hashlib.sha256(name.encode()).hexdigest()
    if cfg.get(typ+"_collision"):
        state["resources"][rid]={"kind":typ,"name":name,"owner":"foreign","network":None};out(125)
    if cfg.get(typ+"_create_failure"): out(125)
    _,network=resource(net)
    item={"kind":typ,"name":name,"owner":"ours","network":net,"label":args[args.index("--label")+1].split("=",1)[1],"ip":network["prefix"]+(".3" if typ=="pgrst" else ".2"),"published":"-p" in args}
    if typ=="pgrst":
        item["secret"]=next(value.split("=",1)[1] for value in args if value.startswith("PGRST_JWT_SECRET="))
    state["resources"][rid]=item
    if "--cidfile" in args: Path(args[args.index("--cidfile")+1]).write_text(rid)
    event("container_create",kind=typ,id=rid,host_guard="--add-host=tnnnlkbymytvtqngbbqh.supabase.co:127.0.0.1" in args,cron_off="cron.launch_active_jobs=off" in args,published=item["published"])
    out(text=rid)
if args and args[0]=="start":
    _,item=resource(args[-1])
    if not item: out(1)
    out(125 if cfg.get(item["kind"]+"_start_failure") else 0)
if args and args[0]=="logs":
    _,item=resource(args[-1])
    if item and item["kind"]=="pgrst":
        event("pgrst_logs",bounded=args[1:3]==["--tail","40"])
        out(text="synthetic PostgREST exit; no credentials")
    state["logs"]+=1
    if cfg.get("logs_failure"): out(1)
    markers=cfg.get("log_markers",2)
    if state["logs"]<cfg.get("logs_after",1): markers=1
    out(text="\n".join(["database system is ready to accept connections"]*markers))
if args and args[0]=="exec":
    name=args[2] if args[1]=="-i" else args[1]
    _,item=resource(name)
    if not item: out(1)
    if args[-2:]==["cat","/etc/hosts"]:
        event("host_guard")
        out(text="127.0.0.1 " + ("wrong.invalid" if cfg.get("host_bad") else "tnnnlkbymytvtqngbbqh.supabase.co"))
    if "-i" not in args:
        query=args[-1]
        if query=="SHOW cron.launch_active_jobs":
            event("cron_guard")
            out(1 if cfg.get("cron_error") else 0,"on" if cfg.get("cron_bad") else "off")
        if query=="SELECT count(*) FROM public.gmail_accounts":
            event("teardown_check")
            out(1 if cfg.get("teardown_query_error") else 0,"1" if cfg.get("residual_account") else "0")
        state["sql_ready"]+=1
        if cfg.get("sql_never") or state["sql_ready"]<cfg.get("sql_after",1): out(1)
        out(text="1")
    body=sys.stdin.read();state["sql_calls"]+=1
    event("sql",ordinal=state["sql_calls"],sha256=hashlib.sha256(body.encode()).hexdigest(),bytes=len(body.encode()))
    if state["sql_calls"]==cfg.get("sql_failure") or (cfg.get("catalog_failure") and "DO $check$" in body): out(7,"injected SQL process failure")
    out()
if args and args[0]=="pull":
    state["pulls"]+=1
    if cfg.get("pull_failure") or state["pulls"]<cfg.get("pull_after",1): out(1)
    state["image_available"]=True;out()
if args[:2]==["image","inspect"]: out(0 if state["image_available"] or cfg.get("image_cached") else 1)
if (args and args[0]=="inspect") or args[:2]==["network","inspect"]:
    rid,item=resource(args[-1])
    if not item: out(1)
    event("inspect",kind=item["kind"])
    if cfg.get("inspect_failure")==item["kind"]: out(1)
    if cfg.get("inspect_json")==item["kind"]: out(text="{")
    assert "--format" in args and ".Env" not in args[args.index("--format")+1]
    if item["kind"]=="network":
        data={"Id":rid,"Labels":{"zapp.edge-harness":item["label"]},"Name":item["name"],"Internal":True,"Driver":"bridge","IPAM":{"Config":[{"Subnet":item["prefix"]+".0/24","Gateway":item["prefix"]+".1"}]},"Containers":{key:{"IPv4Address":member["ip"]+"/24"} for key,member in state["resources"].items() if member.get("network")==item["name"]}}
    else:
        netid,network=resource(item["network"])
        bindings={"3000/tcp":[{"HostIp":"127.0.0.1","HostPort":""}]} if item["published"] else {}
        data={"Id":rid,"Config":{"Labels":{"zapp.edge-harness":item["label"]}},"State":{"Running":True,"ExitCode":0,"Error":""},"HostConfig":{"NetworkMode":item["network"],"PortBindings":bindings},"NetworkSettings":{"Ports":{"3000/tcp" if item["kind"]=="pgrst" else "5432/tcp":None},"Networks":{item["network"]:{"NetworkID":netid,"IPAddress":item["ip"],"IPPrefixLen":24}}}}
    mutation=cfg.get("inspect_mutation",{})
    if mutation.get("target")==item["kind"]:
        target=data
        keys=[item.get("network") if key=="@network" else key for key in mutation["path"]]
        for key in keys[:-1]: target=target[key]
        target[keys[-1]]=copy.deepcopy(mutation["value"])
    out(text=json.dumps(data))
if args and args[0]=="port":
    out(1,"No public port '3000' published on the internal network")
if (args and args[0]=="rm") or args[:2]==["network","rm"]:
    rid,item=resource(args[-1])
    if not item: out(1)
    if cfg.get("cleanup_"+item["kind"]+"_failure"): out(1)
    if item["kind"]=="network" and any(other.get("network")==item["name"] for other in state["resources"].values()): out(1)
    if item["owner"]=="foreign": state["foreign_removed"].append(rid)
    event("remove",kind=item["kind"],id=rid)
    del state["resources"][rid];out()
out(89,"unhandled Docker operation in offline fixture")
`;

function fixture(config = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-http-control-'));
  const repo = path.join(dir, 'repo');
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const statePath = path.join(dir, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({ config, resources: {}, events: [], foreign_removed: [], deno_calls: 0, sql_calls: 0, sql_ready: 0, logs: 0, http_probes: 0, network_counter: 0, pulls: 0, image_available: false }));
  const files = [...Object.values(HARNESSES), 'scripts/db-audit/assert-deno-junit.py', 'scripts/db-audit/postgrest-internal-url.py', 'scripts/ci/deno.json',
    'supabase/functions/talkx-send/engine.integration.test.ts',
    'supabase/functions/_shared/__tests__/gmail-cursor-cas-db.test.ts',
    'supabase/functions/_shared/__tests__/gmail-history-cas-db.test.ts'];
  const sql = new Set(Object.values(HARNESSES).flatMap(file => [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/\d{14}_[a-zA-Z0-9_-]+\.sql/g)].map(match => match[0])));
  files.push(...[...sql].map(name => `supabase/migrations/${name}`));
  for (const file of files) {
    const target = path.join(repo, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), target);
  }
  for (const [name, target] of Object.entries(BIN)) {
    if (config.missing !== name) fs.symlinkSync(target, path.join(bin, name));
  }
  const double = path.join(dir, 'double.py');
  fs.writeFileSync(double, DOUBLE.replace('#!PYTHON', `#!${BIN.python3}`), { mode: 0o755 });
  for (const name of ['docker', 'curl', 'deno', 'sleep', 'seq']) {
    if (config.missing !== name) fs.symlinkSync(double, path.join(bin, name));
  }
  const env = { ...process.env, PATH: bin, TMPDIR: dir, HARNESS_TEST_STATE: statePath,
    TALKX_ENGINE_POSTGREST_URL: 'https://untrusted.example.invalid', TALKX_ENGINE_JWT: 'inherited-invalid', TALKX_ENGINE_ANON_JWT: 'inherited-invalid',
    GMAIL_CAS_POSTGREST_URL: 'https://untrusted.example.invalid', GMAIL_CAS_JWT: 'inherited-invalid' };
  return { dir, repo, env, state: () => JSON.parse(fs.readFileSync(statePath, 'utf8')), remove: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function runHarness(kind, config = {}, mutate) {
  const f = fixture(config);
  try {
    mutate?.(f.repo);
    const proc = spawnSync(BIN.bash, [path.join(f.repo, HARNESSES[kind])], { cwd: f.repo, env: f.env, encoding: 'utf8', timeout: 20000 });
    assert.ifError(proc.error);
    return { ...proc, state: f.state() };
  } finally { f.remove(); }
}

function assertResult(result, passed, options = {}) {
  const output = result.stdout + result.stderr;
  assert.equal(result.status === 0, passed, output);
  assert.equal(output.includes('[OK]'), passed, output);
  assert.deepEqual(result.state.foreign_removed, []);
  if (!options.allowLeftovers) assert.equal(Object.values(result.state.resources).filter(item => item.owner === 'ours').length, 0);
}

test('V02 bypassa o proxy somente para o PostgREST privado validado', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/db-audit/talkx-transition-overload-postgrest.test.sh'), 'utf8');
  assert.match(source, /curl --noproxy '\*' -sf "http:\/\/\$pgrst_ip:3000\/"/);
  assert.match(source, /NO_PROXY="\$pgrst_no_proxy" no_proxy="\$pgrst_no_proxy"/);
});

for (const kind of ['x034', 'gmail']) {
  test(`${kind}: Bash real confirma guardas, JWTs locais, contagem e cleanup`, () => {
    const result = runHarness(kind);
    assertResult(result, true);
    const events = result.state.events;
    assert.ok(events.some(e => e.event === 'network_create' && e.internal));
    assert.ok(events.some(e => e.event === 'container_create' && e.kind === 'pg' && e.host_guard && e.cron_off));
    assert.ok(events.some(e => e.event === 'container_create' && e.kind === 'pgrst' && !e.published));
    assert.ok(events.filter(e => e.event === 'container_create').every(e => !e.published));
    assert.deepEqual(events.filter(e => e.event === 'inspect').map(e => e.kind), ['pgrst', 'pg', 'network']);
    assert.ok(events.findLastIndex(e => e.event === 'inspect') < events.findIndex(e => e.event === 'http'));
    assert.match(result.stderr, /\[DIAG\] PostgREST .*"Running": true/);
    assert.ok(!events.some(e => e.event === 'pgrst_logs'));
    assert.ok(events.findIndex(e => e.event === 'cron_guard') < events.findIndex(e => e.event === 'sql'));
    assert.ok(events.findIndex(e => e.event === 'host_guard') < events.findIndex(e => e.event === 'sql'));
    assert.deepEqual(events.filter(e => e.event === 'deno').map(e => e.count), kind === 'gmail' ? [7, 1] : [8]);
    assert.deepEqual(events.filter(e => e.event === 'remove').map(e => e.kind), ['pgrst', 'pg', 'network']);
    if (kind === 'gmail') assert.equal(events.filter(e => e.event === 'teardown_check').length, 2);
    if (kind === 'x034') {
      const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261011003005_talkx_n102a_ddl.sql'));
      const applied = events.filter(e => e.event === 'sql' && e.sha256 === createHash('sha256').update(migration).digest('hex'));
      assert.equal(applied.length, 1, 'DDL N-102a real aplicado uma vez');
      assert.equal(applied[0].ordinal, 19, 'bootstrap + 17 migrations anteriores + N-102a');
    }
  });
  for (const [name, config] of [
    ['Docker ausente', { missing: 'docker' }], ['Deno ausente', { missing: 'deno' }],
    ['Python ausente', { missing: 'python3' }], ['daemon indisponível', { daemon_failure: true }],
    ['cron ativo', { cron_bad: true }], ['SHOW falha', { cron_error: true }], ['host oficial sem bloqueio', { host_bad: true }],
    ['colisão de rede', { network_collision: true }], ['colisão de PostgreSQL', { pg_collision: true }],
    ['colisão de PostgREST', { pgrst_collision: true }], ['falha ao iniciar PG criado', { pg_start_failure: true }],
    ['falha ao iniciar PostgREST criado', { pgrst_start_failure: true }],
    ['PG ainda na primeira inicialização', { log_markers: 1 }], ['SQL não pronto', { sql_never: true }],
    ['bootstrap SQL falha', { sql_failure: 1 }], ['migration falha', { sql_failure: 5 }],
    ['porta publicada', { inspect_mutation: { target: 'pgrst', path: ['NetworkSettings', 'Ports'], value: { '3000/tcp': [{ HostIp: '0.0.0.0', HostPort: '3000' }] } } }],
    ['endereço externo', { inspect_mutation: { target: 'pgrst', path: ['NetworkSettings', 'Networks', '@network', 'IPAddress'], value: '8.8.8.8' } }],
    ['API nunca pronta', { http_never: true }], ['asserção Deno falha', { deno_failure: 1 }],
    ['zero testes', { report_mode: 'zero' }], ['placeholder ignorado', { report_mode: 'ignored' }],
    ['relatório ausente', { report_mode: 'missing' }], ['relatório inválido', { report_mode: 'malformed' }],
  ]) {
    test(`${kind}: ${name} reprova e preserva recursos alheios`, () => {
      const result = runHarness(kind, config);
      assertResult(result, false);
      if (config.cron_bad || config.cron_error || config.host_bad) {
        assert.equal(result.state.sql_calls, 0);
        assert.equal(result.state.deno_calls, 0);
      }
    });
  }
  for (const resource of ['pg', 'pgrst', 'network']) {
    for (const failure of ['inspect_failure', 'inspect_json']) {
      test(`${kind}: ${failure} de ${resource} falha antes do HTTP`, () => {
        const result = runHarness(kind, { [failure]: resource });
        assertResult(result, false);
        assert.equal(result.state.deno_calls, 0);
        assert.equal(result.state.events.filter(e => e.event === 'http').length, 0);
      });
    }
  }
  test(`${kind}: PostgREST encerrado mostra estado e logs limitados sem executar Deno`, () => {
    const result = runHarness(kind, { inspect_mutation: { target: 'pgrst', path: ['State'], value: { Running: false, ExitCode: 1, Error: 'synthetic startup failure' } } });
    assertResult(result, false);
    assert.equal(result.state.deno_calls, 0);
    assert.deepEqual(result.state.events.filter(e => e.event === 'pgrst_logs'), [{ event: 'pgrst_logs', bounded: true }]);
    assert.match(result.stderr, /"Running": false, "ExitCode": 1/);
  });
  for (const [signal, status] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    test(`${kind}: ${signal} não vira sucesso após Deno`, () => {
      const result = runHarness(kind, { signal });
      assertResult(result, false);
      assert.equal(result.status, status);
    });
  }
  for (const resource of ['pg', 'pgrst', 'network']) {
    test(`${kind}: falha de cleanup ${resource} não vira sucesso`, () => {
      const result = runHarness(kind, { [`cleanup_${resource}_failure`]: true });
      assertResult(result, false, { allowLeftovers: true });
      assert.ok(Object.keys(result.state.resources).length > 0);
    });
  }
}

test('x034: ausência da migration N-102a reprova antes de Deno', () => {
  const result = runHarness('x034', {}, repo => {
    fs.unlinkSync(path.join(repo, 'supabase/migrations/20261011003005_talkx_n102a_ddl.sql'));
  });
  assertResult(result, false);
  assert.equal(result.state.deno_calls, 0);
  assert.match(result.stderr, /migration ausente na cadeia: 20261011003005_talkx_n102a_ddl\.sql/);
});

test('x034: falha SQL no DDL N-102a não chega às fixtures ou ao Deno', () => {
  const result = runHarness('x034', { sql_failure: 19 });
  assertResult(result, false);
  assert.equal(result.state.sql_calls, 19);
  assert.equal(result.state.deno_calls, 0);
  assert.match(result.stderr, /cadeia: falhou ao aplicar 20261011003005_talkx_n102a_ddl\.sql/);
});

for (const [name, config] of [
  ['profile sem seed', { profile_empty: true }], ['profile de outra fixture', { profile_wrong: true }],
  ['JWT divergente (401)', { auth_status: 401 }], ['grant divergente (403)', { auth_status: 403 }],
  ['catálogo/backoff/RLS/FK rejeitados pelo SQL', { catalog_failure: true }],
  ['DELETE deixa conta residual', { residual_account: true }], ['verificação após teste falha', { teardown_query_error: true }],
  ['reset Deno falha após cursor verde', { deno_failure: 2 }],
  ['reset ignorado após cursor verde', { report_mode: 'ignored', report_call: 2 }],
]) {
  test(`gmail: ${name}`, () => assertResult(runHarness('gmail', config), false));
}

test('gmail: extração ambígua de helper reprova antes de executar os testes', () => {
  const result = runHarness('gmail', {}, repo => {
    const file = path.join(repo, 'supabase/migrations/20251215025014_fcc5bc79-55e3-4972-8765-6a7840fdce5a.sql');
    fs.appendFileSync(file, '\n' + fs.readFileSync(file, 'utf8'));
  });
  assertResult(result, false);
  assert.equal(result.state.deno_calls, 0);
  assert.match(result.stderr, /extração is_admin_or_supervisor/);
});

test('gmail: alteração do limite multidomínio não aplica SQL de outro domínio', () => {
  const result = runHarness('gmail', {}, repo => {
    const file = path.join(repo, 'supabase/migrations/20260404173941_26ed03e4-e874-44a0-b864-5db85b0ec44c.sql');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('-- 2. Connection health logs', '-- changed boundary'));
  });
  assertResult(result, false);
  assert.equal(result.state.sql_calls, 1);
  assert.match(result.stderr, /limite do bloco Gmail mudou/);
});

test('gmail: duas invocações Bash simultâneas mantêm recursos e IPs próprios', async () => {
  const f = fixture();
  try {
    const results = await Promise.all([1, 2].map(() => execute(BIN.bash, [path.join(f.repo, HARNESSES.gmail)], { cwd: f.repo, env: f.env, timeout: 20000 })));
    assert.ok(results.every(result => result.stdout.includes('[OK]')));
    const state = f.state();
    assert.equal(state.deno_calls, 4);
    assert.equal(new Set(state.events.filter(e => e.event === 'deno').map(e => e.url)).size, 2);
    assert.equal(Object.keys(state.resources).length, 0);
    assert.deepEqual(state.foreign_removed, []);
  } finally { f.remove(); }
});

function xml(count, attrs = '', extra = '') {
  return `<testsuite ${attrs}>${Array.from({ length: count }, (_, i) => `<testcase name="case-${i}"/>`).join('')}${extra}</testsuite>`;
}

const REPORT_CASES = [
  ...[7, 1, 8].map(count => [`contagem ${count}`, xml(count, `tests="${count}" failures="0" errors="0" skipped="0"`), count, true]),
  ['sem contadores', xml(1), 1, true],
  ['raiz agregada', `<testsuites tests="1">${xml(1)}</testsuites>`, 1, true],
  ['namespace', '<testsuite xmlns="urn:junit"><testcase name="a"/></testsuite>', 1, true],
  ['unicode e escape', '<testsuite><testcase name="recuperação &amp; conflito"/></testsuite>', 1, true],
  ['stdout', xml(1, '', '<system-out>diagnóstico</system-out>'), 1, true],
  ['arquivo ausente', null, 7, false], ['vazio', '', 7, false], ['XML inválido', '<testsuite>', 7, false],
  ['raiz errada', '<result><testcase name="a"/></result>', 1, false], ['zero', xml(0), 7, false],
  ['cursor incompleto', xml(6), 7, false], ['cursor excedente', xml(8), 7, false], ['reset vazio', xml(0), 1, false],
  ['engine incompleto', xml(7), 8, false],
  ...['skipped', 'failure', 'error'].map(tag => [tag, `<testsuite><testcase name="a"><${tag}/></testcase></testsuite>`, 1, false]),
  ...['skipped', 'ignored', 'disabled', 'failures', 'errors'].map(attr => [`contador ${attr}`, xml(1, `${attr}="1"`), 1, false]),
  ['contador contraditório', xml(1, 'tests="2"'), 1, false], ['contador não numérico', xml(1, 'tests="one"'), 1, false],
  ['contador negativo', xml(1, 'errors="-1"'), 1, false],
  ['nome duplicado', '<testsuite><testcase name="a"/><testcase name="a"/></testsuite>', 2, false],
  ['caso sem nome', '<testsuite><testcase/></testsuite>', 1, false],
  ['status falho', '<testsuite><testcase name="a" status="failed"/></testsuite>', 1, false],
  ['result ignorado', '<testsuite><testcase name="a" result="skipped"/></testsuite>', 1, false],
  ['DTD', '<!DOCTYPE r [<!ENTITY x "a">]><testsuite><testcase name="&x;"/></testsuite>', 1, false],
  ['esperado zero', xml(1), 0, false],
];

for (const [name, content, expected, accepted] of REPORT_CASES) {
  test(`JUnit real: ${name}`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-junit-control-'));
    try {
      const file = path.join(dir, 'report.xml');
      if (content !== null) fs.writeFileSync(file, content);
      const proc = spawnSync(BIN.python3, [path.join(ROOT, 'scripts/db-audit/assert-deno-junit.py'), file, String(expected)], { encoding: 'utf8' });
      assert.equal(proc.status === 0, accepted, proc.stdout + proc.stderr);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}

// Matriz anterior ao patch: metadados Docker sintéticos; executa o resolvedor
// Python real, sem modelar a semântica de Docker/PostgreSQL/PostgREST/Deno.
const METADATA_BASE = {"pgrst":{"Id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","Config":{"Labels":{"zapp.edge-harness":"unit01"}},"State":{"Running":true,"ExitCode":0,"Error":""},"HostConfig":{"NetworkMode":"zapp-gmail-cas-net-unit01","PortBindings":{}},"NetworkSettings":{"Ports":{"3000/tcp":null},"Networks":{"zapp-gmail-cas-net-unit01":{"NetworkID":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","IPAddress":"172.19.0.3","IPPrefixLen":24}}}},"pg":{"Id":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","Config":{"Labels":{"zapp.edge-harness":"unit01"}},"State":{"Running":true,"ExitCode":0,"Error":""},"HostConfig":{"NetworkMode":"zapp-gmail-cas-net-unit01","PortBindings":{}},"NetworkSettings":{"Ports":{"5432/tcp":null},"Networks":{"zapp-gmail-cas-net-unit01":{"NetworkID":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","IPAddress":"172.19.0.2","IPPrefixLen":24}}}},"network":{"Id":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","Labels":{"zapp.edge-harness":"unit01"},"Name":"zapp-gmail-cas-net-unit01","Internal":true,"Driver":"bridge","IPAM":{"Config":[{"Subnet":"172.19.0.0/24","Gateway":"172.19.0.1"}]},"Containers":{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":{"IPv4Address":"172.19.0.3/24"},"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb":{"IPv4Address":"172.19.0.2/24"}}}};
const METADATA_CASES = [
  ["own_internal_postgrest",[],0,"http://172.19.0.3:3000"],
  ["ports_empty",[["pgrst",["NetworkSettings","Ports"],{}]],0,"http://172.19.0.3:3000"],
  ["ports_null",[["pgrst",["NetworkSettings","Ports"],null]],0,"http://172.19.0.3:3000"],
  ["ports_empty_list",[["pgrst",["NetworkSettings","Ports","3000/tcp"],[]]],0,"http://172.19.0.3:3000"],
  ["private_range_10.23.0",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"10.23.0.3"],["pg",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"10.23.0.2"],["network",["IPAM","Config"],[{"Subnet":"10.23.0.0/24","Gateway":"10.23.0.1"}]],["network",["Containers","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","IPv4Address"],"10.23.0.3/24"],["network",["Containers","bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","IPv4Address"],"10.23.0.2/24"]],0,"http://10.23.0.3:3000"],
  ["private_range_192.168.23",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"192.168.23.3"],["pg",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"192.168.23.2"],["network",["IPAM","Config"],[{"Subnet":"192.168.23.0/24","Gateway":"192.168.23.1"}]],["network",["Containers","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","IPv4Address"],"192.168.23.3/24"],["network",["Containers","bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","IPv4Address"],"192.168.23.2/24"]],0,"http://192.168.23.3:3000"],
  ["wrong_container_id",[["pgrst",["Id"],"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"]],1,""],
  ["wrong_network_id",[["network",["Id"],"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"]],1,""],
  ["wrong_container_label",[["pgrst",["Config","Labels","zapp.edge-harness"],"foreign"]],1,""],
  ["missing_container_label",[["pgrst",["Config","Labels"],{}]],1,""],
  ["wrong_network_label",[["network",["Labels","zapp.edge-harness"],"foreign"]],1,""],
  ["missing_network_label",[["network",["Labels"],{}]],1,""],
  ["external_network",[["network",["Internal"],false]],1,""],
  ["internal_string",[["network",["Internal"],"true"]],1,""],
  ["wrong_driver",[["network",["Driver"],"host"]],1,""],
  ["two_attached_networks",[["pgrst",["NetworkSettings","Networks"],{"zapp-gmail-cas-net-unit01":{"NetworkID":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","IPAddress":"172.19.0.3","IPPrefixLen":24},"bridge":{}}]],1,""],
  ["no_attached_network",[["pgrst",["NetworkSettings","Networks"],{}]],1,""],
  ["wrong_endpoint_network",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","NetworkID"],"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"]],1,""],
  ["wrong_network_mode",[["pgrst",["HostConfig","NetworkMode"],"host"]],1,""],
  ["old_publish_request",[["pgrst",["HostConfig","PortBindings"],{"3000/tcp":[{"HostIp":"127.0.0.1","HostPort":""}]}]],1,""],
  ["unexpected_published_port",[["pgrst",["NetworkSettings","Ports","3000/tcp"],[{"HostIp":"0.0.0.0","HostPort":"3000"}]]],1,""],
  ["missing_pg_member",[["network",["Containers"],{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":{"IPv4Address":"172.19.0.3/24"}}]],1,""],
  ["foreign_member",[["network",["Containers"],{"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa":{"IPv4Address":"172.19.0.3/24"},"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb":{"IPv4Address":"172.19.0.2/24"},"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd":{"IPv4Address":"172.19.0.4/24"}}]],1,""],
  ["missing_pgrst_member",[["network",["Containers"],{"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb":{"IPv4Address":"172.19.0.2/24"}}]],1,""],
  ["member_ip_mismatch",[["network",["Containers","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","IPv4Address"],"172.19.0.9/24"]],1,""],
  ["member_prefix_mismatch",[["network",["Containers","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","IPv4Address"],"172.19.0.3/16"]],1,""],
  ["endpoint_prefix_mismatch",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPPrefixLen"],16]],1,""],
  ["missing_ipam",[["network",["IPAM","Config"],[]]],1,""],
  ["two_ipv4_subnets",[["network",["IPAM","Config"],[{"Subnet":"172.19.0.0/24"},{"Subnet":"172.20.0.0/24"}]]],1,""],
  ["invalid_subnet",[["network",["IPAM","Config"],[{"Subnet":"invalid"}]]],1,""],
  ["global_subnet",[["network",["IPAM","Config"],[{"Subnet":"8.0.0.0/8"}]]],1,""],
  ["running_exit_code",[["pgrst",["State","ExitCode"],17]],1,""],
  ["running_string",[["pgrst",["State","Running"],"true"]],1,""],
  ["missing_state",[["pgrst",["State"],{}]],1,""],
  ["bad_address_8.8.8.8",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"8.8.8.8"]],1,""],
  ["bad_address_127.0.0.1",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"127.0.0.1"]],1,""],
  ["bad_address_169.254.1.1",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"169.254.1.1"]],1,""],
  ["bad_address_224.0.0.1",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"224.0.0.1"]],1,""],
  ["bad_address_0.0.0.0",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"0.0.0.0"]],1,""],
  ["bad_address_172.20.0.3",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"172.20.0.3"]],1,""],
  ["bad_address_172.19.0.0",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"172.19.0.0"]],1,""],
  ["bad_address_172.19.0.255",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"172.19.0.255"]],1,""],
  ["bad_address_172.19.0.1",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"172.19.0.1"]],1,""],
  ["bad_address_example.invalid",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"example.invalid"]],1,""],
  ["bad_address_172.19.0.3/path",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"172.19.0.3/path"]],1,""],
  ["bad_address_::1",[["pgrst",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"::1"]],1,""],
  ["stopped_0",[["pgrst",["State","Running"],false],["pgrst",["State","Error"],"synthetic exit"]],2,""],
  ["stopped_1",[["pgrst",["State","Running"],false],["pgrst",["State","ExitCode"],1],["pgrst",["State","Error"],"synthetic exit"]],2,""],
  ["stopped_137",[["pgrst",["State","Running"],false],["pgrst",["State","ExitCode"],137],["pgrst",["State","Error"],"synthetic exit"]],2,""],
  ["wrong_pg_id",[["pg",["Id"],"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"]],1,""],
  ["wrong_pg_label",[["pg",["Config","Labels","zapp.edge-harness"],"foreign"]],1,""],
  ["missing_pg_label",[["pg",["Config","Labels"],{}]],1,""],
  ["two_pg_networks",[["pg",["NetworkSettings","Networks"],{"zapp-gmail-cas-net-unit01":{"NetworkID":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","IPAddress":"172.19.0.2","IPPrefixLen":24},"bridge":{}}]],1,""],
  ["no_pg_network",[["pg",["NetworkSettings","Networks"],{}]],1,""],
  ["wrong_pg_network_id",[["pg",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","NetworkID"],"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"]],1,""],
  ["wrong_pg_network_mode",[["pg",["HostConfig","NetworkMode"],"host"]],1,""],
  ["pg_port_binding",[["pg",["HostConfig","PortBindings"],{"5432/tcp":[{"HostPort":"5432"}]}]],1,""],
  ["pg_published_port",[["pg",["NetworkSettings","Ports","5432/tcp"],[{"HostPort":"5432"}]]],1,""],
  ["pg_bad_port_type",[["pg",["NetworkSettings","Ports"],[]]],1,""],
  ["pg_foreign_ip",[["pg",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"172.20.0.2"]],1,""],
  ["pg_same_ip",[["pg",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"172.19.0.3"]],1,""],
  ["pg_gateway_ip",[["pg",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPAddress"],"172.19.0.1"]],1,""],
  ["pg_wrong_prefix",[["pg",["NetworkSettings","Networks","zapp-gmail-cas-net-unit01","IPPrefixLen"],16]],1,""],
  ["pg_stopped",[["pg",["State","Running"],false]],1,""],
  ["pg_running_string",[["pg",["State","Running"],"true"]],1,""],
  ["pg_member_ip_mismatch",[["network",["Containers","bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","IPv4Address"],"172.19.0.9/24"]],1,""],
  ["pg_member_prefix_mismatch",[["network",["Containers","bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","IPv4Address"],"172.19.0.2/16"]],1,""],
];
for (const [name, mutations, expectedExit, expectedUrl] of METADATA_CASES) {
  test(`metadados internos reais: ${name}`, () => {
    const data = structuredClone(METADATA_BASE);
    for (const [resource, keys, value] of mutations) {
      let target = data[resource];
      for (const key of keys.slice(0, -1)) target = target[key];
      target[keys.at(-1)] = value;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-metadata-control-'));
    try {
      const paths = ['pgrst', 'pg', 'network'].map(kind => {
        const file = path.join(dir, `${kind}.json`);
        fs.writeFileSync(file, JSON.stringify(data[kind]));
        return file;
      });
      const proc = spawnSync(BIN.python3, [path.join(ROOT, 'scripts/db-audit/postgrest-internal-url.py'),
        ...paths, METADATA_BASE.pgrst.Id, METADATA_BASE.pg.Id, METADATA_BASE.network.Id,
        METADATA_BASE.network.Labels['zapp.edge-harness']], { encoding: 'utf8' });
      assert.equal(proc.status, expectedExit, proc.stdout + proc.stderr);
      assert.equal(proc.stdout.trim(), expectedUrl);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
}
