# Auditoria exaustiva + correção do Supabase — ZAPP WEB V2 — instruções para o Claude Code

Invocar com `/auditoria-supabase` (arquivo em `.claude/commands/auditoria-supabase.md`). Idioma: PT-BR em tudo.

> **Este projeto já foi auditado três vezes e nenhuma auditoria foi fechada.** Existem em `main` e em PRs abertas três relatórios com numerações diferentes do mesmo problema, ~10 PRs de correção paradas sem aprovação e guardas de CI que já fazem metade do inventário. Refazer a Fase A do zero é a pior escolha possível: o trabalho aqui é **consolidar, reverificar, fechar lacunas e aplicar**.

---

## 0. Parâmetros

| Chave | Valor |
|---|---|
| PROJETO | Zapp Web V2 — `project_ref` = **`tnnnlkbymytvtqngbbqh`** (Supabase Cloud, Postgres 17.6) |
| MCP | **`SUPABASE - ZAPP WEB V2 - MCP`** (customizado: `db_query` via função `mcp_exec`, service_role, 1 transação por chamada, timeout 120 s). **Não é** o MCP oficial: não existem `get_advisors`, `query_logs`, `list_edge_functions`, `get_edge_function`, `list_migrations`, `generate_typescript_types`. |
| REPO | `https://github.com/adm01-debug/Zapp_Web_V2` (público; `main`; squash only; `delete_branch_on_merge`; `strict=true`; 6 required checks) |
| PASTA DE TRABALHO | `auditoria-supabase/` (já existe em `main`) |
| LIMITE | 80 turnos por sessão |
| LEITURA OBRIGATÓRIA | `CLAUDE.md` (§0, §1, "Decisões de 2026-09-26", "Alocação de versão"), `AGENTS.md`, `CONTRIBUTING.md`, `scripts/db-audit/README.md`, `docs/ci/README.md`, `auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` + `progresso.json` (main) |

### Bancos que NÃO são este projeto — nunca usar, nem para consulta
- `uqysyzndkfiwfztbqvsl` (MCP "ZAPP WEB - LOVABLE") e `vpkmqeumtxhrwgawxdrl` (MCP "MCP - SUPABASE LOVABLE CLOUD - ZAPP WEB V2" — nome quase idêntico). **`ping` antes de qualquer SQL**: a resposta tem de ser `https://tnnnlkbymytvtqngbbqh.supabase.co`.
- `pgxfvjmuubtbowutlide` (CRM) e `doufsxqlfjyuvxuezpln` (Catálogo/Promo Gifts): externos, consumidos por `external-db-bridge`, `promogifts-catalog`, `crm-integration` — só o lado Zapp da integração entra.
- SINGU, Zapp V3, Postgres da Evolution GO (Hostinger), VPS AtomicaBR: fora.

### O que já existe (ponto de partida obrigatório)
| Fonte | Conteúdo | Estado |
|---|---|---|
| `auditoria-supabase/` em `main` | Relatório + `progresso.json` da auditoria de 2026-10-30/31: 12 seções concluídas, 39 achados (3 CRÍTICO, 10 ALTO, 13 MÉDIO, 13 INFO), top 10 reexecutado, NÃO VERIFICADO: advisors, logs de edge, PITR, `types.ts` × schema, edges publicadas × repo, RLS com JWT em produção | base |
| PR #2462 | versão "final" do mesmo relatório (5 correções técnicas; sobrepõe #2241) | aberta |
| PR #2414 | auditoria paralela de 2026-10-31: 47 achados (C-01..03, A-01..04, M-01..17), inventário JSON em 8 arquivos, propostas `FIX-S0x-*.sql` | aberta |
| PR #2186 | auditoria de 2026-10-22: 68 achados, propostas P001–P010 + 2 migrations (`department_invites` ownership, `login_attempts` TTL) | aberta |
| PRs de correção abertas | #2265 (CRITICAL-1: REVOKE escrita do `anon`, 99 tabelas), #2481 (CRITICAL-2: `WITH CHECK` em 8 policies), #2277 (17 tabelas com RLS sem policy + DROP `_bkp_261023`), #2245 (cron `talkx-scheduler-1min` 4.007 falhas/30 d), #2491 (reconciliar `20261030145126`), #2487 / #2476 / #2471 / #2485 / #2460 / #2473 (Copiloto RADAR, Multiplix C121 — migrations e edges) | abertas, maioria "AGUARDANDO APROVAÇÃO" |
| `supabase/schema-manifest.json`, `schema-catalog.json`, `deployment-manifest.json` | inventário estrutural versionado | regenerados por `types-sync`/`db-live-guard` |
| `scripts/db-audit/` (327 arquivos) | guardas (`check-migration-drift`, `check-triple-parity`, `check-catalog-fresh`, `check-manifest-fresh`, `check-grants-fresh`, `check-realtime-subscriptions`, `check-runtime-config`, `check-secdef-public-execute.sql`, `check-live-invariants.sql`, `check-mcp-exec-acl.sql`, `supabase-usage-guard`, `verify-ledger-statements`), baselines (`pg-cron-jobs-baseline.json`, `storage-buckets-baseline.json`, `realtime-publication-baseline.json`, `grants-baseline.json`), exceções (`known-violations.json`, `migration-evidence.json`, `replay-known-failures.json`), `replay-local.sh`, `register-migration.mjs`, ~200 `*.test.sh` de contrato | rodam em `db-guard.yml` (por PR) e `db-live-guard.yml` (diário 06:13 UTC, abre issue `db-live-guard`) |

### Retrato de produção em 2026-11-01 (reexecute em 0.1 — já divergiu do relatório de 31/10)
211 tabelas `public` (0 sem RLS) · 481 functions (402 `SECURITY DEFINER`, 0 executáveis por `anon`) · 520 policies · 13 views (12 sem `security_invoker`) · 24 crons ativos · **14.104 execuções de cron com falha em 30 d** (startup timeout em 15 jobs; `talkx-scheduler-1min` 10 %) · ledger 1.072 versões, última `20261031130000`, **65 com `statements IS NULL`** · 100 grants `SELECT` + ~98 grants de escrita para `anon` · 9 buckets (3 públicos) · 37 tabelas no realtime · 13 segredos no Vault (um deles `sicoob_service_role_key`) · sem `pgmq` · repo: 85 edges + `_shared`, 17 exceções de `verify_jwt` em `config.toml` · 2 `.rpc()` órfãos no front (`get_search_insights`, `log_search_event`).

---

## 1. Objetivo

1. **Consolidar** as três auditorias numa única lista de achados `ZW-nnnn`, sem duplicata, cada um ligado à PR que o corrige (se existir).
2. **Reverificar** em produção, agora, cada achado CRÍTICO/ALTO e fechar as lacunas NÃO VERIFICADO que dá para fechar.
3. **Cobrir o que nenhuma auditoria fez**: funcionalidades pendentes/parciais, matriz de cobertura das guardas, cruzamento com as tags `resgate/*`.
4. **Corrigir**: destravar as PRs paradas (classificar, rebasear, testar, mergear o autônomo, entregar o resto numa única lista de aprovação) e abrir o que falta.

Resultado esperado: Supabase funcionando de ponta a ponta, **uma** auditoria viva em `auditoria-supabase/`, e guardas do repo cobrindo cada achado fechado.

---

## 2. Escopo

### Dentro
- Tudo do projeto `tnnnlkbymytvtqngbbqh`: Database, `pg_cron`, `pg_net`, Vault, Auth, Storage, Realtime, Edge Functions (código + nomes de segredos), ledger `supabase_migrations.schema_migrations` + `version_reservations`.
- No repo, só o interligado: `supabase/migrations/` (ignorar `_foreign/` e `_superseded/`), `supabase/functions/`, `supabase/config.toml`, os 3 manifestos, `supabase/tests/`, `src/integrations/supabase/types.ts`, `src/config/supabase.ts`, `scripts/db-audit/*`, `scripts/edge-deploy/*`, chamadas do cliente (`.from/.rpc/invoke/storage.from/channel/auth.*`). Front só se for a ponte (ex.: `.rpc('get_search_insights')` → DB tem `search_insights`).
- Workflows **só como fonte de regra** (leitura): `db-guard.yml`, `db-live-guard.yml`, `db-migrate.yml`, `deploy-functions.yml`, `types-sync.yml`.

### Fora (não tocar, não auditar, não "aproveitar")
- **Dados existentes**: só contagem. Fixtures E2E em produção (`e2e0e2e0-…`, contato `[E2E] Contato de teste`) **não são lixo**.
- `.github/workflows/`, `scripts/ci/github-settings-baseline.json`, branch protection, environments, secrets do GitHub, Vercel, Evolution GO, N8N, UI/UX, refatoração, dependências.
- Bugs de front sem ligação → "Fora do escopo encontrado".

---

## 3. Regras invioláveis

1. **Confirme o projeto**: `ping` + `db_connection_info` + `SELECT current_database()`; compare com `supabase/config.toml` e `scripts/db-audit/database-identity.json`. Divergiu → pare.
2. **Fases 0 e A são somente leitura.** Permitido: `db_query` só `SELECT`/`EXPLAIN` sem `ANALYZE`, `db_list_*`, `db_describe_table`, `db_constraints`, `db_relationships`, `db_index_usage`, `db_missing_indexes`, `db_duplicate_indexes`, `db_table_bloat`, `db_sequences`, `db_slow_queries`, `db_stats`, `db_health`, `db_disk_usage`, `db_locks`, `db_active_queries`, `db_pg_settings`, `db_migrations`, `storage_list_buckets`, `storage_get_bucket`, `functions_ping`. **Proibido**: `db_insert/update/upsert/delete/alter_table/apply_migration/grant/rls_manage/copy_data/transaction/set_comment/analyze/export`, `db_query` com DML/DDL/GRANT/REVOKE, `auth_create/update/delete/invite/generate_link`, **`auth_list_users`/`auth_get_user`/`auth_list_sessions` (PII — use `count(*)` em `auth.users`)**, `storage_*` que escreve, `functions_invoke` (exceto R0 após ler o código inteiro).
3. **Escrita só na Fase B, só pela seção 6.** DDL em produção **nunca** sai do MCP nesta auditoria: arquivo → PR → merge → `db-migrate.yml` (`apply=false` dry-run → aprovação do Joaquim em `producao-ddl` → `apply=true` com o hash). Foi `db_query` com DDL "pequeno" que causou os drifts de 02/09, 04/09 e 26/09.
4. **Sem PII e sem valor de segredo** em arquivo, commit, PR ou chat. Vault: só `name, created_at`, nunca `decrypted_secrets`. `.env*` e `sensiveis/` nunca.
5. **Evidência ou NÃO VERIFICADO.** Achado herdado de relatório anterior **não vale** até ser reexecutado nesta sessão. "Ledger só com comentário" não descreve o que rodou: confirme com `pg_get_functiondef`/`pg_indexes`/`pg_constraint`.
6. **Não chute causa.** Log, estado real, ponto exato antes de qualquer patch. Sintoma com várias causas → listar todas.
7. **Uma correção = uma branch = uma PR.** Diff mínimo. Conventional Commits (hook `commit-msg`; `merge:` não é aceito).
8. **Nunca** commitar em `main`, reaproveitar branch, escrever em branch alheia (as PRs abertas são de outras sessões: **somente leitura** — para avançar uma delas, branch nova a partir dela com `supersede #n` no corpo), force-push, renomear migration (guard reprova; rename = delete + create em commits separados).
9. **Travou** → erro exato e pare naquele item. 403 administrativo = limite de evidência, não achado.
10. `auditoria-supabase/progresso.json` ao fim de **cada** seção.
11. **Postgres local só via `scripts/db-audit/replay-local.sh`** (aponta o host oficial para `127.0.0.1` e desliga `cron.launch_active_jobs`): um banco local com estas migrations **chama as edge functions reais** se ninguém travar. 21 falhas de replay esperadas; 64 diferenças vs manifesto sem reconciliação. WSL do Joaquim: 1–2 processos pesados por vez.
12. **Fluxo Git**: este arquivo segue o fluxo do Joaquim (branch `claude/<tipo>-<slug>-<AAMMDD-HHMM>`, PR, merge autônomo de escopo comum, regra 8 para o resto). Onde `CLAUDE.md` §0 diz "nenhum agente faz push/PR/merge", prevalece esta instrução por ordem expressa dele; o que **não** muda é: DDL em produção só por `db-migrate.yml` com aprovação humana.

### Economia (velocidade + tokens)
- **Rode as guardas antes de qualquer SQL próprio**; saídas em `inventario/guardas/`. Achado = o que passa nelas e está errado, ou o que elas não cobrem.
- **Não releia** os três relatórios inteiros: extraia só a lista de achados (ID, severidade, objeto, evidência, PR) de cada um com grep/script e consolide em `achados.json`.
- Catálogo em lote (`json_agg`); `schema-manifest.json`/`schema-catalog.json` são o inventário — diff, não releitura.
- Paralelize A.6/A.7/A.8 em subagentes; cada um escreve seu `inventario/*.md`.
- `EXPLAIN` só no top 10; BAIXO/INFO em uma linha; nenhuma tool "por garantia".
- Fase B em lote: AUTÔNOMAS em subagentes paralelos; APROVAÇÕES numa única chamada no fim.

---

## 4. Fase 0 — Consolidação e reverificação (somente leitura)

### 0.1 Baseline
`inventario/baseline_antes.json`: ledger (`version`, `name`, `md5(array_to_string(statements,';'))`), `cron.job` (jobid, jobname, schedule, active, md5(command)), `pg_policies`, `pg_proc` de `public` (nome, `prosecdef`, `proconfig`, md5 do corpo), triggers, buckets, `pg_publication_tables`, nomes do Vault, hash de `deployment-manifest.json`. Reexecutar no fim → `baseline_depois.json` + diff.

### 0.2 Mesa única de achados
De `main` (`RELATORIO_AUDITORIA_SUPABASE.md`, `progresso.json`), PR #2462, PR #2414 (`inventario/*.json`, `propostas/FIX-*`), PR #2186 (`P001–P010`): extrair todos os achados → `achados.json` com `ZW-nnnn`, severidade **reatribuída** pela escala da seção 5, objeto, origem (IDs antigos: `S03-001` = `A-01` = `CRITICAL-1` = `ZW-0001`), evidência original, **PR aberta que corrige** (#2265, #2481, #2277, #2245, #2491, #2186…), estado (`aberto` / `em PR` / `já corrigido em main` / `superado`). Duplicatas colapsam; contradições entre relatórios (ex.: "7 tabelas com RLS off" às 00:15Z × "0" às 04:32Z) viram item a reverificar.

### 0.3 Reverificação
Reexecutar **agora** a evidência de todo CRÍTICO e ALTO e de tudo que tem PR aberta. Produção mudou desde 31/10 (211 × 204 tabelas, 520 × 505 policies, ledger 1.072 × 1.064): achado que sumiu → `já corrigido` com a `version`/PR que o fechou; achado que piorou → severidade sobe. Resultado em `achados.json` + tabela no relatório.

### 0.4 Triagem das PRs abertas
Para cada PR de correção: ainda válida? conflita com `main`? migration ainda aplicável (objeto existe, `version` livre no ledger — `SELECT version … LATERAL unnest(statements) s WHERE s LIKE '%objeto%'`)? testada em Postgres temporário? PR de outra sessão cobre a mesma coisa (#2462 × #2241; #2265 × `FIX-S03-*`; #2481 × `CRITICAL-2` do #2462)? Veredito: **MERGEAR (autônomo)**, **APROVAÇÃO**, **SUPERSEDE** (branch nova a partir dela), **FECHAR** (motivo; não feche — relate), **DECISÃO HUMANA**.

---

## 5. Fase A — Lacunas (somente leitura; só o que a Fase 0 não cobriu)

### A.2 Drift — o coração deste projeto
Arquivo × ledger × banco: arquivo sem ledger; ledger sem arquivo (cruzar com issues abertas `db-live-guard`); mesmo objeto sob duas `version`; **65 `statements IS NULL`** (cada um: confirmar estado ao vivo antes de propor `UPDATE` do ledger via `register-migration.mjs`); replay via `replay-local.sh` (falhas além das 21 conhecidas = achado); manifesto/catálogo/`types.ts` × banco (`check-*-fresh`, última PR de `types-sync` mergeada?, issue `[types-sync]` aberta?); código × banco (`supabase-usage-guard` `novas: 0`; os 2 `.rpc()` órfãos; `known-violations.json` listado como dívida); edges: `supabase/functions/*` × `deployment-manifest.json` × último run verde de `deploy-functions.yml`; `config.toml` `verify_jwt` × justificativa escrita; `Deno.env.get('X')` × nomes de segredos; `src/config/supabase.ts` aceita desvio local só para `localhost`/`127.0.0.1` fora de build de produção.

### A.3 Segurança (reverificar + completar)
`anon` com escrita (PR #2265 — provar com `has_table_privilege` antes/depois no Postgres temporário); `anon` com `SELECT` em 100 tabelas (cada uma: dado sensível? fluxo público real — `talkx-link`, `csp-report`, reset de senha?); `WITH CHECK` ausente (PR #2481 cobre 8 — e as outras ~31?); 17 tabelas com RLS sem policy (PR #2277); `talkx_campaign_segments` com `roles={public}`; isolamento por **papel (admin/supervisor/agent) × departamento**; `auth.jwt() -> 'user_metadata'`; **402 `SECURITY DEFINER`** (`search_path` já verificado = 0 sem; foco: as 7 funções de credenciais `get_channel_credentials`, `get_gmail_tokens`, `get_instance_token`, `get_voip_profile_credentials`, `set_voip_profile_credentials`, `store_gmail_tokens`, `get_channel_credentials_safe` — quem executa e o que checa; `e2e_cleanup*` em produção; `mcp_exec`/`mcp_exec_many` ACL = só service_role; `decrypt/encrypt_gmail_token` lendo `vault.decrypted_secret` sem `SECURITY DEFINER`); SQL dinâmico sem `format('%I')`; 12 views sem `security_invoker` (`channel_connections_safe`, `gmail_accounts_safe`…); 3 buckets públicos (`audio-memes`, `custom-emojis`, `stickers`) — conteúdo sensível?; **17 edges com `verify_jwt=false`**: cada uma valida JWT / `x-cron-secret` / assinatura no código? `smoke-functions.mjs` exige 401 anônimo? `message-delivery` (NÃO VERIFICADO em 31/10); webhooks (`evolution`, `whatsapp`, `gmail`, `elevenlabs`) com assinatura?; `public-api` só 410?; `x-cron-secret` nos crons vem do Vault; `service_role`/`POSTGRES_*` em `VITE_*`; `sicoob_service_role_key` no Vault deste projeto; segredos no histórico git.

### A.4 Integridade
32–35 FKs sem índice (proposta `04_fk_indexes.sql` / `FIX`), `profiles` sem FK para `auth.users`, tabela sem PK (`searchbox_budget_alert_cron`, `_zapp_fn_before`), `ON DELETE`, retenção de `messages`, `message_attempts_log`, `webhook_failures`, `rate_limit_logs`, `conversation_events`, `audit_logs`, `cron.job_run_details`, `net._http_response`; soft-delete sem purga; 36 tabelas com PII sem retenção (LGPD).

### A.5 Performance
`user_roles` com 100 % seq scan (recursão RLS via `is_admin_or_supervisor` — causa provável dos timeouts de cron); `trigger_talkx_engine_tick` 165 k blocos/chamada; `mcp_exec` como 3.º maior consumidor (uso de MCP em produção); `email_threads.is_unread` e `contacts(assigned_to, conversation_status)` sem índice; 637 índices sem uso; bloat de `messages`; policies sem `(select auth.uid())`.

### A.6 Crons (24 — reverificar os 14.104 erros)
Por job: alvo, schedule e sobreposição, falhas e `return_message` 30 d, duração, segredo literal no `command`, versionado (`pg-cron-jobs-baseline.json`) ou à mão, fuso. O incidente de 30/10 (startup timeout em 15 jobs, "auto-recuperado") **tem causa?** — cruzar com `user_roles` (A.5), pool de conexões (`db_connection_info`, `db_pg_settings`), `pg-cron-concorrencia.py`. PR #2245 cobre o `talkx-scheduler`? `talkx_engine_alerts()` com nested timeout. Crons que faltam: purga de soft-delete, limpeza de `version_reservations`, retenção dos logs acima.

### A.7 DB functions e triggers (481 / 161 triggers)
Priorize por uso (chamadas por `.rpc()`, edges, crons, policies, triggers). Corrida (`FOR UPDATE`/`ON CONFLICT` nos leases Talk X/Multiplix/`message-delivery`), `EXCEPTION WHEN OTHERS THEN NULL` (C-03: 4 funções com SQL dinâmico + exceção silenciosa), `dashboard_kpi` e `transfer_conversation` duplicadas, função morta, `messages` com 12 triggers no INSERT, `contacts` com 17. Função sem `*.test.sh` em `scripts/db-audit/` = lacuna.

### A.8 Edge functions (85)
Código do repo é a fonte (deploy automático de `main`). Por edge: auth, validação, erros, timeouts/retries (Evolution GO, OpenAI/OpenRouter, ElevenLabs, Gmail, Bitrix, Multiplix, CRM), idempotência de webhook, CORS (`_shared`), `Deno.env` sem fallback perigoso, `TODO`/`mock`/`catch {}`, `deno.json` fixado, `*.test.ts` existe. Risco **R0/R1/R2**. Logs de edge: sem MCP → NÃO VERIFICADO + roteiro, salvo erro refletido em tabela (`webhook_failures`, `message_attempts_log`, `ai_usage_outbox`).

### A.9 Auth, Storage, Realtime
Auth: `config.toml` × front; MFA (pendência do Joaquim); `auth-login` server-side (ADR-006), `revoke-auth-sessions`, `detect-new-device`, `webauthn`, `approve-password-reset`; `user_sessions` expiração. Storage: 9 buckets × `storage-buckets-baseline.json` × código; 34 policies; limites MIME; `migrate-media-storage`/`talkx-storage-purge`/`recover-message-media` fecham o ciclo? Realtime: 37 tabelas × baseline × `channel()`; `contacts` publicado — RLS?; `whatsapp_connections.instance_token_secret_id` no realtime.

### A.10 Logs
Fontes: `cron.job_run_details` 30 d, `net._http_response` 7 d, `pg_stat_statements`, `audit_logs`, tabelas de log do app, issues `db-live-guard`/`types-sync`, últimos 10 runs de `db-live-guard.yml`, `deploy-functions.yml`, `db-migrate.yml`, `types-sync.yml`. Edge/auth/storage → NÃO VERIFICADO + roteiro.

### A.11 RLS na prática
Produção: `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{"sub":"<id mascarado>","role":"authenticated"}',true); SELECT count(*) FROM <tabela>; ROLLBACK;` — em 31/10 "não suportado via MCP": **reteste** (o MCP aceita multi-statement em 1 transação); se falhar de novo, NÃO VERIFICADO com o erro exato. Matriz **papel × departamento × tabela × cmd** só no Postgres temporário (`replay-local.sh`), reaproveitando `dashboard-rls-authorization`, `inbox-contact-authorization`, `talkx-settings-rls`, `multiplix-rls`, `email-signatures-rls`, `team-chat-*`.

### A.12 Lacunas operacionais
PITR (NÃO VERIFICADO — Dashboard), staging (branching desligado de propósito — não religar), trilha de auditoria de DDL e de `mcp_exec`, retenção LGPD, alertas (cron falhou — `notifica-falha-main.yml` cobre só CI; edge 5xx; disco), testes RLS no CI (buracos, não workflow novo).

### A.13 Funcionalidades pendentes ou parciais — **nenhuma auditoria anterior fez esta seção**
Edge no front e não no repo/deploy, ou no repo e nunca chamada; `.rpc()` para função inexistente (os 2 já conhecidos + varredura completa); função sem chamador; tabela sem policy coerente; trigger prometido e ausente; cron prometido e não agendado; **migration no repo nunca aplicada** (arquivo em `main` sem ledger — `db-migrate.yml` parado em `Waiting`?); coluna/tabela sem leitura ou sem gravação; edge com `TODO`/`WIP`/`mock`; bucket inexistente; `pg_net` para URL morta (`zapp-web.vercel.app` legado); CRUD pela metade. **Cruzar com** `PENDENCIAS.md`, `ESTADO.md`, `FEATURE_REGISTRY.md`, `docs/talkx/PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md`, `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`, `docs/resgate/MAPA_2026-10-24.md` (clusters `resgate/*` que tocam `supabase/` = features pela metade candidatas) e as PRs abertas de feature (Copiloto RADAR #2460/#2473/#2487, Multiplix C121 #2476/#2471). Para cada item: o que deveria fazer, o que falta exatamente, esforço.

### A.14 Cobertura das guardas — **nova**
Matriz achado × guarda existente (`db-guard`, `db-live-guard`, `*.test.sh`, `check-*`): achado que nenhuma guarda pega = proposta de teste de contrato em `scripts/db-audit/` (classe AUTÔNOMA se só adiciona teste; APROVAÇÃO se entra em workflow).

---

## 6. Formato de cada achado

```
ID: ZW-0001                       Origem: S03-001 / A-01 / CRITICAL-1 (#2265)
Seção: A.3
Severidade: CRÍTICO | ALTO | MÉDIO | BAIXO | INFO
Tipo: BUG | SEGURANÇA | DRIFT | INTEGRIDADE | PERFORMANCE | PENDENTE/PARCIAL | LACUNA
Objeto: public.tabela / function nome() / edge slug / cron jobname / bucket / ledger version
Guarda existente: <script/workflow que deveria pegar> | nenhuma
Evidência (reexecutada em <data>): <consulta + resultado> ou <arquivo:linha>
Impacto no negócio: 1–2 linhas, para quem não é dev
Reprodução: passos (somente leitura)
Correção: o quê, onde (migration / edge / repo / guarda); PR existente (#n) ou nova
Classe de escrita: AUTÔNOMA | APROVAÇÃO
Risco de regressão: baixo | médio | alto + por quê
Esforço: P (<30 min) | M | G
```

Severidade: **CRÍTICO** = dado exposto, escrita indevida possível, perda de dado, fluxo parado (WhatsApp não envia, Talk X não dispara, login trava). **ALTO** = feature principal quebrada/pela metade, segredo exposto, drift que o guard vivo acusa. **MÉDIO** = bug com contorno, performance visível, drift latente. **BAIXO** = inconsistência sem efeito. **INFO** = observação.

---

## 7. Fase B — Correções (escrita controlada)

Só após Fases 0 e A em `progresso.json`. Ordem: CRÍTICO → ALTO → MÉDIO → BAIXO; PENDENTE/PARCIAL antes de INTEGRIDADE/PERFORMANCE; **PR já aberta antes de PR nova**.

### 7.1 Classe de escrita

**AUTÔNOMA — execute sem perguntar, uma PR por item:**
- Edge function **R0/R1** (bug, validação, erro, timeout, idempotência, CORS). Merge em `main` = **deploy automático** (`deploy-functions.yml`, environment `producao-edge-functions` sem aprovação humana) → confirmar run verde + 1 request R0/log.
- Repo interligado: `types.ts` (via `gen-types.sh`/`types-sync`), nomes de `.rpc/.from/invoke` (ex.: `get_search_insights` → `search_insights`), `config.toml` alinhado (sem mudar `verify_jwt` nem segredos), manifestos regenerados pelo script oficial, `known-violations.json` **reduzido**, teste novo em `scripts/db-audit/` que prova contrato já vigente.
- Consolidação documental: `auditoria-supabase/` unificado (supersede #2462/#2414/#2186 na parte de docs).
- Migration **nova** no repo, **não aplicada**.
- Merge de PR aberta de terceiros **só se** veredito MERGEAR da Fase 0 e não toca banco/edge R2.

**APROVAÇÃO — tudo até a PR, deixe aberta, NÃO aplique; uma única chamada `AGUARDANDO APROVAÇÃO: ZW-xxxx (#PR), …` no fim:**
- Qualquer DDL/DML em produção, inclusive `UPDATE` no ledger (`statements IS NULL`), REVOKE/GRANT (#2265), policies (#2481, #2277), crons (#2245, #2186), DROP (`_bkp_261023`).
- Deploy de edge **R2** (WhatsApp, e-mail, voz, CRM, pagamento): merge dispara deploy, logo a PR fica aberta até `APROVADO`.
- `verify_jwt`, segredo de edge, `x-cron-secret`, auth.
- Ampliar `known-violations.json`/`migration-evidence.json`/`replay-known-failures.json`.
- Desabilitar trigger/cron, mudança de arquitetura, MFA (só o Joaquim).

`APROVADO <IDs>` = aplicar exatamente o que está na PR, na ordem. DDL: merge → `db-migrate.yml` `apply=false` → **Joaquim aprova em `producao-ddl`** → `apply=true` com `confirm_runtime_sha256`. Apply falhou fechado por DDL concorrente → repetir o dry-run, nunca relaxar.

### 7.2 Caminho obrigatório de toda correção
1. PRs abertas tocando os mesmos arquivos (em especial `supabase/migrations/`) → use a existente (supersede) ou pare e avise; nunca uma segunda PR por cima.
2. Branch nova de `main` atualizado: `claude/<fix|feat|chore>-<slug>-<AAMMDD-HHMM>`. Supersede: branch a partir da PR original, rebase em `main`, corpo com `supersede #n`.
3. Banco → `supabase/migrations/<version>_<slug>.sql` com `-- ROLLBACK:`; **version** = `SELECT supabase_migrations.reserve_migration_version('<sessão>','<motivo>')` (única escrita permitida fora de PR) conferida com `ls supabase/migrations | tail` e PRs abertas; statements reais, um por elemento, sem `;` nem comentário (`register-migration.mjs` gera). Nunca renomear migration.
4. Edge → `supabase/functions/<slug>/`; deploy só de `main`, nunca `supabase functions deploy` manual.
5. DDL/function/policy/trigger → teste no Postgres temporário (`replay-local.sh`) + `*.test.sh` que prova o contrato (entra em `db-guard.yml` só com aprovação de workflow; senão fica documentado). Sem Postgres local → `NÃO TESTADO` + roteiro.
6. Portão local: `bun run typecheck`, `bun run lint` (ratchets, zero ocorrência nova), `check-migration-drift.mjs` (com `DESTINO_URL` fictício + shim do ledger, `CLAUDE.md` §1 regra 6), `supabase-usage-guard.mjs` `novas: 0`. Só erro introduzido por você conta.
7. Conventional Commits em PT-BR, 1 commit.
8. PR: título = o que muda; corpo = `ZW-`, origem, causa, evidência real, classe, rollback, guarda que passa a cobrir.
9. 6 required checks verdes (`🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E Tests`); `strict=true` → `BEHIND` é atualizado por `auto-update-pr-branch.yml`, não force. Merge 405 "N of N expected" com tudo verde = ler `strict` ao vivo, não retentar.
10. AUTÔNOMA: squash-merge, confirmar deploy/run, **verificar** (request R0, `SELECT` em catálogo, `cron.job_run_details`) → `concluído`. APROVAÇÃO: PR aberta; chamada única no fim.
11. "Pronto" = mergeada **+** aplicado/deployado **+** verificado. Faltou um → diga onde parou.
12. Antes de cada push, último commit da branch é seu.
13. Outro bug no caminho → novo `ZW-`, não conserte.

### 7.3 Funcionalidade pendente/parcial — critério de "pronta"
Tabela/coluna existe **e** policies coerentes com papel/departamento **e** índice nas FKs **e** presente em manifesto/catálogo/`types.ts`; function/trigger versionada e chamada; edge no repo, deployada por `deploy-functions.yml`, invocada, com auth/validação/erro e teste; cron por migration e no `pg-cron-jobs-baseline.json`; bucket no baseline com policies; `*.test.sh` que prova o contrato. Pedaço só de front → "Fora do escopo encontrado".

---

## 8. Entregáveis em `auditoria-supabase/` (substitui os três relatórios)

```
progresso.json
achados.json                          # mesa única ZW-nnnn: origem, severidade, estado, PR, evidência reexecutada
RELATORIO_AUDITORIA_SUPABASE.md       # resumo (10 linhas); contagem por severidade/tipo/estado; tabela de reverificação (31/10 × hoje);
                                      # achados (seção 6); triagem das PRs abertas (veredito + motivo);
                                      # matriz drift (arquivo × ledger × banco × manifesto × código); matriz RLS (tabela × papel × cmd);
                                      # crons (job × alvo × falhas 30d × causa × versionado); edges (slug × verify_jwt × auth real × risco × teste);
                                      # pendentes/parciais; cobertura das guardas; plano em ondas (B1 autônoma, B2 aprovação, B3 fora);
                                      # NÃO VERIFICADO; Fora do escopo; histórico (o que cada auditoria anterior achou e o que foi absorvido)
inventario/*.md + inventario/guardas/*.txt + baseline_antes.json / baseline_depois.json / diff
propostas/<ZW>_<slug>.sql             # com -- ROLLBACK; "NÃO APLICADA" até aplicar; absorve FIX-S0x-* e P00x que continuarem válidos
testes/*.sh | *.sql
correcoes.md                          # ZW, PR, classe, estado (mergeada+aplicada / aguardando / CI vermelha e por quê), evidência
```

---

## 9. Comunicação no chat
Resultado primeiro; só o que muda uma decisão. Uma linha por seção. Sem despejo de tool; caminhos e links completos. Destrutivo: uma linha e ponto. Pergunte só em: custo, arquitetura, deleção, trade-off de negócio, item de APROVAÇÃO, divergência de projeto. Ler/inspecionar nunca pede permissão.

---

## 10. META CUMPRIDA — só quando mostrar no chat, nesta ordem
1. `progresso.json` com Fase 0 (0.1–0.4) e A.2–A.14 `concluída` ou `NÃO VERIFICADO` + motivo.
2. Contagem por severidade, tipo e estado (aberto / em PR / já corrigido / superado); quantos achados das 3 auditorias foram absorvidos e quantos novos.
3. Top 10 por severidade com evidência **reexecutada** agora.
4. Triagem: cada PR aberta de correção com veredito e link.
5. Correções: mergeadas+aplicadas+verificadas / `AGUARDANDO APROVAÇÃO` (lista única) / falhas.
6. Diff `baseline_antes` × `baseline_depois` provando que em produção só mudou o aprovado/autônomo.
7. `grep -rEi '(@[a-z0-9-]+\.[a-z]{2,}|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\+?55\d{10,11}|eyJ[A-Za-z0-9_-]{20,}|sk-|service_role|postgres://)' auditoria-supabase/` sem resultado ou só falsos positivos justificados.
8. Caminhos de todos os arquivos.
9. Bloco `Próximos passos` com exatamente 3 itens, por impacto, executáveis via MCP; `1`, `1 e 3`, `APROVADO 2`, `todos` ou o bloco colado = executar na ordem.

---

## 11. Goals prontos (≤ 4.000 caracteres — cole no Claude Code no repo `Zapp_Web_V2`)

**Sessão 1 — Fase 0 + Fase A:**
```
/goal Executar as FASES 0 e A de .claude/commands/auditoria-supabase.md no projeto Supabase tnnnlkbymytvtqngbbqh usando SOMENTE o MCP "SUPABASE - ZAPP WEB V2 - MCP" (confirme com ping; MCPs Lovable uqysyzndkfiwfztbqvsl/vpkmqeumtxhrwgawxdrl e bancos externos pgxfvjmuubtbowutlide/doufsxqlfjyuvxuezpln são proibidos) e o repo adm01-debug/Zapp_Web_V2. Leia antes CLAUDE.md, AGENTS.md, CONTRIBUTING.md, scripts/db-audit/README.md e auditoria-supabase/ em main. NÃO refaça a auditoria: consolide os achados de main, PR #2462, PR #2414 e PR #2186 em achados.json (ZW-nnnn, sem duplicata, ligados às PRs abertas #2265, #2481, #2277, #2245, #2491, #2186 e às de feature #2460/#2473/#2487/#2476/#2471/#2485), reexecute em produção todo CRÍTICO/ALTO, triagem de cada PR aberta, e cubra só as lacunas (A.2–A.14, em especial A.13 pendentes/parciais e A.14 cobertura das guardas). Produção somente leitura (regra 2); auth_list_users proibido; Postgres temporário só via scripts/db-audit/replay-local.sh. Rode as guardas de scripts/db-audit antes de qualquer SQL próprio. Não iniciar a Fase B. META CUMPRIDA só com os itens 1, 2, 3, 4, 6, 7 e 8 da seção 10 no chat e os entregáveis da seção 8 salvos (exceto correcoes.md). Pare após 80 turnos e reporte o que faltou.
```

**Sessão 2 — Fase B (após você ler o relatório e preencher LIBERADOS):**
```
/goal Executar a FASE B de .claude/commands/auditoria-supabase.md usando auditoria-supabase/achados.json, RELATORIO_AUDITORIA_SUPABASE.md, progresso.json e propostas/ como fonte única — não refazer a auditoria. Ordem: PR já aberta antes de PR nova; CRÍTICO→ALTO→MÉDIO→BAIXO; PENDENTE/PARCIAL antes de INTEGRIDADE/PERFORMANCE. AUTÔNOMA (edge R0/R1, types.ts, nomes de rpc/from/invoke, manifestos, testes novos, consolidação de auditoria-supabase/, migration nova NÃO aplicada, merge de PR aberta com veredito MERGEAR que não toca banco/edge R2): branch + PR + 6 checks + squash-merge + confirmar deploy-functions.yml + verificação. APROVAÇÃO (qualquer DDL/DML em produção incluindo ledger, REVOKE/GRANT, policies, crons, DROP, edge R2, verify_jwt, segredos, afrouxar guardas): PR pronta, rebaseada, testada via replay-local.sh, NÃO aplicada; DDL só por db-migrate.yml apply=false com aprovação humana em producao-ddl. Branch de outra sessão é somente leitura: para avançar, branch nova a partir dela com "supersede #n". JÁ LIBERADOS: [IDs/PRs ou "nenhum"]. Uma única chamada "AGUARDANDO APROVAÇÃO: <ZW (#PR)>" no fim. META CUMPRIDA só com correcoes.md preenchido, itens 5, 6, 7 e 9 da seção 10 no chat e baseline_depois.json regenerado. Pare após 80 turnos.
```
