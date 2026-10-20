// Bloco 5 / etapa 046 — registry de provedores de WhatsApp (evolution | cloud | fake).
//
// Ponto unico que decide QUAL provedor atende um envio. Toda decisao e FAIL-CLOSED:
//   1. nada e escolhido por engano — id desconhecido NEGA, nao cai no padrao;
//   2. `cloud` (WhatsApp Cloud API / Meta) esta reservado mas ainda nao tem
//      implementacao (etapa 048, gated por conta Meta Business): pedir o provedor
//      oficial NEGA, nunca vira um envio em silencio pelo Evolution;
//   3. `fake` so existe com `DENO_ENV=test`; pedir fora disso NEGA. Sem isso um
//      ambiente real "enviaria" de mentira e responderia ok sem nada sair — falha
//      que LIBERA (o pior tipo aqui: mensagem nao entregue dada como entregue);
//   4. `PROVIDER_UNDER_TEST` (knob do V3) so vale com `DENO_ENV=test`: presente fora
//      de teste ele NEGA em vez de ser ignorado (ignorar seria mandar mensagem real
//      achando que se esta em teste).
//
// O env entra por parametro (default: lido do processo agora), entao o teste exercita
// cada caso sem mexer no env global — e o caminho real continua sendo o default.

import { readProviderEnv, type ProviderEnv } from "./env.ts";
import { createFakeProvider, type FakeProvider } from "./fake/index.ts";
import { createEvolutionProvider } from "./evolution/index.ts";
import { ProviderResolutionError, type WhatsAppProvider } from "./types.ts";

export interface ResolveProviderOptions {
  /** Env do processo. Ausente = lido de `Deno.env` agora (caminho de producao). */
  env?: ProviderEnv;
  /** Id pedido pelo chamador (conexao). Ausente = padrao (`evolution`). */
  requested?: string;
}

/** Por que o provedor devolvido foi escolhido (auditoria/diagnostico). */
export type ProviderSelectionSource = "default" | "requested" | "test-override";

export interface ResolvedProvider {
  provider: WhatsAppProvider;
  source: ProviderSelectionSource;
}

const evolutionProvider: WhatsAppProvider = createEvolutionProvider();

/** Fake unico do processo de teste: os envios se acumulam entre resolucoes. */
let fakeProvider: FakeProvider | null = null;

function sharedFakeProvider(env: ProviderEnv): FakeProvider {
  if (!fakeProvider) fakeProvider = createFakeProvider({ env });
  return fakeProvider;
}

/** Resolve o provedor de WhatsApp. Nega (lanca) em tudo que nao esta liberado. */
export function resolveWhatsAppProvider(options: ResolveProviderOptions = {}): ResolvedProvider {
  const env = options.env ?? readProviderEnv();
  const testEnv = env.DENO_ENV === "test";
  const override = env.PROVIDER_UNDER_TEST?.trim();

  if (override) {
    if (!testEnv) {
      throw new ProviderResolutionError(
        "test_override_requires_test_env",
        "PROVIDER_UNDER_TEST so vale com DENO_ENV=test: envio negado",
      );
    }
    return { provider: providerForId(override, testEnv, env), source: "test-override" };
  }

  if (options.requested === undefined) {
    return { provider: evolutionProvider, source: "default" };
  }
  return { provider: providerForId(options.requested, testEnv, env), source: "requested" };
}

function providerForId(id: string, testEnv: boolean, env: ProviderEnv): WhatsAppProvider {
  switch (id) {
    case "evolution":
      return evolutionProvider;
    case "fake":
      if (!testEnv) {
        throw new ProviderResolutionError(
          "provider_not_allowed_in_env",
          "provider fake so existe com DENO_ENV=test: envio negado",
        );
      }
      return sharedFakeProvider(env);
    case "cloud":
      throw new ProviderResolutionError(
        "provider_unavailable",
        "provider cloud (WhatsApp Cloud API) ainda nao implementado (etapa 048)",
      );
    default:
      throw new ProviderResolutionError("provider_unknown", "provider desconhecido: " + id);
  }
}
