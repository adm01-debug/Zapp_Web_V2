# Drift: types.ts × Schema de produção (2026-10-22)

## Resumo

| Fonte | Contagem |
|-------|----------|
| Tabelas em produção (`pg_tables`, schema `public`) | 173 |
| Row types em `src/integrations/supabase/types.ts` | 183 |
| **Diferença** | **+10** |

## Análise do drift

### tipos em types.ts que NÃO existem como tabelas em produção (13)

Verificado: todos os 13 existem como **VIEWS** em `pg_views` — drift esperado e correto.

| Nome | Tipo real | Observação |
|------|-----------|------------|
| catalog_send_stats | VIEW | Estatísticas de envio do catálogo |
| channel_connections_safe | VIEW | View sem campos sensíveis (token, key) |
| gmail_accounts_safe | VIEW | View sem tokens Gmail |
| password_reset_requests_safe | VIEW | View sem dados sensíveis |
| profiles_public | VIEW | Perfil público (sem campos privados) |
| searchbox_usage_daily | VIEW | Agrega uso diário do searchbox |
| talkx_campaign_metrics | VIEW | Métricas de campanhas TalkX |
| talkx_campaign_optouts | VIEW | Optouts de campanhas TalkX |
| talkx_engine_health | VIEW | Saúde do motor TalkX |
| team_message_read_state | VIEW | Estado de leitura de mensagens de equipe |
| whatsapp_connections_agent | VIEW | Conexões para agentes (sem credenciais) |
| whatsapp_connections_public | VIEW | Conexões públicas |
| whatsapp_connections_safe | VIEW | Conexões sem campos sensíveis |

### Tabelas em produção que NÃO têm Row type em types.ts (3)

| Nome | Observação |
|------|-----------|
| `_zapp_fn_before` | Tabela de suporte interno a migrations (prefixo `_` = interno) |
| `_zapp_mig133_log` | Log de migration específica (prefixo `_` = interno) |
| `app_settings` | Configurações de app — ausência no types.ts é drift real; tabela existe em produção |

**Achado:** `app_settings` é tabela real com RLS ativado (policy SELECT USING(true) para authenticated) mas sem Row type em types.ts. Baixa severidade — não é acessada diretamente pelo front via SDK typed.

## Drift de RPCs: front × banco

### RPCs chamadas pelo front via `.rpc()` que NÃO existem em `pg_proc`:

Cruzamento feito manualmente entre lista de `.rpc(` no código-fonte e `pg_proc.proname`:

| RPC chamada no front | Existe no banco? | Observação |
|---------------------|-----------------|------------|
| `log_search_event` | **NÃO** antes de PR #2186 | Achado S2-01 — migration `20261026120300` em PR #2186 |
| `app_bootstrap` | Sim | `app_bootstrap` existe |
| `admin_list_cron_jobs` | Sim | existe |
| `admin_toggle_cron_job` | Sim | existe |
| `inbox_unread_total` | Sim | existe |
| `search_contacts` | Sim | existe |
| `get_inbox_contact_summaries` | Sim | existe |
| `delivery_stats` | Sim | existe |

**Achado confirmado:** `log_search_event` é o único RPC ausente no banco (S2-01), já coberto pela migration em PR #2186.

## Drift de Edge Functions: repo × típico deploy

| Situação | Quantidade |
|---------|-----------|
| Funções no repo (`supabase/functions/`) | 84 (excluindo `_shared` e `deno.json`) |
| Crons que chamam edge functions | 5 (gmail-cron-sync, connection-health-check, batch-fetch-avatars, searchbox-budget-alert) |

Não foi possível listar quais edge functions estão atualmente deployed via MCP (requer REST API ou CLI). 
**NÃO VERIFICADO:** lista exata de funções deployed vs repo. Ver PENDENCIAS.md.

## Drift de tabelas .from() no front vs produção

O código-fonte chama `.from()` com estes nomes que **não são tabelas** em produção (são buckets de storage ou typos):
- `audio-memes` (bucket de storage, não tabela)
- `audio-messages` (bucket de storage)
- `avatars` (bucket de storage)
- `custom-emojis` (bucket de storage)

Não há tabelas acessadas via `.from()` que sejam completamente ausentes em produção (exceto `log_search_event` via `.rpc()`).
