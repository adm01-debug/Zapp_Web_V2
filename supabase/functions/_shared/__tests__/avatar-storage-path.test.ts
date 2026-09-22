import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { avatarObjectPath, persistProfilePicture } from "../evolution-helpers.ts";

Deno.test("avatarObjectPath e fixo por telefone e ignora formatacao", () => {
  assertEquals(avatarObjectPath("5511999998888"), "avatars/5511999998888.jpg");
  assertEquals(avatarObjectPath("+55 (11) 99999-8888"), "avatars/5511999998888.jpg");
});

Deno.test("persistProfilePicture sobrescreve o arquivo do telefone e nunca apaga", async () => {
  const chamadas: string[] = [];
  let caminho = "";
  let opcoes: Record<string, unknown> = {};

  const supabase = {
    storage: {
      from: (_bucket: string) => ({
        upload: (path: string, _bytes: Uint8Array, options: Record<string, unknown>) => {
          chamadas.push("upload");
          caminho = path;
          opcoes = options;
          return Promise.resolve({ error: null });
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://projeto.supabase.co/storage/v1/object/public/avatars/${path}` },
        }),
        list: () => {
          chamadas.push("list");
          return Promise.resolve({ data: [] });
        },
        remove: () => {
          chamadas.push("remove");
          return Promise.resolve({ error: null });
        },
      }),
    },
  };

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(new Uint8Array(1024), { status: 200 }));
  try {
    const url = await persistProfilePicture(supabase, "5511999998888", "https://pps.whatsapp.net/foto.jpg");

    assertEquals(caminho, "avatars/5511999998888.jpg");
    assertEquals(opcoes.upsert, true);
    // A corrida so existia porque a funcao apagava arquivos do telefone.
    assertEquals(chamadas.includes("remove"), false);
    assertEquals(chamadas.includes("list"), false);
    assertMatch(url ?? "", /\/avatars\/avatars\/5511999998888\.jpg\?v=\d+$/);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
