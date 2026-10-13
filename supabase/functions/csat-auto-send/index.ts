/**
 * Edge `csat-auto-send` — dispara a pesquisa de satisfação (CSAT) quando o
 * atendimento é encerrado. Porta da `csat-auto-send` do Zapp v3 adaptada aos
 * canais canônicos do V2 (cartão "CSAT automático sem executor": a config
 * `csat_auto_config` existia e ninguém executava o envio).
 *
 * O que diverge do v3 de propósito (o v2 é melhor onde diverge):
 *  - O v3 fazia um POST direto no Evolution sem fila durável; aqui a mensagem sai
 *    pela FILA CANÔNICA (`enqueue_outbound_message`), idempotente por
 *    `(contact_id, client_message_id)`, que respeita a permissão `send_messages`,
 *    o escopo de fila da conexão e é entregue pelo worker `message-delivery`.
 *  - O v3 gravava o convite em `csat_surveys(status='scheduled')`. No v2,
 *    `csat_surveys` é a tabela de RESPOSTAS (`rating NOT NULL`, `agent_id NOT
 *    NULL`) e é a fonte da média/distribuição do dashboard CSAT. Um convite ali
 *    exigiria rating sintético e sujaria a média — então o convite fica durável
 *    na própria fila (linha de `messages` idempotente), e a criação de um estado
 *    de convite no banco é migration (registrado no cartão para o especialista
 *    de banco, fora da minha área).
 *  - O atraso (`csat_auto_config.delay_minutes`) não é aplicado: a fila canônica
 *    do v2 entrega imediatamente e não tem `send_at`. Agendar é outro cartão.
 *
 * Garantias (cada uma com prova em index.test.ts):
 *  - só envia com `csat_auto_config.is_enabled` verdadeiro;
 *  - LGPD: `contacts.consent_status = 'revoked'` nunca recebe pesquisa;
 *  - cooldown de 30 dias por contato (outra conversa encerrada no período, ou
 *    resposta de CSAT recente);
 *  - no máximo UMA pesquisa por conversa: `client_message_id` = id do
 *    encerramento; a unicidade `(contact_id, client_message_id)` do banco é a
 *    garantia final (a checagem explícita cobre o caminho comum);
 *  - só conversa realmente encerrada por atendente: `contacts.conversation_status
 *    = 'resolved'` E encerramento com `closed_by` preenchido;
 *  - quem envia é o PRÓPRIO chamador: nenhuma leitura/escrita usa service_role; a
 *    RLS decide o que ele vê e a RPC decide o que ele pode enfileirar.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import {
  checkRateLimit,
  errorResponse,
  getClientIP,
  handleCors,
  internalErrorResponse,
  isValidUUID,
  jsonResponse,
  Logger,
  requireAuth,
  requireEnv,
  type AuthUserResult,
} from "../_shared/validation.ts";

/** Janela de cooldown por contato, em dias (mesma do v3). */
export const CSAT_COOLDOWN_DAYS = 30;

/** Modelo usado quando a config não traz `message_template` (igual ao padrão da tela). */
export const CSAT_DEFAULT_TEMPLATE =
  "Olá {name}! Como foi seu atendimento? Avalie de 1 a 5 ⭐\n\n1️⃣ Péssimo\n2️⃣ Ruim\n3️⃣ Regular\n4️⃣ Bom\n5️⃣ Excelente";

/** Variáveis aceitas no modelo, as mesmas documentadas na tela de configuração. */
export const CSAT_TEMPLATE_TOKENS = ["name", "agent", "queue"] as const;

/** RPC canônica da fila de saída (a única porta de envio do v2). */
export const CSAT_ENQUEUE_RPC = "enqueue_outbound_message";

export interface ErroDb {
  message?: string;
  code?: string;
}

type Linha = Record<string, unknown> | null;

/**
 * Consulta mínima que o handler usa. O client real do supabase-js satisfaz esta
 * forma (o builder é "thenable"); o teste injeta um fake com a mesma forma.
 */
export interface ConsultaCsat
  extends PromiseLike<{ data: unknown[] | null; error: ErroDb | null }> {
  select(colunas: string): ConsultaCsat;
  eq(coluna: string, valor: string): ConsultaCsat;
  neq(coluna: string, valor: string): ConsultaCsat;
  gte(coluna: string, valor: string): ConsultaCsat;
  order(coluna: string, opts: { ascending: boolean }): ConsultaCsat;
  limit(quantidade: number): ConsultaCsat;
  maybeSingle(): Promise<{ data: Linha; error: ErroDb | null }>;
}

/** Cliente com o JWT do chamador: a RLS é a autorização de leitura. */
export interface ClienteDoChamador {
  auth: {
    getUser(): Promise<AuthUserResult>;
  };
  from(tabela: string): ConsultaCsat;
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: ErroDb | null }>;
}

export interface CsatAutoSendDeps {
  /** Autenticação + política de rede. Injetável para o teste rodar offline. */
  autorizar(req: Request): Promise<{ userId: string } | Response>;
  /** Cliente de escopo usuário montado com o Authorization do chamador. */
  clienteDoChamador(authHeader: string): ClienteDoChamador;
}

export const depsReais: CsatAutoSendDeps = {
  autorizar: (req) => requireAuth(req),
  clienteDoChamador: (authHeader) =>
    createClient(
      requireEnv("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      },
    ) as unknown as ClienteDoChamador,
};

/** Substitui só as variáveis documentadas; token desconhecido fica como está. */
export function renderCsatTemplate(
  template: string,
  vars: Partial<Record<(typeof CSAT_TEMPLATE_TOKENS)[number], string>>,
): string {
  return template.replace(
    /\{(name|agent|queue)\}/g,
    (_todo, token: (typeof CSAT_TEMPLATE_TOKENS)[number]) => vars[token] ?? "",
  );
}

/**
 * Código da falha de `enqueue_outbound_message` → HTTP. A RPC levanta 42501 para
 * autenticação, permissão `send_messages`, escopo de fila da conexão, perfil
 * inativo e contato não autorizado: tudo isso vira um 403 genérico (não existe e
 * existe-mas-sem-permissão respondem IGUAL). 23505 é reuso de
 * `client_message_id` com payload diferente e 22023 é payload inválido/sem
 * conexão conectada — ambos 409. O resto é 500.
 */
export function statusDoErroDeEnqueue(erro: ErroDb | null): number {
  const code = erro?.code ?? "";
  if (code === "42501") return 403;
  if (code === "23505" || code === "22023") return 409;
  return 500;
}

interface CorpoDoPedido {
  contact_id?: unknown;
  closure_id?: unknown;
}

interface RespostaLida {
  ok: true;
  sent: boolean;
  reason?: string;
  message_id?: string;
  contact_id: string;
  closure_id?: string;
}

function resposta(
  req: Request,
  status: number,
  contactId: string,
  sent: boolean,
  extra: { reason?: string; message_id?: string; closure_id?: string } = {},
): Response {
  const corpo: RespostaLida = { ok: true, sent, contact_id: contactId, ...extra };
  return jsonResponse(corpo, status, req);
}

export async function handleCsatAutoSend(
  req: Request,
  deps: CsatAutoSendDeps = depsReais,
): Promise<Response> {
  const log = new Logger("csat-auto-send");

  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405, req);
  }

  // 1. Autenticação (e política de rede) ANTES de qualquer leitura/efeito.
  const autorizado = await deps.autorizar(req);
  if (autorizado instanceof Response) return autorizado;
  const { userId } = autorizado;

  const rl = checkRateLimit(`csat-auto-send:${userId}`, 30, 60_000);
  if (!rl.allowed) {
    log.warn("rate limit", { ip: getClientIP(req) });
    return errorResponse("Rate limit exceeded", 429, req);
  }

  // 2. Entrada: só o contato é obrigatório; o encerramento é opcional (o mais
  //    recente é usado) e, quando vem, tem de ser o do próprio contato.
  let corpo: CorpoDoPedido;
  try {
    corpo = await req.json();
  } catch {
    return errorResponse("JSON invalido", 400, req);
  }
  const contactId = typeof corpo?.contact_id === "string" ? corpo.contact_id : "";
  if (!isValidUUID(contactId)) {
    return errorResponse("contact_id invalido", 400, req);
  }
  const closureIdPedido = typeof corpo?.closure_id === "string" && isValidUUID(corpo.closure_id)
    ? corpo.closure_id
    : null;
  if (closureIdPedido === null && corpo?.closure_id !== undefined && corpo?.closure_id !== null) {
    return errorResponse("closure_id invalido", 400, req);
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  const cliente = deps.clienteDoChamador(authHeader);

  try {
    // 3. Config: desligada = nada acontece (nem leitura de contato).
    const { data: config, error: erroConfig } = await cliente
      .from("csat_auto_config")
      .select("id, is_enabled, message_template, whatsapp_connection_id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (erroConfig) {
      log.error("erro lendo csat_auto_config", { erro: erroConfig.message });
      return internalErrorResponse(erroConfig, req);
    }
    if (!config || config.is_enabled !== true) {
      return resposta(req, 200, contactId, false, { reason: "disabled" });
    }

    // 4. Contato pela RLS: invisível para o chamador responde igual a inexistente.
    const { data: contato, error: erroContato } = await cliente
      .from("contacts")
      .select("id, name, phone, consent_status, conversation_status, whatsapp_connection_id, queue_id")
      .eq("id", contactId)
      .maybeSingle();
    if (erroContato) {
      log.error("erro lendo contato", { erro: erroContato.message });
      return internalErrorResponse(erroContato, req);
    }
    if (!contato) {
      return errorResponse("Forbidden", 403, req);
    }

    // 5. LGPD: consentimento revogado nunca recebe pesquisa.
    if (contato.consent_status === "revoked") {
      return resposta(req, 200, contactId, false, { reason: "consent_revoked" });
    }

    const janela = new Date(Date.now() - CSAT_COOLDOWN_DAYS * 86_400_000).toISOString();

    // 6. A conversa: o encerramento pedido (validado contra o contato) ou o mais
    //    recente. Consulta dirigida, sem listar/cortar: o cooldown do passo 9 é
    //    decidido por `neq`+`gte`, então nada depende de um LIMIT.
    const { data: atual, error: erroEncerramento } = await (closureIdPedido
      ? cliente
        .from("conversation_closures")
        .select("id, closed_by, created_at")
        .eq("id", closureIdPedido)
        .eq("contact_id", contactId)
      : cliente
        .from("conversation_closures")
        .select("id, closed_by, created_at")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(1)
    ).maybeSingle();
    if (erroEncerramento) {
      log.error("erro lendo encerramentos", { erro: erroEncerramento.message });
      return internalErrorResponse(erroEncerramento, req);
    }
    if (!atual) {
      return resposta(req, 200, contactId, false, { reason: "not_closed" });
    }

    // 7. Só conversa realmente encerrada por atendente.
    if (contato.conversation_status !== "resolved") {
      return resposta(req, 200, contactId, false, { reason: "not_closed" });
    }
    const fechadoPor = typeof atual.closed_by === "string" ? atual.closed_by : null;
    if (!fechadoPor) {
      return resposta(req, 200, contactId, false, { reason: "not_closed_by_agent" });
    }

    // 8. Nunca duas vezes para a mesma conversa: o id do encerramento é o
    //    `client_message_id`; se a linha já existe, o convite já foi feito.
    const { data: jaEnfileirado, error: erroDuplicado } = await cliente
      .from("messages")
      .select("id")
      .eq("contact_id", contactId)
      .eq("client_message_id", String(atual.id))
      .maybeSingle();
    if (erroDuplicado) {
      log.error("erro checando convite existente", { erro: erroDuplicado.message });
      return internalErrorResponse(erroDuplicado, req);
    }
    if (jaEnfileirado) {
      return resposta(req, 200, contactId, false, {
        reason: "already_sent",
        message_id: String(jaEnfileirado.id),
        closure_id: String(atual.id),
      });
    }

    // 9. Cooldown por contato: outra conversa encerrada na janela, ou resposta
    //    de CSAT recente (o contato acabou de avaliar).
    const { data: outroEncerramento, error: erroOutro } = await cliente
      .from("conversation_closures")
      .select("id")
      .eq("contact_id", contactId)
      .neq("id", String(atual.id))
      .gte("created_at", janela)
      .limit(1)
      .maybeSingle();
    if (erroOutro) {
      log.error("erro checando cooldown", { erro: erroOutro.message });
      return internalErrorResponse(erroOutro, req);
    }
    if (outroEncerramento) {
      return resposta(req, 200, contactId, false, { reason: "cooldown" });
    }
    const { data: respostaRecente, error: erroResposta } = await cliente
      .from("csat_surveys")
      .select("id")
      .eq("contact_id", contactId)
      .gte("created_at", janela)
      .limit(1)
      .maybeSingle();
    if (erroResposta) {
      log.error("erro lendo csat_surveys", { erro: erroResposta.message });
      return internalErrorResponse(erroResposta, req);
    }
    if (respostaRecente) {
      return resposta(req, 200, contactId, false, { reason: "cooldown" });
    }

    // 10. Sem telefone não há como entregar.
    if (typeof contato.phone !== "string" || contato.phone.trim() === "") {
      return resposta(req, 200, contactId, false, { reason: "no_phone" });
    }

    // 11. Mensagem: modelo da config (ou padrão) + variáveis usadas.
    const template = typeof config.message_template === "string" && config.message_template.trim() !== ""
      ? config.message_template
      : CSAT_DEFAULT_TEMPLATE;

    const vars: Partial<Record<(typeof CSAT_TEMPLATE_TOKENS)[number], string>> = {
      name: String(contato.name ?? ""),
    };
    if (template.includes("{agent}")) {
      const { data: atendente } = await cliente
        .from("profiles")
        .select("name")
        .eq("id", fechadoPor)
        .maybeSingle();
      vars.agent = typeof atendente?.name === "string" ? atendente.name : "";
    }
    if (template.includes("{queue}") && typeof contato.queue_id === "string") {
      const { data: fila } = await cliente
        .from("queues")
        .select("name")
        .eq("id", contato.queue_id)
        .maybeSingle();
      vars.queue = typeof fila?.name === "string" ? fila.name : "";
    }

    const conteudo = renderCsatTemplate(template, vars).trim();
    if (conteudo === "") {
      return resposta(req, 200, contactId, false, { reason: "empty_template" });
    }

    // 12. Fila canônica, como o CHAMADOR: a RPC impõe `send_messages`, o escopo da
    //     conexão e a idempotência por (contact_id, client_message_id).
    const conexao = (typeof config.whatsapp_connection_id === "string" && config.whatsapp_connection_id)
      ? config.whatsapp_connection_id
      : (typeof contato.whatsapp_connection_id === "string" ? contato.whatsapp_connection_id : null);

    const { data: mensagem, error: erroEnqueue } = await cliente.rpc(CSAT_ENQUEUE_RPC, {
      p_contact_id: contactId,
      p_client_message_id: String(atual.id),
      p_content: conteudo,
      p_message_type: "text",
      p_media_url: null,
      p_reply_to_id: null,
      p_whatsapp_connection_id: conexao,
      p_caption: null,
    });
    if (erroEnqueue) {
      const status = statusDoErroDeEnqueue(erroEnqueue);
      if (status === 500) {
        log.error("erro enfileirando a pesquisa", { erro: erroEnqueue.message, code: erroEnqueue.code });
        return internalErrorResponse(erroEnqueue, req);
      }
      log.warn("enqueue recusado", { status, code: erroEnqueue.code });
      return errorResponse(status === 403 ? "Forbidden" : "Nao foi possivel enfileirar a pesquisa", status, req);
    }

    const messageId = (mensagem as Record<string, unknown> | null)?.id;
    log.info("pesquisa enfileirada", { contact_id: contactId, closure_id: atual.id });
    return resposta(req, 200, contactId, true, {
      message_id: typeof messageId === "string" ? messageId : undefined,
      closure_id: String(atual.id),
    });
  } catch (erro) {
    log.error("falha inesperada", { erro: String(erro) });
    return internalErrorResponse(erro, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleCsatAutoSend(req));
}
