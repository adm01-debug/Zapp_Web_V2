import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

// Execute the real E2E callbacks and seed. DOM, fetch, localStorage and media
// readiness are controlled; this does not replace Playwright/Storage/RLS in CI.
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const spec = read('e2e/media-volume.spec.ts');
const seed = read('e2e/fixtures/seed-files-tab.mjs');
const volumeSeed = read('e2e/fixtures/arquivos-local/seed.ts');
const ts = source => stripTypeScriptTypes(source).replace(/^import[\s\S]*?;\s*$/gm, '').replace(/^export /gm, '');
const store = vm.runInNewContext('(function () {\n' + ts(read('src/lib/authenticatedUserId.ts')) + '\n' +
  ts(read('src/lib/mediaVolumeStore.ts')) + '\nreturn { mediaVolumeStorageKeys }; })()', { URL, SUPABASE_URL: 'https://127.0.0.1:5173' });
const fixture = ts(read('e2e/fixtures/e2e-contact.ts'));
const CONTACT = fixture.match(/const E2E_FIXTURE_CONTACT_ID = '([^']+)'/)[1];
const filesFixture = vm.runInNewContext('(function () {\n' +
  ts(read('e2e/fixtures/arquivos-local/dados.ts')) + '\nreturn E2E_ARQUIVOS; })()');
const SPEC_CONTACT = filesFixture.contato.id;
const NAME = filesFixture.contato.nomeVisivel;
const SPEC_USER = filesFixture.usuario.id;
const ORIGIN = 'https://127.0.0.1:5173';
const SESSION_KEY = 'sb-127-auth-token';
const USER = 'synthetic-media-user';
const ANON = 'synthetic-anon';
const SERVICE = 'synthetic-service';
const JWT = 'synthetic-user-jwt';
const AUDIO = Buffer.from(seed.match(/const AUDIO = Buffer.from\('([^']+)', 'base64'\)/)[1], 'base64');
const AUDIO_FILE = 'e2e-media-volume.ogg';
const SIGNED_PATH = `/storage/v1/object/sign/whatsapp-media/${CONTACT}/${AUDIO_FILE}`;
const SPEC_SIGNED_PATH = `/storage/v1/object/sign/whatsapp-media/${SPEC_CONTACT}/${filesFixture.mensagens.audio.objeto}`;
const SPEC_SIGNED_URL = ORIGIN + SPEC_SIGNED_PATH + '?token=synthetic-signature';
const session = user => JSON.stringify({ access_token: JWT, user: { id: user } });
const snapshot = value => JSON.parse(JSON.stringify(value));

function browserHarness({ entries = { [SESSION_KEY]: session(SPEC_USER) }, blocked = false, labels = [NAME], buttons = 1, elements = [] } = {}) {
  const storage = new Map(Object.entries(entries));
  const observed = { actions: [], tests: [], polls: [], reads: [] };
  const localStorage = {
    getItem(key) { observed.reads.push(key); if (blocked) throw new Error('blocked'); return storage.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new Error('blocked'); storage.set(key, String(value)); },
  };
  const register = (title, callback) => observed.tests.push({ title, callback });
  register.describe = (_title, callback) => callback();
  register.beforeEach = callback => { observed.beforeEach = callback; };
  register.afterAll = callback => { observed.afterAll = callback; };
  register.use = options => { observed.use = snapshot(options); };
  register.setTimeout = timeout => { observed.timeout = timeout; };
  register.skip = condition => assert.equal(condition, false, 'no runtime skip for configured Chromium');
  register.fixme = () => assert.fail('the seeded audio must execute');
  const expect = locator => ({
    toHaveCount: async count => assert.equal(await locator.count(), count),
    toBeVisible: async options => { assert.equal(locator.visible, true); observed.actions.push('visible:' + options.timeout); },
  });
  expect.poll = (callback, options) => ({ toBeCloseTo: async (target, precision) => {
    observed.polls.push({ options: snapshot(options), target, precision });
    const value = await callback();
    assert.ok(Number.isFinite(value) && Math.abs(value - target) < 0.5 * 10 ** -precision);
  } });
  const context = vm.createContext({ URL, window: { localStorage }, test: register, expect,
    SUPABASE_URL: ORIGIN, SUPABASE_STORAGE_KEY: SESSION_KEY,
    E2E_ARQUIVOS: filesFixture,
    mediaVolumeStorageKeys: store.mediaVolumeStorageKeys,
    MEDIA_VOLUME_LABEL: 'Media', MEDIA_VOLUME_LABEL_MUTED: 'Muted', MEDIA_VOLUME_SLIDER_LABEL: 'Slider',
    SOUND_VOLUME_LABEL: 'Alerts', SOUND_VOLUME_LABEL_MUTED: 'Alerts muted',
    ensureFixtureConversationOpen: async () => {}, cleanupFixtureMessages: async () => {},
  });
  vm.runInContext(ts(spec) + '\nglobalThis.helpers = { chaveVolumeDoUsuario, abrirConversaDoFixture, volumeDoAudioCarregado };', context);
  let chosen;
  const page = {
    addInitScript: async () => { observed.actions.push('boot-deadline'); },
    goto: async path => { assert.equal(path, '/auth'); observed.actions.push('auth'); },
    evaluate: async (callback, argument) => callback(argument),
    reload: async () => { observed.actions.push('reload'); },
    getByRole: (role, options) => {
      assert.equal(role, 'button'); assert.match(String(options.name), /entrar/i);
      return { click: async () => observed.actions.push('login') };
    },
    getByText: (text, options) => { assert.equal(options.exact, true); return { text }; },
    getByLabel: label => {
      assert.equal(label, 'Buscar contato pelo nome');
      return { fill: async value => { assert.equal(value, NAME); observed.actions.push('search'); } };
    },
    getByTestId: id => {
      if (id === 'status-chip-all') return { click: async () => observed.actions.push('all') };
      assert.equal(id, 'conversation-item');
      return { filter: ({ has }) => {
        const matches = labels.map((label, index) => ({ label, index })).filter(row => row.label === has.text);
        return { count: async () => matches.length, getByRole: role => {
          assert.equal(role, 'button');
          return { filter: ({ has: name }) => {
            assert.equal(name.text, has.text);
            return { count: async () => matches.length * buttons,
              click: async () => { assert.equal(matches.length * buttons, 1); chosen = matches[0].index; observed.actions.push('conversation'); } };
          } };
        } };
      } };
    },
    locator: selector => {
      if (selector === '#login-email' || selector === '#login-password') {
        return { fill: async value => {
          assert.equal(value, selector === '#login-email' ? filesFixture.usuario.email : filesFixture.usuario.senha);
          observed.actions.push(selector === '#login-email' ? 'email' : 'password');
        } };
      }
      if (selector === '#main-navigation') return { visible: true };
      assert.equal(selector, `audio[src*="${SPEC_SIGNED_PATH}"]`);
      const matches = elements.filter(element => (element.src ?? element.currentSrc).includes(SPEC_SIGNED_PATH));
      return { count: async () => matches.length,
        evaluate: async (callback, argument) => { assert.equal(matches.length, 1); return callback(matches[0], argument); } };
    },
  };
  return { ...context.helpers, page, observed, storage, selected: () => chosen };
}

const ready = changes => ({ currentSrc: SPEC_SIGNED_URL, isConnected: true, readyState: 1, duration: 0.3565, error: null, volume: 0.16, ...changes });

for (const [name, entries, accepted] of [
  ['configured identity', { [SESSION_KEY]: session(SPEC_USER) }, true],
  ['other project cannot win', { 'sb-other-auth-token': session('other'), [SESSION_KEY]: session(SPEC_USER) }, true],
  ['only other project', { 'sb-other-auth-token': session('other') }, false],
  ['missing session', {}, false], ['invalid JSON', { [SESSION_KEY]: '{' }, false],
  ['missing user', { [SESSION_KEY]: JSON.stringify({ access_token: JWT }) }, false],
  ['empty token', { [SESSION_KEY]: JSON.stringify({ access_token: '', user: { id: USER } }) }, false],
]) test('media fixture identity: ' + name, async () => {
  const h = browserHarness({ entries });
  if (accepted) assert.equal(await h.chaveVolumeDoUsuario(h.page), 'zapp.media.volume.' + SPEC_USER);
  else await assert.rejects(h.chaveVolumeDoUsuario(h.page), /Sessão do projeto configurado ausente/);
  assert.deepEqual(h.observed.reads, [SESSION_KEY]);
});
test('media fixture fails closed when session storage is blocked', async () => {
  const h = browserHarness({ blocked: true });
  await assert.rejects(h.chaveVolumeDoUsuario(h.page), /Sessão do projeto configurado ausente/);
});

test('media fixture logs in through the Files owner before opening its conversation', async () => {
  const h = browserHarness();
  await h.observed.beforeEach({ page: h.page });
  assert.deepEqual(h.observed.use, { storageState: { cookies: [], origins: [] } });
  assert.equal(h.observed.timeout, 120_000);
  assert.deepEqual(h.observed.actions, [
    'boot-deadline', 'auth', 'email', 'password', 'login', 'visible:60000',
    'all', 'search', 'conversation',
  ]);
});

for (const [name, labels, buttons, accepted] of [
  ['first', [NAME, 'Other'], 1, true], ['last', ['Other', NAME], 1, true],
  ['absent', ['Other'], 1, false], ['duplicate', [NAME, NAME], 1, false],
  ['prefix is not exact', [NAME + ' other'], 1, false], ['ambiguous button', [NAME], 2, false],
]) test('media fixture conversation: ' + name, async () => {
  const h = browserHarness({ labels, buttons });
  if (accepted) { await h.abrirConversaDoFixture(h.page); assert.equal(h.selected(), labels.indexOf(NAME)); }
  else { await assert.rejects(h.abrirConversaDoFixture(h.page)); assert.equal(h.selected(), undefined); }
  assert.deepEqual(h.observed.actions.slice(0, 2), ['all', 'search']);
});

for (const [name, elements, expected] of [
  ['metadata', [ready()], 0.16], ['future data', [ready({ readyState: 4 })], 0.16],
  ['no element', [], NaN], ['duplicate', [ready(), ready()], NaN],
  // O seed já valida assinatura, download e bytes do Ogg. Este helper prova somente
  // que o elemento conectado recebeu a URL canônica e o ganho global, mesmo antes
  // de o navegador concluir os metadados ou decidir a reprodução.
  ['not loaded yet', [ready({ readyState: 0 })], 0.16], ['detached', [ready({ isConnected: false })], NaN],
  ['media error does not erase gain', [ready({ error: { code: 4 } })], 0.16],
  ['zero duration does not erase gain', [ready({ duration: 0 })], 0.16],
  ['NaN duration does not erase gain', [ready({ duration: NaN })], 0.16],
  ['infinite duration does not erase gain', [ready({ duration: Infinity })], 0.16],
  ['foreign origin', [ready({ currentSrc: 'https://foreign.invalid' + SPEC_SIGNED_PATH })], NaN],
  ['wrong path', [ready({ currentSrc: ORIGIN + '/wrong.ogg' })], NaN],
  ['blob currentSrc despite expected attribute', [ready({ src: SPEC_SIGNED_URL, currentSrc: 'blob:' + ORIGIN + '/synthetic' })], NaN],
  ['linear gain stays a failing value', [ready({ volume: 0.4 })], 0.4],
]) test('media fixture readiness: ' + name, async () => {
  const h = browserHarness({ elements });
  assert.equal(await h.volumeDoAudioCarregado(h.page), expected);
});

test('real audio test keeps the gain assertion and ten-second poll', async () => {
  const h = browserHarness({ elements: [ready()] });
  assert.equal(h.observed.tests.length, 3);
  const audio = h.observed.tests.find(row => row.title === 'se a conversa do fixture tiver áudio, o elemento nasce no volume escolhido');
  await audio.callback({ page: h.page, browserName: 'chromium' });
  assert.equal(h.storage.get('zapp.media.volume.' + SPEC_USER), '40');
  assert.equal(h.storage.has('zapp.media.volume'), false);
  assert.deepEqual(h.observed.actions, ['reload', 'all', 'search', 'conversation']);
  assert.deepEqual(h.observed.polls, [{ options: { timeout: 10_000 }, target: 0.16, precision: 2 }]);
  const bad = browserHarness({ elements: [ready({ volume: 0.4 })] });
  await assert.rejects(bad.observed.tests[2].callback({ page: bad.page, browserName: 'chromium' }));
});

test('both seeds contain the validated Ogg/Opus bytes with intact page CRCs', () => {
  const other = Buffer.from(volumeSeed.match(/const OGG_MINIMO = Buffer.from\('([^']+)', 'base64'\)/)[1], 'base64');
  assert.deepEqual(AUDIO, other);
  assert.equal(AUDIO.length, 1250);
  assert.equal(createHash('sha256').update(AUDIO).digest('hex'), '285b8fe264b12fa014a45e57f5a1620eebcb75b7226fbbc7cc42de3ae02750d1');
  let offset = 0, pages = 0, lastFlags = 0;
  while (offset < AUDIO.length) {
    assert.equal(AUDIO.toString('ascii', offset, offset + 4), 'OggS');
    const segments = AUDIO[offset + 26];
    const bodyLength = [...AUDIO.subarray(offset + 27, offset + 27 + segments)].reduce((sum, size) => sum + size, 0);
    const page = Buffer.from(AUDIO.subarray(offset, offset + 27 + segments + bodyLength));
    assert.equal(page.length, 27 + segments + bodyLength);
    const expectedCrc = page.readUInt32LE(22); page.writeUInt32LE(0, 22);
    let crc = 0;
    for (const byte of page) {
      crc = (crc ^ (byte << 24)) >>> 0;
      for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x80000000 ? 0x04c11db7 : 0)) >>> 0;
    }
    assert.equal(crc, expectedCrc); lastFlags = page[5]; offset += page.length; pages++;
  }
  assert.equal(pages, 3); assert.equal(lastFlags & 4, 4);
  assert.ok(AUDIO.includes(Buffer.from('OpusHead'))); assert.ok(AUDIO.includes(Buffer.from('OpusTags')));
});

async function runCanonicalSeed(options = {}) {
  const rows = options.rows ?? [];
  const observed = { rows, writes: [], calls: [], logs: [], failure: null };
  const audioRow = () => rows.find(row => row.media_filename === AUDIO_FILE);
  const response = (status, data = {}, headers = {}) => new Response(
    status === 204 ? null : Buffer.isBuffer(data) ? data : JSON.stringify(data), { status, headers });
  const fetch = async (address, init = {}) => {
    const url = new URL(address); const method = init.method ?? 'GET';
    assert.equal(url.origin, ORIGIN);
    const headers = new Headers(init.headers);
    const path = url.pathname; observed.calls.push(method + ' ' + path);
    if (path === '/auth/v1/admin/users') return response(200, method === 'POST' ? { id: USER } : { users: [{ id: USER, email: 'e2e.files-tab.local@example.test' }] });
    if (path === '/rest/v1/profiles') return response(200, [{ id: 'synthetic-profile' }]);
    if (path === '/rest/v1/contacts') return response(201, []);
    if (path === '/auth/v1/token') return response(200, { access_token: JWT });
    if (path === '/storage/v1/object/whatsapp-media/' + CONTACT + '/e2e-files-tab-1791054089114.png') {
      assert.equal(headers.get('authorization'), 'Bearer ' + JWT);
      assert.equal(init.body.length, 70); return response(200);
    }
    if (path === '/storage/v1/object/whatsapp-media/' + CONTACT + '/' + AUDIO_FILE) {
      assert.equal(method, 'POST'); assert.equal(headers.get('authorization'), 'Bearer ' + JWT);
      assert.equal(headers.get('content-type'), 'audio/ogg'); assert.deepEqual(init.body, AUDIO);
      assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal);
      return response(options.uploadStatus ?? 200);
    }
    if (path === SIGNED_PATH && method === 'POST') {
      assert.equal(headers.get('authorization'), 'Bearer ' + JWT);
      assert.deepEqual(JSON.parse(init.body), { expiresIn: 60 });
      return response(options.signStatus ?? 200, options.signBody ?? { signedURL: SIGNED_PATH.slice('/storage/v1'.length) + '?token=synthetic-signature' });
    }
    if (path === SIGNED_PATH && method === 'GET') {
      assert.equal(headers.get('authorization'), null); assert.equal(url.searchParams.get('token'), 'synthetic-signature');
      assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal);
      return response(options.downloadStatus ?? 200, options.bytes ?? AUDIO, { 'content-type': options.mime ?? 'audio/ogg' });
    }
    assert.equal(path, '/rest/v1/messages', 'unexpected HTTP path');
    if (method === 'POST') {
      assert.equal(headers.get('authorization'), 'Bearer ' + SERVICE);
      const additions = JSON.parse(init.body);
      if (additions[0].media_filename === AUDIO_FILE && options.insertStatus) return response(options.insertStatus);
      rows.push(...additions); observed.writes.push(...additions); return response(201);
    }
    const filename = url.searchParams.get('media_filename')?.slice(3);
    assert.equal(url.searchParams.get('contact_id'), 'eq.' + CONTACT);
    if (method === 'PATCH') {
      assert.notEqual(filename, AUDIO_FILE, 'audio conflicts must be checked, not overwritten');
      const patch = JSON.parse(init.body); rows.filter(row => row.media_filename === filename).forEach(row => Object.assign(row, patch));
      return response(204);
    }
    assert.equal(method, 'GET');
    let selected = rows.filter(row => row.contact_id === CONTACT && row.media_filename === filename);
    if (filename === AUDIO_FILE) {
      assert.equal(url.searchParams.get('select'), 'id,contact_id,sender,content,message_type,media_url,media_type,media_mimetype,media_filename,media_size,ptt,is_deleted');
      if (headers.get('authorization') === 'Bearer ' + JWT) {
        if (options.visible === 'none') selected = [];
        if (options.visible === 'duplicate') selected = [audioRow(), audioRow()];
        if (options.visible === 'wrong') selected = [{ ...audioRow(), media_size: 7 }];
        return response(options.rlsStatus ?? 200, selected);
      }
      assert.equal(headers.get('authorization'), 'Bearer ' + SERVICE);
      if (options.existing === 'duplicate') selected = [audioRow(), audioRow()];
      if (options.existing === 'wrong') selected = [{ ...audioRow(), media_size: 7 }];
      return response(options.readStatus ?? 200, selected);
    }
    return response(200, selected);
  };
  const context = vm.createContext({ Buffer, URL, AbortSignal, createHash, fetch,
    process: { env: { E2E_LOCAL_SUPABASE_URL: ORIGIN, E2E_LOCAL_SUPABASE_ANON_KEY: ANON, E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY: SERVICE }, argv: [], exit: code => { throw new Error('seed-exit-' + code); } },
    console: { log: text => observed.logs.push(text), error: text => observed.logs.push(text) },
  });
  try { await vm.runInContext('(async () => {\n' + seed.replace(/^#![^\n]*\n/, '').replace(/^import .*;\n/gm, '') + '\n})()', context); }
  catch (error) { observed.failure = error; }
  return observed;
}

test('canonical seed validates user upload/sign/download/RLS and preserves both PNGs on repetition', async () => {
  const first = await runCanonicalSeed(); assert.equal(first.failure, null);
  assert.deepEqual(first.rows.map(row => row.media_filename), ['e2e-files-tab.png', 'e2e-files-tab-2.png', AUDIO_FILE]);
  const pngRows = snapshot(first.rows.slice(0, 2));
  assert.equal(first.rows[2].message_type, 'audio'); assert.equal(first.rows[2].ptt, false);
  assert.equal(first.rows[2].media_size, 1250);
  const repeat = await runCanonicalSeed({ rows: first.rows, uploadStatus: 409 });
  assert.equal(repeat.failure, null); assert.equal(repeat.rows.length, 3);
  assert.deepEqual(snapshot(repeat.rows.slice(0, 2)), pngRows);
  assert.equal(repeat.writes.length, 0);
  assert.ok(repeat.logs.some(line => line.includes('áudio canônico e RLS verificados')));
});

for (const [name, options, message] of [
  ['upload denied', { uploadStatus: 403 }, 'upload do áudio falhou'],
  ['upload server error', { uploadStatus: 500 }, 'upload do áudio falhou'],
  ['sign denied', { signStatus: 403 }, 'assinatura do áudio falhou'],
  ['sign missing', { signBody: {} }, 'assinatura do áudio ausente'],
  ['sign foreign', { signBody: { signedURL: 'https://foreign.invalid/secret?token=canary' } }, 'assinatura do áudio fora'],
  ['sign wrong object', { signBody: { signedURL: '/object/sign/whatsapp-media/wrong?token=canary' } }, 'assinatura do áudio fora'],
  ['sign token missing', { signBody: { signedURL: SIGNED_PATH.slice('/storage/v1'.length) } }, 'assinatura do áudio fora'],
  ['download denied', { downloadStatus: 403 }, 'leitura do áudio falhou'],
  ['wrong MIME', { mime: 'text/html' }, 'leitura do áudio falhou'],
  ['409 with corrupted bytes', { uploadStatus: 409, bytes: Buffer.alloc(1250) }, 'conteúdo do áudio'],
  ['truncated media', { bytes: AUDIO.subarray(0, 20) }, 'conteúdo do áudio'],
  ['row query denied', { readStatus: 403 }, 'linha canônica de áudio'],
  ['row duplicated', { existing: 'duplicate' }, 'linha canônica de áudio'],
  ['row divergent', { existing: 'wrong' }, 'linha canônica de áudio'],
  ['insert conflict', { insertStatus: 409 }, 'insert do áudio falhou'],
  ['RLS denied', { rlsStatus: 403 }, 'áudio canônico não está único'],
  ['RLS empty', { visible: 'none' }, 'áudio canônico não está único'],
  ['RLS duplicated', { visible: 'duplicate' }, 'áudio canônico não está único'],
  ['RLS different row', { visible: 'wrong' }, 'áudio canônico não está único'],
]) test('canonical audio rejects: ' + name, async () => {
  const result = await runCanonicalSeed(options);
  assert.match(result.failure?.message ?? '', /seed-exit-2/);
  assert.ok(result.logs.some(line => line.includes(message)));
  assert.equal(result.logs.some(line => line.includes('áudio canônico e RLS verificados')), false);
  assert.equal(result.logs.some(line => line.includes('canary') || line.includes('token=')), false);
});
