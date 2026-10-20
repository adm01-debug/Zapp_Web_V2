import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.87.1";
import { evoFetch, extractConnectionState } from '../_shared/evolution-send.ts';
import { resolveEvolutionFlavor, resolveSessionRoute } from '../_shared/evolution-session-routes.ts';
import { errorResponse, jsonResponse, requireEnv, checkRateLimit } from "../_shared/validation.ts";
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

    const results: Array<{ instance_id: string; status: string; response_time_ms: number; error: string | null }> = [];
    const alertsToCreate: Array<{ connection_id: string; instance_id: string; phone: string | null }> = [];

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
        results[index] = { instance_id: conn.instance_id, status: healthStatus, response_time_ms: 0, error: errorMessage };
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
            healthStatus = state === 'open' ? 'healthy' : state === 'close' ? 'disconnected' : 'degraded';

            // Only update for definitive GO states; skip transient (connecting/qr_pending).
            const dbStatus = state === 'open' ? 'connected' : state === 'close' ? 'disconnected' : null;
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
                  alertsToCreate.push({ connection_id: conn.id, instance_id: conn.instance_id, phone: conn.phone_number });
                }
              }
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

      results[index] = { instance_id: conn.instance_id, status: healthStatus, response_time_ms: responseTime, error: errorMessage };
    };

    // Sem alvo: concorrência LIMITADA (3 por vez) — paraleliza sem abrir uma
    // dezena de sockets simultâneos ao provedor. Com alvo único, `connections`
    // tem 1 linha e a mesma função roda uma vez só (não varre as outras).
    // `results[index]` mantém a ordem da consulta mesmo com conclusões fora de
    // ordem.
    await runWithConcurrency(connections, HEALTH_CHECK_CONCURRENCY, checkConnection);

    for (const alert of alertsToCreate) {
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

    log.done(200, { checked: results.length, alerts: alertsToCreate.length });
    return jsonResponse({
      success: true, checked_at: new Date().toISOString(),
      connections: results, alerts_created: alertsToCreate.length,
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
