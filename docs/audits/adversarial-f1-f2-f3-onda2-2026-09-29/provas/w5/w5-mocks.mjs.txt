// Harness de rede W5 — mocka Supabase (auth/REST/functions), Mapbox e realtime
// no navegador real, sem tocar o backend. Usado pelos especimes Playwright desta onda.
// NUNCA fala com producao: todo request e respondido localmente.
import fs from 'node:fs';

export const REF = 'tnnnlkbymytvtqngbbqh';
export const SUPABASE_ORIGIN = `https://${REF}.supabase.co`;
export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const CONTACT_ID = '04dff4dc-c6b1-4283-ac22-bd8639804759';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

export function fakeJwt(sub) {
  const now = Math.floor(Date.now() / 1000);
  return [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ sub, aud: 'authenticated', role: 'authenticated', exp: now + 3600, iat: now, email: 'e2e-mock@example.invalid' }),
    'w5fakesig',
  ].join('.');
}

export function fakeUser(id = USER_ID) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'e2e-mock@example.invalid',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    phone: '',
    confirmed_at: '2026-01-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { name: 'W5 Mock' },
    identities: [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    is_anonymous: false,
  };
}

export function fakeSession(id = USER_ID) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: fakeJwt(id),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'w5-fake-refresh',
    user: fakeUser(id),
  };
}

/** Contato COM endereco no banco simulado — o que o 2o editor deveria mostrar. */
export const contactRowWithAddress = {
  id: CONTACT_ID,
  name: 'W5 Contato Endereco',
  phone: '551146375517',
  email: 'w5@example.invalid',
  nickname: 'W5',
  surname: 'Auditoria',
  job_title: 'Analista',
  company: 'Promo Brindes',
  contact_type: 'cliente',
  avatar_url: null,
  address: 'Avenida Paulista',
  address_number: '1578',
  neighborhood: 'Bela Vista',
  city: 'Sao Paulo',
  state: 'SP',
  postal_code: '01310200',
  latitude: -23.561414,
  longitude: -46.655881,
  assigned_to: USER_ID,
  queue_id: null,
  conversation_status: 'open',
  tags: [],
  notes: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  deleted_at: null,
};

export const conversationRow = {
  id: 'c0e2f5aa-0000-4000-8000-000000000001',
  contact_id: CONTACT_ID,
  assigned_to: USER_ID,
  queue_id: null,
  status: 'open',
  last_message_at: '2026-09-29T18:00:00.000Z',
  unread_count: 0,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-29T18:00:00.000Z',
};

export const messageRow = {
  id: 'm0e2f5aa-0000-4000-8000-000000000001',
  conversation_id: conversationRow.id,
  contact_id: CONTACT_ID,
  content: 'mensagem de fixture W5',
  sender: 'contact',
  type: 'text',
  status: 'delivered',
  created_at: '2026-09-29T18:00:00.000Z',
  updated_at: '2026-09-29T18:00:00.000Z',
  whatsapp_connection_id: null,
  media_url: null,
  metadata: null,
};

export const profileRow = {
  id: USER_ID,
  user_id: USER_ID,
  name: 'W5 Mock',
  email: 'e2e-mock@example.invalid',
  avatar_url: null,
  role: 'supervisor',
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

export const MAPBOX_SUGGESTIONS = [
  { mapbox_id: 'w5-sug-1', name: 'Avenida Paulista', address: 'Avenida Paulista, Bela Vista, Sao Paulo - SP', kind: 'street' },
  { mapbox_id: 'w5-sug-2', name: 'Rua Paulista', address: 'Rua Paulista, Centro, Santos - SP', kind: 'street' },
  { mapbox_id: 'w5-sug-3', name: 'Praca Paulista', address: 'Praca Paulista, Bela Vista, Sao Paulo - SP', kind: 'place' },
];

export function suggestBody() {
  return {
    suggestions: MAPBOX_SUGGESTIONS.map((s) => ({
      mapbox_id: s.mapbox_id,
      name: s.name,
      full_address: s.address,
      place_formatted: s.address,
      feature_type: s.kind,
      distance: 420,
    })),
  };
}

export function retrieveBody(mapboxId) {
  const idx = MAPBOX_SUGGESTIONS.findIndex((s) => s.mapbox_id === mapboxId);
  const base = MAPBOX_SUGGESTIONS[idx] ?? MAPBOX_SUGGESTIONS[0];
  return {
    features: [
      {
        geometry: { coordinates: [-46.655881 - idx * 0.001, -23.561414 - idx * 0.001] },
        properties: {
          name: base.name,
          full_address: base.address,
          place_formatted: base.address,
          context: {
            postcode: { name: '01310-200' },
            street: { name: base.name },
            address: { address_number: '1578' },
            neighborhood: { name: 'Bela Vista' },
            place: { name: 'Sao Paulo' },
            region: { region_code: 'SP' },
          },
        },
      },
    ],
  };
}

export function forwardBody(term) {
  // 2 resultados: com 1 so, `searchLocation` aplica direto e a lista legada nunca renderiza;
  // 2+ faz a "terceira copia" (LocationPicker.tsx:218-233) aparecer — alvo do A4-C.
  return {
    features: [
      {
        geometry: { coordinates: [-46.655881, -23.561414] },
        properties: { name: `${term} — Sao Paulo`, full_address: `${term}, Bela Vista, Sao Paulo - SP` },
      },
      {
        geometry: { coordinates: [-46.300000, -23.960000] },
        properties: { name: `${term} — Santos`, full_address: `${term}, Centro, Santos - SP` },
      },
    ],
  };
}

/**
 * Instala todos os mocks no contexto.
 */
export async function installMocks(context, opts = {}) {
  const {
    flags = [
      { key: 'mapa.searchbox-autocomplete', enabled: true },
      { key: 'inbox.status-fsm', enabled: true },
    ],
    retrieveDelayMs = 900,
    suggestDelayMs = 150,
    suggestStatus = 200,
    retrieveStatus = 200,
    forwardStatus = 200,
    forwardDelayMs = 0,
  } = opts;

  const traffic = [];
  context.on('request', (r) => {
    if (/supabase\.co|api\.mapbox\.com/.test(r.url())) {
      traffic.push({ ts: Date.now(), method: r.method(), url: r.url(), post: r.postData() ?? null });
    }
  });

  await context.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    // Log HAR-like: request (evento 'request') + resposta (aqui), para provar o PAYLOAD real.
    const json = (body, status = 200, headers = {}) => {
      const s = JSON.stringify(body);
      traffic.push({ ts: Date.now(), kind: 'response', method: req.method(), url: req.url(), status, body: s });
      return route.fulfill({ status, contentType: 'application/json', headers, body: s });
    };

    if (p.startsWith('/auth/v1/token')) return json(fakeSession());
    if (p.startsWith('/auth/v1/user')) return json(fakeUser());
    if (p.startsWith('/auth/v1/settings')) return json({ external: {}, disable_signup: false, mailer_autoconfirm: false });
    if (p.startsWith('/auth/v1/')) return json({});

    if (p === '/functions/v1/get-mapbox-token') return json({ token: 'pk.w5-fake-mapbox-token' });
    if (p.startsWith('/functions/v1/')) return json({ ok: true });

    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.slice('/rest/v1/rpc/'.length);
      if (fn === 'count_searchbox_sessions_this_month') return json(0);
      if (fn === 'can_delete_contacts') {
        const ids = JSON.parse(req.postData() ?? '{}')?.p_ids ?? [];
        return json(ids.map((id) => ({ contact_id: id, can_delete: true })));
      }
      return json([]);
    }

    if (p.startsWith('/rest/v1/')) {
      const table = p.slice('/rest/v1/'.length);
      const accept = req.headers()['accept'] ?? '';
      const wantsObject = accept.includes('pgrst.object');
      const select = url.searchParams.get('select');

      if (table === 'feature_flags') {
        return json(flags.map((f) => ({ ...f, description: null, updated_at: '2026-09-29T00:00:00.000Z' })));
      }
      if (table === 'profiles') return json(wantsObject ? profileRow : [profileRow]);
      if (table === 'user_roles') return json([{ id: '33333333-3333-4333-8333-333333333333', user_id: USER_ID, role: 'supervisor' }]);
      if (table === 'contacts') {
        const row = projectRow(select, contactRowWithAddress);
        return json(wantsObject ? row : [row]);
      }
      if (table === 'conversations' || table === 'conversation_with_contact') {
        return json(wantsObject ? conversationRow : [conversationRow]);
      }
      if (table === 'messages') return json(wantsObject ? messageRow : [messageRow]);
      return json(wantsObject ? null : []);
    }

    return json({});
  });

  await context.route('wss://**', (route) => route.abort());

  await context.route('https://api.mapbox.com/**', async (route) => {
    const url = route.request().url();
    const json = (body, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

    if (url.includes('/searchbox/v1/suggest')) {
      await new Promise((r) => setTimeout(r, suggestDelayMs));
      const st = typeof suggestStatus === 'function' ? suggestStatus() : suggestStatus;
      if (st !== 200) return route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify({ message: 'w5 forced' }) });
      return json(suggestBody());
    }
    if (url.includes('/searchbox/v1/retrieve/')) {
      const id = decodeURIComponent(url.split('/searchbox/v1/retrieve/')[1].split('?')[0]);
      await new Promise((r) => setTimeout(r, retrieveDelayMs));
      if (retrieveStatus !== 200) return route.fulfill({ status: retrieveStatus, contentType: 'application/json', body: JSON.stringify({ message: 'w5 forced' }) });
      return json(retrieveBody(id));
    }
    if (url.includes('/searchbox/v1/forward')) {
      const term = new URL(url).searchParams.get('q') ?? '';
      const fdelay = typeof forwardDelayMs === 'function' ? forwardDelayMs() : forwardDelayMs;
      await new Promise((r) => setTimeout(r, fdelay));
      const fst = typeof forwardStatus === 'function' ? forwardStatus() : forwardStatus;
      if (fst !== 200) return route.fulfill({ status: fst, contentType: 'application/json', body: JSON.stringify({ message: 'w5 forced' }) });
      return json(forwardBody(term));
    }
    if (url.includes('/geocoding/v5/')) return json({ features: [] });
    return route.fulfill({ status: 204, body: '' });
  });

  return { traffic, dump: () => traffic };
}

export function writeTraffic(file, traffic) {
  fs.writeFileSync(file, JSON.stringify(traffic, null, 2));
}

/**
 * Projecao fiel ao PostgREST: com `select` explicito (sem `*`) a resposta traz EXATAMENTE as
 * colunas pedidas — e nada mais. Sem isso o mock devolveria a linha inteira e a prova do A4-D
 * (ausencia das colunas de endereco no payload do 2o editor) seria falsa.
 */
function projectRow(select, row) {
  if (!select || select.includes('*')) return row;
  const cols = select
    .split(',')
    .map((s) => s.trim().split('(')[0].trim())
    .filter(Boolean);
  const out = {};
  for (const c of cols) if (c in row) out[c] = row[c];
  return out;
}
