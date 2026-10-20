// N-207 — testes do normalizador de contatos da sincronização Evolution.
//
// Prova três comportamentos:
//   1. Contato v2 e contato GO normalizam para o mesmo shape.
//   2. Contato com isGroup=true é filtrado (não sincronizado).
//   3. goHistoryNotSupported devolve status 200 com notSupported=true.
//
// Run: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//   supabase/functions/_shared/__tests__/evolution-sync-actions.test.ts

import { assertEquals, assertObjectMatch, assertStringIncludes } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { syncContacts, goHistoryNotSupported } from "../evolution-sync-actions.ts";

// Força modo v2 para que evoFetch não traduza o path para GO.
Deno.env.set("EVOLUTION_API_FLAVOR", "v2");

// ---------------------------------------------------------------------------
// Mock do fetch global — intercepta evoFetch sem rede externa.
// ---------------------------------------------------------------------------

function installFetchSpy(responder: (url: string) => Response): () => void {
  const original = globalThis.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = (_input: any, _init?: any): Promise<Response> => {
    const url = typeof _input === "string" ? _input : String(_input?.url ?? _input);
    return Promise.resolve(responder(url));
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return () => { (globalThis as any).fetch = original; };
}

// ---------------------------------------------------------------------------
// Mock do client Supabase — registra inserts/updates e simula conexão.
// ---------------------------------------------------------------------------

function createMockSupabase(connectionData: { id: string } | null, existingContacts: Array<{ phone: string }> = []) {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];

  const client = {
    from(table: string) {
      return {
        select(_fields?: string) {
          return {
            eq(_key: string, _value: unknown) {
              return {
                maybeSingle() {
                  if (table === "whatsapp_connections") {
                    return Promise.resolve({ data: connectionData, error: null });
                  }
                  if (table === "contacts") {
                    const match = existingContacts.find((c) => c.phone === _value);
                    return Promise.resolve({ data: match ?? null, error: null });
                  }
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },
        insert(data: unknown) {
          inserted.push(data);
          return Promise.resolve({ data: { id: "conn-1" }, error: null });
        },
        update(data: unknown) {
          updated.push(data);
          return Promise.resolve({ error: null });
        },
        single() {
          return Promise.resolve({ data: connectionData, error: null });
        },
      };
    },
    _inserted: inserted,
    _updated: updated,
  };

  return { client, inserted, updated };
}

// ---------------------------------------------------------------------------
// Helpers de payload
// ---------------------------------------------------------------------------

function v2Contact(id: string, pushName: string, profilePictureUrl?: string | null) {
  return { id, pushName, profilePictureUrl };
}

function goContact(Jid: string, FullName: string, PushName: string, BusinessName?: string) {
  return { Jid, FullName, PushName, BusinessName };
}

// ===========================================================================
// 1. goHistoryNotSupported
// ===========================================================================

Deno.test("goHistoryNotSupported devolve status 200 com notSupported=true", async () => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*" };
  const response = goHistoryNotSupported("sync-messages", corsHeaders);

  assertEquals(response.status, 200, "status deve ser 200");
  const body = await response.json();
  assertObjectMatch(body, { success: false, notSupported: true });
  assertStringIncludes(body.message, "sync-messages não é suportado na Evolution GO");
});

// ===========================================================================
// 2. Contato v2 e GO normalizam para o mesmo shape
// ===========================================================================

Deno.test("contato v2 e contato GO normalizam para o mesmo shape (remoteJid + name)", async () => {
  const v2Payload = v2Contact("5511999998888@s.whatsapp.net", "João Silva", "https://example.com/avatar.jpg");
  const goPayload = goContact("5511999998888@s.whatsapp.net", "João Silva", "João", "Empresa X");

  // Resposta v2 (array direto)
  const v2Restore = installFetchSpy(() =>
    new Response(JSON.stringify([v2Payload]), { status: 200, headers: { "Content-Type": "application/json" } })
  );

  const { client: supabaseV2, inserted: insertedV2 } = createMockSupabase({ id: "conn-1" });
  const corsHeaders = { "Access-Control-Allow-Origin": "*" };

  try {
    await syncContacts(supabaseV2 as unknown as Parameters<typeof syncContacts>[0], "https://evo.example.com", "key-v2", "INST-1", corsHeaders, 1, 50);

    assertEquals(insertedV2.length, 1, "deveria ter inserido 1 contato v2");
    const v2Result = insertedV2[0] as { phone: string; name: string; avatar_url: string | null };
    assertEquals(v2Result.phone, "5511999998888");
    assertEquals(v2Result.name, "João Silva");
    assertEquals(v2Result.avatar_url, "https://example.com/avatar.jpg");
  } finally {
    v2Restore();
  }

  // Resposta GO ({ message: 'success', data: [...] })
  const goRestore = installFetchSpy(() =>
    new Response(JSON.stringify({ message: "success", data: [goPayload] }), { status: 200, headers: { "Content-Type": "application/json" } })
  );

  const { client: supabaseGo, inserted: insertedGo } = createMockSupabase({ id: "conn-1" });

  try {
    await syncContacts(supabaseGo as unknown as Parameters<typeof syncContacts>[0], "https://evo.example.com", "key-go", "INST-1", corsHeaders, 1, 50);

    assertEquals(insertedGo.length, 1, "deveria ter inserido 1 contato GO");
    const goResult = insertedGo[0] as { phone: string; name: string; avatar_url: string | null };
    assertEquals(goResult.phone, "5511999998888");
    assertEquals(goResult.name, "João Silva");
    assertEquals(goResult.avatar_url, null);
  } finally {
    goRestore();
  }
});

// ===========================================================================
// 3. Grupo filtrado — o normalizador não deve sincronizar grupos
//    Cobre o formato que a Evolution de fato envia (`@g.us`) e o caso
//    `@s.whatsapp.net` + isGroup=true (que só o filtro `|| contact.isGroup`
//    exclui — sem ele este contato é inserido).
// ===========================================================================

Deno.test("grupo (@g.us e @s.whatsapp.net+isGroup) é filtrado e não sincronizado", async () => {
  const realGroupJid = { ...v2Contact("120363000000000000@g.us", "Grupo Real") };       // formato Evolution
  const flaggedGroup = { ...v2Contact("5511999998888@s.whatsapp.net", "Grupo Flag"), isGroup: true };

  const restore = installFetchSpy(() =>
    new Response(JSON.stringify([realGroupJid, flaggedGroup]), { status: 200, headers: { "Content-Type": "application/json" } })
  );

  const { client: supabase, inserted } = createMockSupabase({ id: "conn-1" });
  const corsHeaders = { "Access-Control-Allow-Origin": "*" };

  try {
    const response = await syncContacts(supabase as unknown as Parameters<typeof syncContacts>[0], "https://evo.example.com", "key", "INST-1", corsHeaders, 1, 50);
    const body = await response.json();

    assertEquals(inserted.length, 0, "nenhum grupo deve ser inserido");
    assertEquals(body.skipped, 2, "os dois grupos deveriam ter sido pulados como skipped");
  } finally {
    restore();
  }
});
