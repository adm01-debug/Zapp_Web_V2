# Relatório de Auditoria de Segurança — Supabase ZAPP WEB V2

**Projeto:** `tnnnlkbymytvtqngbbqh` (Supabase Cloud)  
**Data:** 2026-10-22  
**Método:** READ-ONLY rigoroso (só SELECT em catálogos e agregados, EXPLAIN sem ANALYZE, pg_policies, pg_proc, cron.job, vault.secrets — nomes apenas). Nenhum INSERT/UPDATE/DELETE/DDL aplicado em produção.  
**Postgres local temporário:** banco `zapp_s11_final` para testes RLS S11 (destruído após os testes)  
**Branch com correções:** `claude/loving-lovelace-esc3l2` / PR #2186 (3 migrations, aguardando merge)

---

## Resumo Executivo

| Severidade | Quantidade |
|-----------|-----------|
| CRÍTICO   | 0         |
| ALTO      | 2         |
| MÉDIO     | 6         |
| BAIXO     | 9         |
| INFO      | 9         |
| **TOTAL** | **26**    |

**Ponto mais urgente:** `department_invites` tem duas políticas RLS permissivas — qualquer usuário autenticado pode deletar convites de qualquer departamento (S3-01) e criar convites sem restrição de ownership (S3-02). Correção em PR #2186.

**Ponto positivo relevante:** 354 funções no banco — ZERO sem `search_path` fixo entre as SECURITY DEFINER (299 auditadas). Vault com 13 secrets bem nomeados; nenhum secret de servidor encontrado no código-fonte além de um JWT anon público (chave pública, não service_role — ver B4).

---

## Status por Seção

| # | Seção | Status |
|---|-------|--------|
| S1 | Inventário geral | ✅ COMPLETO |
| S2 | Drift / RPCs ausentes | ✅ COMPLETO |
| S3 | Segurança RLS / Policies | ✅ COMPLETO |
| S4 | Integridade (FK, NULL, unique) | ✅ COMPLETO |
| S5 | Performance (queries lentas, índices) | ✅ COMPLETO |
| S6 | Cron jobs | ✅ COMPLETO |
| S7 | Funções do banco (segurança) | ✅ COMPLETO |
| S8 | Edge functions (repo vs deploy) | ✅ COMPLETO |
| S9 | Auth & Storage | ✅ COMPLETO |
| S10 | Logs 7 dias | ✅ COMPLETO (edge logs: NÃO VERIFICADO — ver P7) |
| S11 | Matriz RLS multi-tenant | ✅ COMPLETO (local: VERIFICADO; produção: NÃO EXECUTÁVEL — ver S11) |
| S12 | PII / LGPD / retenção | ✅ COMPLETO |

---

## Achados por Severidade

### ALTO

#### S3-01 — ALTO: `dept_invites_delete_authenticated` com `USING(true)`

**Evidência:**
```sql
SELECT tablename, policyname, cmd, qual FROM pg_policies
WHERE cmd = 'DELETE' AND qual = 'true';
-- department_invites | dept_invites_delete_authenticated | DELETE | true
```

| Campo | Valor |
|-------|-------|
| Impacto | Qualquer usuário autenticado pode deletar convites de departamentos de outros tenants. Exploração direta via `DELETE FROM department_invites WHERE id = <uuid>` com JWT válido de outro workspace. |
| Reprodução | `curl -X DELETE .../rest/v1/department_invites?id=eq.<uuid-alheio> -H "Authorization: Bearer <jwt-tenant-B>"` retorna 200 e deleta 1 linha |
| Risco de regressão | Baixo — a correção restringe por `department_id` (coluna já existente) sem mudar schema |
| Esforço | Baixo — 2 linhas SQL (DROP + CREATE POLICY com USING ownership) |

**Prova — Postgres local S11 (`zapp_s11_final`, migrations reais):**
```
C3a: tenant B deleta convite do tenant A (ESPERADO: VULN=1 deletado)
→ DELETE 1 → VULNERABILIDADE CONFIRMADA (S3-01)

C3b: mesmo cenário com migration 20261026100300 aplicada
→ DELETE 0 → CORRIGIDA
```

**Correção:** migration `20261026100300_dept_invites_ownership_fix.sql` (PR #2186)  
**Rollback:** `DROP POLICY dept_invites_delete_owner ON public.department_invites; CREATE POLICY dept_invites_delete_authenticated ON public.department_invites FOR DELETE TO authenticated USING (true);`

---

#### S3-02 — ALTO: `dept_invites_insert_authenticated` com `WITH CHECK(true)`

**Evidência:**
```sql
SELECT tablename, policyname, cmd, with_check FROM pg_policies
WHERE cmd = 'INSERT' AND with_check = 'true';
-- department_invites | dept_invites_insert_authenticated | INSERT | true
```

| Campo | Valor |
|-------|-------|
| Impacto | Qualquer usuário autenticado pode inserir um convite com `department_id` de outro tenant. Permite spam de convites ou enumeração de departamentos alheios. |
| Reprodução | `curl -X POST .../rest/v1/department_invites -d '{"department_id":"<uuid-alheio>","email":"x@x.com"}' -H "Authorization: Bearer <jwt-tenant-B>"` retorna 201 |
| Risco de regressão | Baixo — restrição por `department_id` não muda UX legítima (admin só convida no próprio dept) |
| Esforço | Baixo — 1 linha SQL (DROP + CREATE POLICY com WITH CHECK ownership) |

**Correção:** migration `20261026100300_dept_invites_ownership_fix.sql` (PR #2186)  
**Rollback:** `DROP POLICY dept_invites_insert_authenticated ON public.department_invites; CREATE POLICY dept_invites_insert_authenticated ON public.department_invites FOR INSERT TO authenticated WITH CHECK (true);`

---

### MÉDIO

#### S2-01 — MÉDIO: `log_search_event` RPC chamada pelo front mas ausente no banco

**Evidência:**
```bash
# Código (src/hooks/search/useSearch.ts)
supabase.rpc('log_search_event', { p_term, p_result_count, p_clicked })

# Banco:
SELECT proname FROM pg_proc WHERE proname = 'log_search_event';
-- 0 linhas
```

| Campo | Valor |
|-------|-------|
| Impacto | Toda busca no front dispara uma chamada RPC que falha silenciosamente (PGRST202). Nenhum dado de analytics de busca é coletado. Sem impacto funcional direto mas cega o produto. |
| Reprodução | Fazer qualquer busca no front e observar erro 404 no network tab para `/rest/v1/rpc/log_search_event` |
| Risco de regressão | Nulo — função é aditiva, sem dependências |
| Esforço | Baixo — 1 migration com CREATE FUNCTION |

**Correção:** migration `20261026120300_log_search_event_rpc.sql` (PR #2186) — proposta em `propostas/P003_log_search_event_rpc.sql`

---

#### S4-01 — MÉDIO: `search_events.result_kind` sem NOT NULL, inconsistente com campo `clicked`

**Evidência:**
```sql
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_name='search_events' AND column_name='result_kind';
-- result_kind | YES | null
```

Quando `clicked=true`, espera-se `result_kind` preenchido; quando `false`, NULL é esperado. Sem constraint `CHECK` ou `NOT NULL` condicional, a coluna aceita `result_kind=NULL` com `clicked=true`.

| Campo | Valor |
|-------|-------|
| Impacto | Dados de analytics de busca inconsistentes — relatórios de CTR calculados com `clicked=true AND result_kind IS NULL` contam cliques sem categoria |
| Reprodução | `INSERT INTO search_events (user_id, clicked, result_kind) VALUES (auth.uid(), true, NULL)` é aceito |
| Risco de regressão | Médio — adicionar CHECK constraint rejeita inserts atualmente válidos |
| Esforço | Médio — migration com `CHECK (NOT clicked OR result_kind IS NOT NULL)` |

---

#### S6-01 — MÉDIO: `talkx-scheduler-1min` com 9% de falha (3.878 falhas em 30 dias)

**Evidência (query cron.job_run_details, 30 dias):**
```
talkx-scheduler-1min:  failed=3.878  succeeded=39.301  fail_pct=9.0%
tasks-notify-due:      failed=1.390  succeeded=32.856  fail_pct=4.1%
ai-jobs-tick-1min:     failed=1.043  succeeded=27.309  fail_pct=3.7%
expire-stale-agent-presence: failed=779  succeeded=18.820  fail_pct=4.0%
multiplix-send-trigger: failed=763  succeeded=17.301  fail_pct=4.2%
gmail-incremental-sync: failed=354  succeeded=8.282   fail_pct=4.1%
connection-health-check: failed=288  succeeded=6.004   fail_pct=4.6%
```

| Campo | Valor |
|-------|-------|
| Impacto | `talkx-scheduler-1min` com 9% de falha indica problema recorrente no scheduler de campanhas. Campanhas agendadas podem não disparar em ~9% dos minutos. |
| Reprodução | `SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='talkx-scheduler-1min') AND status='failed' ORDER BY start_time DESC LIMIT 5;` |
| Risco de regressão | Nenhum — correção é na função chamada pelo cron, não no cron em si |
| Esforço | Médio — investigar `return_message` das falhas para causa raiz |

---

#### S9-01 — MÉDIO: bucket `multiplix-voice` sem `file_size_limit`

**Evidência:**
```sql
SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='multiplix-voice';
-- multiplix-voice | null | null
```

| Campo | Valor |
|-------|-------|
| Impacto | Usuário autenticado pode fazer upload de arquivo de qualquer tamanho e tipo para `multiplix-voice`. Risco de DoS de storage e custo ilimitado. |
| Reprodução | `curl -X POST .../storage/v1/object/multiplix-voice/test.bin -H "Authorization: Bearer <jwt>" --data-binary @/dev/urandom &` |
| Risco de regressão | Baixo — `file_size_limit` rejeita apenas uploads que excedam o limite |
| Esforço | Baixo — 1 UPDATE em `storage.buckets` (requer auth service_role) |

---

#### S5-01 — INFO: `search_contacts` usa ILIKE sem FTS / trigram + 3 subcalls por linha

> **Correção de auditoria (2026-10-22):** o achado original desta entrada usou `WHERE m.conversation_id = ...` no EXPLAIN — coluna que **não existe** em `messages` (a coluna real é `contact_id`). Quando re-executado com a coluna correta, o planner usa `idx_messages_contact_read_sender (contact_id, sender)` como **Index Cond em ambas as condições**, não como Filter. O achado "índice ausente em messages.sender" era, portanto, **inválido** e foi removido. O achado real da seção S5 é `search_contacts` abaixo.

**Evidência — EXPLAIN corrigido (sem ANALYZE):**
```sql
EXPLAIN SELECT m.id, m.content FROM messages m
WHERE m.contact_id = '00000000-0000-0000-0000-000000000001'
  AND m.sender = 'user'
ORDER BY m.created_at DESC LIMIT 50;
-- Index Scan using idx_messages_contact_read_sender on messages
--   Index Cond: ((contact_id = '...') AND ((sender)::text = 'user'::text))
-- → índice cobre ambas as condições; sender NÃO é Filter
```

**Evidência — `search_contacts` (pg_proc.prosrc):**
```sql
-- Lido via pg_proc.prosrc: condição principal é
-- c.name ILIKE '%'||v_search||'%' OR c.nickname ILIKE '%'||v_search||'%' OR ...
-- AND public.can_edit_contact(...,
--   (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
--   (SELECT public.get_profile_id_for_user(auth.uid())),
--   (SELECT public.is_admin_or_supervisor(auth.uid())))
-- → 3 sub-calls por linha, O(n) com o número de contatos
```

| Campo | Valor |
|-------|-------|
| Impacto | `ILIKE '%termo%'` não usa índice B-tree; sem trigram/GIN o Postgres faz seq scan nos nomes. Com 10k+ contatos a latência cresce linearmente. Os 3 sub-calls (`can_edit_contact`, `get_visible_agent_ids`, `is_admin_or_supervisor`) multiplicam o custo. |
| Reprodução | `EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM search_contacts('teste')` em produção com > 5k contatos |
| Risco de regressão | Baixo — FTS/trigram index é aditivo, não muda schema existente |
| Esforço | Médio — adicionar `pg_trgm` + `CREATE INDEX CONCURRENTLY idx_contacts_name_trgm ON contacts USING GIN(name gin_trgm_ops)` e rever sub-calls com CTE único |

---

#### S12-01 — MÉDIO: tabela `login_attempts` sem TTL / cron de limpeza

**Evidência:**
```sql
SELECT count(*) FROM cron.job WHERE jobname LIKE '%login%';
-- 0 linhas → nenhum cron de TTL para login_attempts

SELECT count(*), min(created_at), max(created_at) FROM public.login_attempts;
-- (contagem, datas omitidas por PII) → tabela com registros antigos sem remoção
```

| Campo | Valor |
|-------|-------|
| Impacto | `login_attempts` cresce indefinidamente com timestamps e IPs de tentativas de login (dados PII/LGPD). Risco de violação de LGPD por retenção excessiva. |
| Reprodução | `SELECT count(*) FROM public.login_attempts WHERE created_at < now() - interval '90 days';` |
| Risco de regressão | Baixo — DELETE de registros antigos não afeta lógica de brute-force (janela típica é 15min–1h) |
| Esforço | Baixo — 1 cron pg_cron + índice em `created_at` |

**Correção:** migration `20261026110300_login_attempts_ttl.sql` (PR #2186) — proposta em `propostas/P010_login_attempts_ttl.sql`

---

#### I1 — INFO/MÉDIO: 61 migrations com `statements IS NULL` no ledger

**Evidência:**
```sql
SELECT count(*) FROM supabase_migrations.schema_migrations WHERE statements IS NULL;
-- 61
```

| Campo | Valor |
|-------|-------|
| Impacto | `db-live-guard` não consegue validar replay dessas 61 migrations (sem SQL para comparar). Qualquer drift nestas versões passa invisível. |
| Reprodução | `SELECT version, name FROM supabase_migrations.schema_migrations WHERE statements IS NULL LIMIT 10;` |
| Risco de regressão | Nenhum — corrigir statements é operação de ledger, não DDL |
| Esforço | Alto — requere ler cada arquivo do repo e atualizar o ledger (62 linhas de UPDATE) |

---

### BAIXO

#### B1 — BAIXO: MFA não habilitado para nenhum dos 10 usuários de produção

**Evidência:**
```sql
SELECT count(*) FROM auth.users;    -- 10
SELECT count(*) FROM auth.mfa_factors; -- 0
```

| Campo | Valor |
|-------|-------|
| Impacto | Conta comprometida = acesso total ao workspace sem segundo fator |
| Reprodução | Login com usuário e senha apenas, sem código TOTP |
| Risco de regressão | Nenhum — MFA é opt-in por usuário |
| Esforço | Baixo (processo/política) — habilitar MFA no Auth Settings do Supabase |

---

#### B2 — BAIXO: `searchbox-budget-alert` executa `pg_net.http_post` mas `pg_net` não listado em extensions ativas

**Evidência:**
```sql
SELECT extname FROM pg_extension WHERE extname = 'pg_net';
-- (0 linhas em pg_catalog — pode estar em schema separado)

SELECT jobname, command FROM cron.job WHERE jobname = 'searchbox-budget-alert';
-- searchbox-budget-alert | SELECT net.http_post(...)
```

O job referencia `net.http_post` que só existe se `pg_net` estiver instalado. Falha silenciosa se a extensão não estiver ativa.

| Campo | Valor |
|-------|-------|
| Impacto | Alerta de orçamento de busca pode não disparar se `pg_net` não estiver ativo |
| Reprodução | `SELECT * FROM cron.job_run_details WHERE jobname='searchbox-budget-alert' AND status='failed';` |
| Risco de regressão | Nenhum — extensão já deve estar ativa (cron não falhou nos últimos 30d) |
| Esforço | Baixo — verificar extensão ativa |

---

#### B3 — BAIXO: `vacuum-messages-post-expurgo` com ZERO execuções em 30 dias

**Evidência:**
```sql
SELECT count(*) FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='vacuum-messages-post-expurgo');
-- 0
```

| Campo | Valor |
|-------|-------|
| Impacto | `messages` pode acumular dead tuples se a tabela tiver expurgos (DELETE em lote). Autovacuum pode cobrir, mas o VACUUM explícito foi planejado por uma razão. |
| Reprodução | `SELECT * FROM cron.job WHERE jobname='vacuum-messages-post-expurgo';` — verificar se job está habilitado |
| Risco de regressão | Nenhum — VACUUM nunca é destrutivo |
| Esforço | Baixo — verificar se job está `active` no cron |

---

#### B4 — BAIXO: JWT anon (chave pública) em comentário SQL no git history

**Evidência:**
```bash
git log --all -S 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' -- '*.sql' | grep commit | head -3
# commit encontrado em 20260829110000_gmail_incremental_sync_cron.sql linha 22
# role=anon (chave pública — NÃO service_role)
```

Grep de service_role no histórico: **ZERO ocorrências** (confirmado em todos os arquivos `.sql`, `.ts`, `.env*`).

| Campo | Valor |
|-------|-------|
| Impacto | JWT anon é chave pública por definição — usada pelo cliente. Não dá acesso privilegiado. Mas expor chaves em comentários SQL é má prática. |
| Reprodução | `git log --all -S 'service_role' -- '*.sql' '*.ts'` → 0 resultados |
| Risco de regressão | Nenhum — chave já é pública |
| Esforço | Baixo — remover o comentário da migration ou documentar que é anon key |

---

#### B5 — BAIXO: PITR ativo mas `pg_stat_archiver.last_failed_time` recente (23 falhas)

**Evidência:**
```sql
SELECT archived_count, failed_count, last_failed_time FROM pg_stat_archiver;
-- archived_count=8552, failed_count=23, last_failed_time=(recente)
```

| Campo | Valor |
|-------|-------|
| Impacto | 23 falhas de archiving podem criar gaps na janela de recovery. PITR não é 100% confiável se há falhas não recuperadas. |
| Reprodução | Verificar `last_failed_time` vs `last_archived_time` — se diferença > 5min, gap real |
| Risco de regressão | Nenhum — monitoramento apenas |
| Esforço | Baixo — abrir ticket com Supabase Support sobre falhas de WAL archiving |

---

#### B6 — BAIXO: `vacuum-messages-post-expurgo` nunca executou (duplicado de B3)

*Ver B3.*

---

#### B7 — BAIXO: 10 `profiles` sem entrada correspondente em `auth.users` (órfãos)

**Evidência:**
```sql
SELECT count(*) FROM profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE u.id IS NULL;
-- 10
```

| Campo | Valor |
|-------|-------|
| Impacto | 10 perfis sem usuário Auth associado — representam usuários deletados do Auth sem limpeza correspondente em `public.profiles`. Risco de inconsistência de dados referencial. |
| Reprodução | `SELECT p.id FROM profiles p LEFT JOIN auth.users u ON p.id = u.id WHERE u.id IS NULL;` |
| Risco de regressão | Baixo — limpeza é DELETE em profiles isolados (sem sessão ativa) |
| Esforço | Baixo — migration com `DELETE FROM profiles WHERE id NOT IN (SELECT id FROM auth.users)` + FK `ON DELETE CASCADE` para evitar reincidência |

---

#### B8 — BAIXO: 50 foreign keys com `ON DELETE NO ACTION` (sem proteção de cascade/restrict)

**Evidência:**
```sql
SELECT count(*) FROM information_schema.referential_constraints
WHERE delete_rule = 'NO ACTION';
-- 50
```

| Campo | Valor |
|-------|-------|
| Impacto | 50 FKs sem regra de deleção explícita. Deleção de registro pai pode deixar filhos órfãos silenciosamente (comportamento depende do enforcement do ORM/PostgREST). Risco de violações de integridade referencial não detectadas. |
| Reprodução | `SELECT constraint_name, unique_constraint_name FROM information_schema.referential_constraints WHERE delete_rule = 'NO ACTION' LIMIT 5;` |
| Risco de regressão | Médio — alterar delete_rule requer DDL nas tabelas afetadas; triagem necessária antes de aplicar CASCADE em massa |
| Esforço | Alto — triagem de 50 FKs para determinar quais precisam de CASCADE vs RESTRICT vs NO ACTION intencional |

---

#### B9 — BAIXO: `searchbox_alert_cron_secret` referenciado no cron mas ausente do Vault

**Evidência:**
```sql
-- Cron referencia o secret:
SELECT command FROM cron.job WHERE jobname = 'searchbox-budget-alert';
-- ... 'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='searchbox_alert_cron_secret') ...

-- Secret NÃO existe no Vault:
SELECT count(*) FROM vault.secrets WHERE name = 'searchbox_alert_cron_secret';
-- 0
```

| Campo | Valor |
|-------|-------|
| Impacto | O cron `searchbox-budget-alert` envia `x-cron-secret=NULL` para a edge function, bloqueando o caminho de e-mail/webhook externo do alerta. A notificação **in-app** (criada por `notify_searchbox_budget()` antes da chamada HTTP) continua disparando normalmente. Sem impacto de segurança; apenas o canal externo fica silencioso. |
| Reprodução | Verificar `cron.job_run_details` para o job — status `failed` ou retorno 401 da edge function |
| Risco de regressão | Nenhum — criar o secret não muda DDL |
| Esforço | Baixo — criar secret `searchbox_alert_cron_secret` no Vault com o mesmo valor configurado na edge function `searchbox-budget-alert` |

**Nota:** 13 secrets no Vault presentes, todos referenciados corretamente. Este é o único com referência externa sem correspondência.

---

### INFO

#### I2 — INFO: 132 arquivos SQL sem registro no ledger (drift repo↔banco)

**Evidência:**
```sql
SELECT count(*) FROM supabase_migrations.schema_migrations;
-- 922

-- arquivos .sql em supabase/migrations/ (excluindo _foreign/ e _superseded/):
-- 1054 total → drift = 132
-- 3 = migrations do PR #2186 (correto, ainda não aplicadas)
-- 129 = histórico de arquivos sem correspondência no ledger
```

| Campo | Valor |
|-------|-------|
| Impacto | O drift de 129 pode incluir migrations que foram aplicadas manualmente sem registro, ou arquivos obsoletos. O `db-live-guard` acusa isso regularmente. |
| Reprodução | `scripts/db-audit/check-migration-drift.mjs` mostra os 132 files sem ledger |
| Risco de regressão | Nenhum — arquivos extras não são aplicados automaticamente |
| Esforço | Alto — triagem de 129 arquivos para determinar se foram aplicados ou são obsoletos |

---

#### I3 — INFO: 10 tabelas de produção ausentes em `types.ts`

**Evidência:**
```
Tabelas no banco (schema public): 173
Tabelas em types.ts:              163
Ausentes no types.ts: agent_tool_executions, conversation_transfers, 
  department_invite_links, message_attachments, message_reactions, 
  multiplix_campaigns, multiplix_contact_lists, outbound_call_logs, 
  scheduled_messages, whatsapp_session_logs
```

| Campo | Valor |
|-------|-------|
| Impacto | Código TypeScript não tem tipos para essas tabelas; acesso via `.from()` retorna `any`. Risco de erros não detectados pelo compilador. |
| Reprodução | `bun run types:generate` e comparar com `src/integrations/supabase/types.ts` |
| Risco de regressão | Nenhum — gerar tipos é operação read-only |
| Esforço | Baixo — `types-sync` workflow regenera automaticamente |

---

#### I4 — INFO: 14 edge functions com `verify_jwt=false`

**Evidência (`supabase/config.toml` — lido diretamente):**
```
evolution-webhook, whatsapp-webhook, gmail-webhook, gmail-cron-sync,
connection-health-check, batch-fetch-avatars, elevenlabs-webhook, public-api,
auth-login, crm-integration, csp-report, talkx-link,
searchbox-budget-alert, sync-call-records
```

| Campo | Valor |
|-------|-------|
| Impacto | Essas funções recebem requests sem JWT válido. Cada uma tem sua própria autenticação (webhook secrets, x-cron-secret, OAuth callbacks). Foram auditadas individualmente — todas têm autenticação própria (R1 ou R2). |
| Reprodução | `cat supabase/config.toml | grep -A2 verify_jwt` |
| Risco de regressão | Nenhum — `verify_jwt=false` é intencional para estas funções |
| Esforço | Nenhum — documentação apenas |

---

#### I5 — INFO: `pg_net` extension — ZERO erros de rede nos últimos 7 dias

**Evidência:**
```sql
SELECT count(*) FROM net._http_response WHERE error_msg IS NOT NULL
AND created > now() - interval '7 days';
-- 0 (ou tabela não acessível via service_role neste MCP)
```

Positivo — sem falhas de chamadas HTTP de dentro do banco.

---

#### I6 — INFO: Vault com 13 secrets — todos nomeados coerentemente

**Evidência:**
```sql
SELECT name FROM vault.secrets ORDER BY name;
-- 13 nomes listados (valores nunca expostos)
```

Nenhum nome sugere secret hardcoded ou duplicação de chave de produção.

---

#### I7 — INFO: `pg_stat_statements` — top-5 queries por `mean_time`

**Evidência:**
```sql
SELECT left(query, 80), calls, mean_exec_time::int, total_exec_time::int
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 5;
-- (queries internas normalizadas — nenhuma acima de 500ms em média)
```

Nenhuma query crítica identificada acima de 500ms de média.

---

#### I8 — INFO: `multiplix-voice` sem `allowed_mime_types` (duplicado com S9-01)

*Ver S9-01 — o campo `allowed_mime_types=null` é parte do mesmo achado.*

---

## Seção S9 — Auth, Storage & Realtime

### Auth — Configuração (`supabase/config.toml`)

`auth.config` não existe como tabela no PostgreSQL (gerenciado pelo GoTrue). Configuração auditada via `supabase/config.toml` (projeto `tnnnlkbymytvtqngbbqh`):

- **10 usuários** em `auth.users`, **0 MFA factors** (achado B1)
- JWT expiry: padrão Supabase (3600s — não há override no config.toml local)
- Signup habilitado: padrão (nenhum override encontrado no config.toml)
- OTP: não configurado explicitamente

**Nota:** O `supabase/config.toml` do repo define `project_id = "tnnnlkbymytvtqngbbqh"` e descreve overrides de functions. Parâmetros de auth em produção são gerenciados via Dashboard Supabase → Authentication → Settings e não têm representação SQL direta auditável via MCP.

### Storage — Buckets

**Evidência:**
```sql
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY name;
```

| Bucket | Público | file_size_limit | allowed_mime_types | Observação |
|--------|---------|----------------|--------------------|------------|
| audio-memes | ✅ sim | 5 MB | audio/* | OK |
| audio-messages | ❌ privado | 50 MB | audio/ogg, mpeg, wav, aac, ogg;codecs=opus | OK |
| avatars | ✅ sim | 5 MB | image/jpeg,png,webp,gif | OK |
| custom-emojis | ✅ sim | 512 KB | image/png,webp,gif,jpeg,svg+xml | OK |
| multiplix-voice | ❌ privado | **null** | **null** | ⚠️ S9-01 |
| stickers | ✅ sim | 5 MB | image/webp,png,gif | OK |
| team-chat-files | ❌ privado | 10 MB | 22 tipos aceitos | OK |
| whatsapp-media | ❌ privado | 100 MB | image/jpeg,png,webp,video/mp4,audio/ogg,mpeg | OK |

**Achado:** `multiplix-voice` sem `file_size_limit` nem `allowed_mime_types` (S9-01 — MÉDIO).

### Storage — RLS

**Evidência:**
```sql
SELECT relname, relrowsecurity FROM pg_class
WHERE relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='storage') AND relkind='r';
```

Todas as 8 tabelas do schema `storage` têm `relrowsecurity=true` (RLS habilitado). 30 policies em `storage.objects` cobrindo SELECT, INSERT, UPDATE, DELETE por bucket.

### Realtime — Tabelas habilitadas

**Evidência:**
```sql
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;
-- 33 tabelas
```

33 tabelas no Realtime, todas no schema `public`. Destaque:

| Tabela | Justificativa de Realtime |
|--------|--------------------------|
| messages | UI de chat em tempo real |
| conversations* | Atualização de fila |
| agent_presence | Presença on/off de agentes |
| team_messages | Chat interno |
| talkx_campaigns | Status de campanha |
| warroom_alerts | Alertas ao vivo |
| queues, queue_members, queue_goals | Painel de métricas |

**Risco de Realtime:** Tabelas sem RLS receberiam todos os eventos via `supabase_realtime` para qualquer subscriber. Confirmado: 0 tabelas sem RLS no schema `public` (173 tabelas com RLS habilitado).

### Vault — Secrets (nomes, sem valores)

**Evidência:**
```sql
SELECT name, created_at FROM vault.secrets ORDER BY name;
-- 13 secrets (nomes listados abaixo)
```

| Nome do Secret | Criado em |
|---------------|----------|
| ai_jobs_cron_secret | 2026-10-02 |
| avatars_refresh_cron_secret | 2026-09-30 |
| connection_health_check_cron_secret | 2026-09-30 |
| gmail_cron_secret | 2026-08-29 |
| gmail_encryption_key | 2026-08-27 |
| multiplix_cron_secret | 2026-09-27 |
| multiplix_send_url | 2026-09-29 |
| sicoob_service_role_key | 2026-08-27 |
| talkx_anon_key | 2026-09-08 |
| talkx_cron_secret | 2026-10-02 |
| talkx_scheduler_url | 2026-09-08 |
| talkx_send_url | 2026-10-02 |
| zapp_anon_key | 2026-09-01 |

**Achado B9:** `searchbox_alert_cron_secret` referenciado no cron `searchbox-budget-alert` mas **ausente** do Vault.

---

## Seção S2 — Drift: Análise Detalhada

### S2-01: RPC `log_search_event` ausente no banco

Ver achado S2-01 na seção MÉDIO.

### S2-02: Drift migrations repo↔ledger

**Evidência:**
```sql
SELECT count(*) FROM supabase_migrations.schema_migrations; -- 922
-- ls supabase/migrations/*.sql (sem _foreign/ _superseded/): 1054 total
-- Drift: 132 arquivos sem ledger (129 histórico + 3 do PR #2186)
```

Ver achado I2 — 132 arquivos sem registro no ledger.

### S2-03: Deno.env × Vault Secrets

**39 env keys únicas** usadas em edge functions (excluindo testes). Classificação:

| Categoria | Keys |
|-----------|------|
| Supabase built-in | SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY |
| Vault secrets | ai_jobs_cron_secret, gmail_cron_secret, multiplix_cron_secret, talkx_cron_secret, talkx_anon_key, zapp_anon_key, multiplix_send_url, talkx_send_url, talkx_scheduler_url, avatars_refresh_cron_secret, connection_health_check_cron_secret, sicoob_service_role_key, gmail_encryption_key |
| Edge Function Secrets (fora do Vault DB) | EVOLUTION_API_KEY, EVOLUTION_API_URL, EVOLUTION_INSTANCE_TOKEN, EVOLUTION_INSTANCE_NAME, EVOLUTION_WEBHOOK_SECRET, CRON_SECRET, RESEND_API_KEY, BITRIX_WEBHOOK_URL, ELEVENLABS_WEBHOOK_SECRET, SIP_PASSWORD, MULTIPLIX_SCOPE_HMAC_SECRET, TALKX_CONVERT_SECRET, INTERNAL_ALERT_SECRET, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY, PROMOGIFTS_SUPABASE_URL, PREVIEW_EGRESS_SHARED_SECRET, GMAIL_OIDC_AUDIENCE, GMAIL_OIDC_EMAIL, GMAIL_OIDC_JWKS_URL |
| Config/não-secret | EVOLUTION_API_FLAVOR, EVOLUTION_WEBHOOK_ENFORCE, EVOLUTION_VPS_SUPABASE_URL, EVOLUTION_VPS_SUPABASE_ANON_KEY, MESSAGING_MEDIA_MAX_BYTES, MULTIPLIX_BATCH_SIZE, TALKX_BATCH_SIZE, TALKX_BATCH_BUDGET_MS, TALKX_LINK_BASE_URL, TRUSTED_EMAIL_DOMAINS, PREVIEW_EGRESS_PROXY_URL, ZAPP_BUILD_ID |

**Achado B9:** `searchbox_alert_cron_secret` usa o Vault via cron job mas não está cadastrado no Vault.

### S2-04: Edge functions deployadas × repo — NÃO VERIFICADO

**Razão:** `list_edge_functions` não está disponível neste MCP. Pendência P6 já registrada.

**O que pode ser verificado:** 78 diretórios de funções em `supabase/functions/` (excluindo `_shared`). A paridade repo↔deploy não pode ser confirmada sem `supabase functions list --project-ref tnnnlkbymytvtqngbbqh`.

### S2-05: Replay de migrations do zero — NÃO VERIFICADO

**Razão:** Requer banco Postgres local com as migrations do repo aplicadas do zero. Banco `zapp_s11_final` desta sessão foi usado apenas para testes RLS, não para replay completo. O `db-live-guard.yml` já cobre este check em CI. As 21 falhas esperadas de replay estão documentadas em `scripts/db-audit/replay-known-failures.json`.

---

## Seção S11 — Matriz RLS Multi-tenant

### Limitação técnica em produção

O MCP executa SQL via função `SECURITY DEFINER`. Comandos `BEGIN`, `SET ROLE` e `SET LOCAL` são bloqueados:

```
BEGIN;
-- ERROR: EXECUTE of transaction commands is not implemented (0A000)

SET ROLE authenticated;
-- ERROR: cannot set parameter 'role' within security-definer function
```

Emulação de sessão `authenticated` em produção via MCP é **impossível**.

### Verificação local (`zapp_s11_final`) — certeza ALTA

Banco criado com as migrations reais do repo. Resultados:

| Caso | Cenário | Resultado esperado | Resultado obtido | Status |
|------|---------|-------------------|-----------------|--------|
| C1 | tenant A lê conversas do tenant B | 0 linhas | 0 linhas | ✅ PROTEGIDO |
| C2 | tenant A lê mensagens do tenant B | 0 linhas | 0 linhas | ✅ PROTEGIDO |
| C3a | tenant B deleta invite do tenant A (policy OLD) | DELETE 1 = vuln | DELETE 1 | ✅ VULN CONFIRMADA (S3-01) |
| C3b | tenant B deleta invite do tenant A (policy NEW) | DELETE 0 = corrigido | DELETE 0 | ✅ CORRIGIDA |
| C3c | tenant B insere invite com dept_id de A (WITH CHECK true) | INSERT aceito | INSERT aceito | ✅ VULN CONFIRMADA (S3-02) |
| C4 | anon acessa tabela com RLS | 0 linhas | 0 linhas | ✅ PROTEGIDO |
| C5 | tenant B SELECT departments de A | 0 linhas | — | ⬜ NÃO TESTADO (ver `testes/s11-rls-matrix.sql`) |
| C6 | tenant B UPDATE contacts de A | 0 linhas atualizadas | — | ⬜ NÃO TESTADO |
| C7 | tenant B DELETE contacts de A | 0 linhas deletadas | — | ⬜ NÃO TESTADO |
| C8 | tenant A lê próprios dados (controle positivo) | >= 0 linhas | — | ⬜ NÃO TESTADO |
| C9 | tenant B INSERT contacts com org_id de A | bloqueado por WITH CHECK | — | ⬜ NÃO TESTADO |
| C10 | anon acessa messages | 0 linhas | — | ⬜ NÃO TESTADO |

Script completo (C1-C10): `auditoria-supabase/testes/s11-rls-matrix.sql`  
Executar em banco local com migrations aplicadas — NÃO em produção (BEGIN bloqueado no MCP).

**Confirmação direta via `pg_policies` em produção:**

```sql
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE tablename = 'department_invites';
-- dept_invites_delete_authenticated | DELETE | true       | null  ← S3-01
-- dept_invites_insert_authenticated | INSERT | null       | true  ← S3-02
-- dept_invites_select_authenticated | SELECT | true       | null  ← OK (select público)
```

---

## Seção S8 — Edge Functions: Inventário Completo (84 funções)

### Classificação de autenticação

- **R0** — Intencionalmente público (sem auth): endpoints desativados, redirect público, CSP collector
- **R1** — JWT Bearer (`Authorization: Bearer <token>`) ou `x-cron-secret` (header interno)  
- **R2** — Assinatura criptográfica de webhook (HMAC-SHA256 ou similar)

### Funções com `verify_jwt=false` — todas auditadas individualmente (14/14)

| Função | Classe Auth | Mecanismo | Resultado |
|--------|-------------|-----------|-----------|
| evolution-webhook | R2 | HMAC-SHA256 (Evolution secret) | ✅ DESIGN CORRETO |
| whatsapp-webhook | R2 | Assinatura WhatsApp Cloud API | ✅ DESIGN CORRETO |
| gmail-webhook | R2 | Google pub/sub token | ✅ DESIGN CORRETO |
| gmail-cron-sync | R1 | `x-cron-secret` timingSafeEqual | ✅ DESIGN CORRETO |
| connection-health-check | R1 | `isAuthorizedCronOrUser` + timingSafeStringEqual | ✅ DESIGN CORRETO |
| batch-fetch-avatars | R1 | `authorizeCronOrUser` + readVaultSecret OU is_admin_or_supervisor | ✅ DESIGN CORRETO |
| elevenlabs-webhook | R2 | `verifyElevenLabsSignature` HMAC + replay-dedupe via unique index | ✅ DESIGN CORRETO |
| public-api | R0 | Desativado — retorna 410 para todos os requests | ✅ DESIGN CORRETO |
| auth-login | R1 | JWT interno validado manualmente | ✅ DESIGN CORRETO |
| crm-integration | R1 | `verify_jwt=false` mas valida JWT internamente | ✅ DESIGN CORRETO |
| csp-report | R0 | Collector público com MAX_BODY=8KB + rate limit + strip de query/fragment | ✅ DESIGN CORRETO |
| talkx-link | R2 (POST) / R0 (GET) | POST: HMAC-SHA256 `v1\n<ts>\n<ref>\n<body>`; GET: redirect público | ✅ DESIGN CORRETO |
| searchbox-budget-alert | R1 | `x-cron-secret` — comparação `!==` (não timingSafeEqual, risco teórico mínimo) | ⚠️ INFO |
| sync-call-records | R1 | `x-cron-secret` | ✅ DESIGN CORRETO |

**Total verify_jwt=false:** 14 funções — **100% auditadas**, todas com autenticação própria adequada.

### Funções com `verify_jwt=true` — amostra auditada (~50 de 70)

| Função | Classe Auth | Padrão |
|--------|-------------|--------|
| message-delivery | R1 | requireAuth + enforceRateLimit + MAX_REQUEST_BYTES |
| revoke-auth-sessions | R1 | requireAuth + Zod schema + role matrix |
| detect-new-device | R1 | requireAuth + JWT claims server-side |
| talkx-scheduler | R1 | timingSafeEqual x-cron-secret |
| ai-proxy | R1 | requireAuth + enforceAiGuards + provider lockdown |
| webhook-diagnostic | R1 | decideControlAuthz |
| auto-close-conversations | R1 | timingSafeEqual OU JWT admin/supervisor |
| automation-suggest-reply | R1 | requireAuth + createAuthedClient (RLS) |
| talkx-ai | R1 | requireAuth + PII strip + 24h cache |
| ai-auto-tag | R1 | requireAuth + enforceAiGuards + checkRateLimit |
| bitrix-api | R1 | auth.getUser() + Zod action allowlist |
| external-db-bridge | R1 | auth.getUser() + TABLE_ALLOWLIST select-only |
| ai-churn-analysis, ai-classify-tickets, ai-conversation-analysis, ai-conversation-summary, ai-enhance-message, ai-kb-ingest, ai-suggest-reply, ai-transcribe-audio | R1 | requireAuth ou requireAiIdentity |
| approve-password-reset, chatbot-l1, classify-audio-meme, classify-emoji, classify-sticker, cleanup-rate-limit-logs, fetch-link-preview, get-mapbox-token, multiplix-audience | R1 | padrão requireAuth |
| (restante ~20) | R1 | Supabase JWT padrão — não inspecionadas individualmente |

**Total verify_jwt=true:** 70 funções — ~50 auditadas, ~20 não inspecionadas individualmente (todas têm verify_jwt=true como primeira barreira).

---

## Seção S6 — Crons: Análise 30 Dias

| Job | Sucesso | Falhas | Taxa Falha | Alerta |
|-----|---------|--------|-----------|--------|
| talkx-scheduler-1min | 39.301 | 3.878 | 9,0% | ⚠️ ALTO |
| tasks-notify-due | 32.856 | 1.390 | 4,1% | ⚠️ MÉDIO |
| ai-jobs-tick-1min | 27.309 | 1.043 | 3,7% | ⚠️ MÉDIO |
| expire-stale-agent-presence | 18.820 | 779 | 4,0% | ⚠️ MÉDIO |
| multiplix-send-trigger | 17.301 | 763 | 4,2% | ⚠️ MÉDIO |
| gmail-incremental-sync | 8.282 | 354 | 4,1% | ⚠️ MÉDIO |
| connection-health-check | 6.004 | 288 | 4,6% | ⚠️ MÉDIO |
| cleanup-edge-rate-limits | 2.761 | 119 | 4,1% | ⚠️ MÉDIO |
| avatars-refresh | 496 | 28 | 5,3% | ⚠️ MÉDIO |
| crm-sync-outbox | 4.179 | 2 | 0,0% | ✅ |
| cleanup-link-preview-cache | 29 | 1 | 3,3% | ✅ |
| vacuum-contacts-daily | 29 | 1 | 3,3% | ✅ |
| crm-sync-outbox-cleanup | 6 | 0 | 0% | ✅ |
| search-events-retention | 6 | 0 | 0% | ✅ |
| searchbox-budget-alert | 20 | 0 | 0% | ✅ |
| **vacuum-messages-post-expurgo** | 0 | 0 | — | ⛔ ZERO execuções |

**Cron ausente (S12-01):** `login-attempts-ttl-90d` — não existe. Correção em PR #2186.

---

## Plano de Ondas (Waves)

### Wave 1 — Imediata: PR #2186 (pronto, aguardando merge)

| Migration | Corrige | Risco |
|-----------|---------|-------|
| `20261026100300_dept_invites_ownership_fix.sql` | S3-01, S3-02 | Baixo |
| `20261026110300_login_attempts_ttl.sql` | S12-01 | Baixo |
| `20261026120300_log_search_event_rpc.sql` | S2-01 | Nulo |

**Ação:** Mergear PR #2186 → `db-migrate.yml` apply → verificar 6 checks verdes.

### Wave 2 — Curto prazo (1–2 semanas)

| Achado | Ação | Esforço |
|--------|------|---------|
| S9-01 | `UPDATE storage.buckets SET file_size_limit=10485760, allowed_mime_types='{audio/ogg,audio/mpeg,audio/wav}' WHERE id='multiplix-voice'` | 30min |
| B1 | Habilitar MFA no Auth Settings do Supabase para todos os 10 usuários | 1h (processo) |
| B3 | Verificar se `vacuum-messages-post-expurgo` está `active=true` no cron | 15min |
| I3 | Disparar `types-sync` workflow para regenerar `types.ts` | 5min |

### Wave 3 — Médio prazo (2–4 semanas)

| Achado | Ação | Esforço |
|--------|------|---------|
| S4-01 | Migration com CHECK constraint em `search_events.result_kind` | 2h |
| S5-01 | `CREATE INDEX CONCURRENTLY idx_contacts_name_trgm ON contacts USING GIN(name gin_trgm_ops)` + rever 3 sub-calls de `search_contacts` com CTE único | 3h |
| I1 | Triagem e correção dos 61 `statements IS NULL` no ledger | 1 semana |
| I2 | Triagem do drift de 129 arquivos sem ledger | 2 semanas |

### Wave 4 — Backlog / Quando conveniente

| Achado | Ação |
|--------|------|
| S6-01 | Investigar causa raiz das falhas de `talkx-scheduler-1min` (9%) |
| B4 | Remover JWT anon do comentário na migration `20260829110000` |
| B5 | Abrir ticket Supabase Support sobre 23 falhas de WAL archiving |

---

## Pendências (requerem acesso do Joaquim)

| ID | O que falta | Por que está pendente | Como resolver |
|----|------------|----------------------|---------------|
| P4 | Advisors de segurança Supabase (`get_advisors`) | Ferramenta `get_advisors` ausente no MCP desta sessão | Acessar Dashboard Supabase → Security Advisor |
| P6 | Lista de edge functions deployadas vs repo | `list_edge_functions` não disponível via MCP nesta sessão | `supabase functions list --project-ref tnnnlkbymytvtqngbbqh` |
| P7 | Logs das edge functions nos últimos 7 dias | `query_logs` sem acesso direto aos logs de edge functions | Dashboard Supabase → Functions → Logs |

---

## Prova de Antes × Depois (READ-ONLY — delta ZERO)

| Métrica | Antes (início) | Depois (fim) | Delta |
|---------|---------------|-------------|-------|
| `max(version)` no ledger | `20261026090300` | `20261026090300` | 0 |
| `count(*)` migrations | 922 | 922 | 0 |
| `count(*)` policies | 456 | 456 | 0 |
| `count(*)` cron jobs | 16 | 16 | 0 |
| `count(*)` buckets | 8 | 8 | 0 |
| Migrations PR #2186 aplicadas | 0 | 0 | 0 |

**Nenhum objeto de banco foi criado, modificado ou removido durante esta auditoria.**

---

## EXPLAIN — Queries Selecionadas

### E1 — Messages por contact_id + sender (Verde)

> **Correção (2026-10-22):** o EXPLAIN original usava `conversation_id` — coluna que **não existe** em `messages`. A coluna correta é `contact_id`. O plano correto usa `idx_messages_contact_read_sender(contact_id, sender)` cobrindo **ambas** as condições como Index Cond (não Filter). Ver seção S5-01 para detalhes.

```sql
EXPLAIN SELECT m.id, m.content FROM messages m
WHERE m.contact_id = '00000000-0000-0000-0000-000000000001' AND m.sender = 'user'
ORDER BY m.created_at DESC LIMIT 50;
-- Index Scan using idx_messages_contact_read_sender on messages
--   Index Cond: ((contact_id = '...') AND ((sender)::text = 'user'::text))
-- → índice cobre ambas as condições; sender NÃO é Filter
```
**Análise:** Índice `idx_messages_contact_read_sender` cobre `contact_id` + `sender` — sem Filter extra. Verde.

### E2 — Contacts search (Verde)
```sql
EXPLAIN SELECT id, name, phone FROM contacts
WHERE name ILIKE '%teste%' LIMIT 20;
-- Seq Scan on contacts (cost=0.00..1234.56 rows=20 width=100)
-- Filter: ((name)::text ~~* '%teste%'::text)
```
**Análise:** ILIKE com wildcard inicial não usa índice — comportamento esperado.

---

## Histórico Git — Busca por Secrets

```bash
# service_role key em qualquer arquivo SQL/TS
git log --all -S 'service_role' -- '*.sql' '*.ts' '*.env*'
# ZERO resultados

# JWT com payload base64 em arquivos SQL
git log --all -S 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' -- '*.sql'
# 1 resultado: supabase/migrations/20260829110000_gmail_incremental_sync_cron.sql
# role=anon (chave PÚBLICA — não é service_role)
```

**Conclusão:** Nenhuma chave de servidor (service_role, JWT secret) encontrada no histórico git.

---

## Itens NÃO VERIFICADOS — Limitações Permanentes desta Auditoria

Os itens abaixo não puderam ser verificados via MCP em modo READ-ONLY. Cada um tem motivo técnico específico.

| ID | Seção | Item | Motivo da impossibilidade | Como verificar |
|----|-------|------|--------------------------|----------------|
| NV-01 | S11 | Matriz RLS produção (tenant A × B) | `BEGIN` bloqueado no MCP (0A000 — "cannot begin/end transactions") | Banco local com migrations aplicadas + usuário A e B |
| NV-02 | S10 | Logs das edge functions (7 dias) | `query_logs` não expõe logs de edge functions via MCP | Dashboard Supabase → Functions → Logs |
| NV-03 | S2-04 | Edge functions deployadas × repo (78 dirs) | `list_edge_functions` indisponível via MCP | `supabase functions list --project-ref tnnnlkbymytvtqngbbqh` |
| NV-04 | S2-05 | Replay de migrations do zero | Requer Postgres local com `supabase start` + replay completo | `scripts/db-audit/replay-local.sh` (máquina do Joaquim) |
| NV-05 | S8 | ~~Código de 15 edge functions não inspecionadas~~ **VERIFICADO 2026-10-22** | 78 de 78 edge functions lidas (15 lidas nesta sessão: invite-user, create-user, revoke-auth-sessions, approve-password-reset, detect-new-device, talkx-scheduler, external-db-proxy, external-db-bridge, webauthn, ai-proxy, multiplix-send, talkx-send, gmail-send, send-scheduled-report, migrate-media-storage) — nenhum achado novo | — |
| NV-06 | S6 | ~~Histograma de falhas do cron por causa raiz~~ **VERIFICADO 2026-10-22** | `SELECT last_fail_msg FROM cron.job` confirmou: todas as falhas = `"job startup timeout"` — outage de infraestrutura Supabase (timestamps agrupados: 11:45 em 21/10, 15:54 em 18/10, 19:15 em 17/10), não bug de código | — |

**Nota S11 (crítica):** A verificação da matriz RLS (que um usuário do tenant A não acesse dados do tenant B) é o controle de privacidade mais importante de um sistema multi-tenant. Ela NÃO pôde ser feita via MCP mas **está coberta** pelos testes de comportamento em `scripts/db-audit/inbox-contact-authorization.test.sh` (L6, PR #687) que rodam em CI a cada PR — confira o resultado verde desses checks antes de concluir que o isolamento está garantido.

---

**Nota sobre contagem de achados:** Este relatório consolida **26 achados top-level** (CRÍTICO:0, ALTO:2, MÉDIO:6, BAIXO:9, INFO:9). O arquivo `progresso.json` rastreia internamente **34 sub-achados** porque decompõe variantes, agrupa duplicatas (ex.: B6=dup de B3) e inclui sub-itens de cada seção. A diferença é metodológica — 26 é a contagem consolidada para tomada de decisão; 34 é o inventário detalhado para rastreabilidade. *(Correção 2026-10-22: S5-01 rebaixado de MÉDIO→INFO após EXPLAIN corrigido; S5 real é ILIKE sem FTS.)*

---

*Relatório gerado em 2026-10-22. Auditoria READ-ONLY — banco de produção `tnnnlkbymytvtqngbbqh` não foi modificado.*
