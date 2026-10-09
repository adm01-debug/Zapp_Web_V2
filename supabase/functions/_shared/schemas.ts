/**
 * Shared Zod schemas for Edge Function input validation.
 * Import: import { z, parseBody, ... } from "../_shared/schemas.ts";
 */
import { z } from "https://esm.sh/zod@3.23.8";
// E45: a lista de ações válidas do `evolution-api` NÃO é reescrita aqui — vem
// dos conjuntos que o próprio handler usa para autorizar (fonte única).
import { CONTROL_ACTIONS, READ_ACTIONS, SEND_ACTIONS } from "./evolution-control-authz.ts";

export { z };

// ─── Common reusable schemas ─────────────────────────────────
export const UUIDSchema = z.string().uuid("Must be a valid UUID");
export const EmailSchema = z.string().email("Invalid email").max(255);
const stripUnsafeControlCharacters = (value: string) => Array.from(value)
  .filter(character => {
    const code = character.charCodeAt(0);
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
  })
  .join('');

export const SafeStringSchema = (maxLen = 10000) => z.string().max(maxLen).transform(s => stripUnsafeControlCharacters(s).trim());

// ─── AI function schemas ─────────────────────────────────────
// ─── Contrato de contexto de conversa (IA-024) ───────────────
// O frontend (src/components/inbox/AIConversationAssistant.tsx:89-101 e
// src/components/inbox/chat/ChatToolPanels.tsx:32) envia id/type/created_at e
// periodDays; antes esses campos eram descartados em silêncio pelo zod (.strip).
export const CONTEXT_CONTRACT_VERSION = 2 as const;

/** Tetos do contexto enviado ao modelo. Excedente é REJEITADO com 422,
 *  nunca truncado em silêncio (aceite do IA-024). */
export const CONTEXT_LIMITS = {
  maxMessages: 200,
  maxTotalChars: 120000,
  maxSingleMessageChars: 5000,
  maxMessagesInPromptChars: 1000,
} as const;

export const MessageSchema = z.object({
  id: z.string().max(100).optional(),
  sender: z.string().max(50).optional(),
  content: z.string().max(5000).optional(),
  created_at: z.string().max(40).optional(),
  /** O front envia `type`; `message_type` é aceito como legado. */
  type: z.string().max(50).optional(),
  message_type: z.string().max(50).optional(),
  mediaUrl: z.string().max(2048).optional(),
});

export type ConversationContextBudget = {
  version: typeof CONTEXT_CONTRACT_VERSION;
  messageCount: number;
  totalChars: number;
  periodDays: number | null;
};

/** Mede o contexto aceito — usado no envelope de resposta (IA-025) para o
 *  frontend saber exatamente o que foi analisado (versão + recorte). */
export function measureConversationContext(
  messages: Array<{ content?: string }>,
  periodDays?: number | null,
): ConversationContextBudget {
  const totalChars = messages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
  return {
    version: CONTEXT_CONTRACT_VERSION,
    messageCount: messages.length,
    totalChars,
    periodDays: typeof periodDays === 'number' ? periodDays : null,
  };
}

/** Refinamento compartilhado: recusa o contexto que estoura os tetos agregados. */
function withConversationBudget<T extends z.ZodTypeAny>(schema: T): T {
  return schema.superRefine((payload: unknown, ctx: z.RefinementCtx) => {
    const p = payload as { messages?: Array<{ content?: string }>; periodDays?: number };
    const messages = Array.isArray(p?.messages) ? p.messages : [];
    const { totalChars } = measureConversationContext(messages, p?.periodDays);
    if (totalChars > CONTEXT_LIMITS.maxTotalChars) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['messages'],
        message: `Contexto acima do limite agregado de ${CONTEXT_LIMITS.maxTotalChars} caracteres (recebido ${totalChars}). Reduza o período ou o número de mensagens.`,
      });
    }
  }) as unknown as T;
}

// ─── IA-048: identidade de requisição e versão de contexto ───
// `requestId` (uuid) identifica UM clique de IA; o cliente descarta a resposta
// quando o `requestId` que volta não é o da requisição vigente. `contextVersion`
// é o nome semântico do servidor para o identificador de contexto/versão; o
// cliente o chama de `periodKey` (contato + período escolhido) — os dois nomes
// são aceitos para o backend não depender de um rename no frontend.
//
// COMPATIBILIDADE (decidida): todo campo novo é OPCIONAL e o zod descarta
// chaves desconhecidas. Um cliente antigo (que não envia nenhum dos dois)
// continua validando e funcionando exatamente como antes — não há campo
// obrigatório novo, então nada quebra. Quando presente, o `requestId` é
// VALIDADO como uuid: um id malformado falha alto em vez de ser ecoado como
// lixo, pois um id inválido inutiliza a lógica de descarte do cliente.
// `contextVersion` é a versão do contexto (contato + período escolhido) que o
// cliente analisou; também opcional, e é o token que a revalidação do servidor
// compara antes de aplicar qualquer efeito.
export const AiSuggestReplySchema = z.object({
  messages: z.array(MessageSchema).max(50).optional(),
  contactName: z.string().max(200).optional().default('Cliente'),
  contactId: z.string().uuid().optional().nullable(),
  context: z.string().max(500).optional(),
  requestId: z.string().uuid("requestId must be a valid UUID").optional(),
});

export const AiEnhanceMessageSchema = z.object({
  message: z.string().min(1, "Mensagem é obrigatória").max(4096),
  tone: z.enum(['professional', 'casual', 'persuasive', 'empathetic', 'concise', 'detailed']).optional().default('professional'),
  contactName: z.string().max(200).optional(),
  requestId: z.string().uuid("requestId must be a valid UUID").optional(),
});

export const AiConversationAnalysisSchema = withConversationBudget(z.object({
  messages: z.array(MessageSchema).min(5, "Conversation must have at least 5 messages").max(200),
  contactName: z.string().max(200).optional(),
  contactId: z.string().uuid().optional().nullable(),
  /** Recorte pedido pelo usuário na UI (PeriodFilterSelector) — antes era
   *  descartado e o modelo analisava sem saber a janela de tempo. */
  periodDays: z.number().int().min(1).max(365).optional(),
  /** IA-048: identidade da requisição, ecoada no envelope para o cliente
   *  descartar resposta superada. Opcional (compatibilidade com cliente antigo). */
  requestId: z.string().uuid("requestId must be a valid UUID").optional(),
  /** IA-048: versão do contexto (contato + período) declarada pelo cliente.
   *  O servidor a compara com a versão corrente do contato ANTES de persistir.
   *  `periodKey` é o nome canônico do frontend (`src/lib/aiRequest/context.ts`)
   *  para o mesmo conceito; aceito como apelido para o contrato não exigir
   *  rename dos dois lados. Token opaco é permitido (não é data). */
  contextVersion: z.string().max(200).optional(),
  periodKey: z.string().max(200).optional(),
}));

export const AiAutoTagSchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  messages: z.array(MessageSchema).max(100).optional(),
});

export const AiChurnAnalysisSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1, "contactIds é obrigatório").max(50),
});

export const AiClassifyTicketsSchema = z.object({
  limit: z.number().int().min(1).max(200).optional().default(50),
});

// ─── ElevenLabs schemas ──────────────────────────────────────
export const ElevenLabsTTSSchema = z.object({
  text: z.string().min(1, "Text is required").max(5000),
  voiceId: z.string().max(100).optional(),
  modelId: z.string().max(100).optional(),
  languageCode: z.string().max(10).optional(),
  applyTextNormalization: z.string().max(20).optional(),
});

export const ElevenLabsSFXSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(2000),
  duration: z.number().min(1).max(300).optional(),
  mode: z.enum(['sfx', 'music']).optional().default('sfx'),
});

export const ElevenLabsDialogueSchema = z.object({
  script: z.array(z.object({
    voice_id: z.string().min(1, "voice_id is required").max(100),
    text: z.string().min(1, "text is required").max(5000),
  })).min(1, "Script is required"),
  languageCode: z.string().max(10).optional().default('pt'),
});

export const ElevenLabsVoiceDesignPreviewSchema = z.object({
  action: z.literal('preview').optional(),
  description: z.string().min(1, "Voice description is required").max(1000),
  text: z.string().max(2000).optional(),
});

export const ElevenLabsVoiceDesignCreateSchema = z.object({
  action: z.literal('create'),
  voice_name: z.string().min(1, "Voice name is required").max(255),
  voice_description: z.string().max(1000).optional(),
  generated_voice_id: z.string().min(1, "Generated voice ID is required").max(255),
  labels: z.record(z.string()).optional(),
});

// ─── Transcription schemas ───────────────────────────────────
const ALLOWED_LANGUAGES = ['por', 'eng', 'spa', 'fra', 'deu', 'ita', 'jpn', 'kor', 'zho', 'ara', 'hin', 'rus'] as const;
export const TranscribeAudioSchema = z.object({
  audioUrl: z.string().url("Invalid audio URL").max(2048),
  messageId: z.string().max(100).optional(),
  languageCode: z.enum(ALLOWED_LANGUAGES).optional().default('por'),
  enableDiarization: z.boolean().optional().default(false),
  tagAudioEvents: z.boolean().optional().default(true),
});

// ─── Classifier schemas ──────────────────────────────────────
export const ClassifyAudioMemeSchema = z.object({
  audio_url: z.string().url().max(2048).optional().nullable(),
  file_name: z.string().max(500).optional().nullable(),
});

export const ClassifyEmojiSchema = z.object({
  image_url: z.string().url().max(2048).optional().nullable(),
  file_name: z.string().max(500).optional().nullable(),
});

export const ClassifyStickerSchema = z.object({
  image_url: z.string().url().max(2048).optional().nullable(),
});

// ─── Email schemas ───────────────────────────────────────────
export const SendEmailSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email()).min(1).max(50)]),
  subject: z.string().min(1, "Subject is required").max(500),
  html: z.string().max(100000).optional(),
  text: z.string().max(100000).optional(),
  from: z.string().max(255).optional(),
  reply_to: z.string().email().optional(),
  cc: z.array(z.string().email()).max(20).optional(),
  bcc: z.array(z.string().email()).max(20).optional(),
  attachments: z.array(z.object({
    filename: z.string().max(255),
    content: z.string(), // base64
    content_type: z.string().max(100).optional(),
  })).max(10).optional(),
});

// ─── Sentiment Alert ─────────────────────────────────────────
export const SentimentAlertSchema = z.object({
  contactId: z.string().uuid(),
  contactName: z.string().max(200),
  sentimentScore: z.number().min(0).max(100),
  previousScore: z.number().min(0).max(100).optional(),
  analysisId: z.string().uuid(),
  agentEmail: z.string().email().optional(),
  threshold: z.number().min(0).max(100).optional().default(30),
  consecutiveRequired: z.number().int().min(1).max(10).optional().default(2),
});

// ─── Rate Limit Alert ────────────────────────────────────────
export const RateLimitAlertSchema = z.object({
  ip_address: z.string().max(45),
  endpoint: z.string().max(500),
  request_count: z.number().int().min(1),
  blocked: z.boolean(),
});

// ─── Password Reset ──────────────────────────────────────────
export const ApprovePasswordResetSchema = z.object({
  requestId: z.string().uuid("requestId must be a valid UUID"),
  action: z.enum(["approve", "reject"]),
  rejectionReason: z.string().max(500).optional(),
});

// ─── Conversation Analysis / Summary ─────────────────────────
export const AiConversationSummarySchema = withConversationBudget(z.object({
  messages: z.array(MessageSchema).min(5, "Conversation must have at least 5 messages").max(200),
  contactName: z.string().max(200).optional(),
  contactId: z.string().uuid().optional().nullable(),
  periodDays: z.number().int().min(1).max(365).optional(),
  /** IA-048: ver os comentários em `AiConversationAnalysisSchema`. */
  requestId: z.string().uuid("requestId must be a valid UUID").optional(),
  contextVersion: z.string().max(200).optional(),
  periodKey: z.string().max(200).optional(),
}));

// ─── Chatbot L1 ──────────────────────────────────────────────
export const ChatbotL1Schema = z.object({
  contactId: z.string().uuid("contactId must be a valid UUID"),
  message: z.string().min(1, "Message is required").max(5000),
  connectionId: z.string().uuid().optional().nullable(),
});

// ─── Device Detection ────────────────────────────────────────
export const DetectNewDeviceSchema = z.object({
  device_fingerprint: z.string().min(1).max(500),
  browser: z.string().max(200),
  os: z.string().max(200),
  device_name: z.string().max(200),
});

// ─── Scheduled Report ────────────────────────────────────────
export const ScheduledReportSchema = z.object({
  reportId: z.string().uuid("reportId must be a valid UUID"),
});

// ─── Gmail Send ──────────────────────────────────────────────
// IDs reais do Gmail (message/thread) sao strings opacas alfanumericas
// (hex/base64url), sempre curtas. Restringe o charset a algo que nao permite
// injecao de path (/, ?, #, espaco) quando interpolado direto na URL da API.
const GMAIL_ID_RE = /^[0-9A-Za-z_-]{1,100}$/;
const GmailHeaderValueSchema = z.string().max(1000).refine(value => !/[\r\n]/.test(value), 'Quebra de linha nao permitida em cabecalho');
const GMAIL_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const GmailAttachmentsSchema = z.array(z.object({
  filename: z.string().min(1).max(255).refine(value => !/[\r\n\\/"]/.test(value), 'Nome de anexo invalido'),
  mimeType: z.string().max(100).regex(/^[\w.+-]+\/[\w.+-]+$/),
  content: z.string().max(36_000_000).regex(/^[A-Za-z0-9+/]*={0,2}$/),
})).max(10).superRefine((attachments, context) => {
  const totalBytes = attachments.reduce((total, attachment) => {
    const padding = attachment.content.endsWith('==') ? 2 : attachment.content.endsWith('=') ? 1 : 0;
    return total + Math.max(0, Math.floor(attachment.content.length * 3 / 4) - padding);
  }, 0);
  if (totalBytes > GMAIL_MAX_ATTACHMENT_BYTES) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Tamanho total dos anexos excede 25MB' });
  }
});

export const GmailSendActionSchema = z.object({
  action: z.enum(['send', 'reply', 'create-draft', 'update-draft', 'delete-draft', 'modify-labels', 'modify-thread-labels', 'mark-read', 'trash', 'trash-thread']),
  account_id: z.string().uuid("account_id must be a valid UUID"),
  to: z.union([GmailHeaderValueSchema, z.array(GmailHeaderValueSchema).max(100)]).optional(),
  cc: z.array(GmailHeaderValueSchema).max(100).optional(),
  bcc: z.array(GmailHeaderValueSchema).max(100).optional(),
  subject: GmailHeaderValueSchema.optional(),
  text_body: z.string().max(100000).optional(),
  html_body: z.string().max(500000).optional(),
  // IDs do Gmail sao interpolados direto na URL (/messages/{id}/modify,
  // /threads/{id}/trash, etc.) em varios cases do handler — regex fecha
  // injecao de path (/, ?, #, espaco) na validacao, uma vez, pra todos eles.
  thread_id: z.string().max(100).regex(GMAIL_ID_RE, 'Formato de thread_id invalido').optional(),
  message_id: z.string().max(100).regex(GMAIL_ID_RE, 'Formato de message_id invalido').optional(),
  draft_id: z.string().max(100).regex(GMAIL_ID_RE, 'Formato de draft_id invalido').optional(),
  message_ids: z.array(z.string().max(100).regex(GMAIL_ID_RE, 'Formato de message_id invalido')).max(100).optional(),
  add_labels: z.array(z.string()).max(50).optional(),
  remove_labels: z.array(z.string()).max(50).optional(),
  attachments: GmailAttachmentsSchema.optional(),
});

// ─── Gmail OAuth ─────────────────────────────────────────────
export const GmailOAuthActionSchema = z.object({
  action: z.enum(['get-auth-url', 'exchange-code', 'refresh-token', 'disconnect', 'list-accounts']),
  code: z.string().max(2000).optional(),
  account_id: z.string().uuid().optional(),
  state: z.string().max(500).optional(),
});

// ─── WebAuthn ────────────────────────────────────────────────
export const WebAuthnActionSchema = z.object({
  action: z.enum(['registration-options', 'verify-registration', 'authentication-options', 'verify-authentication']),
  userId: z.string().uuid().optional(),
  userEmail: z.string().email().optional(),
  userName: z.string().max(200).optional(),
  credential: z.record(z.unknown()).optional(),
  friendlyName: z.string().max(200).optional(),
});

// ─── External DB Bridge ─────────────────────────────────────
export const ExternalDbBridgeSchema = z.object({
  action: z.enum(['select', 'rpc', 'insert', 'update', 'delete']),
  table: z.string().max(100).optional(),
  rpc: z.string().max(100).optional(),
  params: z.record(z.unknown()).optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  offset: z.number().int().min(0).optional(),
  countMode: z.string().max(20).optional(),
});

// ─── IA-048: revalidação de contexto antes do efeito ─────────
// A trava de recência do banco compara `ai_projection_updated_at <= p_analyzed_at`;
// como `p_analyzed_at` era o `new Date()` do SERVIDOR, uma resposta ATRASADA de um
// contexto antigo chegava com timestamp MAIS NOVO e sobrescrevia a projeção. A
// correção revalida, IMEDIATAMENTE ANTES do efeito, que o contexto da requisição
// ainda é o vigente; se não for, nada é persistido e o envelope volta
// `status:'cancelled'` (vocabulário canônico — ver `src/lib/aiJobs/status.ts`).

/** Motivo de recusa: o contato deixou de ser visível ao usuário no meio do caminho. */
export const CONTACT_NOT_VISIBLE_REASON = 'contact_not_visible';
/** Motivo de recusa: uma projeção mais nova do contato tornou esta requisição obsoleta. */
export const CONTEXT_SUPERSEDED_REASON = 'context_superseded';

/**
 * Converte um valor em instante (epoch ms) ou `null` quando vazio/não-data.
 *
 * Um token OPACO (ex.: `'7d'`, `'custom:2026-01-01:2026-01-31'`) NÃO é tratado
 * como data — e por isso não provoca cancelamento. Sem essa guarda, um cliente
 * que mandasse um identificador não-temporal veria TODA análise ser cancelada.
 */
function toInstant(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export interface ContextVersionEvaluation {
  /** `true` quando a versão corrente avançou além da versão-base da requisição. */
  superseded: boolean;
  /** Versão-base efetiva (declarada pelo cliente ou lida no início da requisição). */
  baseline: string | null;
  /** Versão corrente lida imediatamente antes do efeito. */
  current: string | null;
}

/**
 * Decide se o contexto de uma requisição foi SUPERADO.
 *
 * Compara a versão-base (o que o cliente declarou em `contextVersion`; na falta,
 * a versão do contato `contacts.ai_projection_updated_at` lida quando o handler
 * começou) com a versão CORRENTE do contato, relida antes do efeito.
 *
 * Cada regra abaixo é um caso de teste — nenhuma delas cancela "no escuro":
 *   - sem versão corrente → não há projeção a sobrescrever, segue;
 *   - `versionAtRequestStart` AUSENTE e cliente sem versão válida → base
 *     desconhecida (leitura falhou): NÃO cancela, cancelar derrubaria análise
 *     legítima por um erro de leitura;
 *   - base nula + corrente presente → uma projeção apareceu DURANTE a requisição
 *     → superada;
 *   - corrente > base → superada; corrente <= base → vigente.
 */
export function evaluateContextVersionSupersession(input: {
  declaredVersion?: string | null;
  versionAtRequestStart?: string | null;
  currentVersion: string | null;
}): ContextVersionEvaluation {
  const declaredRaw = input.declaredVersion ?? null;
  const atStartRaw = input.versionAtRequestStart ?? null;
  const baselineRaw = declaredRaw ?? atStartRaw;
  const baseline = toInstant(declaredRaw) ?? toInstant(atStartRaw);
  const currentRaw = input.currentVersion ?? null;
  const current = toInstant(currentRaw);

  if (current === null) return { superseded: false, baseline: baselineRaw, current: currentRaw };
  if (input.versionAtRequestStart === undefined && toInstant(declaredRaw) === null) {
    return { superseded: false, baseline: null, current: currentRaw };
  }
  return { superseded: baseline === null || current > baseline, baseline: baselineRaw, current: currentRaw };
}

export type ContextRevalidationResult =
  | { current: true; reason: null; currentVersion: string | null | undefined }
  | { current: false; reason: string; currentVersion: string | null };

/**
 * Porta ÚNICA de "revalidar antes do efeito": reconfirma o CONTATO (ainda
 * visível ao usuário) e a VERSÃO do contexto; só então o efeito é permitido.
 *
 * As dependências entram como thunks para o módulo não conhecer banco nem rede
 * — é o que torna a decisão testável sem subir o handler. `loadCurrentVersion`
 * que lança é tratada como "não medido" (segue), nunca como cancelamento.
 */
export async function revalidateContextBeforeEffect(input: {
  expectedContactId: string;
  declaredVersion?: string | null;
  versionAtRequestStart?: string | null;
  reloadVisibleContactId: () => Promise<string | null>;
  loadCurrentVersion: () => Promise<string | null>;
}): Promise<ContextRevalidationResult> {
  const visible = await input.reloadVisibleContactId();
  if (visible !== input.expectedContactId) {
    return { current: false, reason: CONTACT_NOT_VISIBLE_REASON, currentVersion: null };
  }

  let currentVersion: string | null;
  try {
    currentVersion = await input.loadCurrentVersion();
  } catch {
    // Versão NÃO medida (`undefined`): a análise segue e é gravada, mas quem
    // persiste NÃO pode tentar a projeção — sem a versão esperada a trava do
    // banco não tem como decidir. `undefined` nunca é confundido com o `null`
    // medido de "o contato ainda não tem projeção" (R2-INF-023/D5).
    return { current: true, reason: null, currentVersion: undefined };
  }

  const evaluation = evaluateContextVersionSupersession({
    declaredVersion: input.declaredVersion,
    versionAtRequestStart: input.versionAtRequestStart,
    currentVersion,
  });
  if (evaluation.superseded) {
    return { current: false, reason: CONTEXT_SUPERSEDED_REASON, currentVersion: evaluation.current };
  }
  // A versão medida vai junto (R2-INF-023/D2): é ela que a RPC compara, sob
  // lock, com a versão vigente no commit — o snapshot em trânsito deixa de
  // bastar para substituir uma projeção concorrente.
  return { current: true, reason: null, currentVersion };
}

/**
 * Envelope de execução CANCELADA (IA-048). `status:'cancelled'` é o valor do
 * vocabulário congelado de estados de job de IA — não inventamos um novo. O
 * `requestId` recebido é ecoado para o cliente descartar a resposta com segurança.
 * Montado aqui (e não por `buildAiEnvelope`, cujo `AiRunStatus` não inclui
 * `cancelled`) para não alargar um tipo compartilhado fora do escopo desta etapa.
 */
export function contextCancelledEnvelope(input: {
  capability: string;
  requestId?: string | null;
  context?: unknown;
  reason: string;
  currentVersion?: string | null;
}): {
  capability: string;
  status: 'cancelled';
  requestId: string | null;
  context?: unknown;
  evidence: {
    contractVersion: typeof CONTEXT_CONTRACT_VERSION;
    reason: string;
    currentVersion: string | null;
  };
} {
  const envelope: {
    capability: string;
    status: 'cancelled';
    requestId: string | null;
    context?: unknown;
    evidence: {
      contractVersion: typeof CONTEXT_CONTRACT_VERSION;
      reason: string;
      currentVersion: string | null;
    };
  } = {
    capability: input.capability,
    status: 'cancelled',
    requestId: input.requestId ?? null,
    evidence: {
      contractVersion: CONTEXT_CONTRACT_VERSION,
      reason: input.reason,
      currentVersion: input.currentVersion ?? null,
    },
  };
  if (input.context !== undefined) envelope.context = input.context;
  return envelope;
}

// ─── Contract error format (422) ─────────────────────────────
// Formato único de falha de validação — ver docs/contracts.md
export interface FieldError { path: string; message: string; code: string }

export function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((i) => ({
    path: i.path.length ? i.path.join('.') : '(root)',
    message: i.message,
    code: i.code,
  }));
}

// ─── Helper: parse body with schema ──────────────────────────
// Retrocompat: consumidores antigos leem só .error (string). .issues é aditivo.
export function parseBody<T>(schema: z.ZodSchema<T>, data: unknown):
  | { success: true; data: T }
  | { success: false; error: string; issues: FieldError[] } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = toFieldErrors(result.error);
    const error = issues.map((i) => `${i.path}: ${i.message}`).join('; ');
    return { success: false, error, issues };
  }
  return { success: true, data: result.data };
}

/**
 * Resposta canônica de falha de validação — 422 Unprocessable Entity.
 * Corpo: { error: { code: 'VALIDATION_ERROR', message, fields: FieldError[] } }
 * Sem import de validation.ts (mantém o módulo importável em Node p/ testes).
 */
export function validationErrorResponse(
  source: { issues?: FieldError[]; error?: string } | z.ZodError | FieldError[],
  _req?: Request,
  contractVersion: 1 | 2 = 1,
): Response {
  let fields: FieldError[];
  if (Array.isArray(source)) fields = source;
  else if (source instanceof z.ZodError) fields = toFieldErrors(source);
  else fields = source.issues ?? (source.error ? [{ path: '(root)', message: source.error, code: 'custom' }] : []);
  return new Response(JSON.stringify({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Payload inválido: um ou mais campos falharam na validação.',
      fields,
    },
  }), {
    status: 422,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': 'https://zapp-web-v2.vercel.app',
      'x-contract-version': String(contractVersion),
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    },
  });
}

// ─── Evolution Webhook (envelope) ────────────────────────────
// v1 (default): leniente — só exige event+instance; eventos desconhecidos são
// ACKados com 200 pelo handler (evita retry storm da Evolution GO).
export const EvolutionWebhookEnvelopeV1Schema = z.object({
  event: z.string().min(1, 'event is required').max(200),
  instance: z.string().min(1, 'instance is required').max(200),
  data: z.unknown().optional(),
}).passthrough();

// v2 (x-contract-version: 2): exige data como objeto.
export const EvolutionWebhookEnvelopeV2Schema = z.object({
  event: z.string().min(1, 'event is required').max(200),
  instance: z.string().min(1, 'instance is required').max(200),
  data: z.record(z.unknown()),
  date_time: z.string().max(100).optional(),
  sender: z.string().max(500).optional(),
  server_url: z.string().max(500).optional(),
  apikey: z.string().max(500).optional(),
}).passthrough();

// ─── Evolution messages.update: status POR EVENTO (R2-API-016) ───────────────
// O envelope v1 aceita `data` como unknown de propósito (a Evolution GO manda
// eventos desconhecidos que precisam ser ACKados com 200), então o status não é
// validável no envelope. A validação é POR EVENTO, aqui: um status numérico ou
// objeto (ex.: `state=3` serializado por outra versão do provedor) lançava
// TypeError em `status.toLowerCase()` dentro do laço, derrubava o lote inteiro
// (HTTP 500) e os recibos VÁLIDOS do mesmo payload eram perdidos/reenviados.
// Só string não vazia (até 100 chars, sem espaços nas bordas) passa; o resto
// tem saída explícita no handler.
export const EvolutionMessagesUpdateStatusSchema = z.string().trim().min(1, 'status must be a non-empty string').max(100, 'status too long');

// ─── ElevenLabs Webhook ──────────────────────────────────────
export const ElevenLabsWebhookV1Schema = z.object({
  type: z.string().max(100).optional(),
  event_type: z.string().max(100).optional(),
  id: z.union([z.string().max(200), z.number()]).optional(),
  request_id: z.union([z.string().max(200), z.number()]).optional(),
}).passthrough();

export const ElevenLabsWebhookV2Schema = ElevenLabsWebhookV1Schema.refine(
  (b) => Boolean(b.type || b.event_type),
  { message: 'type or event_type is required', path: ['type'] },
);

// ─── Gmail Cron Sync (contrato de headers; função não lê body) ──
export const GmailCronSyncHeadersSchema = z.object({
  'x-cron-secret': z.string().min(1, 'x-cron-secret is required'),
});

// ─── Connection Health Check (contrato de headers; cron via x-cron-secret) ──
// L5 da matriz IA-004: o job do pg_cron manda uma credencial DEDICADA no header
// x-cron-secret (segredo do Vault lido por RPC SECURITY DEFINER), no lugar da
// anon key no Authorization. A função não lê body.
export const ConnectionHealthCheckHeadersSchema = z.object({
  'x-cron-secret': z.string().min(1, 'x-cron-secret is required'),
});

// ─── Batch Fetch Avatars / avatars-refresh (contrato de headers) ──
// Mesmo contrato de credencial de máquina do cron: header x-cron-secret com o
// segredo dedicado avatars_refresh_cron_secret. A função não lê body.
export const AvatarsRefreshHeadersSchema = z.object({
  'x-cron-secret': z.string().min(1, 'x-cron-secret is required'),
});

// ─── E45: corpo das chamadas de `evolution-api` ──────────────
// A ação chega por dois caminhos: no CORPO (`evolution-api` com `action`) ou no
// PATH (`evolution-api/<ação>` — o formato padrão do front, ver
// src/hooks/evolution/useEvolutionApiCore.ts:29). O schema valida o CORPO:
// quando `action` vem nele, tem de ser uma ação que o handler implementa.
//
// A lista NÃO é reescrita aqui de propósito: `CONTROL_ACTIONS ∪ SEND_ACTIONS ∪
// READ_ACTIONS` já é a fonte única usada para autorizar, e o teste
// `_shared/__tests__/evolution-control-authz.test.ts` ("matriz é exaustiva")
// prova, lendo o fonte do handler, que os três conjuntos cobrem exatamente
// todos os `action === '...'` de `evolution-api/index.ts`. Duplicar os 113
// literais criaria uma segunda lista para dessincronizar (uma ação nova no
// handler seria recusada em 422 até alguém lembrar de copiá-la para cá).
export const EVOLUTION_API_ACTIONS: readonly string[] = [
  ...CONTROL_ACTIONS,
  ...SEND_ACTIONS,
  ...READ_ACTIONS,
].sort();

// Passthrough deliberado: o corpo carrega o payload específico de cada ação
// (`number`, `text`, `key`, `mediaUrl`, …) e algumas ações o encaminham inteiro
// ao provedor (send-status, edit-message, create-template, delete-for-everyone)
// — descartar chaves desconhecidas quebraria esses envios. O contrato comum
// fixado aqui é a ação conhecida e a instância alvo (E17).
//
// `.nullish()` (e não `.optional()`) porque `null` é o que um cliente manda ao
// serializar variável nula: antes desta etapa `{instanceName: null}` virava
// `''`, caía na checagem do E17 e seguia o mesmo caminho — `null` continua
// equivalente a "ausente". O que passa a ser recusado é o TIPO errado
// (`{instanceName: 5}` virava `"5"` e mirava uma instância inexistente).
export const EvolutionApiRequestSchema = z.object({
  action: z.enum(EVOLUTION_API_ACTIONS as [string, ...string[]], {
    errorMap: () => ({ message: 'Ação desconhecida: não é uma ação suportada pelo evolution-api.' }),
  }).nullish(),
  instanceName: z.string().max(200).nullish(),
  instance: z.string().max(200).nullish(),
}).passthrough();

/**
 * Ações globais — as ÚNICAS que não operam sobre uma instância (E17).
 * `list-instances` lista todas as instâncias da GO; `bootstrap-instance-token`
 * migra o token legado para o Vault. Todas as demais exigem o alvo.
 */
export const EVOLUTION_API_INSTANCE_FREE_ACTIONS: readonly string[] = [
  'list-instances',
  'bootstrap-instance-token',
];

/** `instance` (instanceName) é obrigatória para a ação? */
export function evolutionApiRequiresInstance(action: string): boolean {
  return !EVOLUTION_API_INSTANCE_FREE_ACTIONS.includes(action);
}
