import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
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
};

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
 * conectada sem mensagem recebida (upsert pela dedupe_key) e APAGA quando a
 * mensagem volta a chegar (auto-resolve do episódio).
 */
async function syncInboxSilenceAlert(
  supabase: SupabaseClient,
  log: Logger,
  args: { connectionId: string; instanceId: string; phone: string | null; silent: boolean; silenceMinutes: number },
): Promise<void> {
  const key = inboxSilenceDedupeKey(args.connectionId);
  if (!args.silent) {
    const { error } = await supabase.from('warroom_alerts').delete().eq('dedupe_key', key);
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

/**
 * Push + e-mail SÓ para quem optou (opt-in por canal e por tipo). Sem opt-ins, não
 * dispara nada — e NUNCA volta a mandar para todos os admins (era o bug original).
 */
async function notifyOptedIn(
  supabase: SupabaseClient,
  log: Logger,
  args: { alert: AlertToCreate; prefs: Array<Record<string, unknown>>; resendKey: string | undefined },
): Promise<void> {
  const { alert, prefs, resendKey } = args;
  const opted = prefs.filter((p) => prefMatchesKind(p, alert.kind));
  const pushUserIds = opted.filter((p) => p['channel'] === 'push').map((p) => p['user_id'] as string).filter(Boolean);
  const emailUserIds = opted.filter((p) => p['channel'] === 'email').map((p) => p['user_id'] as string).filter(Boolean);

  // Push: notifications é a tabela REAL de push/in-app do V2 (mesmo shape que a
  // entrega original esperava em app_notifications, que não existe no banco).
  const pushRows = pushUserIds.map((userId) => ({
    user_id: userId,
    title: alert.kind === 'disconnected' ? `WhatsApp ${alert.instance_id} desconectado` : `Conexão ${alert.instance_id} degradada`,
    message: alert.kind === 'disconnected'
      ? `A instância ${alert.instance_id} perdeu conexão com o WhatsApp.`
      : `A instância ${alert.instance_id}: ${REASON_LABEL[alert.reason ?? ''] ?? 'conexão degradada'}.`,
    type: 'connection_alert',
    metadata: { connection_id: alert.connection_id, instance_id: alert.instance_id, kind: alert.kind, reason: alert.reason },
  }));
  if (pushRows.length > 0) {
    const { error } = await supabase.from('notifications').insert(pushRows);
    if (error) log.warn('notifications insert failed', { error: error.message });
  }

  if (emailUserIds.length === 0) return;
  const { data: admins } = await supabase.from('profiles').select('user_id, email').in('user_id', emailUserIds);
  const to = (admins ?? []).map((a) => (a as { email?: unknown }).email).filter((e): e is string => typeof e === 'string' && e !== '');
  if (!resendKey || to.length === 0) {
    log.warn('Alerta sem canal de e-mail (sem chave ou sem destinatários com opt-in)', { recipients: to.length });
    return;
  }
  const critical = alert.kind === 'disconnected';
  const subject = critical ? `🔴 WhatsApp ${alert.instance_id} desconectado — ZAPP` : `🟡 Conexão ${alert.instance_id} degradada — ZAPP`;
  for (const recipient of to) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'ZAPP Alertas <alertas@promobrindes.com.br>',
          to: recipient,
          subject,
          html: `<div style="font-family:${EMAIL_FONT_STACK};max-width:600px;margin:0 auto">` +
            `<h2>${escapeHtml(subject)}</h2>` +
            `<p>A instância <strong>${escapeHtml(alert.instance_id)}</strong>` +
            (critical ? ' perdeu a conexão com o WhatsApp.' : `: ${escapeHtml(REASON_LABEL[alert.reason ?? ''] ?? 'conexão degradada')}.`) +
            `</p></div>`,
        }),
      });
      if (!resp.ok) log.warn('Resend recusou o alerta de conexão', { status: resp.status });
    } catch (err) {
      log.error('Falha ao enviar alerta de conexão por e-mail', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}

/** Chave de idempotência do episódio (queda ou degradação), estável por conexão. */
function alertDedupeKey(alert: AlertToCreate): string {
  return alert.kind === 'degraded'
    ? `conn-degraded:v1:${alert.connection_id}`
    : `conn-down:v1:${alert.connection_id}`;
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
      if (cronSecretCache !== undefined) return cronSecretCache;
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
    const vaultSecret = cronSecret !== null ? await readVaultSecret() : null;
    const isCronCall = cronSecret !== null && vaultSecret !== null
      && timingSafeStringEqual(cronSecret, vaultSecret);

    if (!isCronCall) {
      const authHeader = req.headers.get('Authorization');
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
      const isServiceKeyCall = serviceKey !== '' && timingSafeStringEqual(token, serviceKey);

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
      .from('whatsapp_connections').select('id, instance_id, status, phone_number')
      .neq('instance_id', 'E2E_FIXTURE'); // Pular fixture E2E — status seeded nao deve ser sobrescrito pelo health check
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
    const checkConnection = async (conn: ConnRow, index: number): Promise<void> => {
      const start = performance.now();
      const now = new Date();
      let healthStatus = 'unknown';
      let errorMessage: string | null = null;
      let responseTime = 0;
      let openReason: string | null = null;

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
      const usaTokenDoAmbiente = padrao !== '' && conn.instance_id === padrao && tokenLegado !== '';
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

              // PE-87 — "caixa muda": conexão conectada sem NENHUMA mensagem
              // recebida além do limiar, DENTRO do horário comercial. Alerta
              // idempotente por episódio (dedupe_key) e auto-resolve quando a
              // mensagem volta a chegar.
              if (dbStatus === 'connected') {
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
                    alertsToCreate.push({ connection_id: conn.id, instance_id: conn.instance_id, phone: conn.phone_number, kind: 'disconnected', reason: openReason });
                  }
                }
              }
            }
            // Degradação não exige transição do socket: a conexão pode continuar
            // connected enquanto deixa de receber mensagens.
            if (healthStatus === 'degraded' && openReason === 'webhook_silent') {
              alertsToCreate.push({ connection_id: conn.id, instance_id: conn.instance_id, phone: conn.phone_number, kind: 'degraded', reason: openReason });
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

    await runWithConcurrency(connections as ConnRow[], HEALTH_CHECK_CONCURRENCY, checkConnection);

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

    const newAlerts: AlertToCreate[] = [];
    for (const alert of dedupeAlerts(alertsToCreate)) {
      // Schema real de warroom_alerts: alert_type/title/message/source
      // (severity/description/metadata nao existem — o insert antigo falhava
      // com PGRST204 e o alerta critico nunca era gravado).
      const title = alert.kind === 'disconnected'
        ? `Conexao ${alert.instance_id} desconectada`
        : `Conexao ${alert.instance_id} degradada`;
      const message = alert.kind === 'disconnected'
        ? `A instancia ${alert.instance_id} perdeu conexao com o WhatsApp. Reconecte para evitar perda de mensagens.`
        : `A instancia ${alert.instance_id}: ${REASON_LABEL[alert.reason ?? ''] ?? 'conexão degradada'}.`;
      const { error } = await supabase.from('warroom_alerts').insert({
        alert_type: alert.kind === 'disconnected' ? 'critical' : 'warning',
        title,
        message,
        source: 'connection-health-check',
        dedupe_key: alertDedupeKey(alert),
      });
      // 23505 = episódio já registrado (idempotente); outro erro só loga.
      if (!error) newAlerts.push(alert);
      else if ((error as { code?: string }).code !== '23505') {
        log.warn('Failed to create warroom alert', { error: error.message });
      }
    }

    // warroom_alerts só aparece para quem está com o painel aberto. O alerta tem
    // que sair do app: push (notifications) e e-mail (Resend) SÓ para quem optou.
    // A tabela de preferências (connection_alert_preferences) ainda NÃO existe no
    // banco do V2 (não está no schema-catalog nem nas migrations) — referenciá-la
    // aqui quebra o guard de espelho do CI. Até o cartão de SQL criá-la, a lista de
    // opt-ins é vazia e a notificação falha fechada: o episódio fica registrado no
    // warroom, mas nenhum push/e-mail dispara. Nunca volta a mandar para todos.
    const prefs: Array<Record<string, unknown>> = [];
    const resendKey = Deno.env.get('RESEND_API_KEY');
    for (const alert of newAlerts) {
      await notifyOptedIn(supabase, log, { alert, prefs, resendKey });
    }


    // Cleanup old health logs
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('connection_health_logs').delete().lt('checked_at', sevenDaysAgo);

    log.done(200, { checked: results.length, alerts: newAlerts.length });
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
