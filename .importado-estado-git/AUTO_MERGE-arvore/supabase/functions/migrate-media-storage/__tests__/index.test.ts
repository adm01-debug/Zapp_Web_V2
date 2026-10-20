// R2-API-0XX (P0) — provas do handler real de migrate-media-storage.
//
// Estes testes são OFFLINE: o client do chamador, o client service-role, o
// fetcher de mídia e o rate limiter são INJETADOS. Nada toca banco, Storage,
// CDN nem env. O que se prova é o CONTRATO do handler:
//
//   (1) host fora da política (`https://evil.example/?x=mmg.whatsapp.net`) é
//       recusado SEM nenhuma requisição (fetcher nunca chamado, nada no Storage);
//   (2) arquivo declarado acima do teto de 25 MB aborta: baixou? foi chamado,
//       mas NÃO vira upload nem update;
//   (3) supervisor (is_admin = false) → 403, sem download e sem consulta;
//   (4) segunda execução simultânea do mesmo admin → 429 (trava atômica);
//   (5) execução bem-sucedida grava `audit_logs` (ator + contagens, sem URL);
//   (6) subdomínio `*.mmg.whatsapp.net` passa e host parecido
//       (`mmg.whatsapp.net.evil.com`) é recusado.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/migrate-media-storage/__tests__/index.test.ts

import {
  handleMigrateMediaStorage,
  MIGRATION_EGRESS_POLICY,
  MIGRATION_MEDIA_HOSTS,
  MIGRATION_MEDIA_MAX_BYTES,
  type MigrateCallerClient,
  type MigrateMediaDeps,
  type MigrateRateLimiter,
} from "../index.ts";
import { resolveMediaEgressUrl } from "../../_shared/media-egress.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const ADMIN_ID = "10000000-0000-0000-0000-00000000000a";

Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
Deno.env.set("SUPABASE_ANON_KEY", "anon-test-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.delete("EVOLUTION_API_URL");
Deno.env.delete("EVOLUTION_API_KEY");

function callerOk(isAdmin: unknown = true): MigrateCallerClient {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: ADMIN_ID } }, error: null }) },
    rpc: () => Promise.resolve({ data: isAdmin, error: null }),
  };
}

/** Limiter atômico: espelha `consume_rate_limit` (1 por janela por chave). */
function atomicLimiter(): MigrateRateLimiter {
  const state = new Map<string, { hits: number; start: number }>();
  const now = 0;
  return (key, max, windowMs) => {
    const cur = state.get(key);
    if (!cur || now - cur.start >= windowMs) {
      state.set(key, { hits: 1, start: now });
      return Promise.resolve({ allowed: 1 <= max, remaining: Math.max(max - 1, 0), persistent: true });
    }
    cur.hits++;
    return Promise.resolve({ allowed: cur.hits <= max, remaining: Math.max(max - cur.hits, 0), persistent: true });
  };
}

const allowAll: MigrateRateLimiter = () =>
  Promise.resolve({ allowed: true, remaining: 0, persistent: true });

const bytes = (n: number) => new Uint8Array(n).fill(7);

interface Harness {
  deps: MigrateMediaDeps;
  auditInserts: Record<string, unknown>[];
  updates: Record<string, unknown>[];
  uploads: string[];
  fetchCalls: string[];
}

function harness(messages: Record<string, unknown>[], fetchImpl?: (url: string) => Promise<Response>): Harness {
  const auditInserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const uploads: string[] = [];
  const fetchCalls: string[] = [];

  const supabase = {
    from(table: string) {
      if (table === "whatsapp_connections") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {};
        for (const m of ["select", "eq", "limit"]) b[m] = () => b;
        b.then = (res: (v: unknown) => void) => res({ data: [], error: null });
        return b;
      }
      if (table === "messages") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {};
        for (const m of ["select", "not", "or", "order", "limit"]) b[m] = () => b;
        b.then = (res: (v: unknown) => void) => res({ data: messages, error: null });
        b.update = (payload: Record<string, unknown>) => {
          updates.push(payload);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const c: any = {};
          c.eq = () => c;
          c.then = (res: (v: unknown) => void) => res({ data: null, error: null });
          return c;
        };
        return b;
      }
      if (table === "audit_logs") {
        return {
          insert: (payload: Record<string, unknown>) => {
            auditInserts.push(payload);
            return Promise.resolve({ data: null, error: null });
          },
        };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
    storage: {
      from: (bucket: string) => ({
        upload: (name: string) => {
          uploads.push(`${bucket}/${name}`);
          return Promise.resolve({ data: { path: name }, error: null });
        },
        getPublicUrl: (name: string) => ({
          data: { publicUrl: `https://storage.local/${bucket}/${name}` },
        }),
      }),
    },
  };

  const fetcher = (url: string) => {
    fetchCalls.push(url);
    if (fetchImpl) return fetchImpl(url);
    return Promise.resolve(new Response(bytes(200), { headers: { "content-type": "image/jpeg" } }));
  };

  return {
    deps: { supabase, caller: callerOk(true), fetcher, rateLimiter: allowAll },
    auditInserts,
    updates,
    uploads,
    fetchCalls,
  };
}

function req(): Request {
  return new Request("http://localhost/migrate-media-storage", {
    method: "POST",
    headers: { Authorization: "Bearer test-jwt" },
  });
}

const cardMessage = (mediaUrl: string) => ({
  id: "30000000-0000-0000-0000-00000000000c",
  media_url: mediaUrl,
  message_type: "image",
  external_id: null,
  contact_id: null,
  whatsapp_connection_id: null,
});

Deno.test("(1) host fora da política é recusado sem NENHUMA requisição", async () => {
  const h = harness([cardMessage("https://evil.example/?x=mmg.whatsapp.net")]);
  const res = await handleMigrateMediaStorage(req(), h.deps);
  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const body = await res.json();
  assert(body.ignored === 1, `ignored deveria ser 1, veio ${body.ignored}`);
  assert(body.migrated === 0 && body.failed === 0, "nada deveria ser migrado nem falhar");
  assert(h.fetchCalls.length === 0, "o fetcher NÃO pode ser chamado para host recusado");
  assert(h.uploads.length === 0, "nada deveria ir para o Storage");
  assert(h.updates.length === 0, "nenhum update de messages");
});

Deno.test("(2) arquivo acima do teto de 25 MB aborta (sem upload nem update)", async () => {
  const oversize = {
    status: 200,
    ok: true,
    headers: {
      get: (k: string) => (k.toLowerCase() === "content-length" ? String(MIGRATION_MEDIA_MAX_BYTES + 1) : "image/jpeg"),
    },
    body: { cancel: () => Promise.resolve() },
  } as unknown as Response;

  const h = harness(
    [cardMessage("https://mmg.whatsapp.net/v/t62.7118-24/oversize.jpg")],
    () => Promise.resolve(oversize),
  );
  const res = await handleMigrateMediaStorage(req(), h.deps);
  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  const body = await res.json();
  assert(h.fetchCalls.length === 1, "o download deveria ter sido tentado uma vez");
  assert(h.uploads.length === 0, "arquivo acima do teto NÃO pode ir para o Storage");
  assert(h.updates.length === 0, "nenhum update de messages");
  assert(body.migrated === 0 && body.failed === 1, `esperava migrated=0 failed=1, veio ${JSON.stringify(body)}`);
  assert(body.ignored === 0, "não é caso de host ignorado");
});

Deno.test("(3) supervisor recebe 403 sem download e sem consulta", async () => {
  const h = harness([cardMessage("https://mmg.whatsapp.net/v/qualquer.jpg")]);
  h.deps.caller = callerOk(false);
  const res = await handleMigrateMediaStorage(req(), h.deps);
  assert(res.status === 403, `esperava 403, veio ${res.status}`);
  assert(h.fetchCalls.length === 0, "não pode baixar mídia para supervisor");
  assert(h.uploads.length === 0, "não pode subir nada para supervisor");
  assert(h.auditInserts.length === 0, "sem execução autorizada não há auditoria de execução");
});

Deno.test("(4) segunda execução simultânea do mesmo admin é recusada (429)", async () => {
  const limiter = atomicLimiter();
  const h = harness([cardMessage("https://mmg.whatsapp.net/v/ok.jpg")]);
  h.deps.rateLimiter = limiter;

  const first = await handleMigrateMediaStorage(req(), h.deps);
  assert(first.status === 200, `1ª execução deveria ser 200, veio ${first.status}`);

  const second = await handleMigrateMediaStorage(req(), h.deps);
  assert(second.status === 429, `2ª execução simultânea deveria ser 429, veio ${second.status}`);
});

Deno.test("(5) execução grava audit_logs com ator e contagens, sem URL", async () => {
  const h = harness([cardMessage("https://mmg.whatsapp.net/v/t62/expirada.jpg")]);
  const res = await handleMigrateMediaStorage(req(), h.deps);
  assert(res.status === 200, `esperava 200, veio ${res.status}`);
  await res.json();

  assert(h.auditInserts.length === 1, `esperava 1 auditoria, veio ${h.auditInserts.length}`);
  const audit = h.auditInserts[0];
  assert(audit.action === "media_migration", `ação inesperada: ${audit.action}`);
  assert(audit.user_id === ADMIN_ID, "auditoria sem o ator");
  const details = audit.details as Record<string, number>;
  assert(details.processed === 1, `processed deveria ser 1, veio ${details.processed}`);
  assert(typeof details.migrated === "number" && typeof details.failed === "number" && typeof details.ignored === "number",
    "auditoria precisa das contagens migrado/falha/ignorado");
  const serialized = JSON.stringify(audit);
  assert(!serialized.includes("mmg.whatsapp.net") && !serialized.includes("https://"),
    "a auditoria não pode carregar URL completa");
});

Deno.test("(6) política: aceita subdomínio do CDN e recusa host parecido", () => {
  assert(resolveMediaEgressUrl("https://mmg.whatsapp.net/v/a.jpg", MIGRATION_EGRESS_POLICY) !== null,
    "cd do WhatsApp deveria passar");
  assert(resolveMediaEgressUrl("https://cid.mmg.whatsapp.net/v/a.jpg", MIGRATION_EGRESS_POLICY) !== null,
    "subdomínio com ponto deveria passar");
  assert(resolveMediaEgressUrl("https://pps.whatsapp.net/v/a.jpg", MIGRATION_EGRESS_POLICY) !== null,
    "pps.whatsapp.net deveria passar");
  assert(resolveMediaEgressUrl("https://mmg.whatsapp.net.evil.com/v/a.jpg", MIGRATION_EGRESS_POLICY) === null,
    "host parecido não pode passar");
  assert(resolveMediaEgressUrl("http://mmg.whatsapp.net/v/a.jpg", MIGRATION_EGRESS_POLICY) === null,
    "http não pode passar");
  assert(MIGRATION_MEDIA_HOSTS.length === 2, "só os dois hosts do CDN");
});
