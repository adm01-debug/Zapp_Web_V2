# Views


## public.catalog_send_stats (view)

| campo | valor |
|---|---|
| owner | postgres |
| security_invoker | sim |
| opções | security_invoker=on |
| depende de | public.catalog_send_events |
| populada | n/a |
| comentário | CT-48: envios do catalogo por dia (30d), por agente e por produto, com parciais/falhas e taxas. security_invoker=on (respeita a RLS por agent_id de catalog_send_events). |


```sql
WITH base AS (
         SELECT catalog_send_events.created_at::date AS dia,
            catalog_send_events.agent_id,
            catalog_send_events.product_id,
            catalog_send_events.product_name,
            COALESCE(catalog_send_events.status, ''::text) AS status
           FROM catalog_send_events
          WHERE catalog_send_events.created_at >= (now() - '30 days'::interval)
        ), por_dia AS (
         SELECT 'dia'::text AS grao,
            base.dia::text AS chave,
            base.dia::text AS rotulo,
            count(*) AS total,
            count(*) FILTER (WHERE base.status = 'sent'::text) AS enviados,
            count(*) FILTER (WHERE base.status = 'partial'::text) AS parciais,
            count(*) FILTER (WHERE base.status = 'failed'::text) AS falhas
           FROM base
          GROUP BY base.dia
        ), por_agente AS (
         SELECT 'agente'::text AS grao,
            base.agent_id::text AS chave,
            base.agent_id::text AS rotulo,
            count(*) AS total,
            count(*) FILTER (WHERE base.status = 'sent'::text) AS enviados,
            count(*) FILTER (WHERE base.status = 'partial'::text) AS parciais,
            count(*) FILTER (WHERE base.status = 'failed'::text) AS falhas
           FROM base
          GROUP BY base.agent_id
        ), por_produto AS (
         SELECT 'produto'::text AS grao,
            base.product_id::text AS chave,
            max(base.product_name) AS rotulo,
            count(*) AS total,
            count(*) FILTER (WHERE base.status = 'sent'::text) AS enviados,
            count(*) FILTER (WHERE base.status = 'partial'::text) AS parciais,
            count(*) FILTER (WHERE base.status = 'failed'::text) AS falhas
           FROM base
          GROUP BY base.product_id
        )
 SELECT grao,
    chave,
    rotulo,
    total,
    enviados,
    parciais,
    falhas,
    round(parciais::numeric / NULLIF(total, 0)::numeric, 4) AS taxa_parcial,
    round(falhas::numeric / NULLIF(total, 0)::numeric, 4) AS taxa_falha
   FROM ( SELECT por_dia.grao,
            por_dia.chave,
            por_dia.rotulo,
            por_dia.total,
            por_dia.enviados,
            por_dia.parciais,
            por_dia.falhas
           FROM por_dia
        UNION ALL
         SELECT por_agente.grao,
            por_agente.chave,
            por_agente.rotulo,
            por_agente.total,
            por_agente.enviados,
            por_agente.parciais,
            por_agente.falhas
           FROM por_agente
        UNION ALL
         SELECT por_produto.grao,
            por_produto.chave,
            por_produto.rotulo,
            por_produto.total,
            por_produto.enviados,
            por_produto.parciais,
            por_produto.falhas
           FROM por_produto) t;
```

## public.channel_connections_safe (view)

| campo | valor |
|---|---|
| owner | postgres |
| security_invoker | sim |
| opções | security_invoker=true |
| depende de | public.channel_connections |
| populada | n/a |
| comentário |  |


```sql
SELECT id,
    channel_type,
    name,
    status,
    is_active,
    external_account_id,
    external_page_id,
    webhook_url,
    whatsapp_connection_id,
    created_at,
    updated_at,
    created_by
   FROM channel_connections;
```

## public.gmail_accounts_safe (view)

| campo | valor |
|---|---|
| owner | postgres |
| security_invoker | sim |
| opções | security_invoker=true |
| depende de | public.gmail_accounts |
| populada | n/a |
| comentário |  |


```sql
SELECT id,
    user_id,
    email_address,
    is_active,
    sync_status,
    last_sync_at,
    last_error,
    token_expires_at,
    created_at,
    updated_at
   FROM gmail_accounts;
```

## public.password_reset_requests_safe (view)

| campo | valor |
|---|---|
| owner | postgres |
| security_invoker | sim |
| opções | security_invoker=true |
| depende de | public.password_reset_requests |
| populada | n/a |
| comentário |  |


```sql
SELECT id,
    user_id,
    email,
    reason,
    status,
    reviewed_by,
    reviewed_at,
    rejection_reason,
    token_expires_at,
    ip_address,
    user_agent,
    created_at,
    updated_at
   FROM password_reset_requests;
```

## public.profiles_public (view)

| campo | valor |
|---|---|
| owner | postgres |
| security_invoker | sim |
| opções | security_invoker=true |
| depende de | public.profiles |
| populada | n/a |
| comentário |  |


```sql
SELECT id,
    user_id,
    name,
    avatar_url,
    is_active,
    department,
    job_title
   FROM profiles;
```

## public.searchbox_usage_daily (view)

| campo | valor |
|---|---|
| owner | postgres |
| security_invoker | sim |
| opções | security_invoker=true |
| depende de | public.audit_logs |
| populada | n/a |
| comentário | E52: consumo diario do Searchbox (sessoes) e avisos de teto (degradacoes), no fuso America/Sao_Paulo. Fonte: audit_logs, a mesma da RPC count_searchbox_sessions_this_month. |


```sql
SELECT (created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date AS dia,
    count(*) FILTER (WHERE action = 'searchbox_session'::text)::integer AS sessoes,
    count(*) FILTER (WHERE action = 'searchbox_cost_guard'::text)::integer AS degradacoes,
    max(created_at) AS ultimo_evento_em
   FROM audit_logs a
  WHERE action = ANY (ARRAY['searchbox_session'::text, 'searchbox_cost_guard'::text])
  GROUP BY ((created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date)
  ORDER BY ((created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date) DESC;
```

## public.talkx_campaign_metrics (view)

| campo | valor |
|---|---|
| owner | postgres |
| security_invoker | sim |
| opções | security_invoker=true |
| depende de | public.talkx_campaigns |
| populada | n/a |
| comentário |  |


```sql
SELECT id AS campaign_id,
    segment_id,
    template_id,
    status,
    total_recipients,
    sent_count,
    delivered_count,
    COALESCE(replied_count, 0) AS replied_count,
    outcome_unknown_count,
    round(
        CASE
            WHEN sent_count > 0 THEN delivered_count::numeric / sent_count::numeric * 100::numeric
            ELSE 0::numeric
        END, 1) AS delivery_rate_pct,
    round(
        CASE
            WHEN sent_count > 0 THEN COALESCE(replied_count, 0)::numeric / sent_count::numeric * 100::numeric
            ELSE 0::numeric
        END, 1) AS reply_rate_pct,
    EXTRACT(epoch FROM completed_at - started_at)::integer AS duration_secs,
    started_at,
    completed_at,
    created_at,
    id,
    name AS campaign_name
   FROM talkx_campaigns c
  WHERE status = 'completed'::text AND started_at IS NOT NULL AND completed_at IS NOT NULL;
```

## public.talkx_campaign_optouts (view)

| campo | valor |
|---|---|
| owner | postgres |
| security_invoker | sim |
| opções | security_invoker=true |
| depende de | public.talkx_blacklist |
| populada | n/a |
| comentário | Talk X (X029/X070): opt-outs por campanha (reason_code opt_out). security_invoker=on: a RLS de talkx_blacklist de quem consulta continua valendo. |


```sql
SELECT campaign_id,
    count(*) AS optout_count,
    count(*) FILTER (WHERE origin = 'auto_optout'::text) AS auto_optout_count,
    max(created_at) AS last_optout_at
   FROM talkx_blacklist b
  WHERE campaign_id IS NOT NULL AND reason_code = 'opt_out'::text
  GROUP BY campaign_id;
```

## public.talkx_engine_health (view)

| campo | valor |
|---|---|
| owner | postgres |
| security_invoker | sim |
| opções | security_invoker=true |
| depende de | public.talkx_campaigns, public.talkx_recipients |
| populada | n/a |
| comentário | X033 + X126: saude do motor Talk X (security_invoker). Sinais: stalled_campaign (sending sem envio novo >15min com janela aberta), stale_lease (destinatario sending com lease vencido), outcome_unknown_24h e failure_rate_15m (ambos por status_changed_at: so a troca REAL de status conta, nunca o expurgo de PII) e cron_run (ultimas 60 execucoes do cron do Talk X com status/return_message). |


```sql
WITH sending_activity AS (
         SELECT c.id AS campaign_id,
            COALESCE(( SELECT max(r.sent_at) AS max
                   FROM talkx_recipients r
                  WHERE r.campaign_id = c.id AND r.sent_at IS NOT NULL), c.started_at, c.updated_at) AS last_activity_at
           FROM talkx_campaigns c
          WHERE c.status = 'sending'::text
        )
 SELECT 'stalled_campaign'::text AS kind,
    a.campaign_id,
    NULL::uuid AS recipient_id,
    NULL::text AS status,
    NULL::text AS return_message,
    NULL::bigint AS metric_count,
    NULL::numeric AS metric_rate,
    jsonb_build_object('last_activity_at', a.last_activity_at, 'stalled_minutes', floor(EXTRACT(epoch FROM now() - a.last_activity_at) / 60::numeric)::integer) AS detail,
    a.last_activity_at AS observed_at
   FROM sending_activity a
  WHERE a.last_activity_at < (now() - '00:15:00'::interval) AND talkx_engine_window_open(a.campaign_id)
UNION ALL
 SELECT 'stale_lease'::text AS kind,
    r.campaign_id,
    r.id AS recipient_id,
    r.status,
    NULL::text AS return_message,
    NULL::bigint AS metric_count,
    NULL::numeric AS metric_rate,
    jsonb_build_object('delivery_claim_expires_at', r.delivery_claim_expires_at) AS detail,
    r.delivery_claim_expires_at AS observed_at
   FROM talkx_recipients r
  WHERE r.status = 'sending'::text AND r.delivery_claim_expires_at IS NOT NULL AND r.delivery_claim_expires_at < now()
UNION ALL
 SELECT 'outcome_unknown_24h'::text AS kind,
    r.campaign_id,
    NULL::uuid AS recipient_id,
    NULL::text AS status,
    NULL::text AS return_message,
    count(*) AS metric_count,
    NULL::numeric AS metric_rate,
    jsonb_build_object('window_hours', 24) AS detail,
    now() AS observed_at
   FROM talkx_recipients r
  WHERE r.status = 'outcome_unknown'::text AND r.status_changed_at >= (now() - '24:00:00'::interval)
  GROUP BY r.campaign_id
UNION ALL
 SELECT 'failure_rate_15m'::text AS kind,
    r.campaign_id,
    NULL::uuid AS recipient_id,
    NULL::text AS status,
    NULL::text AS return_message,
    count(*) FILTER (WHERE r.status = 'failed'::text) AS metric_count,
    round(count(*) FILTER (WHERE r.status = 'failed'::text)::numeric / NULLIF(count(*), 0)::numeric, 4) AS metric_rate,
    jsonb_build_object('window_minutes', 15) AS detail,
    now() AS observed_at
   FROM talkx_recipients r
  WHERE r.status_changed_at >= (now() - '00:15:00'::interval) AND (r.status = ANY (ARRAY['sent'::text, 'delivered'::text, 'failed'::text, 'outcome_unknown'::text]))
  GROUP BY r.campaign_id
UNION ALL
 SELECT 'cron_run'::text AS kind,
    NULL::uuid AS campaign_id,
    NULL::uuid AS recipient_id,
    cr.status,
    cr.return_message,
    NULL::bigint AS metric_count,
    NULL::numeric AS metric_rate,
    jsonb_build_object('runid', cr.runid, 'jobid', cr.jobid, 'start_time', cr.start_time, 'end_time', cr.end_time) AS detail,
    cr.start_time AS observed_at
   FROM talkx_engine_cron_runs(60) cr(runid, jobid, status, return_message, start_time, end_time)
  WHERE COALESCE(auth.role(), ''::text) = 'service_role'::text OR is_admin_or_supervisor(auth.uid());
```

## public.team_message_read_state (view)

| campo | valor |
|---|---|
| owner | postgres |
| security_invoker | sim |
| opções | security_invoker=true |
| depende de | public.team_conversation_members, public.team_message_receipts, public.team_messages |
| populada | n/a |
| comentário |  |


```sql
SELECT m.id AS message_id,
    m.conversation_id,
    count(DISTINCT tcm.profile_id) AS member_count,
    count(DISTINCT
        CASE
            WHEN r.status = 'read'::text AND r.profile_id <> m.sender_id THEN r.profile_id
            ELSE NULL::uuid
        END) AS read_count,
    count(DISTINCT
        CASE
            WHEN r.status = 'read'::text AND r.profile_id <> m.sender_id THEN r.profile_id
            ELSE NULL::uuid
        END) = (count(DISTINCT tcm.profile_id) - 1) AS all_read
   FROM team_messages m
     JOIN team_conversation_members tcm ON tcm.conversation_id = m.conversation_id
     LEFT JOIN team_message_receipts r ON r.message_id = m.id AND r.profile_id = tcm.profile_id AND r.status = 'read'::text
  GROUP BY m.id, m.conversation_id, m.sender_id;
```

## public.whatsapp_connections_agent (view)

| campo | valor |
|---|---|
| owner | postgres |
| security_invoker | sim |
| opções | security_invoker=true |
| depende de | public.whatsapp_connections |
| populada | n/a |
| comentário |  |


```sql
SELECT id,
    name,
    status,
    phone_number,
    is_default
   FROM whatsapp_connections;
```

## public.whatsapp_connections_public (view)

| campo | valor |
|---|---|
| owner | postgres |
| security_invoker | sim |
| opções | security_invoker=true |
| depende de | public.whatsapp_connections |
| populada | n/a |
| comentário |  |


```sql
SELECT id,
    name,
    status,
    is_default
   FROM whatsapp_connections;
```

## public.whatsapp_connections_safe (view)

| campo | valor |
|---|---|
| owner | postgres |
| security_invoker | sim |
| opções | security_invoker=true |
| depende de | public.whatsapp_connections |
| populada | n/a |
| comentário |  |


```sql
SELECT id,
    name,
    phone_number,
    status,
    is_default,
        CASE
            WHEN has_role(auth.uid(), 'admin'::app_role) THEN qr_code
            ELSE NULL::text
        END AS qr_code,
        CASE
            WHEN has_role(auth.uid(), 'admin'::app_role) THEN instance_id
            ELSE NULL::text
        END AS instance_id,
    farewell_message,
    farewell_enabled,
    battery_level,
    is_plugged,
    retry_count,
    max_retries,
    last_health_check,
    health_status,
    health_response_ms,
    created_by,
    created_at,
    updated_at,
    health_reason
   FROM whatsapp_connections;
```
