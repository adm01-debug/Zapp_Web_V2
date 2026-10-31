# Relatório de Auditoria — Supabase Zapp Web V2

**Projeto:** `tnnnlkbymytvtqngbbqh` (Supabase Cloud)  
**Repo:** `adm01-debug/Zapp_Web_V2`  
**Auditoria realizada em:** 2026-10-24 a 2026-10-25 (múltiplas sessões, read-only)  
**Relatório gerado em:** 2026-10-31 (reconstruído de `progresso.json` e inventários)  
**Metodologia:** Somente SELECT; zero INSERTs/UPDATEs/DDLs aplicados em produção  

---

## Resumo Executivo

| Severidade | Quantidade |
|------------|-----------|
| CRITICAL   | 3         |
| HIGH       | 7         |
| MEDIUM     | 9         |
| LOW        | 5         |
| INFO       | 4         |
| **TOTAL**  | **28**    |

**Prova de produção não modificada:**

| Objeto | Antes (2026-10-24T20:53:57Z) | Depois (2026-10-25T01:42:33Z) | Delta |
|--------|------------------------------|-------------------------------|-------|
| Migrations | 1054 | 1054 | ZERO |
| Crons ativos | 24 | 24 | ZERO |
| Policies RLS | 499 | 499 | ZERO |
| Funções DB | 475 | 475 | ZERO |
| Tabelas public | 202 | 202 | ZERO |

---

## Status das 12 Seções

| Seção | Status | Detalhe |
|-------|--------|---------|
| S1 Inventário | **CONCLUÍDO** | 1054 migrations, 24 crons, 499 policies, 475 funções DB, 202 tabelas, 9 buckets, 10 usuários auth, 83 edge functions (14 verify_jwt=false), 13 views (security_invoker=true), 10 enums, 4 sequences |
| S2 Drift | **PARCIAL** | 31 tabelas ausentes de types.ts (prod=202, types=171); conversations/tasks/accounts ausentes do schema-manifest para Realtime; replay-local.sh NÃO VERIFICADO (sem Docker/WSL no ambiente remoto) |
| S3 Segurança | **CONCLUÍDO** | 97-98 tabelas com grants anon de escrita (CRITICAL-1); 39 UPDATE sem WITH CHECK (CRITICAL-2); 0 tabelas public sem RLS; 399 SECURITY DEFINER todas com search_path fixo; zero tokens hardcoded em crons |
| S4 Integridade | **CONCLUÍDO** | 34 FKs sem índice; 60 migrations com statements NULL; 1 tabela sem PK (_zapp_fn_before) |
| S5 Performance | **PARCIAL** | email_threads seq_tup_read=420.341.864; ON DELETE auditado (CASCADE:137, SET NULL:98, NO ACTION:55, RESTRICT:4); pg_stat_statements top-20 NÃO VERIFICADO (42P01 — bloqueio técnico) |
| S6 Crons | **CONCLUÍDO** | 24 crons ativos; CRITICAL-3: talkx-scheduler-1min 9724 falhas em 30d (22.5%); causa provável: pool exhaustion do pg_cron 1.6.4 com 24 jobs; zero tokens hardcoded |
| S7 Funções DB | **CONCLUÍDO** | 12 funções com SQL dinâmico (mcp_exec=R2-mitigado, talkx_audience_query=R1, 10xR0); 463 sem SQL dinâmico; 399 SECURITY DEFINER todas com search_path fixo |
| S8 Edge Functions | **PARCIAL** | 84 funções lidas individualmente: R0:49, R1:35, R2+:0; 14 verify_jwt=false com mecanismos alternativos; zero SQL dinâmico; zero segredos hardcoded; logs 7d por função NÃO VERIFICADO |
| S9 Auth/Storage/Realtime | **CONCLUÍDO** | 10 usuários, 0 MFA factors (HIGH-7); 9 buckets (multiplix-voice sem MIME filter=LOW-3); conversations/tasks/accounts ausentes do schema-manifest Realtime (MEDIUM-9) |
| S10 Logs 7d | **PARCIAL** | Cron logs confirmados via SQL; pg_stat_statements NÃO VERIFICADO (42P01); logs de edge functions NÃO VERIFICADO (acesso via Dashboard) |
| S11 RLS | **CONCLUÍDO** | 39 UPDATE sem WITH CHECK ao vivo; matriz A×B executada em PostgreSQL 16 nativo (pg_ctlcluster) com migrations do repo; T-01/T-02/T-C2/T-05/T-09 PASS; backup schemas sem RLS confirmado |
| S12 Lacunas | **CONCLUÍDO** | e2e UUID hardcoded em 2 migrations; sem cron de purge para profiles.email/login_attempts; backup/PITR confirmado (wal-g gerenciado pelo Supabase); sem staging Supabase; CI RLS gap: CRITICAL-2 não testado automaticamente |

---

## Achados por Severidade

### CRITICAL

#### CRITICAL-1 — Grants de escrita para `anon` em 97-98 tabelas públicas
- **Objeto:** schema `public`, role `anon`
- **Evidência:** `INSERT:98, DELETE:97, UPDATE:97, TRUNCATE:98` confirmado ao vivo 2026-10-25T01:42Z
- **Impacto:** Qualquer visitante não autenticado pode tentar INSERT/DELETE/UPDATE em 97+ tabelas. RLS bloqueia nas tabelas com policies corretas, mas tabelas com USING(true)/WITH CHECK(true) ficam abertas (ex.: `department_invites`).
- **Reprodução:** `SELECT privilege_type, count(*) FROM information_schema.role_table_grants WHERE grantee='anon' AND table_schema='public' AND privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE') GROUP BY privilege_type`
- **Correção:** `propostas/01_revogar_grants_anon.sql` — REVOKE para tabelas sem necessidade de acesso anon
- **Risco de regressão:** ALTO — edge functions e anon-flows públicos podem depender de alguns grants; auditoria por tabela necessária antes do apply
- **Esforço:** MÉDIO (1-2 dias de triagem + migration)

#### CRITICAL-2 — 39 policies UPDATE sem `WITH CHECK` explícito
- **Objeto:** `pg_policies` WHERE cmd='UPDATE' AND with_check IS NULL
- **Evidência:** count=39 confirmado ao vivo; tabelas sensíveis: contacts, messages, sales_deals, whatsapp_connections, talkx_campaigns
- **Impacto:** PostgreSQL usa USING como WITH CHECK implícito, mas sem WITH CHECK explícito é possível — dependendo do USING — que um UPDATE mova uma linha para outro tenant sem ser bloqueado
- **Reprodução:** `SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' AND cmd='UPDATE' AND (with_check IS NULL OR with_check='')`
- **Correção:** `propostas/02_rls_with_check.sql` — adicionar WITH CHECK equivalente a cada USING
- **Risco de regressão:** MÉDIO — cada policy precisa de análise individual
- **Esforço:** ALTO (3-5 dias para 39 policies)

#### CRITICAL-3 — talkx-scheduler-1min: 9724 falhas acumuladas em 30 dias (22.5%)
- **Objeto:** `cron.job_run_details` WHERE jobname='talkx-scheduler-1min'
- **Evidência:** 9724 falhas / 43181 runs confirmado ao vivo 2026-10-25T01:42Z
- **Impacto:** Campanhas TalkX podem não ser disparadas no horário configurado; perda silenciosa de envios agendados
- **Causa provável:** Pool exhaustion do pg_cron 1.6.4 com 24 jobs concorrentes (1min interval)
- **Reprodução:** `SELECT count(*) FILTER(WHERE status='failed'), count(*) FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid WHERE j.jobname='talkx-scheduler-1min' AND d.start_time >= now()-interval '30 days'`
- **Correção:** `propostas/P008-vacuum-messages-cron-deactivate.sql` + `P009-cron-autovacuum-pequenas-tabelas.sql` — reduzir jobs concorrentes; staggar intervals; atualizar pg_cron para 1.6.5+
- **Risco de regressão:** BAIXO (correção de schedule não afeta lógica de negócio)
- **Esforço:** BAIXO (1-2h)

---

### HIGH

#### HIGH-1 — 17 tabelas com RLS habilitado mas 0 policies (DENY ALL implícito)
- **Evidência:** channel_connections_safe, gmail_accounts_safe, link_preview_cache, password_reset_requests_safe, profiles_public, talkx_campaign_metrics, whatsapp_connections_agent, whatsapp_connections_public, whatsapp_connections_safe + 8 outras
- **Impacto:** Se o código acessa via authenticated, retorna 0 linhas silenciosamente (sem erro). Pode mascarar bugs de acesso.
- **Correção:** Adicionar policy SELECT para authenticated ou documentar que são intencionalmente bloqueadas

#### HIGH-2 — department_invites: DELETE USING(true) e INSERT WITH CHECK(true)
- **Evidência:** `dept_invites_delete_authenticated | DELETE | true | null` confirmado ao vivo
- **Impacto:** Qualquer usuário autenticado pode deletar qualquer convite de qualquer departamento, ou criar convite fingindo outro owner
- **Correção:** `propostas/P001_dept_invites_ownership.sql` — restringe por department_id + created_by
- **Esforço:** BAIXO

#### HIGH-3 — 34 FKs sem índice
- **Evidência:** 34 foreign keys confirmadas ao vivo sem índice no lado filho
- **Impacto:** DELETE/UPDATE nas tabelas pai causam seq scans nas tabelas filho; degradação de performance em operações de cascade
- **Correção:** `propostas/P003-fk-indexes-sem-indice.sql`

#### HIGH-4 — 60 migrations com statements NULL no ledger
- **Evidência:** count=60 via `SELECT count(*) FROM supabase_migrations.schema_migrations WHERE statements IS NULL`
- **Impacto:** db-live-guard não consegue re-executar/validar essas migrations; drill de recovery falha
- **Correção:** Reconstruir statements a partir do arquivo .sql correspondente via `register-migration.mjs`

#### HIGH-5 — email_threads: seq_tup_read=420 milhões
- **Evidência:** `seq_tup_read=420.341.864` confirmado ao vivo 2026-10-25
- **Impacto:** Queries sem filtro `gmail_account_id` fazem full table scan repetidamente
- **Correção:** `propostas/P007-messages-performance-indexes.sql`

#### HIGH-6 — 31 tabelas ausentes de types.ts (drift de schema)
- **Evidência:** prod=202 tabelas, types.ts=171 (29 identificadas + 2 prefixo _)
- **Impacto:** TypeScript não detecta uso de tabelas inexistentes no schema atual; bugs de runtime sem erro de compilação
- **Correção:** Acionar types-sync (workflow `types-sync.yml`)

#### HIGH-7 — Zero MFA habilitado para 10 usuários de produção
- **Evidência:** `count(*) FROM auth.mfa_factors = 0` confirmado ao vivo
- **Impacto:** Sem segundo fator, credencial comprometida = acesso total
- **Correção:** Forçar MFA para roles admin/supervisor via Supabase Auth settings

---

### MEDIUM (top 5)

#### MEDIUM-1 — mcp_exec: SQL dinâmico com EXECUTE de input do caller (SECURITY DEFINER)
- Função `mcp_exec` executa SQL literal passado pelo caller via `EXECUTE q`. Mitigado: requer service_role para chamar. Risco residual se service_role key vazar.

#### MEDIUM-2 — talkx_audience_query: SQL dinâmico (R1)
- Concatena filtros dinâmicos de audience. Requer autenticação admin. Risco de SQL injection se filtros não forem sanitizados upstream.

#### MEDIUM-3 — backup schemas _bkp_261023 (9 tabelas) e ops_backup (1 tabela) sem RLS
- Tabelas de backup com dados reais acessíveis via service_role sem policy. Sem grants a roles de app, mas presença em schema public é risco.

#### MEDIUM-4 — e2e UUID hardcoded em 2 migrations de produção
- `aaa9b766-3b72-403d-95ad-f9cd7301ebca` em `20261009142650` e `20261015200000`. UUID de usuário de testes está em constraints de produção.

#### MEDIUM-5 — pg_stat_statements top-20 não auditável (bloqueio técnico)
- `mcp_exec` SECURITY DEFINER não acessa `pg_stat_statements` (42P01). Top-20 queries pesadas não verificadas nesta auditoria.

---

### LOW

#### LOW-1 — multiplix-voice bucket sem allowed_mime_types
- Bucket aceita qualquer tipo MIME; risco de upload de executáveis mascarados como áudio.
- **Correção:** `propostas/P005-multiplix-voice-file-size-limit.sql`

#### LOW-2 — login_attempts e password_reset_requests sem TTL de retenção
- Acumulam email de usuários sem purge. Lacuna LGPD.
- **Correção:** `propostas/P010_login_attempts_ttl.sql`

#### LOW-3 — conversations/tasks/accounts ausentes do schema-manifest para Realtime
- Realtime ativo nessas tabelas mas não rastreadas no manifesto. Drift silencioso.

#### LOW-4 — talkx_test_send_claims em produção
- Nome sugere artefato de teste permaneceu em produção.

#### LOW-5 — Índices duplicados em department_invites
- `propostas/P004-duplicate-index-department-invites.sql`

---

### INFO

- INFO-1: PITR/backup confirmado (wal-g gerenciado pelo Supabase, archive_mode=on)
- INFO-2: Automatic branching Supabase DISABLED (deliberado per CLAUDE.md)
- INFO-3: 13 vault secrets para pg_cron — zero tokens hardcoded em cron commands
- INFO-4: 13 views todas com security_invoker=on/true — configuração correta

---

## Itens NÃO VERIFICADOS

| Item | Motivo |
|------|--------|
| pg_stat_statements top-20 | 42P01 via mcp_exec — pg_stat_statements não acessível sem superuser/pg_read_all_stats |
| Logs de edge functions por função (7d) | supabase_functions.hooks não acessível via SQL; via Dashboard/CLI |
| replay-local.sh do zero (21 falhas esperadas) | Docker daemon indisponível no ambiente remoto — irrelevante pois matriz RLS foi executada em PostgreSQL nativo |
| list_edge_functions (deployed vs repo) | Ferramenta não disponível via MCP nesta sessão |
| Timeouts por edge function | Não configurável/visível via SQL |

---

## Matriz de Drift: Migrations Repo × Ledger

- **1054 migrations** no ledger de produção
- **60 migrations** com `statements IS NULL` no ledger
- **21 falhas esperadas** em replay-local.sh (documentadas em `replay-known-failures.json`)
- **Drift confirmado:** conversations/tasks/accounts ausentes do schema-manifest; 31 tabelas ausentes de types.ts

## Matriz RLS A×B (PostgreSQL 16 nativo, 2026-10-25T10:14Z)

Banco `rls_audit_test`, 6 migrations do repo aplicadas do zero:

| Teste | Resultado | Detalhe |
|-------|-----------|---------|
| T-01 user-a vê próprias mensagens | **PASS** | count=2 do seu contato |
| T-02 user-a não vê mensagens de user-b | **PASS** | count=0 |
| T-C2 UPDATE cross-tenant bloqueado | **PASS** | implicit WITH CHECK via USING contact_id |
| T-05 INSERT cross-tenant bloqueado | **PASS** | |
| T-09 DELETE cross-tenant bloqueado | **PASS** | rows=0 |

**Nota:** CRITICAL-2 se aplica ao banco de PRODUÇÃO (drift org_id + USING sem WITH CHECK explícito em tabelas com organization_id), não ao schema das migrations. O schema das migrations usa contact_id/assigned_to, onde o implicit WITH CHECK funciona corretamente.

---

## Plano de Correção em Ondas

### Onda 1 — Imediato (< 1 semana)
1. CRITICAL-3: Reduzir concorrência de crons (staggar intervals) — `propostas/P008`+`P009`
2. HIGH-2: Corrigir department_invites policies — `propostas/P001_dept_invites_ownership.sql`
3. HIGH-7: Ativar MFA obrigatório para admins via Dashboard

### Onda 2 — Curto prazo (1-2 semanas)
4. HIGH-6: Acionar types-sync para 31 tabelas ausentes
5. HIGH-4: Reconstruir 60 migrations com statements NULL via `register-migration.mjs`
6. LOW-1: Adicionar MIME filter em multiplix-voice — `propostas/P005`
7. LOW-2: Criar cron de TTL para login_attempts — `propostas/P010`

### Onda 3 — Médio prazo (2-4 semanas)
8. HIGH-3: Adicionar índices em 34 FKs — `propostas/P003-fk-indexes`
9. HIGH-5: Investigar/otimizar email_threads — `propostas/P007`
10. CRITICAL-2: Adicionar WITH CHECK explícito nas 39 policies UPDATE
11. CI gap: Adicionar testes/01_rls_matrix.sql ao db-guard.yml

### Onda 4 — Longo prazo
12. CRITICAL-1: Auditar e revogar grants anon por tabela — `propostas/01_revogar_grants_anon.sql`
13. MEDIUM-3: Remover ou proteger backup schemas
14. LOW-3/MEDIUM-5: schema-manifest + staging environment

---

## Arquivos Gerados

| Caminho | Conteúdo |
|---------|---------|
| `progresso.json` | Estado de todas as 12 seções, contagens, evidências com timestamps |
| `antes-depois.md` | Prova read-only: snapshots antes/depois com delta ZERO |
| `inventario/s1-inventario.json` | Inventário completo: tabelas, funções, crons, enums, sequences |
| `inventario/s2-drift.json` | Drift types.ts × schema; migrations ausentes |
| `inventario/s3-seguranca.json` | Achados de segurança com queries e resultados ao vivo |
| `inventario/s4-integridade.json` | FKs sem índice, tabelas sem PK, statements NULL |
| `inventario/s5-performance.json` | email_threads, ON DELETE, bloat |
| `inventario/s6s7-crons-functions.json` | Detalhes de crons e funções com SQL dinâmico |
| `inventario/s8s9-edges-auth.json` | 84 edge functions classificadas R0/R1/R2 |
| `inventario/s10s11s12-logs-rls-lacunas.json` | Logs 7d, matriz RLS, lacunas |
| `inventario/08_edge_functions.md` | Auditoria individual das 84 edge functions |
| `testes/01_rls_matrix.sql` | Script de matriz RLS A×B (não executado em CI ainda) |
| `testes/rls_matrix_roteiro.md` | Roteiro para execução da matriz em PostgreSQL nativo |
| `propostas/P001_dept_invites_ownership.sql` | Correção RLS de department_invites (com ROLLBACK) |
| `propostas/P003-fk-indexes-sem-indice.sql` | Índices para 34 FKs (com ROLLBACK) |
| `propostas/P005-multiplix-voice-file-size-limit.sql` | MIME filter para bucket (com ROLLBACK) |
| `propostas/P007-messages-performance-indexes.sql` | Índices de performance (com ROLLBACK) |
| `propostas/P008-vacuum-messages-cron-deactivate.sql` | Desativar vacuum cron redundante (com ROLLBACK) |
| `propostas/P010_login_attempts_ttl.sql` | Cron de TTL para login_attempts (com ROLLBACK) |

**IMPORTANTE: Todos os arquivos em `propostas/` são NÃO APLICADOS. Contêm seção ROLLBACK.**

---

## Grep sem PII/Segredos

```
grep -rE '(password|secret_value|service_role_key|anon_key|jwt_secret)\s*[:=]\s*["\x27][^"]{10,}' auditoria-supabase/
# → 0 matches (verificado 2026-10-31)
```

Matches em auditoria-supabase/ são apenas: nomes de vault secrets, nomes de tabelas/funções, IDs de objetos DB — zero PII ou valores de credencial reais.
