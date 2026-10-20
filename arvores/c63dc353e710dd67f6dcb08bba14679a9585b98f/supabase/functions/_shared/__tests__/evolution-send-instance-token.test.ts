import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evoFetch } from "../evolution-send.ts";

// E15 (plano multi-conexão): evoFetch nunca mais deve cair silenciosamente
// no token global em rota de instância. Fixture: uma rota `go.auth==='instance'`
// real do tradutor — envio de texto vira POST /message/send/text/{instance}.
const V2_SEND_TEXT_PATH = "/message/sendText/PRINCIPAL";
const V2_SEND_BODY = { number: "5511999998888", text: "oi" };

function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    anteriores.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
  }
  const restaurar = () => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave); else Deno.env.set(chave, valor);
    }
  };
  const resultado = fn();
  if (resultado instanceof Promise) return resultado.finally(restaurar);
  restaurar();
}

Deno.test("evoFetch usa o instanceToken explicito quando informado (nunca a key global)", async () => {
  await withEnv({ EVOLUTION_API_FLAVOR: "go", EVOLUTION_INSTANCE_TOKEN: "token-env-fallback" }, async () => {
    let apikeyRecebida = "";
    const fetcherFalso = (_url: string, opcoes: RequestInit) => {
      apikeyRecebida = (opcoes.headers as Record<string, string>).apikey;
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    };
    await evoFetch(
      "https://go.example.com", "admin-key-global", V2_SEND_TEXT_PATH, V2_SEND_BODY,
      fetcherFalso, "POST", undefined, "token-da-instancia-x",
    );
    assertEquals(apikeyRecebida, "token-da-instancia-x");
  });
});

Deno.test("evoFetch cai no fallback EVOLUTION_INSTANCE_TOKEN quando instanceToken nao vem (transicao pre-E10)", async () => {
  await withEnv({ EVOLUTION_API_FLAVOR: "go", EVOLUTION_INSTANCE_TOKEN: "token-env-fallback" }, async () => {
    let apikeyRecebida = "";
    const fetcherFalso = (_url: string, opcoes: RequestInit) => {
      apikeyRecebida = (opcoes.headers as Record<string, string>).apikey;
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    };
    await evoFetch("https://go.example.com", "admin-key-global", V2_SEND_TEXT_PATH, V2_SEND_BODY, fetcherFalso);
    assertEquals(apikeyRecebida, "token-env-fallback");
  });
});

Deno.test("evoFetch falha explicito (400) quando nao ha instanceToken nem fallback — nunca usa a key global", async () => {
  await withEnv({ EVOLUTION_API_FLAVOR: "go", EVOLUTION_INSTANCE_TOKEN: undefined }, async () => {
    let fetcherChamado = false;
    const fetcherFalso = () => {
      fetcherChamado = true;
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    };
    const resposta = await evoFetch("https://go.example.com", "admin-key-global", V2_SEND_TEXT_PATH, V2_SEND_BODY, fetcherFalso);
    assertEquals(fetcherChamado, false);
    assertEquals(resposta.status, 400);
    const corpo = await resposta.json();
    assertEquals(corpo.error, "instance token ausente");
  });
});
