// SL-010b / IA-009 — kill switch nas Edge Functions ElevenLabs de voz/áudio.
//
// Defeito provado no cartão (medido por `git grep api.elevenlabs.io`): estas 9
// funções falavam com a ElevenLabs direto e NÃO liam `feature_flags` no servidor
// — `ai.capability.voice`/`ai.provider.elevenlabs` desligadas não as paravam. As
// duas funções de token (agent/scribe) são o pior caso: o token emitido aqui é o
// que permite a sessão de voz começar.
//
// O que cada teste fixa sobre o handler REAL (vermelho sem o guard: o provedor
// era chamado com a flag desligada):
//   (a) `ai.capability.voice` = false (linha existente e falsa) → 503 com
//       `error.code === "AI_DISABLED"` e ZERO fetch a `api.elevenlabs.io`;
//   (b) `ai.provider.elevenlabs` = false (capacidade ligada) → idem;
//   (c) chave AUSENTE (falha fechada, desenho §2.5) → idem;
//   (d) as duas LIGADAS → o caminho de hoje segue e o provedor recebe 1 fetch
//       (a trava não interfere no caminho padrão).
//
// Sem rede real nem banco: `globalThis.fetch` é substituído por um espião que
// responde a `/auth/v1/user` (requireAuth), à RPC `consume_rate_limit`
// (enforceRateLimit), a `/rest/v1/feature_flags` (kill switch — fiel ao
// PostgREST: devolve SÓ as linhas que existem) e conta as chamadas a
// `api.elevenlabs.io`.
//
// Run with:
//   deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//     --allow-net=127.0.0.1 supabase/functions/_shared/ai-kill-switch-elevenlabs.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { handleElevenLabsTts } from "../elevenlabs-tts/index.ts";
import { handleElevenLabsTtsStream } from "../elevenlabs-tts-stream/index.ts";
import { handleElevenLabsSfx } from "../elevenlabs-sfx/index.ts";
import { handleElevenLabsSts } from "../elevenlabs-sts/index.ts";
import { handleElevenLabsDialogue } from "../elevenlabs-dialogue/index.ts";
import { handleVoiceDesignRequest } from "../elevenlabs-voice-design/index.ts";
import { handleVoiceChanger } from "../voice-changer/index.ts";
import { handleElevenLabsAgentToken } from "../elevenlabs-agent-token/index.ts";
import { handleElevenLabsScribeToken } from "../elevenlabs-scribe-token/index.ts";

const CHAVE_VOZ = "ai.capability.voice";
const CHAVE_PROVEDOR = "ai.provider.elevenlabs";
const PROVEDOR = "api.elevenlabs.io";
const USER_ID = "30000000-0000-4000-8000-00000000000c";

type Handler = (req: Request) => Promise<Response>;

interface Contadores {
  provedor: number;
}

function jsonResp(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Stuba o `fetch` global e conta as chamadas ao provedor. `flags` é o conteúdo
 * de `feature_flags`: chave fora do mapa = linha ausente (o stub só devolve o
 * que existe, como o PostgREST). `flagsStatus >= 400` simula leitura falhando.
 */
function stubFetch(flags: Record<string, boolean>, flagsStatus = 200) {
  const contadores: Contadores = { provedor: 0 };
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    const u = new URL(url);

    if (u.hostname === PROVEDOR || url.includes(PROVEDOR)) {
      contadores.provedor++;
      // Corpo JSON serve para `.json()` (tokens, voice-design) e para
      // `.arrayBuffer()` (tts/sts/voice-changer devolvem os bytes ao chamador).
      return Promise.resolve(jsonResp({ token: "tok-de-teste", previews: [] }));
    }
    if (u.pathname.endsWith("/auth/v1/user")) {
      return Promise.resolve(jsonResp({ id: USER_ID, aud: "authenticated" }));
    }
    if (u.pathname.includes("/rest/v1/rpc/consume_rate_limit")) {
      return Promise.resolve(jsonResp([{ allowed: true, remaining: 29 }]));
    }
    if (u.pathname.includes("/rest/v1/rpc/resolve_network_policy")) {
      return Promise.resolve(jsonResp([{ allowed: true }]));
    }
    if (u.pathname.endsWith("/rest/v1/feature_flags")) {
      if (flagsStatus >= 400) {
        return Promise.resolve(jsonResp({ message: "indisponivel" }, flagsStatus));
      }
      const raw = u.searchParams.get("key") ?? "";
      const m = /^in\.\((.*)\)$/.exec(raw);
      const pedidas = m
        ? m[1].split(",").map((k) => k.trim()).filter((k) => k !== "")
        : [];
      const linhas = pedidas
        .filter((key) => Object.prototype.hasOwnProperty.call(flags, key))
        .map((key) => ({ key, enabled: flags[key] }));
      return Promise.resolve(jsonResp(linhas));
    }
    return Promise.reject(new Error(`fetch nao esperado no teste: ${url}`));
  }) as typeof fetch;
  return { contadores, restaurar: () => { globalThis.fetch = original; } };
}

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID",
] as const;

const ENV_OK: Record<(typeof ENV_KEYS)[number], string> = {
  SUPABASE_URL: "https://stub.supabase.co",
  SUPABASE_ANON_KEY: "anon-key-de-teste",
  SUPABASE_SERVICE_ROLE_KEY: "service-key-de-teste",
  ELEVENLABS_API_KEY: "xi-key-de-teste",
  ELEVENLABS_AGENT_ID: "agent-de-teste",
};

function withEnv(fn: () => Promise<void>) {
  const salvo = ENV_KEYS.map((k) => [k, Deno.env.get(k)] as const);
  for (const key of ENV_KEYS) Deno.env.set(key, ENV_OK[key]);
  return fn().finally(() => {
    for (const [key, value] of salvo) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  });
}

function reqJson(nome: string, corpo: unknown): Request {
  return new Request(`https://stub.supabase.co/functions/v1/${nome}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer token-de-teste" },
    body: JSON.stringify(corpo),
  });
}

function reqSemCorpo(nome: string): Request {
  return new Request(`https://stub.supabase.co/functions/v1/${nome}`, {
    method: "POST",
    headers: { Authorization: "Bearer token-de-teste" },
  });
}

function reqForm(nome: string, campos: Record<string, string>): Request {
  const fd = new FormData();
  // IA-122/IA-128 (dia/2026-10-09, independente deste cartão): o elevenlabs-sts
  // agora prova a ASSINATURA real do áudio (magic bytes) antes de tocar no
  // provedor — "ID3" (cabeçalho mp3) é reconhecido por sniffStsAudioFormat;
  // bytes arbitrários (ex.: 9,9,9) seriam recusados com 415 ANTES do kill
  // switch, o que testaria a validação de upload, não o kill switch.
  fd.append("audio", new File([new Uint8Array([0x49, 0x44, 0x33, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])], "audio.mp3", { type: "audio/mpeg" }));
  for (const [campo, valor] of Object.entries(campos)) fd.append(campo, valor);
  return new Request(`https://stub.supabase.co/functions/v1/${nome}`, {
    method: "POST",
    headers: { Authorization: "Bearer token-de-teste" },
    body: fd,
  });
}

interface Caso {
  nome: string;
  handler: Handler;
  /** Requisição válida que, com a IA ligada, chega ao provedor. */
  request: () => Request;
}

const CASOS: Caso[] = [
  {
    nome: "elevenlabs-tts",
    handler: handleElevenLabsTts,
    request: () => reqJson("elevenlabs-tts", { text: "ola mundo" }),
  },
  {
    nome: "elevenlabs-tts-stream",
    handler: handleElevenLabsTtsStream,
    request: () => reqJson("elevenlabs-tts-stream", { text: "ola mundo" }),
  },
  {
    nome: "elevenlabs-sfx",
    handler: handleElevenLabsSfx,
    request: () => reqJson("elevenlabs-sfx", { prompt: "trovao distante" }),
  },
  {
    nome: "elevenlabs-sts",
    handler: handleElevenLabsSts,
    request: () => reqForm("elevenlabs-sts", { voiceId: "voz-alvo" }),
  },
  {
    nome: "elevenlabs-dialogue",
    handler: handleElevenLabsDialogue,
    request: () =>
      reqJson("elevenlabs-dialogue", {
        script: [
          { voice_id: "voz-a", text: "Bom dia" },
          { voice_id: "voz-b", text: "Boa tarde" },
        ],
      }),
  },
  {
    nome: "elevenlabs-voice-design",
    handler: handleVoiceDesignRequest,
    request: () => reqJson("elevenlabs-voice-design", { action: "preview", description: "Tom calmo" }),
  },
  {
    nome: "voice-changer",
    handler: handleVoiceChanger,
    request: () => reqForm("voice-changer", { voice_preset: "grave" }),
  },
  {
    nome: "elevenlabs-agent-token",
    handler: handleElevenLabsAgentToken,
    request: () => reqSemCorpo("elevenlabs-agent-token"),
  },
  {
    nome: "elevenlabs-scribe-token",
    handler: handleElevenLabsScribeToken,
    request: () => reqSemCorpo("elevenlabs-scribe-token"),
  },
];

/** Cenários que NÃO podem tocar o provedor: cada um espera 503 + AI_DISABLED. */
const NEGADOS: Array<{ rotulo: string; flags: Record<string, boolean>; flagsStatus?: number }> = [
  { rotulo: "capacidade voice desligada", flags: { [CHAVE_VOZ]: false, [CHAVE_PROVEDOR]: true } },
  { rotulo: "provedor elevenlabs desligado", flags: { [CHAVE_VOZ]: true, [CHAVE_PROVEDOR]: false } },
  { rotulo: "chaves ausentes (falha fechada)", flags: {} },
  { rotulo: "leitura de feature_flags falhando", flags: { [CHAVE_VOZ]: true, [CHAVE_PROVEDOR]: true }, flagsStatus: 500 },
];

for (const caso of CASOS) {
  Deno.test(`SL-010b/IA-009 ${caso.nome}: flag desligada nega (503 AI_DISABLED, zero fetch); ligada segue`, async () => {
    await withEnv(async () => {
      for (const negado of NEGADOS) {
        const stub = stubFetch(negado.flags, negado.flagsStatus ?? 200);
        try {
          const res = await caso.handler(caso.request());
          assertEquals(
            res.status,
            503,
            `${caso.nome} com ${negado.rotulo} tinha de devolver 503, veio ${res.status}`,
          );
          const corpo = await res.json() as { error?: { code?: string; message?: string } };
          assertEquals(
            corpo.error?.code,
            "AI_DISABLED",
            `${caso.nome} com ${negado.rotulo} tinha de vir com error.code AI_DISABLED`,
          );
          assertEquals(
            stub.contadores.provedor,
            0,
            `${caso.nome} com ${negado.rotulo} NAO pode chamar api.elevenlabs.io`,
          );
        } finally {
          stub.restaurar();
        }
      }

      // Caminho ligado: a trava não pode interferir — 1 fetch ao provedor.
      const ligado = stubFetch({ [CHAVE_VOZ]: true, [CHAVE_PROVEDOR]: true });
      try {
        const res = await caso.handler(caso.request());
        assertEquals(
          res.status,
          200,
          `${caso.nome} com as chaves ligadas tinha de seguir o caminho de hoje, veio ${res.status}`,
        );
        assertEquals(
          ligado.contadores.provedor,
          1,
          `${caso.nome} ligado tinha de chegar ao provedor exatamente uma vez`,
        );
      } finally {
        ligado.restaurar();
      }
    });
  });
}
