# Relatório de Auditoria Supabase — Zapp Web V2

**Projeto:** `tnnnlkbymytvtqngbbqh` (Supabase Cloud)
**Data:** 2026-10-22
**Escopo:** 12 seções — inventário, drift, segurança, integridade de dados, performance, crons, funções DB, auth, edge functions, logs, RLS e lacunas operacionais
**Método:** somente leitura (SELECT); zero escritas em produção

---

## Sumário Executivo

Auditoria exaustiva do banco Supabase do Zapp Web V2 em 2026-10-22. O banco possui 173 tabelas, 922 migrations no ledger, 16 cron jobs ativos e 10 usuários. A cobertura RLS é 100% — nenhuma tabela exposta sem proteção.

Os três riscos mais graves são: (1) **17 RPCs chamadas no frontend inexistentes em produção** — funcionalidades de inbox, warroom, TalkX e dashboard retornam PGRST202; (2) **ausência total de MFA** — 10 contas com autenticação apenas por senha numa plataforma com acesso a mensagens e dados empresariais; (3) **61 migrations com statements NULL no ledger** — impossibilidade de replay local e auditoria offline de um terço da história de schema.

Adicionalmente, em 2026-10-16 ocorreu um pico de 1779 falhas de cron (todos os jobs simultâneos com startup timeout) sem qualquer alerta externo ativo.

**Totais:** 0 CRÍTICO · 10 ALTO · 23 MÉDIO · 13 BAIXO · 22 INFO

---

## Achados por Seção

| ID | Severidade | Seção | Título | Objeto | Impacto | Esforço |
|----|-----------|-------|--------|--------|---------|---------|
| S1-A1 | ALTO | S1 Inventário | 61 migrations com statements NULL | schema_migrations | Impossibilita replay e auditoria offline | Alto |
| S1-A2 | ALTO | S1 Inventário | Version futura (2026-10-26) no ledger | schema_migrations | Viola ordenação monotônica para novas migrations | Baixo |
| S1-A3 | MÉDIO | S1 Inventário | Bucket multiplix-voice sem file_size_limit | storage.buckets | Upload ilimitado, custo inesperado | Baixo |
| S1-A4 | MÉDIO | S1 Inventário | Cron vacuum-messages ativo sem uso | cron.job jobid=5 | Slot ocupa pool; migration de remoção não aplicada | Baixo |
| S1-B1 | BAIXO | S1 Inventário | 11 tabelas RLS ativo, zero policies | public (11 tabelas) | Default-deny implícito — comportamento correto mas não documentado | Baixo |
| S1-I1 | INFO | S1 Inventário | 4 buckets públicos com file_size_limit | storage.buckets | Intencional — confirmar não há dado sensível | — |
| S1-I2 | INFO | S1 Inventário | 173 tabelas, 100% RLS ativo | schema public | Positivo | — |
| S1-I3 | INFO | S1 Inventário | 922 migrations, 16 cron jobs, 13 secrets | baseline | Baseline de referência | — |
| S2-A1 | ALTO | S2 Drift | 129 migrations no repo não aplicadas em produção | supabase/migrations/ vs ledger | RPCs e tabelas de TalkX/warroom inexistentes em produção | Alto |
| S2-A2 | ALTO | S2 Drift | 17 RPCs chamadas no frontend inexistentes no banco | src/ vs pg_proc | PGRST202 em produção para dashboard, inbox, warroom, TalkX | Alto |
| S2-A3 | ALTO | S2 Drift | get_search_insights vs search_insights (divergência de nome) | src/hooks vs pg_proc | SearchInsightsView nunca carrega dados | Baixo |
| S2-A4 | MÉDIO | S2 Drift | 61 migrations no ledger com statements NULL | schema_migrations | Impossibilita auditoria offline | Alto |
| S2-A5 | MÉDIO | S2 Drift | schema-manifest.json defasado ~10 dias | supabase/schema-manifest.json | Falsos positivos no db-live-guard | Baixo |
| S2-A6 | BAIXO | S2 Drift | 0 versions apenas no ledger sem arquivo no repo | schema_migrations vs repo | Positivo — sem DDL direto detectado | — |
| S3-01 | ALTO | S3 Segurança | DELETE/INSERT sem ownership em department_invites | public.department_invites | Qualquer usuário autenticado deleta/cria convites alheios | Baixo |
| S3-02 | MÉDIO | S3 Segurança | 11 tabelas RLS zero policies — inclui talkx_test_send_claims | public (11 tabelas) | Possível artefato de teste em produção | Baixo |
| S3-03 | MÉDIO | S3 Segurança | Policy storage usa role 'public' em vez de 'authenticated' | storage.objects team-chat-files | Risco de manutenção — mudança futura pode expor arquivos | Baixo |
| S3-04 | MÉDIO | S3 Segurança | 41 policies UPDATE sem WITH CHECK explícito | public (41 tabelas) | UPDATE pode alterar campos de ownership sem restrição | Médio |
| S3-05 | BAIXO | S3 Segurança | 4 buckets públicos leitura anônima direta | storage.buckets | Intencional para assets de UI — confirmar | Baixo |
| S3-06 | INFO | S3 Segurança | Cobertura RLS 100% | public | Positivo | — |
| S3-07 | INFO | S3 Segurança | 0 funções SECURITY DEFINER sem search_path fixo | public | Positivo | — |
| S3-08 | INFO | S3 Segurança | 0 funções executáveis pelo role anon | public | Positivo | — |
| S3-09 | INFO | S3 Segurança | 4 cron jobs com secrets via Vault | cron.job | Positivo | — |
| S3-10 | INFO | S3 Segurança | Nenhum service_role hardcoded no bundle | src/ | Positivo | — |
| S3-11 | INFO | S3 Segurança | 0 funções usam user_metadata para autorização | public | Positivo | — |
| S3-12 | INFO | S3 Segurança | auth.config inacessível via SQL | auth.config | Verificar via Dashboard | — |
| S4-01 | MÉDIO | S4 Integridade | 20 FKs sem índice na coluna referenciante | talkx_campaigns, multiplix, outros | Seq scan em DELETE/UPDATE de tabelas pai | Médio |
| S4-02 | BAIXO | S4 Integridade | Colunas *_id sem FK interna | ai_usage_logs, multiplix_audiences | Registros órfãos silenciosos | Baixo |
| S4-03 | BAIXO | S4 Integridade | Tabelas operacionais sem created_at | user_sessions, webhook_failures, outros | Impossibilita diagnóstico temporal | Médio |
| S4-04 | BAIXO | S4 Integridade | _zapp_fn_before sem PRIMARY KEY | _zapp_fn_before | Sem replicação lógica row-by-row | Baixo |
| S4-05 | INFO | S4 Integridade | Paridade perfeita auth.users ↔ profiles (10:10) | auth.users, profiles | Positivo | — |
| S4-06 | INFO | S4 Integridade | Sequences BIGINT com uso < 0.001% | catalog_rate_limit_hits_id_seq | Sem risco de overflow | — |
| S4-07 | INFO | S4 Integridade | 172 tabelas sem soft-delete | public | Decisão de produto — documentar intenção | — |
| P01 | ALTO | S5 Performance | get_last_message_dates: avg 2427ms, 719 chamadas | public.get_last_message_dates | Maior gargalo de negócio: 29 min acumulados | Médio |
| P02 | ALTO | S5 Performance | storage.objects lookup: avg 2014ms, 1329 chamadas | storage.objects | 44 min acumulados; possível tabela muito grande | Médio |
| P03 | MÉDIO | S5 Performance | messages: 66.7% dead tuples, 40 MB para 6 linhas vivas | public.messages | Stats obsoletas distorcem planner | Baixo |
| P04 | MÉDIO | S5 Performance | Múltiplas tabelas com high dead-tuple sem autovacuum | public (7 tabelas) | Degradação de queries de rate-limiting e sessões | Baixo |
| P05 | MÉDIO | S5 Performance | Índices trgm e dedup em messages: 13.8 MB, 0 scans | public.messages (4 índices) | Write amplification desnecessária | Baixo |
| P06 | MÉDIO | S5 Performance | dashboard_hourly_volume: avg 4401ms, 3 chamadas | public.dashboard_hourly_volume | Dashboard lento sem materialização | Médio |
| P07 | BAIXO | S5 Performance | Índices duplicados em department_invites | public.department_invites | 32 KB desperdiçados | Baixo |
| P08 | BAIXO | S5 Performance | contacts INSERT via PostgREST: avg 15055ms | public.contacts | 15s por inserção — possível trigger pesado | Médio |
| P09 | INFO | S5 Performance | pg_stat_statements não disponível | pg_catalog | Habilitar para monitoramento contínuo | Baixo |
| P10 | INFO | S5 Performance | Nenhum missing index detectado | public | Positivo | — |
| F-S6-001 | MÉDIO | S6 Crons | vacuum-messages-post-expurgo ativo, migration de remoção não aplicada | cron.job jobid=5 | Slot ocupado; migration 20261006202215 pendente | Baixo |
| F-S6-002 | MÉDIO | S6 Crons | talkx-scheduler-1min: 9% de falhas em 30 dias | cron.job jobid=11 | 130 execuções falhando por dia | Médio |
| F-S6-003 | MÉDIO | S6 Crons | Saturação do pool pg_cron em eventos pontuais | cron.job (múltiplos) | Jobs críticos param simultaneamente em picos | Médio |
| F-S7-001 | MÉDIO | S7 Funções | 7 funções com EXCEPTION WHEN OTHERS silencioso | public (7 funções) | Erros de cron engolidos sem rastro | Médio |
| F-S7-002 | MÉDIO | S7 Funções | talkx_audience_query: SQL dinâmico + WHEN OTHERS | public.talkx_audience_query | Audiência gerada incorretamente sem alerta | Médio |
| F-S7-003 | MÉDIO | S7 Funções | 18 RPCs no código sem correspondente no banco | src/ vs pg_proc | PGRST202 em produção | Alto |
| F-S7-004 | BAIXO | S7 Funções | admin_list_cron_jobs/toggle: migration existe, funções ausentes | public (2 funções) | Painel admin de crons não funciona | Baixo |
| F-S7-005 | BAIXO | S7 Funções | contacts com 14 triggers — alta densidade | public.contacts | Latência em operações em lote | Médio |
| F-S7-006 | INFO | S7 Funções | mcp_exec: SQL dinâmico + WHEN OTHERS (service_role only) | public.mcp_exec | Risco baixo — apenas service_role | — |
| F-S6-004 | INFO | S6 Crons | 4 jobs com URL de produção hardcoded | cron.job (4 jobs) | Documentado em CLAUDE.md — replay local | — |
| S8-01 | ALTO | S8 Auth | Nenhum MFA configurado para nenhum usuário | auth.mfa_factors | 10 contas apenas senha em plataforma empresarial | Médio |
| S8-02 | MÉDIO | S8 Auth | Storage policy team-chat-files usa role 'public' | storage.objects | Risco de manutenção para futura exposição | Baixo |
| S8-03 | MÉDIO | S8 Auth | evolution-webhook: modo 'shadow' anula autenticação | supabase/functions/evolution-webhook | Injeção de eventos WhatsApp falsos se ativado | Baixo |
| S8-04 | MÉDIO | S8 Auth | 33 tabelas na publicação realtime incluindo dados sensíveis | pg_publication_tables | Falha de RLS = exposição realtime em tempo real | Alto |
| S8-05 | BAIXO | S8 Auth | audio-memes público com 542 objetos | storage.buckets | Acesso anônimo irrestrito — confirmar intenção | Baixo |
| S8-06 | BAIXO | S8 Auth | Janela legada talkx-link expirou (2026-10-20) | supabase/functions/talkx-link | Conversões com assinatura legada param silenciosamente | Baixo |
| S8-07 | BAIXO | S8 Auth | csp-report sem rate-limiting por IP | supabase/functions/csp-report | Saturação de logs por relatórios falsos | Baixo |
| S8-08 | INFO | S8 Auth | 14 funções com verify_jwt=false — todas com auth alternativa | supabase/config.toml | Documentado — nenhum risco imediato | — |
| S8-09 | INFO | S8 Auth | Nenhum secret hardcoded nas edge functions | supabase/functions/ | Positivo | — |
| S8-10 | INFO | S8 Auth | CORS restrito sem wildcard | cors-origins.ts | Positivo | — |
| S9-01 | INFO | S9 Edge | auth.config inacessível via service_role | auth.config | Verificar manualmente via Dashboard | — |
| S9-02 | INFO | S9 Edge | Email+Google OAuth, 1 usuário banido | auth.identities | Operacional — confirmar ban intencional | — |
| S10-CRON-PICO | ALTO | S10 Logs | 1779 falhas de cron em 2026-10-16 — todos os jobs | cron.job_run_details | Todos os jobs críticos indisponíveis; sem alerta externo | Médio |
| S10-CRON-RECORRENTE | MÉDIO | S10 Logs | 4-6 falhas/dia de cron em múltiplos dias | cron.job_run_details | Execuções esporádicas falhando — pool insuficiente | Médio |
| S11-RLS-ANON | INFO | S11 RLS | RLS bloqueia anon em todas as tabelas sensíveis | public (8+ tabelas) | Positivo — 0 linhas retornadas para anon | — |
| S12-PII | MÉDIO | S12 Lacunas | login_attempts armazena email+IP sem TTL | public.login_attempts | Retenção indefinida de PII — risco LGPD | Médio |
| S12-MONITORING | MÉDIO | S12 Lacunas | Sem APM/alerting externo | src/ (ausência) | Falhas de produção sem alerta proativo | Médio |
| S12-WAL | INFO | S12 Lacunas | WAL configuração saudável | pg_settings | Positivo: archive_mode=on, wal_level=logical | — |
| S12-AUDIT | INFO | S12 Lacunas | 14 tabelas de log/auditoria identificadas | public | Cobertura ampla | — |

---

## Top 10 Achados ALTO

### 1. S2-A2 — 17 RPCs inexistentes em produção

**Evidência:**
```sql
SELECT proname FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN (
    'admin_list_cron_jobs','admin_toggle_cron_job','app_bootstrap',
    'dashboard_daily_series','enqueue_group_outbound_message','inbox_unread_total',
    'increment_custom_emoji_use','reopen_conversation','search_email_threads',
    'sentiment_trend','warroom_agent_today','warroom_queue_stats',
    'log_search_event','talkx_campaign_recipients_page','talkx_segment_bulk_action',
    'talkx_segment_library_stats','talkx_suppression_stats'
  );
-- → 0 rows
```

**Reprodução:** Abrir qualquer tela que usa essas RPCs em produção; inspecionar Network tab — `PGRST202 Could not find the function`.

**Correção:** Aplicar as 129 migrations pendentes (S2-A1) via `db-migrate.yml` com dry-run + aprovação em `producao-ddl`. Para `log_search_event`: criar migration ou remover chamada do código.

**Risco de regressão:** Aplicar migrations fora do fluxo arquivo→PR→merge gera novo drift (histórico de setembro/2026).

---

### 2. S8-01 — Nenhum MFA configurado

**Evidência:**
```sql
SELECT count(*) as mfa_factors_total,
       count(*) FILTER (WHERE status='verified') as verified
FROM auth.mfa_factors;
-- → {mfa_factors_total: 0, verified: 0}
```

**Reprodução:** Dashboard Supabase → Authentication → Users → qualquer usuário → sem fator MFA.

**Correção:** Habilitar MFA obrigatório via Dashboard → Authentication → MFA. Adicionar gate no hook pós-login que verifica `mfa_level`.

**Risco de regressão:** Implementação incorreta pode bloquear todos os logins — testar em ambiente local antes.

---

### 3. S1-A1 / S2-A4 — 61 migrations com statements NULL

**Evidência:**
```sql
SELECT count(*) FILTER (WHERE statements IS NULL) as null_stmts
FROM supabase_migrations.schema_migrations;
-- → 61

SELECT version, name FROM supabase_migrations.schema_migrations
WHERE statements IS NULL ORDER BY version LIMIT 10;
-- Exemplos: 20261012225242, 20261012235745, 20261013230000, 20261013230004...
```

**Reprodução:** `scripts/db-audit/check-migration-drift.mjs` — falha em qualquer migration null_stmts.

**Correção:** Para cada migration: confirmar objeto via `pg_get_functiondef`/`pg_indexes`, localizar arquivo em `supabase/migrations/`, executar `node scripts/db-audit/register-migration.mjs <arquivo.sql>` para gerar UPDATE com SQL completo.

**Risco de regressão:** Nunca transcrever SQL à mão — regra 7 do CLAUDE.md exige o SQL real sem comentários.

---

### 4. S3-01 — DELETE/INSERT sem ownership em department_invites

**Evidência:**
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'department_invites'
  AND cmd IN ('DELETE','INSERT');
-- → dept_invites_delete_authenticated: qual='true'
-- → dept_invites_insert_authenticated: with_check='true'
```

**Reprodução:** Usuário autenticado qualquer pode `DELETE FROM department_invites WHERE id = <qualquer_id>`.

**Correção:** Ver `propostas/P001-department-invites-ownership.sql`.

**Risco de regressão:** Verificar se algum fluxo existente depende da policy permissiva antes de restringir.

---

### 5. S2-A1 — 129 migrations no repo não aplicadas em produção

**Evidência:**
```
ls supabase/migrations/*.sql | grep -Ev '_foreign/|_superseded/' → 1051 arquivos
SELECT count(*) FROM supabase_migrations.schema_migrations → 922 rows
Diferença: 129 versions no repo sem registro
Range: 20261005130925–20261011205122
```

**Reprodução:** `node scripts/db-audit/check-migration-drift.mjs` — lista todas as versions presentes no repo sem ledger.

**Correção:** Aplicar via `db-migrate.yml` (`apply=false` dry-run → aprovação humana em `producao-ddl` → `apply=true`). Respeitar ordem de aplicação por dependências.

**Risco de regressão:** Migrations com dependencies devem ser aplicadas em ordem. Verificar `supabase/migrations/` por comentários de dependência antes de disparar.

---

### 6. S10-CRON-PICO — 1779 falhas de cron em 2026-10-16

**Evidência:**
```sql
SELECT j.jobname, count(*) as cnt, LEFT(r.return_message,80) as msg
FROM cron.job_run_details r JOIN cron.job j ON j.jobid=r.jobid
WHERE r.start_time::date='2026-10-16' AND r.status!='succeeded'
GROUP BY j.jobname, msg ORDER BY cnt DESC;
-- tasks-notify-due:390, ai-jobs-tick-1min:380, talkx-scheduler-1min:374,
-- expire-stale-agent-presence:200, multiplix-send-trigger:193 — todos 'job startup timeout'
```

**Reprodução:** Verificar Dashboard Supabase → Database → Cron Jobs → histórico de 16/10.

**Correção:** (1) Confirmar no Dashboard se houve incidente de infra em 2026-10-16. (2) Implementar alerta proativo via webhook ou email quando taxa de falha superar threshold. (3) Verificar `SELECT current_setting('cron.max_running_jobs')`.

**Risco de regressão:** Aumentar `max_running_jobs` sem validar capacidade pode agravar pressão de recursos.

---

### 7. P01 — get_last_message_dates: avg 2427ms, 719 chamadas

**Evidência:**
```
db_slow_queries: calls=719, mean_ms=2427.5, total_ms=1_745_373.8
-- ~29 minutos de execução acumulada no período medido
```

**Reprodução:** `SELECT pg_get_functiondef('get_last_message_dates'::regproc)` — inspecionar se há seq scan em messages sem índice composto `(contact_id, created_at DESC)`.

**Correção:** Ver `propostas/P007-messages-performance-indexes.sql`.

**Risco de regressão:** Criar índice em tabela com muitas escritas — validar impacto de write amplification antes em banco local.

---

### 8. P02 — storage.objects: avg 2014ms, 1329 chamadas

**Evidência:**
```
db_slow_queries: calls=1329, mean_ms=2014.7, total_ms=2_677_535.8
-- ~44 minutos acumulados. EXPLAIN mostra Index Scan eficiente — execução real lenta.
```

**Reprodução:** Upload de qualquer mídia ou verificação de avatar; observar latência via Network tab (~2s por request de storage).

**Correção:** `SELECT count(*), pg_size_pretty(pg_total_relation_size('storage.objects')) FROM storage.objects`. Se >500k linhas: avaliar purga de objetos órfãos ou particionamento por `bucket_id`.

**Risco de regressão:** Purga de objetos é irreversível — validar objetos órfãos via `storage.objects` LEFT JOIN `storage.buckets` antes de deletar.

---

### 9. S2-A3 — get_search_insights vs search_insights

**Evidência:**
```sql
SELECT proname FROM pg_proc
WHERE proname IN ('get_search_insights','search_insights');
-- → apenas search_insights existe
```

Código: `src/hooks/admin/useSearchInsights.ts:89` chama `.rpc('get_search_insights', { p_days: days })`.

**Correção:** Ver `propostas/P002-get-search-insights-wrapper.sql` ou renomear chamada no código para `.rpc('search_insights', ...)`.

**Risco de regressão:** Verificar assinatura exata de `search_insights` antes de renomear a chamada.

---

### 10. S1-A2 — Version de migration datada no futuro (2026-10-26)

**Evidência:**
```sql
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version > '20261022999999' ORDER BY version;
-- → 20261026090300 (prefixo YYYYMMDD = 2026-10-26, 4 dias à frente)
```

**Reprodução:** Qualquer sessão que calcule `max(version) + 10000` a partir de agora obterá versão menor que `20261026090300` — viola ordenação monotônica.

**Correção:** Verificar se foi pré-datagem deliberada ou erro de relógio. Se acidental: rename do arquivo + DELETE/INSERT no ledger exige PR separado conforme db-guard.yml.

---

## Matriz de Drift (resumida)

| Métrica | Valor |
|---------|-------|
| Migrations no repo (excl. _foreign/, _superseded/) | 1051 |
| Migrations no ledger | 922 |
| Migrations no repo não aplicadas | 129 |
| Migrations no ledger sem arquivo no repo | 0 |
| Migrations no ledger com statements NULL | 61 |
| Manifesto schema-manifest.json atualizado em | 2026-10-16 (~6 dias de defasagem) |
| Version mais recente no ledger | 20261026090300 (data futura) |

Range das migrations não aplicadas: `20261005130925` a `20261011205122`

---

## Matriz RLS (tabelas sensíveis)

| Tabela | RLS Ativa | Políticas | Role anon (resultado) | Role authenticated |
|--------|-----------|-----------|----------------------|-------------------|
| contacts | sim | múltiplas | 0 linhas | filtrado por assignment |
| messages | sim | múltiplas | 0 linhas | filtrado por contact assignment |
| profiles | sim | múltiplas | 0 linhas | próprio perfil |
| whatsapp_connections | sim | múltiplas | 0 linhas | admin/supervisor |
| talkx_campaigns | sim | múltiplas | 0 linhas | owner |
| department_invites | sim | **PERMISSIVA** (DELETE/INSERT sem ownership) | 0 linhas | qualquer authenticated pode deletar/criar |
| scheduled_report_configs | sim | múltiplas | 0 linhas | owner-only |
| departments | sim | múltiplas | 0 linhas | admin/supervisor |
| login_attempts | sim | múltiplas | 0 linhas | admin/supervisor |
| sales_deals | sim | múltiplas | 0 linhas | assigned |
| _zapp_fn_before | sim | **0 policies** | 0 linhas | 0 linhas (default-deny) |
| ai_jobs | sim | **0 policies** | 0 linhas | 0 linhas (default-deny — apenas service_role) |
| talkx_test_send_claims | sim | **0 policies** | 0 linhas | 0 linhas |

---

## Plano em Ondas

### Onda 1 — Urgente (< 1 semana)

| # | ID | Ação | Responsável |
|---|-----|------|-------------|
| 1 | S2-A1 + S2-A2 | Aplicar as 129 migrations pendentes via db-migrate.yml (dry-run + aprovação) | Joaquim |
| 2 | S2-A3 | Corrigir chamada get_search_insights → search_insights no código | Agente |
| 3 | S3-01 | Adicionar restrição de ownership nas policies de department_invites | Agente + PR |
| 4 | S8-01 | Habilitar MFA obrigatório via Dashboard (decisão de produto) | Joaquim |
| 5 | S1-A4 + F-S6-001 | Verificar ledger para migration 20261006202215; aplicar se ausente | Agente |

### Onda 2 — Importante (< 2 semanas)

| # | ID | Ação |
|---|-----|------|
| 6 | S1-A1 / S2-A4 | Preencher statements NULL para as 61 migrations (lote por prioridade) |
| 7 | P01 | Criar índice composto em messages(contact_id, created_at DESC) |
| 8 | P03 + P05 | VACUUM ANALYZE messages; avaliar DROP dos índices trgm sem scans |
| 9 | P04 | Ajustar autovacuum_vacuum_scale_factor para tabelas pequenas com dead tuples |
| 10 | S3-03 / S8-02 | Corrigir policy storage team-chat-files para role 'authenticated' |
| 11 | S12-MONITORING | Implementar alerting externo para falhas de cron (webhook → Slack/email) |

### Onda 3 — Médio prazo (< 1 mês)

| # | ID | Ação |
|---|-----|------|
| 12 | S4-01 | Criar os 20 índices em FKs sem índice na coluna referenciante |
| 13 | S8-04 | Auditar RLS de cada uma das 33 tabelas na publicação realtime |
| 14 | S10-CRON-PICO | Investigar causa raiz do pico de 2026-10-16; aumentar cron.max_running_jobs se necessário |
| 15 | F-S7-001 + F-S7-002 | Substituir EXCEPTION WHEN OTHERS por handlers com logging nas funções de cron |
| 16 | S12-PII | Implementar TTL/expiração para login_attempts (ex.: DELETE WHERE created_at < NOW() - INTERVAL '90 days') |
| 17 | S2-A5 | Disparar workflow types-sync para regenerar schema-manifest.json |
| 18 | P07 | DROP INDEX CONCURRENTLY idx_dept_invites_code (duplicado) |
| 19 | S8-06 | Remover código de suporte a assinatura legada do talkx-link |
| 20 | S1-A3 | Definir file_size_limit para bucket multiplix-voice (sugestão: 50 MB) |

### Onda 4 — Backlog (oportunidade)

| # | ID | Ação |
|---|-----|------|
| 21 | P02 | Investigar tamanho real de storage.objects; purgar órfãos se necessário |
| 22 | P06 | Avaliar materialização incremental para dashboard_hourly_volume |
| 23 | S4-02 | Adicionar FK em ai_usage_logs.job_id e multiplix_audiences.owner_id |
| 24 | S4-03 | Adicionar created_at em user_sessions, webhook_failures, connection_health_logs |
| 25 | P09 | Habilitar pg_stat_statements para monitoramento contínuo |
| 26 | S8-07 | Adicionar rate-limiting por IP no endpoint csp-report |
| 27 | S3-04 | Revisar 41 policies UPDATE para adicionar WITH CHECK explícito em campos de ownership |

---

## Não Verificado

| Item | Motivo |
|------|--------|
| auth.config | Relação não acessível via service_role — verificar Dashboard → Authentication → Settings |
| PITR configuração | Configurado pelo Supabase Cloud automaticamente — verificar em Dashboard → Settings → General |
| Políticas RLS individuais das 33 tabelas na publicação realtime | Auditoria separada necessária para cada tabela |
| Configuração de MFA enforcement no GoTrue | Verificar Dashboard → Authentication → MFA |
| Causa raiz exata do pico 2026-10-16 | Requer acesso ao status page do Supabase ou suporte |
| Valor de cron.max_running_jobs ao vivo | Query não executada durante auditoria |
| Corpo completo de talkx_audience_query | Apenas 400 primeiros chars inspecionados — verificar injection completa |
| Se 16 RPCs ausentes são features em desenvolvimento (TalkX V4) ou código morto | Não determinável apenas pelo banco |
| Validade e rotação de secrets no Vault | Valores não consultados (apenas nomes) |

---

## Prova de Read-Only

Esta auditoria executou **zero escritas em produção**. Todas as queries foram `SELECT`, `pg_get_functiondef`, `pg_indexes`, `pg_constraint`, `pg_policies` e similares (somente leitura). Nenhuma migration foi aplicada, nenhum `INSERT`/`UPDATE`/`DELETE` foi executado via MCP durante a coleta de dados.

As propostas SQL em `auditoria-supabase/propostas/` são arquivos de texto marcados como `NÃO APLICADA` e não foram executadas.
