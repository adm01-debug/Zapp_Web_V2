# Relatorio de Auditoria — Supabase Zapp_Web_V2

**Projeto:** tnnnlkbymytvtqngbbqh  
**Data:** 2026-10-30  
**Auditado por:** Claude Code (somente leitura — zero escrita em producao)

---

## Resumo Executivo

O banco de producao do Zapp_Web_V2 (PostgreSQL 17.6, 433 MB, 204 tabelas publicas) apresenta boa postura em varios controles basicos: RLS habilitado em 100% das tabelas, taxa de cache-hit de 99,64%, todas as funcoes SECURITY DEFINER com search_path fixo, e 24 cron jobs ativos em sua maioria funcionando. Entretanto, tres achados criticos exigem atencao imediata: a funcao `mcp_exec` executa SQL arbitrario silenciando excecoes; 63 das 1064 migrations possuem `statements` NULL no ledger, comprometendo a auditabilidade e o replay do schema; e o pool de workers do pg_cron esta saturado, causando falhas em 6,53% dos disparos de `dispatch_scheduled_messages` (686 falhas em 30 dias). Agravando o risco operacional, nenhum dos 10 usuarios ativos possui MFA configurado. A maioria dos achados altos e medios envolve configuracoes incrementais de RLS e cobertura de tipos, corrigiveis sem DDL destrutivo.

---

## Contagem por Severidade

| Severidade | Quantidade |
|---|---|
| CRITICO | 3 |
| ALTO | 7 |
| MEDIO | 14 |
| BAIXO | 13 |
| INFO | 5 |
| **TOTAL** | **42** |

---

## Top 10 Achados (Criticos e Altos)

| ID | Severidade | Categoria | Objeto | Descricao | Evidencia | Impacto | Correcao Proposta | Risco Regressao | Esforco |
|---|---|---|---|---|---|---|---|---|---|
| S03-001 | CRITICO | Seguranca | `public.mcp_exec` | Funcao executa SQL dinamico arbitrario com `EXECUTE`, silencia excecoes via `WHEN OTHERS THEN NULL` e re-executa DML | Confirmado: grants a `postgres` e `service_role`; funcao listada em security_definer_functions | SQL injection interno via MCP; excecoes engolidas mascaram falhas silenciosas | Restringir acesso ao minimo necessario; adicionar logging de erros; rever necessidade em producao | MEDIO — funcao usada pelo fluxo MCP de migracao | 3h |
| S03-004 | CRITICO | Seguranca | ~50 tabelas (mfa_sessions, user_sessions, security_alerts, global_settings, ip_whitelist, payment_links, whatsapp_connections, gmail_accounts) | Role `anon` possui privilegio TRUNCATE em tabelas sensiveis. TRUNCATE em PostgreSQL ignora RLS — nao e operacao de linha. | `anon_grants_summary.notable_truncate_grants` | Qualquer requisicao anonima que acione TRUNCATE nessas tabelas (via funcao ou acesso direto) pode apagar dados criticos sem restricao de RLS | REVOKE TRUNCATE ON TABLE ... FROM anon | BAIXO — PostgREST nao expoe TRUNCATE, mas o privilegio e incorreto e pode ser usado via funcao intermediaria | 1h |
| S06-001 | CRITICO | Operacional | pg_cron — pool saturation | 24 crons ativos; `cron.max_running_jobs=32`; multiplos jobs a cada 1 minuto. Nos ultimos 30 dias: 686 falhas em `dispatch_scheduled_messages` (6,53%), 4342 em `talkx-scheduler-1min` (10,06%), 1986 em `tasks-notify-due` (4,60%). Motivo: `job startup timeout`. | `cron_failures.distinct_jobs_affected` (12 jobs afetados) | Mensagens agendadas nao sao entregues; campanhas TalkX com tick atrasado; tarefas nao notificadas a tempo | Reduzir frequencia de crons de baixa criticidade; escalonar intervalos; avaliar `cron.max_running_jobs=48` (requer suporte Supabase) | MEDIO — mudar schedules afeta SLA de entrega | 4h |
| S09-001 | ALTO | Autenticacao | `auth.users` (10 usuarios) | Nenhum dos 10 usuarios possui MFA habilitado. Todos acessam dados de mensagens, contatos e configuracoes de producao sem segundo fator. | `mfa_stats.users_with_mfa = 0` | Comprometimento de senha = acesso total ao sistema; sem barreira adicional para contas administrativas | Habilitar MFA obrigatorio (TOTP ou WebAuthn) para todos os usuarios no Dashboard Auth → Policies; educar equipe | NENHUM — nao afeta schema | 2h |
| S02-001 | ALTO | Integridade | Ledger de migrations (`supabase_migrations`) | 63 versions entre 20261006 e 20261026 possuem `statements = NULL` no ledger. O arquivo existe no repo mas o SQL aplicado nao esta registrado. | `null_statements_versions` (63 entradas) | Replay do schema a partir do ledger incompleto; `db-live-guard` pode gerar falso positivo de drift; violacao da regra 7 do CLAUDE.md | Para cada version: confirmar estado real via `pg_get_functiondef`/`pg_indexes`; preencher `statements` com o SQL real via `register-migration.mjs` | ALTO — cada UPDATE deve confirmar o estado real antes de escrever | 8h |
| S03-002 | ALTO | Seguranca | 17 tabelas (ai_jobs, catalog_rate_limits, edge_rate_limits, gmail_oauth_states, voip_profile_credentials...) | RLS habilitado mas sem nenhuma policy definida. Comportamento: acesso bloqueado para todos os roles exceto service_role/postgres. Dados inacessiveis via PostgREST mesmo para admin. | `tables_rls_enabled_no_policy` | Se essas tabelas precisam ser lidas/escritas por roles autenticados, estao silenciosamente inacessiveis; se sao apenas service_role, documentar intencao | Adicionar policies explicitas (service_role_only) ou documentar que o acesso bloqueado e intencional | BAIXO — nao altera comportamento existente | 2h |
| S03-003 | ALTO | Seguranca | `department_invites` | Policy `dept_invites_delete_authenticated` usa `USING (true)` sem condicao — qualquer usuario autenticado pode deletar qualquer convite de departamento. | `permissive_policies_using_true` entry com `risk: "ALTO"` | Agente ou usuario malicioso pode invalidar convites pendentes de outros departamentos | Restringir para `USING (created_by = auth.uid() OR is_admin_or_supervisor())` | BAIXO | 30min |
| S03-005 | ALTO | Seguranca | profiles, user_roles, user_sessions, user_devices, security_alerts, talkx_campaigns, talkx_recipients, gmail_accounts, scheduled_reports, payment_links, warroom_alerts, global_settings, ip_whitelist, rate_limit_configs | Role `anon` possui SELECT grants nestas tabelas sensiveis. Mesmo com RLS, o grant permite que qualquer requisicao nao-autenticada tente consultar — depende de policies anon para bloquear. | `anon_grants_summary.notable_select_grants` | Se houver falha ou ausencia de policy anon nestas tabelas, dados sensiveis ficam expostos sem autenticacao | REVOKE SELECT on tabelas sensiveis FROM anon; manter apenas em tabelas explicitamente publicas | MEDIO — risco de quebrar fluxos que usam anon key legitimamente | 3h |
| S03-006 | ALTO | Seguranca | reminders, catalog_favorites, copilot_insights, copilot_sessions | Policies ALL/UPDATE com `USING (profile_id = auth.uid())` sem `WITH CHECK`. Um UPDATE pode alterar `profile_id` para outro usuario, transferindo a propriedade do registro. | `update_without_check_notable` (reminders, catalog_favorites, copilot_insights, copilot_sessions) | Escalacao horizontal: usuario A pode reatribuir seus dados para usuario B | Adicionar `WITH CHECK (profile_id = auth.uid())` em todas as policies ALL/UPDATE identificadas | BAIXO — so afeta escrita maliciosa | 1h |
| S09-002 | ALTO | Storage | Bucket `multiplix-voice` | Bucket privado criado em 2026-10-03 com 0 policies de RLS e sem restricao de MIME type (`allowed_mime_types: null`). Qualquer arquivo de qualquer tipo pode ser armazenado; acesso apenas via service_role mas sem defesa em profundidade. | `buckets[multiplix-voice]` | Upload de arquivos maliciosos; sem auditabilidade de acesso | Adicionar policies de INSERT/SELECT/DELETE restringindo ao service_role ou roles especificos; definir `allowed_mime_types: ["audio/*"]` | NENHUM | 1h |

---

## Secao 1 — Inventario

**Tabelas:** 204 (schema public) + 9 (_bkp_261023) + 27 (auth) + outros schemas  
**Funcoes:** 478 (400 plpgsql, 78 sql; 399 SECURITY DEFINER)  
**Views:** 13  
**Triggers:** 120 de tabela + 218 totais (includindo duplicatas)  
**Enums:** 10  
**Extensoes:** 8 (pg_cron 1.6.4, pg_net 0.20.4, pg_stat_statements 1.11, pg_trgm 1.6, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1)  
**Sequencias:** 4 (nenhuma proximo ao limite)  
**Tamanho total do banco:** 433 MB

### Achados S01

| ID | Severidade | Objeto | Descricao |
|---|---|---|---|
| S01-001 | MEDIO | `_zapp_fn_before` | Unica tabela do schema public sem PRIMARY KEY. Tabela de log/migration sem PK impossibilita referencia de linha unica |
| S01-002 | MEDIO | 31 FKs (talkx_campaigns x7, multiplix_delivery_items x3, conversation_events x2, queues, reminders, sla_alert_events...) | Colunas de FK sem indice correspondente. Buscas por JOIN ou cascata percorrem seq scan na tabela referenciada |
| S01-003 | BAIXO | `idx_dept_invites_code` / `department_invites_code_key`; `auth.custom_oauth_providers_identifier_idx` / `..._key` | 2 pares de indices duplicados (btree + unique constraint sobre mesma coluna). Desperdicam 32 kB e dobram o overhead de escrita |
| S01-004 | BAIXO | Schema `_bkp_261023` | Schema de backup de 2026-10-23 com 9 tabelas (~3,6 MB) sem uso ativo. Pode ser dropado apos confirmacao |

---

## Secao 2 — Drift (Repo vs Banco)

| Metrica | Valor |
|---|---|
| Migrations no repo | 1064 |
| Migrations no banco | 1064 |
| Somente no banco | 0 |
| Somente no repo | 0 |
| Versions com NULL statements | **63** |

**Tabelas no banco nao em types.ts (30):** agent_mini_game_xp_daily, ai_usage_outbox, app_settings, contact_block_audit, contact_protection_policy, copilot_insights, copilot_sessions, email_signatures, instance_pauses, message_attempts, message_favorites, message_pins, message_reports, outbox_events, qr_attempts, reconnection_logs, searchbox_budget_alert_cron, searchbox_budget_alert_emails, security_acl_alerts, sla_alert_events, sla_alert_preferences, talkx_contact_attributes, talkx_data_jobs, talkx_help_views, talkx_segment_fields, talkx_segment_library_history, talkx_segment_versions, talkx_test_sends, team_chat_media_acl_r2_db_020_rb, voip_profile_credentials

### Achados S02

| ID | Severidade | Descricao |
|---|---|---|
| S02-001 | ALTO | 63 migrations com `statements = NULL` no ledger. Regra 7 do CLAUDE.md violada; replay impossivel para esses objetos |
| S02-002 | MEDIO | 30 tabelas presentes no banco sem entrada em `types.ts`. Front-end sem tipagem para copilot_sessions, sla_alert_events, talkx_contact_attributes e outros |
| S02-003 | BAIXO | 2 RPCs orfas (`get_search_insights`, `log_search_event`) — existem no banco mas nenhum invoke no front; candidatas a deprecacao |
| S02-004 | BAIXO | Anon key hardcoded em `src/integrations/supabase/client.ts:17`; deveria ser `VITE_SUPABASE_ANON_KEY` |

---

## Secao 3 — Seguranca

| Metrica | Valor |
|---|---|
| Total de tabelas publicas | 204 |
| Com RLS habilitado | 204 (100%) |
| Com RLS habilitado mas sem policy | 17 |
| Policies permissivas com `USING (true)` | 36 |
| Policies UPDATE/ALL sem WITH CHECK | 54 |
| Funcoes SECURITY DEFINER | 399 |
| Funcoes SECURITY DEFINER sem search_path fixo | 0 |

### Achados S03

| ID | Severidade | Objeto | Descricao |
|---|---|---|---|
| S03-001 | CRITICO | `public.mcp_exec` | SQL dinamico arbitrario + excecoes silenciadas + re-execucao DML; grant a postgres e service_role |
| S03-002 | ALTO | 17 tabelas sem policy | RLS bloqueante sem documentacao de intencao; ai_jobs e catalog_rate_limits provavelmente precisam de acesso |
| S03-003 | ALTO | `department_invites` DELETE | `USING (true)` — qualquer autenticado deleta qualquer convite |
| S03-004 | CRITICO | ~50 tabelas sensiveis | Grant TRUNCATE para role `anon` (TRUNCATE ignora RLS) |
| S03-005 | ALTO | profiles, user_roles, security_alerts, gmail_accounts, talkx_campaigns... | Grant SELECT para `anon` em tabelas sensiveis |
| S03-006 | ALTO | reminders, catalog_favorites, copilot_insights, copilot_sessions | ALL/UPDATE sem WITH CHECK — profile_id alteravel |
| S03-007 | MEDIO | `channel_connections_safe`, `gmail_accounts_safe` | Views sem `security_invoker`; herdam permissoes do criador |
| S03-008 | MEDIO | `password_reset_requests` | Anon pode INSERT para qualquer `user_id` conhecido (intencional mas risco de enumeracao/spam) |

---

## Secao 4 — Integridade Referencial

| ID | Severidade | Objeto | Descricao |
|---|---|---|---|
| S04-001 | MEDIO | `_zapp_fn_before` | Tabela sem PK; impossivel referenciar linha unica |
| S04-002 | MEDIO | 31 relacoes FK | FK sem indice: JOIN e DELETE cascade percorrem seq scan nas tabelas referenciadas |
| S04-003 | BAIXO | 50 FKs com ON DELETE NO ACTION | Sem restricao de cascata; orfaos podem se acumular |

---

## Secao 5 — Performance

| Query | Chamadas (30d) | Tempo medio (ms) | Tempo total (ms) |
|---|---|---|---|
| `SELECT pg_timezone_names` (Studio) | 3 | 4885 | 14656 |
| `update cron.job_run_details status` | 1 | 1444 | 1444 |
| `get_last_message_dates` (RPC) | 42 | 1266 | 53162 |
| `pg_available_extensions` (Studio) | 4 | 955 | 3818 |
| `inbox_unread_total` (RPC) | 101 | 458 | 46212 |

**Nota:** pg_stat_statements nao esta disponivel; stats de indices foram resetadas recentemente.

### Achados S05

| ID | Severidade | Objeto | Descricao |
|---|---|---|---|
| S05-001 | MEDIO | `get_last_message_dates` | 1266ms media; 42 chamadas; 53s total no periodo. Candidato a otimizacao com indice composto |
| S05-002 | MEDIO | `inbox_unread_total` | 458ms media; 101 chamadas; 46s total. RPC de alta frequencia |
| S05-003 | MEDIO | `connection_health_logs`, `whatsapp_connections`, `gmail_accounts` | Dead tuples >96%; autovacuum nunca executou; necessita VACUUM manual |
| S05-004 | BAIXO | `messages` | Ratio indice/dado 69%; tres indices trigram; avaliar remocao de `idx_messages_media_url_trgm` apos acumular stats |
| S05-005 | BAIXO | `cron.job_run_details` | 78 MB acumulados de historico de execucoes; sem politica de limpeza visivel alem dos 14 dias do pg_cron padrao |

---

## Secao 6 — Cron Jobs

**Total de crons:** 24 (todos ativos)

| Nome | Schedule | Taxa falha 30d |
|---|---|---|
| talkx-scheduler-1min | * * * * * | **10,06%** |
| dispatch-scheduled-messages | * * * * * | 6,53% |
| tasks-notify-due | * * * * * | 4,60% |
| voice-changer-tmp-purge | 17 * * * * | 8,47% |
| close-stale-calls | */5 * * * * | 7,09% |

### Achados S06

| ID | Severidade | Objeto | Descricao |
|---|---|---|---|
| S06-001 | CRITICO | pg_cron pool | Saturacao do pool (max_running_jobs=32, 24 crons ativos, varios por minuto); 12 jobs afetados por `job startup timeout` em 30d |
| S06-002 | BAIXO | `talkx-scheduler-1min` | 10,06% de falha (4342 em 30d); maior taxa individual; consequencia da saturacao do S06-001 |
| S06-003 | MEDIO | `notify_due_tasks` | Loop sobre tasks WHERE notified_at IS NULL sem FOR UPDATE SKIP LOCKED; execucoes concorrentes podem inserir notificacoes duplicadas |
| S06-004 | BAIXO | `trigger_talkx_engine_tick` | URL do talkx-storage-purge derivada por `regexp_replace` sobre `talkx_scheduler_url`; se formato da URL mudar, purge para silenciosamente |

---

## Secao 7 — Funcoes de Banco

**Total:** 478 funcoes | **SECURITY DEFINER:** 399 | **Sem search_path fixo:** 0

### Achados S07

| ID | Severidade | Objeto | Descricao |
|---|---|---|---|
| S07-001 | MEDIO | `trigger_pending_multiplix_dispatches` | Dois blocos `EXCEPTION WHEN OTHERS THEN NULL` sem logging; erros por dispatch engolidos silenciosamente |
| S07-002 | MEDIO | `trigger_talkx_engine_tick` | Multiplos blocos EXCEPTION silenciosos (por design segundo comentarios inline); purge escalona para `talkx_alerts` — padrao aceitavel mas incompleto |
| S07-003 | BAIXO | `mcp_exec` | SQL dinamico com EXECUTE + silenciamento de excecoes; exposto a postgres/service_role (ver S03-001) |
| S07-004 | BAIXO | `talkx_audience_query`, `merge_contacts_atomic` | SQL dinamico (MEDIO); ambas com search_path fixo e sem input externo direto |

---

## Secao 8 — Edge Functions

**Total no repo:** 85 funcoes | **Com verify_jwt=false:** 14 | **Nao justificada com risco:** 1 (talkx-link)

### Achados S08

| ID | Severidade | Funcao | Descricao |
|---|---|---|---|
| S08-001 | MEDIO | `evolution-api` | 7 fetch() ao Evolution GO sem AbortSignal.timeout; se GO travar, funcao bloqueia ate timeout global (~60s) |
| S08-002 | MEDIO | `gmail-cron-sync` | Comparacao timing-safe nao usa helper canonico; divergencia de implementacao |
| S08-003 | MEDIO | `gmail-webhook`, `gmail-sync`, `gmail-cron-sync` | fetch() para Gmail API sem timeout |
| S08-004 | BAIXO | `elevenlabs-tts`, `elevenlabs-sts`, `elevenlabs-dialogue` | fetch() para ElevenLabs sem timeout |
| S08-005 | BAIXO | `sync-call-records`, `searchbox-budget-alert` | fetch() sem timeout |
| S08-006 | BAIXO | 8 funcoes diversas | `Deno.env.get('VAR')!` sem fallback |

---

## Secao 9 — Auth, Storage e Realtime

### Storage Buckets

| Bucket | Publico | MIME restrito | Policies RLS | Status |
|---|---|---|---|---|
| audio-memes | SIM | audio/* | 5 | OK |
| audio-messages | nao | audio/* | 5 | OK |
| avatars | nao | image/* | 4 | OK |
| custom-emojis | SIM | image/* + SVG | 3 | ATENCAO: SVG inline |
| multiplix-voice | nao | **SEM restricao** | **0** | CRITICO |
| stickers | SIM | image/* | 4 | OK |
| team-chat-files | nao | variado | 3 | OK |
| voice-changer-tmp | nao | audio/* | 4 | OK |
| whatsapp-media | nao | image/video/audio | 4 | OK |

### Achados S09

| ID | Severidade | Objeto | Descricao |
|---|---|---|---|
| S09-001 | ALTO | auth.users (todos) | Zero MFA em producao com dados de WhatsApp, emails, campanhas e configuracoes sensiveis |
| S09-002 | ALTO | bucket `multiplix-voice` | 0 policies RLS; sem restricao de MIME; acesso apenas por service_role mas sem defesa em profundidade |
| S09-003 | MEDIO | bucket `custom-emojis` | SVG habilitado em bucket publico; risco de XSS stored se renderizado inline |
| S09-004 | BAIXO | `src/integrations/supabase/client.ts:17` | Anon key hardcoded |

---

## Secao 10 — Logs (7 dias)

**Estado do banco:** saudavel (cache-hit 99,64%; 35 conexoes; 0 locks ativos)

### Achados S10

| ID | Severidade | Objeto | Descricao |
|---|---|---|---|
| S10-001 | MEDIO | `cron.job_run_details` | 78 MB acumulados; politica de limpeza alem dos 14 dias padrao nao verificada |
| S10-002 | MEDIO | messages, campaigns, whatsapp_connections, profiles | Tabelas criticas sem trigger de auditoria; alteracoes nao rastreadas |
| S10-003 | BAIXO | 188 tabelas sem coluna de retencao | Ausencia de deleted_at/expires_at; LGPD requer periodo de retencao definido |

---

## Secao 11 — RLS: Testes

NAO VERIFICADO EM PRODUCAO (somente leitura).

Roteiro para executar em banco local:

```sql
-- 1. Subir banco local com supabase start
-- 2. Aplicar migrations: supabase db reset
-- 3. Testar isolamento de tenant
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"uuid-tenant-a","role":"authenticated"}';
SELECT * FROM messages LIMIT 10;  -- deve retornar apenas dados do tenant A
ROLLBACK;

-- 4. Testar UPDATE sem WITH CHECK (S03-006)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"uuid-tenant-a","role":"authenticated"}';
UPDATE reminders SET profile_id = 'uuid-tenant-b' WHERE profile_id = 'uuid-tenant-a' LIMIT 1;
-- Deve falhar com violacao de policy; se UPDATE 1 row, a vulnerabilidade existe
ROLLBACK;

-- 5. Testar TRUNCATE de anon (S03-004)
BEGIN;
SET LOCAL ROLE anon;
TRUNCATE mfa_sessions;  -- deve falhar com permission denied
ROLLBACK;
```

---

## Secao 12 — Lacunas Operacionais

| ID | Severidade | Area | Descricao |
|---|---|---|---|
| S12-001 | MEDIO | Staging | Nenhum ambiente de staging identificado; toda mudanca vai direto para producao |
| S12-002 | MEDIO | LGPD/Retencao | 188 tabelas sem coluna de retencao; `messages`, `notifications`, `campaigns`, `ai_usage_logs`, `copilot_sessions`, `profiles` afetadas |
| S12-003 | BAIXO | RPCs orfas | `get_search_insights` e `log_search_event` existem no banco mas nao sao invocadas pelo front |
| S12-004 | BAIXO | Auditoria temporal | `track_commit_timestamp = off`; limita rastreabilidade de COMMIT |
| S12-005 | INFO | PITR | WAL archiving ativo; gerenciado pelo Supabase Cloud; confirmar periodo de retencao via Dashboard |
| S12-006 | INFO | Monitoring | `VITE_SENTRY_DSN` no `.env.example` mas uso em `src/*.ts` nao confirmado |
| S12-007 | INFO | CI de RLS | Testes de RLS presentes no CI (`db-guard.yml`, `e2e-logado.yml`) — boa pratica |

---

## Plano de Acao em Ondas

### Onda 1 — Critico (esta semana)

1. **[S03-004]** REVOKE TRUNCATE em tabelas sensiveis — `propostas/FIX-S03-004.sql` — 1h
2. **[S06-001]** Escalonar crons conflitantes — `propostas/FIX-S06-001.sql` — 4h
3. **[S09-001]** Habilitar MFA obrigatorio — `propostas/FIX-S09-001.md` — 2h (sem migration)
4. **[S03-001]** Revisar mcp_exec — `propostas/FIX-S03-001.sql` — 3h

### Onda 2 — Alto (este mes)

5. **[S02-001]** Preencher NULL statements no ledger — `propostas/FIX-S02-001.md` — 8h
6. **[S03-003]** Restringir policy DELETE de department_invites — `propostas/FIX-S03-003.sql` — 30min
7. **[S03-006]** Adicionar WITH CHECK nas policies UPDATE/ALL — `propostas/FIX-S03-006.sql` — 1h
8. **[S09-002]** Configurar policies no bucket multiplix-voice — `propostas/FIX-S09-002.sql` — 1h
9. **[S03-005]** REVOKE SELECT de tabelas sensiveis de anon — `propostas/FIX-S03-005.sql` — 3h
10. **[S03-002]** Documentar/corrigir tabelas com RLS sem policy — `propostas/FIX-S03-002.sql` — 2h

---

## Itens NAO VERIFICADOS

| Item | Motivo |
|---|---|
| Estado real do PITR | Gerenciado pelo Supabase Cloud; nao acessivel via SQL |
| Edge functions deployadas vs. repo | `supabase_functions` schema sem tabelas queryaveis via service_role |
| Configuracoes de Auth (jwt_expiry, OTP settings) | `auth.config` nao existe nesta versao do Supabase |
| Testes de isolamento RLS entre tenants | Requerem execucao em banco local |
| Conteudo de segredos no Vault | Apenas nomes listados; valores nao acessiveis (correto) |
| pg_stat_statements | Extensao presente mas nao disponivel para consulta no plano atual |

---

## Prova de Nao Alteracao em Producao

- Todas as queries executadas foram SELECT somente
- Zero INSERT/UPDATE/DELETE/DDL/GRANT executados durante a auditoria
- Zero edge functions invocadas com efeito externo
- Zero migracoes aplicadas
- Zero branches criadas
- Banco em estado identico ao inicio da auditoria
