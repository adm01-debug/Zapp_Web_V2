import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  goTokenMatches,
  instanceNameFromV2Path,
  instanceTokenCacheSize,
  isInstanceNameValid,
  resetInstanceTokenCache,
  resolveInstanceToken,
  TOKEN_CACHE_MAX_ENTRIES,
  type InstanceTokenClient,
} from "../evolution-instance-token.ts";

// TRA-002 — resolvedor único do token de instância. Cada conexão usa o token
// que está no Vault (get_instance_token); a padrão ainda pode vir do fallback
// de transição; qualquer outra sem token devolve null — nunca a credencial
// de outra instância nem a key global.

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

/** Client mínimo que responde get_instance_token a partir de um mapa. */
function clientFalso(tokens: Record<string, string | null>): { client: InstanceTokenClient; chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    chamadas,
    client: {
      rpc: (fn: string, args?: Record<string, unknown>) => {
        chamadas.push(fn);
        if (fn !== "get_instance_token") return Promise.resolve({ data: null, error: { message: "rpc inesperada" } });
        const inst = String(args?.p_instance_id ?? "");
        return Promise.resolve({ data: tokens[inst] ?? null, error: null });
      },
    },
  };
}

Deno.test("resolveInstanceToken devolve o token do Vault da instancia pedida", async () => {
  resetInstanceTokenCache();
  const { client } = clientFalso({ INST_A: "token-a", INST_B: "token-b" });
  assertEquals(await resolveInstanceToken(client, "INST_A"), "token-a");
  assertEquals(await resolveInstanceToken(client, "INST_B"), "token-b");
});

Deno.test("resolveInstanceToken usa o fallback EVOLUTION_INSTANCE_TOKEN apenas para a instancia padrao", async () => {
  resetInstanceTokenCache();
  await withEnv({ EVOLUTION_INSTANCE_NAME: "PRINCIPAL", EVOLUTION_INSTANCE_TOKEN: "token-env" }, async () => {
    const { client } = clientFalso({});
    assertEquals(await resolveInstanceToken(client, "PRINCIPAL"), "token-env");
  });
});

// TRA-002 (regressao): a secundaria sem token no Vault devolve null — o
// chamador falha explicito em vez de emprestar a credencial da padrao.
Deno.test("resolveInstanceToken devolve null para instancia nao-padrao sem token (TRA-002)", async () => {
  resetInstanceTokenCache();
  await withEnv({ EVOLUTION_INSTANCE_NAME: "PRINCIPAL", EVOLUTION_INSTANCE_TOKEN: "token-env" }, async () => {
    const { client } = clientFalso({});
    assertEquals(await resolveInstanceToken(client, "SECUNDARIA"), null);
  });
});

Deno.test("resolveInstanceToken cacheia a resolucao por instancia", async () => {
  resetInstanceTokenCache();
  const { client, chamadas } = clientFalso({ INST_A: "token-a" });
  await resolveInstanceToken(client, "INST_A");
  await resolveInstanceToken(client, "INST_A");
  assertEquals(chamadas.length, 1);
});

Deno.test("instanceNameFromV2Path extrai o ultimo segmento do path v2", () => {
  assertEquals(instanceNameFromV2Path("/message/sendText/INST_A"), "INST_A");
  assertEquals(instanceNameFromV2Path("/chat/findContacts/minha-inst?x=1"), "minha-inst");
  assertEquals(instanceNameFromV2Path("/instance/fetchInstances"), "fetchInstances");
});

// ── Gate do webhook (goTokenMatches) ────────────────────────────────────────

Deno.test("goTokenMatches aceita A e B cada uma com o proprio token (TRA-002)", async () => {
  const resolver = async (name: string) => ({ INST_A: "token-a", INST_B: "token-b" } as Record<string, string>)[name] ?? null;
  assertEquals(await goTokenMatches({ instanceName: "INST_A", instanceToken: "token-a" }, resolver), true);
  assertEquals(await goTokenMatches({ instanceName: "INST_B", instanceToken: "token-b" }, resolver), true);
});

// TRA-002 (regressao): o token de A num evento de B e rejeitado — antes o
// webhook comparava contra um unico global e deixava passar.
Deno.test("goTokenMatches rejeita token trocado entre instancias (TRA-002)", async () => {
  const resolver = async (name: string) => ({ INST_A: "token-a", INST_B: "token-b" } as Record<string, string>)[name] ?? null;
  assertEquals(await goTokenMatches({ instanceName: "INST_B", instanceToken: "token-a" }, resolver), false);
  assertEquals(await goTokenMatches({ instanceName: "INST_A", instanceToken: "token-b" }, resolver), false);
});

Deno.test("goTokenMatches rejeita corpo sem token, instancia desconhecida ou sem credencial", async () => {
  const resolver = async () => null;
  assertEquals(await goTokenMatches({ instanceName: "INST_A" }, resolver), false);
  assertEquals(await goTokenMatches({ instanceName: "INST_A", instanceToken: "token-a" }, resolver), false);
  assertEquals(await goTokenMatches({ instanceName: "FANTASMA", instanceToken: "token-x" }, resolver), false);
});

Deno.test("goTokenMatches aceita o campo `instance` (shape v2) como nome da instancia", async () => {
  const resolver = async (name: string) => name === "INST_V2" ? "token-v2" : null;
  assertEquals(await goTokenMatches({ instance: "INST_V2", instanceToken: "token-v2" }, resolver), true);
});

// ── Endurecimento do gate pré-autenticação (recusa da rodada 1) ─────────────
// O instanceName do corpo é input NÃO autenticado: não pode inflar o cache,
// não pode virar miss cacheado e não pode chegar ao RPC fora do formato.

Deno.test("tokenCache: N nomes distintos nao ultrapassam o teto", async () => {
  resetInstanceTokenCache();
  const { client } = clientFalso({});
  for (let i = 0; i < TOKEN_CACHE_MAX_ENTRIES + 50; i++) {
    await resolveInstanceToken(client, `flood_${i}`);
  }
  assertEquals(instanceTokenCacheSize(), TOKEN_CACHE_MAX_ENTRIES);
});

Deno.test("goTokenMatches rejeita nome fora do formato de instance_id sem chamar o RPC", async () => {
  resetInstanceTokenCache();
  const { client, chamadas } = clientFalso({ INST_A: "token-a" });
  const resolver = (name: string) => resolveInstanceToken(client, name);
  assertEquals(await goTokenMatches({ instanceName: "nome com espaco!!", instanceToken: "x" }, resolver), false);
  assertEquals(await goTokenMatches({ instanceName: "../etc/passwd", instanceToken: "x" }, resolver), false);
  assertEquals(await goTokenMatches({ instanceName: "a".repeat(65), instanceToken: "x" }, resolver), false);
  assertEquals(await goTokenMatches({ instanceName: "", instanceToken: "x" }, resolver), false);
  assertEquals(await goTokenMatches({ instanceToken: "x" }, resolver), false);
  assertEquals(chamadas.length, 0);
  assertEquals(instanceTokenCacheSize(), 0);
});

Deno.test("isInstanceNameValid aceita os formatos reais de instance_id", () => {
  assertEquals(isInstanceNameValid("meu_nome_123456"), true); // generateInstanceName
  assertEquals(isInstanceNameValid("PRINCIPAL"), true); // fallback do env
  assertEquals(isInstanceNameValid("e2e-local"), true); // ids com hifen
  assertEquals(isInstanceNameValid("nome inválido"), false);
  assertEquals(isInstanceNameValid("a".repeat(65)), false);
  assertEquals(isInstanceNameValid(""), false);
});

Deno.test("resolveInstanceToken com cacheMiss:false nao grava miss de input nao autenticado", async () => {
  resetInstanceTokenCache();
  const { client, chamadas } = clientFalso({ inst_a: "token-a" });
  // miss NAO entra no cache — e repete no RPC a cada chamada
  assertEquals(await resolveInstanceToken(client, "fantasma_1", { cacheMiss: false }), null);
  assertEquals(instanceTokenCacheSize(), 0);
  assertEquals(await resolveInstanceToken(client, "fantasma_1", { cacheMiss: false }), null);
  assertEquals(chamadas.length, 2);
  // hit continua cacheado mesmo com cacheMiss:false
  assertEquals(await resolveInstanceToken(client, "inst_a", { cacheMiss: false }), "token-a");
  assertEquals(await resolveInstanceToken(client, "inst_a", { cacheMiss: false }), "token-a");
  assertEquals(chamadas.length, 3);
  assertEquals(instanceTokenCacheSize(), 1);
});

Deno.test("resolveInstanceToken (caminho autenticado) mantem cache negativo com TTL curto", async () => {
  resetInstanceTokenCache();
  const { client, chamadas } = clientFalso({});
  assertEquals(await resolveInstanceToken(client, "fantasma_1"), null);
  assertEquals(await resolveInstanceToken(client, "fantasma_1"), null);
  assertEquals(chamadas.length, 1);
  assertEquals(instanceTokenCacheSize(), 1);
});
