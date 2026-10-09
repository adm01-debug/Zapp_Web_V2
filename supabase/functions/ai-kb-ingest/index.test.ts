/**
 * R2-API-054 (#227) — o upload da Base de Conhecimento não tinha processamento
 * até a IA: `uploadFile` gravava os bytes e criava `knowledge_base_files`, mas
 * nenhum extrator/automação transformava o documento em conteúdo recuperável
 * (`article_id`/`extracted_text` ficavam nulos e `processing_status` parava em
 * `pending`). O contexto da IA lê `knowledge_base_articles` publicados — então
 * o documento nunca chegava à IA.
 *
 * Este arquivo prova o pipeline versionado (`ai-kb-ingest`) pelo handler REAL,
 * com cliente Supabase de mentira injetado (`_injected`): sem rede, sem banco,
 * sem provedor e sem chave real. O caminho de autenticação é servido por um
 * `fetch` de mentira que responde o `/auth/v1/user`.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { handleAiKbIngest } from "./index.ts";
import {
  extractKbText,
  isKbTextExtractable,
  kbExtension,
  resolveKbStorageObject,
} from "../_shared/ai-kb-ingest.ts";

const SUPABASE_URL = "https://projeto.supabase.co";
const FILE_ID = "11111111-2222-3333-4444-555555555555";
const ARTICLE_ID = "99999999-8888-7777-6666-555555555555";
const USER_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-publica-de-teste");

/** IP próprio por requisição: o rate limit em módulo não contamina os casos. */
let ipSeq = 0;
const nextIp = () => `10.0.0.${(ipSeq += 1) % 250}`;

interface KbFileRow {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  processing_status: string;
  article_id: string | null;
}

interface Estado {
  file: KbFileRow | null;
  loadError?: { message: string } | null;
  claimError?: { message: string } | null;
  bytes?: Uint8Array;
  downloadError?: { message: string } | null;
  insertError?: { message: string } | null;
  completedStatusWriteError?: { message: string } | null;
  statusWriteError?: { message: string } | null;
  deleteError?: { message: string } | null;
  isAdmin?: boolean;
  roleError?: { message: string } | null;
}

interface Capturas {
  statuses: string[];
  articles: Record<string, unknown>[];
  downloads: string[];
  inserts: number;
  links: Record<string, unknown>[];
  deletes: string[];
  roleChecks: string[];
  claims: number;
  loads: number;
}

const publicUrl = (name: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/whatsapp-media/kb/${name}`;

function arquivo(overrides: Partial<KbFileRow> = {}): KbFileRow {
  return {
    id: FILE_ID,
    file_name: "manual.md",
    file_url: publicUrl("manual.md"),
    file_type: "text/markdown",
    processing_status: "pending",
    article_id: null,
    ...overrides,
  };
}

/** Cliente Supabase de mentira: só o que o handler usa, sem `any` no tipo final. */
function clienteFalso(estado: Estado): { supabase: SupabaseClient; capturas: Capturas } {
  const capturas: Capturas = {
    statuses: [],
    articles: [],
    downloads: [],
    inserts: 0,
    links: [],
    deletes: [],
    roleChecks: [],
    claims: 0,
    loads: 0,
  };

  const tabela = (_table: string) => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.in = chain;
    builder.eq = chain;
    builder.maybeSingle = () => {
      capturas.loads += 1;
      return Promise.resolve({ data: estado.file, error: estado.loadError ?? null });
    };
    builder.single = () => Promise.resolve({ data: estado.file, error: estado.loadError ?? null });
    builder.update = (patch: Record<string, unknown>) => {
      const query: Record<string, unknown> = { filters: [] as Array<{ op: string; column: string; value: unknown }> };
      query.eq = (column: string, value: unknown) => {
        (query.filters as Array<{ op: string; column: string; value: unknown }>).push({ op: "eq", column, value });
        return query;
      };
      query.in = (column: string, value: unknown) => {
        (query.filters as Array<{ op: string; column: string; value: unknown }>).push({ op: "in", column, value });
        return query;
      };
      query.select = () => query;
      query.maybeSingle = () => {
        capturas.claims += 1;
        if (estado.claimError) return Promise.resolve({ data: null, error: estado.claimError });
        const allowed = (query.filters as Array<{ op: string; column: string; value: unknown }>).find((f) =>
          f.op === "in" && f.column === "processing_status"
        )?.value as string[] | undefined;
        if (!estado.file || !allowed?.includes(estado.file.processing_status)) {
          return Promise.resolve({ data: null, error: null });
        }
        estado.file = { ...estado.file, ...patch } as KbFileRow;
        if (typeof patch.processing_status === "string") capturas.statuses.push(patch.processing_status);
        return Promise.resolve({ data: estado.file, error: null });
      };
      query.then = (onFulfilled: (v: { error: { message: string } | null }) => unknown) => {
        const status = typeof patch.processing_status === "string" ? patch.processing_status : null;
        const error = status === "completed" && estado.completedStatusWriteError
          ? estado.completedStatusWriteError
          : estado.statusWriteError ?? null;
        if (!error) {
          if (status) capturas.statuses.push(status);
          if ("article_id" in patch || "extracted_text" in patch) capturas.links.push(patch);
          if (estado.file) estado.file = { ...estado.file, ...patch } as KbFileRow;
        }
        return Promise.resolve({ error }).then(onFulfilled);
      };
      return query;
    };
    builder.insert = (row: Record<string, unknown>) => {
      capturas.inserts += 1;
      capturas.articles.push(row);
      return {
        select: () => ({
          single: () =>
            Promise.resolve(
              estado.insertError
                ? { data: null, error: estado.insertError }
                : { data: { id: ARTICLE_ID }, error: null },
            ),
        }),
      };
    };
    builder.delete = () => ({
      eq: (_column: string, value: string) => {
        capturas.deletes.push(value);
        return Promise.resolve({ error: estado.deleteError ?? null });
      },
    });
    builder.then = (onFulfilled: (v: { data: null; error: null }) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(onFulfilled);
    return builder;
  };

  const fake = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      if (fn === "is_admin_or_supervisor") {
        capturas.roleChecks.push(String(args._user_id));
        return Promise.resolve({ data: estado.isAdmin ?? true, error: estado.roleError ?? null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from: (table: string) => tabela(table),
    storage: {
      from: (bucket: string) => ({
        download: (objectPath: string) => {
          capturas.downloads.push(`${bucket}/${objectPath}`);
          if (estado.downloadError) return Promise.resolve({ data: null, error: estado.downloadError });
          const bytes = estado.bytes ?? new Uint8Array();
          return Promise.resolve({
            data: new Blob([bytes.buffer.slice(0, bytes.byteLength) as ArrayBuffer]),
            error: null,
          });
        },
      }),
    },
  };

  return { supabase: fake as unknown as SupabaseClient, capturas };
}

/** `fetch` de mentira só para o `auth.getUser()` do requireAuth. */
function comAuthFalsa(userId: string | null): { restaurar: () => void; urls: string[] } {
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    urls.push(url);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(
        new Response(JSON.stringify({ id: userId }), {
          status: userId ? 200 : 401,
          headers: { "content-type": "application/json" },
        }),
      );
    }
    throw new Error(`fetch real bloqueado no teste: ${url}`);
  }) as typeof fetch;
  return { restaurar: () => { globalThis.fetch = original; }, urls };
}

function pedido(fileId: unknown, opts: { bearer?: string | null } = {}): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: "http://localhost:5173",
    "x-forwarded-for": nextIp(),
  };
  const bearer = opts.bearer === undefined ? "jwt-de-teste" : opts.bearer;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return new Request(`${SUPABASE_URL}/functions/v1/ai-kb-ingest`, {
    method: "POST",
    headers,
    body: JSON.stringify({ fileId }),
  });
}

async function corpo(resp: Response): Promise<Record<string, unknown>> {
  return await resp.json() as Record<string, unknown>;
}

function comAmbiente(fn: () => Promise<void>): Promise<void> {
  const auth = comAuthFalsa(USER_ID);
  return fn().finally(auth.restaurar);
}

// ─── O defeito: o documento precisa VIRAR conhecimento recuperável ───────────

Deno.test("R2-API-054: documento de texto vira artigo publicado e o arquivo fecha 'completed'", async () => {
  const texto = "# Manual de Vendas\n\nO prazo de entrega e de 5 dias uteis.";
  const estado: Estado = { file: arquivo(), bytes: new TextEncoder().encode(texto) };
  const { supabase, capturas } = clienteFalso(estado);

  await comAmbiente(async () => {
    const resp = await handleAiKbIngest(pedido(FILE_ID), { supabase });
    assertEquals(resp.status, 200);
    const body = await corpo(resp);
    assertEquals(body.status, "completed");
    assertEquals(body.articleId, ARTICLE_ID);
    assertEquals(body.extractedChars, texto.length);
  });

  // O conteúdo foi extraído de verdade...
  assertEquals(capturas.downloads, ["whatsapp-media/kb/manual.md"]);
  // ...virou UM artigo publicado (é o que a IA lê)...
  assertEquals(capturas.inserts, 1);
  const artigo = capturas.articles[0];
  assertEquals(artigo.title, "manual");
  assertEquals(artigo.content, texto);
  assertEquals(artigo.is_published, true);
  assertEquals(artigo.embedding_status, "pending");
  assertEquals(artigo.created_by, USER_ID);
  // ...e o arquivo guarda progresso + vínculo com o artigo.
  assertEquals(capturas.statuses, ["processing", "completed"]);
  assertEquals(capturas.links.length, 1);
  assertEquals(capturas.links[0].article_id, ARTICLE_ID);
  assertEquals(capturas.links[0].extracted_text, texto);
});

Deno.test("R2-API-054: formato sem extrator local NÃO vira artigo — fica 'unsupported' (só armazenado)", async () => {
  const estado: Estado = { file: arquivo({ file_name: "catalogo.pdf", file_type: "application/pdf" }) };
  const { supabase, capturas } = clienteFalso(estado);

  await comAmbiente(async () => {
    const resp = await handleAiKbIngest(pedido(FILE_ID), { supabase });
    assertEquals(resp.status, 200);
    const body = await corpo(resp);
    assertEquals(body.status, "unsupported");
    assertEquals(body.articleId, null);
  });

  assertEquals(capturas.inserts, 0, "nada pode ser publicado como conhecimento");
  assertEquals(capturas.downloads.length, 0, "não vale baixar o que não sabe extrair");
  assertEquals(capturas.statuses, ["processing", "unsupported"]);
});

Deno.test("R2-API-054: file_url fora do storage do projeto é RECUSADA sem baixar nada", async () => {
  const estado: Estado = {
    file: arquivo({ file_url: "https://evil.example.com/storage/v1/object/public/whatsapp-media/kb/manual.md" }),
    bytes: new TextEncoder().encode("conteudo hospedado fora"),
  };
  const { supabase, capturas } = clienteFalso(estado);

  await comAmbiente(async () => {
    const resp = await handleAiKbIngest(pedido(FILE_ID), { supabase });
    assertEquals(resp.status, 422);
  });

  assertEquals(capturas.downloads.length, 0, "nenhum fetch para destino não validado");
  assertEquals(capturas.inserts, 0);
  assertEquals(capturas.statuses, ["processing", "failed"]);
});

Deno.test("R2-API-054: bucket fora da lista de PERMITIDOS também é recusado", async () => {
  const estado: Estado = {
    file: arquivo({ file_url: `${SUPABASE_URL}/storage/v1/object/public/segredos/manual.md` }),
  };
  const { supabase, capturas } = clienteFalso(estado);

  await comAmbiente(async () => {
    const resp = await handleAiKbIngest(pedido(FILE_ID), { supabase });
    assertEquals(resp.status, 422);
  });
  assertEquals(capturas.downloads.length, 0);
});

Deno.test("R2-API-054: falha ao criar o artigo grava 'failed' e responde 500 (erro não engolido)", async () => {
  const estado: Estado = {
    file: arquivo(),
    bytes: new TextEncoder().encode("conteudo valido"),
    insertError: { message: "rls denied" },
  };
  const { supabase, capturas } = clienteFalso(estado);

  await comAmbiente(async () => {
    const resp = await handleAiKbIngest(pedido(FILE_ID), { supabase });
    assertEquals(resp.status, 500);
  });
  assertEquals(capturas.statuses, ["processing", "failed"]);
});

Deno.test("R2-API-054: se só o update completed falha, remove o artigo para não deixar órfão", async () => {
  const estado: Estado = {
    file: arquivo(),
    bytes: new TextEncoder().encode("conteudo valido"),
    completedStatusWriteError: { message: "lock timeout" },
  };
  const { supabase, capturas } = clienteFalso(estado);

  await comAmbiente(async () => {
    const resp = await handleAiKbIngest(pedido(FILE_ID), { supabase });
    assertEquals(resp.status, 500);
  });

  assertEquals(capturas.claims, 1, "a reivindicação processing não pode falhar neste teste");
  assertEquals(capturas.inserts, 1, "o artigo foi criado antes da falha terminal");
  assertEquals(capturas.deletes, [ARTICLE_ID], "artigo publicado é removido no rollback compensatório");
  assertEquals(capturas.statuses, ["processing", "failed"]);
});

Deno.test("R2-API-054: arquivo já processado é idempotente (não duplica artigo)", async () => {
  const estado: Estado = {
    file: arquivo({ processing_status: "completed", article_id: ARTICLE_ID }),
    bytes: new TextEncoder().encode("nao deveria ser lido"),
  };
  const { supabase, capturas } = clienteFalso(estado);

  await comAmbiente(async () => {
    const resp = await handleAiKbIngest(pedido(FILE_ID), { supabase });
    assertEquals(resp.status, 200);
    const body = await corpo(resp);
    assertEquals(body.articleId, ARTICLE_ID);
    assertEquals(body.idempotent, true);
  });
  assertEquals(capturas.inserts, 0);
  assertEquals(capturas.downloads.length, 0);
});

Deno.test("R2-API-054: chamada concorrente não reivindica arquivo em processing nem duplica artigo", async () => {
  const estado: Estado = {
    file: arquivo({ processing_status: "processing", article_id: null }),
    bytes: new TextEncoder().encode("nao deveria ser lido"),
  };
  const { supabase, capturas } = clienteFalso(estado);

  await comAmbiente(async () => {
    const resp = await handleAiKbIngest(pedido(FILE_ID), { supabase });
    assertEquals(resp.status, 409);
  });

  assertEquals(capturas.claims, 1);
  assertEquals(capturas.inserts, 0);
  assertEquals(capturas.downloads.length, 0);
  assertEquals(capturas.statuses, []);
});

// ─── Gate de entrada ─────────────────────────────────────────────────────────

Deno.test("R2-API-054: sem Bearer não lê nem grava nada", async () => {
  const estado: Estado = { file: arquivo(), bytes: new TextEncoder().encode("x") };
  const { supabase, capturas } = clienteFalso(estado);

  const resp = await handleAiKbIngest(pedido(FILE_ID, { bearer: null }), { supabase });
  assertEquals(resp.status, 401);
  assertEquals(capturas.statuses, []);
  assertEquals(capturas.inserts, 0);
});

Deno.test("R2-API-054: usuário autenticado sem papel de gestão recebe 403 sem ler arquivo", async () => {
  const estado: Estado = { file: arquivo(), bytes: new TextEncoder().encode("x"), isAdmin: false };
  const { supabase, capturas } = clienteFalso(estado);

  await comAmbiente(async () => {
    const resp = await handleAiKbIngest(pedido(FILE_ID), { supabase });
    assertEquals(resp.status, 403);
  });

  assertEquals(capturas.roleChecks, [USER_ID]);
  assertEquals(capturas.loads, 0);
  assertEquals(capturas.statuses, []);
  assertEquals(capturas.inserts, 0);
});

Deno.test("R2-API-054: fileId inválido não chega ao banco", async () => {
  const estado: Estado = { file: arquivo() };
  const { supabase, capturas } = clienteFalso(estado);

  await comAmbiente(async () => {
    const resp = await handleAiKbIngest(pedido("nao-e-uuid"), { supabase });
    assertEquals(resp.status, 400);
    assertEquals(capturas.statuses.length, 0);
    assertEquals(capturas.inserts, 0);
  });
});

// ─── Peças puras do pipeline ─────────────────────────────────────────────────

Deno.test("R2-API-054: extensões de texto são aceitas e binárias não", () => {
  assertEquals(kbExtension("manual.md", null), "md");
  assertEquals(kbExtension("notas.TXT", null), "txt");
  assertEquals(kbExtension("planilha", "text/csv"), "csv");
  assertEquals(kbExtension("catalogo.pdf", "application/pdf"), "pdf");
  assert(isKbTextExtractable("md"));
  assert(isKbTextExtractable("csv"));
  assert(!isKbTextExtractable("pdf"));
  assert(!isKbTextExtractable("docx"));
});

Deno.test("R2-API-054: extração remove marcação HTML e recusa vazio", () => {
  const html = extractKbText(
    new TextEncoder().encode("<html><style>p{}</style><body><h1>Titulo</h1><p>Corpo</p></body></html>"),
    "html",
  );
  assert(html.ok);
  assert(!html.text.includes("<h1>"));
  assert(html.text.includes("Titulo"));

  const vazio = extractKbText(new TextEncoder().encode("   \n  "), "txt");
  assert(!vazio.ok);
  assertEquals(vazio.reason, "empty");
});

Deno.test("R2-API-054: resolução de objeto do storage usa lista de PERMITIDOS", () => {
  assertEquals(
    resolveKbStorageObject(publicUrl("a.md"), SUPABASE_URL),
    { bucket: "whatsapp-media", objectPath: "kb/a.md" },
  );
  assertEquals(resolveKbStorageObject("https://outro.supabase.co/storage/v1/object/public/whatsapp-media/kb/a.md", SUPABASE_URL), null);
  assertEquals(resolveKbStorageObject(`${SUPABASE_URL}/storage/v1/object/public/outro-bucket/a.md`, SUPABASE_URL), null);
  assertEquals(resolveKbStorageObject("http://projeto.supabase.co/storage/v1/object/public/whatsapp-media/a.md", SUPABASE_URL), null);
  assertEquals(resolveKbStorageObject("nao-e-url", SUPABASE_URL), null);
  // Assinatura/query na URL não muda o caminho do objeto.
  assertEquals(
    resolveKbStorageObject(`${SUPABASE_URL}/storage/v1/object/sign/whatsapp-media/kb/a.md?token=abc`, SUPABASE_URL),
    { bucket: "whatsapp-media", objectPath: "kb/a.md" },
  );
  // Traversal é neutralizado pelo próprio parser da URL (o objeto fica no bucket permitido).
  assertEquals(
    resolveKbStorageObject(`${SUPABASE_URL}/storage/v1/object/public/whatsapp-media/kb/../fora.md`, SUPABASE_URL),
    { bucket: "whatsapp-media", objectPath: "fora.md" },
  );
});
