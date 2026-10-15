/**
 * Edge `csat-auto-send` — dispara a pesquisa de satisfação (CSAT) quando o
 * atendimento é encerrado. Porta da `csat-auto-send` do Zapp v3 adaptada aos
 * canais canônicos do V2 (cartão "CSAT automático sem executor": a config
 * `csat_auto_config` existia e ninguém executava o envio).
 *
 * O que diverge do v3 de propósito (o v2 é melhor onde diverge):
 *  - O v3 fazia um POST direto no Evolution no fechamento; aqui o fechamento só
 *    AGENDA o convite (`csat_surveys.status='scheduled'`, `send_at = agora +
 *    delay_minutes`, migration `20261015210626_csat_pipeline.sql` do cartão
 *    t_69726cda) e quem envia é a Edge de cron `csat-dispatch`, pela fila
 *    canônica (`messages` + `claim_outbound_message`), nunca por fetch solto.
 *  - O atraso (`csat_auto_config.delay_minutes`) agora É aplicado: é o `send_at`
 *    do convite. O que não venceu não sai — quem decide o "venceu" é a RPC
 *    `claim_due_csat_surveys`, com `send_at <= now()`.
 *  - Quem agenda é o PRÓPRIO chamador (JWT do atendente): nenhuma leitura ou
 *    escrita usa service_role. A RLS do INSERT de `csat_surveys` exige que
 *    `agent_id` seja o perfil do chamador (ou admin/supervisor) e a RLS de
 *    SELECT decide o que ele vê.
 *
 * Garantias (cada uma com prova em index.test.ts):
 *  - só agenda com `csat_auto_config.is_enabled` verdadeiro;
 *  - LGPD: `contacts.consent_status = 'revoked'` nunca recebe pesquisa;
 *  - cooldown por convite: nada nos últimos 30 dias com status `scheduled`,
 *    `sent` ou `responded` para o mesmo contato (o pendente também bloqueia —
 *    senão dois encerramentos seguidos criariam dois convites para o mesmo
 *    contato, e o índice único de `csat_surveys` é por conversa, não por contato);
 *  - no máximo UMA pesquisa por conversa: o índice único parcial
 *    `uq_csat_surveys_conversation` (conversation_id) é a garantia — a UNIQUE
 *    decide, nunca uma consulta prévia;
 *  - só conversa realmente encerrada por atendente: `contacts.conversation_status
 *    = 'resolved'` E encerramento com `closed_by` preenchido;
 *  - sem telefone não há entrega: o convite nem é agendado.
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

/** Tabela onde o convite fica durável, com `status`/`send_at` (PK-03). */
export const CSAT_SURVEY_TABLE = "csat_surveys";

/** Teto do atraso aceito, em minutos (30 dias) — acima disso a config está corrompida. */
export const CSAT_MAX_DELAY_MINUTES = 43_200;

/** Status que ocupam o contato: qualquer convite vivo bloqueia outro (cooldown). */
export const CSAT_COOLDOWN_STATUSES = ["scheduled", "sent", "responded"] as const;

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
  insert(valores: Record<string, unknown>): ConsultaCsat;
  eq(coluna: string, valor: string): ConsultaCsat;
  neq(coluna: string, valor: string): ConsultaCsat;
  gte(coluna: string, valor: string): ConsultaCsat;
  in(coluna: string, valores: readonly string[]): ConsultaCsat;
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
 * Código da falha do INSERT do convite → HTTP. A RLS de INSERT de `csat_surveys`
 * levanta 42501 quando o `agent_id` não é o perfil do chamador (nem admin/
 * supervisor): sem permissão vira 403 genérico. 23505 é reuso de conversa e é
 * tratado ANTES (idempotência); sobra 22023 (payload inválido) → 409 e o resto 500.
 */
export function statusDoErroDeAgendamento(erro: ErroDb | null): number {
  const code = erro?.code ?? "";
  if (code === "42501") return 403;
  if (code === "22023" || code === "23503" || code === "23514") return 409;
  return 500;
}

/**
 * Quando o convite sai, em ISO. `delay_minutes` ausente/ilegível/negativo = 0
 * (entrega na próxima passada do dispatcher, nunca "nunca"); acima do teto
 * (`CSAT_MAX_DELAY_MINUTES`) a config está corrompida e o atraso é aparado no
 * teto, em vez de agendar para décadas.
 */
export function calcularEnvioEm(delayMinutes: unknown, agoraMs: number): string {
  const bruto = typeof delayMinutes === "number" ? delayMinutes : Number(delayMinutes);
  const minutos = Number.isFinite(bruto) && bruto > 0 ? Math.min(bruto, CSAT_MAX_DELAY_MINUTES) : 0;
  return new Date(agoraMs + minutos * 60_000).toISOString();
}

interface CorpoDoPedido {
  contact_id?: unknown;
  closure_id?: unknown;
}

interface RespostaLida {
  ok: true;
  scheduled: boolean;
  reason?: string;
  survey_id?: string;
  send_at?: string;
  contact_id: string;
  closure_id?: string;
}

function resposta(
  req: Request,
  status: number,
  contactId: string,
  scheduled: boolean,
  extra: { reason?: string; survey_id?: string; send_at?: string; closure_id?: string } = {},
): Response {
  const corpo: RespostaLida = { ok: true, scheduled, contact_id: contactId, ...extra };
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
      .select("id, is_enabled, message_template, delay_minutes, whatsapp_connection_id")
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
    //    recente. Consulta dirigida, sem listar/cortar o histórico.
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

    // 8. Cooldown por contato: qualquer convite vivo (agendado, enviado ou
    //    respondido) dos últimos 30 dias bloqueia. O PENDENTE também conta e é
    //    o ponto sutil: o índice único do convite é por CONVERSA, então sem
    //    esta checagem dois encerramentos seguidos do mesmo contato criariam
    //    dois convites 'scheduled' e a RPC os reivindicaria no MESMO lote (o
    //    cooldown dela olha só sent/responded) — dois convites na mesma hora.
    const { data: conviteVivo, error: erroCooldown } = await cliente
      .from(CSAT_SURVEY_TABLE)
      .select("id")
      .eq("contact_id", contactId)
      .in("status", [...CSAT_COOLDOWN_STATUSES])
      .gte("created_at", janela)
      .limit(1)
      .maybeSingle();
    if (erroCooldown) {
      log.error("erro checando o cooldown do convite", { erro: erroCooldown.message });
      return internalErrorResponse(erroCooldown, req);
    }
    if (conviteVivo) {
      return resposta(req, 200, contactId, false, { reason: "cooldown" });
    }

    // 9. Sem telefone não há como entregar — não agenda o que não sai.
    if (typeof contato.phone !== "string" || contato.phone.trim() === "") {
      return resposta(req, 200, contactId, false, { reason: "no_phone" });
    }

    // 10. Mensagem: modelo da config (ou padrão) + variáveis usadas.
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

    // 11. Convite agendado: `send_at` = agora + `delay_minutes`. O estado vive em
    //     `csat_surveys` (migration do PK-03) e o envio é da `csat-dispatch`.
    const agoraMs = Date.now();
    const enviarEm = calcularEnvioEm(config.delay_minutes, agoraMs);

    // 12. Escrita como o CHAMADOR: quem garante "uma pesquisa por conversa" é o
    //     índice único parcial `uq_csat_surveys_conversation` — o INSERT decide,
    //     não um SELECT prévio. O 23505 aqui é a CORRIDA entre duas chamadas
    //     simultâneas da mesma conversa (as duas passam pelo passo 8).
    const { data: convite, error: erroConvite } = await cliente
      .from(CSAT_SURVEY_TABLE)
      .insert({
        contact_id: contactId,
        agent_id: fechadoPor,
        conversation_id: String(atual.id),
        conversation_resolved_at: typeof atual.created_at === "string" ? atual.created_at : null,
        message_text: conteudo,
        send_at: enviarEm,
        status: "scheduled",
      })
      .select("id")
      .maybeSingle();
    if (erroConvite) {
      if (erroConvite.code === "23505") {
        return resposta(req, 200, contactId, false, {
          reason: "already_scheduled",
          closure_id: String(atual.id),
        });
      }
      const status = statusDoErroDeAgendamento(erroConvite);
      if (status === 500) {
        log.error("erro agendando o convite", { erro: erroConvite.message, code: erroConvite.code });
        return internalErrorResponse(erroConvite, req);
      }
      log.warn("convite recusado", { status, code: erroConvite.code });
      return errorResponse(status === 403 ? "Forbidden" : "Nao foi possivel agendar a pesquisa", status, req);
    }

    const surveyId = typeof convite?.id === "string" ? convite.id : undefined;
    log.info("convite agendado", { contact_id: contactId, closure_id: atual.id, send_at: enviarEm });
    return resposta(req, 200, contactId, true, {
      survey_id: surveyId,
      send_at: enviarEm,
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
