// Compile as a temporary Edge main-service; never register as an app function.
const origin = 'https://127.0.0.1:5173';
const runId = Deno.env.get('ZAPP_E2E_RUN_ID');
const sourceSha = Deno.env.get('GITHUB_SHA');
if (!/^zapp-e2e-[a-z0-9-]{8,64}$/.test(runId || '') || !/^[a-f0-9]{40}$/.test(sourceSha || '') ||
    Deno.env.get('DENO_TLS_CA_STORE') !== 'system' || Deno.env.get('SSL_CERT_FILE') !== '/run/zapp-e2e-tls/ca.crt' ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('JWT_SECRET')) throw new Error('invalid-tls-probe-environment');

const options = () => ({ redirect: 'error' as const, signal: AbortSignal.timeout(10_000) });
const identity = { schema: 1, run_id: runId, source_sha: sourceSha, origin };

Deno.serve({ hostname: '127.0.0.1' }, async (request: Request) => {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.hostname !== '127.0.0.1') return new Response(null, { status: 404 });
  if (url.pathname === '/__e2e/ready') return Response.json({ ...identity, runtime: 'edge', ready: true });
  if (url.pathname !== '/__e2e/tls') return new Response(null, { status: 404 });
  try {
    const response = await fetch(origin + '/__e2e/identity', options());
    const received = response.ok ? await response.json() : null;
    if (Object.entries(identity).some(([key, value]) => received?.[key] !== value)) throw new Error('identity');
    const image = await fetch(origin + '/__e2e/tls-probe.png', options());
    if (!image.ok || image.headers.get('content-type')?.split(';')[0] !== 'image/png') throw new Error('image');
    const bytes = new Uint8Array(await image.arrayBuffer());
    const expected = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII='), value => value.charCodeAt(0));
    if (bytes.length !== expected.length || bytes.some((value, index) => value !== expected[index])) throw new Error('image');
    for (const port of [5175, 5176]) {
      let rejection: unknown;
      try { await fetch('https://127.0.0.1:' + port + '/__e2e/tls-control', options()); }
      catch (error) { rejection = error; }
      const message = rejection instanceof Error ? rejection.message : '';
      if (!rejection || /timed? ?out|connection refused|aborted/i.test(message) ||
          !/invalid peer certificate|UnknownIssuer|NotValidForName|certificate.*(unknown|issuer|name|valid)/i.test(message)) throw new Error('negative-certificate');
    }
    return Response.json({ ...identity, runtime: 'edge', checks: {
      identity: true, image: true, untrusted_rejected: true, wrong_san_rejected: true,
    } });
  } catch { return Response.json({ ...identity, runtime: 'edge', error: 'tls-probe-failed' }, { status: 503 }); }
});
