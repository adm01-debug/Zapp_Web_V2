# HANDOFF ‚Äî Migra√ß√£o ZAPP WEB V2 (Lovable Cloud ‚Üí Supabase Cloud novo + VPS Hostinger)

Gerado: 2026-08-26 ~19:40 UTC ¬∑ De: Claude (sess√£o 1) ¬∑ Para: Claude (sess√£o 2) ¬∑ Dono: Joaquim / Promo Brindes
Este arquivo √© a fonte de verdade da migra√ß√£o. Leia inteiro antes de executar qualquer coisa. Atualize a se√ß√£o 5 (status) a cada etapa conclu√≠da.

---
## 0. Como come√ßar (kickoff da sess√£o nova)
1. `tool_search` para carregar: `code_exec`, `code_read_file`, `src_query`, `db_query` (SUPABASE - ZAPP WEB V2 - MCP), `cf_worker_deploy`, `cf_secret_list`, `github_put_file`, `github_push_files`, `github_create_branch`, `VPS_getVirtualMachinesV1`.
2. Ler este arquivo (`code_read_file /workspace/notes/zapp-web-v2-migration-handoff.md`) e `/workspace/tmp/migration/*` (fingerprints + diff).
3. Conferir estado real antes de agir (regra 7 do Joaquim): `ssh` na VPS (lab `zapp-replay`), `curl` no worker `/health` (deve responder `version 1.1.0, tools 77`), `db_migrations` no destino (deve estar vazio).
4. Perguntar ao Joaquim SOMENTE o que est√° marcado como GATE/DECIS√ÉO. Tudo o que est√° marcado ‚è≥ sem gate: executar.
5. Respostas em PT-BR, resultado primeiro, diff m√≠nimo, sem hedging, fechar com bloco `Pr√≥ximos passos` (exatamente 3, execut√°veis via MCP).

## 1. Contrato de trabalho (resumo das regras do Joaquim)
- Execu√ß√£o end-to-end via MCP; nunca "copie e cole". Decidir como dev s√™nior; perguntar s√≥ para custo, arquitetura, dado destrutivo em produ√ß√£o, trade-off real.
- Verdade acima de valida√ß√£o: nunca dizer que testou o que n√£o rodou. Zero churn: n√£o refatorar o que n√£o foi pedido.
- `APROVADO` = executar exatamente o plano. Diagn√≥stico antes de patch (ler logs/estado real).
- Origem `vpkmqeumtxhrwgawxdrl` √© SOMENTE LEITURA desde a etapa 3. Nada √© criado/alterado/apagado sem autoriza√ß√£o expl√≠cita ‚Äî inclusive no destino quando destrutivo.
- Nenhum segredo em repo, nota ou chat (os que vazaram no chat 1 est√£o listados na se√ß√£o 3 para rota√ß√£o na etapa 97).

## 2. Identidades e endere√ßos
| Item | Valor |
|---|---|
| ORIGEM (Lovable Cloud, read-only) | `https://vpkmqeumtxhrwgawxdrl.supabase.co` ‚Äî acesso s√≥ via MCP `src_query` (role postgres, DDL/DML bloqueados) |
| DESTINO (Supabase Cloud novo, confirmado pelo Joaquim) | `https://tnnnlkbymytvtqngbbqh.supabase.co` ¬∑ ref `tnnnlkbymytvtqngbbqh` ¬∑ regi√£o `us-west-2` (Joaquim n√£o pediu mudan√ßa ‚Üí fica) ¬∑ PG 17.6 |
| Pooler destino | `aws-0-us-west-2.pooler.supabase.com:5432` (session) ‚Äî usado por `/workspace/tmp/pgcli/sql.js` |
| Repo app | `https://github.com/adm01-debug/zapp-web-v2` (branch de trabalho prevista: `feat/fresh-install-hostinger`, ainda N√ÉO criada) |
| Repo do worker MCP | `https://github.com/adm01-debug/supabase-lovable-mcp` ‚Äî `workers/zapp-web-v2/worker.js` |
| Worker MCP do destino | `supabase-zapp-web-v2-mcp` (Cloudflare) ¬∑ `https://supabase-zapp-web-v2-mcp.adm01.workers.dev/<MCP_TOKEN>/mcp` ¬∑ v1.1.0 ¬∑ 77 tools ¬∑ conector Claude: "SUPABASE - ZAPP WEB V2 - MCP" |
| Worker de auditoria (origem) | `supabase-zapp-audit-mcp` ¬∑ conector "MCP - SUPABASE / LOVABLE CLOUD - ZAPP WEB V2" ¬∑ secrets: FIREBASE_API_KEY, LOVABLE_REFRESH_TOKEN, WORKER_BEARER (l√™ a origem pela API do Lovable). N√ÉO tem `DEST_MCP_*` ‚Üí `dest_query`/`audit_diff` n√£o funcionam; o diff √© feito por fingerprint (se√ß√£o 11) |
| VPS Hostinger | KVM 4 ¬∑ `srv1481814.hstgr.cloud` ¬∑ `187.77.151.129` ¬∑ Docker + Traefik v3.6 (`traefik:latest`) ¬∑ Docker Manager (projetos) ¬∑ sshd ainda com PasswordAuthentication yes / PermitRootLogin yes |
| Evolution GO (j√° instalada na VPS) | projeto Docker Manager `evolution-go-rxj2` ¬∑ porta 4000 ¬∑ `https://evolution-go-rxj2.srv1481814.hstgr.cloud` ¬∑ GLOBAL_API_KEY no env do projeto (ler com `VPS_getProjectContentsV1`) ¬∑ imagem `:latest` (pinar na etapa 87) |
| Container claude-code (VPS AtomicaBR) | workspace `/workspace` ¬∑ sem python3 ¬∑ shell dash ¬∑ git push QUEBRADO (`/workspace/.git-credentials` 0 bytes) |
| Lab de replay | VPS Hostinger, container `zapp-replay` (`supabase/postgres:17.6.1.166`, `127.0.0.1:15432`, senha `replay`), scripts em `/root/` |

## 3. Credenciais ‚Äî ONDE est√£o (nunca copiar valores para c√°)
- Destino: `/root/.secrets/zapp-v2.env` no container claude-code (SUPABASE_URL, SUPABASE_REF, ANON_KEY, SERVICE_ROLE_KEY, PUBLISHABLE_KEY, SECRET_KEY, PGPASSWORD, DATABASE_URL). Carregar com `set -a; . /root/.secrets/zapp-v2.env; set +a`.
- Token do worker MCP: `/root/.secrets/zapp-v2-mcp-token`.
- SSH da VPS Hostinger: `/root/.ssh/hostinger_vps` (`ssh -i ~/.ssh/hostinger_vps -o BatchMode=yes root@187.77.151.129`).
- Evolution GO: env do projeto `evolution-go-rxj2` via Hostinger MCP.
- Supabase PAT do dono do destino: N√ÉO EXISTE ainda ‚Äî Joaquim fornece na etapa 57 (deploy de edge functions/secrets). Guardar em `/root/.secrets/`.
- Rota√ß√£o obrigat√≥ria (etapa 97) ‚Äî vazaram no chat 1: service_role e sb_secret_ do destino, senha do Postgres do destino, MCP_TOKEN do worker, GLOBAL_API_KEY e POSTGRES_PASSWORD da Evolution GO.

## 4. Ferramentas MCP ‚Äî qual usar para qu√™ + armadilhas
- `CLAUDE CODE - VPS - MCP:code_exec` ‚Äî shell no container claude-code. `working_dir` PRECISA existir antes (sen√£o "chdir failed"). Comandos >~100 s d√£o `error code: 524` (gateway) mas continuam rodando: usar `nohup ‚Ä¶ &` e consultar depois. Sem bashisms.
- `MCP - SUPABASE / LOVABLE CLOUD - ZAPP WEB V2:src_query` ‚Äî SELECT na origem. Retorna JSON no contexto: use `string_agg`/`md5` para sa√≠da compacta. `relkind`/`defaclobjtype` s√£o `"char"`: castar `::text`. N√£o existe `supabase_functions.hooks` na origem.
- `SUPABASE - ZAPP WEB V2 - MCP:*` (destino, worker v1.1.0): `db_query` (raw JSON, bigint √≠ntegro, timeout 120 s, multi-statement OK), `db_transaction` (array JSON de statements ‚Üí `mcp_exec_many`, at√¥mico, resultado por statement), `db_batch_query` (array JSON), `db_apply_migration` (registra em `supabase_migrations.schema_migrations`, vers√£o sem colis√£o), `storage_*`, `auth_*`, `functions_*`. Alternativa direta: `node /workspace/tmp/pgcli/sql.js -f arquivo.sql` (pooler, role postgres, sem PostgREST).
- `CLOUDFLARE - MCP - WORKERS:cf_worker_deploy` ‚Äî deploy via API preserva secrets (comprovado). `cf_secret_list/put` para secrets.
- `GITHUB - MCP - FOREVER:*` ‚Äî √∫nica forma de escrever nos repos `adm01-debug` (git push do container est√° quebrado; MCP GitHub padr√£o d√° 403). GitHub Actions da conta est√° SEM BUDGET ‚Üí CI n√£o roda.
- `HOSTINGER - MCP:VPS_*` ‚Äî Docker Manager (`VPS_createNewProjectV1`, `VPS_getProjectLogsV1`, `VPS_updateProjectV1`, `VPS_createSnapshotV1`, firewall). Descobrir `virtualMachineId` com `VPS_getVirtualMachinesV1`.
- `Lovable:query_database` (MCP oficial) ‚Äî alternativa de leitura da origem se o worker de auditoria cair.
- `PORTAINER - MCP` √© da VPS AtomicaBR (N√ÉO da Hostinger). Hostinger s√≥ via ssh/Hostinger MCP.
- Bug conhecido: `supabase_apply_migration` do MCP self-hosted (coluna `executed_at`) ‚Äî n√£o se aplica ao destino (worker pr√≥prio), mas n√£o usar aquele MCP aqui.

## 5. Estado atual (26/08 ~22:00 UTC ‚Äî sess√£o 3)
### FEITO (com evid√™ncia)
- Gate 0 ‚úÖ destino `tnnnlkbymytvtqngbbqh`. Regi√£o us-west-2. Lab na VPS autorizado.
- Etapas 9‚Äì15 ‚úÖ ferramental completo (mcp_exec v2.1, mcp_exec_many, worker v1.1.0 deployado no Cloudflare, harness 77 tools 0 FAIL, graphify).
- Etapa 17 ‚úÖ DDL completo dos objetos divergentes ‚Üí `docs/migration/source-ddl/` (10 arquivos: table_contacts, table_email_*, table_entity_versions, table_gmail_accounts, table_saved_filters, contacts_inbound_fks, functions_views).
- Etapas 18‚Äì21 ‚úÖ lab zapp-replay (supabase/postgres:17.6.1.166), 267 migrations ‚Üí 243 OK / 24 FAIL, fingerprints, Diff A classificado.
- **Gate 1 ‚úÖ D1‚ÄìD6 todos APROVADOS e executados** (ver DECISIONS.md para status por ID).
- **Etapas 29‚Äì50 ‚úÖ Fase 3 conclu√≠da**: 256 migrations aplicadas no destino, contacts restaurada (D1), cron D4, storage 7 buckets + 23 pol√≠ticas, realtime D5 (11 tabelas), role/db settings, paridade atingida.
- **Gate 2 ‚úÖ PARITY-REPORT.md assinado** ‚Äî zero diverg√™ncia inexplicada. Destino: 123 tabelas, 8 ext, 64 fn, 7 views, 4 enums, 1 cron, 11 pub.
- Etapas 1, 4, 5 ‚úÖ branch `feat/fresh-install-hostinger` criada, docs/migration/ commitados (plano de 30 etapas ‚Äî sess√£o 3).
- Worker v1.1.0 no Cloudflare ‚úÖ | push para GitHub pendente (etapa 4 do plano-30).
### PENDENTE
- **Plano de 30 etapas (aprovado 26/08 sess√£o 3)**: ver `docs/migration/HANDOFF.md` se√ß√£o 5 e DECISIONS.md ‚Äî em execu√ß√£o.
- Worker v1.1.1 (etapas 6‚Äì9 do plano-30): GAPs max_rows/line-size/schema db_select.
- apply-batch.js (etapa 11 do plano-30): executor de migrations em lotes.
- Etapa 16 üîí SSH hardening VPS.
- Etapas 22‚Äì27: diff B, mapa infra-deps, matriz fn√ótabela, Evolution inventory, auth/storage inventory, wildcard domain.
- Fase 4 (dados) üîí Gate 51.
- Fase 5 (functions/Evolution) üîí Gate 57.
- Fase 6 (c√≥digo) ‚è≥ etapas 67‚Äì78.
- Fase 7 (VPS deploy) Õo>Ìà? ‚è≥ etapas 79‚Äì90.
- Fase 8 (cutover/p√≥s) ‚è≥ etapas 91‚Äì100.

## 6. Invent√°rio de artefatos
### Container claude-code (`/workspace`)
- `/workspace/repos/zapp-web-v2` ‚Äî clone do app (267 migrations em `supabase/migrations`, 62 edge functions em `supabase/functions`, `supabase-export/` defasado de 2026-05-12, `graphify-out/`).
- `/workspace/repos/supabase-lovable-mcp/workers/zapp-web-v2/worker.js` ‚Äî worker v1.1.0 (commit local √† frente de origin/main).
- `/workspace/tmp/pgcli/sql.js` (executor SQL direto via `DATABASE_URL`; `-f arquivo` ou `-c "sql"`), `mcp_exec_v2.sql`, `mcp_exec_many.sql`.
- `/workspace/tmp/w.mjs` + `/workspace/tmp/wtest2.mjs` (harness local do worker; exporta env de `/root/.secrets/zapp-v2.env` + `MCP_TOKEN`).
- `/workspace/tmp/migration/source-fp.txt`, `replay-fp.txt`, `diff.js`.
- `/workspace/tmp/audit/agent{1..5}-report.md` ‚Äî relat√≥rios da auditoria (PASS 161 ¬∑ FAIL 21 ¬∑ GAT 28).
- `/workspace/tmp/storage-shim.sql`, `/workspace/tmp/fp.sql`, `/workspace/tmp/replay.sh`, `/workspace/tmp/replay2.sh` (c√≥pias dos scripts do lab).
- `/workspace/tmp/graphify.log`.
### VPS Hostinger (`/root`)
- `/root/zapp-build-test/` ‚Äî clone do repo + `Dockerfile`, `docker/nginx.conf`, `docker-compose.yml`, `.dockerignore` validados (imagem `zapp-web-v2:test` constru√≠da; nginx -t OK, SPA fallback, gzip, 196 `.map` dentro da imagem = 14 MB a remover).
- `/root/zapp-replay/` ‚Äî lab (`replay.log` = 1¬™ rodada sem shim, `replay2.log` = rodada v√°lida, `replay-fp.txt`, `tables.txt`, `last.out`).
- `/root/storage-shim.sql`, `/root/fp.sql`, `/root/replay.sh`, `/root/replay2.sh` (j√° com `-U supabase_admin -d postgres` no shim).
- Deploy key do GitHub instalada para clone do `zapp-web-v2` (somente leitura).
### Destino (`tnnnlkbymytvtqngbbqh`)
- Schema public: S√ì `mcp_exec`, `mcp_exec_many` (nada do app ainda). `supabase_migrations.schema_migrations(version, statements, name)` existe e est√° vazia (testes de migra√ß√£o foram limpos). Setting de role: service_role statement_timeout 120s.
### Cloudflare
- Worker `supabase-zapp-web-v2-mcp` v1.1.0 (secrets SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPAAASE_ANON_KEY, MCP_TOKEN). Repo do worker sem `CF_API_TOKEN` no GitHub (s√≥ `CF_ACCOUNT_ID`) ‚Üí deploy sempre por `cf_worker_deploy`.

## 7. Achados da auditoria (5 agentes) ‚Äî o que ainda importa
- Agente 1 (protocolo): auth OK (401 sem token), sem inje√ß√£o via `ID()/L()`, JWT nunca vaza. Corrigidos no v1.1.0: batch JSON-RPC. GAPs abertos: sem teto de tamanho por linha; `max_rows` sem valida√ß√£o estrita; `schema` ignorado em `db_select` fora de public (backlog etapa 99).
- Agente 2 (PostgreSQL): corrigido em v2.1. PostgREST demora ~1‚Äì2 s para recarregar schema ap√≥s DDL (`notify pgrst,'reload schema'` j√° est√° nos scripts).
- Agente 3 (VPS): sshd inseguro (etapa 16); Traefik `:latest`; `.map` na imagem; docker-compose OK com Traefik v3.6; ~13 GB de imagens recuper√°veis (`docker system prune` s√≥ com APROVADO) ; sem firewall_group na Hostinger; portas 32771/48592 publicadas direto (outros projetos).
- Agente 4 (worker/CI): 77 tools 1:1; CI bloqueada por "Actions budget"; `CF_API_TOKEN` ausente; wrangler dry-run OK (41 KB / 11 KB gzip).
- Agente 5 (frontend): `src/integrations/supabase/client.ts` e `externalClient.ts` hardcoded para `supabase.atomicabr.com.br` (coment√°rio diz para ignorar env porque o Lovable injeta `vpkm‡äf`); 4 refs de projeto no c√≥digo: `vpkm‚Ä¶` (config.toml), `allrjhkpuscmgbsnmjlv` (fallback hardcoded no trigger `notify_sicoob_on_reply` + `.env.example`), `atomicabr` (client/.env.production), `pgxfvjmuubtbowutlide` (`clientesClient.ts`, c√≥digo morto com credenciais); `verify_jwt` n√£o definido por function no config.toml; `index.html` com preconnect √≥rf√£o `rqmbchomazwsaupnuduf`; build OK (bun 5,4 s install + 14,3 s build); `tsc` 3 erros pr√©-existentes; testes 2463/2496 (1 timeout); `ci.yml` usa `npm ci` mas s√≥ existe `bun.lock` e tem job `audit-report` fora de `jobs:`; `.nvmrc` ausente (Node 20.19.0); 28 secrets √∫nicos nas 62 functions (lista completa no agent5-report.md; inclui SUPABASE_*, EVOLUTION_API_URL/KEY, LOVABLE_API_KEY, ELEVENLABS_*, GOOGLE_*, MAPBOX_PUBLIC_TOKEN, RESEND_API_KEY).

## 8. Baseline da origem + Diff A (origem viva √ó replay das migrations)
Contagens origem: 122 tabelas ¬∑ 64 fun√ß√µes ¬∑ 335 policies (120 tabelas com policy; `contact_tags` e `contact_custom_fields` t√™m RLS ligado e ZERO policies) ¬∑ 54 tabelas com trigger ¬∑ 7 views ¬∑ 4 enums ¬∑ 8 extens√µes (pg_cron 1.6.4, pg_net 0.20.0, pg_stat_statements, pg_trgm, pgcrypto, plpgsql, supabase_vault, uuid-ossp) ¬∑ 1 cron (`cleanup-link-preview-cache`, `0 3 * * *`, ativo) ¬∑ publication `supabase_realtime` = messages, queue_members, queues ¬∑ 7 buckets (audio-memes/pub, audio-messages, avatars/pub, custom-emojis/pub, stickers/pub, team-chat-files, whatsapp-media) com 23 policies em storage.objects ¬∑ grants: todas as tabelas/views com o mesmo hash 388594fd (anon/authenticated/service_role ALL) ¬∑ role settings: anon 3s, authenticated 8s, authenticator 8s+lock 8s+safeupdate, DB `app.settings.jwt_exp=3600`, `idle_in_transaction_session_timeout=15min` ¬∑ schemas: auth, cron, extensions, graphql, graphql_public, net, public, realtime, storage, supabase_migrations, vault ¬∑ dados ‚âà60 linhas (3 auth users, 2 profiles, 2 user_roles, 2 agent_stats, 7 messages, 50 m√©tricas), 0 objetos em storage.
Replay (repo, 267 migrations): 243 OK / 24 FAIL, 124 tabelas.

| Categoria | Origem | Replay | S√≥ origem | S√≥ replay | Divergentes |
|---|---|---|---|---|---|
| COLS | 122 | 124 | 0 | contacts, email_attachments | email_labels, email_messages, email_threads, entity_versions, gmail_accounts, messages, saved_filters |
| CONS | 122 | 124 | 0 | contacts, email_attachments | 39 tabelas (FKs para contacts + cadeia gmail/email) |
| IDX | 122 | 124 | 0 | contacts, email_attachments | audit_logs, email_messages, email_threads, entity_versions, gmail_accounts, saved_filters |
| POL | 120 | 124 | 0 | contact_custom_fields, contact_tags, contacts, email_attachments | 20 tabelas (ai_conversation_tags, audit_logs, chatbot_executions, connection_health_logs, contact_notes, conversation_analyses, conversation_events, conversation_sla, email_*, entity_versions, followup_executions, gmail_accounts, message_reactions, messages, queue_positions, saved_filters, webhook_rate_limits, whatsapp_connection_queues) |
| TRG | 54 | 55 | 0 | contacts | email_threads, gmail_accounts, saved_filters |
| VIEW | 7 | 6 | gmail_accounts_safe | 0 | 0 |
| ENUM | 4 | 4 | 0 | 0 | 0 |
| FN | 64 | 68 | get_own_gmail_accounts(), log_audit_event(‚Ä¶) | admin_criar_usuario_painel, fn_process_pending_scans, fn_purge_processed_webhook_events, fn_trg_security_check_media_queue, update_gmail_updated_at, update_saved_filters_updated_at | ensure_single_default_filter() |
| CRON | 1 | 0 | cleanup-link-preview-cache | ‚Äî | ‚Äî |
| PUB | 3 tabelas | 8 tabelas | ‚Äî | conversation_sla, email_messages, email_threads, message_reactions, notifications | ‚Äî |

Classifica√ß√£o (evid√™ncia: `replay2.log` + greps no repo):
A. PERDA REAL NA ORIGEM ‚Äî `contacts` dropada em 26/08 ("security test"); cascata: FKs para contacts sumiram em ~30 tabelas, policies de `contact_tags`/`contact_custom_fields` derrubadas (tabelas inacess√≠veis), 6 fun√ß√µes que referenciam contacts (`search_contacts`, `auto_assign_contact`, `is_contact_visible_to_user`, `contacts_count_by_type`, `normalize_contact_phone`, `skill_based_assign`) quebram em runtime.
B. DRIFT DO REPO (11 migrations com nome manual, nunca rodaram na origem ‚Äî Lovable s√≥ aplica as UUID):
   - 3 retro-datadas que colidem com Lovable posteriores: saved_filters, entity_versions, gmail_integration. No replay rodam antes e causam 16 FAILs em cascata.
   - 7 do lote junho/2026 para o self-hosted AtomicaBR/v3.
   - `20260412230000_fix_rls_policies_security.sql`: aplicou no lab, n√£o existe na origem ‚Äî hardening n√£o versionado.
C. CONFIG FORA DE MIGRATION ‚Äî cron cleanup-link-preview-cache criado √† m√£o na origem; publication realtime: origem 3 tabelas, migrations declaram 8+.

## 9. DECISIONS.md ‚Äî Gate 1 (todas PENDENTES; Joaquim responde por id)
| ID | Decis√£o proposta | Impacto |
|---|---|---|
| D1 | Restaurar `contacts` + FKs + policies de `contact_tags`/`contact_custom_fields` no destino a partir das migrations Lovable | corrige a perda A |
| D2 | Aplicar no destino SOMENTE migrations Lovable (UUID) ‚Äî excluir as 3 retro-datadas e as 7 de junho | paridade com a origem; replay limpo esperado 257/257 |
| D3 | Manter `20260412230000_fix_rls_policies_security` (hardening) | quebra paridade estrita, ganha seguran√ßa |
| D4 | Recriar cron `cleanup-link-preview-cache` (`0 3 * * *` ‚Üí `select public.cleanup_link_preview_cache()`) | paridade C |
| D5 | Publication realtime = tabelas que o front assina e existem (messages, team_messages, whatsapp_connections, contacts, talkx_campaigns, security_alerts, message_reactions, conversation_sla) + queues, queue_members (e demais declaradas nas migrations) | funcionalidade > paridade |
| D6 | Manter lab `zapp-replay` na VPS at√© o Gate 2 | re-validar cada lote |
Gates seguintes: 16 (SSH), 22 (descartar supabase-export/), 35 (recriar contacts), 50 (paridade), 51 (migrar ~60 linhas?), 57 (PAT), 60 (LOVABLE_API_KEY ‚Üí provider pr√≥prio), 68 (remover clientesClient.ts), 77 (merge), 79 (budget Actions), 88 (firewall), 90 (go-live), 98 (congelar origem).

## 10. Plano de 100 etapas ‚Äî status (‚úÖ feito ¬∑ ‚è≥ pendente ¬∑ üîí gate)
Fase 0 T at√© Fase 8: ver `PLANO.md` na mesma pasta.

## 11. Procedimentos prontos
### 11.1 Lab de replay (VPS Hostinger)
```sh
# recriar do zero (container ef√™mero, 127.0.0.1 apenas)
ssh -i ~/.ssh/hostinger_vps -o BatchMode=yes root@187.77.151.129 'nohup /root/replay2.sh > /root/replay2.nohup 2>&1 &'
# ~2 min; acompanhar
ssh -i ~/.ssh/hostinger_vps -o BatchMode=yes root@187.77.151.129 'tail -1 /root/zapp-replay/replay2.log; grep "^FAIL" /root/zapp-replay/replay2.log | cut -c6-200'
# psql direto no lab
docker exec -i zapp-replay psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f - < arquivo.sql
```
### 11.2 Fingerprint e diff
- `/workspace/tmp/fp.sql` ‚Äî query das 11 categorias.
- Naquele formato: `node /workspace/tmp/pgcli/sql.js -f /workspace/tmp/fp.sql` ou MCP `db_query` categoria por categoria.
- `node diff.js` compara source-fp.txt X dest-fp.txt.
### 11.3 Aplicar lote no destino
```sh
cd /workspace/tmp/pgcli && set -a && . /root/.secrets/zapp-v2.env && set +a
node sql.js -c "begin; $(cat /path/20261–@HN∏„S ’H¿¿ôµ•ù…Ö—•Ω∏πÕ≈∞§ÏÄ∏∏πçΩµµ•–Ïà)ÅÅÄ(åååÄƒƒ∏–ÅIΩ±±âÖç¨ÅëºÅëïÕ—•πº)Åë…Ω¿ÅÕç°ïµÑÅ¡’â±•åÅçÖÕçÖëîÏÅç…ïÖ—îÅÕç°ïµÑÅ¡’â±•åÏÅù…Öπ–ÅÖ±∞ÅΩ∏ÅÕç°ïµÑÅ¡’â±•åÅ—ºÅ¡ΩÕ—ù…ïÃ∞ÅÖπΩ∏∞ÅÖ’—°ïπ—•çÖ—ïê∞ÅÕï…Ÿ•çï}…Ω±îÌÄÅîÅ…ïÖ¡±•çÖ»Åµç¡}ï·ïç}ÿ»πÕ≈∞Ä¨Åµç¡}ï·ïç}µÖπ‰πÕ≈∞∏(åååÄƒƒ∏‘Å]Ω…≠ï»(¥ÅAÖ—ç†ËÅïë•—Ö»ÅÖ…≈’•Ÿº∞ÅÅπΩëîÄ¥µç°ïç≠Ä∞ÅÅç¡ÄÅ¡Ö…ÑÅ‹πµ©Ã∞ÅÅπΩëîÅ›—ïÕ–»πµ©ÕÄ∏(¥Åï¡±Ω‰ËÅÅçô}›Ω…≠ï…}ëï¡±ΩÂÄÄ¨ÅÅç’…∞ÄΩ°ïÖ±—°Ä∏(¥ÅIï¡ºËÅÅù•—°’â}¡’—}ô•±ïÄÄ°%Q!UÄ¥Å5@Ä¥Å=IYH§∏(åååÄƒƒ∏ÿÅ=…•ùï¥Ä°±ï•—’…Ñ§)ÅÕ…ç}≈’ï…ÂÄÅçΩ¥ÅÕ—…•πù}ÖùúΩµê‘Å¡Ö…ÑÅÕáµëÖÃÅçΩµ¡Öç—ÖÃ∏((ååÄƒ»∏ÅI•ÕçΩÃÅîÅ¡ïùÖë•π°ÖÃ(¥ÅÅçΩëï}ï·ïçÄÄ¯ƒ¿¿ÅÃÉäHÄ‘»–ÏÅÕïµ¡…îÅπΩ°’¿Ä¨Å¡Ω±∞∏(¥ÅM°•¥ÅÕ—Ω…ÖùîÅ¡…ïç•ÕÑÅ¡Õ≈∞ÅçΩµºÅÕ’¡ÖâÖÕï}Öëµ•∏ÄµêÅ¡ΩÕ—ù…ïÃ∏(¥Åµç¡}ï·ïåÅç’…ÕΩ»µô•…Õ–ËÅÕ—Ö—ïµïπ–Åµ’±—§µÕ—Ö—ïµïπ–Åëï¡ïπëïπ—îÅçÖ§Åï¥ÅaUQ∏(¥Å1ΩŸÖâ±îÅ•π©ï—ÑÅŸ¡≠∑äôÄÅπºÅâ’•±êÄ¥¯Å¡Ω§ÅÑÅµ•ù…Ö»Åëï•·ÑÅëîÅÕï»ÅÖ±ŸºÅëîÅëï¡±Ω‰∏((ååÄƒÃ∏ÅAÀÕ·•µΩÃÅ¡ÖÕÕΩÃÅ•µïë•Ö—ΩÃ(®©Ö—ïÃÅÑÅôΩ…πïçï»ÅπÑÅÕïÕœçºÅÕïù’•π—îË®®(¥ÅÖ—îÄ‘ƒËÅëÖëΩÃÅµ•ù…Ö¥ÅΩ‘ÅëïÕ—•πºÅπÖÕçîÅ±•µ¡º¸(¥ÅÖ—îÄ‘‹ËÅM’¡ÖâÖÕîÅAPÅëºÅëïÕ—•πºÄ°Ö—îÄ‘‹§(¥ÅÖ—îÄÿ¿ËÅëïç•œçºÅ1=Y	1}A%}-dÄ°¡…ΩŸ•ëï»Å¡ÀÕ¡…•º§(¥Åïç•œçºÄÃ‰ËÅÕ•—ï}’…∞Ä¨Å…ïë•…ïç–ÅUI1ÃÄ¨Å¡…ΩŸ•ëï…ÃÅÖ’—†ÅëºÅëïÕ—•πº(