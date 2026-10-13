import { assertEquals, assertMatch, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { avatarObjectPath, avatarObjectPathFromUrl, persistProfilePicture } from "../evolution-helpers.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

Deno.test("avatarObjectPath e por contato e imprevisivel (nunca repete)", () => {
  const a = avatarObjectPath("11111111-2222-3333-4444-555555555555");
  const b = avatarObjectPath("11111111-2222-3333-4444-555555555555");
  assertMatch(a, /^contacts\/11111111-2222-3333-4444-555555555555\/[0-9a-f]{32}\.jpg$/);
  // O token muda a cada gravacao: com o mesmo contato o objeto nunca e o mesmo,
  // entao a URL publica nao e derivavel (ao contrario do antigo avatars/<telefone>.jpg).
  assertNotEquals(a, b);
});

Deno.test("avatarObjectPathFromUrl acha o objeto e ignora externo/consulta", () => {
  assertEquals(
    avatarObjectPathFromUrl("https://p.supabase.co/storage/v1/object/public/avatars/avatars/5511999998888.jpg?v=1"),
    "avatars/5511999998888.jpg",
  );
  assertEquals(
    avatarObjectPathFromUrl("https://p.supabase.co/storage/v1/object/public/avatars/contacts/c1/abcdef.jpg"),
    "contacts/c1/abcdef.jpg",
  );
  // URL externa (CDN do WhatsApp) e malformada: nao localiza objeto, nada a remover.
  assertEquals(avatarObjectPathFromUrl("https://pps.whatsapp.net/foto.jpg"), null);
  assertEquals(avatarObjectPathFromUrl(null), null);
  assertEquals(avatarObjectPathFromUrl(""), null);
});

function storageStub(calls: string[], uploads: string[], removals: string[][]) {
  return {
    storage: {
      from: (_bucket: string) => ({
        upload: (path: string, _bytes: Uint8Array, _options: Record<string, unknown>) => {
          calls.push("upload");
          uploads.push(path);
          return Promise.resolve({ error: null });
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://projeto.supabase.co/storage/v1/object/public/avatars/${path}` },
        }),
        remove: (paths: string[]) => {
          calls.push("remove");
          removals.push(paths);
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
  };
}

Deno.test("persistProfilePicture grava no caminho do contato e remove o ANTERIOR depois do upload", async () => {
  const calls: string[] = [];
  const uploads: string[] = [];
  const removals: string[][] = [];
  const supabase = storageStub(calls, uploads, removals);

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(new Uint8Array(1024), { status: 200 }));
  try {
    const previous = "https://projeto.supabase.co/storage/v1/object/public/avatars/avatars/5511999998888.jpg?v=1";
    const url = await persistProfilePicture(
      supabase as unknown as EvolutionDbClient,
      "contato-1",
      "https://pps.whatsapp.net/foto.jpg",
      previous,
    );

    assertEquals(uploads.length, 1);
    assertMatch(uploads[0], /^contacts\/contato-1\/[0-9a-f]{32}\.jpg$/);
    // A pasta antiga do telefone nunca e reusada: nenhuma colisao de nome.
    assertEquals(uploads[0].startsWith("avatars/"), false);
    // upload ANTES do remove: a URL nova existe antes de apagar a antiga.
    assertEquals(calls, ["upload", "remove"]);
    assertEquals(removals, [["avatars/5511999998888.jpg"]]);
    assertMatch(url ?? "", /\/avatars\/contacts\/contato-1\/[0-9a-f]{32}\.jpg\?v=\d+$/);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

Deno.test("persistProfilePicture nao remove quando nao ha anterior ou o anterior e externo", async () => {
  const calls: string[] = [];
  const uploads: string[] = [];
  const removals: string[][] = [];
  const supabase = storageStub(calls, uploads, removals);

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(new Uint8Array(1024), { status: 200 }));
  try {
    // Sem anterior: so upload.
    await persistProfilePicture(supabase as unknown as EvolutionDbClient, "contato-2", "https://pps.whatsapp.net/a.jpg", null);
    // Anterior externo (CDN): nao esta no bucket, nao se remove.
    await persistProfilePicture(supabase as unknown as EvolutionDbClient, "contato-2", "https://pps.whatsapp.net/a.jpg", "https://pps.whatsapp.net/antigo.jpg");

    assertEquals(calls.filter((c) => c === "remove").length, 0);
    assertEquals(uploads.length, 2);
    // Cada gravacao e um objeto novo (token diferente).
    assertNotEquals(uploads[0], uploads[1]);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
