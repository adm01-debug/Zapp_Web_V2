/**
 * away-message.ts — consumidor da mensagem automática de ausência por conexão.
 *
 * R2-API-045 (item #219 do BACKLOG_VERIFICADO): o `BusinessHoursDialog` promete
 * "Esta mensagem será enviada automaticamente quando clientes entrarem em
 * contato fora do expediente" e o `useBusinessHours` grava `away_messages`
 * (content/is_enabled) e `business_hours` por conexão — mas nenhuma Edge
 * Function lia essas tabelas: a configuração era persistida e nada entregava.
 * Este módulo é o consumidor que faltava; o webhook de entrada
 * (`handleIncomingMessage`) o chama a cada mensagem RECEBIDA já ingerida.
 *
 * Contratos (cada um com teste em __tests__/away-message.test.ts):
 * - `is_enabled = false`, conteúdo vazio ou configuração ausente → NENHUM envio;
 * - dentro do expediente → NENHUM envio (quem responde é o atendente);
 * - sem linhas de `business_hours` para a conexão → NÃO envia: o consumidor não
 *   adivinha horário (mesmo desenho "fecha quando não dá para decidir" do #121A);
 * - uma resposta por contato a cada 24 h: quem escreve várias vezes no mesmo
 *   período fechado não recebe a mesma mensagem repetida;
 * - FUSO: `business_hours` não tem coluna de fuso, então vale o default do
 *   produto (`America/Sao_Paulo`, o mesmo DEFAULT_SCHEDULE_TIMEZONE do Talk X);
 * - variável não suportada (`{qualquer}`) ou texto que fica vazio depois da
 *   substituição → NÃO envia: cliente real nunca recebe placeholder nem vazio;
 * - sai pelo token da INSTÂNCIA (`get_instance_token`); sem token, não envia —
 *   nunca cai na key global do administrador (E15);
 * - o desfecho é classificado pelo que o provedor respondeu (accepted /
 *   rejected / unknown), como em R2-API-008: 4xx/5xx ou queda de transporte
 *   jamais são anunciados como envio.
 */
import { DEFAULT_SCHEDULE_TIMEZONE, localClockInTimezone } from "./talkx-window.ts";
import { evoFetch } from "./evolution-send.ts";
import type { EvolutionDbClient } from "./evolution-types.ts";

const AWAY_LOG = "[AWAY]";

/** `business_hours` não guarda fuso; vale o default do produto. */
export const AWAY_MESSAGE_TIMEZONE = DEFAULT_SCHEDULE_TIMEZONE;

/** Intervalo mínimo entre duas mensagens de ausência para o MESMO contato. */
export const AWAY_REPLY_COOLDOWN_MS = 24 * 60 * 60 * 1_000;

/** Linha de `away_messages` da conexão, já validada. */
export interface AwayConfig {
  content: string;
  isEnabled: boolean;
}

/** Uma linha de `business_hours` (uma por dia da semana 0=domingo). */
export interface BusinessHourRow {
  day_of_week: number;
  is_open: boolean;
  open_time: string | null;
  close_time: string | null;
}

/** Variáveis oferecidas pelo diálogo para a mensagem de ausência. */
export interface AwayVariables {
  nome?: string | null;
  horario_abertura?: string | null;
  horario_fechamento?: string | null;
}

export interface AwayMessageRequest {
  /** Conexão dona da conversa (away_messages/business_hours são por conexão). */
  connectionId: string;
  /** Instância Evolution que recebeu a mensagem — define o token de envio. */
  instance: string;
  /** Telefone já normalizado do contato. */
  phone: string;
  contactId?: string | null;
  contactName?: string | null;
  /** Relógio injetável (teste determinístico); default: agora. */
  now?: Date;
}

export type AwayOutcome = "sent" | "skipped" | "rejected" | "unknown";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * "HH:MM" (o PostgREST devolve `time` como "HH:MM:SS") em minutos desde a
 * meia-noite. Qualquer outra coisa → null (e quem decide fecha a janela).
 */
export function minutesOfDay(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])(?::[0-5][0-9])?$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** "HH:MM" normalizado (o `time` do PostgREST vem com segundos). */
export function formatTimeHhMm(value: unknown): string | null {
  const minutes = minutesOfDay(value);
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** `away_messages` da conexão → config; sem linha ou sem texto → null (não envia). */
export function parseAwayConfig(row: unknown): AwayConfig | null {
  if (!isRecord(row)) return null;
  const content = typeof row.content === "string" ? row.content.trim() : "";
  if (!content) return null;
  return { content, isEnabled: row.is_enabled === true };
}

/** Normaliza as linhas de `business_hours`, descartando dia fora de 0..6. */
export function parseBusinessHours(rows: unknown): BusinessHourRow[] {
  if (!Array.isArray(rows)) return [];
  const out: BusinessHourRow[] = [];
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    const dayOfWeek = Number(raw.day_of_week);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) continue;
    out.push({
      day_of_week: dayOfWeek,
      is_open: raw.is_open === true,
      open_time: typeof raw.open_time === "string" ? raw.open_time : null,
      close_time: typeof raw.close_time === "string" ? raw.close_time : null,
    });
  }
  return out;
}

/**
 * Estado do expediente AGORA.
 *   - `"open"`    → dentro do horário comercial;
 *   - `"closed"`  → fora do horário (é o único estado que produz envio);
 *   - `"unknown"` → não dá para decidir (sem horário configurado, fuso/relógio
 *     indisponível): fica fechado para envio, nunca "abre por omissão".
 */
export function businessHoursState(
  hours: BusinessHourRow[],
  now: Date = new Date(),
  timeZone: string = AWAY_MESSAGE_TIMEZONE,
): "open" | "closed" | "unknown" {
  if (!Array.isArray(hours) || hours.length === 0) return "unknown";
  const clock = localClockInTimezone(timeZone, now);
  if (!clock) return "unknown";
  const minutes = clock.hour * 60 + clock.minute;
  const rowFor = (day: number) => hours.find((h) => h.day_of_week === day) ?? null;

  const today = todayWindow(rowFor(clock.weekday));
  if (today && (today.open < today.close
    ? minutes >= today.open && minutes < today.close
    : minutes >= today.open)) {
    return "open";
  }

  // Janela que vira a meia-noite (abre 22:00, fecha 06:00) ainda vale na
  // madrugada seguinte — a metade da manhã pertence à linha de ONTEM.
  const yesterday = todayWindow(rowFor((clock.weekday + 6) % 7));
  if (yesterday && yesterday.open > yesterday.close && minutes < yesterday.close) {
    return "open";
  }
  return "closed";
}

/** Janela válida de uma linha, ou null quando o dia é fechado/inválido. */
function todayWindow(row: BusinessHourRow | null): { open: number; close: number } | null {
  if (!row || row.is_open !== true) return null;
  const open = minutesOfDay(row.open_time);
  const close = minutesOfDay(row.close_time);
  if (open === null || close === null || open === close) return null;
  return { open, close };
}

export type RenderedAwayContent =
  | { status: "ok"; content: string }
  | { status: "invalid"; reason: string };

/**
 * Substitui as variáveis oferecidas pelo diálogo. Devolve `invalid` quando o
 * texto não pode ir para um cliente real: sobrou `{...}` desconhecido ou o
 * resultado ficou vazio. Nome ausente apenas remove o token (sem deixar
 * "Olá ," — o espaço antes da pontuação é limpo).
 */
export function renderAwayContent(
  template: string,
  vars: AwayVariables = {},
): RenderedAwayContent {
  let content = template;
  const replaceAll = (text: string, token: string, value: unknown) => {
    const substitution = typeof value === "string" ? value.trim() : "";
    return text.split(token).join(substitution);
  };
  content = replaceAll(content, "{nome}", vars.nome);
  content = replaceAll(content, "{horario_abertura}", vars.horario_abertura);
  content = replaceAll(content, "{horario_fechamento}", vars.horario_fechamento);

  const unknown = /\{[^{}]*\}/.exec(content);
  if (unknown) return { status: "invalid", reason: `variavel_nao_suportada:${unknown[0]}` };

  content = content
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (!content) return { status: "invalid", reason: "conteudo_vazio" };
  return { status: "ok", content };
}

/**
 * Já mandamos ESTA mensagem de ausência para o contato nas últimas 24 h? É o
 * que impede repetir a resposta para quem escreve várias vezes no mesmo
 * período fechado (e é a mesma âncora usada no replay do webhook: o evento
 * repetido nem chega aqui, porque a ingestão devolve `duplicate`).
 *
 * Falha de leitura → trata como "já respondido": na dúvida, NÃO envia
 * mensagem a cliente real.
 */
async function alreadyRepliedRecently(
  supabase: EvolutionDbClient,
  connectionId: string,
  contactId: string,
  content: string,
  now: Date,
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - AWAY_REPLY_COOLDOWN_MS).toISOString();
  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("whatsapp_connection_id", connectionId)
    .eq("contact_id", contactId)
    .eq("sender", "agent")
    .eq("content", content)
    .gte("created_at", cutoff)
    .limit(1);
  if (error) {
    console.warn(`${AWAY_LOG} Falha ao conferir resposta anterior; envio cancelado:`, error.message);
    return true;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Consumidor: decide e envia (ou não) a mensagem de ausência de uma conexão.
 * NUNCA lança — falha de leitura, de token ou de provedor vira `skipped`/
 * `rejected`/`unknown` com registro, para não derrubar a ingestão da mensagem.
 */
export async function maybeSendAwayMessage(
  supabase: EvolutionDbClient,
  req: AwayMessageRequest,
): Promise<AwayOutcome> {
  const now = req.now ?? new Date();
  try {
    if (!req.contactId || !req.phone) return "skipped";

    const { data: configRow, error: configError } = await supabase
      .from("away_messages")
      .select("content, is_enabled")
      .eq("whatsapp_connection_id", req.connectionId)
      .maybeSingle();
    if (configError) {
      console.warn(`${AWAY_LOG} Falha ao ler away_messages; nada enviado:`, configError.message);
      return "skipped";
    }
    const config = parseAwayConfig(configRow);
    if (!config) return "skipped";
    if (!config.isEnabled) return "skipped";

    const { data: hourRows, error: hoursError } = await supabase
      .from("business_hours")
      .select("day_of_week, is_open, open_time, close_time")
      .eq("whatsapp_connection_id", req.connectionId);
    if (hoursError) {
      console.warn(`${AWAY_LOG} Falha ao ler business_hours; nada enviado:`, hoursError.message);
      return "skipped";
    }
    const hours = parseBusinessHours(hourRows);
    const state = businessHoursState(hours, now);
    if (state !== "closed") return "skipped";

    const clock = localClockInTimezone(AWAY_MESSAGE_TIMEZONE, now);
    const today = clock ? hours.find((h) => h.day_of_week === clock.weekday) ?? null : null;
    const renderAwayContentVars = {
      nome: req.contactName,
      horario_abertura: formatTimeHhMm(today?.open_time),
      horario_fechamento: formatTimeHhMm(today?.close_time),
    };
    const rendered = renderAwayContent(config.content, renderAwayContentVars);
    if (rendered.status === "invalid") {
      console.warn(`${AWAY_LOG} Conteúdo não utilizável (${rendered.reason}); nada enviado`);
      return "skipped";
    }

    if (await alreadyRepliedRecently(supabase, req.connectionId, req.contactId, rendered.content, now)) {
      console.warn(`${AWAY_LOG} Contato já recebeu a mensagem de ausência nas últimas 24h; não repete`);
      return "skipped";
    }

    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/+$/, "");
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY") ?? "";
    if (!evolutionUrl || !evolutionKey) {
      console.warn(`${AWAY_LOG} Provedor não configurado; nada enviado`);
      return "skipped";
    }

    // E15: a mensagem sai pelo token da INSTÂNCIA. Sem token não há envio —
    // a key global do administrador não é a credencial da instância.
    const { data: tokenData } = await supabase.rpc("get_instance_token", { p_instance_id: req.instance });
    const instanceToken = typeof tokenData === "string" && tokenData.length > 0 ? tokenData : null;
    if (!instanceToken) {
      console.warn(`${AWAY_LOG} Token da instância ausente — mensagem de ausência não enviada (${req.instance})`);
      return "skipped";
    }

    // R2-API-008: o Response é inspecionado antes de anunciar envio. 4xx/5xx não
    // pode virar "enviada" no log; queda de transporte é desfecho `unknown`.
    const resp = await evoFetch(evolutionUrl, evolutionKey, "/message/sendText/" + req.instance, {
      number: req.phone,
      text: rendered.content,
      delay: 500,
    }, undefined, undefined, AbortSignal.timeout(15000), instanceToken);
    if (!resp.ok) {
      const detalhe = (await resp.text().catch(() => "")).slice(0, 200);
      console.warn(
        `${AWAY_LOG} Mensagem de ausência RECUSADA pelo provedor (rejected, status ${resp.status})` +
          (detalhe ? " — " + detalhe : ""),
      );
      return "rejected";
    }
    console.warn(`${AWAY_LOG} Mensagem de ausência enviada (accepted, status ${resp.status})`);
    return "sent";
  } catch (err) {
    console.warn(
      `${AWAY_LOG} Mensagem de ausência sem resposta do provedor (unknown):`,
      err instanceof Error ? err.message : String(err),
    );
    return "unknown";
  }
}
