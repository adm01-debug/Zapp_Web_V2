import { readFileSync, readlinkSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { validateIsolatedAuthEvidence } from './admission.mjs';

const ORIGIN = 'https://127.0.0.1:5173';
const PROOF_PATH = '/run/zapp-e2e/proof.json';
const CONTACT_ID = '04dff4dc-c6b1-4283-ac22-bd8639804759';
const CONTACT_NAME = '[E2E] Contato de teste - nao apagar';
const CONTENT = '[E2E fixture setup]';
const FIELDS = 'id,contact_id,sender,content,message_type';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BYTES = 8192;
const MAX_READS = 64;

const fail = code => { throw new Error('[e2e-fixture/' + code + ']'); };

// A segunda entrada é somente a seam interna dos testes Node. Ela não integra
// a declaração pública .d.mts nem é recebida das fixtures do Playwright.
function dependencies(overrides) {
  return { env: process.env, readFile: readFileSync, readlink: readlinkSync,
    interfaces: networkInterfaces, now: Date.now, fetcher: globalThis.fetch, ...overrides };
}

function localInput(input) {
  if (!input || typeof input.baseURL !== 'string' || typeof input.anonKey !== 'string') {
    fail('local-configuration');
  }
  return { baseURL: input.baseURL, anonKey: input.anonKey };
}

function currentEvidence(input, deps) {
  if (deps.env.ZAPP_E2E_LOCAL !== '1' || input.baseURL !== ORIGIN ||
      deps.env.API_URL !== ORIGIN ||
      input.anonKey !== deps.env.E2E_SUPABASE_PUBLISHABLE_KEY_OVERRIDE?.trim()) {
    fail('local-configuration');
  }
  let proof, networkNamespace;
  try {
    const raw = deps.readFile(PROOF_PATH, 'utf8');
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_BYTES) throw new Error();
    proof = JSON.parse(raw);
    networkNamespace = deps.readlink('/proc/self/ns/net');
  } catch {
    fail('proof-unreadable');
  }
  return validateIsolatedAuthEvidence({ baseURL: input.baseURL, env: deps.env, proof,
    networkNamespace, interfaces: deps.interfaces(), now: deps.now() });
}

function sameIdentity(expected, actual) {
  if (['origin', 'run_id', 'source_sha', 'anon_key_sha256'].some(key => expected[key] !== actual[key])) {
    fail('identity-changed');
  }
}

function revalidate(input, deps, target) {
  const current = currentEvidence(input, deps);
  sameIdentity(target, current);
  return current;
}

// Erros e corpos remotos nunca entram na mensagem de erro; um gateway pode
// devolver credenciais ou conteúdo arbitrário até em uma resposta 2xx.
async function requestJson(deps, suffix, init, expectedStatus, code) {
  let response;
  try {
    response = await deps.fetcher(ORIGIN + suffix, {
      ...init, redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail(code + '-request');
  }
  if (response?.status !== expectedStatus || response.redirected) {
    try { void response?.body?.cancel().catch(() => {}); } catch { /* best effort */ }
    fail(code + '-http');
  }
  let reader;
  try {
    reader = response.body.getReader();
    let size = 0;
    const chunks = [];
    for (let reads = 0; reads < MAX_READS; reads += 1) {
      const { done, value } = await reader.read();
      if (done) {
        const raw = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size));
        return JSON.parse(raw);
      }
      if (!(value instanceof Uint8Array) || value.byteLength === 0) throw new Error();
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error();
      chunks.push(value);
    }
    throw new Error();
  } catch {
    fail(code + '-json');
  } finally {
    // Não esperar cancel(): o limite de leitura também deve encerrar streams
    // malformados cujo cancelamento não conclui.
    try { void reader?.cancel().catch(() => {}); } catch { /* best effort */ }
  }
}

async function admit(input, deps) {
  const target = currentEvidence(input, deps);
  const identity = await requestJson(deps, '/__e2e/identity',
    { method: 'GET', cache: 'no-store' }, 200, 'identity');
  const current = revalidate(input, deps, target);
  if (identity?.schema !== 1 || identity.run_id !== current.run_id ||
      identity.source_sha !== current.source_sha || identity.origin !== current.origin) {
    fail('gateway-identity');
  }
  return current;
}

function claims(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    return {
      header: JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')),
      body: JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')),
    };
  } catch {
    fail('credential-shape');
  }
}

function userCredential(token, now) {
  const { header, body } = claims(token);
  if (typeof header?.alg !== 'string' || !header.alg || header.alg === 'none' ||
      body?.role !== 'authenticated' || !Number.isFinite(body.exp) || body.exp * 1000 <= now) {
    fail('user-credential');
  }
}

function fixtureRow(rows, code) {
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (!row || typeof row.id !== 'string' || !UUID.test(row.id) || row.contact_id !== CONTACT_ID ||
      row.sender !== 'contact' || row.content !== CONTENT || row.message_type !== 'text') {
    fail(code + '-row');
  }
  return row;
}

/** Admissão Node sem navegação, acesso à service key ou retorno de credenciais. */
export async function assertIsolatedFixtureEnvironment(input, testDependencies) {
  await admit(localInput(input), dependencies(testDependencies));
}

/** Prepara somente a mensagem fixa no backend descartável; o browser não recebe a chave. */
export async function insertIsolatedFixtureMessage(input, testDependencies) {
  const local = localInput(input);
  const accessToken = input.accessToken;
  const deps = dependencies(testDependencies);
  const target = await admit(local, deps);
  userCredential(accessToken, deps.now());
  const userHeaders = { apikey: local.anonKey, Authorization: 'Bearer ' + accessToken };
  const contacts = await requestJson(deps,
    '/rest/v1/contacts?id=eq.' + CONTACT_ID + '&select=id,name',
    { method: 'GET', headers: userHeaders, cache: 'no-store' }, 200, 'contact');
  if (!Array.isArray(contacts) || contacts.length !== 1 ||
      contacts[0]?.id !== CONTACT_ID || contacts[0]?.name !== CONTACT_NAME) {
    fail('contact-rls');
  }

  // O GET acima cedeu execução: provar novamente o MESMO run/SHA/hash antes
  // de sequer ler a credencial privilegiada, inclusive se a prova foi trocada.
  revalidate(local, deps, target);
  userCredential(accessToken, deps.now());
  const serviceKey = deps.env.SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey !== deps.env.E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY) {
    fail('service-configuration');
  }
  const service = claims(serviceKey);
  if (service.header?.alg !== 'HS256' || service.body?.role !== 'service_role' ||
      service.body.iss !== 'supabase' || !Number.isFinite(service.body.exp) ||
      service.body.exp * 1000 <= deps.now()) {
    fail('service-credential');
  }

  const inserted = fixtureRow(await requestJson(deps,
    '/rest/v1/messages?select=' + FIELDS, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey,
        'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ contact_id: CONTACT_ID, sender: 'contact',
        content: CONTENT, message_type: 'text' }),
    }, 201, 'insert'), 'insert');
  revalidate(local, deps, target);
  userCredential(accessToken, deps.now());
  const visible = fixtureRow(await requestJson(deps,
    '/rest/v1/messages?id=eq.' + inserted.id + '&select=' + FIELDS,
    { method: 'GET', headers: userHeaders, cache: 'no-store' }, 200, 'readback'), 'readback');
  if (visible.id !== inserted.id) fail('readback-id');
  revalidate(local, deps, target);
  userCredential(accessToken, deps.now());
}
