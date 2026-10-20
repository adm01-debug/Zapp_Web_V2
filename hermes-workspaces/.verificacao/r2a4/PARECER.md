# PARECER r2a4 — O endurecimento sobrevive a FUNCAO NOVA e a REESCRITA (CREATE OR REPLACE)?

Subagente Hermes (r2a4). Data: 30/09/2026.
Experimento: container descartavel `verif-r2a4-pg17` (imagem `postgres:17-alpine`, PostgreSQL **17.11**) no WSL.
Banco vivo consultado SOMENTE por SELECT, via gateway (`python3 /home/joaquim_ataides/projetos/mcp-clone-bwwbey/zapp_db.py`), PostgreSQL **17.6**.
Nada foi gravado no banco vivo. Nada foi gravado fora do workspace r2a4.

## VEREDITO

1) Endurecimento PERDIDO em FUNCAO NOVA? **SIM.**
   - Funcao criada por `postgres` (o grantor das alteracoes de schema) nasce como
     `{=X/postgres, postgres=X, authenticated=X, service_role=X}`. A entrada `=X/` e **PUBLIC**, logo **anon executa** — e qualquer role executa.
   - RAIZ: o default `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` e **NO-OP**.
     A `pg_default_acl` do grantor `postgres` guarda `{authenticated=X, service_role=X}` SEM entrada PUBLIC, mas o default
     embutido do PostgreSQL (`acldefault`) concede `PUBLIC=EXECUTE` a toda funcao; como o defacl nao carrega entrada
     negativa para PUBLIC, o grant embutido sobrevive. Provado por execucao real (Testes A4/A5).
   - Funcao/tabela criada pelo grantor `supabase_admin` nasce com defaults que concedem **anon EXPLICITAMENTE**
     (funcao `anon=X`; tabela `anon=arwdDxtm` = ALL) — anon executa/le direto.
2) Endurecimento PERDIDO em REESCRITA com a MESMA assinatura (`CREATE OR REPLACE`)? **NAO.** Mantem o OID e o ACL — sobrevive.
   Perde-se, porem, em **DROP FUNCTION + CREATE** (mesmo nome) e em **CREATE OR REPLACE com assinatura diferente**
   (overload novo): ambos criam objeto novo, que volta a nascer com `=X/` (PUBLIC) — anon executa.
3) anon le dado de contato/conversa por alguma das 8 views hoje? **NAO.**
   As 8 views sao `security_invoker=true`; as tabelas base tem RLS e nao existe NENHUMA policy permissiva para anon
   (banco vivo: 421 policies TO authenticated, 0 TO anon permissivas; a unica policy TO anon BLOQUEIA).
   Experimento: anon leu 0 linhas das 3 views testadas e da tabela base; authenticated sem vinculo leu 0 linhas.
   Contrafactual: a MESMA view SEM `security_invoker` vazou TODAS as linhas para anon — prova que (a) o teste detecta
   vazamento e (b) `security_invoker` e o unico guarda-corpo desse vetor.

## Endurecimentos que NAO se sustentam (lista)

- Funcao nova criada por `postgres` nasce com EXECUTE para PUBLIC (`=X`) — anon executa (o REVOKE FROM PUBLIC do ALTER DEFAULT PRIVILEGES e NO-OP).
- Funcao nova criada por `supabase_admin` nasce com EXECUTE explicito para anon (`anon=X`) alem de PUBLIC.
- Tabela nova criada por `supabase_admin` nasce com ALL para anon (o vetor das 130 tabelas de public com grant a anon).
- `DROP FUNCTION` + `CREATE` (mesmo nome) reseta o ACL — PUBLIC=EXECUTE volta, anon executa.
- `CREATE OR REPLACE` com assinatura diferente (overload novo) e objeto novo — PUBLIC=EXECUTE, anon executa.
- Ja hoje, 2 das funcoes de IA endurecidas continuam com PUBLIC=EXECUTE: `ai_is_canonical_churn_risk` e `ai_is_canonical_urgency`.

## O que NAO foi possivel verificar

- PostgREST / edge functions reais (uso efetivo do JWT). Simulei `auth.uid()` via GUC `request.jwt.claim.sub`.
- Corpos de funcoes SECURITY DEFINER (ex.: `mcp_exec`/`mcp_exec_many`) nao foram executados (a regra proibe alteracao no banco vivo).
- Se algum processo externo roda REVOKE funcao-a-funcao logo apos criar (isso explicaria as 140 funcoes de public hoje sem PUBLIC);
  o que provei e que o DEFAULT PRIVILEGES, sozinho, NAO protege funcao nova.
- As 130 tabelas: contagem por grant + teste do mecanismo RLS; nao li dado real.
- Nao confirmei o estado do `search_path` de cada SECURITY DEFINER (vetor separado, fora do escopo desta rodada).

---

## 1. Metadados lidos do banco vivo (saida crua)

### 01_version.json

```
{
 "ms": 0,
 "rows": [
  {
   "db": "postgres",
   "version": "PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit",
   "current_user": "postgres"
  }
 ],
 "row_count": 1,
 "truncated": false
}
```

### 02_default_acl.json

```
{
 "ms": 6,
 "rows": [
  {
   "acl": "{postgres=rwU/supabase_auth_admin,dashboard_user=rwU/supabase_auth_admin}",
   "schema": "auth",
   "grantor": "supabase_auth_admin",
   "objtype": "S"
  },
  {
   "acl": "{postgres=X/supabase_auth_admin,dashboard_user=X/supabase_auth_admin}",
   "schema": "auth",
   "grantor": "supabase_auth_admin",
   "objtype": "f"
  },
  {
   "acl": "{postgres=arwdDxtm/supabase_auth_admin,dashboard_user=arwdDxtm/supabase_auth_admin}",
   "schema": "auth",
   "grantor": "supabase_auth_admin",
   "objtype": "r"
  },
  {
   "acl": "{postgres=r*w*U*/supabase_admin}",
   "schema": "cron",
   "grantor": "supabase_admin",
   "objtype": "S"
  },
  {
   "acl": "{postgres=X*/supabase_admin}",
   "schema": "cron",
   "grantor": "supabase_admin",
   "objtype": "f"
  },
  {
   "acl": "{postgres=a*r*w*d*D*x*t*m*/supabase_admin}",
   "schema": "cron",
   "grantor": "supabase_admin",
   "objtype": "r"
  },
  {
   "acl": "{postgres=r*w*U*/supabase_admin}",
   "schema": "extensions",
   "grantor": "supabase_admin",
   "objtype": "S"
  },
  {
   "acl": "{postgres=X*/supabase_admin}",
   "schema": "extensions",
   "grantor": "supabase_admin",
   "objtype": "f"
  },
  {
   "acl": "{postgres=a*r*w*d*D*x*t*m*/supabase_admin}",
   "schema": "extensions",
   "grantor": "supabase_admin",
   "objtype": "r"
  },
  {
   "acl": "{postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}",
   "schema": "graphql",
   "grantor": "supabase_admin",
   "objtype": "S"
  },
  {
   "acl": "{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}",
   "schema": "graphql",
   "grantor": "supabase_admin",
   "objtype": "f"
  },
  {
   "acl": "{postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}",
   "schema": "graphql",
   "grantor": "supabase_admin",
   "objtype": "r"
  },
  {
   "acl": "{postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}",
   "schema": "graphql_public",
   "grantor": "supabase_admin",
   "objtype": "S"
  },
  {
   "acl": "{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}",
   "schema": "graphql_public",
   "grantor": "supabase_admin",
   "objtype": "f"
  },
  {
   "acl": "{postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}",
   "schema": "graphql_public",
   "grantor": "supabase_admin",
   "objtype": "r"
  },
  {
   "acl": "{postgres=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}",
   "schema": "public",
   "grantor": "postgres",
   "objtype": "S"
  },
  {
   "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
   "schema": "public",
   "grantor": "postgres",
   "objtype": "f"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "schema": "public",
   "grantor": "postgres",
   "objtype": "r"
  },
  {
   "acl": "{postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}",
   "schema": "public",
   "grantor": "supabase_admin",
   "objtype": "S"
  },
  {
   "acl": "{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}",
   "schema": "public",
   "grantor": "supabase_admin",
   "objtype": "f"
  },
  {
   "acl": "{postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}",
   "schema": "public",
   "grantor": "supabase_admin",
   "objtype": "r"
  },
  {
   "acl": "{postgres=rwU/supabase_admin,dashboard_user=rwU/supabase_admin}",
   "schema": "realtime",
   "grantor": "supabase_admin",
   "objtype": "S"
  },
  {
   "acl": "{postgres=X/supabase_admin,dashboard_user=X/supabase_admin}",
   "schema": "realtime",
   "grantor": "supabase_admin",
   "objtype": "f"
  },
  {
   "acl": "{postgres=a*r*wdDxtm/supabase_admin,dashboard_user=arwdDxtm/supabase_admin}",
   "schema": "realtime",
   "grantor": "supabase_admin",
   "objtype": "r"
  },
  {
   "acl": "{postgres=rwU/postgres,anon=rwU/postgres,authenticated=rwU/postgres,service_role=rwU/postgres}",
   "schema": "storage",
   "grantor": "postgres",
   "objtype": "S"
  },
  {
   "acl": "{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
   "schema": "storage",
   "grantor": "postgres",
   "objtype": "f"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "schema": "storage",
   "grantor": "postgres",
   "objtype": "r"
  }
 ],
 "row_count": 27,
 "truncated": false
}
```

### 03_roles.json

```
{
 "ms": 24,
 "rows": [
  {
   "rolname": "anon",
   "rolsuper": false,
   "rolinherit": true,
   "rolcanlogin": false,
   "rolbypassrls": false
  },
  {
   "rolname": "authenticated",
   "rolsuper": false,
   "rolinherit": true,
   "rolcanlogin": false,
   "rolbypassrls": false
  },
  {
   "rolname": "pg_database_owner",
   "rolsuper": false,
   "rolinherit": true,
   "rolcanlogin": false,
   "rolbypassrls": false
  },
  {
   "rolname": "postgres",
   "rolsuper": false,
   "rolinherit": true,
   "rolcanlogin": true,
   "rolbypassrls": true
  },
  {
   "rolname": "service_role",
   "rolsuper": false,
   "rolinherit": true,
   "rolcanlogin": false,
   "rolbypassrls": true
  },
  {
   "rolname": "supabase_admin",
   "rolsuper": true,
   "rolinherit": true,
   "rolcanlogin": true,
   "rolbypassrls": true
  }
 ],
 "row_count": 6,
 "truncated": false
}
```

### 06_memberships.json

```
{
 "ms": 36,
 "rows": [
  {
   "grp": "anon",
   "member": "authenticator",
   "admin_option": false
  },
  {
   "grp": "authenticated",
   "member": "authenticator",
   "admin_option": false
  },
  {
   "grp": "service_role",
   "member": "authenticator",
   "admin_option": false
  },
  {
   "grp": "postgres",
   "member": "cli_login_postgres",
   "admin_option": false
  },
  {
   "grp": "pg_read_all_settings",
   "member": "pg_monitor",
   "admin_option": false
  },
  {
   "grp": "pg_read_all_stats",
   "member": "pg_monitor",
   "admin_option": false
  },
  {
   "grp": "pg_stat_scan_tables",
   "member": "pg_monitor",
   "admin_option": false
  },
  {
   "grp": "anon",
   "member": "postgres",
   "admin_option": true
  },
  {
   "grp": "authenticated",
   "member": "postgres",
   "admin_option": true
  },
  {
   "grp": "authenticator",
   "member": "postgres",
   "admin_option": true
  },
  {
   "grp": "pg_create_subscription",
   "member": "postgres",
   "admin_option": true
  },
  {
   "grp": "pg_monitor",
   "member": "postgres",
   "admin_option": true
  },
  {
   "grp": "pg_read_all_data",
   "member": "postgres",
   "admin_option": true
  },
  {
   "grp": "pg_signal_backend",
   "member": "postgres",
   "admin_option": true
  },
  {
   "grp": "service_role",
   "member": "postgres",
   "admin_option": true
  },
  {
   "grp": "supabase_privileged_role",
   "member": "postgres",
   "admin_option": false
  },
  {
   "grp": "pg_monitor",
   "member": "supabase_etl_admin",
   "admin_option": false
  },
  {
   "grp": "pg_read_all_data",
   "member": "supabase_etl_admin",
   "admin_option": false
  },
  {
   "grp": "supabase_privileged_role",
   "member": "supabase_etl_admin",
   "admin_option": false
  },
  {
   "grp": "pg_monitor",
   "member": "supabase_read_only_user",
   "admin_option": false
  },
  {
   "grp": "pg_read_all_data",
   "member": "supabase_read_only_user",
   "admin_option": false
  },
  {
   "grp": "anon",
   "member": "supabase_realtime_admin",
   "admin_option": false
  },
  {
   "grp": "authenticated",
   "member": "supabase_realtime_admin",
   "admin_option": false
  },
  {
   "grp": "service_role",
   "member": "supabase_realtime_admin",
   "admin_option": false
  },
  {
   "grp": "authenticator",
   "member": "supabase_storage_admin",
   "admin_option": false
  }
 ],
 "row_count": 25,
 "truncated": false
}
```

### 05_schema_acl.json

```
{
 "ms": 3,
 "rows": [
  {
   "owner": "pg_database_owner",
   "nspacl": "{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner,postgres=U/pg_database_owner,anon=U/pg_database_owner,authenticated=U/pg_database_owner,service_role=U/pg_database_owner}",
   "nspname": "public"
  },
  {
   "owner": "supabase_admin",
   "nspacl": "{supabase_admin=UC/supabase_admin,anon=U/supabase_admin,authenticated=U/supabase_admin,service_role=U/supabase_admin,supabase_auth_admin=UC/supabase_admin,dashboard_user=UC/supabase_admin,postgres=U/supabase_admin}",
   "nspname": "auth"
  },
  {
   "owner": "supabase_admin",
   "nspacl": "{supabase_admin=UC/supabase_admin,postgres=U*/supabase_admin,anon=U/supabase_admin,authenticated=U/supabase_admin,service_role=U/supabase_admin,supabase_storage_admin=U*C*/supabase_admin,dashboard_user=UC/supabase_admin}",
   "nspname": "storage"
  }
 ],
 "row_count": 3,
 "truncated": false
}
```

### 04_views.json

```
{
 "ms": 16,
 "rows": [
  {
   "oid": "20799",
   "opts": "{security_invoker=true}",
   "owner": "postgres",
   "relkind": "v",
   "relname": "channel_connections_safe"
  },
  {
   "oid": "21520",
   "opts": "{security_invoker=true}",
   "owner": "postgres",
   "relkind": "v",
   "relname": "gmail_accounts_safe"
  },
  {
   "oid": "21535",
   "opts": "{security_invoker=true}",
   "owner": "postgres",
   "relkind": "v",
   "relname": "password_reset_requests_safe"
  },
  {
   "oid": "20367",
   "opts": "{security_invoker=true}",
   "owner": "postgres",
   "relkind": "v",
   "relname": "profiles_public"
  },
  {
   "oid": "59785",
   "opts": "{security_invoker=true}",
   "owner": "postgres",
   "relkind": "v",
   "relname": "talkx_campaign_metrics"
  },
  {
   "oid": "20795",
   "opts": "{security_invoker=true}",
   "owner": "postgres",
   "relkind": "v",
   "relname": "whatsapp_connections_agent"
  },
  {
   "oid": "20383",
   "opts": "{security_invoker=true}",
   "owner": "postgres",
   "relkind": "v",
   "relname": "whatsapp_connections_public"
  },
  {
   "oid": "21494",
   "opts": "{security_invoker=true}",
   "owner": "postgres",
   "relkind": "v",
   "relname": "whatsapp_connections_safe"
  }
 ],
 "row_count": 8,
 "truncated": false
}
```

### 07_view_acl.json

```
{
 "ms": 8,
 "rows": [
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "relname": "channel_connections_safe"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "relname": "gmail_accounts_safe"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "relname": "password_reset_requests_safe"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "relname": "profiles_public"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "relname": "talkx_campaign_metrics"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "relname": "whatsapp_connections_agent"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "relname": "whatsapp_connections_public"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "relname": "whatsapp_connections_safe"
  }
 ],
 "row_count": 8,
 "truncated": false
}
```

### 20_prod_viewdefs.txt

```
===== channel_connections_safe =====
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
===== gmail_accounts_safe =====
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
===== password_reset_requests_safe =====
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
===== profiles_public =====
 SELECT id,
    user_id,
    name,
    avatar_url,
    is_active,
    department,
    job_title
   FROM profiles;
===== talkx_campaign_metrics =====
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
===== whatsapp_connections_agent =====
 SELECT id,
    name,
    status,
    phone_number,
    is_default
   FROM whatsapp_connections;
===== whatsapp_connections_public =====
 SELECT id,
    name,
    status,
    is_default
   FROM whatsapp_connections;
===== whatsapp_connections_safe =====
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
    updated_at
   FROM whatsapp_connections;
```

### 21_base_rls.txt

```
{
 "ms": 1,
 "rows": [
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "rls": true,
   "frls": false,
   "owner": "postgres",
   "relkind": "r",
   "relname": "channel_connections"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "rls": true,
   "frls": false,
   "owner": "postgres",
   "relkind": "r",
   "relname": "gmail_accounts"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "rls": true,
   "frls": false,
   "owner": "postgres",
   "relkind": "r",
   "relname": "password_reset_requests"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=rm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "rls": true,
   "frls": false,
   "owner": "postgres",
   "relkind": "r",
   "relname": "profiles"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "rls": true,
   "frls": false,
   "owner": "postgres",
   "relkind": "r",
   "relname": "talkx_campaigns"
  },
  {
   "acl": "{postgres=arwdDxtm/postgres,anon=rm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}",
   "rls": true,
   "frls": false,
   "owner": "postgres",
   "relkind": "r",
   "relname": "whatsapp_connections"
  }
 ],
 "row_count": 6,
 "truncated": false
}
```

### 22_policies.txt

```
{
 "ms": 6,
 "rows": [
  {
   "cmd": "ALL",
   "roles": "{authenticated}",
   "tablename": "channel_connections",
   "policyname": "Admins full access to channels",
   "using_expr": "has_role(auth.uid(), 'admin'::app_role)"
  },
  {
   "cmd": "DELETE",
   "roles": "{authenticated}",
   "tablename": "gmail_accounts",
   "policyname": "Block authenticated gmail deletes",
   "using_expr": "false"
  },
  {
   "cmd": "INSERT",
   "roles": "{authenticated}",
   "tablename": "gmail_accounts",
   "policyname": "Block authenticated gmail inserts",
   "using_expr": null
  },
  {
   "cmd": "UPDATE",
   "roles": "{authenticated}",
   "tablename": "gmail_accounts",
   "policyname": "Block authenticated gmail updates",
   "using_expr": "false"
  },
  {
   "cmd": "SELECT",
   "roles": "{authenticated}",
   "tablename": "gmail_accounts",
   "policyname": "Users can view their own gmail accounts",
   "using_expr": "(user_id = auth.uid())"
  },
  {
   "cmd": "DELETE",
   "roles": "{authenticated}",
   "tablename": "password_reset_requests",
   "policyname": "Admins can delete password reset requests",
   "using_expr": "has_role(auth.uid(), 'admin'::app_role)"
  },
  {
   "cmd": "UPDATE",
   "roles": "{authenticated}",
   "tablename": "password_reset_requests",
   "policyname": "Admins can update reset requests without token access",
   "using_expr": "has_role(auth.uid(), 'admin'::app_role)"
  },
  {
   "cmd": "SELECT",
   "roles": "{authenticated}",
   "tablename": "password_reset_requests",
   "policyname": "Admins can view reset requests",
   "using_expr": "has_role(auth.uid(), 'admin'::app_role)"
  },
  {
   "cmd": "INSERT",
   "roles": "{authenticated}",
   "tablename": "password_reset_requests",
   "policyname": "Users can request own password reset",
   "using_expr": null
  },
  {
   "cmd": "SELECT",
   "roles": "{authenticated}",
   "tablename": "profiles",
   "policyname": "Admin supervisor can view all profiles",
   "using_expr": "is_admin_or_supervisor(auth.uid())"
  },
  {
   "cmd": "UPDATE",
   "roles": "{authenticated}",
   "tablename": "profiles",
   "policyname": "Admins can update any profile",
   "using_expr": "is_admin_or_supervisor(auth.uid())"
  },
  {
   "cmd": "UPDATE",
   "roles": "{authenticated}",
   "tablename": "profiles",
   "policyname": "Block sensitive field changes by non-admins",
   "using_expr": null
  },
  {
   "cmd": "INSERT",
   "roles": "{authenticated}",
   "tablename": "profiles",
   "policyname": "Users can insert their own profile safely",
   "using_expr": null
  },
  {
   "cmd": "UPDATE",
   "roles": "{authenticated}",
   "tablename": "profiles",
   "policyname": "Users can update own profile",
   "using_expr": "(auth.uid() = user_id)"
  },
  {
   "cmd": "SELECT",
   "roles": "{authenticated}",
   "tablename": "profiles",
   "policyname": "Users can view own profile",
   "using_expr": "(user_id = auth.uid())"
  },
  {
   "cmd": "SELECT",
   "roles": "{authenticated}",
   "tablename": "talkx_campaigns",
   "policyname": "Admins can view all campaigns",
   "using_expr": "is_admin_or_supervisor(auth.uid())"
  },
  {
   "cmd": "INSERT",
   "roles": "{authenticated}",
   "tablename": "talkx_campaigns",
   "policyname": "Users can create campaigns",
   "using_expr": null
  },
  {
   "cmd": "DELETE",
   "roles": "{authenticated}",
   "tablename": "talkx_campaigns",
   "policyname": "Users can delete own draft campaigns",
   "using_expr": "((created_by = ( SELECT profiles.id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())\n LIMIT 1)) AND (status = 'draft'::text))"
  },
  {
   "cmd": "UPDATE",
   "roles": "{authenticated}",
   "tablename": "talkx_campaigns",
   "policyname": "Users can update own campaigns",
   "using_expr": "(created_by = ( SELECT profiles.id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())\n LIMIT 1))"
  },
  {
   "cmd": "SELECT",
   "roles": "{authenticated}",
   "tablename": "talkx_campaigns",
   "policyname": "Users can view own campaigns",
   "using_expr": "(created_by = ( SELECT profiles.id\n   FROM profiles\n  WHERE (profiles.user_id = auth.uid())\n LIMIT 1))"
  },
  {
   "cmd": "SELECT",
   "roles": "{authenticated}",
   "tablename": "whatsapp_connections",
   "policyname": "Admin supervisor view connections",
   "using_expr": "is_admin_or_supervisor(auth.uid())"
  },
  {
   "cmd": "DELETE",
   "roles": "{authenticated}",
   "tablename": "whatsapp_connections",
   "policyname": "Admins can delete connections",
   "using_expr": "is_admin_or_supervisor(auth.uid())"
  },
  {
   "cmd": "INSERT",
   "roles": "{authenticated}",
   "tablename": "whatsapp_connections",
   "policyname": "Admins can insert connections",
   "using_expr": null
  },
  {
   "cmd": "UPDATE",
   "roles": "{authenticated}",
   "tablename": "whatsapp_connections",
   "policyname": "Admins can update connections",
   "using_expr": "is_admin_or_supervisor(auth.uid())"
  }
 ],
 "row_count": 24,
 "truncated": false
}
```

### 23_grant_counts.txt

```
{
 "ms": 52,
 "rows": [
  {
   "grantee": "anon",
   "tabelas": 130
  },
  {
   "grantee": "authenticated",
   "tabelas": 155
  },
  {
   "grantee": "service_role",
   "tabelas": 158
  }
 ],
 "row_count": 3,
 "truncated": false
}
```

### 24_anon_contato.txt

```
{
 "ms": 168,
 "rows": [
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "ai_conversation_tags"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "away_messages"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "campaign_contacts"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "chatbot_executions"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "chatbot_flows"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "contact_custom_fields"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "contact_identity_map"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "contact_purchases"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "conversation_closures"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "conversation_events"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "conversation_memory"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "conversation_sla"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "conversation_snoozes"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "conversation_tasks"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "email_messages"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "favorite_contacts"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "message_reactions"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "message_templates"
  },
  {
   "privs": "SELECT",
   "table_name": "messages"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "pinned_conversations"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "scheduled_messages"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "sicoob_contact_mapping"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "whatsapp_connection_queues"
  },
  {
   "privs": "SELECT",
   "table_name": "whatsapp_connections"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "whatsapp_connections_agent"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "whatsapp_connections_public"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "whatsapp_connections_safe"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "whatsapp_flows"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "whatsapp_groups"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "whatsapp_templates"
  },
  {
   "privs": "DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE",
   "table_name": "whisper_messages"
  }
 ],
 "row_count": 31,
 "truncated": false
}
```

### 25_anon_select_rls.txt

```
{
 "ms": 47,
 "rows": [
  {
   "n": 8,
   "rls": false
  },
  {
   "n": 121,
   "rls": true
  }
 ],
 "row_count": 2,
 "truncated": false
}
```

### 26_anon_sem_rls.txt

```
{
 "ms": 11,
 "rows": [],
 "row_count": 0,
 "truncated": false
}
```

### 27_policies_anon.txt

```
{
 "ms": 71,
 "rows": [
  {
   "cmd": "ALL",
   "roles": "{anon}",
   "tablename": "webauthn_challenges",
   "policyname": "Block anon access to webauthn challenges"
  }
 ],
 "row_count": 1,
 "truncated": false
}
```

### 28_policies_by_role.txt

```
{
 "ms": 15,
 "rows": [
  {
   "n": 421,
   "roles": "{authenticated}"
  },
  {
   "n": 4,
   "roles": "{service_role}"
  },
  {
   "n": 1,
   "roles": "{anon}"
  }
 ],
 "row_count": 3,
 "truncated": false
}
```

### 31_fns_anon_execute.txt

```
{
 "ms": 6,
 "rows": [],
 "row_count": 0,
 "truncated": false
}
```

### 32_public_x_precise.txt

```
{
 "ms": 5,
 "rows": [
  {
   "acl": "{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
   "args": "p_value text",
   "proname": "ai_is_canonical_churn_risk"
  },
  {
   "acl": "{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
   "args": "p_value text",
   "proname": "ai_is_canonical_urgency"
  }
 ],
 "row_count": 2,
 "truncated": false
}
```

### 33_ai_fns.txt

```
{
 "ms": 8,
 "rows": [
  {
   "acl": "{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
   "proname": "ai_is_canonical_churn_risk"
  },
  {
   "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
   "proname": "ai_is_canonical_priority"
  },
  {
   "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
   "proname": "ai_is_canonical_sentiment"
  },
  {
   "acl": "{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
   "proname": "ai_is_canonical_urgency"
  },
  {
   "acl": "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}",
   "proname": "ai_text_array"
  }
 ],
 "row_count": 5,
 "truncated": false
}
```

## 2. Experimentos no PostgreSQL 17 descartavel (saida crua)

### 10_default_acl_replicado.txt

```
    grantor     | schema | objtype |                                                                    acl                                                                     
----------------+--------+---------+--------------------------------------------------------------------------------------------------------------------------------------------
 postgres       | public | S       | {authenticated=rwU/postgres,service_role=rwU/postgres}
 postgres       | public | f       | {authenticated=X/postgres,service_role=X/postgres}
 postgres       | public | r       | {authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
 supabase_admin | public | S       | {postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}
 supabase_admin | public | f       | {postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}
 supabase_admin | public | r       | {postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}
(6 rows)
```

### 11_testeA_nova_fn.txt

```
--- A1) criar funcao simples como postgres ---
--- A2) proacl resultante ---
 proname |  owner   | secdef |                                       proacl                                       
---------+----------+--------+------------------------------------------------------------------------------------
 nova_fn | postgres | f      | {=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
(1 row)

--- A3) has_function_privilege ---
      role      | pode_exec 
----------------+-----------
 anon           | t
 authenticated  | t
 service_role   | t
 nobody(PUBLIC) | t
(4 rows)

--- A4) EXECUTAR como anon ---
 anon_resultado 
----------------
              1
(1 row)

--- A5) EXECUTAR como nobody (PUBLIC) ---
 public_resultado 
------------------
                1
(1 row)
```

### 12_testeB_C_D_controle.txt

```
--- B1) SECURITY DEFINER como postgres ---
  proname   | prosecdef |                                       proacl                                       
------------+-----------+------------------------------------------------------------------------------------
 nova_fn_sd | t         | {=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
(1 row)

--- B2) executar nova_fn_sd como anon ---
 r 
---
 1
(1 row)

--- C1) tabela como postgres ---
 relname  |                                           relacl                                            
----------+---------------------------------------------------------------------------------------------
 nova_tab | {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
(1 row)

 anon_pode_select 
------------------
 f
(1 row)

--- C2) SELECT como anon na tabela nova (postgres) ---
psql:<stdin>:13: ERROR:  permission denied for table nova_tab
--- D1) funcao e tabela criadas por supabase_admin ---
 proname  |     owner      |                                                                              proacl                                                                              
----------+----------------+------------------------------------------------------------------------------------------------------------------------------------------------------------------
 admin_fn | supabase_admin | {=X/supabase_admin,postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin,supabase_admin=X/supabase_admin}
(1 row)

  relname  |     owner      |                                                                                      relacl                                                                                       
-----------+----------------+-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 admin_tab | supabase_admin | {postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin,supabase_admin=arwdDxtm/supabase_admin}
(1 row)

--- D2) anon executa admin_fn / le admin_tab ---
 r 
---
 2
(1 row)

 linhas 
--------
      1
(1 row)

--- CTRL) controle negativo: revogado de PUBLIC E de anon ---
                                 proacl                                 
------------------------------------------------------------------------
 {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
(1 row)

psql:<stdin>:30: ERROR:  permission denied for function ctrl_fn
```

### 13_testeE_replace.txt

```
=== E) create or replace numa funcao JA endurecida ===
--- E1) proacl apos endurecer ---
                    proacl                     
-----------------------------------------------
 {postgres=X/postgres,service_role=X/postgres}
(1 row)

--- E2) CREATE OR REPLACE identico (migration futura reescreve o corpo) ---
  oid  |                    proacl                     
-------+-----------------------------------------------
 16412 | {postgres=X/postgres,service_role=X/postgres}
(1 row)

--- E3) anon tenta executar apos o replace ---
psql:<stdin>:11: ERROR:  permission denied for function audit_fn
--- E4) DROP + CREATE (mesmo nome, objeto NOVO) ---
  oid  |                                       proacl                                       
-------+------------------------------------------------------------------------------------
 16413 | {=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
(1 row)

psql:<stdin>:16: ERROR:  trigger functions can only be called as triggers
CONTEXT:  compilation of PL/pgSQL function "audit_fn" near line 1
--- E5) CREATE OR REPLACE com assinatura diferente (vira overload NOVO) ---
psql:<stdin>:18: ERROR:  trigger functions cannot have declared arguments
HINT:  The arguments of the trigger can be accessed through TG_NARGS and TG_ARGV instead.
CONTEXT:  compilation of PL/pgSQL function "audit_fn" near line 1
  oid  |                                       proacl                                       
-------+------------------------------------------------------------------------------------
 16413 | {=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
(1 row)
```

### 14_testeE5_overload.txt

```
=== E5b) overload: mesma assinatura x assinatura nova (funcao normal) ===
  oid  |                                 proacl                                 
-------+------------------------------------------------------------------------
 16415 | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
(1 row)

--- replace MESMA assinatura ---
  oid  |                                 proacl                                 
-------+------------------------------------------------------------------------
 16415 | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
(1 row)

--- replace com assinatura DIFERENTE (overload novo) ---
  oid  |      assinatura      |                                       proacl                                       
-------+----------------------+------------------------------------------------------------------------------------
 16415 | a integer            | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
 16416 | a integer, b integer | {=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
(2 rows)

--- anon executa overload novo rep_fn(1) ---
psql:<stdin>:12: ERROR:  function public.rep_fn(integer) is not unique
LINE 1: SELECT public.rep_fn(1) AS r;
               ^
HINT:  Could not choose a best candidate function. You might need to add explicit type casts.
```

### 17_overload_anon.txt

```
 r 
---
 3
(1 row)
```

### 15_teste_views_anon.txt

```
=== V1) ANON lendo as views (security_invoker=true) ===
-- anon: whatsapp_connections_public
 id | name | status | is_default 
----+------+--------+------------
(0 rows)

-- anon: whatsapp_connections_agent
 id | name | status | phone_number | is_default 
----+------+--------+--------------+------------
(0 rows)

-- anon: whatsapp_connections_safe
 id | name | phone_number | status | is_default | qr_code | instance_id 
----+------+--------------+--------+------------+---------+-------------
(0 rows)

-- anon: tabela base direto
 id | name | phone_number | status | is_default | qr_code | instance_id | created_by 
----+------+--------------+--------+------------+---------+-------------+------------
(0 rows)

=== V2) ANON lendo a view SEM security_invoker (contrafactual) ===
 id |   name    |  status   
----+-----------+-----------
  1 | Comercial | connected
  2 | Suporte   | connected
(2 rows)

=== V3) AUTHENTICATED SEM VINCULO (nao-admin) lendo as views ===
              set_config              
--------------------------------------
 e22b14b6-09fb-401b-a477-59b94550b7a6
(1 row)

-- authenticated nao-admin: public
 id | name | status | is_default 
----+------+--------+------------
(0 rows)

-- authenticated nao-admin: agent (phone_number)
 id | name | status | phone_number | is_default 
----+------+--------+--------------+------------
(0 rows)

-- authenticated nao-admin: safe (qr_code deve vir NULL)
 id | name | phone_number | status | is_default | qr_code | instance_id 
----+------+--------------+--------+------------+---------+-------------
(0 rows)
```

### 16_teste_gmail_view.txt

```
=== G1) anon via gmail_accounts_safe ===
 id | user_id | email_address | is_active 
----+---------+---------------+-----------
(0 rows)

=== G2) authenticated DONO (uid=alice) via view ===
 setado 
--------
 t
(1 row)

 id |               user_id                |   email_address   | is_active 
----+--------------------------------------+-------------------+-----------
  1 | 11111111-1111-1111-1111-111111111111 | alice@empresa.com | t
(1 row)

=== G3) authenticated OUTRO usuario (uid=bob) via view ===
 setado 
--------
 t
(1 row)

 id |               user_id                |  email_address  | is_active 
----+--------------------------------------+-----------------+-----------
  2 | 22222222-2222-2222-2222-222222222222 | bob@empresa.com | t
(1 row)
```

