import { createHash } from 'node:crypto';

export const ENGINES = Object.freeze(['chromium', 'firefox', 'webkit']);
export const VARIANTS = Object.freeze(['baseline', 'candidate']);
export const DEVICE = 'e2e-dummy0';
export const ADDRESS = '192.0.2.1';
export const PURPOSE = 'network-proof';
export const VERSION = '1.64.1';
export const DRIVER = 'mcr.microsoft.com/playwright:v1.64.1-noble@sha256:2f05f8a734509a7b3f26a912639488ee08f58a7b292d14d62271bcff9038768f';
export const MAX_JSON = 64 * 1024;
export const PHASES = Object.freeze(['preflight','browser-launch','native','tls-controls','external','emulation','link-down','link-up','fresh','result']);
export const FAILURE_CODES = Object.freeze(['execution-failed','browser-proof-failed','cleanup-failed','dummy-not-preloaded','tls-preflight-failed',
  'native-invocation','checkout-state','driver-version','driver-image','output-path','docker-endpoint','command-failed','iproute2-unavailable',
  'net-tool-provenance','net-tool-ldd-shape','net-tool-dependencies','canary-interface','canary-bind','canary-positive','canary-control',
  'container-create','container-not-running','container-isolation','container-endpoint','container-mounts','container-inspect','container-remains',
  'anchor-not-running','helper-exit','helper-result','namespace-not-isolated','namespace-changed','topology-identity','interface-inventory',
  'interface-peer','interface-iflink','interface-state','interface-kind','address-interface','address-duplicate','address-not-allowed','address-incomplete',
  'route-properties','route-duplicate','route-egress','route6-egress','route6-incomplete','route-incomplete','routing-rule','routing-rules-incomplete']);
export function publicFailureCode(error) {
  const message=typeof error?.message==='string'?error.message:'';
  const code=message.match(/^\[network-proof\/([a-z0-9-]+)\]$/)?.[1];
  if(FAILURE_CODES.includes(code))return code;
  if(/^\[e2e-isolated\/tls-[a-z0-9-]+\]$/.test(message))return 'tls-preflight-failed';
  return 'execution-failed';
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export function fail(code) { throw new Error('[network-proof/' + code + ']'); }
export function requireTrue(value, code) { if (value !== true) fail(code); return true; }
export function object(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => !required.includes(k) && !optional.includes(k)) ||
      required.some(k => !Object.hasOwn(value, k))) fail('object-shape');
  return value;
}
const array = (value, max = 64) => { if (!Array.isArray(value) || value.length > max) fail('array-shape'); return value; };
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const equalSet = (a, b) => Array.isArray(a) && new Set(a).size === a.length && a.length === b.length && a.every(v => b.includes(v));
export function identity(runId, sourceSha) {
  if (typeof runId !== 'string' || !/^zapp-e2e-[a-z0-9-]{8,64}$/.test(runId) ||
      typeof sourceSha !== 'string' || !/^[0-9a-f]{40}$/.test(sourceSha) || /^0+$/.test(sourceSha)) fail('identity');
  return { schema: 1, run_id: runId, source_sha: sourceSha };
}
export function requestScope(event, requested, sha) {
  identity('zapp-e2e-model-00000000', sha);
  if (event === 'pull_request') return 'login';
  if (event !== 'workflow_dispatch' || !['login', 'full-suite', 'network-proof', 'network-proof-contexts'].includes(requested || 'login')) fail('request-scope');
  return requested || 'login';
}
export function commandOutput(result) {
  if (!result || result.code !== 0 || result.signal || result.error || result.timedOut || result.truncated ||
      typeof result.stdout !== 'string' || Buffer.byteLength(result.stdout) > 1024 * 1024) fail('command-failed');
  return result.stdout;
}
export function parseJson(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_JSON || text.includes('\0')) fail('json-size');
  try { return JSON.parse(text); } catch { fail('json-shape'); }
}
export function dummyIsLoaded(modules, initstate) {
  if (typeof modules !== 'string' || Buffer.byteLength(modules) > 1024 * 1024 || typeof initstate !== 'string') return false;
  const entries = modules.split(/\r?\n/).filter(line => /^dummy(?:\s|$)/.test(line));
  return entries.length === 1 && /^dummy\s+\d+\s+\d+\s+\S+\s+Live\s+0x[0-9a-f]+(?:\s+\([^\s()]+\))?$/.test(entries[0]) && initstate.trim() === 'live';
}
export function assertControl(value, expected, acknowledgment = false) {
  const fields = ['schema', 'run_id', 'source_sha', 'variant', 'engine', 'sequence', 'action'];
  object(value, acknowledgment ? [...fields, 'accepted'] : fields);
  identity(value.run_id, value.source_sha);
  if (value.schema !== 1 || value.run_id !== expected.run_id || value.source_sha !== expected.source_sha ||
      value.variant !== 'candidate' || value.variant !== expected.variant || !ENGINES.includes(value.engine) ||
      value.engine !== expected.engine || value.sequence !== expected.sequence || value.action !== expected.action ||
      !((value.sequence === 1 && value.action === 'down') || (value.sequence === 2 && value.action === 'up')) ||
      (acknowledgment && value.accepted !== true)) fail('control-mismatch');
  return value;
}
export function assertCanary(before, after, unexpected) {
  object(before, ['valid', 'count', 'connections']); object(after, ['valid', 'count', 'connections']);
  if (before.valid !== true || after.valid !== true || !integer(before.count, 1) ||
      !integer(before.connections,1) || after.count !== before.count + 1 ||
      after.connections !== before.connections + 1 || unexpected !== false) fail('canary-control');
  return true;
}

/** Kernel evidence is private. No raw route, interface, address or namespace dump is published. */
export function assertTopology(s, variant, state = 'up') {
  object(s, ['namespace', 'links', 'addresses', 'routes4', 'routes6', 'rules4', 'rules6', 'syslinks', 'official_host_local']);
  if (!VARIANTS.includes(variant) || !['up', 'down'].includes(state) || (variant === 'baseline' && state !== 'up') ||
      typeof s.namespace !== 'string' || !/^net:\[\d+\]$/.test(s.namespace) || s.official_host_local !== true) fail('topology-identity');
  const names = variant === 'baseline' ? ['lo'] : ['lo', DEVICE];
  const links = array(s.links, 2), addresses = array(s.addresses, 2), syslinks = array(s.syslinks, 2);
  if (!equalSet(links.map(x => x.ifname), names) || !equalSet(addresses.map(x => x.ifname), names) ||
      !equalSet(syslinks.map(x => x.name), names) || new Set(links.map(x => x.ifindex)).size !== links.length) fail('interface-inventory');
  for (const link of links) {
    if (!integer(link.ifindex, 1) || ['master', 'link', 'link_index', 'link_netnsid', 'link-netnsid', 'link_netns'].some(k => Object.hasOwn(link, k))) fail('interface-peer');
    const sys = syslinks.find(x => x.name === link.ifname);
    object(sys, ['name', 'ifindex', 'iflink']);
    if (sys.ifindex !== link.ifindex || sys.iflink !== link.ifindex) fail('interface-iflink');
    const lo = link.ifname === 'lo', up = lo || state === 'up';
    const flags = lo ? ['LOOPBACK', 'UP', 'LOWER_UP'] : ['BROADCAST', 'NOARP', ...(up ? ['UP', 'LOWER_UP'] : [])];
    if (!equalSet(link.flags, flags) || !(up ? ['UP', 'UNKNOWN'].includes(link.operstate) : link.operstate === 'DOWN') ||
        link.link_type !== (lo ? 'loopback' : 'ether')) fail('interface-state');
    if (lo ? (link.linkinfo !== undefined) : (link.linkinfo?.info_kind !== 'dummy' || link.linkinfo?.info_slave_kind !== undefined)) fail('interface-kind');
  }
  let ipv6Loopback = false;
  for (const row of addresses) {
    const infos = array(row.addr_info, 2);
    if (!integer(row.ifindex, 1) || row.ifindex !== links.find(x => x.ifname === row.ifname).ifindex) fail('address-interface');
    const seen = new Set();
    for (const info of infos) {
      const key = info.family + ':' + info.local;
      if (seen.has(key) || info.peer !== undefined) fail('address-duplicate'); seen.add(key);
      const lo4 = row.ifname === 'lo' && info.family === 'inet' && info.local === '127.0.0.1' && info.prefixlen === 8 && info.scope === 'host';
      const lo6 = row.ifname === 'lo' && info.family === 'inet6' && info.local === '::1' && info.prefixlen === 128 && info.scope === 'host';
      const dummy4 = row.ifname === DEVICE && info.family === 'inet' && info.local === ADDRESS && info.prefixlen === 32 && info.scope === 'global';
      if (!lo4 && !lo6 && !dummy4) fail('address-not-allowed');
      if (lo6) ipv6Loopback = true;
    }
    if (row.ifname === 'lo' ? !seen.has('inet:127.0.0.1') : !equalSet([...seen], ['inet:' + ADDRESS])) fail('address-incomplete');
  }
  const routeKeys = ['type', 'dst', 'dev', 'table', 'protocol', 'scope', 'prefsrc', 'metric', 'flags', 'pref'];
  const required4 = new Set(['local|127.0.0.0/8|lo', 'local|127.0.0.1|lo']);
  if (variant === 'candidate') required4.add('local|' + ADDRESS + '|' + DEVICE);
  for (const family of [4, 6]) {
    const seen = new Set();
    for (const r of array(s['routes' + family], 12)) {
      object(r, ['dst', 'dev', 'protocol'], routeKeys.filter(k => !['dst', 'dev', 'protocol'].includes(k)));
      const table = ({255:'local',254:'main'})[r.table] || r.table || 'main';
      const proto = r.protocol === 2 ? 'kernel' : r.protocol;
      const type = r.type || 'unicast';
      const flags = r.flags || [];
      if (proto !== 'kernel' || !['local', 'main'].includes(table) || !Array.isArray(flags) ||
          flags.some(x => !(state === 'down' && r.dev === DEVICE && x === 'linkdown')) ||
          (r.metric !== undefined && ![0, 256].includes(r.metric)) ||
          (r.pref !== undefined && r.pref !== 'medium') ||
          (r.scope !== undefined && !['host', 'link', 'global'].includes(r.scope))) fail('route-properties');
      const key = type + '|' + r.dst + '|' + r.dev;
      const unique = table + '|' + key;
      if (seen.has(unique)) fail('route-duplicate'); seen.add(unique);
      if (family === 4) {
        const lo = r.dev === 'lo' && table === 'local' && ((type === 'local' && ['127.0.0.0/8', '127.0.0.1'].includes(r.dst)) ||
          (type === 'broadcast' && ['127.0.0.0', '127.255.255.255'].includes(r.dst)));
        const dummy = variant === 'candidate' && r.dev === DEVICE && table === 'local' && type === 'local' && r.dst === ADDRESS;
        if ((!lo && !dummy) || (r.prefsrc !== undefined && r.prefsrc !== (lo ? '127.0.0.1' : ADDRESS))) fail('route-egress');
        required4.delete(key);
      } else if (!(ipv6Loopback && r.dev === 'lo' && ['::1', '::1/128'].includes(r.dst) &&
          ((table === 'local' && type === 'local') || (table === 'main' && type === 'unicast')) &&
          (r.prefsrc === undefined || r.prefsrc === '::1'))) fail('route6-egress');
    }
    if (family === 6 && ipv6Loopback && ![...seen].some(x => x.startsWith('local|local|::1'))) fail('route6-incomplete');
  }
  if (required4.size) fail('route-incomplete');
  for (const family of [4, 6]) {
    const rules = array(s['rules' + family], 3), seen = new Set();
    for (const r of rules) {
      object(r, ['priority', 'src', 'table'], ['protocol']);
      const table = ({255:'local',254:'main',253:'default'})[r.table] || r.table;
      const key = r.priority + ':' + table;
      if (r.src !== 'all' || !['0:local', '32766:main', '32767:default'].includes(key) || seen.has(key) ||
          (r.protocol !== undefined && !['kernel', 2].includes(r.protocol))) fail('routing-rule');
      seen.add(key);
    }
    if (!seen.has('0:local') || !seen.has('32766:main') || (family === 4 && !seen.has('32767:default'))) fail('routing-rules-incomplete');
  }
  return { interfaces: names.length, loopback_ipv6: ipv6Loopback, running_derived_from_operstate: true, topology_valid: true };
}

export function assertContainer(c, expected) {
  const host = c?.HostConfig, cfg = c?.Config;
  if (!c || c.Id !== expected.id || !/^[a-f0-9]{64}$/.test(c.Id) || c.Name !== '/' + expected.name ||
      cfg?.Labels?.['zapp.e2e.owner'] !== expected.run_id || cfg?.Labels?.['zapp.e2e.purpose'] !== PURPOSE ||
      cfg?.Labels?.['zapp.e2e.source'] !== expected.source_sha || cfg?.Image !== DRIVER ||
      c.Image !== expected.image_id || cfg.User !== expected.user ||
      host?.NetworkMode !== expected.network || host.Privileged !== false || host.PublishAllPorts !== false ||
      Object.keys(host.PortBindings || {}).length || Object.keys(c.NetworkSettings?.Ports || {}).length ||
      host.PidMode === 'host' || host.IpcMode === 'host' || host.UTSMode === 'host' || host.UsernsMode === 'host' ||
      !equalSet(host.CapDrop, ['ALL']) || !equalSet(host.CapAdd || [], expected.helper ? ['NET_ADMIN'] : []) ||
      !array(host.SecurityOpt || [], 4).includes('no-new-privileges:true')) fail('container-isolation');
  const networks = Object.keys(c.NetworkSettings?.Networks || {});
  if (!networks.every(n => n === 'none') || (expected.network === 'none' && !equalSet(networks, ['none']))) fail('container-endpoint');
  const mounts = array(c.Mounts || [], 12), desired = expected.mounts;
  if (!Array.isArray(desired) || mounts.length !== desired.length || new Set(mounts.map(m => m.Destination)).size !== mounts.length) fail('container-mounts');
  for (const m of mounts) {
    if (m.Type !== 'bind' || /(?:^|\/)docker\.sock$/.test(m.Source || '') || /(?:^|\/)docker\.sock$/.test(m.Destination || '') ||
        !desired.some(d => d.source === m.Source && d.target === m.Destination && d.write === m.RW)) fail('container-mounts');
  }
  return true;
}

export function assertEngineResult(value, expected) {
  object(value, ['schema','run_id','source_sha','variant','engine','native','emulation','link','fresh','external','versions','node_navigator_online']);
  identity(value.run_id,value.source_sha);
  if (value.schema !== 1 || value.run_id !== expected.run_id || value.source_sha !== expected.source_sha ||
      value.variant !== expected.variant || value.engine !== expected.engine || !VARIANTS.includes(value.variant) || !ENGINES.includes(value.engine)) fail('engine-identity');
  object(value.native, ['online','https','node_https','tls_untrusted_rejected','tls_wrong_san_rejected']);
  if (typeof value.native.online !== 'boolean' || (value.variant === 'candidate' && !value.native.online) ||
      ['https','node_https','tls_untrusted_rejected','tls_wrong_san_rejected'].some(k => value.native[k] !== true)) fail('native-proof');
  object(value.fresh, ['online','https','unemulated']);
  if (typeof value.fresh.online !== 'boolean' || value.fresh.https !== true || value.fresh.unemulated !== true ||
      (value.variant === 'candidate' && value.fresh.online !== true)) fail('fresh-proof');
  object(value.external,['node_blocked','browser_blocked']);
  if (value.external.node_blocked !== true || value.external.browser_blocked !== true) fail('external-proof');
  if (value.variant === 'candidate') {
    object(value.emulation,['offline_online','offline_blocked','offline_event','online_online','online_https','online_event']);
    if (value.emulation.offline_online !== false || ['offline_blocked','offline_event','online_online','online_https','online_event'].some(k => value.emulation[k] !== true)) fail('emulation-proof');
    object(value.link,['down_online','down_event','up_online','up_event','https_after_up','unemulated']);
    if (value.link.down_online !== false || ['down_event','up_online','up_event','https_after_up','unemulated'].some(k => value.link[k] !== true)) fail('link-proof');
  } else if (value.emulation !== null || value.link !== null) fail('baseline-emulated');
  object(value.versions,['node','playwright','browser']);
  if (!/^v?\d+\.\d+\.\d+$/.test(value.versions.node || '') || value.versions.playwright !== VERSION ||
      !/^\d+(?:\.\d+){1,4}$/.test(value.versions.browser || '') ||
      (typeof value.node_navigator_online !== 'boolean' && value.node_navigator_online !== 'unavailable')) fail('version-proof');
  return value;
}

export function assertFailure(value,expected) {
  object(value,['schema','run_id','source_sha','variant','engine','phase','observations']);
  identity(value.run_id,value.source_sha);
  if(value.schema!==1||value.run_id!==expected.run_id||value.source_sha!==expected.source_sha||value.variant!==expected.variant||
    value.engine!==expected.engine||!VARIANTS.includes(value.variant)||!ENGINES.includes(value.engine)||!PHASES.includes(value.phase))fail('failure-identity');
  object(value.observations,['native_online','native_https','node_https']);
  if(Object.values(value.observations).some(x=>x!==null&&typeof x!=='boolean'))fail('failure-observations');
  return value;
}
