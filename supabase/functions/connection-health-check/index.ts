import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.87.1";
import { evoFetch, extractConnectionState } from '../_shared/evolution-send.ts';
import { resolveEvolutionFlavor, resolveSessionRoute } from '../_shared/evolution-session-routes.ts';
import { errorResponse, jsonResponse, requireEnv, checkRateLimit, type Logger } from "../_shared/validation.ts";
import { escapeHtml } from '../_shared/notification-events.ts';
import { EMAIL_FONT_STACK } from '../_shared/email-font-stack.ts';
import { isAuthorizedCronOrUser, timingSafeStringEqual, unauthorizedResponse } from '../_shared/cron-secret-auth.ts';
import { bootEdge, type EdgeInjected } from '../_shared/edge-boot.ts';

/** Linha de whatsapp_connections lida pela sonda (o select traz só estes campos). */
type ConnRow = {
  id: string;
  instance_id: string;
  status: string | null;
  phone_number: string | null;
  retry_count?: number | null;
  auto_reconnect_enabled?: boolean | null;
  reconnect_max_attempts?: number | null;
  reconnect_interval_seconds?: number | null;
  health_reason?: string | null;
};

/**
 * Reconexão automática (política por conexão: auto_reconnect_enabled,
 * reconnect_max_attempts, reconnect_interval_seconds — migration
 * 20261012134000). A coluna existia, mas nada a executava: a conexão padrão
 * ficou desconectada por semanas sem nenhuma tentativa em `reconnection_logs`.
 * Regra: só tenta com a política LIGADA (ausente = desligada), no máximo
 * `maxAttempts` vezes por queda (contador `retry_count`, zerado quando a
 * conexão volta) e respeitando o intervalo mínimo desde a última tentativa.
 * Esgotou = para (sem laço infinito) e o motivo de saúde pede o QR.
 */
export type ReconnectDecision = 'attempt' | 'wait' | 'exhausted' | 'disabled';

export function decideReconnect(input: {
  enabled: boolean;
  attempts: number;
  maxAttempts: number;
  intervalSeconds: number;
  lastAttemptAt: Date | null;
  now: Date;
}): ReconnectDecision {
  if (!input.enabled) return 'disabled';
  const max = Number.isFinite(input.maxAttempts) && input.maxAttempts > 0 ? input.maxAttempts : 3;
  if (input.attempts >= max) return 'exhausted';
  const intervalMs = (Number.isFinite(input.intervalSeconds) && input.intervalSeconds > 0
    ? input.intervalSeconds : 60) * 1000;
  if (input.lastAttemptAt && input.now.getTime() - input.lastAttemptAt.getTime() < intervalMs) return 'wait';
  return 'attempt';
}

export const RECONNECT_EXHAUSTED_REASON = 'Reconexão automática esgotada — gere um novo QR Code na tela Conexões.';
/** Sessão fantasma: o celular desvinculou; só um QR Code novo resolve (nível 1 imediato). */
export const PHANTOM_SESSION_REASON = 'Sessão desvinculada no celular — gere um novo QR Code na tela Conexões.';
/** Queda confirmada pelo tempo (≥ 15 min sem voltar): o composer fica vermelho e pede QR. */
export const CONFIRMED_DOWN_REASON = 'Queda confirmada — não reconectou sozinha; gere um novo QR Code na tela Conexões.';

/**
 * Regra dos três níveis (docs/contexto/regras/manual/regras.md §4.2, decisão de
 * 2026-11-03). Nível 0 = queda rápida (reconexão automática ainda em curso):
 * ninguém recebe push/e-mail, só a tela. Nível 1 = queda confirmada (reconexão
 * esgotada, sessão fantasma, ou ≥ 15 min caída; `degraded` ≥ 30 min): admin e
 * supervisor recebem push + e-mail SEMPRE (preferência só acrescenta gente).
 * Nível 2 = ≥ 1 h caída: repete o aviso de hora em hora para o admin.
 */
export type EscalationLevel = 0 | 1 | 2;
export const LEVEL1_DISCONNECTED_MS = 15 * 60 * 1000;
export const LEVEL1_DEGRADED_MS = 30 * 60 * 1000;
export const LEVEL2_MS = 60 * 60 * 1000;

export function decideEscalation(input: {
  kind: 'disconnected' | 'degraded';
  reason: string | null;
  exhausted: boolean;
  episodeStart: Date | null;
  now: Date;
}): EscalationLevel {
  const elapsed = input.episodeStart ? input.now.getTime() - input.episodeStart.getTime() : 0;
  if (input.kind === 'degraded') return elapsed >= LEVEL1_DEGRADED_MS ? 1 : 0;
  if (elapsed >= LEVEL2_MS) return 2;
  if (input.exhausted || input.reason === 'phantom_session' || elapsed >= LEVEL1_DISCONNECTED_MS) return 1;
  return 0;
}

/**
 * Chave de idempotência do aviso de nível por usuário (notifications.dedupe_key). O
 * TIPO entra na chave: um episódio `degraded` (socket aberto, sem status novo) nunca
 * passa pela recuperação de queda, e sem o tipo ele travaria o nível 1 das quedas reais.
 */
export function levelDedupeKey(level: 1 | 2, kind: 'disconnected' | 'degraded', connectionId: string, now: Date): string {
  if (level === 1) return `conn-l1:v1:${kind}:${connectionId}`;
  return `conn-l2:v1:${kind}:${connectionId}:${Math.floor(now.getTime() / LEVEL2_MS)}`;
}

/**
 * Mesma regex do cadastro de conexão (`evolution-api`, ação create-connection):
 * letras minúsculas, números e "_" (3 a 40 caracteres). O nome vira segmento de
 * PATH na URL do provedor E parâmetro da RPC `get_instance_token`; um valor fora
 * do formato (barra, ponto, espaço, `..`) jamais pode chegar lá.
 */
const INSTANCE_NAME_RE = /^[a-z0-9_]{3,40}$/;

/** Conexões consultadas ao provedor ao mesmo tempo quando NÃO há alvo único. */
const HEALTH_CHECK_CONCURRENCY = 3;

/** Teto total da sonda: passado ele, quem ainda não começou não toca a rede. */
const TOTAL_TIMEOUT_MS = 45_000;

/**
 * Roda `worker` sobre `items` com no máximo `limit` tarefas em voo. Sem item não
 * abre runner nenhum; com menos itens que o limite, não cria runner ocioso.
 */
async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(limit, 1), items.length) },
    async () => {
      while (next < items.length) {
        const index = next++;
        await worker(items[index], index);
      }
    },
  );
  await Promise.all(runners);
}

// R2-CONEX-0xx (paridade V3 → V2): o health check da V3 tem TRÊS camadas de
// detecção (socket, identidade/owner JID e atividade); a V2 só olhava `open`/`close`
// e marcava "conectada"qualquer sessão com socket aberto — inclusive sessão fantasma
// (outro número assumiu o pareamento), sessão abandonada (sem mensagem há horas) e
// conexão que parou de receber webhooks. As camadas 2 e 3 entram aqui; a camada 1
// (socket) continua sendo o `extractConnectionState` já usado abaixo.

/** Janela sem NENHUMA mensagem recebida que caracteriza sessão abandonada. */
const STALE_SESSION_MS = 6 * 60 * 60 * 1000;
/** Janela sem mensagem que caracteriza conexão "escutando mas muda" (webhook parado). */
const WEBHOOK_SILENT_MS = 30 * 60 * 1000;

/** Limiar padrão da "caixa muda" (minutos sem mensagem recebida). */
const DEFAULT_INBOX_SILENCE_MINUTES = 10;
const MIN_INBOX_SILENCE_MINUTES = 1;
const MAX_INBOX_SILENCE_MINUTES = 1440;

/** Resultado da consulta de identidade: `known=false` = camada pulada, não "sem dono". */
type OwnerLookup = { known: boolean; ownerJid: string | null };

/** Nível de saúde avaliado (mais fino que o status gravado no banco). */
export type HealthLevel = 'healthy' | 'degraded' | 'disconnected';

/** Extrai o owner JID da resposta do `fetchInstances` (formatos v2 e v3). */
export function parseOwnerJid(payload: unknown): OwnerLookup {
  if (Array.isArray(payload)) {
    const first = payload[0] as { ownerJid?: unknown; owner?: unknown } | undefined;
    const raw = first?.ownerJid ?? first?.owner;
    if (typeof raw === 'string' && raw !== '') return { known: true, ownerJid: raw };
    return { known: false, ownerJid: null };
  }
  const obj = payload as {
    instance?: { ownerJid?: unknown; owner?: unknown };
    ownerJid?: unknown; owner?: unknown;
  } | null | undefined;
  const raw = obj?.instance?.ownerJid ?? obj?.instance?.owner ?? obj?.ownerJid ?? obj?.owner;
  if (typeof raw === 'string' && raw !== '') return { known: true, ownerJid: raw };
  return { known: false, ownerJid: null };
}

/**
 * Camadas 2+3 sobre o socket aberto: sessão fantasma (socket diz `open` mas a
 * identidade sumiu), sessão abandonada (sem mensagem há 6 h+) e webhook parado
 * (sem mensagem há 30 min+). Sem identidade devolvida OU sem dado de atividade, a
 * camada é PULADA (conexão nova nunca vira "inativa" por falta de histórico).
 */
export function evaluateOpenConnectionHealth(input: {
  owner: OwnerLookup;
  lastActivityAt: Date | null;
  now: Date;
}): { healthStatus: HealthLevel; dbStatus: 'connected' | 'disconnected' | null; reason: 'phantom_session' | 'stale_session' | 'webhook_silent' | null } {
  const { owner, lastActivityAt, now } = input;
  if (owner.known && !owner.ownerJid) {
    return { healthStatus: 'disconnected', dbStatus: 'disconnected', reason: 'phantom_session' };
  }
  if (lastActivityAt) {
    const idleMs = now.getTime() - lastActivityAt.getTime();
    if (idleMs >= STALE_SESSION_MS) {
      return { healthStatus: 'disconnected', dbStatus: 'disconnected', reason: 'stale_session' };
    }
    if (idleMs >= WEBHOOK_SILENT_MS) {
      return { healthStatus: 'degraded', dbStatus: 'connected', reason: 'webhook_silent' };
    }
  }
  return { healthStatus: 'healthy', dbStatus: 'connected', reason: null };
}

/** Chave de idempotência do alerta de "caixa muda": estável por conexão. */
export function inboxSilenceDedupeKey(connectionId: string): string {
  return `inbox-silent:v1:${connectionId}`;
}

/** Faixa aceita para o limiar da caixa muda: 1 min a 24 h; fora disso, o padrão. */
export function parseSilenceMinutes(value: unknown): number {
  const MIN = MIN_INBOX_SILENCE_MINUTES;
  const MAX = MAX_INBOX_SILENCE_MINUTES;
  const DEFAULT = DEFAULT_INBOX_SILENCE_MINUTES;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.trunc(value);
    if (n >= MIN && n <= MAX) return n;
    return DEFAULT;
  }
  if (typeof value === 'string' && /^[0-9]{1,4}$/.test(value)) {
    const n = Number(value);
    if (n >= MIN && n <= MAX) return n;
  }
  return DEFAULT;
}

/** Rótulo curto do motivo, para título/mensagem dos alertas. */
const REASON_LABEL: Record<string, string> = {
  phantom_session: 'sessão fantasma (outro número assumiu o pareamento)',
  stale_session: 'sessão abandonada (sem mensagem recebida há horas)',
  webhook_silent: 'conectada mas sem receber mensagens (webhook parado)',
};

/** Alerta de conexão a gravar/notificar (warroom + push + e-mail). */
interface AlertToCreate {
  connection_id: string;
  instance_id: string;
  phone: string | null;
  kind: 'disconnected' | 'degraded';
  reason: string | null;
}

/** Preferência de canal: opt-in explícito por tipo de alerta ('all' vale para todos). */
function prefMatchesKind(pref: Record<string, unknown>, kind: 'disconnected' | 'degraded'): boolean {
  const t = pref['alert_type'];
  return t === 'all' || t === kind;
}

/** Linha de connection_alert_preferences (os 4 interruptores do cartão "Alertas de Conexão"). */
export type ConnectionAlertPrefRow = {
  user_id: string;
  push_enabled: boolean | null;
  email_enabled: boolean | null;
  alert_on_degraded: boolean | null;
  alert_on_disconnected: boolean | null;
};

/**
 * Decisão do Joaquim (2026-10-28, "1C"): todo usuário com papel recebe o aviso de
 * queda por padrão; só deixa de receber quem desligar no cartão. Sem linha na
 * tabela = os mesmos padrões que o cartão mostra (CONNECTION_ALERT_DEFAULTS, tudo
 * ligado). Devolve uma entrada por usuário × canal × tipo, no formato que
 * notifyEscalation/prefMatchesKind já consomem.
 */
export function buildConnectionAlertPrefs(
  userIds: string[],
  rows: ConnectionAlertPrefRow[],
): Array<Record<string, unknown>> {
  const byUser = new Map(rows.map((r) => [r.user_id, r]));
  const out: Array<Record<string, unknown>> = [];
  for (const userId of new Set(userIds)) {
    const r = byUser.get(userId);
    const on = (v: boolean | null | undefined) => v !== false;
    const kinds: Array<'disconnected' | 'degraded'> = [];
    if (on(r?.alert_on_disconnected)) kinds.push('disconnected');
    if (on(r?.alert_on_degraded)) kinds.push('degraded');
    const channels: Array<'push' | 'email'> = [];
    if (on(r?.push_enabled)) channels.push('push');
    if (on(r?.email_enabled)) channels.push('email');
    for (const alert_type of kinds) {
      for (const channel of channels) out.push({ user_id: userId, channel, alert_type });
    }
  }
  return out;
}

/** Lê destinatários (usuários com papel) e preferências; erro na leitura de usuários = ninguém. */
async function loadConnectionAlertPrefs(
  supabase: SupabaseClient,
  log: Logger,
): Promise<Array<Record<string, unknown>>> {
  const { data: roles, error: rolesError } = await supabase.from('user_roles').select('user_id');
  if (rolesError) {
    log.warn('Falha ao ler destinatários do alerta de conexão', { error: rolesError.message });
    return [];
  }
  const { data: rows, error: prefsError } = await supabase
    .from('connection_alert_preferences')
    .select('user_id, push_enabled, email_enabled, alert_on_degraded, alert_on_disconnected');
  if (prefsError) {
    log.warn('Falha ao ler connection_alert_preferences; usando os padrões', { error: prefsError.message });
  }
  const userIds = (roles ?? []).map((r) => (r as { user_id?: unknown }).user_id).filter((u): u is string => typeof u === 'string' && u !== '');
  return buildConnectionAlertPrefs(userIds, (rows ?? []) as ConnectionAlertPrefRow[]);
}

/**
 * Camada 2 no provedor: dono atual da instância. Sem token próprio, NÃO consulta
 * (a rota de instância com a credencial global violaria o isolamento E24) e a
 * camada é pulada. Erro de rede/timeout também só pula a camada.
 */
async function fetchOwnerJid(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  token: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<OwnerLookup> {
  if (!token) return { known: false, ownerJid: null };
  try {
    const resp = await evoFetch(baseUrl, apiKey, `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, undefined, (u, o) => fetchImpl(u, { ...o, signal: AbortSignal.timeout(10000) }), 'GET', undefined, token);
    if (!resp.ok) return { known: false, ownerJid: null };
    return parseOwnerJid(await resp.json());
  } catch {
    return { known: false, ownerJid: null };
  }
}

/** Dentro do horário comercial (RPC do projeto; erro = fora do horário, sem alerta). */
async function isWithinBusinessHours(supabase: SupabaseClient, connectionId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_within_business_hours', { p_connection_id: connectionId });
    if (error) return false;
    const first = Array.isArray(data) ? data[0] : data;
    return Boolean(first);
  } catch {
    return false;
  }
}

/**
 * PE-87 — "caixa muda": mantém UM alerta `warning` por conexão enquanto ela segue
 * conectada sem mensagem recebida (upsert pela dedupe_key) e libera a chave quando
 * a mensagem volta a chegar, preservando a linha histórica do episódio.
 */
async function syncInboxSilenceAlert(
  supabase: SupabaseClient,
  log: Logger,
  args: { connectionId: string; instanceId: string; phone: string | null; silent: boolean; silenceMinutes: number },
): Promise<void> {
  const key = inboxSilenceDedupeKey(args.connectionId);
  if (!args.silent) {
    const { error } = await supabase.from('warroom_alerts').update({ dedupe_key: null }).eq('dedupe_key', key);
    if (error) log.warn('Falha ao auto-resolver alerta de caixa muda', { error: error.message });
    return;
  }
  const { error } = await supabase.from('warroom_alerts').insert({
    alert_type: 'warning',
    title: `Caixa sem mensagens — ${args.instanceId}`,
    message: `A instância ${args.instanceId}${args.phone ? ` (${args.phone})` : ''} está conectada mas não recebe mensagem há ${args.silenceMinutes} min.`,
    source: 'connection-health-check',
    dedupe_key: key,
  });
  if (error && (error as { code?: string }).code !== '23505') {
    log.warn('Falha ao gravar alerta de caixa muda', { error: error.message });
  }
}

/** Resultado de UM e-mail: aceito, recusa definitiva (4xx) ou falha transitória (5xx/rede). */
type EmailOutcome = 'accepted' | 'rejected' | 'transient';

/** Um e-mail por destinatário. 4xx do Resend é final (endereço/domínio ruim) — não adianta repetir. */
async function sendAlertEmail(
  log: Logger,
  args: { resendKey: string; to: string; subject: string; instanceId: string; line: string },
): Promise<EmailOutcome> {
  const { resendKey, to, subject, instanceId, line } = args;
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'ZAPP Alertas <alertas@promobrindes.com.br>',
        to,
        subject,
        html: `<div style="font-family:${EMAIL_FONT_STACK};max-width:600px;margin:0 auto">` +
          `<h2>${escapeHtml(subject)}</h2>` +
          `<p>A instância <strong>${escapeHtml(instanceId)}</strong>${line}</p></div>`,
      }),
    });
    if (resp.ok) return 'accepted';
    log.warn('Resend recusou o alerta de conexão', { status: resp.status });
    // 429 (limite de taxa/cota) é passageiro: tenta de novo na próxima sonda. Outros 4xx
    // (endereço/domínio inválido, payload) são definitivos.
    if (resp.status === 429) return 'transient';
    return resp.status >= 400 && resp.status < 500 ? 'rejected' : 'transient';
  } catch (err) {
    log.error('Falha ao enviar alerta de conexão por e-mail', { error: err instanceof Error ? err.message : String(err) });
    return 'transient';
  }
}

/** Episódio em escalada (conexão caída/degradada nesta sonda), avaliado depois do laço. */
interface Escalation {
  alert: AlertToCreate;
  exhausted: boolean;
  /** health_reason já gravado na linha (null = o composer ainda mostra amarelo). */
  healthReason: string | null;
}

/**
 * Nível 1/2 da regra dos três níveis. Destinatários OBRIGATÓRIOS (admin e
 * supervisor no nível 1; só admin no nível 2) + quem optou no cartão. Idempotente
 * por episódio/hora via `notifications.dedupe_key` (único por usuário), com um
 * marcador por canal — a sonda roda a cada 5 min e não pode repetir o aviso.
 */
async function notifyEscalation(
  supabase: SupabaseClient,
  log: Logger,
  args: { alert: AlertToCreate; level: 1 | 2; now: Date; prefs: Array<Record<string, unknown>>; resendKey: string | undefined },
): Promise<void> {
  const { alert, level, now, prefs, resendKey } = args;
  const mandatoryRoles = level === 1 ? ['admin', 'supervisor'] : ['admin'];
  const { data: roleRows, error: rolesError } = await supabase
    .from('user_roles').select('user_id, role').in('role', mandatoryRoles);
  if (rolesError) log.warn('Falha ao ler admin/supervisor para o alerta obrigatório', { error: rolesError.message });
  const mandatory = new Set((roleRows ?? []).map((r) => (r as { user_id?: unknown }).user_id).filter((u): u is string => typeof u === 'string' && u !== ''));
  const opted = level === 1 ? prefs.filter((p) => prefMatchesKind(p, alert.kind)) : [];
  const pushUsers = new Set<string>([...mandatory, ...opted.filter((p) => p['channel'] === 'push').map((p) => p['user_id'] as string)]);
  const emailUsers = new Set<string>([...mandatory, ...opted.filter((p) => p['channel'] === 'email').map((p) => p['user_id'] as string)]);

  const dedupeKey = levelDedupeKey(level, alert.kind, alert.connection_id, now);
  const title = level === 2
    ? `WhatsApp ${alert.instance_id} ainda desconectado`
    : alert.kind === 'disconnected' ? `WhatsApp ${alert.instance_id} desconectado — precisa de QR Code` : `Conexão ${alert.instance_id} sem receber mensagens`;
  const message = level === 2
    ? `A instância ${alert.instance_id} está desconectada há mais de 1 hora. Gere um novo QR Code na tela Conexões.`
    : alert.kind === 'disconnected'
      ? `A instância ${alert.instance_id} não reconectou sozinha. Só um admin pode gerar o QR Code na tela Conexões.`
      : `A instância ${alert.instance_id} está conectada mas não recebe mensagens há mais de 30 min (${REASON_LABEL[alert.reason ?? ''] ?? 'webhook parado'}).`;

  // Marcadores por CANAL em notifications (único por usuário × dedupe_key):
  //   push  → a própria linha de push, chave K;
  //   e-mail → linha "lida" com chave K:email, gravada só quando o Resend aceitou (2xx) ou
  //            recusou em definitivo (4xx); 5xx/rede não grava e a próxima sonda retenta.
  // Push nunca depende do e-mail (um admin com e-mail ruim continua recebendo o push).
  const jaMarcado = async (userId: string, key: string): Promise<boolean | null> => {
    const { data, error } = await supabase.from('notifications').select('id')
      .eq('user_id', userId).eq('dedupe_key', key).maybeSingle();
    if (error) {
      log.warn('Falha ao conferir marcador de aviso', { key, error: error.message });
      return null;
    }
    return Boolean(data);
  };
  const marcar = async (userId: string, key: string, extra: Record<string, unknown>, isRead: boolean): Promise<void> => {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId, title, message, type: 'connection_alert', dedupe_key: key, is_read: isRead,
      metadata: { connection_id: alert.connection_id, instance_id: alert.instance_id, kind: alert.kind, reason: alert.reason, level, ...extra },
    });
    if (error && (error as { code?: string }).code !== '23505') log.warn('notifications insert failed', { key, error: error.message });
  };

  for (const userId of pushUsers) {
    const marcado = await jaMarcado(userId, dedupeKey);
    if (marcado === false) await marcar(userId, dedupeKey, { channel: 'push' }, false);
  }

  const emailKey = `${dedupeKey}:email`;
  const emailPendentes: string[] = [];
  for (const userId of emailUsers) {
    const marcado = await jaMarcado(userId, emailKey);
    if (marcado === false) emailPendentes.push(userId);
  }
  if (emailPendentes.length === 0) return;
  if (!resendKey) {
    log.warn('Alerta obrigatório sem canal de e-mail (RESEND_API_KEY ausente)', { level, pendentes: emailPendentes.length });
    return;
  }
  const { data: perfis, error: perfisError } = await supabase.from('profiles').select('user_id, email').in('user_id', emailPendentes);
  if (perfisError) {
    log.warn('Falha ao ler e-mails dos destinatários; tenta na próxima sonda', { error: perfisError.message });
    return;
  }
  const emailPorUsuario = new Map<string, string>();
  for (const p of (perfis ?? []) as Array<{ user_id?: unknown; email?: unknown }>) {
    if (typeof p.user_id === 'string' && typeof p.email === 'string' && p.email !== '') emailPorUsuario.set(p.user_id, p.email);
  }
  for (const userId of emailPendentes) {
    const to = emailPorUsuario.get(userId);
    if (!to) {
      log.warn('Destinatário de e-mail sem e-mail no perfil', { level });
      continue;
    }
    const outcome = await sendAlertEmail(log, { resendKey, to, subject: `🔴 ${title} — ZAPP`, instanceId: alert.instance_id, line: `: ${escapeHtml(message)}` });
    if (outcome === 'transient') continue; // retenta na próxima sonda
    // Usuário só-e-mail (push desligado no cartão) fica com o registro em tela já LIDO — não é push.
    await marcar(userId, emailKey, { channel: 'email', email_outcome: outcome }, true);
  }
}

/**
 * Início do episódio = created_at do alerta de warroom ainda "aberto" (dedupe_key
 * preenchida). Se a linha não existe (insert da transição falhou), cria agora: o
 * relógio começa na primeira sonda que conseguiu registrar — nunca fica em zero.
 */
async function readEpisodeStart(supabase: SupabaseClient, log: Logger, alert: AlertToCreate, now: Date): Promise<Date | null> {
  const key = alertDedupeKey(alert);
  const { data, error } = await supabase.from('warroom_alerts').select('created_at').eq('dedupe_key', key).maybeSingle();
  if (error) {
    log.warn('Falha ao ler início do episódio no warroom', { error: error.message });
    return null;
  }
  const raw = data && !Array.isArray(data) ? (data as { created_at?: unknown }).created_at : undefined;
  if (typeof raw === 'string') {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const { title, message } = alertContent(alert);
  const { error: insertError } = await supabase.from('warroom_alerts').insert({
    alert_type: alert.kind === 'disconnected' ? 'critical' : 'warning', title, message, source: 'connection-health-check', dedupe_key: key,
  });
  if (insertError && (insertError as { code?: string }).code !== '23505') {
    log.warn('Falha ao registrar início do episódio no warroom', { error: insertError.message });
    return null;
  }
  return now;
}

/** Libera as chaves de nível de UM tipo de episódio (idempotente; sem linhas = nada a fazer). */
async function releaseLevelKeys(supabase: SupabaseClient, log: Logger, connectionId: string, kind: 'disconnected' | 'degraded'): Promise<void> {
  const { error } = await supabase.from('notifications').update({ dedupe_key: null })
    .like('dedupe_key', `conn-l%:v1:${kind}:${connectionId}%`);
  if (error) log.warn('Falha ao liberar chaves de nível', { kind, error: error.message });
}

/**
 * Conexão com socket aberto (`connected`): libera as chaves da QUEDA e retoma campanhas
 * pausadas por connection_lost. Roda em toda sonda com a conexão viva — a recuperação
 * pode ter sido gravada pelo webhook antes, e aí o CAS não transiciona.
 */
async function onConnectionRecovered(supabase: SupabaseClient, log: Logger, connectionId: string): Promise<void> {
  await releaseLevelKeys(supabase, log, connectionId, 'disconnected');
  // O warroom da queda também fecha aqui (o webhook pode ter transicionado antes da sonda);
  // sem isso a próxima queda herdaria o created_at do episódio anterior. A linha fica como histórico.
  const { error: warroomError } = await supabase.from('warroom_alerts').update({ dedupe_key: null })
    .eq('dedupe_key', `conn-down:v1:${connectionId}`);
  if (warroomError) log.warn('Falha ao encerrar alerta de queda no warroom', { error: warroomError.message });
  const { data: pausadas, error: campError } = await supabase.from('talkx_campaigns').select('id')
    .eq('whatsapp_connection_id', connectionId).eq('status', 'paused').eq('pause_reason', 'connection_lost');
  if (campError) {
    log.warn('Falha ao listar campanhas pausadas por queda', { error: campError.message });
    return;
  }
  for (const row of (pausadas ?? []) as Array<{ id?: unknown }>) {
    if (typeof row.id !== 'string') continue;
    const { error } = await supabase.rpc('transition_talkx_campaign', { p_campaign_id: row.id, p_action: 'start' });
    if (error) log.warn('Campanha pausada por queda não retomou', { campaign_id: row.id, error: error.message });
  }
}

/** Chave de idempotência do episódio (queda ou degradação), estável por conexão. */
function alertDedupeKey(alert: AlertToCreate): string {
  return alert.kind === 'degraded'
    ? `conn-degraded:v1:${alert.connection_id}`
    : `conn-down:v1:${alert.connection_id}`;
}

function alertContent(alert: AlertToCreate): { title: string; message: string } {
  if (alert.kind === 'disconnected') {
    return {
      title: 'WhatsApp ' + alert.instance_id + ' desconectado',
      message: 'A instância ' + alert.instance_id + ' perdeu conexão com o WhatsApp.',
    };
  }
  return {
    title: 'Conexão ' + alert.instance_id + ' degradada',
    message: 'A instância ' + alert.instance_id + ': ' + (REASON_LABEL[alert.reason ?? ''] ?? 'conexão degradada') + '.',
  };
}

/** Remove duplicados do MESMO episódio dentro da execução (mesma conexão + tipo). */
function dedupeAlerts(alerts: AlertToCreate[]): AlertToCreate[] {
  const seen = new Set<string>();
  return alerts.filter((a) => {
    const key = alertDedupeKey(a);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function handleConnectionHealthCheck(
  req: Request,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _injected?: EdgeInjected<any>,
): Promise<Response> {
  // O `??` do boot e PREGUICOSO de proposito: os testes injetam o client e rodam sem
  // SUPABASE_URL. A anotacao `as SupabaseClient` fica no generico do bootEdge — sem ela
  // o receiver `any` faz o TS perder a inferencia dos callbacks do client no corpo.
  const { cors, log, headers, supabase, serviceKey } = bootEdge<SupabaseClient>(req, {
    fnName: 'connection-health-check',
    injected: _injected,
    makeClient: () => createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY')),
  });
  if (cors) return cors;

  try {

    // L5 da matriz IA-004: credencial de maquina do cron (x-cron-secret, segredo
    // DEDICADO no Vault, lido por RPC SECURITY DEFINER) OU JWT de usuario autenticado.
    // A ANON KEY deixa de entrar: ela e publica (vai no bundle do front) e o gateway a
    // aceitava como "um JWT valido", entao qualquer visitante anonimo passava daqui.
    // O guard vive em _shared/cron-secret-auth.ts (as duas edges usam o mesmo); o
    // literal da RPC fica AQUI de proposito, para o guard de catalogo
    // (scripts/db-audit/supabase-usage-guard.mjs) continuar validando o alvo.
    // Leitura do segredo do Vault com CACHE por request: o mesmo valor serve ao
    // guard (autorização) e à decisão de cron (dispensa de papel/limite), sem duas
    // idas à RPC.
    let cronSecretCache: string | null | undefined;
    const readVaultSecret = async (): Promise<string | null> => {
      if (typeof cronSecretCache !== 'undefined') return cronSecretCache;
      const { data, error } = await supabase.rpc('get_connection_health_check_cron_secret');
      cronSecretCache = !error && typeof data === 'string' ? data : null;
      return cronSecretCache;
    };

    const authorized = await isAuthorizedCronOrUser(req, supabase, {
      serviceKey,
      readVaultSecret,
    });
    if (!authorized) return unauthorizedResponse(headers);

    // N-162: o cron (consumidor automatizado legítimo) dispensa papel e limite;
    // o resto é chamada de USUÁRIO e exige admin/supervisor + rate limit.
    // A dispensa é do SEGREDO CONFERIDO, não da PRESENÇA do header: antes bastava
    // mandar `x-cron-secret` com qualquer valor para o gate de papel e o rate limit
    // serem pulados — um não-admin autenticado escapava da checagem. Só o segredo
    // que casa em tempo constante com o do Vault (mesma fonte do guard) dispensa.
    const cronSecret = req.headers.get('x-cron-secret');
    const vaultSecret = cronSecret ? await readVaultSecret() : null;
    const isCronCall = typeof cronSecret === 'string' && cronSecret.length > 0
      && typeof vaultSecret === 'string' && vaultSecret.length > 0
      && timingSafeStringEqual(cronSecret, vaultSecret);

    if (!isCronCall) {
      const authHeader = req.headers.get('Authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const isServiceKeyCall = Boolean(serviceKey) && timingSafeStringEqual(token, serviceKey);

      if (!isServiceKeyCall) {
        // Identidade do chamante para o cheque de papel e o rate limit.
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return unauthorizedResponse(headers);

        const { data: isStaff } = await supabase.rpc('is_admin_or_supervisor', {
          _user_id: user.id,
        });
        if (!isStaff) return errorResponse('Forbidden', 403, req);

        // Limite por USUÁRIO (não por IP): o mesmo usuário por trás de IPs diferentes
        // não escapa; usuários diferentes no mesmo IP não se derrubam.
        const rl = checkRateLimit(`connection-health-check:${user.id}`, 6, 60_000);
        if (!rl.allowed) return errorResponse('Rate limit exceeded', 429, req);
      }
    }

    // Alvo único opcional (`instanceName`). A V3 (connection-health-check@v1)
    // aceita `{ instanceName? }` para o "Verificar agora"; com alvo, verifico só
    // essa conexão em vez de varrer TODAS (até 10 s cada) gastando o limite do
    // usuário à toa. Corpo ausente/ilegível = `{}` (verificar todas).
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const requested = typeof body?.instanceName === 'string' ? body.instanceName.trim() : '';

    // Recusa ANTES de qualquer rede/banco e sem ecoar o valor recebido (evita
    // refletir entrada do cliente). O nome alimenta o PATH do provedor e a RPC
    // get_instance_token, então um valor fora do formato nunca passa daqui.
    if (requested && !INSTANCE_NAME_RE.test(requested)) {
      return errorResponse('Nome de instância inválido.', 400, req);
    }

    const evolutionUrl = requireEnv('EVOLUTION_API_URL');
    const evolutionKey = requireEnv('EVOLUTION_API_KEY');
    const baseUrl = evolutionUrl.replace(/\/+$/, '');

    let connQuery = supabase
      .from('whatsapp_connections').select('id, instance_id, status, phone_number, retry_count, auto_reconnect_enabled, reconnect_max_attempts, reconnect_interval_seconds, health_reason')
      .neq('instance_id', 'E2E_FIXTURE'); // Fixture E2E nao e sondada (nao existe no provedor; alertaria admin a toa). Ela fica 'disconnected' em producao e NENHUM caminho de envio a escolhe (resolve_outbound_whatsapp_connection, 20261113130000).
    if (requested) connQuery = connQuery.eq('instance_id', requested);

    const { data: connections, error: connError } = await connQuery;

    if (connError || !connections) return errorResponse('Failed to fetch connections', 500, req);

    // Alvo único que não casa conexão conhecida: 404 NEUTRO — não lista nem ecoa
    // nome de instância algum.
    if (requested && connections.length === 0) {
      return errorResponse('Not found', 404, req);
    }

    // PE-87: limiar da "caixa muda" lido uma vez por execução. Leitura defensiva:
    // a chave pode não existir — cai no padrão 10.
    let silenceMinutes = DEFAULT_INBOX_SILENCE_MINUTES;
    try {
      const { data: silenceRow, error: silenceErr } = await supabase
        .from('global_settings').select('value').eq('key', 'inbox_silence_minutes').maybeSingle();
      if (!silenceErr && silenceRow) {
        silenceMinutes = parseSilenceMinutes((silenceRow as { value?: unknown }).value);
      }
    } catch (err) {
      log.warn('Falha ao ler o limiar de silêncio da caixa', { error: err instanceof Error ? err.message : String(err) });
    }
    const silenceMs = silenceMinutes * 60 * 1000;

    const results: Array<{ instance_id: string; status: string; response_time_ms: number; error: string | null; reason: string | null }> = [];
    const alertsToCreate: AlertToCreate[] = [];
    // Regra dos três níveis: toda conexão caída/degradada nesta sonda entra aqui
    // (não só a transição) e é escalada depois do laço.
    const escalations: Escalation[] = [];

    // Paridade V3 → V2 (CX0b/CA2): a trilha de auditoria de UMA conexão
    // (ConnectionAuditDialog) lê `audit_logs` filtrando por `details.instance_id`.
    // A transição AUTOMÁTICA de status feita pelo monitor não gravava nada ali —
    // só o `connection_health_logs` — então o diálogo mostrava tela vazia para
    // uma queda real detectada pela sonda. Cada transição confirmada pelo CAS
    // (nunca estado transitório) entra nesta lista e vira uma linha da trilha,
    // no mesmo formato do helper compartilhado dos cartões de conexão: conexão,
    // status anterior e novo e a origem 'health-check'. NUNCA telefone, token ou
    // payload bruto do provedor.
    const statusAuditEvents: Array<{
      id: string;
      instanceId: string;
      action: string;
      previousStatus: string | null;
      newStatus: string;
    }> = [];

    // A rota de SESSÃO desta sonda (e a credencial que ela exige) sai do MESMO
    // resolvedor do ciclo de sessão do `evolution-api` (R2-API-015): no GO a rota
    // de status e de INSTÂNCIA (a instância vem na credencial), no v2 e global.
    const flavor = resolveEvolutionFlavor(Deno.env.get('EVOLUTION_API_FLAVOR'));

    // Teto TOTAL da sonda. Cada requisição ao provedor já tem 10 s; o teto do
    // lote evita prender a Edge até o timeout da plataforma quando há muitas
    // conexões. Passado o teto, quem ainda não começou é registrado como
    // `timeout` SEM tocar a rede (não gasta credencial nem sobrescreve status).
    const deadline = Date.now() + TOTAL_TIMEOUT_MS;

    // Uma conexão: lê a credencial dela, consulta o provedor, grava log/estado e,
    // na queda real com CAS vitorioso, enfileira o alerta. Extraída de dentro do
    // laço para permitir concorrência limitada sem duplicar a lógica.
    // Uma tentativa de reconexão (GO: POST /instance/reconnect via tradutor). O
    // resultado da chamada NÃO é "conectou": quem confirma é a próxima sonda. Falha
    // da tentativa nunca derruba a sonda; o registro em `reconnection_logs` guarda
    // só status HTTP/mensagem curta — nunca token, QR ou payload do provedor.
    const tryAutoReconnect = async (conn: ConnRow, instanceToken: string | undefined, now: Date): Promise<ReconnectDecision | null> => {
      try {
        const attempts = conn.retry_count ?? 0;
        let lastAttemptAt: Date | null = null;
        const { data: lastLog } = await supabase.from('reconnection_logs').select('created_at')
          .eq('connection_id', conn.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        const lastCreated = (lastLog as { created_at?: string } | null)?.created_at;
        if (typeof lastCreated === 'string') {
          const parsed = new Date(lastCreated);
          if (!Number.isNaN(parsed.getTime())) lastAttemptAt = parsed;
        }
        const decision = decideReconnect({
          enabled: conn.auto_reconnect_enabled === true,
          attempts,
          maxAttempts: Number(conn.reconnect_max_attempts ?? 3),
          intervalSeconds: Number(conn.reconnect_interval_seconds ?? 60),
          lastAttemptAt,
          now,
        });
        if (decision === 'exhausted') {
          await supabase.from('whatsapp_connections')
            .update({ health_reason: RECONNECT_EXHAUSTED_REASON }).eq('id', conn.id);
          return decision;
        }
        if (decision !== 'attempt') return decision;

        const attempt = attempts + 1;
        let ok = false;
        let reason: string | null = null;
        try {
          const resp = await evoFetch(baseUrl, evolutionKey, `/instance/restart/${conn.instance_id}`, {},
            (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(10000) }), 'PUT', undefined, instanceToken);
          ok = resp.ok;
          if (!ok) reason = `HTTP ${resp.status}: ${(await resp.text()).slice(0, 150)}`;
        } catch (err) {
          reason = (err instanceof Error ? err.message : 'falha desconhecida').slice(0, 150);
        }
        await supabase.from('reconnection_logs').insert({
          connection_id: conn.id, attempt, result: ok ? 'success' : 'failure', reason,
        });
        await supabase.from('whatsapp_connections').update({ retry_count: attempt }).eq('id', conn.id);
        log.warn('Reconexão automática tentada', { instance_id: conn.instance_id, attempt, ok });
        return decision;
      } catch (err) {
        log.warn('Falha na reconexão automática', { error: err instanceof Error ? err.message : String(err) });
        return null;
      }
    };

    const checkConnection = async (conn: ConnRow, index: number): Promise<void> => {
      const start = performance.now();
      const now = new Date();
      let healthStatus = 'unknown';
      let errorMessage: string | null = null;
      let responseTime = 0;
      let openReason: string | null = null;
      let connectionRecoveryConfirmed = false;
      let reconnectExhausted = conn.health_reason === RECONNECT_EXHAUSTED_REASON;

      if (Date.now() > deadline) {
        healthStatus = 'timeout';
        errorMessage = 'Timeout total do health check antes de consultar a instância.';
        await supabase.from('connection_health_logs').insert({
          connection_id: conn.id, instance_id: conn.instance_id, status: healthStatus,
          response_time_ms: 0, error_message: errorMessage,
        });
        await supabase.from('whatsapp_connections').update({
          last_health_check: new Date().toISOString(), health_status: healthStatus, health_response_ms: 0,
        }).eq('id', conn.id);
        results[index] = { instance_id: conn.instance_id, status: healthStatus, response_time_ms: 0, error: errorMessage, reason: openReason };
        return;
      }

      // E24 (plano multi-conexão): a consulta de estado é POR INSTÂNCIA. No flavor
      // GO a instância é escolhida pela CREDENCIAL (o nome no path v2 se perde na
      // tradução), então sem o token da própria conexão o tradutor falha fechado
      // (400 'instance token ausente') para TODA conexão que não é a padrão — a
      // outra apareceria como 'error' para sempre, sem nunca ser consultada de
      // verdade. O token vive no Vault por conexão (get_instance_token,
      // service_role); o fallback de transição do evoFetch (E15) segue valendo,
      // mas só para a instância padrão.
      let instanceToken: string | undefined;
      let tokenLookupError: string | null = null;
      try {
        const { data: tokenData, error: tokenError } = await supabase
          .rpc('get_instance_token', { p_instance_id: conn.instance_id });
        if (tokenError) {
          // Ler a credencial falhou: não inventa, não usa a global. O motivo fica
          // registrado para a falha não virar "sem credencial" indistinguível.
          tokenLookupError = tokenError.message || 'get_instance_token devolveu erro';
        } else if (typeof tokenData === 'string' && tokenData) {
          instanceToken = tokenData;
        }
      } catch (err) {
        tokenLookupError = err instanceof Error ? err.message : 'get_instance_token lançou';
      }
      const padrao = Deno.env.get('EVOLUTION_INSTANCE_NAME') ?? '';
      const tokenLegado = Deno.env.get('EVOLUTION_INSTANCE_TOKEN') ?? '';
      const usaTokenDoAmbiente = padrao !== '' && conn.instance_id === padrao && Boolean(tokenLegado);
      const semCredencial = resolveSessionRoute(flavor, 'status', conn.instance_id).auth === 'instance'
        && !instanceToken && !usaTokenDoAmbiente;

      if (semCredencial) {
        // Credencial ausente NÃO é queda de sessão nem falha do provedor: o
        // monitoramento por instância (E28) recebe o estado próprio e nada é
        // sobrescrito — e a sonda jamais sai com a credencial de outra instância.
        healthStatus = 'no_credentials';
        errorMessage = tokenLookupError
          ? `Falha ao ler a credencial da instância (get_instance_token): ${tokenLookupError}`
          : 'Instância sem credencial própria no Vault e sem token de ambiente para a padrão.';
      } else {
        try {
          const resp = await evoFetch(baseUrl, evolutionKey,
            `/instance/connectionState/${conn.instance_id}`, undefined,
            (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(10000) }), 'GET', undefined, instanceToken);
          responseTime = Math.round(performance.now() - start);

          if (resp.ok) {
            const data = await resp.json();
            const state = extractConnectionState(data);

            // Camadas V3 sobre o socket aberto: identidade (owner JID) e última
            // entrada recebida. Só o 'open' passa pelas camadas; os demais estados
            // seguem o mapeamento direto (queda/degradação pelo socket).
            let dbStatus: 'connected' | 'disconnected' | null = null;
            if (state === 'open') {
              healthStatus = 'healthy';
              dbStatus = 'connected';

              // Camada 3: última entrada recebida (defensivo — mensagem ausente
              // não vira "inativa", evita alerta falso em conexão recém-criada).
              let lastInboundAt: Date | null = null;
              let lastInboundKnown = false;
              const { data: lastMsg, error: msgErr } = await supabase
                .from('messages').select('created_at')
                .eq('whatsapp_connection_id', conn.id)
                .eq('sender', 'contact')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
              if (!msgErr && lastMsg && (lastMsg as { created_at?: string }).created_at) {
                const parsed = new Date((lastMsg as { created_at: string }).created_at);
                if (!Number.isNaN(parsed.getTime())) {
                  lastInboundAt = parsed;
                  lastInboundKnown = true;
                }
              }

              // Camada 2: identidade (owner JID). Falha fechada SÓ para o dado da
              // camada — sem identidade devolvida, a camada é pulada, não inventada.
              const owner = await fetchOwnerJid(baseUrl, evolutionKey, conn.instance_id, instanceToken);

              const ev = evaluateOpenConnectionHealth({ owner, lastActivityAt: lastInboundAt, now });
              healthStatus = ev.healthStatus;
              dbStatus = ev.dbStatus;
              openReason = ev.reason;
              if (openReason === 'phantom_session' && conn.health_reason !== PHANTOM_SESSION_REASON) {
                // Nível 1 imediato: o celular desvinculou; só QR Code novo resolve.
                await supabase.from('whatsapp_connections').update({ health_reason: PHANTOM_SESSION_REASON }).eq('id', conn.id);
              }

              // PE-87 — "caixa muda": conexão conectada sem NENHUMA mensagem
              // recebida além do limiar, DENTRO do horário comercial. Alerta
              // idempotente por episódio (dedupe_key) e auto-resolve quando a
              // mensagem volta a chegar.
              if (dbStatus === 'connected' && ((conn.retry_count ?? 0) > 0 || conn.health_reason)) {
                // Conexão voltou: zera o contador da queda e o motivo de saúde (fantasma/queda
                // confirmada gravam motivo sem mexer no contador — o composer sairia do vermelho só aqui).
                await supabase.from('whatsapp_connections')
                  .update({ retry_count: 0, health_reason: null }).eq('id', conn.id);
              }
              if (dbStatus === 'connected') {
                // Idempotente em TODA sonda com a conexão viva: a recuperação pode ter sido
                // gravada pelo webhook (connection.update 'open') antes desta sonda, e aí o
                // CAS abaixo não transiciona — mas as chaves de nível e as campanhas pausadas
                // por queda precisam ser liberadas do mesmo jeito.
                await onConnectionRecovered(supabase, log, conn.id);
              }
              if (healthStatus === 'healthy') {
                // Fim de um episódio `degraded` (nunca muda o status, logo nunca passa pelo
                // CAS): libera a chave de nível e o alerta de warroom da degradação.
                await releaseLevelKeys(supabase, log, conn.id, 'degraded');
                const { error: degradedKeyError } = await supabase.from('warroom_alerts')
                  .update({ dedupe_key: null }).eq('dedupe_key', `conn-degraded:v1:${conn.id}`);
                if (degradedKeyError) log.warn('Falha ao encerrar alerta de degradação', { error: degradedKeyError.message });
              }
              if (dbStatus === 'connected') {
                // Libera a chave apenas depois que o CAS confirmar a recuperação;
                // a linha do alerta permanece como histórico do incidente.
                connectionRecoveryConfirmed = conn.status !== 'connected';
                const withinHours = await isWithinBusinessHours(supabase, conn.id);
                if (withinHours) {
                  const staleInbound = lastInboundKnown && lastInboundAt !== null
                    && (now.getTime() - lastInboundAt.getTime()) > silenceMs;
                  const silent = !lastInboundKnown || staleInbound;
                  await syncInboxSilenceAlert(supabase, log, {
                    connectionId: conn.id,
                    instanceId: conn.instance_id,
                    phone: conn.phone_number,
                    silent,
                    silenceMinutes,
                  });
                }
              }
            } else {
              healthStatus = state === 'close' ? 'disconnected' : 'degraded';
              dbStatus = state === 'close' ? 'disconnected' : null;
              if (state === 'close') {
                const decision = await tryAutoReconnect(conn, instanceToken, now);
                if (decision === 'exhausted') reconnectExhausted = true;
              }
            }

            // Only update for definitive states; skip transient (connecting/qr_pending).
            if (dbStatus && dbStatus !== conn.status) {
              // Never overwrite a QR-scan or reconnect transient state with 'disconnected'.
              const isTransient = conn.status === 'qr_pending' || conn.status === 'connecting';
              if (dbStatus === 'connected' || !isTransient) {
                // .eq('status', conn.status): um webhook pode ter mudado a linha
                // enquanto liamos o estado na GO. Sem isso, um qr_pending recem
                // gravado viraria 'disconnected' e dispararia alerta falso.
                // CAS pelo status lido. '.eq' com null nao casa linha nenhuma no
                // PostgREST, entao conexao com status NULL precisa de 'is.null'.
                const { data: updated } = await supabase.from('whatsapp_connections')
                  .update({ status: dbStatus, updated_at: new Date().toISOString() })
                  .eq('id', conn.id)
                  .or(conn.status === null || conn.status === undefined
                    ? 'status.is.null'
                    : `status.eq.${conn.status}`)
                  .select('id');
                if (updated?.length) {
                  if (dbStatus === 'connected' && connectionRecoveryConfirmed) {
                    const { error: resolvedIncidentError } = await supabase.from('warroom_alerts')
                      .update({ dedupe_key: null })
                      .in('dedupe_key', [`conn-down:v1:${conn.id}`, `conn-degraded:v1:${conn.id}`]);
                    if (resolvedIncidentError) log.warn('Falha ao encerrar alerta de conexão recuperada', { error: resolvedIncidentError.message });
                  }
                  // Trilha de auditoria: só quando o CAS CONFIRMOU a transição —
                  // é isso que o diálogo de auditoria (CA2) lê por instance_id.
                  statusAuditEvents.push({
                    id: conn.id,
                    instanceId: conn.instance_id,
                    action: dbStatus === 'connected' ? 'connection_connected' : 'connection_disconnected',
                    previousStatus: conn.status ?? null,
                    newStatus: dbStatus,
                  });
                  if (dbStatus === 'disconnected' && conn.status === 'connected') {
                    alertsToCreate.push({
                      connection_id: conn.id,
                      instance_id: conn.instance_id,
                      phone: conn.phone_number,
                      kind: 'disconnected',
                      reason: openReason,
                    });
                  }
                }
              }
              // Degradação pelo socket (webhook parado): entra no funil de alerta
              // com o próprio tipo — o warroom registra 'warning' e o push/e-mail
              // respeitam o opt-in de 'degraded'.
              if (healthStatus === 'degraded' && openReason === 'webhook_silent') {
                alertsToCreate.push({ connection_id: conn.id, instance_id: conn.instance_id, phone: conn.phone_number, kind: 'degraded', reason: openReason });
              }
            }
            // Escalada: avaliada em TODA sonda enquanto a conexão segue caída ou
            // degradada (o nível depende do tempo do episódio, não da transição).
            if (healthStatus === 'disconnected' || (healthStatus === 'degraded' && openReason === 'webhook_silent')) {
              escalations.push({
                alert: { connection_id: conn.id, instance_id: conn.instance_id, phone: conn.phone_number, kind: healthStatus === 'disconnected' ? 'disconnected' : 'degraded', reason: openReason },
                exhausted: reconnectExhausted,
                healthReason: reconnectExhausted ? RECONNECT_EXHAUSTED_REASON : (openReason === 'phantom_session' ? PHANTOM_SESSION_REASON : (conn.health_reason ?? null)),
              });
            }
          } else {
            // E24/E28: 401/403 = a instancia nao autentica com a credencial que
            // temos. Isso NAO e queda da sessao: o estado proprio de monitoramento
            // ('no_credentials') evita alerta falso de "desconectada" e, como toda
            // resposta nao-ok, nao sobrescreve o status da conexao (fail-closed).
            healthStatus = resp.status === 401 || resp.status === 403 ? 'no_credentials' : 'error';
            errorMessage = `HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`;
          }
        } catch (err) {
          responseTime = Math.round(performance.now() - start);
          healthStatus = 'timeout';
          errorMessage = err instanceof Error ? err.message : 'Unknown error';
        }
      }

      await supabase.from('connection_health_logs').insert({
        connection_id: conn.id, instance_id: conn.instance_id, status: healthStatus,
        response_time_ms: responseTime, error_message: errorMessage,
      });

      await supabase.from('whatsapp_connections').update({
        last_health_check: new Date().toISOString(), health_status: healthStatus, health_response_ms: responseTime,
      }).eq('id', conn.id);

      results[index] = { instance_id: conn.instance_id, status: healthStatus, response_time_ms: responseTime, error: errorMessage, reason: openReason };
    };

    await runWithConcurrency(connections, HEALTH_CHECK_CONCURRENCY, checkConnection);

    // Trilha de auditoria das transições automáticas de status. Mesmo formato do
    // helper compartilhado dos cartões de conexão (`writeConnectionAuditLog`):
    // entity_type 'connection', uuid da linha em `entity_id`, instance_id textual
    // em `details`. `user_id` fica nulo — foi o monitor, não um usuário — e a tela
    // mostra "Sistema". Sem telefone, token, QR nem payload bruto do provedor.
    // Falha da TRILHA não derruba a sonda: a transição já está gravada no banco e
    // devolver 500 faria parecer que a checagem falhou (mesma regra do helper) —
    // mas o erro é logado, nunca engolido.
    for (const event of statusAuditEvents) {
      const { error: auditError } = await supabase.from('audit_logs').insert({
        user_id: null,
        action: event.action,
        entity_type: 'connection',
        entity_id: event.id,
        details: {
          instance_id: event.instanceId,
          previous_status: event.previousStatus,
          status: event.newStatus,
          source: 'health-check',
        },
      });
      if (auditError) {
        log.warn("Falha ao gravar trilha de auditoria da transicao de status", {
          action: event.action, error: auditError.message,
        });
      }
    }

    const newAlerts = dedupeAlerts(alertsToCreate);
    for (const alert of newAlerts) {
      const { title, message } = alertContent(alert);
      // Schema real de warroom_alerts: alert_type/title/message/source
      // (severity/description/metadata nao existem — o insert antigo falhava
      // com PGRST204 e o alerta critico nunca era gravado).
      await supabase.from('warroom_alerts').insert({
        alert_type: alert.kind === 'disconnected' ? 'critical' : 'warning',
        title,
        message,
        source: 'connection-health-check',
        dedupe_key: alertDedupeKey(alert),
      }).then(({ error }) => {
        // 23505 = episódio já registrado (idempotente); outro erro só loga.
        if (error && (error as { code?: string }).code !== '23505') {
          log.warn('Failed to create warroom alert', { error: error.message });
        }
      });
    }

    // Regra dos três níveis (regras.md §4.2): a transição (nível 0) só grava o
    // warroom — ninguém recebe push/e-mail. Push + e-mail saem no nível 1 (queda
    // confirmada) para admin e supervisor SEMPRE, mais quem optou no cartão; no
    // nível 2 (≥ 1 h) repete por hora só para o admin.
    const prefs = escalations.length > 0 ? await loadConnectionAlertPrefs(supabase, log) : [];
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const now = new Date();
    let escalated = 0;
    for (const e of escalations) {
      const episodeStart = await readEpisodeStart(supabase, log, e.alert, now);
      const level = decideEscalation({ kind: e.alert.kind, reason: e.alert.reason, exhausted: e.exhausted, episodeStart, now });
      if (level === 0) continue;
      escalated += 1;
      if (e.alert.kind === 'disconnected' && !e.healthReason) {
        // Queda confirmada pelo tempo: o composer passa a vermelho (precisa de QR) — mesmo
        // sinal que a reconexão esgotada/sessão fantasma já gravam.
        await supabase.from('whatsapp_connections').update({ health_reason: CONFIRMED_DOWN_REASON }).eq('id', e.alert.connection_id);
      }
      // Nível 2 pressupõe o nível 1 (admin+supervisor+opt-in) — se a primeira sonda elegível
      // já chegou depois de 1 h, o nível 1 sai antes; a chave própria garante uma vez só.
      if (level === 2) await notifyEscalation(supabase, log, { alert: e.alert, level: 1, now, prefs, resendKey });
      await notifyEscalation(supabase, log, { alert: e.alert, level, now, prefs, resendKey });
    }


    // Cleanup old health logs
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('connection_health_logs').delete().lt('checked_at', sevenDaysAgo);

    log.done(200, { checked: results.length, alerts: newAlerts.length, escalated });
    return jsonResponse({
      success: true, checked_at: new Date().toISOString(),
      connections: results, alerts_created: newAlerts.length,
    }, 200, req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    log.error("Health check error", { error: msg });
    return errorResponse(msg, 500, req);
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleConnectionHealthCheck(req));
}
