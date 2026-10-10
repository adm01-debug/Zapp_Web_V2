# Auditoria de Migração de Banco de Dados — ZAPP WEB V2

**Data:** 27/08/2026
**Origem:** `vpkmqeumtxhrwgawxdrl.supabase.co`
**Destino:** `tnnnlkbymytvtqngbbqh.supabase.co`
**Repositório:** `adm01-debug/zapp-web-v2` (branch `main`, tree `1b2ec4e2`)
**Método:** comparação por hash MD5 objeto a objeto, mesma query executada nos dois bancos
**Escopo:** schema, tabelas, colunas, constraints, índices, RLS/policies, funções, triggers, views, enums, extensões, privilégios, jobs, migrations, storage, realtime e acoplamento com o código

> **Nenhum objeto foi alterado, criado ou removido em nenhum dos dois bancos durante esta auditoria.**
> Todas as consultas no destino foram leitura. O MCP da origem é read-only por guardrail.

---

## 1. Veredito

**Zero perda estrutural.** O destino é **superconjunto estrito** da origem.

Toda divergência numérica encontrada tem causa raiz identificada e nenhuma representa perda
de objeto migrado. A origem é que está degradada: a tabela `contacts` foi dropada com `CASCADE`
em 26/08/2026 durante um teste de segurança, levando junto 34 FKs, 30 policies, 16 índices e
5 triggers. O destino preservou todos esses objetos.

---

## 2. Placar comparativo

Contagens obtidas com a **mesma query** nos dois bancos (não com ferramentas distintas).

| Objeto | Origem | Destino | Δ | Causa raiz do Δ |
|---|---:|---:|---:|---|
| Tabelas (`relkind='r'`) | 122 | 123 | +1 | `contacts` existe só no destino |
| Colunas | 1.280 | 1.306 | +26 | 26 colunas de `contacts` |
| Constraints | 324 | 365 | +41 | 34 FK→`contacts` + 7 da própria `contacts` |
| Índices | 288 | 304 | +16 | 16 índices de `contacts` |
| Policies RLS | 335 | 365 | +30 | 4 de `contacts` + 26 que referenciam `contacts` |
| Triggers (`public`) | 65 | 70 | +5 | 5 triggers de `contacts` |
| Triggers (`auth.users`) | **0** | **2** | +2 | **origem perdeu `on_auth_user_created*`** |
| Views | 7 | 7 | 0 | hashes de definição idênticos |
| Enums | 4 | 4 | 0 | labels e ordem idênticos |
| Sequences | 0 | 0 | 0 | — |
| Extensões | 8 | 8 | 0 | apenas `pg_net` 0.20.0 → 0.20.4 |
| Funções (`public`) | 64 | 66 | +2 | `mcp_exec`, `mcp_exec_many` (infra MCP) |
| Grants em tabelas (roles de app) | 3.612 | 3.612 | 0 | **hash idêntico** |
| Cron jobs | 1 | 1 | 0 | idêntico |
| Storage buckets | 7 | 7 | 0 | destino tem MIME allowlist a mais |
| Storage policies | 23 | 29 | +6 | destino cobre `audio-messages` e `whatsapp-media` |
| Tabelas em `supabase_realtime` | 3 | 11 | +8 | destino publica mais tabelas |
| `auth.users` | 3 | 3 | 0 | **mesmos UUIDs** |
| Migrations registradas | 10 | 259 | +249 | origem teve histórico truncado |
| Versão PostgreSQL | 17.6 | 17.6 | 0 | — |
| Schemas | 11 | 11 | 0 | listas idênticas |

Schemas presentes nos dois: `auth, cron, extensions, graphql, graphql_public, net, public,
realtime, storage, supabase_migrations, vault`.

---

## 3. Metodologia de validação

Não bastou comparar contagens — contagens iguais podem esconder objetos trocados. A validação
foi feita por **assinatura MD5 por objeto**, depois diffada com `FULL OUTER JOIN` / script Node.

### 3.1 Colunas
Assinatura por tabela: `md5(agg(column_name|data_type|is_nullable|column_default))`.

Resultado: **128 relações com hash byte a byte idêntico**. Única entrada divergente: `contacts`
(`SO_NO_DESTINO`). **Zero coluna perdida, zero tipo alterado, zero default divergente.**

### 3.2 Índices
Assinatura: `md5(agg(indexname~indexdef))` por tabela → **0 divergentes**, 1 extra (`contacts`).

### 3.3 Triggers
Assinatura: `md5(agg(tgname~pg_get_triggerdef))` por tabela → **0 divergentes**, 1 extra (`contacts`).

### 3.4 Constraints
Primeira passada: **34 tabelas divergentes**. Investigação apontou exatamente 34 FKs apontando
para `public.contacts`. Recalculando o hash no destino com o filtro
`confrelid <> 'public.contacts'::regclass`, **as 34 voltaram a bater**.

Aritmética de fechamento: `365 − 34 (FK→contacts) − 7 (constraints de contacts) = 324` = origem. ✅

### 3.5 Policies RLS
Primeira passada: 10 divergentes + 3 só no destino. Recalculando o hash no destino excluindo
policies cujo `qual`/`with_check` mencionam `contacts`, **todas passam a bater**.
`contact_tags` e `contact_custom_fields` ficam sem policy nenhuma na origem porque 100% das
suas policies referenciavam `contacts`.

Aritmética de fechamento: `365 − 4 (policies de contacts) − 26 (que citam contacts) = 335` = origem. ✅

### 3.6 Privilégios
Hash de `information_schema.role_table_grants` no schema `public`:

- Origem bruta: 3.870 grants; destino bruto: 3.640.
- A origem tem um role extra, `sandbox_exec`, com INSERT+SELECT em 129 relações = **258 grants**.
- Excluindo `sandbox_exec` da origem e `contacts` do destino:
  **ambos 3.612 grants, hash `e9be37d091f53417249c700f3e3d490c` idêntico.**

`sandbox_exec` é infraestrutura do gateway MCP de auditoria da origem, não da aplicação.
`3.612 = 129 relações × 7 privilégios × 4 roles (anon, authenticated, postgres, service_role)`.

### 3.7 Funções, views, enums, extensões
- **Funções:** as 64 da origem existem no destino com `md5(pg_get_functiondef)`, `prosecdef` e
  `proconfig` idênticos. As 2 extras do destino são `mcp_exec` e `mcp_exec_many`.
- **Views:** 7 × 7, todos os hashes de definição idênticos, inclusive `reloptions`.
- **Enums:** 4 × 4, labels idênticos e na mesma `enumsortorder`.
- **Extensões:** mesmos 8 nomes, mesmos schemas de instalação. Só `pg_net` está mais novo no destino.

---

## 4. Achados

### A-01 · A origem está degradada, não o destino — **Informativo**
`contacts` foi dropada com `CASCADE` na origem em 26/08/2026 (registrado no próprio manifesto
do gateway de auditoria como *"contacts dropped during security test"*). Efeito colateral:
34 FKs, 30 policies, 16 índices e 5 triggers destruídos na origem.
O destino manteve tudo intacto. **Não há ação a tomar no destino.**

### A-02 · Origem sem triggers em `auth.users` — **Informativo**
`on_auth_user_created` (→ `handle_new_user()`) e `on_auth_user_created_role`
(→ `handle_new_user_role()`) existem **apenas no destino**.

Consequência prática na origem: usuário novo não ganha `profile` nem `user_role`. Confirma-se
nos dados — origem tem 2 profiles para 3 `auth.users`; destino tem 3 para 3.
**O destino está correto.**

### A-03 · Dados não são cópia linha-a-linha — **Alto (documentar)**
Os 3 `auth.users` compartilham os **mesmos UUIDs** nos dois bancos. Mas **nenhuma** linha do
schema `public` compartilha ID:

| Tabela | Origem | Destino | IDs em comum |
|---|---:|---:|---:|
| `profiles` | 2 | 3 | 0 / 2 |
| `user_roles` | 2 | 3 | 0 / 2 |
| `agent_stats` | 2 | 3 | 0 / 2 |
| `audit_logs` | 2 | 3 | 0 / 2 |
| `messages` | 7 | 72 | 0 / 7 |
| `link_preview_cache_metrics` | 51 | 51 | 0 / 51 |

O destino foi **populado de forma independente**, não por replicação. E está mais completo:
`contacts` 23, `messages` 72, `permissions` 21, `role_permissions` 42, `global_settings` 5,
`sales_pipeline_stages` 5, `rate_limit_configs` 5, `sla_configurations` 3, `ai_providers` 1,
`whatsapp_connections` 1, `auto_close_config` 1, `geo_blocking_settings` 1 — todos **zerados na origem**.

As 7 `messages` da origem apontam para contatos sintéticos (`c1111111-…`, `c2222222-…`,
`c3333333-…`, `c4444444-…`, `c5555555-…`) — fixture de teste, não dado de negócio.
No destino: **0 mensagens órfãs**, todas as 72 ligadas aos 23 contatos reais.

`link_preview_cache_metrics` tem 51 linhas nos dois com a mesma janela temporal
(20/06/2026 → 27/08/2026) e UUIDs diferentes: é telemetria rolante do cron, gerada
independentemente em cada banco. Não é dado migrável.

**Conclusão:** a única coisa que existe na origem e não no destino são as 7 mensagens de
fixture. Nenhum dado de negócio foi perdido.

### A-04 · `mcp_exec` / `mcp_exec_many` — **Médio (mitigado)**
Duas funções `SECURITY DEFINER` com `search_path = pg_catalog, public` que executam SQL
arbitrário. Existem só no destino (infra do gateway MCP).

Estado atual do ACL — **já corrigido** pela migration `20260827000100`:
```
mcp_exec       → postgres=X/postgres service_role=X/postgres
mcp_exec_many  → postgres=X/postgres service_role=X/postgres
```
`authenticated`, `anon` e `PUBLIC` já foram revogados. Risco residual: qualquer portador da
`service_role key` tem SQL arbitrário. Aceitável, mas exige rotação disciplinada da chave.

### A-05 · Drift de migrations entre repo e destino — **Alto**
Repo tem **267** arquivos; destino tem **259** registros.

**11 no repo, sem registro no destino:**

*Grupo 1 — DDL aplicado, registro ausente (4):*

> ⚠️ **CORREÇÃO (27/08/2026):** esta classificação estava ERRADA. Foi baseada só em
> `to_regclass()` ("a tabela existe"). Comparação objeto-a-objeto (policies, triggers,
> colunas, constraints) provou que a DDL DESTES arquivos nunca rodou no destino — as
> tabelas foram criadas por OUTRAS migrations já registradas, com formato diferente
> (ex.: `entity_versions.created_at` vs `changed_at` do arquivo; gmail com `*_encrypted
> bytea` vs texto puro do arquivo). Registrá-los gravaria afirmação falsa no ledger e um
> `db push` reintroduziria schema menos seguro. Os 4 foram movidos para
> `supabase/migrations/_superseded/` (ver README de lá). **NÃO registrar. Ver passos 3-6.**
| Arquivo | Objetos que cria | Existe no destino? |
|---|---|---|
| `20241231000000_saved_filters.sql` | `saved_filters` | ✅ sim |
| `20241231000001_entity_versions.sql` | `entity_versions` | ✅ sim |
| `20260403024714_gmail_integration.sql` | `gmail_accounts`, `email_threads` | ✅ sim |
| `20260412230000_fix_rls_policies_security.sql` | policies de `entity_versions` etc. | ✅ sim |

Efeito é cosmético hoje, mas quebra qualquer `supabase db reset` ou provisionamento novo.

*Grupo 2 — migrations de OUTRO banco no repo errado (7):*
`20260611120000`, `20260612110000`, `20260612120000`, `20260612140000`, `20260612141500`,
`20260612150000`, `20260612160000`.

Verificado por `to_regclass`: os objetos que elas manipulam **não existem no destino**:
`outbound_message_queue` → `NULL`, `empresas` → `NULL`, `evolution_messages_wpp2` → `NULL`,
`evolution_webhook_events` → `NULL`, função `admin_criar_usuario_painel` → `0 ocorrências`.
São migrations do Supabase self-hosted / Evolution, commitadas no repo errado.
**Se alguém rodar `supabase db push`, elas falham.**

**3 no destino, sem arquivo no repo:**
| Version | Nome | O que fez |
|---|---|---|
| `20260826210100` | `cron_cleanup_link_preview_cache` | agenda o cron job diário 03:00 |
| `20260826210200` | `realtime_publication_d5` | publica 5 tabelas no realtime + `REPLICA IDENTITY FULL` |
| `20260827000100` | `security_revoke_mcp_exec_from_authenticated` | revoga `mcp_exec*` de anon/authenticated |

Foram aplicadas direto no banco (workaround do `supabase_apply_migration` bugado). O DDL
existe só no banco, não no Git.

### A-06 · Objetos implementados sem código ligado — **Médio**

Análise feita sobre **1.270 arquivos** de `src/` + `supabase/functions/` e **267** migrations.

**Tabelas com zero referência no código de aplicação (5 de 123):**
`audio_meme_favorites`, `crisis_room_alerts`, `link_preview_cache_metrics`,
`voice_command_logs`, `webhook_rate_limits`

*(`link_preview_cache_metrics` é alimentada pelo cron — o zero é esperado e correto.)*

**Tabelas citadas mas sem nenhum `.from()` (2):** `login_attempts`, `mfa_sessions`
— existem tipos/constantes mas nenhuma leitura ou escrita.

**Tabelas com apenas 1 `.from()` — acoplamento frágil (10):**
`allowed_countries`, `blocked_countries`, `campaign_contacts`, `chatbot_executions`,
`deal_activities`, `entity_versions`, `followup_executions`, `followup_steps`,
`queue_positions`, `sales_pipeline_stages`

**Funções órfãs reais (17)** — sem `.rpc()` no app, sem trigger, sem policy, sem cron,
sem view e sem chamada de outra função:

| Função | Retorno | Observação |
|---|---|---|
| `decrypt_gmail_token` | `text` | par de cripto Gmail nunca chamado |
| `encrypt_gmail_token` | `bytea` | idem |
| `fn_list_audio_meme_categories` | `TABLE(category, total)` | feature de memes incompleta |
| `get_channel_credentials_safe` | `jsonb` | wrapper seguro não adotado |
| `get_connection_instance` | `text` | |
| `get_connection_qr_code` | `text` | QR lido direto da tabela, sem a RPC |
| `get_own_lockout_status` | `TABLE(attempt_count, locked_until)` | bloco de lockout desconectado |
| `get_own_reset_requests` | `SETOF password_reset_requests` | |
| `get_profile_role_for_check` | `TABLE(role, access_level, permissions)` | |
| `get_reset_requests_safe` | `TABLE(14 colunas)` | |
| `is_country_allowed` | `boolean` | bloco geo desconectado |
| `is_country_blocked` | `boolean` | idem |
| `is_ip_blocked` | `boolean` | idem |
| `is_ip_whitelisted` | `boolean` | idem |
| **`mask_channel_credentials`** | **`trigger`** | **trigger function não anexada a nenhuma trigger** |
| `mcp_exec_many` | `jsonb` | infra MCP |
| `validate_reset_token` | `uuid` | |

Destaque: o **bloco inteiro de geo/IP blocking** está construído no banco e desconectado da
aplicação — funções `is_ip_blocked`, `is_ip_whitelisted`, `is_country_allowed`,
`is_country_blocked` mais as tabelas `blocked_ips`, `ip_whitelist`, `allowed_countries`,
`blocked_countries`, `geo_blocking_settings`. Há UI para gerenciar as listas, mas nada
consulta essas funções no caminho de autenticação.

Destaque 2: `mask_channel_credentials` retorna `trigger` mas não está anexada a nenhuma
tabela — proteção de credenciais escrita e nunca ativada.

**Funções com uso legítimo não-app (confirmadas ativas, 22):**
18 via trigger, 3 via policy (`get_profile_id_for_user`, `is_contact_visible_to_user`,
`is_team_conversation_member`), 1 via cron (`cleanup_link_preview_cache`),
mais `calculate_level`, `get_channel_credentials`, `handle_new_user`, `mcp_exec`
chamadas por outras funções.

### A-07 · Edge functions sem referência no repositório — **Médio**
62 diretórios em `supabase/functions/` (fora `_shared`). Cruzando com `functions.invoke(...)`
e chamadas por URL `functions/v1/...`: **49 referenciadas, 14 sem qualquer referência.**

`analyze-external-db`, `auto-close-conversations`, `cleanup-rate-limit-logs`,
`elevenlabs-agent-token`, `elevenlabs-webhook`, `evolution-health`, `external-db-bridge`,
`gmail-send`, `gmail-sync`, `recover-corrupted-audios`, `send-rate-limit-alert`,
`talkx-scheduler`, `voice-copilot-action`, `whatsapp-webhook`

Parte é legítima (webhooks e crons são chamados de fora: `whatsapp-webhook`,
`elevenlabs-webhook`, `auto-close-conversations`, `cleanup-rate-limit-logs`,
`talkx-scheduler`). Mas `gmail-send` e `gmail-sync` sem invocação, combinados com
`encrypt_gmail_token`/`decrypt_gmail_token` órfãs, indicam que **a integração Gmail
está com o banco pronto e o fluxo desligado**.

### A-08 · 108 colunas de FK sem índice — **Alto (performance)**
FKs de coluna única sem índice de suporte. Caminhos quentes afetados:

`messages.agent_id`, `messages.whatsapp_connection_id`, `messages.channel_connection_id`,
`sales_deals.contact_id`, `sales_deals.stage_id`, `sales_deals.assigned_to`,
`queue_positions.contact_id`, `queue_positions.queue_id`, `contact_tags.tag_id`,
`role_permissions.permission_id`, `queue_members.profile_id`, `team_messages.sender_id`,
`team_messages.reply_to_id`, `conversation_sla.contact_id`, `csat_surveys.contact_id`,
`csat_surveys.agent_id`, `contacts.whatsapp_connection_id`, `contacts.channel_connection_id`,
`deal_activities.deal_id`, `payment_links.contact_id`, `scheduled_messages.contact_id`
— e mais 87.

Impacto: `seq scan` em JOIN, e principalmente **lock de tabela inteira em DELETE/UPDATE do lado pai**.

### A-09 · Cobertura de RLS — **Baixo**
Estado geral bom:
- **0** tabelas com RLS desabilitado
- **0** tabelas com RLS habilitado e nenhuma policy
- **0** tabelas sem policy de SELECT
- **1** tabela sem policy de INSERT nem ALL

Distribuição: SELECT 125, INSERT 81, UPDATE 54, ALL 53, DELETE 52.

### A-10 · Inconsistência cosmética em views — **Baixo**
3 views usam `security_invoker=true`, 4 usam `security_invoker=on`. Semanticamente idênticos,
mas dificulta grep e auditoria automatizada. Presente igualmente nos dois bancos.

---

## 5. Diferenças intencionais × perdas reais

| Diferença | Classificação |
|---|---|
| `contacts` + 34 FK + 30 policies + 16 índices + 5 triggers só no destino | **Intencional** — origem que perdeu |
| Triggers em `auth.users` só no destino | **Intencional** — origem que perdeu |
| `mcp_exec` / `mcp_exec_many` só no destino | **Intencional** — infra MCP |
| Role `sandbox_exec` (258 grants) só na origem | **Intencional** — infra do gateway de auditoria |
| `pg_net` 0.20.0 → 0.20.4 | **Intencional** — upgrade |
| 249 migrations a mais no destino | **Intencional** — origem truncou histórico |
| MIME allowlist em `avatars` e `custom-emojis` só no destino | **Intencional** — hardening |
| 6 storage policies a mais no destino | **Intencional** — cobertura maior |
| 8 tabelas a mais no realtime do destino | **Intencional** |
| Dados com UUIDs diferentes | **Intencional** — repopulação, não replicação |
| 7 mensagens de fixture da origem ausentes | **Perda irrelevante** — dado de teste |
| **Perda real de objeto migrado** | **NENHUMA** |

---

## 6. Plano de melhorias e correções — 100 etapas

Ordenado por impacto. Nada abaixo será executado sem autorização explícita.
Nenhuma etapa remove tabela, coluna ou função sem aprovação individual.

### Bloco 1 — Reconciliação de migrations (1–12)

1. Mover as 7 migrations de outro banco (`20260611120000`, `20260612110000`, `20260612120000`, `20260612140000`, `20260612141500`, `20260612150000`, `20260612160000`) para `supabase/migrations/_foreign/` no repo, fora do caminho do `db push`.
2. Abrir issue documentando a qual banco pertencem (Supabase self-hosted / Evolution) e para qual repo devem migrar.
3. ~~Registrar `20241231000000` (saved_filters)~~ — **CANCELADO, NÃO FAZER.** Ver correção em A-05 e `supabase/migrations/_superseded/README.md`. A DDL deste arquivo nunca rodou no destino (a tabela veio de `20260315163251`+`20260315172343`); policies/triggers do arquivo divergem do banco. Registrar = afirmação falsa no ledger. Arquivo movido para `_superseded/`.
4. ~~Registrar `20241231000001` (entity_versions)~~ — **CANCELADO.** Idem. Arquivo usa `changed_at` e policy `USING(true)`; banco tem `created_at` e policies admin-only. Registrar seria mentira + regressão de segurança latente no próximo `db push`.
5. ~~Registrar `20260403024714` (gmail_integration)~~ — **CANCELADO.** Idem. Arquivo tem tokens em texto puro e referencia `email_attachments` (inexistente); banco tem `access_token_encrypted`/`refresh_token_encrypted bytea`. Movido para `_superseded/`.
6. ~~Registrar `20260412230000` (fix_rls_policies_security)~~ — **CANCELADO.** Idem. Patch de RLS para o schema antigo; as policies atuais do destino já são mais estritas. Movido para `_superseded/`.
7. Criar `supabase/migrations/20260826210100_cron_cleanup_link_preview_cache.sql` a partir do `statements` gravado no banco.
8. Criar `supabase/migrations/20260826210200_realtime_publication_d5.sql` idem.
9. Criar `supabase/migrations/20260827000100_security_revoke_mcp_exec_from_authenticated.sql` idem.
10. Rodar `supabase db diff` contra o destino e confirmar diff vazio após 1–9.
11. Adicionar step no CI que falha se `count(schema_migrations)` divergir do número de arquivos em `supabase/migrations/`.
12. Documentar em `docs/` o workaround do `supabase_apply_migration` bugado no self-hosted e o procedimento manual correto.

### Bloco 2 — Índices de FK (13–32)

13. Criar `idx_messages_agent_id` em `messages(agent_id)`.
14. Criar `idx_messages_whatsapp_connection_id` em `messages(whatsapp_connection_id)`.
15. Criar `idx_messages_channel_connection_id` em `messages(channel_connection_id)`.
16. Criar `idx_sales_deals_contact_id` em `sales_deals(contact_id)`.
17. Criar `idx_sales_deals_stage_id` em `sales_deals(stage_id)`.
18. Criar `idx_sales_deals_assigned_to` em `sales_deals(assigned_to)`.
19. Criar `idx_queue_positions_contact_id` e `idx_queue_positions_queue_id`.
20. Criar `idx_contact_tags_tag_id` em `contact_tags(tag_id)`.
21. Criar `idx_role_permissions_permission_id` em `role_permissions(permission_id)`.
22. Criar `idx_queue_members_profile_id` em `queue_members(profile_id)`.
23. Criar `idx_team_messages_sender_id` e `idx_team_messages_reply_to_id`.
24. Criar `idx_conversation_sla_contact_id` e `idx_conversation_sla_sla_configuration_id`.
25. Criar `idx_csat_surveys_contact_id` e `idx_csat_surveys_agent_id`.
26. Criar `idx_contacts_whatsapp_connection_id` e `idx_contacts_channel_connection_id`.
27. Criar `idx_deal_activities_deal_id` e `idx_deal_activities_performed_by`.
28. Criar `idx_payment_links_contact_id` e `idx_payment_links_deal_id`.
29. Criar `idx_scheduled_messages_contact_id` e `idx_scheduled_messages_whatsapp_connection_id`.
30. Criar índices FK do bloco `conversation_events` (`from_agent_id`, `to_agent_id`, `from_queue_id`, `to_queue_id`, `performed_by`).
31. Criar os índices FK restantes (~80) em migration única, todos `CONCURRENTLY`.
32. Rodar query de verificação de FK sem índice e confirmar retorno vazio.

### Bloco 3 — Reconectar o bloco de geo/IP blocking (33–44)

33. Mapear onde no fluxo de login o `is_ip_blocked` deveria ser chamado (edge function ou trigger em `login_attempts`).
34. Decidir arquitetura: checagem no edge (antes do auth) vs. trigger no banco. Documentar em ADR.
35. Implementar chamada de `is_ip_blocked` no ponto de entrada escolhido.
36. Implementar chamada de `is_ip_whitelisted` como bypass da checagem anterior.
37. Implementar `is_country_blocked` no mesmo ponto.
38. Implementar `is_country_allowed` respeitando `geo_blocking_settings.mode` (allowlist vs blocklist).
39. Ligar a UI de `blocked_ips` a operações reais de INSERT/DELETE via `.from()`.
40. Ligar a UI de `ip_whitelist` idem.
41. Ligar a UI de `allowed_countries` e `blocked_countries` idem.
42. Popular `geo_blocking_settings` com a linha de configuração default (hoje 1 linha, validar conteúdo).
43. Escrever teste de integração: IP bloqueado → login negado; IP na whitelist → login permitido.
44. Adicionar métrica/log de bloqueios em `security_alerts`.

### Bloco 4 — Reconectar autenticação e lockout (45–56)

45. Implementar `.from('login_attempts')` na leitura de tentativas na tela de login.
46. Ligar `record_failed_login` ao fluxo de erro de autenticação.
47. Ligar `clear_login_attempts` ao fluxo de sucesso de autenticação.
48. Ligar `is_account_locked` à validação pré-login.
49. Ligar `get_own_lockout_status` à UI que mostra "conta bloqueada até X".
50. Implementar `.from('mfa_sessions')` no fluxo de MFA.
51. Ligar `validate_reset_token` ao fluxo de reset de senha.
52. Ligar `get_own_reset_requests` à tela do usuário.
53. Ligar `get_reset_requests_safe` à tela do admin (hoje provável leitura direta da tabela com token exposto).
54. Auditar se `password_reset_requests.token` está sendo lido pelo frontend em algum ponto; se sim, migrar para a view `password_reset_requests_safe`.
55. Ligar `get_profile_role_for_check` ao guard de rotas.
56. Escrever testes E2E de lockout: 5 falhas → bloqueio; expiração → desbloqueio.

### Bloco 5 — Fechar a integração Gmail (57–66)

57. Auditar se `gmail-sync` está agendada em algum cron externo ou se está morta.
58. Auditar se `gmail-send` é chamada por `gmail-webhook` ou está morta.
59. Ligar `encrypt_gmail_token` ao ponto de gravação do OAuth token em `gmail_accounts`.
60. Ligar `decrypt_gmail_token` ao ponto de leitura do token nas edge functions.
61. Confirmar que nenhum token Gmail está gravado em texto puro hoje.
62. Ligar `get_own_gmail_accounts` à UI de contas conectadas.
63. Implementar `.from()` real em `email_labels` (hoje só policies existem).
64. Validar o fluxo `email_threads` → `email_messages` end-to-end com uma conta de teste.
65. Agendar `gmail-sync` via `pg_cron` ou documentar o agendador externo.
66. Adicionar tratamento de refresh token expirado com alerta em `security_alerts`.

### Bloco 6 — Segurança de credenciais e MCP (67–76)

67. Anexar `mask_channel_credentials` como trigger em `channel_connections` (hoje órfã).
68. Verificar se `channel_connections.credentials` está exposto em algum `.select('*')` do frontend.
69. Migrar todos os consumos de `channel_connections` para a view `channel_connections_safe`.
70. Ligar `get_channel_credentials_safe` no lugar de `get_channel_credentials` onde for chamada por usuário final.
71. Migrar consumos de `whatsapp_connections` para `whatsapp_connections_safe` / `_agent` / `_public` conforme o papel.
72. Ligar `get_connection_qr_code` no lugar de leitura direta da coluna de QR.
73. Ligar `get_connection_instance` onde o instance name é lido direto da tabela.
74. Documentar em `SECURITY.md` que `mcp_exec`/`mcp_exec_many` existem, o que fazem e que estão restritas a `service_role`.
75. Definir política de rotação da `service_role key` do destino e registrar a data da última rotação.
76. Adicionar teste automatizado que falha se `mcp_exec` voltar a ter `EXECUTE` para `authenticated` ou `anon`.

### Bloco 7 — Tabelas sem código ligado (77–86)

77. Decidir destino de `audio_meme_favorites`: implementar UI de favoritos ou marcar como roadmap. Ligar `fn_toggle_user_meme_favorite` se implementar.
78. Ligar `fn_list_audio_meme_categories` à UI de memes (hoje órfã).
79. Decidir destino de `crisis_room_alerts`: existe `warroom_alerts` com uso — avaliar se é duplicação conceitual.
80. Decidir destino de `voice_command_logs`: `voice-copilot-action` existe mas não é invocada. Ligar ou marcar roadmap.
81. Decidir destino de `webhook_rate_limits`: existe `rate_limit_configs` e `rate_limit_logs` em uso — avaliar sobreposição.
82. Implementar leitura de `link_preview_cache_metrics` em um painel de observabilidade (dados existem: 51 execuções do cron).
83. Reforçar `.from()` em `campaign_contacts` (hoje 1 única ocorrência).
84. Reforçar `.from()` em `chatbot_executions` (hoje 1 única ocorrência).
85. Reforçar `.from()` em `followup_executions` e `followup_steps` (1 cada).
86. Reforçar `.from()` em `entity_versions` — o versionamento existe mas quase não é lido.

### Bloco 8 — Edge functions órfãs (87–92)

87. Confirmar agendador externo de `auto-close-conversations`, `cleanup-rate-limit-logs` e `talkx-scheduler`; se não houver, agendar via `pg_cron`.
88. Confirmar que `whatsapp-webhook` e `elevenlabs-webhook` estão registradas nos provedores externos.
89. Ligar `send-rate-limit-alert` a `rate_limit_logs` quando o limite for excedido.
90. Ligar `evolution-health` a `connection_health_logs` em execução periódica.
91. Avaliar remoção de `analyze-external-db`, `external-db-bridge` e `recover-corrupted-audios` (aparentam ser ferramentas pontuais). **Não remover sem aprovação.**
92. Ligar `elevenlabs-agent-token` ao fluxo de `voice-agent`.

### Bloco 9 — Consistência e higiene de schema (93–97)

93. Padronizar `security_invoker` nas 7 views para `true` (4 usam `on`).
94. Adicionar a policy de INSERT faltante na única tabela sem INSERT nem ALL.
95. Adicionar `COMMENT ON TABLE` nas 123 tabelas descrevendo propósito e status (ativo / roadmap).
96. Adicionar `COMMENT ON FUNCTION` nas 17 funções órfãs marcando "sem consumidor em AAAA-MM".
97. Gerar `src/integrations/supabase/types.ts` atualizado e confirmar que reflete as 123 tabelas.

### Bloco 10 — Observabilidade e prevenção de regressão (98–100)

98. Publicar o script de manifesto/diff usado nesta auditoria em `scripts/db-audit/` e agendar execução semanal, com alerta em caso de drift.
99. Adicionar job no CI que compara `supabase/migrations/` com `schema_migrations` do destino e falha em divergência.
100. Criar `docs/DB-INVENTORY.md` com o inventário vivo — tabela, propósito, status de acoplamento, consumidores — e regra de PR exigindo atualização ao criar objeto novo.

---

## 7. Anexo — comandos de verificação

```sql
-- Assinatura de colunas por tabela (rodar nos dois bancos e diffar)
SELECT jsonb_object_agg(table_name, h)::text FROM (
  SELECT table_name,
    md5(string_agg(column_name||'|'||data_type||'|'||is_nullable||'|'||
        coalesce(column_default,'-'), ',' ORDER BY column_name)) AS h
  FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name
) x;

-- Constraints ignorando as FKs para contacts
SELECT c.relname, md5(string_agg(co.conname||'~'||pg_get_constraintdef(co.oid), ',' ORDER BY co.conname))
FROM pg_constraint co
JOIN pg_class c ON c.oid=co.conrelid
JOIN pg_namespace n ON n.oid=co.connamespace
WHERE n.nspname='public' AND c.relname<>'contacts'
  AND coalesce(co.confrelid,0) <> 'public.contacts'::regclass::oid
GROUP BY 1;

-- Grants comparáveis (excluir sandbox_exec na origem, contacts no destino)
SELECT md5(string_agg(grantee||'|'||table_name||'|'||privilege_type, ','
       ORDER BY grantee,table_name,privilege_type))
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee<>'sandbox_exec' AND table_name<>'contacts';
-- esperado nos dois: e9be37d091f53417249c700f3e3d490c

-- FKs de coluna única sem índice de suporte
SELECT c.relname||'.'||a.attname
FROM pg_constraint co
JOIN pg_class c ON c.oid=co.conrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN unnest(co.conkey) k(att) ON true
JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.att
WHERE n.nspname='public' AND co.contype='f' AND array_length(co.conkey,1)=1
  AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indkey[0]=a.attnum)
ORDER BY 1;
```

---

*Auditoria executada em 27/08/2026 via MCP. Origem read-only. Destino: apenas leitura.
Nenhum objeto criado, alterado ou removido.*
