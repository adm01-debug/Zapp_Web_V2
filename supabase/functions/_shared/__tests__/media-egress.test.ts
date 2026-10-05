// Regressão R2-API-009 — download de mídia do webhook só pode sair para
// destinos da política de egress (CDN do WhatsApp + origens confiáveis
// configuradas), com redirect manual revalidado e teto de bytes em streaming.
// Antes da correção, persistMediaToStorage/persistProfilePicture/sticker
// chamavam fetch() direto em qualquer URL do payload — inclusive loopback.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  downloadMediaWithEgressPolicy,
  mediaEgressPolicyFromEnv,
  type MediaEgressPolicy,
  resolveMediaEgressUrl,
} from "../media-egress.ts";
import { persistMediaToStorage } from "../evolution-media.ts";
import { persistProfilePicture } from "../evolution-helpers.ts";
import { handleStickerMedia } from "../evolution-webhook-messages.ts";
import type { EvolutionDbClient } from "../evolution-types.ts";

const POLICY: MediaEgressPolicy = {
  trustedOrigins: ["https://evo.local:8080", "http://192.168.0.10:9000"],
  hostSuffixes: ["whatsapp.net"],
};

const BIG = new Uint8Array(2048).fill(0x41);

function bodyResponse(bytes: Uint8Array<ArrayBuffer>, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(bytes, { status, headers });
}

function streamResponse(
  chunks: Uint8Array[],
  headers: Record<string, string> = {},
  onCancel?: () => void,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
    cancel() {
      onCancel?.();
    },
  });
  return new Response(stream, { status: 200, headers });
}

Deno.test("media-egress: resolveMediaEgressUrl rejeita destinos fora da política", () => {
  for (
    const raw of [
      "http://127.0.0.1:9999/metadata",
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.5/internal",
      "http://[::1]/x",
      "https://evil.example.com/x.jpg",
      "https://whatsapp.net.evil.example.com/x.jpg",
      "https://93.184.216.34/x.jpg",
      "http://mmg.whatsapp.net/v/x.enc", // CDN do WhatsApp exige https
      "https://user:pass@mmg.whatsapp.net/x.jpg",
      "file:///etc/passwd",
      "gopher://127.0.0.1/x",
      "nao-e-url",
      "https://evo.local:9090/nao-e-a-origem-confiavel",
      "http://evo.local:8080/scheme-diferente-da-origem-confiavel",
    ]
  ) {
    assertEquals(resolveMediaEgressUrl(raw, POLICY), null, raw);
  }
});

Deno.test("media-egress: resolveMediaEgressUrl aceita CDN WhatsApp https e origens confiáveis", () => {
  for (
    const raw of [
      "https://mmg.whatsapp.net/v/t62/enc?mms3=abc",
      "https://pps.whatsapp.net/v/t61/foto.jpg",
      "https://whatsapp.net/x",
      "https://evo.local:8080/files/media.bin",
      "http://192.168.0.10:9000/bucket/media.bin",
    ]
  ) {
    const url = resolveMediaEgressUrl(raw, POLICY);
    assert(url instanceof URL, raw);
  }
});

Deno.test("media-egress: download de URL pública permitida devolve bytes", async () => {
  let requested = "";
  let init: RequestInit | undefined;
  const result = await downloadMediaWithEgressPolicy(
    "https://mmg.whatsapp.net/v/t62/enc?token=1",
    {
      policy: POLICY,
      fetcher: (input, i) => {
        requested = input;
        init = i;
        return Promise.resolve(bodyResponse(BIG, 200, { "content-type": "image/jpeg" }));
      },
    },
  );
  assertEquals(requested, "https://mmg.whatsapp.net/v/t62/enc?token=1");
  assertEquals(init?.redirect, "manual");
  assertEquals(result?.bytes.length, 2048);
  assertEquals(result?.contentType, "image/jpeg");
});

Deno.test("media-egress: segue redirect dentro da política e aborta redirect para destino bloqueado", async () => {
  const calls: string[] = [];
  const allowed = await downloadMediaWithEgressPolicy(
    "https://mmg.whatsapp.net/v/x",
    {
      policy: POLICY,
      fetcher: (input) => {
        calls.push(input);
        if (calls.length === 1) {
          return Promise.resolve(
            bodyResponse(new Uint8Array(0), 302, { location: "https://pps.whatsapp.net/real/x.jpg" }),
          );
        }
        return Promise.resolve(bodyResponse(BIG));
      },
    },
  );
  assertEquals(calls, [
    "https://mmg.whatsapp.net/v/x",
    "https://pps.whatsapp.net/real/x.jpg",
  ]);
  assertEquals(allowed?.finalUrl, "https://pps.whatsapp.net/real/x.jpg");
  assertEquals(allowed?.bytes.length, 2048);

  calls.length = 0;
  const blocked = await downloadMediaWithEgressPolicy(
    "https://mmg.whatsapp.net/v/x",
    {
      policy: POLICY,
      fetcher: (input) => {
        calls.push(input);
        return Promise.resolve(
          bodyResponse(new Uint8Array(0), 302, { location: "http://169.254.169.254/latest/meta-data" }),
        );
      },
    },
  );
  assertEquals(blocked, null);
  assertEquals(calls, ["https://mmg.whatsapp.net/v/x"], "o hop bloqueado não pode ser buscado");
});

Deno.test("media-egress: teto de bytes em streaming cancela o corpo", async () => {
  let cancelled = false;
  const overCap = await downloadMediaWithEgressPolicy(
    "https://mmg.whatsapp.net/v/x",
    {
      policy: POLICY,
      maxBytes: 1024,
      fetcher: () =>
        // Stream sem fim: pull() produz um chunk a cada leitura até o reader
        // desistir — cancel() só dispara se o corpo for abortado no meio.
        Promise.resolve(new Response(new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(new Uint8Array(700));
          },
          cancel() {
            cancelled = true;
          },
        }), { status: 200 })),
    },
  );
  assertEquals(overCap, null);
  assertEquals(cancelled, true, "o corpo precisa ser cancelado ao estourar o teto");

  // content-length declarado acima do teto: reprova sem ler nada.
  const declared = await downloadMediaWithEgressPolicy(
    "https://mmg.whatsapp.net/v/x",
    {
      policy: POLICY,
      maxBytes: 1024,
      fetcher: () =>
        Promise.resolve(streamResponse([new Uint8Array(2048)], { "content-length": "2048" })),
    },
  );
  assertEquals(declared, null);
});

Deno.test("media-egress: download direto de destino arbitrário nunca chama o fetch", async () => {
  for (
    const raw of [
      "http://127.0.0.1:9999/x",
      "http://169.254.169.254/latest/meta-data",
      "https://evil.example.com/x.jpg",
      "http://mmg.whatsapp.net/x",
    ]
  ) {
    let calls = 0;
    const result = await downloadMediaWithEgressPolicy(raw, {
      policy: POLICY,
      fetcher: () => {
        calls++;
        return Promise.resolve(bodyResponse(BIG));
      },
    });
    assertEquals(result, null, raw);
    assertEquals(calls, 0, raw);
  }
});

Deno.test("media-egress: origem confiável configurada aceita http em IP privado", async () => {
  let requested = "";
  const result = await downloadMediaWithEgressPolicy("http://192.168.0.10:9000/bucket/a.jpg", {
    policy: POLICY,
    fetcher: (input) => {
      requested = input;
      return Promise.resolve(bodyResponse(BIG));
    },
  });
  assertEquals(requested, "http://192.168.0.10:9000/bucket/a.jpg");
  assertEquals(result?.bytes.length, 2048);
});

Deno.test("media-egress: política default reconhece EVOLUTION_API_URL e MEDIA_EGRESS_ALLOWED_*", () => {
  const prev = {
    evo: Deno.env.get("EVOLUTION_API_URL"),
    origins: Deno.env.get("MEDIA_EGRESS_ALLOWED_ORIGINS"),
    hosts: Deno.env.get("MEDIA_EGRESS_ALLOWED_HOSTS"),
  };
  try {
    Deno.env.set("EVOLUTION_API_URL", "http://10.1.2.3:8080");
    Deno.env.set("MEDIA_EGRESS_ALLOWED_ORIGINS", "https://minio.interno:9443, ,invalido");
    Deno.env.set("MEDIA_EGRESS_ALLOWED_HOSTS", "cdn.parceiro.com");
    const policy = mediaEgressPolicyFromEnv();
    assert(resolveMediaEgressUrl("http://10.1.2.3:8080/midia/1", policy) !== null);
    assert(resolveMediaEgressUrl("https://minio.interno:9443/b/1", policy) !== null);
    assert(resolveMediaEgressUrl("https://a.cdn.parceiro.com/m/1", policy) !== null);
    assert(resolveMediaEgressUrl("https://mmg.whatsapp.net/v/x", policy) !== null);
    assert(resolveMediaEgressUrl("http://10.1.2.4:8080/midia/1", policy) === null);
    assert(resolveMediaEgressUrl("https://outro.host/x", policy) === null);
  } finally {
    for (const [key, value] of Object.entries({
      EVOLUTION_API_URL: prev.evo,
      MEDIA_EGRESS_ALLOWED_ORIGINS: prev.origins,
      MEDIA_EGRESS_ALLOWED_HOSTS: prev.hosts,
    })) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

// ── Prova do defeito nos caminhos do webhook (vermelho antes, verde depois) ──

const supabaseStub: EvolutionDbClient = {
  from: () => {
    throw new Error("não usado nos caminhos de download rejeitado");
  },
  rpc: () => Promise.resolve({ data: null, error: null }),
  storage: {
    from: () => ({
      upload: () => Promise.resolve({ data: null, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: "https://storage.local/x" } }),
    }),
  },
  channel: () => ({ send: () => Promise.resolve({}) }),
  removeChannel: () => {},
};

function withFetchSpy<T>(fn: (calls: string[]) => Promise<T>): Promise<{ calls: string[]; result: T }> {
  const calls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    calls.push(String(input));
    return Promise.resolve(bodyResponse(BIG));
  }) as typeof fetch;
  return fn(calls).then((result) => ({ calls, result })).finally(() => {
    globalThis.fetch = real;
  });
}

Deno.test("persistMediaToStorage: URL loopback do payload não chega à rede", async () => {
  const { calls } = await withFetchSpy(() =>
    persistMediaToStorage(supabaseStub, "http://127.0.0.1:9999/metadata", "image", "MSGID1")
  );
  assertEquals(calls, []);
});

Deno.test("persistProfilePicture: URL loopback do provedor não chega à rede", async () => {
  const { calls } = await withFetchSpy(() =>
    persistProfilePicture(supabaseStub, "5511999999999", "http://169.254.169.254/latest")
  );
  assertEquals(calls, []);
});

Deno.test("handleStickerMedia: mediaUrl arbitrária do payload não chega à rede", async () => {
  // Depois de recusar a URL do payload pela política de egress, o handler cai
  // no fallback LEGÍTIMO: pedir a mídia ao provedor configurado
  // (EVOLUTION_API_URL/KEY). A garantia de segurança é que o endereço
  // arbitrário do payload nunca é buscado — não que nenhuma rede é chamada.
  // O teste fixa o ambiente porque os arquivos .test.ts rodam no mesmo
  // processo do `deno test` e outros arquivos setam EVOLUTION_API_* em nível
  // de módulo sem restaurar (foi o que quebrou este teste no CI).
  const ENV_KEYS = [
    "EVOLUTION_API_URL",
    "EVOLUTION_API_KEY",
    "EVOLUTION_API_FLAVOR",
    "EVOLUTION_INSTANCE_TOKEN",
  ] as const;
  const prev = new Map(ENV_KEYS.map((k) => [k, Deno.env.get(k)]));
  const payloadUrl = "http://192.168.1.50:8080/sticker.webp";
  const run = () =>
    handleStickerMedia(
      supabaseStub,
      "inst",
      { mediaUrl: payloadUrl, key: { id: "K1" } },
      { stickerMessage: {} },
      { id: "K1" },
    );
  try {
    // Sem provedor configurado: nenhuma chamada de rede.
    for (const k of ENV_KEYS) Deno.env.delete(k);
    const { calls: semProvedor } = await withFetchSpy(run);
    assertEquals(semProvedor, []);

    // Com provedor configurado (flavor v2 → rota sem tradução GO): só o
    // endpoint sintético do provedor pode aparecer — nunca a URL do payload.
    Deno.env.set("EVOLUTION_API_URL", "https://evolution.test");
    Deno.env.set("EVOLUTION_API_KEY", "test-evolution-key");
    Deno.env.set("EVOLUTION_API_FLAVOR", "v2");
    Deno.env.delete("EVOLUTION_INSTANCE_TOKEN");
    const { calls: comProvedor } = await withFetchSpy(run);
    assertEquals(comProvedor, [
      "https://evolution.test/chat/getBase64FromMediaMessage/inst",
    ]);
    assert(!comProvedor.includes(payloadUrl), "a URL arbitrária do payload não pode ser buscada");
  } finally {
    for (const k of ENV_KEYS) {
      const v = prev.get(k);
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
});
