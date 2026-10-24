import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evoFetch } from "../evolution-send.ts";

// E15 (plano multi-conexão): evoFetch nunca mais deve cair silenciosamente
// no token global em rota de instância. Fixture: uma rota `go.auth==='instance'`
// real do tradutor — envio de texto vira POST /message/send/text/{instance}.
const V2_SEND_TEXT_PATH = "/message/sendText/PRINCIPAL";
const V2_SEND_BODY = { number: "5511999998888", text: "oi" };

// TRA-002 (#18): uma conexão que NÃO é a padrão. O nome vai no path v2 e o
// tradutor GO o descarta (`/send/text`), então é justamente na hora de escolher
// o `apikey` que o vínculo com a conexão se perde — o defeito do item.
const V2_SEND_TEXT_OUTRA = "/message/sendText/SECUNDARIA";
// Segunda rota de instância (presença), para o teste não depender só do envio.
const V2_PRESENCE_OUTRA = "/chat/updatePresence/SECUNDARIA";

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

function fetcherEspiao() {
  const chamadas: { url: string; apikey: string }[] = [];
  const fetcher = (url: string, opcoes: RequestInit) => {
    chamadas.push({ url, apikey: (opcoes.headers as Record<string, string>).apikey });
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  };
  return { chamadas, fetcher };
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

Deno.test("evoFetch cai no fallback EVOLUTION_INSTANCE_TOKEN quando instanceToken nao vem (transicao pre-E10) e o path e o da instancia PADRAO", async () => {
  await withEnv({
    EVOLUTION_API_FLAVOR: "go",
    EVOLUTION_INSTANCE_TOKEN: "token-env-fallback",
    // O fallback do env é a credencial da instância PADRÃO: a comparação do
    // nome no path com EVOLUTION_INSTANCE_NAME é o que o autoriza (E15).
    EVOLUTION_INSTANCE_NAME: "PRINCIPAL",
  }, async () => {
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

// ---------------------------------------------------------------------------
// TRA-002 (#18) — a credencial global da instância padrão não vale para outra
// conexão. `EVOLUTION_INSTANCE_TOKEN` é o token da PRINCIPAL; usá-lo numa rota
// de SECUNDARIA faz a GO selecionar a instância errada (o nome no path some na
// tradução), então o envio da conexão B sairia pela conexão A.
// ---------------------------------------------------------------------------

Deno.test("TRA-002: rota de OUTRA conexao nao usa a credencial global da padrao (envio)", async () => {
  await withEnv({
    EVOLUTION_API_FLAVOR: "go",
    EVOLUTION_INSTANCE_NAME: "PRINCIPAL",
    EVOLUTION_INSTANCE_TOKEN: "token-da-PRINCIPAL",
  }, async () => {
    const { chamadas, fetcher } = fetcherEspiao();
    const resposta = await evoFetch("https://go.example.com", "admin-key-global", V2_SEND_TEXT_OUTRA, V2_SEND_BODY, fetcher);
    assertEquals(chamadas.length, 0, "nenhum POST pode sair sem o token da própria conexão");
    assertEquals(resposta.status, 400);
    const corpo = await resposta.json();
    assertEquals(corpo.error, "instance token ausente");
  });
});

Deno.test("TRA-002: rota de OUTRA conexao nao usa a credencial global da padrao (presenca)", async () => {
  await withEnv({
    EVOLUTION_API_FLAVOR: "go",
    EVOLUTION_INSTANCE_NAME: "PRINCIPAL",
    EVOLUTION_INSTANCE_TOKEN: "token-da-PRINCIPAL",
  }, async () => {
    const { chamadas, fetcher } = fetcherEspiao();
    const resposta = await evoFetch(
      "https://go.example.com", "admin-key-global", V2_PRESENCE_OUTRA,
      { number: "5511999998888", presence: "composing" }, fetcher,
    );
    assertEquals(chamadas.length, 0);
    assertEquals(resposta.status, 400);
    assertEquals((await resposta.json()).error, "instance token ausente");
  });
});

Deno.test("TRA-002: o token explicito da propria conexao continua valendo fora da padrao", async () => {
  await withEnv({
    EVOLUTION_API_FLAVOR: "go",
    EVOLUTION_INSTANCE_NAME: "PRINCIPAL",
    EVOLUTION_INSTANCE_TOKEN: "token-da-PRINCIPAL",
  }, async () => {
    const { chamadas, fetcher } = fetcherEspiao();
    await evoFetch(
      "https://go.example.com", "admin-key-global", V2_SEND_TEXT_OUTRA, V2_SEND_BODY,
      fetcher, "POST", undefined, "token-da-SECUNDARIA",
    );
    assertEquals(chamadas.length, 1);
    assertEquals(chamadas[0].apikey, "token-da-SECUNDARIA");
    assertEquals(chamadas[0].url, "https://go.example.com/send/text");
  });
});

Deno.test("TRA-002: sem EVOLUTION_INSTANCE_NAME o fallback nao vale para ninguem (nao ha padrao comprovada)", async () => {
  await withEnv({
    EVOLUTION_API_FLAVOR: "go",
    EVOLUTION_INSTANCE_NAME: undefined,
    EVOLUTION_INSTANCE_TOKEN: "token-da-PRINCIPAL",
  }, async () => {
    const { chamadas, fetcher } = fetcherEspiao();
    const resposta = await evoFetch("https://go.example.com", "admin-key-global", V2_SEND_TEXT_PATH, V2_SEND_BODY, fetcher);
    assertEquals(chamadas.length, 0);
    assertEquals(resposta.status, 400);
    assertEquals((await resposta.json()).error, "instance token ausente");
  });
});
