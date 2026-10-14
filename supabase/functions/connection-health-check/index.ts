import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { evoFetch, extractConnectionState } from '../_shared/evolution-send.ts';
import { resolveEvolutionFlavor, resolveSessionRoute } from '../_shared/evolution-session-routes.ts';
import { errorResponse, jsonResponse, requireEnv, checkRateLimit } from "../_shared/validation.ts";
import { escapeHtml } from '../_shared/notification-events.ts';
import { EMAIL_FONT_STACK } from '../_shared/email-font-stack.ts';
import { isAuthorizedCronOrUser, timingSafeStringEqual, unauthorizedResponse } from '../_shared/cron-secret-auth.ts';
import { bootEdge, type EdgeInjected } from '../_shared/edge-boot.ts';

// R2-CONEX-0xx (paridade V3 → V2): o health check da V3 tem TRÊS camadas de
// detecção (socket, identidade/owner JID e atividade); a V2 só olhava `open`/`close`
// e por isso uma instância "aberta" cujo webhook parou de entregar (a "caixa muda"
// do PE-87) nunca gerava alerta. Aqui as camadas 2 e 3 são adotadas com os limiares
// da V3: 30 min sem atividade = degradada (webhook silencioso); 6 h = desconectada.
const ACTIVITY_DEGRADED_MS = 30 * 60 * 1000; // 30 min → webhook_silent (degraded)
const ACTIVITY_STALE_MS = 6 * 60 * 60 * 1000; // 6 h  → stale_session (disconnected)

// PE-87: minutos sem NENHUMA mensagem recebida para a caixa de entrada marcar a
// conexão como silenciosa. A chave global_settings.inbox_silence_minutes (padrão 10,
// inteiro de 1 a 1440) é lida uma vez por execução; valor ausente/fora do padrão cai
// no default, e o clamp repete a faixa do CHECK do banco (defesa em profundidade).
const DEFAULT_INBOX_SILENCE_MINUTES = 10;
const MIN_INBOX_SILENCE_MINUTES = 1;
const MAX_INBOX_SILENCE_MINUTES = 1440;

/** Resultado da camada 2: `known=false` quando o provedor não devolveu identidade. */
export interface OwnerLookup {
  known: boolean;
  ownerJid: string | null;
}

export type HealthLevel = 'healthy' | 'degraded' | 'disconnected';

/** Mínimo do logger injetado pelo bootEdge (evita acoplar ao tipo interno). */
type EdgeLog = {
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
};

/**
 * Lê o owner JID da resposta de `/instance/fetchInstances`.
 *
 * `known=false` quando a resposta não traz NENHUM campo de identidade (ex.: resposta
 * de um provedor que não implementa a rota). Nesse caso a camada 2 é PULADA — não
 * inventamos "sessão fantasma" a partir de um erro de rota, que seria alerta falso.
 * Quando a rota responde com identidade mas sem número pareado (`ownerJid` vazio),
 * `known=true` e `ownerJid=null` → phantom_session.
 */
export function parseOwnerJid(data: unknown): OwnerLookup {
  // deno-lint-ignore no-explicit-any
  const entry = (Array.isArray(data) ? data[0] : data) as any;
  if (!entry || typeof entry !== 'object') return { known: false, ownerJid: null };
  const inst = entry.instance ?? {};
  const identFields = [
    inst.ownerJid, inst.owner, entry.ownerJid, entry.owner,
    inst.connectionStatus, entry.connectionStatus,
  ];
  const known = identFields.some((f) => f !== undefined && f !== null);
  if (!known) return { known: false, ownerJid: null };
  const owner = inst.ownerJid ?? inst.owner ?? entry.ownerJid ?? entry.owner ?? null;
  const ownerJid = typeof owner === 'string' && owner.length > 0 ? owner : null;
  return { known: true, ownerJid };
}

/**
 * Camadas 2 e 3, só para socket `open` (o não-aberto continua sendo tratado pelo
 * chamador como hoje: `close` → desconectada; transitório → degradada).
 *
 *   owner conhecido e ausente         → degraded/disconnected · phantom_session
 *   idade da última entrada > 6 h     → disconnected/disconnected · stale_session
 *   idade da última entrada 30 min..6 h → degraded/connected · webhook_silent
 *   caso contrário                    → healthy/connected
 */
export function evaluateOpenConnectionHealth(args: {
  owner: OwnerLookup;
  lastActivityAt: Date | null;
  now: Date;
}): { healthStatus: HealthLevel; dbStatus: 'connected' | 'disconnected'; reason: string | null } {
  if (args.owner.known && !args.owner.ownerJid) {
    return { healthStatus: 'degraded', dbStatus: 'disconnected', reason: 'phantom_session' };
  }
  if (args.lastActivityAt) {
    const age = args.now.getTime() - args.lastActivityAt.getTime();
    if (age > ACTIVITY_STALE_MS) {
      return { healthStatus: 'disconnected', dbStatus: 'disconnected', reason: 'stale_session' };
    }
    if (age > ACTIVITY_DEGRADED_MS) {
      return { healthStatus: 'degraded', dbStatus: 'connected', reason: 'webhook_silent' };
    }
  }
  return { healthStatus: 'healthy', dbStatus: 'connected', reason: null };
}

/** Chave idempotente do episódio de "caixa muda" por conexão (warroom_alerts.dedupe_key). */
export function inboxSilenceDedupeKey(connectionId: string): string {
  return `inbox-silent:v1:${connectionId}`;
}

/** Lê o limiar de minutos do valor textual de global_settings (1..1440, padrão 10). */
export function parseSilenceMinutes(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const n = Math.trunc(value);
    if (n >= MIN_INBOX_SILENCE_MINUTES && n <= MAX_INBOX_SILENCE_MINUTES) return n;
    return DEFAULT_INBOX_SILENCE_MINUTES;
  }
  if (typeof value === 'string' && /^[0-9]{1,4}$/.test(value)) {
    const n = Number(value);
    if (n >= MIN_INBOX_SILENCE_MINUTES && n <= MAX_INBOX_SILENCE_MINUTES) return n;
  }
  return DEFAULT_INBOX_SILENCE_MINUTES;
}

/** Motivo legível (pt-BR) para o título/mensagem dos alertas. */
const REASON_LABEL: Record<string, string> = {
  phantom_session: 'sessão fantasma (socket aberto sem número pareado)',
  webhook_silent: 'webhook silencioso (sem eventos recentes)',
  stale_session: 'sessão obsoleta (mais de 6 h sem atividade)',
  socket_closed: 'socket fechado',
  degraded: 'degradada',
  disconnected: 'desconectada',
};

interface AlertToCreate {
  connection_id: string;
  instance_id: string;
  phone: string | null;
  kind: 'degraded' | 'disconnected';
  reason: string;
}

/**
 * Preferência casa com o TIPO do alerta: `alert_on_degraded` para degradada,
 * `alert_on_disconnected` para desconectada.
 */
function prefMatchesKind(
  pref: { alert_on_degraded?: boolean | null; alert_on_disconnected?: boolean | null },
  kind: 'degraded' | 'disconnected',
): boolean {
  return kind === 'degraded'
    ? pref.alert_on_degraded !== false
    : pref.alert_on_disconnected !== false;
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

    const evolutionUrl = requireEnv('EVOLUTION_API_URL');
    const evolutionKey = requireEnv('EVOLUTION_API_KEY');
    const baseUrl = evolutionUrl.replace(/\/+$/, '');

    const { data: connections, error: connError } = await supabase
      .from('whatsapp_connections').select('id, instance_id, status, phone_number')
      .neq('instance_id', 'E2E_FIXTURE'); // Pular fixture E2E — status seeded nao deve ser sobrescrito pelo health check

    if (connError || !connections) return errorResponse('Failed to fetch connections', 500, req);

    // PE-87: limiar da "caixa muda" lido uma vez por execução. Leitura defensiva:
    // a chave pode não existir (migration ainda não integrada) — cai no padrão 10.
    let silenceMinutes = DEFAULT_INBOX_SILENCE_MINUTES;
    try {
      const { data: silenceRow, error: silenceErr } = await supabase
        .from('global_settings').select('value').eq('key', 'inbox_silence_minutes').maybeSingle();
      if (!silenceErr && silenceRow) {
        silenceMinutes = parseSilenceMinutes((silenceRow as { value?: unknown }).value);
      }
    } catch (err) {
      log.warn("Falha ao ler o limiar de silêncio da caixa", { error: err instanceof Error ? err.message : String(err) });
    }
    const silenceMs = silenceMinutes * 60 * 1000;

    const results = [];
    const alertsToCreate: AlertToCreate[] = [];

    // A rota de SESSÃO desta sonda (e a credencial que ela exige) sai do MESMO
    // resolvedor do ciclo de sessão do `evolution-api` (R2-API-015): no GO a rota
    // de status e de INSTÂNCIA (a instância vem na credencial), no v2 e global.
    const flavor = resolveEvolutionFlavor(Deno.env.get('EVOLUTION_API_FLAVOR'));

    for (const conn of connections) {
      const start = performance.now();
      const now = new Date();
      let healthStatus = 'unknown';
      let errorMessage: string | null = null;
      let responseTime = 0;
      let openReason: string | null = null;

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

      // Última mensagem RECEBIDA (sender='contact', a direção canônica do projeto)
      // desta conexão, para a camada 3 e o detector de "caixa muda".
      let lastInboundAt: Date | null = null;
      let lastInboundKnown = false;

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

            let dbStatus: 'connected' | 'disconnected' | null = null;
            if (state === 'open') {
              // Camada 3: última entrada recebida (defensivo — mensagem ausente
              // não vira "inativa", evita alerta falso em conexão recém-criada).
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
                if (updated?.length && dbStatus === 'disconnected' && conn.status === 'connected') {
                  alertsToCreate.push({
                    connection_id: conn.id,
                    instance_id: conn.instance_id,
                    phone: conn.phone_number,
                    kind: 'disconnected',
                    reason: openReason ?? 'socket_closed',
                  });
                }
              }
            }

            // Camada 3 degradada: o socket está aberto mas o webhook parou de
            // entregar. O status do banco NÃO muda (continua 'connected'), então o
            // alerta é idempotente pela chave do episódio (dedupe_key), não pelo CAS.
            if (healthStatus === 'degraded' && openReason === 'webhook_silent') {
              alertsToCreate.push({
                connection_id: conn.id,
                instance_id: conn.instance_id,
                phone: conn.phone_number,
                kind: 'degraded',
                reason: openReason,
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

      results.push({
        instance_id: conn.instance_id, status: healthStatus, reason: openReason,
        response_time_ms: responseTime, error: errorMessage,
      });
    }

    // Deduplica alertas da mesma conexão (uma queda e um silêncio podem coincidir).
    const uniqueAlerts = dedupeAlerts(alertsToCreate);

    // Preferências por usuário: `connection_alert_preferences` decide QUEM recebe e
    // por QUAL canal (push/e-mail), e o tipo de alerta (degradada/desconectada).
    // Leitura defensiva: tabela ausente/erro ⇒ nenhum destinatário (fail-closed —
    // não spamamos todos os admins como antes; só quem optou recebe).
    let prefs: Array<Record<string, unknown>> = [];
    if (uniqueAlerts.length > 0) {
      try {
        const { data, error } = await supabase
          .from('connection_alert_preferences')
          .select('user_id, push_enabled, email_enabled, alert_on_degraded, alert_on_disconnected');
        if (!error && Array.isArray(data)) prefs = data as Array<Record<string, unknown>>;
      } catch (err) {
        log.warn("Falha ao ler preferências de alerta de conexão", { error: err instanceof Error ? err.message : String(err) });
      }
    }

    for (const alert of uniqueAlerts) {
      const isDegraded = alert.kind === 'degraded';
      const reasonLabel = REASON_LABEL[alert.reason] ?? alert.reason;
      const title = isDegraded
        ? `Conexão ${alert.instance_id} — ${reasonLabel}`
        : `Conexão ${alert.instance_id} desconectada`;
      const message = `A instância ${alert.instance_id}${alert.phone ? ` (${alert.phone})` : ''}: ${reasonLabel}.`;

      // Schema real de warroom_alerts: alert_type/title/message/source (+ dedupe_key
      // da migration do monitor de SLA). A chave idempotente evita que uma checagem
      // repetida do MESMO episódio crie outro alerta (23505 = já representado).
      const dedupeKey = alertDedupeKey(alert);
      let alreadyAlerted = false;
      try {
        const { error } = await supabase.from('warroom_alerts').insert({
          alert_type: isDegraded ? 'warning' : 'critical',
          title,
          message,
          source: 'connection-health-check',
          dedupe_key: dedupeKey,
        });
        if (error) {
          // deno-lint-ignore no-explicit-any
          const code = (error as any)?.code;
          if (code === '23505') alreadyAlerted = true;
          else log.warn("Failed to create warroom alert", { error: error.message });
        }
      } catch (err) {
        log.warn("Failed to create warroom alert", { error: err instanceof Error ? err.message : String(err) });
      }
      if (alreadyAlerted) continue;

      await notifyOptedIn(supabase, log, {
        alert,
        prefs,
        title,
        message,
        isDegraded,
      });
    }

    // Cleanup old health logs
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('connection_health_logs').delete().lt('checked_at', sevenDaysAgo);

    log.done(200, { checked: results.length, alerts: uniqueAlerts.length });
    return jsonResponse({
      success: true, checked_at: new Date().toISOString(),
      connections: results, alerts_created: uniqueAlerts.length,
    }, 200, req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    log.error("Health check error", { error: msg });
    return errorResponse(msg, 500, req);
  }
}

/** Chave idempotente do alerta de queda/degradada por conexão e episódio. */
function alertDedupeKey(alert: AlertToCreate): string {
  return alert.kind === 'degraded'
    ? `conn-degraded:v1:${alert.connection_id}`
    : `conn-down:v1:${alert.connection_id}`;
}

/** Uma linha por (conexão, tipo): evita alerta duplicado quando as camadas coincidem. */
function dedupeAlerts(alerts: AlertToCreate[]): AlertToCreate[] {
  const seen = new Set<string>();
  const out: AlertToCreate[] = [];
  for (const a of alerts) {
    const key = `${a.connection_id}:${a.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/**
 * Camada 2 — identidade via `/instance/fetchInstances`. Usa a MESMA credencial da
 * rota de status (token da própria instância, nunca a chave global). Não-ok, erro
 * de rede ou resposta sem identidade ⇒ `known=false` (camada pulada).
 */
async function fetchOwnerJid(
  baseUrl: string,
  evolutionKey: string,
  instanceId: string,
  instanceToken: string | undefined,
): Promise<OwnerLookup> {
  try {
    const resp = await evoFetch(baseUrl, evolutionKey,
      `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceId)}`, undefined,
      (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(8000) }), 'GET', undefined, instanceToken);
    if (!resp.ok) {
      await resp.text();
      return { known: false, ownerJid: null };
    }
    return parseOwnerJid(await resp.json());
  } catch {
    return { known: false, ownerJid: null };
  }
}

/** Horário comercial da conexão (RPC do banco). Falha ⇒ falso (não alerta). */
async function isWithinBusinessHours(supabase: SupabaseClient, connectionId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_within_business_hours', { connection_id: connectionId });
    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * PE-87 — sincroniza o alerta de "caixa muda" do episódio:
 *  - silenciosa ⇒ INSERT idempotente (dedupe_key por conexão). Repetição cai em 23505.
 *  - voltou a receber ⇒ DELETE da chave (auto-resolve), liberando o próximo episódio.
 */
async function syncInboxSilenceAlert(
  supabase: SupabaseClient,
  log: EdgeLog,
  args: { connectionId: string; instanceId: string; phone: string | null; silent: boolean; silenceMinutes: number },
): Promise<void> {
  const dedupeKey = inboxSilenceDedupeKey(args.connectionId);
  if (args.silent) {
    try {
      const { error } = await supabase.from('warroom_alerts').insert({
        alert_type: 'warning',
        title: `Conexão ${args.instanceId} — caixa de entrada muda`,
        message: `Nenhuma mensagem recebida em ${args.silenceMinutes} min na instância ${args.instanceId}${args.phone ? ` (${args.phone})` : ''}. Verifique se o webhook ainda entrega.`,
        source: 'connection-health-check',
        dedupe_key: dedupeKey,
      });
      if (error && (error as { code?: string }).code !== '23505') {
        log.warn("Falha ao criar alerta de caixa muda", { error: error.message });
      }
    } catch (err) {
      log.warn("Falha ao criar alerta de caixa muda", { error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    // Auto-resolve: o episódio acabou (mensagem voltou a chegar). Só a chave deste
    // episódio é removida; o próximo silêncio volta a alertar.
    try {
      await supabase.from('warroom_alerts').delete().eq('dedupe_key', dedupeKey);
    } catch (err) {
      log.warn("Falha ao resolver alerta de caixa muda", { error: err instanceof Error ? err.message : String(err) });
    }
  }
}

/**
 * Notifica SÓ quem optou: push (app_notifications) e e-mail (Resend), cada canal
 * filtrado por `push_enabled`/`email_enabled` e pelo tipo (degradada/desconectada).
 */
async function notifyOptedIn(
  supabase: SupabaseClient,
  log: EdgeLog,
  args: {
    alert: AlertToCreate;
    prefs: Array<Record<string, unknown>>;
    title: string;
    message: string;
    isDegraded: boolean;
  },
): Promise<void> {
  const { alert, prefs, title, message, isDegraded } = args;

  const pushUserIds = prefs
    .filter((p) => p.push_enabled === true && prefMatchesKind(p as never, alert.kind))
    .map((p) => p.user_id as string)
    .filter(Boolean);

  if (pushUserIds.length > 0) {
    const rows = pushUserIds.map((uid) => ({
      user_id: uid,
      title,
      message,
      type: 'connection_alert',
      metadata: {
        connection_id: alert.connection_id,
        instance_id: alert.instance_id,
        reason: alert.reason,
        phone: alert.phone,
      },
    }));
    try {
      const { error } = await supabase.from('app_notifications').insert(rows);
      if (error) log.warn("app_notifications insert failed", { error: error.message });
    } catch (err) {
      log.warn("app_notifications insert failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // E-mail: só admins que optaram pelo canal e pelo tipo do alerta.
  const emailUserIds = new Set(
    prefs
      .filter((p) => p.email_enabled === true && prefMatchesKind(p as never, alert.kind))
      .map((p) => p.user_id as string)
      .filter(Boolean),
  );
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const { data: admins } = await supabase
    .from('profiles').select('id, email').eq('role', 'admin').not('email', 'is', null);
  const to = (admins ?? [])
    .filter((a) => emailUserIds.has((a as { id: string }).id))
    .map((a) => (a as { email?: string }).email as string)
    .filter(Boolean);

  if (to.length === 0) {
    log.warn("Alerta de conexão sem destinatário optante por e-mail", { hasKey: Boolean(resendKey), optedIn: emailUserIds.size });
    return;
  }
  if (!resendKey) {
    log.warn("Alerta de conexão sem canal de e-mail", { recipients: to.length });
    return;
  }

  const label = escapeHtml(alert.instance_id) + (alert.phone ? ` (${escapeHtml(alert.phone)})` : '');
  const heading = isDegraded
    ? '\\uD83D\\uDFE1 A conexão do WhatsApp está degradada'
    : '\\uD83D\\uDD34 A conexão do WhatsApp caiu';
  const emoji = isDegraded ? '\\uD83D\\uDFE1' : '\\uD83D\\uDD34';
  const color = isDegraded ? '#d97706' : '#dc2626';
  const bg = isDegraded ? '#fffbeb' : '#fef2f2';
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'ZAPP Alertas <alertas@promobrindes.com.br>',
        to,
        subject: `${emoji} WhatsApp ${alert.instance_id} — ${isDegraded ? 'degradada' : 'desconectado'} \\u2014 ZAPP`,
        html: `<div style="font-family:${EMAIL_FONT_STACK};max-width:600px;margin:0 auto">
          <h2 style="color:${color}">${heading}</h2>
          <div style="background:${bg};border-left:4px solid ${color};padding:16px;margin:16px 0">
            <p style="margin:0;font-size:16px">A instância <strong>${label}</strong>: ${escapeHtml(message)}</p>
          </div>
          <p style="font-size:15px">Abra <strong>Conexões</strong> no ZAPP para reconectar ou verificar o webhook.</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px">Detectado em ${new Date().toISOString()} pelo monitor automático (connection-health-check).</p>
        </div>`,
      }),
    });
    if (!resp.ok) log.warn("Resend recusou o alerta de conexão", { status: resp.status });
  } catch (err) {
    log.error("Falha ao enviar alerta de conexão por e-mail", { error: err instanceof Error ? err.message : String(err) });
  }
}

if (import.meta.main) {
  Deno.serve((req) => handleConnectionHealthCheck(req));
}
