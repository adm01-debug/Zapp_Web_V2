import { X509Certificate } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const CA_TARGET = '/run/zapp-e2e-compiler/ca.crt';
const fail = code => { throw new Error(code); };

/** Copy only Docker's dependency-transport settings, never its registry identity. */
export function compilationProxyConfiguration(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail('compiler-proxy-config-invalid');
  if (config.proxies !== undefined && (!config.proxies || typeof config.proxies !== 'object' || Array.isArray(config.proxies))) fail('compiler-proxy-config-invalid');
  const source = config.proxies?.default;
  if (source === undefined) return {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) fail('compiler-proxy-config-invalid');
  const result = {};
  for (const name of ['httpProxy', 'httpsProxy', 'noProxy']) {
    const value = source[name];
    if (value === undefined || value === '') continue;
    if (typeof value !== 'string' || value.length > 16384 || /[\r\n\0]/.test(value)) fail('compiler-proxy-value-invalid');
    if (name !== 'noProxy') {
      let parsed;
      try { parsed = new URL(value); } catch { fail('compiler-proxy-url-invalid'); }
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.search ||
          parsed.hash || parsed.pathname !== '/' || value !== value.trim()) fail('compiler-proxy-url-invalid');
    }
    result[name] = value;
  }
  return result.httpProxy || result.httpsProxy ? result : {};
}

function publicCaFile(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || /[,\r\n\0]/.test(file)) fail('compiler-ca-path-invalid');
  try {
    const resolved = realpathSync(file);
    const stat = statSync(resolved);
    if (/[,\r\n\0]/.test(resolved) || !stat.isFile() || stat.size > 16 * 1024 * 1024) fail('compiler-ca-invalid');
    const pem = readFileSync(resolved, 'utf8');
    const expression = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
    const blocks = pem.match(expression) ?? [];
    if (!blocks.length || pem.replace(expression, '').trim()) fail('compiler-ca-invalid');
    for (const block of blocks) if (!new X509Certificate(block).ca) fail('compiler-ca-invalid');
    return pem;
  } catch { fail('compiler-ca-invalid'); }
}

/** Prepare a private client config used exclusively before app credentials exist. */
export function prepareCompilationNetwork({ directory, environment = process.env, homeDirectory = homedir() }) {
  const source = path.join(environment.DOCKER_CONFIG || path.join(homeDirectory, '.docker'), 'config.json');
  let config;
  try { config = JSON.parse(readFileSync(source, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') config = {};
    else fail('compiler-proxy-config-invalid');
  }
  const proxies = compilationProxyConfiguration(config);
  const enabled = Object.keys(proxies).length > 0;
  const ca = enabled ? environment.SSL_CERT_FILE || environment.CODEX_PROXY_CERT : null;
  const publicCa = ca ? publicCaFile(ca) : null;
  const caFile = publicCa ? path.join(directory, 'proxy-ca.crt') : null;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(directory, 'config.json'), JSON.stringify(enabled ? { proxies: { default: proxies } } : {}), { mode: 0o600 });
  if (caFile) writeFileSync(caFile, publicCa, { mode: 0o600 });
  return {
    args: caFile ? ['--mount', 'type=bind,src=' + caFile + ',dst=' + CA_TARGET + ',readonly',
      '--env', 'DENO_TLS_CA_STORE=system', '--env', 'SSL_CERT_FILE=' + CA_TARGET] : [],
    proxyConfigured: enabled,
    caMounted: Boolean(caFile),
  };
}
