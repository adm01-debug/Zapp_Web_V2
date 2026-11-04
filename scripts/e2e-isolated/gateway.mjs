import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import { ORIGIN, publicIdentity } from './runtime-contract.mjs';
import { readGatewayTls, serveTlsProbe, startTlsControlServers } from './tls.mjs';

const PORTS = Object.freeze({ auth: 9999, rest: 3000, storage: 5000, realtime: 4000, functions: 9000, app: 5174 });

export function routeRequest(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.startsWith('/') || rawPath.startsWith('//') || /[\r\n]/.test(rawPath)) {
    throw new Error('invalid-local-path');
  }
  const url = new URL(rawPath, ORIGIN);
  const routes = [
    ['/auth/v1', 'auth', ''],
    ['/rest/v1', 'rest', ''],
    ['/storage/v1', 'storage', ''],
    ['/realtime/v1/api', 'realtime', '/api'],
    ['/realtime/v1', 'realtime', '/socket'],
    ['/functions/v1', 'functions', ''],
  ];
  for (const [prefix, service, replacement] of routes) {
    if (url.pathname === prefix || url.pathname.startsWith(prefix + '/')) {
      const path = replacement + url.pathname.slice(prefix.length) || '/';
      return { service, port: PORTS[service], path: path + url.search };
    }
  }
  return { service: 'app', port: PORTS.app, path: url.pathname + url.search };
}

export function createGateway(identity, { tls, request = http.request, connect = net.connect } = {}) {
  if (identity?.origin !== ORIGIN || !tls?.server?.cert || !tls.server.key) throw new Error('gateway-tls-required');
  const reply = (res, status, body, type = 'text/plain') => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  const acceptedHost = '127.0.0.1:5173';
  const server = https.createServer(tls.server, (req, res) => {
    if (req.headers.host !== acceptedHost) return reply(res, 400, 'Invalid local host');
    if (serveTlsProbe(req, res, identity)) return;
    if (req.url === '/__e2e/identity') {
      if (req.method !== 'GET') return reply(res, 405, 'Method not allowed');
      return reply(res, 200, JSON.stringify(identity), 'application/json');
    }
    if (req.url === '/__e2e/preflight') {
      if (req.method !== 'GET') return reply(res, 405, 'Method not allowed');
      return reply(res, 200, '<!doctype html><meta charset="utf-8"><title>E2E isolated preflight</title>', 'text/html');
    }
    let target;
    try { target = routeRequest(req.url); } catch { return reply(res, 400, 'Invalid local path'); }
    const headers = {
      ...req.headers,
      host: target.service === 'realtime' ? 'realtime-dev.supabase-realtime' : '127.0.0.1:' + target.port,
      'x-forwarded-host': acceptedHost,
      'x-forwarded-proto': 'https',
      'x-forwarded-for': '127.0.0.1',
    };
    delete headers['proxy-authorization'];
    const upstream = request({ hostname: '127.0.0.1', port: target.port, path: target.path, method: req.method, headers }, incoming => {
      const location = incoming.headers.location;
      if (location) {
        let redirect;
        try { redirect = new URL(location, ORIGIN); } catch { incoming.resume(); return reply(res, 502, 'Invalid upstream redirect'); }
        if (redirect.origin !== ORIGIN) {
          incoming.resume();
          return reply(res, 502, 'External redirect blocked');
        }
      }
      res.writeHead(incoming.statusCode || 502, incoming.headers);
      incoming.pipe(res);
    });
    upstream.setTimeout(120_000, () => upstream.destroy(new Error('upstream-timeout')));
    upstream.on('error', () => {
      if (!res.headersSent) reply(res, 502, 'Local upstream unavailable');
      else res.destroy();
    });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  });
  server.on('upgrade', (req, socket, head) => {
    if (req.headers.host !== acceptedHost) return socket.destroy();
    let target;
    try { target = routeRequest(req.url); } catch { return socket.destroy(); }
    if (!['app', 'realtime'].includes(target.service)) return socket.destroy();
    const upstream = connect({ host: '127.0.0.1', port: target.port }, () => {
      const headers = { ...req.headers, host: target.service === 'realtime' ? 'realtime-dev.supabase-realtime' : '127.0.0.1:' + target.port };
      delete headers['proxy-authorization'];
      const raw = Object.entries(headers).map(([key, value]) => key + ': ' + value).join('\r\n');
      upstream.write(req.method + ' ' + target.path + ' HTTP/1.1\r\n' + raw + '\r\n\r\n');
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const identity = publicIdentity(process.env.ZAPP_E2E_RUN_ID, process.env.GITHUB_SHA);
  const tls = readGatewayTls();
  const closeControls = await startTlsControlServers(identity, tls);
  const gateway = createGateway(identity, { tls });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    gateway.closeAllConnections();
    await Promise.all([new Promise(resolve => gateway.close(resolve)), closeControls()]);
  };
  process.once('SIGTERM', close); process.once('SIGINT', close);
  try {
    await new Promise((resolve, reject) => { gateway.once('error', reject); gateway.listen(5173, '127.0.0.1', resolve); });
    process.stdout.write('[e2e-isolated] local HTTPS gateway ready\n');
  } catch { await close(); throw new Error('gateway-listen-failed'); }
}
