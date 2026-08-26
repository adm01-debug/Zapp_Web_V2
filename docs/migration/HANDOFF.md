# HANDOFF — Migração ZAPP WEB V2 (Lovable Cloud → Supabase Cloud novo + VPS Hostinger)

Gerado: 2026-08-26 ~19:40 UTC · De: Claude (sessão 1) · Para: Claude (sessão 2) · Dono: Joaquim / Promo Brindes
Este arquivo é a fonte de verdade da migração. Leia inteiro antes de executar qualquer coisa. Atualize a seção 5 (status) a cada etapa concluída.

---
## 0. Como começar (kickoff da sessão nova)
1. `tool_search` para carregar: `code_exec`, `code_read_file`, `src_query`, `db_query` (SUPABASE - ZAPP WEB V2 - MCP), `cf_worker_deploy`, `cf_secret_list`, `github_put_file`, `github_push_files`, `github_create_branch`, `VPS_getVirtualMachinesV1`.
2. Ler este arquivo (`code_read_file /workspace/notes/zapp-web-v2-migration-handoff.md`) e `/workspace/tmp/migration/*` (fingerprints + diff).
3. Conferir estado real antes de agir (regra 7 do Joaquim): `ssh` na VPS (lab `zapp-replay`), `curl` no worker `/health` (deve responder `version 1.1.0, tools 77`), `db_migrations` no destino (deve estar vazio).
4. Perguntar ao Joaquim SOMENTE o que está marcado como GATE/DECISÃO. Tudo o que está marcado ⏳ sem gate: executar.
5. Respostas em PT-BR, resultado primeiro, diff mínimo, sem hedging, fechar com bloco `Próximos passos` (exatamente 3, executáveis via MCP).

## 1. Contrato de trabalho (resumo das regras do Joaquim)
- Execução end-to-end via MCP; nunca "copie e cole". Decidir como dev sênior; perguntar só para custo, arquitetura, dado destrutivo em produção, trade-off real.
- Verdade acima de validação: nunca dizer que testou o que não rodou. Zero churn: não refatorar o que não foi pedido.
- `APROVADO` = executar exatamente o plano. Diagnóstico antes de patch (ler logs/estado real).
- Origem `vpkmqeumtxhrwgawxdrl` é SOMENTE LEITURA desde a etapa 3. Nada é criado/alterado/apagado sem autorização explícita — inclusive no destino quando destrutivo.
- Nenhum segredo em repo, nota ou chat (os que vazaram no chat 1 estão listados na seção 3 para rotação na etapa 97).

## 2. Identidades e endereços
| Item | Valor |
|---|---|
| ORIGEM (Lovable Cloud, read-only) | `https://vpkmqeumtxhrwgawxdrl.supabase.co` — acesso só via MCP `src_query` (role postgres, DDL/DML bloqueados) |
| DESTINO (Supabase Cloud novo, confirmado pelo Joaquim) | `https://tnnnlkbymytvtqngbbqh.supabase.co` · ref `tnnnlkbymytvtqngbbqh` · região `us-west-2` (Joaquim não pediu mudança → fica) · PG 17.6 |
| Pooler destino | `aws-0-us-west-2.pooler.supabase.com:5432` (session) — usado por `/workspace/tmp/pgcli/sql.js` |
| Repo app | `https://github.com/adm01-debug/zapp-web-v2` (branch de trabalho prevista: `feat/fresh-install-hostinger`, ainda NÃO criada) |
| Repo do worker MCP | `https://github.com/adm01-debug/supabase-lovable-mcp` — `workers/zapp-web-v2/worker.js` |
| Worker MCP do destino | `supabase-zapp-web-v2-mcp` (Cloudflare) · `https://supabase-zapp-web-v2-mcp.adm01.workers.dev/<MCP_TOKEN>/mcp` · v1.1.0 · 77 tools · conector Claude: "SUPABASE - ZAPP WEB V2 - MCP" |
| Worker de auditoria (origem) | `supabase-zapp-audit-mcp` · conector "MCP - SUPABASE / LOVABLE CLOUD - ZAPP WEB V2" · secrets: FIREBASE_API_KEY, LOVABLE_REFRESH_TOKEN, WORKER_BEARER (lê a origem pela API do Lovable). NÃO tem `DEST_MCP_*` → `dest_query`/`audit_diff` não funcionam; o diff é feito por fingerprint (seção 11) |
| VPS Hostinger | KVM 4 · `srv1481814.hstgr.cloud` · `187.77.151.129` · Docker + Traefik v3.6 (`traefik:latest`) · Docker Manager (projetos) · sshd ainda com PasswordAuthentication yes / PermitRootLogin yes |
| Evolution GO (já instalada na VPS) | projeto Docker Manager `evolution-go-rxj2` · porta 4000 · `https://evolution-go-rxj2.srv1481814.hstgr.cloud` · GLOBAL_API_KEY no env do projeto (ler com `VPS_getProjectContentsV1`) · imagem `:latest` (pinar na etapa 87) |
| Container claude-code (VPS AtomicaBR) | workspace `/workspace` · sem python3 · shell dash · git push QUEBRADO (`/workspace/.git-credentials` 0 bytes) |
| Lab de replay | VPS Hostinger, container `zapp-replay` (`supabase/postgres:17.6.1.166`, `127.0.0.1:15432`, senha `replay`), scripts em `/root/` |

## 3. Credenciais — ONDE estão (nunca copiar valores para cá)
- Destino: `/root/.secrets/zapp-v2.env` no container claude-code (SUPABASE_URL, SUPABASE_REF, ANON_KEY, SERVICE_ROLE_KEY, PUBLISHABLE_KEY, SECRET_KEY, PGPASSWORD, DATABASE_URL). Carregar com `set -a; . /root/.secrets/zapp-v2.env; set +a`.
- Token do worker MCP: `/root/.secrets/zapp-v2-mcp-token`.
- SSH da VPS Hostinger: `/root/.ssh/hostinger_vps` (`ssh -i ~/.ssh/hostinger_vps -o BatchMode=yes root@187.77.151.129`).
- Evolution GO: env do projeto `evolution-go-rxj2` via Hostinger MCP.
- Supabase PAT do dono do destino: NÃO EXISTE ainda — Joaquim fornece na etapa 57 (deploy de edge functions/secrets). Guardar em `/root/.secrets/`.
- Rotação obrigatória (etapa 97) — vazaram no chat 1: service_role e sb_secret_ do destino, senha do Postgres do destino, MCP_TOKEN do worker, GLOBAL_API_KEY e POSTGRES_PASSWORD da Evolution GO.

## 4. Ferramentas MCP — qual usar para quê + armadilhas
- `CLAUDE CODE - VPS - MCP:code_exec` — shell no container claude-code. `working_dir` PRECISA existir antes (senão "chdir failed"). Comandos >~100 s dão `error code: 524` (gateway) mas continuam rodando: usar `nohup … &` e consultar depois. Sem bashisms.
- `MCP - SUPABASE / LOVABLE CLOUD - ZAPP WEB V2:src_query` — SELECT na origem. Retorna JSON no contexto: use `string_agg`/`md5` para saída compacta. `relkind`/`defaclobjtype` são `"char"`: castar `::text`. Não existe `supabase_functions.hooks` na origem.
- `SUPABASE - ZAPP WEB V2 - MCP:*` (destino, worker v1.1.0): `db_query` (raw JSON, bigint íntegro, timeout 120 s, multi-statement OK), `db_transaction` (array JSON de statements → `mcp_exec_many`, atômico, resultado por statement), `db_batch_query` (array JSON), `db_apply_migration` (registra em `supabase_migrations.schema_migrations`, versão sem colisão), `storage_*`, `auth_*`, `functions_*`. Alternativa direta: `node /workspace/tmp/pgcli/sql.js -f arquivo.sql` (pooler, role postgres, sem PostgREST).
- `CLOUDFLARE - MCP - WORKERS:cf_worker_deploy` — deploy via API preserva secrets (comprovado). `cf_secret_list/put` para secrets.
- `GITHUB - MCP - FOREVER:*` — única forma de escrever nos repos `adm01-debug` (git push do container está quebrado; MCP GitHub padrão dá 403). GitHub Actions da conta está SEM BUDGET → CI não roda.
- `HOSTINGER - MCP:VPS_*` — Docker Manager (`VPS_createNewProjectV1`, `VPS_getProjectLogsV1`, `VPS_updateProjectV1`, `VPS_createSnapshotV1`, firewall). Descobrir `virtualMachineId` com `VPS_getVirtualMachinesV1`.
- `Lovable:query_database` (MCP oficial) — alternativa de leitura da origem se o worker de auditoria cair.
- `PORTAINER - MCP` é da VPS AtomicaBR (NÃO da Hostinger). Hostinger só via ssh/Hostinger MCP.
- Bug conhecido: `supabase_apply_migration` do MCP self-hosted (coluna `executed_at`) — não se aplica ao destino (worker próprio), mas não usar aquele MCP aqui.

## 5. Estado atual (26/08 19:40 UTC)
### FEITO (com evidência)
- Gate 0: destino = `tnnnlkbymytvtqngbbqh` (Joaquim: "ESSE É O CERTO"). Região fica us-west-2. Lab na VPS autorizado implicitamente ("USE OS MCPS").
- Etapa 9 ✅ `public.mcp_exec(sql, max_rows)` v2.1 no destino: cursor-first; qualquer erro do cursor (exceto `query_canceled`/`lock_not_available`) cai em `EXECUTE`; SECURITY DEFINER, `search_path=pg_catalog,public`, EXECUTE só service_role. DDL em `/workspace/tmp/pgcli/mcp_exec_v2.sql`. Provado via RPC: comentário+select devolve linhas, INSERT…RETURNING devolve linhas, multi-statement dependente (create+insert) OK, 42P01/42601 sobem intactos.
- Etapa 10 ✅ `ALTER ROLE service_role SET statement_timeout='120s'` — `pg_sleep(12)` via RPC passa; worker remoto mostra `statement_timeout=2min`.
- Etapa 11 ✅ `public.mcp_exec_many(statements text[], max_rows int)` — 1 transação, resultado por statement, erro reverte tudo (provado). DDL em `/workspace/tmp/pgcli/mcp_exec_many.sql`.
- Etapa 12 ✅ Worker v1.1.0 DEPLOYADO (deployment `bc9555dea9574aa0ba4e4d055c7c26dd`, etag `8a522154…`). Commit local feito em `/workspace/repos/supabase-lovable-mcp` (msg "fix(zapp-web-v2): v1.1.0 — …"), PUSH PENDENTE (git creds do container zeradas). Harness: `/workspace/tmp/wtest2.mjs` contra `/workspace/tmp/w.mjs` (cópia idêntica do worker.js) — todos os casos OK.
- Etapa 13 ✅ harness v1.1 executado (bigint, transaction, batch, migration versão, slow_queries, export).
- Etapa 14 ⚠️ não aplicável: worker de auditoria não tem `DEST_MCP_*` (ver seção 2). Substituído pelo diff por fingerprint.
- Etapa 15 ✅ `graphify update . --force` rodado em `/workspace/repos/zapp-web-v2` (`graphify-out/GRAPH_REPORT.md`). Usar `graphify explain "<tabela>"` nas etapas 24/56.
- Etapa 17 ✅ parcial: fingerprints da origem (md5 por objeto) em `/workspace/tmp/migration/source-fp.txt` (COLS, CONS, IDX, POL, TRG, VIEW, ENUM, EXT, CRON, PUB, FN) + grants/defpriv/dbset/storage policies/schemas colhidos (ver seção 8). DDL completo NÃO extraído (só necessário para objetos divergentes — próximo passo 2).
- Etapas 18–20 ✅ lab `zapp-replay` na VPS: 267 migrations → 243 OK / 24 FAIL, 124 tabelas em public. Log `/root/zapp-replay/replay2.log`, fingerprints `/root/zapp-replay/replay-fp.txt` (cópia em `/workspace/tmp/migration/replay-fp.txt`). Shim do storage em `/root/storage-shim.sql` (a imagem não traz `storage.buckets/objects`; rodar shim como `supabase_admin -d postgres`).
- Etapa 21 ✅ Diff A calculado (`node /workspace/tmp/migration/diff.js`) e classificado — seção 8.
### PENDENTE
- Gate 1 (etapa 28): D1–D6 da seção 9 aguardam `APROVADO` do Joaquim.
- Etapa 1: persistir plano em `docs/migration/PLANO.md` (branch) — não feito. Etapa 4: `docs/migration/DECISIONS.md` — conteúdo pronto na seção 9, arquivo não commitado. Etapa 5: branch não criada.
- Etapa 16 (GATE): hardening SSH da VPS.
- Etapas 22–27, 29–100: não iniciadas.
- Push do worker v1.1.0 para o repo (via `github_put_file` em `workers/zapp-web-v2/worker.js`, conteúdo = `/workspace/repos/supabase-lovable-mcp/workers/zapp-web-v2/worker.js`, sha256 do arquivo: conferir com `sha256sum`).

## 6. Inventário de artefatos
### Container claude-code (`/workspace`)
- `/workspace/repos/zapp-web-v2` — clone do app (267 migrations em `supabase/migrations`, 62 edge functions em `supabase/functions`, `supabase-export/` defasado de 2026-05-12, `graphify-out/`).
- `/workspace/repos/supabase-lovable-mcp/workers/zapp-web-v2/worker.js` — worker v1.1.0 (commit local à frente de origin/main).
- `/workspace/tmp/pgcli/sql.js` (executor SQL direto via `DATABASE_URL`; `-f arquivo` ou `-c "sql"`), `mcp_exec_v2.sql`, `mcp_exec_many.sql`.
- `/workspace/tmp/w.mjs` + `/workspace/tmp/wtest2.mjs` (harness local do worker; exporta env de `/root/.secrets/zapp-v2.env` + `MCP_TOKEN`).
- `/workspace/tmp/migration/source-fp.txt`, `replay-fp.txt`, `diff.js`.
- `/workspace/tmp/audit/agent{1..5}-report.md` — relatórios da auditoria (PASS 161 · FAIL 21 · GAP 28).
- `/workspace/tmp/storage-shim.sql`, `/workspace/tmp/fp.sql`, `/workspace/tmp/replay.sh`, `/workspace/tmp/replay2.sh` (cópias dos scripts do lab).
- `/workspace/tmp/graphify.log`.
### VPS Hostinger (`/root`)
- `/root/zapp-build-test/` — clone do repo + `Dockerfile`, `docker/nginx.conf`, `docker-compose.yml`, `.dockerignore` validados (imagem `zapp-web-v2:test` construída; nginx -t OK, SPA fallback, gzip, 196 `.map` dentro da imagem = 14 MB a remover).
- `/root/zapp-replay/` — lab (`replay.log` = 1ª rodada sem shim, `replay2.log` = rodada válida, `replay-fp.txt`, `tables.txt`, `last.out`).
- `/root/storage-shim.sql`, `/root/fp.sql`, `/root/replay.sh`, `/root/replay2.sh` (já com `-U supabase_admin -d postgres` no shim).
- Deploy key do GitHub instalada para clone do `zapp-web-v2` (somente leitura).
### Destino (`tnnnlkbymytvtqngbbqh`)
- Schema public: SÓ `mcp_exec`, `mcp_exec_many` (nada do app ainda). `supabase_migrations.schema_migrations(version, statements, name)` existe e está vazia (testes de migração foram limpos). Setting de role: service_role statement_timeout 120s.
### Cloudflare
- Worker `supabase-zapp-web-v2-mcp` v1.1.0 (secrets SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, MCP_TOKEN). Repo do worker sem `CF_API_TOKEN` no GitHub (só `CF_ACCOUNT_ID`) → deploy sempre por `cf_worker_deploy`.

## 7. Achados da auditoria (5 agentes) — o que ainda importa
- Agente 1 (protocolo): auth OK (401 sem token), sem injeção via `ID()/L()`, JWT nunca vaza. Corrigidos no v1.1.0: batch JSON-RPC. GAPs abertos: sem teto de tamanho por linha; `max_rows` sem validação estrita; `schema` ignorado em `db_select` fora de public (backlog etapa 99).
- Agente 2 (PostgreSQL): corrigido em v2.1. PostgREST demora ~1–2 s para recarregar schema após DDL (`notify pgrst,'reload schema'` já está nos scripts).
- Agente 3 (VPS): sshd inseguro (etapa 16); Traefik `:latest`; `.map` na imagem; docker-compose OK com Traefik v3.6; ~13 GB de imagens recuperáveis (`docker system prune` só com APROVADO); sem firewall_group na Hostinger; portas 32771/48592 publicadas direto (outros projetos).
- Agente 4 (worker/CI): 77 tools 1:1; CI bloqueada por "Actions budget"; `CF_API_TOKEN` ausente; wrangler dry-run OK (41 KB / 11 KB gzip).
- Agente 5 (frontend): `src/integrations/supabase/client.ts` e `externalClient.ts` hardcoded para `supabase.atomicabr.com.br` (comentário diz para ignorar env porque o Lovable injeta `vpkm…`); 4 refs de projeto no código: `vpkm…` (config.toml), `allrjhkpuscmgbsnmjlv` (fallback hardcoded no trigger `notify_sicoob_on_reply` + `.env.example`), `atomicabr` (client/.env.production), `pgxfvjmuubtbowutlide` (`clientesClient.ts`, código morto com credenciais); `verify_jwt` não definido por function no config.toml; `index.html` com preconnect órfão `rqmbchomazwsaupnuduf`; build OK (bun 5,4 s install + 14,3 s build); `tsc` 3 erros pré-existentes; testes 2463/2496 (1 timeout); `ci.yml` usa `npm ci` mas só existe `bun.lock` e tem job `audit-report` fora de `jobs:`; `.nvmrc` ausente (Node 20.19.0); 28 secrets únicos nas 62 functions (lista completa no agent5-report.md; inclui SUPABASE_*, EVOLUTION_API_URL/KEY, LOVABLE_API_KEY, ELEVENLABS_*, GOOGLE_*, MAPBOX_PUBLIC_TOKEN, RESEND_API_KEY).

## 8. Baseline da origem + Diff A (origem viva × replay das migrations)
Contagens origem: 122 tabelas · 64 funções · 335 policies (120 tabelas com policy; `contact_tags` e `contact_custom_fields` têm RLS ligado e ZERO policies) · 54 tabelas com trigger · 7 views · 4 enums · 8 extensões (pg_cron 1.6.4, pg_net 0.20.0, pg_stat_statements, pg_trgm, pgcrypto, plpgsql, supabase_vault, uuid-ossp) · 1 cron (`cleanup-link-preview-cache`, `0 3 * * *`, ativo) · publication `supabase_realtime` = messages, queue_members, queues · 7 buckets (audio-memes/pub, audio-messages, avatars/pub, custom-emojis/pub, stickers/pub, team-chat-files, whatsapp-media) com 23 policies em storage.objects · grants: todas as tabelas/views com o mesmo hash 388594fd (anon/authenticated/service_role ALL) · role settings: anon 3s, authenticated 8s, authenticator 8s+lock 8s+safeupdate, DB `app.settings.jwt_exp=3600`, `idle_in_transaction_session_timeout=15min` · schemas: auth, cron, extensions, graphql, graphql_public, net, public, realtime, storage, supabase_migrations, vault · dados ≈60 linhas (3 auth users, 2 profiles, 2 user_roles, 2 agent_stats, 7 messages, 50 métricas), 0 objetos em storage.
Replay (repo, 267 migrations): 243 OK / 24 FAIL, 124 tabelas.

| Categoria | Origem | Replay | Só origem | Só replay | Divergentes |
|---|---|---|---|---|---|
| COLS | 122 | 124 | 0 | contacts, email_attachments | email_labels, email_messages, email_threads, entity_versions, gmail_accounts, messages, saved_filters |
| CONS | 122 | 124 | 0 | contacts, email_attachments | 39 tabelas (FKs para contacts + cadeia gmail/email) |
| IDX | 122 | 124 | 0 | contacts, email_attachments | audit_logs, email_messages, email_threads, entity_versions, gmail_accounts, saved_filters |
| POL | 120 | 124 | 0 | contact_custom_fields, contact_tags, contacts, email_attachments | 20 tabelas (ai_conversation_tags, audit_logs, chatbot_executions, connection_health_logs, contact_notes, conversation_analyses, conversation_events, conversation_sla, email_*, entity_versions, followup_executions, gmail_accounts, message_reactions, messages, queue_positions, saved_filters, webhook_rate_limits, whatsapp_connection_queues) |
| TRG | 54 | 55 | 0 | contacts | email_threads, gmail_accounts, saved_filters |
| VIEW | 7 | 6 | gmail_accounts_safe | 0 | 0 |
| ENUM | 4 | 4 | 0 | 0 | 0 |
| FN | 64 | 68 | get_own_gmail_accounts(), log_audit_event(…) | admin_criar_usuario_painel, fn_process_pending_scans, fn_purge_processed_webhook_events, fn_trg_security_check_media_queue, update_gmail_updated_at, update_saved_filters_updated_at | ensure_single_default_filter() |
| CRON | 1 | 0 | cleanup-link-preview-cache | — | — |
| PUB | 3 tabelas | 8 tabelas | — | conversation_sla, email_messages, email_threads, message_reactions, notifications | — |

Classificação (evidência: `replay2.log` + greps no repo):
A. PERDA REAL NA ORIGEM — `contacts` dropada em 26/08 ("security test"); cascata: FKs para contacts sumiram em ~30 tabelas, policies de `contact_tags`/`contact_custom_fields` derrubadas (tabelas inacessíveis), 6 funções que referenciam contacts (`search_contacts`, `auto_assign_contact`, `is_contact_visible_to_user`, `contacts_count_by_type`, `normalize_contact_phone`, `skill_based_assign`) quebram em runtime.
B. DRIFT DO REPO (11 migrations com nome manual, nunca rodaram na origem — Lovable só aplica as UUID):
   - 3 retro-datadas que colidem com Lovable posteriores: `20241231000000_saved_filters.sql`, `20241231000001_entity_versions.sql`, `20260403024714_gmail_integration.sql`. No replay rodam antes e causam 16 FAILs em cascata (`20260315172343` created_at, `20260403105341` gmail_accounts already exists, 14× `column user_id does not exist` em 20260404…20260412, `20260404165134` view gmail_accounts_safe, `20260511233517`). Explicam TODAS as divergências de gmail_accounts/email_*/entity_versions/saved_filters/view/funções get_own_gmail_accounts+log_audit_event.
   - 7 do lote junho/2026 para o self-hosted AtomicaBR/v3 (tabelas `evolution_messages_wpp2`, `conversations`, `outbound_message_queue`, cron `purge-processed-webhook-events`): `20260611120000_fix_media_security_file_size`, `20260612110000_index_cleanup_and_autovacuum`, `20260612120000_rate_limit_admin_criar_usuario`, `20260612140000_add_missing_performance_indexes`, `20260612141500_purge_processed_webhook_events_cron`, `20260612150000_audit_index_cleanup`, `20260612160000_fk_indexes_and_cleanup`. Funções só-replay `admin_criar_usuario_painel`, `fn_process_pending_scans`, `fn_purge_processed_webhook_events`, `fn_trg_security_check_media_queue` vêm daí.
   - `20260412230000_fix_rls_policies_security.sql`: aplicou no lab, não existe na origem — hardening não versionado no Lovable (policies divergentes em audit_logs, connection_health_logs, webhook_rate_limits, whatsapp_connection_queues, queue_positions…).
C. CONFIG FORA DE MIGRATION — cron `cleanup-link-preview-cache` criado à mão na origem; publication realtime: origem 3 tabelas, migrations declaram 8+ (`ADD TABLE` em 20260319134046, 20260402130912, 20260403024714, 20260406201803, 20260409000457, 20260413123216, 20260628110559). Front assina: messages, team_messages, whatsapp_connections, contacts, talkx_campaigns, security_alerts, message_reactions, conversation_sla (e sales/customers/evolution_messages/company_rfm_scores — código morto do CRM/v3). `20260628110559` falha no replay por idempotência ("queues já é membro").
Também: `20260401002519_b7df7d1f…` contém `DROP TABLE … contacts` (verificar: drop+recreate ou tabela relacionada) — checar antes de D1.

## 9. DECISIONS.md — Gate 1 (todas PENDENTES; Joaquim responde por id)
| ID | Decisão proposta | Impacto |
|---|---|---|
| D1 | Restaurar `contacts` + FKs + policies de `contact_tags`/`contact_custom_fields` no destino a partir das migrations Lovable | corrige a perda A |
| D2 | Aplicar no destino SOMENTE migrations Lovable (UUID) — excluir as 3 retro-datadas e as 7 de junho | paridade com a origem; replay limpo esperado 257/257 |
| D3 | Manter `20260412230000_fix_rls_policies_security` (hardening) | quebra paridade estrita, ganha segurança |
| D4 | Recriar cron `cleanup-link-preview-cache` (`0 3 * * *` → `select public.cleanup_link_preview_cache()`) | paridade C |
| D5 | Publication realtime = tabelas que o front assina e existem (messages, team_messages, whatsapp_connections, contacts, talkx_campaigns, security_alerts, message_reactions, conversation_sla) + queues, queue_members (e demais declaradas nas migrations) | funcionalidade > paridade |
| D6 | Manter lab `zapp-replay` na VPS até o Gate 2 | re-validar cada lote |
Gates seguintes: 16 (SSH), 22 (descartar `supabase-export/`), 35 (recriar contacts), 50 (paridade), 51 (migrar ~60 linhas?), 57 (PAT), 60 (LOVABLE_API_KEY → provider próprio), 68 (remover clientesClient.ts), 77 (merge), 79 (budget Actions), 88 (firewall), 90 (go-live), 98 (congelar origem).

## 10. Plano de 100 etapas — status (✅ feito · ⏳ pendente · 🔒 gate)
Fase 0 — 1⏳ persistir plano em docs/migration/PLANO.md (branch) · 2✅ destino tnnn… · 3✅ origem read-only, baseline em source-fp.txt · 4⏳ DECISIONS.md (seção 9) · 5⏳ branch feat/fresh-install-hostinger · 6⏳ domínio: testar wildcard `*.srv1481814.hstgr.cloud` (`dig zapp.srv1481814.hstgr.cloud`), senão domínio próprio · 7⏳ planilha dos 28 secrets (fonte: agent5-report.md) · 8✅ credenciais a rotacionar listadas (seção 3).
Fase 1 — 9✅ · 10✅ · 11✅ · 12✅(push pendente) · 13✅ · 14⚠️N/A · 15✅ · 16🔒 SSH hardening (drop-in `/etc/ssh/sshd_config.d/99-hardening.conf`: PasswordAuthentication no, PermitRootLogin prohibit-password; validar as 2 chaves antes).
Fase 2 — 17⏳ DDL completo só dos divergentes → `docs/migration/source-ddl/` · 18✅ · 19✅ · 20✅ · 21✅ · 22🔒 Diff B export×replay (recomendar descartar export) · 23⏳ dependências de infra antiga no SQL (`notify_sicoob_on_reply`, `net.http_post`, URLs atomicabr) · 24⏳ matriz function×tabela (graphify + grep `.from("…")`) · 25⏳ decisão por ref de projeto no código · 26⏳ inventário Evolution API v2 × Evolution GO (endpoints de `_shared/evolution*`) · 27⏳ inventário auth/storage não-SQL da origem · 28🔒 GATE 1.
Fase 3 (destino) — 29⏳ pré-checks (PG 17.6, extensões, região) · 30⏳ extensões · 31⏳ default privileges/grants iguais à origem (seção 8 DEFPRIV: postgres→anon/authenticated/service_role arwdDxtm em public) · 32⏳ migrations em lotes de 20 pelo pooler (`sql.js`), 1 transação por lote, `schema_migrations.version` = timestamp do arquivo · 33⏳ fail-fast · 34⏳ `ALTER DATABASE postgres SET app.settings.supabase_url='https://tnnnlkbymytvtqngbbqh.supabase.co'` (+ service_role via Vault, decisão) · 35🔒 recriar contacts · 36⏳ cron (D4) · 37⏳ 7 buckets + 23 policies storage.objects · 38⏳ publication (D5) · 39⏳ auth config (site_url, redirects, providers) · 40⏳ role/db settings (seção 8 DBSET) · 41–48⏳ views/enums/sequences/índices/constraints/policies/funções/triggers 1:1 por fingerprint (fp.sql) · 49⏳ PARITY-REPORT.md · 50🔒 GATE 2.
Fase 4 (dados) — 51🔒 migrar ~60 linhas? · 52⏳ export/import topológico (`SET CONSTRAINTS ALL DEFERRED`) · 53⏳ 3 auth users via `auth_create_user` + `auth_generate_link recovery` · 54✅(0 objetos) · 55⏳ counts origem×destino · 56⏳ seed mínimo.
Fase 5 (functions/Evolution) — 57🔒 PAT · 58⏳ config.toml (project_id + verify_jwt=false nas webhook: evolution-webhook, gmail-webhook, sicoob-bridge-*) · 59⏳ deploy 62 functions (`_shared` primeiro) · 60🔒 secrets (LOVABLE_API_KEY) · 61⏳ smoke por function · 62⏳ webhook Evolution GO → `/functions/v1/evolution-webhook` · 63⏳ paridade Evolution GO · 64⏳ trigger sicoob via `net._http_response` · 65⏳ cron job_run_details · 66🔒 GATE 3.
Fase 6 (código) — 67⏳ client.ts/externalClient.ts via `import.meta.env` com fallback=destino · 68🔒 remover clientesClient.ts + preconnect órfão · 69⏳ .env.production/.env.example · 70⏳ Dockerfile ARG/ENV VITE_* + `find dist -name '*.map' -delete` · 71⏳ nginx headers · 72⏳ .nvmrc 20.19.0 + ci.yml (bun) · 73⏳ compose/.dockerignore no repo · 74⏳ registrar tsc/testes pré-existentes · 75⏳ graphify commit · 76⏳ PR único + review por agente · 77🔒 merge · 78⏳ tag v2.0.0-hostinger.
Fase 7 (VPS) — 79🔒 budget Actions · 80⏳ projeto Docker Manager `zapp-web-v2` (repo + env ZAPP_DOMAIN, VITE_*) · 81⏳ build/health/Traefik/LE · 82⏳ E2E HTTP · 83⏳ fluxo real de usuário · 84⏳ observabilidade (query_logs, docker logs, n8n health) · 85⏳ snapshot VPS + backups · 86⏳ runbook redeploy (`VPS_updateProjectV1`) · 87⏳ Evolution GO: pinar imagem, backup volumes, instância nova (QR) · 88🔒 firewall · 89🔒 prune + traefik v3.6 pinado · 90🔒 GATE 4.
Fase 8 — 91⏳ diff final = 0 · 92⏳ smoke completo · 93⏳ carga leve (autocannon) → BASELINE.md · 94⏳ RUNBOOK/PARITY/DECISIONS fechados · 95⏳ cérebro (claude-cerebro) · 96⏳ grep vínculos antigos = 0 (`atomicabr`, `allrjhk…`, `rqmb…`, `wpp2`) · 97⏳ rotação de credenciais · 98🔒 congelar origem/Lovable · 99⏳ backlog residual (CSP, chunks >500 kB, tsc, teste timeout, db_select schema) · 100⏳ revisão de 7 dias.

## 11. Procedimentos prontos
### 11.1 Lab de replay (VPS Hostinger)
```sh
# recriar do zero (container efêmero, 127.0.0.1 apenas)
ssh -i ~/.ssh/hostinger_vps -o BatchMode=yes root@187.77.151.129 'nohup /root/replay2.sh > /root/replay2.nohup 2>&1 &'
# ~2 min; acompanhar
ssh -i ~/.ssh/hostinger_vps -o BatchMode=yes root@187.77.151.129 'tail -1 /root/zapp-replay/replay2.log; grep "^FAIL" /root/zapp-replay/replay2.log | cut -c6-200'
# psql direto no lab
docker exec -i zapp-replay psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f - < arquivo.sql
```
replay2.sh lê `/root/zapp-build-test/supabase/migrations/*.sql` em ordem de nome. Para validar D2: criar `/root/zapp-replay/migrations-lovable/` só com as UUID (+ 20260412230000 se D3) e apontar o loop para lá.
### 11.2 Fingerprint e diff
- `/root/fp.sql` (lab) e `/workspace/tmp/fp.sql` — mesma query usada na origem via `src_query` (11 categorias). Saída `K v...` com `psql -At -F ' '`.
- No destino: `node /workspace/tmp/pgcli/sql.js -f /workspace/tmp/fp.sql` (adaptar saída para o mesmo formato) ou via MCP `db_query` categoria por categoria.
- `cd /workspace/tmp/migration && node diff.js` compara `source-fp.txt` × `replay-fp.txt` (trocar o 2º arquivo por `dest-fp.txt` na etapa 49).
### 11.3 Aplicar lote no destino
```sh
cd /workspace/tmp/pgcli && set -a && . /root/.secrets/zapp-v2.env && set +a
# um arquivo por vez, dentro de transação, registrando a versão:
node sql.js -c "begin; $(cat /caminho/20260101000000_xxx.sql); insert into supabase_migrations.schema_migrations(version,name,statements) values ('20260101000000','xxx',array['<sql>']); commit;"
```
Preferir escrever um runner `apply-batch.js` (Node, usa `pg`, BEGIN/COMMIT por lote de 20, para no 1º erro, grava versão = 14 dígitos do nome do arquivo). Nunca editar migration histórica; corrigir ambiente (extensão, role, ordem).
### 11.4 Rollback do destino (nada do app existe ainda)
`drop schema public cascade; create schema public; grant all on schema public to postgres, anon, authenticated, service_role;` e reaplicar `mcp_exec_v2.sql` + `mcp_exec_many.sql` (+ `truncate supabase_migrations.schema_migrations`). Só com APROVADO depois que houver dado.
### 11.5 Worker
- Patch: editar `/workspace/repos/supabase-lovable-mcp/workers/zapp-web-v2/worker.js`, `node --check`, `cp` para `/workspace/tmp/w.mjs`, `cd /workspace/tmp && set -a; . /root/.secrets/zapp-v2.env; set +a; export MCP_TOKEN=$(cat /root/.secrets/zapp-v2-mcp-token); node wtest2.mjs`.
- Deploy: `cf_worker_deploy(name=supabase-zapp-web-v2-mcp, compatibility_date=2025-01-01, code=<arquivo inteiro>)`; verificar `curl https://supabase-zapp-web-v2-mcp.adm01.workers.dev/health`.
- Repo: `github_put_file` (GITHUB - MCP - FOREVER) com o conteúdo do arquivo.
### 11.6 Origem (leitura)
`src_query` com `string_agg`/`md5` para saídas compactas; DDL completo de um objeto: `select pg_get_functiondef('public.f(args)'::regprocedure)`, `pg_get_viewdef`, `pg_get_constraintdef`, `pg_indexes.indexdef`, `pg_get_triggerdef`, `pg_policies`.

## 12. Riscos e pegadinhas
- `code_exec` >100 s → 524; sempre `nohup` + poll. `working_dir` inexistente → falha antes de rodar.
- Shim do storage precisa rodar como `supabase_admin -d postgres` (schema `storage` é de `supabase_storage_admin`).
- pg_net na origem 0.20.0 × lab (versão diferente) — irrelevante para paridade.
- `mcp_exec` cursor-first: statement que falha no cursor por planejamento (multi-statement dependente) cai em EXECUTE — comportamento desejado; `query_canceled` não é retentado.
- Lovable injeta `vpkm…` no build: após a migração o Lovable deixa de ser alvo de deploy (decisão implícita em 67).
- Evolution GO ≠ Evolution API v2: paridade de endpoints ainda não provada (etapa 63).
- Não confundir PORTAINER (AtomicaBR) com a VPS Hostinger.

## 13. Próximos passos imediatos (ordem)
1. Ler este handoff + conferir estado real (worker /health, lab, destino vazio).
2. Se Joaquim já respondeu D1–D6: montar a lista de migrations do destino (UUID + eventuais manuais aprovadas), replicar no lab (`migrations-lovable/`), exigir 0 FAIL, salvar `replay3-fp.txt` e re-rodar diff.js contra a origem (esperado: só as diferenças classificadas como perda/hotfix).
3. Extrair DDL vivo da origem dos objetos divergentes (saved_filters, entity_versions, gmail_accounts, email_*, audit_logs, ensure_single_default_filter, get_own_gmail_accounts, log_audit_event, view gmail_accounts_safe) para confirmar estado vivo = versão Lovable.
4. Push do worker v1.1.0 para o repo via GitHub MCP; criar branch `feat/fresh-install-hostinger` e commitar `docs/migration/{HANDOFF,DECISIONS,PLANO}.md` (este arquivo é o HANDOFF).
5. Etapas 22–27 e Gate 1 → Fase 3.
