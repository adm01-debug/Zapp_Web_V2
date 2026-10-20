// Two bounded source probes. Product packages, browser, SDK and network are unavailable.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const here = path.dirname(new URL(import.meta.url).pathname);
const root = '/workspace/scratch/f8f9b9cbce53/reaudit/source';
const pinFile = path.join(here, 'telemetry-error-probe-pins.json');
const pins = JSON.parse(fs.readFileSync(pinFile, 'utf8'));
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
for (const p of pins.sources) assert.equal(hash(fs.readFileSync(path.join(root, p.path))), p.sha256, `source pin ${p.path}`);
assert.equal(hash(fs.readFileSync(pins.compiler.path)), pins.compiler.sha256, 'compiler pin before import');
const ts = createRequire(import.meta.url)(pins.compiler.path);
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true };
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
const inert = (...names) => Object.fromEntries(names.map(n => [n,n]));
const atoms = inert('Button','Card','CardContent','CardHeader','CardTitle','CardDescription','Badge','Skeleton','Select','SelectTrigger','SelectContent','SelectItem','SelectValue','Popover','PopoverTrigger','PopoverContent','Calendar','AlertTriangle','RefreshCw','Home','Bug','Activity','Trash2','CalendarIcon');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
function moduleText(p, modules) {
  assert.ok(pins.sources.some(pin => pin.path === p), `only pinned module ${p}`);
  const code = ts.transpileModule(read(p), { fileName:p, compilerOptions:options }).outputText;
  assert.equal(/import\(/u.test(code), false, 'dynamic import denied');
  const exports = {};
  vm.runInNewContext(code, { exports, React, require: id => { assert.ok(Object.hasOwn(modules,id), `import denied ${id}`); return modules[id]; } }, { timeout:2000 });
  return exports;
}
function findNode(node, type) {
  if (node?.type === type) return node;
  for (const child of node?.props?.children?.flat(Infinity) ?? []) {
    const hit = findNode(child,type); if (hit) return hit;
  }
}
function words(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node?.props?.children?.flat(Infinity) ?? []).map(words).join(' ');
}
const cases = [];

// P01: consume the documented error-state boundary, then run actual page/table JSX.
{
  let queryConfig; let response = { data:null, error:{ message:'synthetic query unavailable' } };
  const chain = {};
  for (const method of ['select','gte','lte','order','limit','eq']) chain[method] = () => chain;
  chain.then = (resolve,reject) => Promise.resolve(response).then(resolve,reject);
  const supabase = { from: table => { assert.equal(table,'query_telemetry'); return chain; } };
  const utils = moduleText('src/pages/admin-telemetria/telemetryUtils.tsx', {
    '@/lib/localDay': { zonedDayStartISO: () => assert.fail('calendar branch not in this case') },
    '@/components/ui/badge': atoms,
  });
  const table = moduleText('src/pages/admin-telemetria/TelemetryTable.tsx', {
    '@/components/ui/card':atoms, '@/components/ui/badge':atoms, '@/components/ui/skeleton':atoms,
    'lucide-react':atoms, './telemetryUtils':utils,
  });
  let result = { data:undefined, isLoading:false, isRefetching:false, isError:true, status:'error', error:response.error, refetch:() => assert.fail('refetch not invoked') };
  const page = moduleText('src/pages/AdminTelemetriaPage.tsx', {
    react:{ useState:value => [value,() => assert.fail('no user mutation')] }, 'date-fns':{ format:() => assert.fail('custom calendar unused') },
    '@/components/ui/button':atoms, '@/components/ui/select':atoms, '@/components/ui/popover':atoms, '@/components/ui/calendar':atoms,
    '@tanstack/react-query':{ useQuery:options => { queryConfig = options; return result; } },
    '@/integrations/supabase/client':{ supabase }, 'lucide-react':atoms,
    '@/components/admin/telemetry/TelemetryCharts':{ TelemetryCharts:'TelemetryCharts' },
    sonner:{ toast:{ error:() => assert.fail('cleanup not invoked'), success:() => assert.fail('cleanup not invoked') } },
    '@/lib/utils':{ cn:(...values) => values.filter(Boolean).join(' ') },
    './admin-telemetria/telemetryUtils':utils,
    './admin-telemetria/TelemetryStatsCards':{ TelemetryStatsCards:'TelemetryStatsCards' },
    './admin-telemetria/TelemetryTopOffenders':{ TelemetryTopOffenders:'TelemetryTopOffenders' },
    './admin-telemetria/TelemetryTable':table,
  });
  const failed = page.default();
  await assert.rejects(queryConfig.queryFn(), error => error === response.error);
  const tableProps = findNode(failed,table.TelemetryTable).props;
  const output = table.TelemetryTable(tableProps);
  assert.match(words(output), /O sistema está performando bem\./u);
  assert.equal(tableProps.rows.length,0);
  const cards = findNode(failed,'TelemetryStatsCards').props;
  assert.equal(cards.errors,0); assert.equal(cards.avgDuration,'0ms');
  result = { ...result, isLoading:true, status:'pending', isError:false };
  const loading = table.TelemetryTable(findNode(page.default(),table.TelemetryTable).props);
  assert.doesNotMatch(words(loading), /performando bem/u);
  response = { data:[], error:null };
  assert.equal((await queryConfig.queryFn()).length,0);
  cases.push({ id:'INF-TE-P01', finding:'R2-INF-040', executed:'actual queryFn with fake SDK failure; full page/helper/table source with documented query error state supplied at hook boundary', observed:{ query_error_propagates:true, table_rows:0, cards_errors:0, average:'0ms', claims_healthy:true }, controls:{ loading_does_not_claim_healthy:true, query_success_empty_returns_array:true }, limitations:'TanStack/React are not imported; retries and render lifecycle are not simulated. The error-state shape follows the primary Query documentation; this is not a browser observation.' });
}

// P02: actual render method, isolated from componentDidCatch/reporting/reloads.
{
  const p = 'src/components/errors/ErrorBoundary.tsx';
  const sf = ts.createSourceFile(p, read(p), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const klass = sf.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'ErrorBoundary');
  const method = klass.members.find(n => ts.isMethodDeclaration(n) && n.name.getText(sf) === 'render');
  assert.ok(method?.body);
  let text = `(function() ${method.body.getText(sf)})`;
  assert.equal(text.split('{import.meta.env.DEV &&').length - 1,1);
  text = text.replace('{import.meta.env.DEV &&','{false &&'); // bounded production flag; no product mutation
  const code = ts.transpileModule(text, { fileName:'probe.tsx', compilerOptions:options }).outputText;
  const render = vm.runInNewContext(code, { React, ...atoms }, { timeout:2000 });
  const context = fallback => ({ props:{ fallback, children:'core subtree' }, state:{ hasError:true, error:new Error('synthetic render error'), errorInfo:null } });
  const nullOutput = render.call(context(null));
  assert.equal(nullOutput.type,'div'); assert.equal(nullOutput.props.role,'alert');
  assert.match(nullOutput.props.className,/min-h-screen/u);
  assert.match(words(nullOutput),/Ops! Algo deu errado/u);
  const explicit = { type:'custom-fallback', props:{ children:['sentinel'] } };
  assert.equal(render.call(context(explicit)),explicit);
  assert.equal(render.call({ ...context(null), state:{ hasError:false } }),'core subtree');
  cases.push({ id:'INF-TE-P02', finding:'R2-INF-041', executed:'actual ErrorBoundary.render body with DEV=false and inert JSX capture', observed:{ explicit_null_returns:nullOutput.type, role:nullOutput.props.role, full_viewport_min_height:true }, controls:{ explicit_truthy_fallback_preserved:true, no_error_returns_children:true }, limitations:'Does not run componentDidCatch, any reload, telemetry reporter or React lifecycle. AppRoutes remaining mounted is source evidence, not a router runtime test.' });
}
const output = { schema_version:1, baseline_sha:pins.baseline_sha, probe_source_sha256:hash(fs.readFileSync(new URL(import.meta.url))), pins_sha256:hash(fs.readFileSync(pinFile)), case_count:cases.length, finding_ids:cases.map(c=>c.finding), cases, controls:{ source_and_compiler_pins_before_import:true, production_imports:0, product_network_calls:0, browser_or_at_test:false, source_writes:0 }, limitation:'Two cases for two findings. Only audit JSON output is written; no suite/build/typecheck success implied.' };
fs.writeFileSync(path.join(here,'telemetry-error-probes.json'),JSON.stringify(output,null,2)+'\n');
process.stdout.write(JSON.stringify({case_count:cases.length,finding_ids:output.finding_ids,status:'PASS'})+'\n');
