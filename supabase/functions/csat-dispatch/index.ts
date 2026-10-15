/**
 * Edge `csat-dispatch` — worker de cron que ENTREGA os convites de CSAT vencidos.
 *
 * Feito o agendamento pela `csat-auto-send` (linha em `csat_surveys` com
 * `status='scheduled'` e `send_at`), ninguém enviava: este é o executor. O
 * atraso é respeitado pela RPC `claim_due_csat_surveys` (migration
 * `20261015210626_csat_pipeline.sql`, cartão t_69726cda), que só devolve o que
 * já venceu (`send_at <= now()`), dentro do cooldown de 30 dias e com o contato
 * elegível (não apagado, consentimento não revogado).
 *
 * O envio usa o pipeline OFICIAL de saída, o mesmo da mensagem de ausência
 * (`_shared/evolution-webhook-messages.ts`) e do worker `message-delivery`:
 *   INSERT idempotente em `messages` (`client_message_id` determinístico +
 *   `status='sending'`) → `claim_outbound_message` (service_role) → provedor →
 *   `complete_outbound_message`. Nada de POST solto sem fila durável.
 *
 * Idempotência: o `client_message_id` é DERIVADO do id do convite
 * (`csatClientMessageId`), nunca sorteado. Reprocessar o mesmo convite cai na
 * UNIQUE `ux_messages_contact_client_message_id` (23505): a linha existente é
 * reaproveitada (retoma a entrega) e NUNCA sai um segundo POST para o mesmo
 * convite.
 *
 * Autorização: `x-cron-secret` igual a `CRON_SECRET` (env), comparação em tempo
 * constante; `CRON_SECRET` vazio/ausente NÃO habilita o caminho do cron
 * (fail-closed). Também aceita a service-role key no Bearer (rodada manual/
 * operação). Nenhum outro chamador passa — a autorização acontece ANTES de
 * criar o cliente service role e antes de qualquer leitura.
 *
 * `agent_id` da mensagem: o atendente do convite, se ainda tiver perfil ativo;
 * senão o dono da conexão. Sem nenhum perfil ativo o convite NÃO sai
 * (fail-closed: o pipeline exige perfil ativo e nunca se empresta o de outra
 * pessoa) e vira `failed`.
 *
 * Falha do provedor/recibo: `status='failed'` no convite e o MOTIVO vai no log
 * estruturado e no corpo da resposta (`failures[].motivo`) — `csat_surveys` não
 * tem coluna de erro (a do PK-03 não criou uma) e gravar diagnóstico em
 * `feedback` misturaria o diagnóstico com a resposta do contato.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  errorResponse,
  handleCors,
  internalErrorResponse,
  jsonResponse,
  Logger,
} from "../_shared/validation.ts";
import { timingSafeEqual } from "../_shared/hmac-validation.ts";
import { evoFetch, extractMessageId } from "../_shared/evolution-send.ts";
import { resolveInstanceToken } from "../_shared/evolution-instance-token.ts";
import { EFFECT_MESSAGE_SEND, enqueueEffectReconcile } from "../_shared/effect-reconcile.ts";

/** Header dedicado da credencial de máquina do cron. */
export const CRON_SECRET_HEADER = "x-cron-secret";
/** Env que habilita o caminho do cron; vazio/ausente = cron desligado (fail-closed). */
export const CRON_SECRET_ENV = "CRON_SECRET";
/** `delivery_claimed_by` da fila de saída — identifica este produtor no claim. */
export const CSAT_DISPATCH_WORKER = "edge:csat-dispatch";
/** Teto do lote por passada (a RPC também apara em 200). */
export const CSAT_DISPATCH_MAX_LIMIT = 200;
/** Tamanho do lote quando `CSAT_DISPATCH_LIMIT` não vem. */
export const CSAT_DISPATCH_DEFAULT_LIMIT = 50;
/** Lease do claim oficial, em segundos (mesmo valor do `message-delivery`). */
export const CSAT_DISPATCH_LEASE_SECONDS = 90;
/** RPC do PK-03 que marca `sent` e devolve o lote vencido. */
export const CSAT_CLAIM_RPC = "claim_due_csat_surveys";
/** Máximo de motivos devolvidos no corpo (o log guarda todos). */
const MAX_MOTIVOS_NA_RESPOSTA = 20;

type Linha = Record<string, unknown>;

type ResultadoDoConvite =
  | { resultado: "enviado"; survey_id: string }
  | { resultado: "aguardando"; survey_id: string; motivo: string }
  | { resultado: "falha"; survey_id: string; motivo: string };

/**
 * `client_message_id` determinístico (UUID) do convite. FNV-1a de 32 bits em 4
 * pistas → 128 bits: dois isolates produzem o MESMO id para o mesmo convite,
 * então o UNIQUE do banco — e não uma consulta prévia — é quem deduplica.
 */
export function csatClientMessageId(surveyId: string): string {
  const semente = `${surveyId}|csat`;
  const hex: string[] = [];
  for (let pista = 0; pista < 4; pista++) {
    let h = (0x811c9dc5 ^ Math.imul(pista + 1, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < semente.length; i++) {
      h ^= semente.charCodeAt(i) + pista;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    hex.push(h.toString(16).padStart(8, "0"));
  }
  const raw = hex.join("");
  // UUID de 128 bits com as marcas de versão/variante (id não-secreto).
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-a${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
}

/** Lote pedido do cron, aparado no que a RPC aceita. */
export function limiteDoLote(valor: string | undefined): number {
  const n = Number.parseInt(valor ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return CSAT_DISPATCH_DEFAULT_LIMIT;
  return Math.min(n, CSAT_DISPATCH_MAX_LIMIT);
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

function codigoDoErro(erro: unknown): string {
  const code = (erro as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "";
}

function motivoDoErro(erro: unknown): string {
  const message = (erro as { message?: unknown } | null)?.message;
  return typeof message === "string" && message !== "" ? message : String(erro);
}

export interface TextoParaEnviar {
  evolutionUrl: string;
  evolutionKey: string;
  instancia: string;
  telefone: string;
  texto: string;
  instanceToken: string | null;
}

/** Seam de teste: tudo que o handler precisa do mundo externo pode ser injetado. */
export interface CsatDispatchDeps {
  supabase?: unknown;
  env?: (chave: string) => string | undefined;
  agora?: () => number;
  /** POST de texto no provedor (default: `evoFetch`). */
  enviarTexto?: (p: TextoParaEnviar) => Promise<Response>;
  /** Token da instância (default: RPC `get_instance_token` via `resolveInstanceToken`). */
  resolverToken?: (supabase: SupabaseClient, instancia: string) => Promise<string | null>;
  /** Efeito incerto → reconciliação (default: `enqueueEffectReconcile`). */
  enfileirarReconciliacao?: (p: {
    supabase: SupabaseClient;
    messageId: string;
    externalId: string | null;
  }) => Promise<void>;
}

export async function handleCsatDispatch(
  req: Request,
  deps: CsatDispatchDeps = {},
): Promise<Response> {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const log = new Logger("csat-dispatch");
  const readEnv = deps.env ?? ((chave: string) => Deno.env.get(chave));

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, req);
  }

  try {
    const supabaseUrl = readEnv("SUPABASE_URL") ?? "";
    const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = readEnv(CRON_SECRET_ENV) ?? "";

    // ── 0. AUTORIZAÇÃO — antes do cliente service role e de qualquer leitura ──
    const headerDoCron = req.headers.get(CRON_SECRET_HEADER);
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
    const viaCron = headerDoCron !== null && cronSecret !== "" && timingSafeEqual(headerDoCron, cronSecret);
    const viaServico = serviceKey !== "" && bearer !== "" && timingSafeEqual(bearer, serviceKey);
    if (!viaCron && !viaServico) {
      log.warn("chamador nao autorizado", { viaCron: headerDoCron !== null });
      return errorResponse("Unauthorized", 401, req);
    }

    // Config do provedor ANTES do claim: sem provedor não se reivindica nada
    // (um convite reivindicado sem envio ficaria preso em 'sent').
    const evolutionUrl = readEnv("EVOLUTION_API_URL")?.replace(/\/+$/, "") ?? "";
    const evolutionKey = readEnv("EVOLUTION_API_KEY") ?? "";
    if (evolutionUrl === "" || evolutionKey === "") {
      log.error("EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes — nenhum convite reivindicado");
      return errorResponse("Provedor indisponivel", 503, req);
    }

    const supabase = (deps.supabase ?? createClient(supabaseUrl, serviceKey)) as SupabaseClient;
    const limite = limiteDoLote(readEnv("CSAT_DISPATCH_LIMIT"));
    const enviarTexto = deps.enviarTexto ?? ((p: TextoParaEnviar) =>
      evoFetch(
        p.evolutionUrl,
        p.evolutionKey,
        `/message/sendText/${p.instancia}`,
        { number: p.telefone, text: p.texto },
        undefined,
        undefined,
        undefined,
        p.instanceToken ?? undefined,
      ));
    const resolverToken = deps.resolverToken ?? ((client: SupabaseClient, instancia: string) =>
      resolveInstanceToken(client, instancia));
    const reconciliar = deps.enfileirarReconciliacao ?? (async ({ supabase: client, messageId, externalId }) => {
      await enqueueEffectReconcile({
        supabase: client,
        effect: EFFECT_MESSAGE_SEND,
        sourceTable: "messages",
        sourceId: messageId,
        externalId,
      });
    });

    // ── 1. Claim do lote (a RPC marca 'sent' e devolve quem já venceu) ──
    const { data: lote, error: erroClaim } = await supabase.rpc(CSAT_CLAIM_RPC, { p_limit: limite });
    if (erroClaim) {
      log.error("falha no claim dos convites", { erro: motivoDoErro(erroClaim), code: codigoDoErro(erroClaim) });
      return internalErrorResponse(erroClaim, req);
    }
    const convites = (Array.isArray(lote) ? lote : []) as Linha[];
    if (convites.length === 0) {
      log.done(200, { claimed: 0 });
      return jsonResponse({ ok: true, claimed: 0, sent: 0, failed: 0, pending: 0, failures: [] }, 200, req);
    }

    /** Marca o convite como terminal. Só a partir de 'sent' (o estado do claim). */
    const marcarFalha = async (surveyId: string, motivo: string): Promise<void> => {
      const { error } = await supabase
        .from("csat_surveys")
        .update({ status: "failed" })
        .eq("id", surveyId)
        .eq("status", "sent");
      if (error) {
        log.warn("falha ao marcar o convite como failed", { survey_id: surveyId, motivo, erro: motivoDoErro(error) });
      }
    };

    /**
     * Conexão escolhida na tela de CSAT (`csat_auto_config.whatsapp_connection_id`)
     * — a MESMA config que a `csat-auto-send` usa. Lida uma vez por passada; erro
     * de leitura cai no caminho do contato (a config não derruba a entrega).
     */
    let escolhaDoOperador: string | null | undefined;
    const lerEscolhaDoOperador = async (): Promise<string | null> => {
      if (escolhaDoOperador !== undefined) return escolhaDoOperador;
      try {
        const { data, error } = await supabase
          .from("csat_auto_config")
          .select("whatsapp_connection_id")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        escolhaDoOperador = texto((data as Linha | null)?.whatsapp_connection_id) || null;
      } catch (erro) {
        log.warn("nao foi possivel ler a conexao da config de CSAT", { erro: motivoDoErro(erro) });
        escolhaDoOperador = null;
      }
      return escolhaDoOperador;
    };

    /** Conexão de envio: escolha do operador (config) → a do contato → a mais recente. */
    const resolverConexao = async (contactId: string) => {
      const vivas = async (coluna: string, valor: string) => {
        const { data, error } = await supabase
          .from("whatsapp_connections")
          .select("id, created_by, instance_id")
          .eq(coluna, valor)
          .eq("status", "connected")
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data as Linha | null;
      };

      const { data: contato, error: erroContato } = await supabase
        .from("contacts")
        .select("whatsapp_connection_id")
        .eq("id", contactId)
        .maybeSingle();
      if (erroContato) throw erroContato;
      const atribuida = texto((contato as Linha | null)?.whatsapp_connection_id);

      const escolhida = await lerEscolhaDoOperador();
      if (escolhida) {
        const conexao = await vivas("id", escolhida);
        if (conexao) return conexao;
      }
      if (atribuida) {
        const conexao = await vivas("id", atribuida);
        if (conexao) return conexao;
      }
      const { data: padrao, error: erroPadrao } = await supabase
        .from("whatsapp_connections")
        .select("id, created_by, instance_id")
        .eq("status", "connected")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (erroPadrao) throw erroPadrao;
      return padrao as Linha | null;
    };

    /** Perfil ativo do atendente do convite; senão o dono da conexão. */
    const resolverAtendente = async (agentId: string | null, donoDaConexao: string | null) => {
      for (const candidato of [agentId, donoDaConexao]) {
        if (!candidato) continue;
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", candidato)
          .eq("is_active", true)
          .maybeSingle();
        if (error) throw error;
        const id = texto((data as Linha | null)?.id);
        if (id) return id;
      }
      return null;
    };

    /** Entrega um convite. NUNCA lança: uma falha não pode derrubar o lote. */
    const processarConvite = async (item: Linha): Promise<ResultadoDoConvite> => {
      const surveyId = texto(item.id);
      const contactId = texto(item.contact_id);
      if (!surveyId || !contactId) {
        return { resultado: "falha", survey_id: surveyId ?? "desconhecido", motivo: "linha_sem_id" };
      }
      const telefone = texto(item.phone);
      if (!telefone) {
        await marcarFalha(surveyId, "sem_telefone");
        return { resultado: "falha", survey_id: surveyId, motivo: "sem_telefone" };
      }
      const conteudo = texto(item.message_text);
      if (!conteudo) {
        await marcarFalha(surveyId, "sem_texto");
        return { resultado: "falha", survey_id: surveyId, motivo: "sem_texto" };
      }

      try {
        const conexao = await resolverConexao(contactId);
        const conexaoId = texto(conexao?.id);
        const instancia = texto(conexao?.instance_id);
        if (!conexaoId || !instancia) {
          await marcarFalha(surveyId, "sem_conexao_conectada");
          return { resultado: "falha", survey_id: surveyId, motivo: "sem_conexao_conectada" };
        }
        const agentId = await resolverAtendente(texto(item.agent_id), texto(conexao?.created_by));
        if (!agentId) {
          // Fail-closed: o pipeline de saída exige um perfil ATIVO e não se
          // empresta o perfil de outra pessoa para um envio de sistema.
          await marcarFalha(surveyId, "sem_atendente_ativo");
          return { resultado: "falha", survey_id: surveyId, motivo: "sem_atendente_ativo" };
        }

        // 1) Enfileira no contrato oficial. O UNIQUE deduplica (sem SELECT prévio).
        const clientMessageId = csatClientMessageId(surveyId);
        let messageId: string | null = null;
        const { data: enfileirada, error: erroEnfileiramento } = await supabase
          .from("messages")
          .insert({
            contact_id: contactId,
            whatsapp_connection_id: conexaoId,
            agent_id: agentId,
            sender: "agent",
            content: conteudo,
            message_type: "text",
            is_read: true,
            status: "sending",
            status_updated_at: new Date(deps.agora?.() ?? Date.now()).toISOString(),
            client_message_id: clientMessageId,
          })
          .select("id")
          .maybeSingle();
        if (erroEnfileiramento) {
          if (codigoDoErro(erroEnfileiramento) !== "23505") {
            log.warn("falha ao enfileirar o convite", {
              survey_id: surveyId,
              code: codigoDoErro(erroEnfileiramento),
              erro: motivoDoErro(erroEnfileiramento),
            });
            await marcarFalha(surveyId, "falha_enfileirando");
            return { resultado: "falha", survey_id: surveyId, motivo: "falha_enfileirando" };
          }
          // Já enfileirado (recuperação depois de queda, ou corrida com outra
          // passada): reaproveita a linha para retomar a entrega — nunca um 2º envio.
          const { data: existente, error: erroBusca } = await supabase
            .from("messages")
            .select("id")
            .eq("client_message_id", clientMessageId)
            .maybeSingle();
          if (erroBusca) throw erroBusca;
          messageId = texto((existente as Linha | null)?.id);
          if (!messageId) {
            await marcarFalha(surveyId, "enfileirado_sem_linha");
            return { resultado: "falha", survey_id: surveyId, motivo: "enfileirado_sem_linha" };
          }
        } else {
          messageId = texto((enfileirada as Linha | null)?.id);
          if (!messageId) {
            await marcarFalha(surveyId, "enfileirado_sem_id");
            return { resultado: "falha", survey_id: surveyId, motivo: "enfileirado_sem_id" };
          }
        }

        // 2) Claim oficial (service_role) — o mesmo caminho do message-delivery.
        const { data: claimBruto, error: erroClaimItem } = await supabase.rpc("claim_outbound_message", {
          p_message_id: messageId,
          p_agent_id: agentId,
          p_worker: CSAT_DISPATCH_WORKER,
          p_lease_seconds: CSAT_DISPATCH_LEASE_SECONDS,
        });
        const claim = (Array.isArray(claimBruto) ? claimBruto[0] : claimBruto) as Linha | null;
        const claimToken = texto(claim?.claim_token);
        const instanciaDoClaim = texto(claim?.whatsapp_instance_name);
        const telefoneDoClaim = texto(claim?.contact_phone);
        if (erroClaimItem || !claimToken || !instanciaDoClaim || !telefoneDoClaim) {
          // Sem linha claimável: outro worker tem o lease, ou a mensagem já saiu.
          // Não é falha DEFINITIVA do convite — o pipeline de mensagens responde
          // pela entrega; marcar 'failed' aqui mataria um envio em andamento.
          log.warn("convite sem linha claimavel agora", {
            survey_id: surveyId,
            erro: erroClaimItem ? motivoDoErro(erroClaimItem) : "nenhuma_linha_claimavel",
          });
          return { resultado: "aguardando", survey_id: surveyId, motivo: "mensagem_em_andamento" };
        }

        // 3) Provedor — mesmo sender e mesmo token do `message-delivery`.
        const token = await resolverToken(supabase, instanciaDoClaim);
        let postTentado = false;
        let externalId: string | null = null;
        try {
          postTentado = true;
          const resposta = await enviarTexto({
            evolutionUrl,
            evolutionKey,
            instancia: instanciaDoClaim,
            telefone: telefoneDoClaim,
            texto: conteudo,
            instanceToken: token ?? null,
          });
          const corpo = await resposta.text();
          let dados: unknown = null;
          try { dados = corpo ? JSON.parse(corpo) : null; } catch { /* corpo invalido do provedor */ }

          if (!resposta.ok) {
            const motivo = `provedor_${resposta.status}`;
            await failClaim(supabase, messageId, claimToken);
            if (resposta.status >= 500) await reconciliar({ supabase, messageId, externalId: null });
            await marcarFalha(surveyId, motivo);
            return { resultado: "falha", survey_id: surveyId, motivo };
          }
          externalId = extractMessageId(dados) ?? null;
          if (!externalId || externalId.length > 512) {
            // Efeito INDETERMINADO (o provedor pode ter entregue): reconciliação
            // somente-leitura, sem reenvio.
            await failClaim(supabase, messageId, claimToken);
            await reconciliar({ supabase, messageId, externalId: null });
            await marcarFalha(surveyId, "recibo_ausente");
            return { resultado: "falha", survey_id: surveyId, motivo: "recibo_ausente" };
          }
          const { data: concluida, error: erroRecibo } = await supabase.rpc("complete_outbound_message", {
            p_message_id: messageId,
            p_claim_token: claimToken,
            p_external_id: externalId,
            p_delivery_status: "sent",
          });
          const linhaConcluida = (Array.isArray(concluida) ? concluida[0] : concluida) as Linha | null;
          if (erroRecibo || !texto(linhaConcluida?.id)) {
            await failClaim(supabase, messageId, claimToken);
            await reconciliar({ supabase, messageId, externalId });
            await marcarFalha(surveyId, "recibo_nao_persistido");
            return { resultado: "falha", survey_id: surveyId, motivo: "recibo_nao_persistido" };
          }
          log.info("convite enviado", { survey_id: surveyId });
          return { resultado: "enviado", survey_id: surveyId };
        } catch (erro) {
          await failClaim(supabase, messageId, claimToken);
          if (postTentado) await reconciliar({ supabase, messageId, externalId });
          log.warn("envio do convite falhou", { survey_id: surveyId, erro: motivoDoErro(erro) });
          await marcarFalha(surveyId, "envio_com_erro");
          return { resultado: "falha", survey_id: surveyId, motivo: "envio_com_erro" };
        }
      } catch (erro) {
        log.warn("erro preparando o convite", { survey_id: surveyId, erro: motivoDoErro(erro) });
        await marcarFalha(surveyId, "preparo_com_erro");
        return { resultado: "falha", survey_id: surveyId, motivo: "preparo_com_erro" };
      }
    };

    const resultados: ResultadoDoConvite[] = [];
    for (const item of convites) {
      resultados.push(await processarConvite(item));
    }

    const enviados = resultados.filter((r) => r.resultado === "enviado").length;
    const falhas = resultados.filter((r): r is Extract<ResultadoDoConvite, { resultado: "falha" }> => r.resultado === "falha");
    const aguardando = resultados.filter((r) => r.resultado === "aguardando").length;
    log.done(200, { claimed: convites.length, sent: enviados, failed: falhas.length, pending: aguardando });

    return jsonResponse({
      ok: true,
      claimed: convites.length,
      sent: enviados,
      failed: falhas.length,
      pending: aguardando,
      failures: falhas.slice(0, MAX_MOTIVOS_NA_RESPOSTA).map((f) => ({ survey_id: f.survey_id, motivo: f.motivo })),
    }, 200, req);
  } catch (erro) {
    log.error("erro inesperado", { erro: motivoDoErro(erro) });
    return internalErrorResponse(erro, req);
  }
}

/** Terminal sem reenvio para a linha claimada (igual ao pipeline oficial). */
async function failClaim(
  supabase: SupabaseClient,
  messageId: string,
  claimToken: string,
): Promise<void> {
  const { error } = await supabase.rpc("fail_outbound_message", {
    p_message_id: messageId,
    p_claim_token: claimToken,
    p_retryable: false,
  });
  if (error) console.error("[CSAT-DISPATCH] fail_outbound_message:", codigoDoErro(error), motivoDoErro(error));
}

if (import.meta.main) {
  Deno.serve((req) => handleCsatDispatch(req));
}
