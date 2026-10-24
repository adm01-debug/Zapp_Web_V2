# Plano GitHub Actions — 100 Etapas (2026-10-01)

> **Versão:** 3.0 (supercede PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md)  
> **Escopo:** auditoria exaustiva de `.github/workflows/` + meta CI score 10/10  
> **Data:** 2026-10-01  
> **Estado:** em execução

---

## Legenda de status

| Símbolo | Significado |
|---------|-------------|
| `[x]` | Concluído |
| `[~]` | Parcial / aguarda validação |
| `[ ]` | Pendente |
| `[!]` | Bloqueado |

---

## Tabela de etapas

| Etapa | Status | Evidência / resumo | Observação / próximo passo |
|-------|--------|-------------------|----------------------------|
| **E01** inventário completo de workflows | `[x]` **CONCLUÍDO** | 16 arquivos + 3 dinâmicos = 19 total; `docs/ci/README.md` gerado por `scripts/ci/render-workflow-docs.mjs --check` | Fonte canônica é o README gerado, não lista manual |
| **E02** score CI atual | `[x]` **CONCLUÍDO** | Score 6/10 → meta 10/10; gaps: pin de versão, ambientes, secrets, CodeQL actions | Gaps detalhados em E03–E10 |
| **E03** `strict` branch protection | `[x]` **CONCLUÍDO** | `strict=true` restaurado em 2026-10-01 (política vigente); `auto-update-pr-branch.yml` atualiza PRs BEHIND | E15(b) revoga `strict=false`; não reverter |
| **E04** 6 required checks | `[x]` **CONCLUÍDO** | Lint & TypeCheck · Unit Tests · Build · Security Audit · Contrato DB offline · E2E Tests (Playwright) | Todos verdes exigidos para merge |
| **E05** `enforce_admins` | `[x]` **CONCLUÍDO** | `enforce_admins: true`; admins não bypassam proteção | — |
| **E06** `delete_branch_on_merge` | `[x]` **CONCLUÍDO** | `true`; branches deletadas após squash-merge | — |
| **E07** `allow_auto_merge` | `[x]` **CONCLUÍDO** | `true`; PRs com CI verde podem auto-mergear | — |
| **E08** squash-merge only | `[x]` **CONCLUÍDO** | `allow_squash_merge=true`, merge-commit e rebase desligados | — |
| **E09** `settings-guard.yml` | `[x]` **CONCLUÍDO** | Compara estado ao vivo com `scripts/ci/github-settings-baseline.json`; roda a cada 6h e por PR | Divergência = regressão |
| **E10** `check-workflow-pins.mjs` | `[x]` **CONCLUÍDO** | Verifica SHA pinning em todos os `uses:`; `sha_pinning_required=true` no repo | — |
| **E11** CodeQL javascript-typescript | `[x]` **CONCLUÍDO** | Job `analyze` em `codeql.yml`; não é required check (não bloqueia merge) | — |
| **E12** CodeQL actions | `[x]` **CONCLUÍDO** | Job `analyze-actions` separado em `codeql.yml`; linguagem `actions` | Job separado evita renomear check required |
| **E13** `db-live-guard` abre issue | `[x]` **CONCLUÍDO** | Abre/comenta issue única com label `db-live-guard` ao detectar drift | Dedupe de 6h (E44) |
| **E14** `db-live-guard` retry transporte | `[x]` **CONCLUÍDO** | `PSQL_CONNECT_RETRIES=2` em `withPsqlEnvironment`; desligado por padrão | `LEDGER_RETRY_DELAYS_MS: ""` desliga camada interna no live-guard |
| **E15** `strict=false` revogado | `[x]` **CONCLUÍDO** | E15(b) 2026-10-02: política vigente é `strict=true`; nenhum agente reintroduz `false` | `settings-guard` restaura `true` |
| **E16** `auto-update-pr-branch.yml` | `[x]` **CONCLUÍDO** | Atualiza PRs BEHIND em push na `main`; permite `allow_auto_merge` com `strict=true` | — |
| **E17** merge queue impossível | `[x]` **CONCLUÍDO** | `POST /rulesets` com `merge_queue` → 422; conta `User`, não org; gatilhos `merge_group` inertes no CI | Só possível com org; decisão de negócio |
| **E18** Supabase GitHub App desligado | `[x]` **CONCLUÍDO** | "Automatic branching" e "Deploy to production" desligados no dashboard Supabase 2026-09-25 | PR #717 confirma: sem check `Supabase Preview` |
| **E19** `can_approve_pull_request_reviews` ligado | `[x]` **CONCLUÍDO** | Governa criação de PR por Actions; desligar quebra `types-sync`; mantido ligado | Revertido em 2026-09-25 após quebra do types-sync |
| **E20** `types-sync` dedupe | `[x]` **CONCLUÍDO** | Dedupe implementado; issue única reutilizada; política de > 20 comentários: fechar e abrir nova | E51 |
| **E21** `types-sync` GITHUB_TOKEN | `[x]` **CONCLUÍDO** | PR nasce com `GITHUB_TOKEN`; passo "Destravar checks" aprova runs com `actions:write` | `TYPES_SYNC_PR_TOKEN` desnecessário |
| **E22** `db-guard.yml` docker-shim | `[x]` **CONCLUÍDO** | PR #1538 (E47): shim intercepta Docker, roteia para container compartilhado `postgres:17-alpine` | 11 passos com `SKIP_DOCKER_SHIM: "1"` |
| **E23** `settings-guard` baseline | `[x]` **CONCLUÍDO** | `scripts/ci/github-settings-baseline.json` versionado; guard compara ao vivo | Atualizar no mesmo PR de qualquer mudança de perímetro |
| **E24** environments com gate | `[x]` **CONCLUÍDO** | 4 environments com `branch_policy`: `producao-ddl`, `producao-edge-functions`, `legacy-import-destrutivo`, `db-ledger-evidence` | `required_reviewers` não verificável via token de workflow (403) |
| **E25** `supabase-sync.yml` desarmado | `[x]` **CONCLUÍDO** | Exige environment + `LEGACY_IMPORT_UNLOCK` (secret inexistente); todo dispatch falha fechado | Para reativar: criar secret + aprovar environment |
| **E26** secrets por escopo | `[x]` **CONCLUÍDO** | repo + 4 environments: `producao-ddl`, `producao-edge-functions`, `legacy-import-destrutivo`, `db-ledger-evidence` | `check-pr-workflow-secrets` valida escopos |
| **E27** `secret_scanning_non_provider_patterns` | `[x]` **CONCLUÍDO** | Desligado: API aceita PATCH e ignora (exige GitHub Secret Protection pago) | `DESTINO_URL` não tem padrão de provider |
| **E28** agendamentos sem colisão | `[x]` **CONCLUÍDO** | types-sync `49 5 * * 1` · db-live-guard `13 6 * * *` · branch-hygiene `56 7 * * 1` · codeql `30 9 * * 1` · settings-guard `15 */6 * * *` | Dois originais às 06:00 disputavam banco |
| **E29** `crm-sync-worker.yml` schedule comentado | `[x]` **CONCLUÍDO** | `vars.CRM_SYNC_WORKER_ENABLED` é preparação deliberada para reativação, não código morto | — |
| **E30** `branch-hygiene-audit.yml` | `[x]` **CONCLUÍDO** | Lista branches sem PR associada; não bloqueia merge | — |
| **E31** `targeted-ledger-evidence.yml` | `[x]` **CONCLUÍDO** | Registra evidência de ledger para migrations específicas; environment `db-ledger-evidence` | — |
| **E32** `deploy-functions.yml` | `[x]` **CONCLUÍDO** | `workflow_dispatch` apenas; pausa em `producao-edge-functions`; merge ≠ deploy de edge functions | — |
| **E33** `db-migrate.yml` dry-run + hash | `[x]` **CONCLUÍDO** | `apply=false` → dry-run + SHA-256; `apply=true` + `confirm_runtime_sha256`; contrato genérico desde PR #695 | — |
| **E34** `db-migrate.yml` environment gate | `[x]` **CONCLUÍDO** | Pausa em `producao-ddl`; PR #687 | — |
| **E35** `db-guard.yml` required check | `[x]` **CONCLUÍDO** | `Contrato DB offline` é required check na `main` | — |
| **E36** `e2e-logado.yml` required check | `[x]` **CONCLUÍDO** | `🎭 E2E Tests (Playwright)` required desde 2026-09-25 | — |
| **E37** `e2e-talkx.yml` habilitado | `[x]` **CONCLUÍDO** | `talkx.spec.ts` nos 3 browsers; fixtures `e2e0e2e0...` e segmento `621521f3...` em produção | Não remover fixtures do banco |
| **E38** `conversation.spec.ts` reescrito | `[x]` **CONCLUÍDO** | `test.skip` removido; fluxo real via `ChatPanelHeader` → "Mais ações" → `CloseConversationDialog` | — |
| **E39** `messaging.spec.ts` reescrito | `[x]` **CONCLUÍDO** | Contato fixo `04dff4dc...` seedado em produção; seletores corrigidos | — |
| **E40** `scheduled_report_configs` owner-only | `[x]` **CONCLUÍDO** | Reconciliado em PR #824; policy INSERT corrigida em #833 | DDL aplicado fora do fluxo em 2026-09-26 — lição documentada |
| **E41** `talkx-status-regen.yml` | `[x]` **CONCLUÍDO** | Regenera status de templates TalkX; `workflow_dispatch` | — |
| **E42** `render-workflow-docs.mjs --check` | `[x]` **CONCLUÍDO** | Valida que `docs/ci/README.md` está atualizado; roda em CI | — |
| **E43** environments auditados (7) | `[x]` **CONCLUÍDO** | `copilot` · `db-ledger-evidence` · `legacy-import-destrutivo` · `Preview` · `producao-ddl` · `producao-edge-functions` · `Production` | E94 ainda pendente (apagar 3 obsoletos) |
| **E44** `db-live-guard` dedupe 6h | `[x]` **CONCLUÍDO** | Evita comentários em cascata; issue única reutilizada | — |
| **E45** `withPsqlEnvironment` retry único | `[x]` **CONCLUÍDO** | PR #716 consolida: `LEDGER_RETRY_DELAYS_MS: ""` desliga camada interna no live-guard; produto 3×3 eliminado | Duas regex em sincronia deliberada |
| **E46** `Number("")` = 0 não NaN | `[x]` **CONCLUÍDO** | Entradas vazias descartadas antes do `Number()` em `LEDGER_RETRY_DELAYS_MS` | — |
| **E47** docker-shim consolidado | `[x]` **CONCLUÍDO** | PR #1538: container compartilhado; 11 exceções `SKIP_DOCKER_SHIM: "1"` documentadas no CLAUDE.md | — |
| **E48** `db-live-guard` não falha em silêncio | `[x]` **CONCLUÍDO** | Abre issue com label antes de sair com código != 0 | — |
| **E49** sessões paralelas — regra 3 documentada | `[x]` **CONCLUÍDO** | Colisões de 2026-09-25 documentadas; regra 3 do fluxo Git reforçada | — |
| **E50** `statements` NULL corrigidos | `[x]` **CONCLUÍDO** | 7 versions corrigidos em 2026-09-25; count = 0 no ledger | — |
| **E51** política comentários excessivos de bot | `[x]` **CONCLUÍDO** | > 20 comentários: fechar e abrir nova issue; `db-live-guard` dedupe 6h; `types-sync` dedupe (E20) | Issue #888 fechada em 2026-10-01 |
| **E52** `register-migration.mjs` | `[x]` **CONCLUÍDO** | Gera SQL exato (dry-run ou `--apply`); verifica `max(version)` + paridade; aborta se `RETURNING` vazio | — |
| **E53** `check-migration-drift.mjs` | `[x]` **CONCLUÍDO** | Compara migrations com ledger; roda em `db-live-guard` e `db-guard` | — |
| **E54** `supabase-usage-guard.mjs` | `[x]` **CONCLUÍDO** | `novas: 0`; paridade arquivos↔registros; roda em `db-guard` | — |
| **E55** `render-workflow-docs.mjs` | `[x]` **CONCLUÍDO** | Gera `docs/ci/README.md`; `--check` valida frescor | — |
| **E56** `ci-docs-baseline.unit.mjs` | `[x]` **CONCLUÍDO** | Valida documentação de CI: 16 YAMLs, E62/E76, W95 CONTRIBUTING | Roda em "Unit Tests" |
| **E57** `github-settings-baseline.json` | `[x]` **CONCLUÍDO** | Baseline versionado; `settings-guard` compara; atualizar no mesmo PR | — |
| **E58** `known-violations.json` | `[x]` **CONCLUÍDO** | Guard exemptions versionadas; atualizar com DDL que muda guard | — |
| **E59** `migration-evidence.json` | `[x]` **CONCLUÍDO** | Evidência de migrations; `pinned-replay` para exceções; nunca resumo em prosa | — |
| **E60** `replay-known-failures.json` | `[x]` **CONCLUÍDO** | 21 falhas esperadas no replay do zero; documentadas | — |
| **E61** `schema-manifest.json` frescor | `[x]` **CONCLUÍDO** | `db-live-guard` regenera e compara; divergência = drift | — |
| **E62** destino do `db-migrate.yml` | `[~]` **PARCIAL** | PR #1778 extraiu 12 contratos para `scripts/db-audit/run-runtime-contract.mjs`; hoje `.github/workflows/db-migrate.yml` tem **1491 linhas** | A meta literal de ~150 linhas **não** se atinge e não pode justificar remover as validações pós-apply: as guardas de DB ficam. O alvo é organizar o contrato, não encolher por estética. |
| **E63** `reserve_migration_version()` | `[x]` **CONCLUÍDO** | Reserva atômica no ledger; evita colisão entre sessões | — |
| **E64** `replay-local.sh` | `[x]` **CONCLUÍDO** | Aponta host oficial para 127.0.0.1; desliga `cron.launch_active_jobs`; aborta se falhar | — |
| **E65** banco local portão | `[x]` **CONCLUÍDO** | Comparação com manifesto = 0 diffs antes de considerar portão válido | — |
| **E66** worktrees sem acúmulo | `[x]` **CONCLUÍDO** | `git worktree prune` não é automático; branch mergeado = worktree deletado no mesmo turno | 22 worktrees prunable encontrados em 2026-09-16 |
| **E67** `uniq -d` prefixos após push | `[x]` **CONCLUÍDO** | Verificação de colisão de versão após push | — |
| **E68** ledger `statements` completo | `[x]` **CONCLUÍDO** | SQL real e completo, um statement por elemento, sem `;` final, sem comentários | Resumo em prosa obriga exceção `pinned-replay` para sempre |
| **E69** `ON CONFLICT DO NOTHING` + `RETURNING` | `[x]` **CONCLUÍDO** | Guarda contra colisão silenciosa; `RETURNING` não-vazio confirma insert | Colisão mascarou-se duas vezes em 2026-09-16 |
| **E70** `_foreign/` e `_superseded/` filtrados | `[x]` **CONCLUÍDO** | `ls supabase/migrations/*.sql` filtra subpastas; paridade correta | Falso positivo sem filtro |
| **E71** `VACUUM` manual via dashboard | `[x]` **CONCLUÍDO** | `VACUUM` não roda em transação (MCP); usar SQL Editor do dashboard | `messages` > 75% dead tuples resolvido em 2026-09-16 |
| **E72** `CREATE INDEX` simples (não CONCURRENTLY) | `[x]` **CONCLUÍDO** | `CONCURRENTLY` falha em transação (gateway); tabelas pequenas | — |
| **E73** `DESTINO_URL` nunca em código | `[x]` **CONCLUÍDO** | Só em secrets do repo/environment; `PSQL_BIN` recebe shim que imprime ledger | — |
| **E74** `pg_net` + `pg_cron` travados no local | `[x]` **CONCLUÍDO** | `/etc/hosts` aponta oficial para 127.0.0.1; `cron.launch_active_jobs=off` | `replay-local.sh` automatiza |
| **E75** pin literal de Playwright (opção) | `[~]` **AGUARDA DECISÃO** | Pin literal em 3 workflows é opção de E76; remover requer validação de que `bun.lock` é suficiente | Decisão de negócio |
| **E76** `bunx playwright` sem pin de versão | `[~]` **AGUARDA RUNTIME** | `bun.lock` resolve `playwright@1.64.1`, `playwright-core@1.64.1` e `@playwright/test@1.64.1`; os **três** workflows pinam a mesma versão (`ci.yml`, `e2e-logado.yml`, `e2e-talkx.yml`) | **Não há mismatch** entre lock e workflows: a paridade 1.64.1 é real. Remover o pin literal é opção da E75. |
| **E77** `bun.lock` versionado | `[x]` **CONCLUÍDO** | `bun.lock` commitado; CI usa versões fixas | — |
| **E78** `node:24` no Vercel | `[x]` **CONCLUÍDO** | `package.json` `engines.node: "24.x"`; Vercel usa Node 24 | — |
| **E79** `ignore-build.sh` Vercel | `[x]` **CONCLUÍDO** | `scripts/vercel/ignore-build.sh`; evita builds desnecessários | — |
| **E80** `FALLBACK_ORIGIN` Vercel | `[~]` **AGUARDA** | Atual: `zapp-web-v2.vercel.app`; meta: `zappweb.app.br` (7 dias após DNS — V185) | — |
| **E81** env vars Vercel auditadas | `[x]` **CONCLUÍDO** | Baseline `scripts/ci/vercel-env-baseline.json`; snapshot `docs/audits/vercel-snapshot-2026-10-18-antes.json` | 17 vars mortas + 5 chaves servidor a remover (V043–V065) |
| **E82** projeto legado `zapp-web` | `[~]` **AGUARDA JOAQUIM** | `prj_OsErjUqsrMbwwC7S1LVfawmNgEce`; pausar/deletar após confirmar sem tráfego | — |
| **E83** domínio canônico apex | `[~]` **AGUARDA JOAQUIM** | `zappweb.app.br` apex; `www` → apex (V017) | — |
| **E84** `CONTRIBUTING.md` alinhado | `[x]` **CONCLUÍDO** | Menciona bun, `Zapp_Web_V2`, `dia/AAAA-MM-DD`, 6 required checks; sem `develop` afirmativo | W95 em `ci-docs-baseline.unit.mjs` valida |
| **E85** `docs/ci/README.md` gerado | `[x]` **CONCLUÍDO** | Fonte canônica do inventário; `--check` em CI | — |
| **E86** `graphify` grafo de código | `[x]` **CONCLUÍDO** | `graphify-out/` gerado por `bun run graph:setup`; hooks `post-commit`/`post-checkout` | ~50 MB; no `.gitignore` |
| **E87** resgate de branches WSL | `[x]` **CONCLUÍDO** | 4 247 branches mapeados; 1 038 com trabalho local; `docs/resgate/MAPA_2026-10-24.md` | — |
| **E88** `ci-docs-baseline` E62/E76 paridade | `[x]` **CONCLUÍDO** | Teste verifica linha de db-migrate.yml e versão Playwright no lock/workflows | Falha se PLANO divergir do repo real |
| **E89** GitHub Apps auditados | `[~]` **NÃO AUDITADO** | Token de sessão não lista instalações; E89 decide quando auditar | — |
| **E90** `check-pr-workflow-secrets` | `[x]` **CONCLUÍDO** | Valida escopos de secrets por PR; roda em `db-guard` | — |
| **E91** `render-workflow-docs --check` em CI | `[x]` **CONCLUÍDO** | Falha se `docs/ci/README.md` desatualizado | — |
| **E92** `schema-catalog.json` atualizado | `[x]` **CONCLUÍDO** | Regenerado após cada DDL; paridade com `types.ts` | — |
| **E93** `types.ts` frescor | `[x]` **CONCLUÍDO** | `types-sync` regenera; `db-live-guard` verifica frescor | — |
| **E94** environments obsoletos a deletar | `[~]` **AGUARDA JOAQUIM** | 3 environments a apagar; requer aprovação (E43) | — |
| **E95** perímetro GitHub documentado | `[x]` **CONCLUÍDO** | Tabela canônica em CLAUDE.md; `docs/audits/e95-perimetro-github-2026-10-03.md` | — |
| **E96** `settings-guard` 403 administrativo | `[x]` **CONCLUÍDO** | 403 = limite de evidência, não regressão; documentado | — |
| **E97** `db-live-guard` diário | `[x]` **CONCLUÍDO** | `13 6 * * *`; não depende do `types-sync` | — |
| **E98** `branch-hygiene` semanal | `[x]` **CONCLUÍDO** | `56 7 * * 1` segunda-feira | — |
| **E99** CI score meta 10/10 | `[~]` **PARCIAL** | Score atual: 8/10; gaps: E75 (pin literal opcional), E82/E83/E89/E94 (aguardam Joaquim) | — |
| **E100** documentação atualizada | `[x]` **CONCLUÍDO** | CLAUDE.md atualizado; planos supercedidos marcados como SUBSTITUÍDO | — |

---

## Notas de implementação

### Ordem obrigatória de apply

Para qualquer mudança que envolva DDL em produção:

1. arquivo em `supabase/migrations/` → PR → merge em `main`
2. `node scripts/db-audit/register-migration.mjs <arquivo.sql>` (dry-run)
3. DDL + INSERT no ledger na mesma `db_query` (1 transação); `RETURNING` não-vazio
4. `supabase-usage-guard.mjs` (`novas: 0`) + paridade arquivos↔ledger

### Fluxo de edge functions

`merge em main` ≠ deploy. Edge functions requerem:
1. `workflow_dispatch` do `deploy-functions.yml`
2. Aprovação humana em `producao-edge-functions`

Sem esses dois passos, o fix está no código mas fora do ar em produção.

### Colisão de versão de migration

Antes de criar arquivo ou aplicar DDL:
1. `SELECT max(version) FROM supabase_migrations.schema_migrations`
2. `ls supabase/migrations | tail`
3. Busca de PRs abertas tocando `supabase/migrations/`
4. `SELECT supabase_migrations.reserve_migration_version('<sessao>', '<motivo>')` para reserva atômica

Versão nova = maior dos três + 10 000.

---

*Atualizado em 2026-10-24. Supercede PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md.*
