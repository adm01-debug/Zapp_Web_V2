// Bloco 5 / etapa 047 — provedor FALSO, em memoria, para a suite rodar sem rede.
//
// Nao abre socket, nao le env de transporte e nao fala com a Evolution: registra
// cada item enviado e devolve o mesmo shape de resultado do adaptador real. E o
// que permite exercitar o contrato de provedor (e as edges de envio) sem tocar a
// internet — aceite das etapas 046/047.
//
// GUARDA: construir o fake fora de `DENO_ENV=test` LANCA. Sem isso, um ambiente
// real com o knob ligado passaria a "enviar" de mentira e a responder ok sem nada
// sair — falha que LIBERA. O factory recebe o env por parametro (default: o do
// processo) para o teste nao precisar mexer no env global.
//
// As capacidades sao declaradas como LITERAIS de proposito: o teste de paridade
// falha se o adaptador real mudar o teto de texto sem que o fake seja revisado.

import type { Capabilities, SendItem } from "../../messaging/evolution-go.ts";
import { readProviderEnv, type ProviderEnv } from "../env.ts";
import type { ProviderSendDeps, ProviderSendResult, WhatsAppProvider } from "../types.ts";

/** Modos do fake (mudam em runtime por `setMode`). */
export type FakeProviderMode =
  /** 200 com id unico por envio (default). */
  | "ok"
  /** 500 do transporte: erro transitorio. */
  | "500"
  /** 200 com `error` no corpo: o provedor recusou o envio. */
  | "error_body"
  /** 200 sem id de mensagem: envio sem prova de entrega. */
  | "sem_id";

/** Registro de um envio feito pelo fake. Nao guarda o valor de nenhuma credencial. */
export interface FakeSendRecord {
  item: SendItem;
  /** Se o chamador passou token de instancia (o valor NAO e registrado). */
  usedInstanceToken: boolean;
}

/** Provedor falso: cumpre o mesmo contrato e guarda o que foi enviado. */
export interface FakeProvider extends WhatsAppProvider {
  readonly id: "fake";
  /** Envios recebidos, na ordem. */
  readonly sent: FakeSendRecord[];
  mode(): FakeProviderMode;
  setMode(mode: FakeProviderMode): void;
  /** Limpa o registro de envios (nao muda o modo). */
  reset(): void;
}

export interface CreateFakeProviderOptions {
  /** Env do processo. Ausente = lido agora de `Deno.env` pelo factory. */
  env?: ProviderEnv;
  mode?: FakeProviderMode;
}

/** So existe provedor falso em ambiente de teste. Fora disso: lanca. */
export function assertTestEnv(env: ProviderEnv): void {
  if (env.DENO_ENV !== "test") {
    throw new Error(
      "provider fake exige DENO_ENV=test (recebido: " + (env.DENO_ENV ?? "ausente") + ")",
    );
  }
}

/** Capacidades declaradas do provedor falso (espelho do adaptador real). */
export function fakeCapabilities(): Capabilities {
  return {
    text: true,
    image: true,
    document: true,
    audio: true,
    ptt: true,
    maxTextChars: 65_536,
  };
}

export function createFakeProvider(options: CreateFakeProviderOptions = {}): FakeProvider {
  assertTestEnv(options.env ?? readProviderEnv());
  const sent: FakeSendRecord[] = [];
  let mode: FakeProviderMode = options.mode ?? "ok";

  return {
    id: "fake",
    sent,
    capabilities: fakeCapabilities,
    mode(): FakeProviderMode {
      return mode;
    },
    setMode(next: FakeProviderMode): void {
      mode = next;
    },
    reset(): void {
      sent.length = 0;
    },
    async send(item, deps: ProviderSendDeps): Promise<ProviderSendResult> {
      sent.push({
        item,
        usedInstanceToken:
          typeof deps.credentials.instanceToken === "string" &&
          deps.credentials.instanceToken.length > 0,
      });
      const messageId = "fake-" + sent.length;
      switch (mode) {
        case "500":
          return { ok: false, status: 500, error: "HTTP 500", body: { error: "fake_500" } };
        case "error_body":
          return { ok: false, status: 200, error: "fake_error", body: { error: "fake_error" } };
        case "sem_id":
          return { ok: false, status: 200, error: "missing_provider_message_id", body: {} };
        default:
          return { ok: true, status: 200, messageId, body: { key: { id: messageId } } };
      }
    },
  };
}
