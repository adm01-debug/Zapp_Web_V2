// Bloco 5 / etapa 046 — adaptador do transporte Evolution atras do contrato de provedor.
//
// Nao reimplementa nada: delega para o kernel de envio (`messaging/evolution-go.ts`),
// que ja e o ponto unico de envio outbound. A traducao v2->GO, a presenca
// humanizada e a extracao do `messageId` continuam LA; este arquivo so troca o
// shape neutro das dependencias pelo shape do transporte.
//
// Fail-closed: sem `baseUrl` a conexao esta mal configurada e o envio NEGA, em vez
// de montar uma URL relativa e deixar o `fetch` estourar com erro obscuro.

import {
  capabilities,
  type SendDeps,
  send as sendViaEvolution,
} from "../../messaging/evolution-go.ts";
import type {
  ProviderSendDeps,
  ProviderSendResult,
  WhatsAppProvider,
} from "../types.ts";

/** Conexao mal configurada (nao e falha do provedor: nao houve tentativa de envio). */
export class ProviderMisconfiguredError extends Error {
  readonly code = "provider_misconfigured";
  constructor(message: string) {
    super(message);
    this.name = "ProviderMisconfiguredError";
  }
}

/** Traduz as credenciais neutras para o que o kernel do transporte espera. */
function toTransportDeps(deps: ProviderSendDeps, baseUrl: string): SendDeps {
  const { credentials } = deps;
  return {
    fetch: deps.fetch,
    evolutionUrl: baseUrl,
    evolutionKey: credentials.apiKey ?? "",
    ...(credentials.instanceToken !== undefined
      ? { instanceToken: credentials.instanceToken }
      : {}),
    ...(credentials.flavor !== undefined ? { flavor: credentials.flavor } : {}),
    ...(deps.signal !== undefined ? { signal: deps.signal } : {}),
    ...(deps.presenceTimeoutMs !== undefined
      ? { presenceTimeoutMs: deps.presenceTimeoutMs }
      : {}),
  };
}

/** Provedor `evolution` — o transporte que atende hoje. */
export function createEvolutionProvider(): WhatsAppProvider {
  return {
    id: "evolution",
    capabilities,
    async send(item, deps): Promise<ProviderSendResult> {
      const baseUrl = deps.credentials.baseUrl?.trim() ?? "";
      if (!baseUrl) {
        throw new ProviderMisconfiguredError(
          "conexão Evolution sem baseUrl: envio negado",
        );
      }
      const result = await sendViaEvolution(item, toTransportDeps(deps, baseUrl));
      return {
        ok: result.ok,
        status: result.status,
        ...(result.messageId !== undefined ? { messageId: result.messageId } : {}),
        ...(result.error !== undefined ? { error: result.error } : {}),
        body: result.body,
      };
    },
  };
}
