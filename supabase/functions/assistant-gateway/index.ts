/**
 * Fase 3 do assistente pessoal — PORTA ÚNICA.
 *
 * Um pedido em linguagem natural entra, um dossiê sai, com a proveniência de
 * cada pedaço. O roteamento é determinístico (`_shared/assistant-gateway.ts`):
 * a mesma frase escolhe sempre as mesmas capacidades, mesmo com a IA fora.
 *
 * Contexto compartilhado, lido UMA vez e passado a todas as capacidades:
 *  - perfil do assistente (`assistant_profiles`, Fase 1);
 *  - agenda do contato (`conversation_tasks`, Fase 2);
 *  - histórico da conversa (`messages`);
 *  - negócio aberto (`sales_deals`).
 *
 * Regras de honestidade que vêm do plano:
 *  - fonte que falha vira `sources[].error`, nunca "nada havia";
 *  - capacidade que falha aparece em `errors[]` e o resto da resposta continua;
 *  - nada é gravado: a porta única lê e responde (escrever é da Fase 2).
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.87.1";
import { errorResponse, handleCors, jsonResponse, Logger, requireAuth } from "../_shared/validation.ts";
import { enforceAiGuards } from "../_shared/ai-guards.ts";
import { capabilityFlagKeyForFunction, readCapabilityFlag } from "../_shared/ai-feature-flags.ts";
import { playbookFor, playbookPromptBlock, type AssistantAtuacao } from "../_shared/assistant-playbook.ts";
import {
  CAPABILITY_FUNCTION,
  CAPABILITY_LABELS,
  MODEL_CAPABILITIES,
  readIntent,
  routeCapabilities,
  type AssistantCapability,
  type ContextSource,
} from "../_shared/assistant-gateway.ts";

/**
 * Edges que esta porta única dispara. O dispatch é pelo mapa `CAPABILITY_FUNCTION`
 * (`CAPABILITY_FUNCTION[cap]`), então a URL sai do template em tempo de execução;
 * os endpoints ficam listados aqui para o inventário do `ESTADO.md` conseguir
 * provar o chamador sem executar a função:
 *   /functions/v1/ai-conversation-summary
 *   /functions/v1/ai-suggest-reply
 *   /functions/v1/ai-lead-temperature
 *   /functions/v1/ai-product-recommendation
 *   /functions/v1/ai-deadline-calculator
 *   /functions/v1/ai-objection-handler
 */

/** Quantas mensagens do histórico entram no contexto compartilhado. */
const HISTORY_LIMIT = 20;
/** Janela máxima aceita pelo schema das edges chamadas (`messages` máx. 50). */
const MODEL_MESSAGES_LIMIT = 20;

export interface ConversationMessage {
  sender: string;
  content: string;
  created_at?: string | null;
}

export interface SharedContext {
  contactId: string | null;
  contactName: string | null;
  profile: { atividade: string | null; foco: string | null; ajuda: string | null; tom: string | null } | null;
  agenda: Array<{ title: string; remind_at: string | null }>;
  messages: ConversationMessage[];
  deal: { id: string; status: string; value: number | null } | null;
  sources: ContextSource[];
}

export interface GatewayDeps {
  authorize?: (req: Request) => Promise<{ userId: string } | Response>;
  /** Chama uma edge irmã com o JWT do chamador. */
  callCapability?: (
    functionName: string,
    body: Record<string, unknown>,
    jwt: string,
  ) => Promise<{ status: number; body: unknown }>;
  readContext?: (userId: string, contactId: string | null) => Promise<SharedContext>;
  /** Capacidade ligada? Ausente = ligada (mesma regra de `ai-feature-flags`). */
  capabilityEnabled?: (functionName: string) => Promise<boolean>;
  enforceGuards?: (opts: { functionName: string; userId: string; req: Request }) => Promise<Response | null>;
}

/** Texto livre do pedido, sem confiar no tipo do JSON. */
function readQuery(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const query = (body as { query?: unknown }).query;
  return typeof query === "string" ? query.slice(0, 2000) : "";
}

function readContactId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const contactId = (body as { contactId?: unknown }).contactId;
  return typeof contactId === "string" && contactId.length > 0 ? contactId : null;
}

/**
 * Contexto compartilhado. Cada leitura é isolada: uma falha entra em `sources`
 * como erro e as outras seguem — a resposta degrada, não desaparece.
 */
export async function loadSharedContext(
  supabase: SupabaseClient,
  userId: string,
  contactId: string | null,
): Promise<SharedContext> {
  const sources: ContextSource[] = [];

  const profileReq = supabase
    .from("assistant_profiles")
    .select("atividade, foco, ajuda, tom")
    .eq("user_id", userId)
    .maybeSingle();

  const contactReq = contactId
    ? supabase.from("contacts").select("name").eq("id", contactId).maybeSingle()
    : null;

  const agendaReq = contactId
    ? supabase
        .from("conversation_tasks")
        .select("title, remind_at")
        .eq("contact_id", contactId)
        .not("remind_at", "is", null)
        .not("status", "in", "(done,cancelled)")
        .order("remind_at", { ascending: true })
        .limit(5)
    : null;

  const messagesReq = contactId
    ? supabase
        .from("messages")
        .select("sender, content, created_at")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT)
    : null;

  const dealReq = contactId
    ? supabase
        .from("sales_deals")
        .select("id, status, value")
        .eq("contact_id", contactId)
        .eq("status", "open")
        .limit(1)
    : null;

  const [profileRes, contactRes, agendaRes, messagesRes, dealRes] = await Promise.all([
    profileReq,
    contactReq ?? Promise.resolve({ data: null, error: null }),
    agendaReq ?? Promise.resolve({ data: [] as unknown[], error: null }),
    messagesReq ?? Promise.resolve({ data: [] as unknown[], error: null }),
    dealReq ?? Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  const contactName = ((contactRes.data as { name?: string } | null)?.name ?? null);
  if (!contactId) {
    sources.push({ kind: "contato", origin: "contacts", rows: 0, error: "sem contato no pedido" });
  } else if (contactRes.error) {
    sources.push({ kind: "contato", origin: "contacts", rows: 0, error: String(contactRes.error.message ?? "erro") });
  } else {
    sources.push({ kind: "contato", origin: "contacts", rows: contactName ? 1 : 0 });
  }

  if (profileRes.error) {
    sources.push({ kind: "perfil", origin: "assistant_profiles", rows: 0, error: String(profileRes.error.message ?? "erro") });
  } else {
    sources.push({ kind: "perfil", origin: "assistant_profiles", rows: profileRes.data ? 1 : 0 });
  }

  const agenda = (agendaRes.data ?? []) as Array<{ title: string; remind_at: string | null }>;
  if (!contactId) {
    sources.push({ kind: "agenda", origin: "conversation_tasks", rows: 0, error: "sem contato no pedido" });
  } else if (agendaRes.error) {
    sources.push({ kind: "agenda", origin: "conversation_tasks", rows: 0, error: String(agendaRes.error.message ?? "erro") });
  } else {
    sources.push({ kind: "agenda", origin: "conversation_tasks", rows: agenda.length });
  }

  // A leitura vem em ordem decrescente (mais recente primeiro); o prompt espera
  // ordem cronológica.
  const messages = ((messagesRes.data ?? []) as ConversationMessage[]).slice().reverse();
  if (!contactId) {
    sources.push({ kind: "conversa", origin: "messages", rows: 0, error: "sem contato no pedido" });
  } else if (messagesRes.error) {
    sources.push({ kind: "conversa", origin: "messages", rows: 0, error: String(messagesRes.error.message ?? "erro") });
  } else {
    sources.push({ kind: "conversa", origin: "messages", rows: messages.length });
  }

  const deals = (dealRes.data ?? []) as Array<{ id: string; status: string; value: number | null }>;
  if (!contactId) {
    sources.push({ kind: "negocio", origin: "sales_deals", rows: 0, error: "sem contato no pedido" });
  } else if (dealRes.error) {
    sources.push({ kind: "negocio", origin: "sales_deals", rows: 0, error: String(dealRes.error.message ?? "erro") });
  } else {
    sources.push({ kind: "negocio", origin: "sales_deals", rows: deals.length });
  }

  const perfil = (profileRes.data ?? null) as SharedContext["profile"];

  return {
    contactId,
    contactName,
    profile: perfil,
    agenda,
    messages,
    deal: deals[0] ?? null,
    sources,
  };
}

/** Parametriza o prompt de identidade (Fase 1) para quem está do outro lado. */
export function contextBlock(ctx: SharedContext): string {
  const linhas: string[] = [];
  if (ctx.profile) {
    linhas.push(`Atuação do vendedor: ${ctx.profile.atividade ?? "não informada"}.`);
    linhas.push(`Foco dele: ${ctx.profile.foco ?? "não informado"}.`);
    linhas.push(`Tom preferido: ${ctx.profile.tom ?? "não informado"}.`);
  } else {
    // Sem perfil a resposta continua, mas sem fingir personalização.
    linhas.push("Perfil do vendedor: não configurado (resposta sem personalização).");
  }
  // Fase 4: o treino da atuação entra no mesmo bloco que já vai para as edges
  // de capacidade — sem canal novo e sem duplicar o prompt em cada uma.
  const treino = playbookPromptBlock(playbookFor(ctx.profile?.atividade as AssistantAtuacao | null));
  if (treino) linhas.push(treino);
  if (ctx.agenda.length > 0) {
    linhas.push(
      `Compromissos futuros com este contato: ${ctx.agenda
        .map((a) => `${a.title}${a.remind_at ? ` (${new Date(a.remind_at).toLocaleString("pt-BR")})` : ""}`)
        .join("; ")}.`,
    );
  }
  if (ctx.deal) linhas.push(`Negócio aberto: ${ctx.deal.id}${ctx.deal.value !== null ? ` (R$ ${ctx.deal.value})` : ""}.`);
  return linhas.join("\n");
}

/** Corpo enviado a cada edge de capacidade (todos os schemas aceitam este formato). */
export function capabilityPayload(capability: AssistantCapability, ctx: SharedContext): Record<string, unknown> {
  const messages = ctx.messages.slice(-MODEL_MESSAGES_LIMIT).map((m) => ({
    sender: m.sender,
    content: m.content,
    created_at: m.created_at ?? undefined,
  }));
  const context = contextBlock(ctx).slice(0, 500);
  return {
    messages,
    context,
    requestId: undefined,
  };
}

/**
 * Junta as respostas numa frase + os pedaços. O texto NÃO é gerado por modelo
 * aqui: cada pedaço é o que a capacidade devolveu, e `sources` diz de onde veio.
 */
export interface GatewayPiece {
  capability: AssistantCapability;
  label: string;
  origin: string;
  /** Corpo devolvido pela capacidade (ou `null` quando falhou). */
  data: unknown;
  error?: string;
}

export interface GatewayAnswer {
  answer: string;
  pieces: GatewayPiece[];
  capabilities: AssistantCapability[];
  sources: ContextSource[];
  errors: string[];
}

/** Recorta um texto curto de um corpo arbitrário para a frase final. */
function trecho(data: unknown, chaves: readonly string[]): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  for (const c of chaves) {
    const v = obj[c];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
    if (Array.isArray(v) && v.length > 0) {
      const primeiro = v[0];
      if (typeof primeiro === "string" && primeiro.trim()) return primeiro.trim();
      if (primeiro && typeof primeiro === "object") {
        const texto = (primeiro as Record<string, unknown>).text ?? (primeiro as Record<string, unknown>).content;
        if (typeof texto === "string" && texto.trim()) return texto.trim();
      }
    }
  }
  return null;
}

export function composeAnswer(pieces: GatewayPiece[], ctx: SharedContext): string {
  const partes: string[] = [];
  for (const p of pieces) {
    if (p.error) continue;
    if (p.capability === "agenda") {
      partes.push(
        ctx.agenda.length > 0
          ? `Agenda: ${ctx.agenda.map((a) => a.title).join("; ")}.`
          : "Agenda: nenhum compromisso futuro com este contato.",
      );
      continue;
    }
    const t = trecho(p.data, ["summary", "resumo", "recommendedAction", "nextBestOffer", "suggestion", "suggestions", "answer", "text", "deadlineText", "deadline", "temperature"]);
    if (t) partes.push(`${p.label}: ${t}`);
  }
  if (partes.length === 0) {
    return "Não foi possível montar uma resposta: todas as fontes falharam.";
  }
  return partes.join(" ");
}

/**
 * Garante que a pergunta segue o contrato de cada edge: `ai-conversation-summary`
 * exige no mínimo 5 mensagens (`AiConversationSummarySchema`). Sem histórico
 * suficiente, o resumo é recusado ANTES da chamada, com motivo explícito — em vez
 * de um 400 genérico da edge.
 */
export function capabilityBlockedReason(capability: AssistantCapability, ctx: SharedContext): string | null {
  if (capability === "resumo_conversa" && ctx.messages.length < 5) {
    return `histórico insuficiente para resumir (${ctx.messages.length} de 5 mensagens)`;
  }
  if (MODEL_CAPABILITIES.includes(capability) && ctx.messages.length === 0) {
    return "sem mensagens na conversa para esta capacidade";
  }
  return null;
}

export async function handleAssistantGateway(req: Request, deps: GatewayDeps = {}): Promise<Response> {
  const cors = handleCors(req);
  if (cors) return cors;

  const authorize = deps.authorize ?? requireAuth;
  const authCheck = await authorize(req);
  if (authCheck instanceof Response) return authCheck;
  const userId = (authCheck as { userId: string }).userId;

  const guards = deps.enforceGuards ?? enforceAiGuards;
  const guardResponse = await guards({ functionName: "assistant-gateway", userId, req });
  if (guardResponse) return guardResponse;

  const log = new Logger("assistant-gateway");

  try {
    const body = await req.json().catch(() => null);
    const query = readQuery(body);
    if (!query.trim()) {
      return errorResponse("Informe o pedido em 'query'.", 400, req);
    }
    const contactId = readContactId(body);

    const signals = readIntent(query);

    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const callCapability = deps.callCapability;
    if (!callCapability) {
      return errorResponse("Porta única sem canal para as capacidades (configuração).", 500, req);
    }

    const ctx = deps.readContext
      ? await deps.readContext(userId, contactId)
      : { contactId, contactName: null, profile: null, agenda: [], messages: [], deal: null, sources: [] } as SharedContext;

    // A rota depende do perfil: pedido vago abre o que o treino da atuação marca
    // como prioritário (Fase 4). Por isso ela vem DEPOIS da leitura de contexto.
    const capabilities = routeCapabilities(
      signals,
      // Sem perfil configurado não há treino: a rota vaga volta ao mínimo útil
      // em vez de assumir a atuação default como se fosse escolha da pessoa.
      ctx.profile ? playbookFor(ctx.profile.atividade).prioritarias as AssistantCapability[] : [],
    );
    log.info("assistant-gateway roteou", { capabilities, contactId });

    const enabled = deps.capabilityEnabled ?? (async () => true);
    const errors: string[] = [];
    const pieces: GatewayPiece[] = [];

    // `agenda` não chama modelo: o dado já está no contexto compartilhado.
    const toCall: AssistantCapability[] = [];
    for (const cap of capabilities) {
      const blocked = capabilityBlockedReason(cap, ctx);
      if (blocked) {
        errors.push(`${CAPABILITY_LABELS[cap]}: ${blocked}`);
        continue;
      }
      if (cap === "agenda") {
        pieces.push({
          capability: cap,
          label: CAPABILITY_LABELS[cap],
          origin: "conversation_tasks",
          data: { agenda: ctx.agenda },
        });
        continue;
      }
      toCall.push(cap);
    }

    // Capacidades de modelo em paralelo: todas usam o MESMO contexto (é o
    // "contexto compartilhado" da fase) e a mesma chave de capacidade da edge
    // chamada — desligar a capacidade desliga as duas pontas.
    const respostas = await Promise.all(
      toCall.map(async (cap) => {
        const fn = CAPABILITY_FUNCTION[cap as Exclude<AssistantCapability, "agenda">];
        const flagKey = capabilityFlagKeyForFunction(fn) ?? "sem flag registrada";
        if (!(await enabled(fn))) {
          return { cap, fn, flagKey, skipped: true as const };
        }
        const res = await callCapability(fn, capabilityPayload(cap, ctx), jwt);
        return { cap, fn, flagKey, skipped: false as const, res };
      }),
    );

    for (const r of respostas) {
      if (r.skipped) {
        errors.push(`${CAPABILITY_LABELS[r.cap]}: desligada (${r.flagKey})`);
        continue;
      }
      if (r.res.status < 200 || r.res.status >= 300) {
        const detalhe = trecho(r.res.body, ["error", "message"]) ?? `HTTP ${r.res.status}`;
        errors.push(`${CAPABILITY_LABELS[r.cap]}: ${detalhe}`);
        pieces.push({
          capability: r.cap,
          label: CAPABILITY_LABELS[r.cap],
          origin: r.fn,
          data: null,
          error: detalhe,
        });
        continue;
      }
      pieces.push({
        capability: r.cap,
        label: CAPABILITY_LABELS[r.cap],
        origin: r.fn,
        data: r.res.body,
      });
    }

    const answer = composeAnswer(pieces, ctx);
    log.done(200);

    return jsonResponse(
      {
        answer,
        pieces,
        capabilities,
        sources: ctx.sources,
        errors,
        requestId: (body as { requestId?: unknown } | null)?.requestId ?? null,
      },
      200,
      req,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log.error("Unhandled error", { error: message });
    return errorResponse(message, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    return handleAssistantGateway(req, {
      readContext: (userId, contactId) => {
        const supabase = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: `Bearer ${anonKey}` } },
        });
        return loadSharedContext(supabase, userId, contactId);
      },
      callCapability: async (functionName, payload, jwt) => {
        const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
          body: JSON.stringify(payload),
        });
        return { status: res.status, body: await res.json().catch(() => null) };
      },
      // Mesma regra de `enforceAiCapability`: leitura falhou ou valor não booleano
      // conta como DESLIGADA (fail-closed). Função sem capacidade declarada segue.
      capabilityEnabled: async (functionName) => {
        const flagKey = capabilityFlagKeyForFunction(functionName);
        // Sem capacidade declarada a função não tem interruptor: segue.
        if (!flagKey) return true;
        // `readCapabilityFlag` devolve `boolean | null`: `null` (falha) NÃO liga.
        const enabled = await readCapabilityFlag(flagKey);
        return enabled === true;
      },
    });
  });
}