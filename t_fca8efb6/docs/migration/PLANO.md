# Plano de implementação — ZAPP WEB V2 fresh install (100 etapas) — texto integral aprovado na sessão 1
Status por etapa: ver seção 10 de `zapp-web-v2-migration-handoff.md`. Convenções: cada etapa tem [ferramenta] e evidência de saída. GATE = para e espera `APROVADO`. Nenhuma tabela/coluna/função alterada ou apagada sem autorização explícita — inclusive na origem (somente leitura desde a etapa 3).

## Fase 0 — Decisões e pré-requisitos (1–8)
1. Persistir este plano em `/workspace/notes/zapp-web-v2-plano-100.md` e, após aprovado, em `docs/migration/PLANO.md` no repo (branch, não main). [code_exec, GitHub MCP]
2. GATE 0 — ref de destino. RESOLVIDO: `tnnnlkbymytvtqngbbqh`.
3. Congelar origem `vpkmqeumtxhrwgawxdrl`: só `src_query` daqui em diante; baseline = fingerprints em `/workspace/tmp/migration/source-fp.txt`. [audit MCP]
4. Criar `docs/migration/DECISIONS.md` (id · objeto · origem · repo · classificação intencional/perda · decisão · data). Único lugar onde uma diferença vira ação.
5. Branch `feat/fresh-install-hostinger` no `zapp-web-v2`; tudo entra por PR; `main` intocado até o merge da etapa 77. [GitHub MCP]
6. Domínios: testar wildcard `*.srv1481814.hstgr.cloud` (Evolution GO já usa `evolution-go-rxj2.srv1481814…`); se resolver, app em `zapp.srv1481814.hstgr.cloud`; senão domínio próprio no Cloudflare. [code_exec dig]
7. Planilha de secrets (28 únicos das 62 edge functions) com "quem fornece" e "pode ficar vazio na fase 1".
8. Registrar credenciais expostas para rotação obrigatória na etapa 97 (service_role, sb_secret_, senha DB, token MCP, GLOBAL_API_KEY da Evolution).

## Fase 1 — Ferramental corrigido (9–16)
9. `mcp_exec` v2 (cursor-first + fallback EXECUTE) no destino; re-rodar matriz do Agente 2. [sql.js] FEITO (v2.1)
10. `ALTER ROLE service_role SET statement_timeout='120s'`; provar com `pg_sleep(12)` via RPC. FEITO
11. RPC `mcp_exec_many(statements text[], max_rows int)` — uma transação, resultado por statement. FEITO
12. Worker v1.1: passthrough JSON cru (bigint), `Array.isArray` em batch, versão sem colisão em `db_apply_migration`, `extensions.pg_stat_statements`, erro claro para batch JSON-RPC, aviso em `storage_empty_bucket`. Commit + `cf_worker_deploy`. FEITO (push do commit pendente)
13. Re-executar harness contra a v1.1; zero FAIL. FEITO
14. `DEST_MCP_*` no worker `supabase-zapp-audit-mcp` → `audit_diff` ao vivo. N/A (worker não tem essas vars; diff por fingerprint)
15. `graphify update` no `zapp-web-v2`; usar `graphify explain "<tabela>"` nas etapas 24 e 56. FEITO
16. GATE — hardening SSH da VPS: drop-in `/etc/ssh/sshd_config.d/99-hardening.conf` (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`) só após validar as 2 chaves (`pink-putty` + `claude-code`). [ssh]

## Fase 2 — Baseline e mapeamento (17–28)
17. Extrair DDL completo da origem por catálogo (`pg_get_functiondef`, `pg_get_viewdef`, `pg_get_constraintdef`, `indexdef`, `pg_get_triggerdef`, `pg_policies`, `pg_enum`, `role_table_grants`, `cron.job`, `pg_extension`, `pg_db_role_setting`, ALTER DATABASE settings, publication, `storage.buckets` + policies de `storage.objects`) → `docs/migration/source-ddl/*.sql`. [src_query] PARCIAL: fingerprints colhidos; DDL completo só dos divergentes.
18. Laboratório de replay: `supabase/postgres:17` em `127.0.0.1` na VPS Hostinger. FEITO (`zapp-replay`, tag 17.6.1.166, shim storage)
19. Replay das 267 migrations em ordem, `psql -v ON_ERROR_STOP=1`, log por arquivo. FEITO (243 OK / 24 FAIL)
20. Manifest do lab (fingerprints) → `replay-fp.txt`. FEITO
21. Diff A — replay × origem viva, por categoria, cada diferença classificada (perda na origem / hotfix não versionado / drift de ordem). FEITO (handoff seção 8)
22. Diff B — `supabase-export/` × replay: confirmar defasagem (export de 2026-05-12: 390 policies vs 658 nas migrations, 59 vs 73 funções); recomendar descartar como fonte e regenerar no final a partir do destino. GATE.
23. Dependências de infra antiga no SQL: `notify_sicoob_on_reply` (fallback `allrjhkpuscmgbsnmjlv` + `app.settings.supabase_url/service_role_key` nunca definidos), qualquer `net.http_post`/URL `atomicabr` em funções. Tabela objeto → dependência → ação.
24. Matriz edge function × tabela (graphify + grep `from("…")`) → ordem de deploy e testes.
25. Decisão por ref de projeto no código: `vpkm…` (config.toml), `allrjhk…` (trigger + .env.example), `atomicabr` (client.ts/externalClient.ts/.env.production), `pgxf…` (CRM clientesClient.ts, código morto).
26. Inventário Evolution: endpoints e payloads de `_shared/evolution*` e `evolution-*` (instance create/connect, sendText, media, fetchProfile, webhook events) → colunas "Evolution API v2" × "Evolution GO".
27. Inventário auth/storage da origem que não é SQL: site_url, redirect URLs, providers, MFA, 7 buckets (public/private, limits, mimes).
28. GATE 1 — aprovação do DECISIONS.md (D1–D6).

## Fase 3 — Schema no destino (29–50)
29. Pré-checks: PG 17.6, extensões disponíveis (pg_cron, pg_net, pg_trgm, pgcrypto, pg_stat_statements), região us-west-2 (fica). [db_query]
30. Extensões na ordem do replay, schema `extensions`.
31. Default privileges e grants por role iguais à origem (postgres → anon/authenticated/service_role em public).
32. Migrations em lotes de 20 pelo pooler (container), 1 transação por lote, `schema_migrations.version` = timestamp do arquivo. [sql.js]
33. Fail-fast: primeiro erro para o lote; correção só no ambiente — nunca editando migration histórica sem autorização.
34. Migrations dependentes da infra antiga (etapa 23): aplicar como estão e `ALTER DATABASE postgres SET app.settings.supabase_url='<destino>'` (+ chave via Vault — decisão).
35. GATE — recriar `contacts` e demais objetos classificados como perda na origem (vêm do replay).
36. Cron jobs: `cleanup-link-preview-cache` (+ o que existir em `cron.job` na origem), mesmos schedules.
37. Storage: 7 buckets com mesmos atributos + 23 policies de `storage.objects`. [storage_create_bucket + db_query]
38. Realtime: publication `supabase_realtime` conforme D5.
39. Auth config (dashboard/Management API): site_url, redirect URLs, providers, expirações.
40. Settings de banco (`pg_db_role_setting`, ALTER DATABASE) replicados.
41. Views (7) por `pg_get_viewdef` normalizado. 42. Enums (4). 43. Sequences (0). 44. Índices (288). 45. Constraints (986). 46. Policies (335) + relrowsecurity/relforcerowsecurity. 47. Funções (64) — revisar SECURITY DEFINER sem search_path fixo (só reportar). 48. Triggers (70).
49. Diff origem×destino = 0 diferenças não classificadas → `PARITY-REPORT.md` + `manifests/dest-<data>.json`.
50. GATE 2 — aprovação do relatório de paridade.

## Fase 4 — Dados (51–56)
51. GATE — os ~60 registros da origem (3 auth users, 2 profiles, 2 user_roles, 2 agent_stats, 7 messages, 50 métricas) migram ou o destino nasce limpo?
52. Se migram: export via `src_query` em ordem topológica de FKs; import via `mcp_exec_many` com `SET CONSTRAINTS ALL DEFERRED` (sem superuser não há `session_replication_role`).
53. Usuários auth: `auth_create_user` com mesmo email/metadata; senhas não migram → `auth_generate_link recovery`.
54. Objetos de storage: 0 → nada.
55. Contagem por tabela origem × destino.
56. Seed mínimo para o app abrir (só o que as migrations já semeiam; extra passa por DECISIONS.md).

## Fase 5 — Edge functions, secrets e Evolution (57–66)
57. Joaquim fornece o Supabase PAT do dono do destino (guardar em `/root/.secrets`, nunca no repo).
58. `supabase/config.toml`: `project_id` do destino + `[functions.<nome>] verify_jwt=false` para as que recebem webhook externo (lista derivada do código).
59. Deploy das 62 functions (`_shared` primeiro) com `supabase functions deploy` no container.
60. `supabase secrets set` dos 28 (EVOLUTION_API_URL=`https://evolution-go-rxj2.srv1481814.hstgr.cloud`, EVOLUTION_API_KEY=GLOBAL_API_KEY, …). GATE — `LOVABLE_API_KEY` não existe fora do Lovable: trocar por provider próprio via `ai_providers` é mudança de arquitetura.
61. Smoke por function (`functions_ping` + `functions_invoke` com payload mínimo) → tabela de status.
62. Webhook da Evolution GO → `https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/evolution-webhook` (eventos, secret de validação).
63. Paridade Evolution GO × Evolution API v2 (etapa 26); gaps → adaptação em `_shared/evolution` só com APROVADO.
64. Trigger `notify_sicoob_on_reply` chamando o destino: provar em `net._http_response`.
65. Cron: `cron.job_run_details` após o primeiro ciclo.
66. GATE 3 — backend funcional (functions + webhook + cron + realtime).

## Fase 6 — Código do app (67–78)
67. `client.ts`/`externalClient.ts`: `import.meta.env.VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` com fallback = destino. Lovable deixa de ser alvo de deploy.
68. GATE — remover `clientesClient.ts` (morto, credenciais de outro projeto) e o preconnect órfão `rqmbchomazwsaupnuduf` do `index.html`.
69. `.env.production` com o destino; `.env.example` com os mesmos nomes.
70. Dockerfile com `ARG/ENV VITE_*` + `find dist -name '*.map' -delete`.
71. `docker/nginx.conf`: + `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`; sem CSP nesta fase.
72. `.nvmrc` → 20.19.0; `ci.yml`: job `audit-report` para dentro de `jobs:`, `npm ci` → `bun install --frozen-lockfile`.
73. `docker-compose.yml` + `.dockerignore` (validados na VPS) entram no repo.
74. Testes (2463/2496, 1 timeout) e `tsc` (3 erros) registrados como pré-existentes; sem correção não pedida.
75. `graphify update` e commit do `GRAPH_REPORT.md`.
76. PR único com checklist; review por agente (diff mínimo, zero segredo, zero churn).
77. GATE — merge em `main`.
78. Tag `v2.0.0-hostinger` + release notes. [GitHub MCP]

## Fase 7 — Deploy na VPS Hostinger (79–90)
79. GATE — Joaquim desbloqueia o budget do GitHub Actions ou aceitamos deploy sem CI (Docker Manager faz o build).
80. Docker Manager: projeto `zapp-web-v2` com `content=https://github.com/adm01-debug/zapp-web-v2` (deploy key instalada) e env `ZAPP_DOMAIN` + `VITE_*`. [VPS_createNewProjectV1]
81. Validar build no servidor (`VPS_getProjectLogsV1`), container healthy, router Traefik, certificado LE.
82. E2E HTTP: `/`, rota profunda, `/assets` (immutable + gzip), `.map` 404, headers.
83. Fluxo real com usuário de teste: login, RLS, realtime, upload, envio WhatsApp pela Evolution GO, webhook de volta, notificação.
84. Observabilidade: conector oficial Supabase do destino (`query_logs`), `docker logs`, alerta via n8n (`evolution-health` + `/health` do app).
85. Backups: snapshot da VPS antes do go-live (`VPS_createSnapshotV1`); PITR/backups do Supabase; compose/env versionados.
86. Runbook de redeploy: push em `main` → `VPS_updateProjectV1`; opcional `hostinger/deploy-on-vps` quando houver budget.
87. Evolution GO: pinar tag da imagem, backup dos volumes, instância nova (QR) no número novo — o `wpp2` fica na infra antiga.
88. GATE — firewall Hostinger: 22 restrito, 80/443 abertos, fechar 32771/48592.
89. Housekeeping: `docker system prune` (13 GB), traefik pinado em v3.6 — só com APROVADO.
90. GATE 4 — checklist de go-live assinado.

## Fase 8 — Verificação final, cutover e pós (91–100)
91. Diff final origem×destino = 0 não classificado; fingerprint do destino no `PARITY-REPORT.md`.
92. Smoke completo: 62 functions, 7 buckets, cron, realtime, auth (login/reset/passkey).
93. Carga leve (autocannon): p95 do app e do PostgREST → `docs/migration/BASELINE.md`.
94. `RUNBOOK.md`, `PARITY-REPORT.md`, `DECISIONS.md` fechados e commitados.
95. Cérebro: atualizar `claude-cerebro` com o mapa novo (refs, domínios, MCPs, onde cada segredo mora).
96. `grep` de vínculos antigos no repo = 0 (`atomicabr`, `allrjhk…`, `rqmb…`, `wpp2`).
97. Rotação das credenciais expostas + atualização dos secrets (worker, container, functions, Docker Manager).
98. GATE — congelar/arquivar a origem `vpkm…` e o deploy Lovable (pausar, não apagar).
99. Backlog residual: CSP com allowlist, chunks >500 kB (`vendor-maps` 1,67 MB), `tsc` 3 erros, teste com timeout, `schema` em `db_select`.
100. Handoff: revisão de 7 dias (logs, cron, webhooks, custo Supabase/Hostinger) e fechamento.
