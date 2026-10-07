#!/usr/bin/env node
// Seed LOCAL da fixture da aba Arquivos (etapas 47/49 do
// PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_50_ETAPAS).
//
// POR QUE ESTE ARQUIVO EXISTE. As migrations
// `20261003182707_fixture_e2e_aba_arquivos_midia.sql` e
// `20261003192707_fixture_e2e_aba_arquivos_segunda_midia.sql` criam as LINHAS de
// public.messages, mas o OBJETO no bucket privado `whatsapp-media` nunca foi criado por
// SQL. O caminho antigo da fixture (`whatsapp-media/5b6f6f71-.../<arquivo>.png`) deixou de
// ser legível quando a ACL dos buckets privados passou a autorizar só pelo LOCATOR
// CANÔNICO (R2-DB-022 B1, migration 20261006175251_r2_db_022_storage_acl.sql): o 1º
// segmento do objeto precisa ser um `contact_id` visível ao usuário. Este seed reproduz a
// fixture no banco LOCAL com o caminho canônico e um usuário SINTÉTICO — nenhuma
// credencial real, nenhuma sessão salva, nenhum banco externo.
//
// Variáveis (todas obrigatórias, com nome dedicado para não herdar nada de produção):
//   E2E_LOCAL_SUPABASE_URL               ex.: http://127.0.0.1:31720
//   E2E_LOCAL_SUPABASE_ANON_KEY          publishable/anon do stack LOCAL
//   E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY  service role do stack LOCAL
// Saem de `zapp-db-local env <cópia> <nome>` (API_URL / PUBLISHABLE_KEY / SECRET_KEY).
//
// Uso:
//   node e2e/fixtures/seed-files-tab.mjs
//   node e2e/fixtures/seed-files-tab.mjs --com-legado   (recria também o objeto no path
//                                                        antigo, para medir o "antes")

const API = process.env.E2E_LOCAL_SUPABASE_URL?.trim();
const ANON = process.env.E2E_LOCAL_SUPABASE_ANON_KEY?.trim();
const SERVICE = process.env.E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY?.trim();

function abort(msg) {
  console.error(`[seed-files-tab] ${msg}`);
  process.exit(2);
}

if (!API || !ANON || !SERVICE) {
  abort(
    'faltam E2E_LOCAL_SUPABASE_URL / E2E_LOCAL_SUPABASE_ANON_KEY / ' +
      'E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY (valores de `zapp-db-local env <cópia> <nome>`).',
  );
}
let host;
try {
  host = new URL(API).hostname;
} catch {
  abort(`E2E_LOCAL_SUPABASE_URL inválida: ${API}`);
}
if (host !== '127.0.0.1' && host !== 'localhost') {
  abort(`só roda contra o stack LOCAL (127.0.0.1/localhost). Recebido: ${API}`);
}
if (/supabase\.co|pooler\./i.test(API)) abort('o alvo parece ser o Supabase hospedado; abortado.');

// Contato fixo dos specs logados (mesmo id de e2e/fixtures/e2e-contact.ts).
const CONTACT_ID = '04dff4dc-c6b1-4283-ac22-bd8639804759';
const CONTACT_NAME = '[E2E] Contato de teste - nao apagar';
// Usuário sintético LOCAL: criado aqui, nunca existe fora deste banco.
const EMAIL = 'e2e.files-tab.local@example.test';
const PASSWORD = 'e2e-files-tab-local-2026';
// Path ANTIGO (1º segmento não é contato) — só recriado com --com-legado, para medir.
const LEGACY_PREFIX = '5b6f6f71-916f-4537-9638-647485aba7db';
// PNG 1x1 SINTÉTICO (nenhum dado de cliente). 70 bytes, o mesmo `media_size` das migrations.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const FILE_1 = 'e2e-files-tab-1791054089114.png';
const FILE_2 = 'e2e-files-tab-2.png';

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const comLegado = process.argv.includes('--com-legado');

async function json(res) {
  const text = await res.text();
  try {
    return { status: res.status, ok: res.ok, data: JSON.parse(text) };
  } catch {
    return { status: res.status, ok: res.ok, data: text };
  }
}

// 1) usuário sintético (o trigger handle_new_user cria o profile)
let criado = await json(
  await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svc,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  }),
);
if (!criado.ok && !/already|exists|registered/i.test(JSON.stringify(criado.data))) {
  abort(`falha ao criar o usuário sintético: HTTP ${criado.status} ${JSON.stringify(criado.data)}`);
}
const lista = await json(
  await fetch(`${API}/auth/v1/admin/users?page=1&per_page=200`, { headers: svc }),
);
const user = (lista.data?.users ?? []).find((u) => u.email === EMAIL);
if (!user) abort('usuário sintético não encontrado depois da criação');
console.log(`[seed-files-tab] usuário sintético: ${EMAIL} (${user.id})`);

// 2) contato do fixture atribuído ao usuário (é o que is_contact_visible_to_user exige)
const prof = await json(await fetch(`${API}/rest/v1/profiles?user_id=eq.${user.id}&select=id`, { headers: svc }));
const profileId = prof.data?.[0]?.id;
if (!profileId) abort('profile do usuário sintético não encontrado');
const contato = await json(
  await fetch(`${API}/rest/v1/contacts?on_conflict=id`, {
    method: 'POST',
    headers: { ...svc, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([
      { id: CONTACT_ID, name: CONTACT_NAME, phone: '+5500000000000', assigned_to: profileId, nickname: '[E2E]' },
    ]),
  }),
);
if (!contato.ok) abort(`falha ao garantir o contato ${CONTACT_ID}: HTTP ${contato.status}`);
console.log(`[seed-files-tab] contato ${CONTACT_ID} atribuído ao profile ${profileId}`);

// 3) JWT REAL do usuário sintético: é a RLS dele que decide a leitura do objeto
const tok = await json(
  await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }),
);
if (!tok.data?.access_token) abort(`login do usuário sintético falhou: HTTP ${tok.status}`);
const auth = { apikey: ANON, Authorization: `Bearer ${tok.data.access_token}` };

// 4) upload do PNG no LOCATOR CANÔNICO (1º segmento = contact_id visível)
const canonicalPath = `${CONTACT_ID}/${FILE_1}`;
// Sem `x-upsert`: o bucket não tem policy de UPDATE para `whatsapp-media`, então recriar
// um objeto existente é negado pela RLS. Objeto já presente (HTTP 409) é sucesso idempotente.
const up = await json(
  await fetch(`${API}/storage/v1/object/whatsapp-media/${canonicalPath}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'image/png' },
    body: PNG,
  }),
);
if (!up.ok && !/duplicate|keyalreadyexists|already exists/i.test(JSON.stringify(up.data))) {
  abort(`upload no path canônico falhou: HTTP ${up.status} ${JSON.stringify(up.data)}`);
}
const jaExistia = !up.ok;
console.log(
  `[seed-files-tab] objeto canônico: whatsapp-media/${canonicalPath} (${PNG.length} bytes)${jaExistia ? ' — já existia' : ''}`,
);

if (comLegado) {
  const legacyPath = `${LEGACY_PREFIX}/${FILE_1}`;
  const legacy = await json(
    await fetch(`${API}/storage/v1/object/whatsapp-media/${legacyPath}`, {
      method: 'POST',
      headers: { ...svc, 'Content-Type': 'image/png', 'x-upsert': 'true' },
      body: PNG,
    }),
  );
  if (!legacy.ok) abort(`upload do objeto antigo falhou: HTTP ${legacy.status}`);
  console.log(`[seed-files-tab] objeto antigo (só para medir): whatsapp-media/${legacyPath}`);
}

// 5) linhas de public.messages — o LOCATOR é do stack LOCAL (origem, não URL de produção):
//    `parseSupabaseStorageObjectUrl` exige que a origem da URL seja a do cliente Supabase
//    em uso, então uma fixture local não pode reusar o host de produção.
const locator = (path) => `${API}/storage/v1/object/public/whatsapp-media/${path}`;
const rows = [
  {
    contact_id: CONTACT_ID,
    sender: 'contact',
    content: '[Imagem] fixture E2E da aba Arquivos (etapa 49; nao remover)',
    message_type: 'image',
    media_url: locator(canonicalPath),
    media_type: 'image',
    media_mimetype: 'image/png',
    media_filename: 'e2e-files-tab.png',
    media_size: PNG.length,
  },
  {
    contact_id: CONTACT_ID,
    sender: 'contact',
    content: '[Imagem] segunda midia da fixture E2E da aba Arquivos (etapa 47; nao remover)',
    message_type: 'image',
    media_url: locator(canonicalPath),
    media_type: 'image',
    media_mimetype: 'image/png',
    media_filename: 'e2e-files-tab-2.png',
    media_size: PNG.length,
  },
];
// upsert pelas duas linhas que a fixture promete (mesmo par contact_id + media_filename)
for (const row of rows) {
  const jaTem = await json(
    await fetch(
      `${API}/rest/v1/messages?contact_id=eq.${CONTACT_ID}&media_filename=eq.${row.media_filename}&select=id`,
      { headers: svc },
    ),
  );
  if (Array.isArray(jaTem.data) && jaTem.data.length > 0) {
    console.log(`[seed-files-tab] linha já existe: ${row.media_filename}`);
    continue;
  }
  const ins = await json(
    await fetch(`${API}/rest/v1/messages`, {
      method: 'POST',
      headers: { ...svc, Prefer: 'return=minimal' },
      body: JSON.stringify([row]),
    }),
  );
  if (!ins.ok) abort(`insert da linha ${row.media_filename} falhou: HTTP ${ins.status} ${JSON.stringify(ins.data)}`);
  console.log(`[seed-files-tab] linha criada: ${row.media_filename}`);
}

console.log(`[seed-files-tab] locator canônico: ${locator(canonicalPath)}`);
console.log(`[seed-files-tab] usuário: ${EMAIL} / senha: ${PASSWORD}`);
