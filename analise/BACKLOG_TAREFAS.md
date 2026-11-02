# Backlog de tarefas — todas as PRs e branches, por sessão

Gerado em 2026-10-31 a partir de `analise/inventario-2026-10-31/` (`main@668d773`). Cada PR aberta (142) e cada branch remota sem PR aberta tem **um dono** e **uma ação**. Branch com PR aberta é tratada junto com a PR.

**Antes de cada tarefa:** conferir o estado ao vivo (a PR pode ter sido mergeada/fechada por outra sessão). **Regras:** ver `analise/PLANO_COORDENACAO.md` §2. Executar os lotes em ordem; no máximo 3 PRs suas em atualização+CI ao mesmo tempo. Ao concluir: mensagem `FEITO <ID> — <resultado>` para `session_014nTibVLQcoWAuwGA72Dxmv`.

| Sessão | Total | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|----|---|
| GR — GH ACTIONS REQUIRED | 31 | 10 | 8 | 2 | 8 | 3 |
| GF — GH ACTIONS FAILURE | 56 | 9 | 7 | 7 | 8 | 25 |
| PA — PRS ABERTAS 03 | 39 | 13 | 4 | 11 | 9 | 2 |
| S2 — SUPABASE 02 | 29 | 3 | 3 | 20 | 1 | 2 |
| S3 — SUPABASE 03 | 28 | 3 | 1 | 16 | 8 | 0 |
| BR — BRANCHS CORREÇÕES | 56 | 6 | 5 | 19 | 25 | 1 |

## GR — GH ACTIONS REQUIRED (`session_014nTibRx2Q1QhGpGBeEpLKV`)

### Lote 1 — urgente e barato (fechar, priorizar, destravar)
- [ ] **GR-001** [WF] deploy-functions.yml — garantir verde na main após o merge da #2409 (confirmar o run de push).
- [ ] **GR-002** [PR] #2046 `claude/w45-draft-fast-exit` — W45: pular test/build/security/e2e/db-guard em PR draft _(workflow, 2 arq., 148 atrás)_ — DUPLICATA: pular jobs em rascunho — escolher entre #2046 e #2295.
- [ ] **GR-003** [PR] #2138 `claude/ga-ci-verde-261020` — fix(ci): desbloqueia a main - contratos de CI, Pin do Playwright/E2E, E88 e DB G _(workflow, rascunho, 159 arq., 118 atrás)_ — DUPLICATA: "destrava workflows" — conferir e fechar.
- [ ] **GR-004** [PR] #2139 `codex/fix-failed-workflows-20261020` — Codex/fix failed workflows 20261020 _(workflow, 45 arq., 137 atrás)_ — DUPLICATA: "destrava workflows" — conferir e fechar.
- [ ] **GR-005** [PR] #2151 `fix/ci-workflows-vermelhos` — fix(ci): destravar workflows que falhavam antes de executar _(workflow, 325 arq., 137 atrás)_ — DUPLICATA: "destrava workflows" — main já verde; conferir e fechar.
- [ ] **GR-006** [PR] #2155 `fix/ci-verde-261021` — fix(ci): destrava workflows que falhavam antes de executar _(workflow, 46 arq., 128 atrás)_ — DUPLICATA: "destrava workflows" — conferir e fechar.
- [ ] **GR-007** [PR] #2295 `claude/feat-e71-skip-draft-prs-281026-0250` — feat(ci): skip heavy jobs em draft PRs (E71) _(workflow, 5 arq., 80 atrás)_ — DUPLICATA: pular jobs em rascunho — escolher entre #2046 e #2295.
- [ ] **GR-008** [PR] #2380 `claude/fix-deploy-deno-check-node-modules-261030-1200` — fix: --node-modules-dir=none no deno check do deploy-functions _(workflow, 2 arq., 18 atrás)_ — FECHAR após o merge da mantida: duplicata da #2409.
- [ ] **GR-009** [PR] #2408 `claude/focused-hopper-qhavw1` — fix(ci): corrige deploy-functions — instala @types/node via npm import explícito _(workflow, 5 arq., 11 atrás)_ — FECHAR após o merge da mantida: duplicata da #2409.
- [ ] **GR-010** [PR] #2409 `claude/fix-deploy-frozen-oct31` — fix(ci): deno install --frozen=false + @types/node no deno.json _(workflow, 4 arq., 0 atrás)_ — MANTER: fix definitivo do deploy-functions (@types/node). Levar ao merge — prioridade nº 1 da main.

### Lote 2 — entra sem conflito
- [ ] **GR-011** [DOC] CLAUDE.md + scripts/ci/github-settings-baseline.json — required checks reais = 3 (Build, TypeCheck, CI Gate). Conferir o que o settings-guard compara e atualizar os dois no mesmo PR.
- [ ] **GR-012** [WF] e2e-logado.yml — e2e/telefonia.spec.ts:224 (Y11, número incompleto) falha no Firefox; job autenticado estoura tempo. Corrigir a causa (não pular o teste).
- [ ] **GR-013** [PR] #1975 `claude/fix-ci-reativar-suites-261016-1530` — ci: reativar 8 suites no job node-scripts (allowlist → runner) _(workflow, 3 arq., 22 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash).
- [ ] **GR-014** [PR] #2034 `claude/fix-notify-names-ga10-ga02-261017-0900` — fix(ci): GA02 + GA10 — guarda CLAUDE.md no CI e contrato de nomes do notificador _(workflow, 2 arq., 22 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash).
- [ ] **GR-015** [PR] #2044 `claude/w39-w49-w50-ci-cleanup` — ci(W39/W49/W50): playwright versao dinamica, VITE_* scoped, codeql dispatch _(workflow, 3 arq., 22 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash).
- [ ] **GR-016** [PR] #2279 `claude/fix-e2e-workers-ci-timeout-271027-0924` — fix(e2e): aumenta workers de 1→2 no CI para evitar timeout de 20 min _(rascunho, 1 arq., 18 atrás)_ — e2e-logado: workers 1→2 (rascunho). Avaliar junto com a falha de e2e/telefonia.spec.ts:224 no Firefox.
- [ ] **GR-017** [PR] #2297 `claude/feat-e70-edge-contracts-job-281028-0305` — feat: E70 — job 🦕 Edge contracts separado do node-scripts _(workflow, rascunho, 1 arq., 18 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash). Está em RASCUNHO: confirmar que está pronta antes de tirar do rascunho.
- [ ] **GR-018** [PR] #2411 `docs/ci-relatorio-2026-10-31` — docs(ci): RELATORIO_CI.md e PENDENCIAS.md — correcao deploy-functions W100/E59 _(2 arq., 0 atrás)_ — docs do mesmo fix do deploy-functions — mergear só se trouxer algo além da #2409; senão fechar.

### Lote 3 — conflito pequeno / renumerar migration
- [ ] **GR-019** [PR] #2128 `claude/fix-ga-fase23-edge-e2e-261020-2200` — fix(ci): Fases 2+3 do plano GA27-GA47 _(workflow, 17 arq., 118 atrás)_ — 1 arquivo(s) em conflito (useFilesContainerColumns.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **GR-020** [PR] #2298 `claude/feat-e75-toolchain-env-281028-0600` — feat(e75): centraliza versões de toolchain em toolchain.json — elimina literais  _(workflow, 17 arq., 79 atrás)_ — 2 arquivo(s) em conflito (db-guard.yml, PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.

### Lote 4 — conflito grande / isolar delta
- [ ] **GR-021** [PR] #1979 `claude/tender-heisenberg-a4jk3s` — docs: plano de correções dos workflows em FAILURE — 200 etapas (2026-10-16) _(workflow, 19 arq., 119 atrás)_ — 5 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **GR-022** [PR] #1991 `claude/fix-codex-findings-161016-1906` — fix: corrige nomes de workflows no notificador e cancelamento de scroll programá _(workflow, 14 arq., 151 atrás)_ — 7 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **GR-023** [PR] #2051 `claude/w85-w86-w87-ossf-scorecard` — ci(W85/W86/W87): OpenSSF Scorecard semanal + dependency-review no security job _(workflow, 9 arq., 140 atrás)_ — 6 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **GR-024** [PR] #2123 `claude/fix-ci-contratos-cache-261020-2320` — fix(ci): restaura o parse dos contratos de workflow e corrige 8 violações (cache _(workflow, 7 arq., 137 atrás)_ — 4 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **GR-025** [PR] #2129 `claude/fix-ga-fase78-perimetro-custo-261020-2200` — fix(ci): Fases 7+8 do plano GA75-GA95 _(workflow, 21 arq., 137 atrás)_ — 8 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **GR-026** [PR] #2185 `claude/kind-gates-87mwoe` — docs(pendencias): §8 RESOLVIDO + §9 inventário de workflows da main _(workflow, 18 arq., 120 atrás)_ — 14 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **GR-027** [BR] `claude/fix-ci-main-verde-261023-1540` _(+122, 5 em conflito)_ — workflow sem PR → `git merge-tree`: já na main → apagar branch; senão abrir PR única por workflow.
- [ ] **GR-028** [BR] `claude/fix-restore-settings-guard-281028-1830` _(+31, 1 em conflito)_ — workflow sem PR → `git merge-tree`: já na main → apagar branch; senão abrir PR única por workflow.

### Lote 5 — mega-PRs, decisões e documentação
- [ ] **GR-029** [PR] #2040 `claude/charming-mccarthy-jbxy56` — fix(e2e-logado): restaura W71 — workflow_run em vez de push na main _(workflow, 435 arq., 137 atrás)_ — MEGA-PR (435 arq., 30 em conflito, base antiga) → fechar e reabrir só com o delta real sobre a main.
- [ ] **GR-030** [PR] #2105 `claude_pink/nice-hypatia-iikl82` — docs: plano de integração de branches em 300 etapas (153 branches → só main) _(workflow, 337 arq., 137 atrás)_ — MEGA-PR (337 arq., 30 em conflito, base antiga) → fechar e reabrir só com o delta real sobre a main.
- [ ] **GR-031** [PR] #2126 `claude/fix-ga-fase456-fila-sast-guard-261020-2200` — fix(ci): Fases 4+5+6 do plano GA49-GA74 _(workflow, 224 arq., 118 atrás)_ — MEGA-PR (224 arq., 6 em conflito, base antiga) → fechar e reabrir só com o delta real sobre a main.

## GF — GH ACTIONS FAILURE (`session_014nTibS9cuNo8UN81A4hCUu`)

### Lote 1 — urgente e barato (fechar, priorizar, destravar)
- [ ] **GF-001** [WF] db-live-guard.yml (issue #1965) — diagnóstico só leitura: 2 statements em prosa, 1 nome divergente, 3 SQL divergentes (16/10), ACL mcp_exec (check-mcp-exec-acl.sql:380), runtime config. Arquivos → PR; escrita no ledger → PENDENCIAS.md (Joaquim).
- [ ] **GF-002** [WF] db-migrate.yml — remote_only_count=3: 3 versões no ledger sem arquivo → criar os arquivos a partir do ledger (SQL real) numa PR.
- [x] **GF-003** [PR] #2056 `fix/ci-f1b-restaura-workflows-20261018` — fix(ci): restaura auto-update-pr-branch e settings-guard, corrige docs de notifi _(workflow, 4 arq., 140 atrás)_ — DUPLICATA: auto-update/settings-guard — consolidar com #2211/#2354/#2372.
- [x] **GF-004** [PR] #2093 `claude/fix-z022-z024-dbguard-ci-261018-1930` — fix: migration-evidence expectedKeys, version collision, playwright unpin (Z022+ _(workflow, rascunho, 2 arq., 140 atrás)_ — DUPLICATA: "destrava workflows" — conferir e fechar.
- [x] **GF-005** [PR] #2211 `claude_05/zen-feynman-29b7ix` — fix(ci+tests): corrige auto-update-pr-branch e falhas nos testes unitários _(workflow, rascunho, 23 arq., 111 atrás)_ — DUPLICATA: auto-update/settings-guard — consolidar.
- [x] **GF-006** [PR] #2218 `claude_05/brave-mccarthy-zvzky4` — fix: corrigir CI — RE_RECON, Playwright 1.63.0, useAuth, fila-merge, manifest _(34 arq., 106 atrás)_ — DUPLICATA: retry do fila-merge.mjs — ficar com UMA entre #2218/#2246/#2261/#2273/#2274.
- [x] **GF-007** [PR] #2273 `claude_04/trusting-newton-duiglt` — fix: retry em HTTP 5xx no fila-merge.mjs (Auto Update PR Branches) _(7 arq., 106 atrás)_ — DUPLICATA: retry do fila-merge.mjs — ficar com UMA.
- [x] **GF-008** [PR] #2274 `claude_04/nice-cori-7snz6b` — fix: corrige workflows com falha — types.ts +9 RPCs, retry HTTP 502 _(5 arq., 69 atrás)_ — DUPLICATA: retry do fila-merge.mjs + tipos RPC — ficar com UMA.
- [x] **GF-009** [PR] #2407 `claude/hopeful-knuth-4brqti` — fix(deploy-functions): instalar @types/node via npm antes do deno check (W100) _(workflow, 1 arq., 0 atrás)_ — FECHAR após o merge da mantida: duplicata da #2409 (deploy-functions).

### Lote 2 — entra sem conflito
- [x] **GF-010** [WF] branch-hygiene-audit.yml — cancelado no passo "KPI do GitHub Actions"; ler a falha de 15/10 e corrigir.
- [x] **GF-011** [WF] settings-guard.yml — run agendado de 29/10 falhou — achar a causa.
- [x] **GF-012** [PR] #1930 `claude/w21-classificar-migration-drift` — feat(db-audit): W21 — check-migration-drift --classificar: 4 classes de drift _(2 arq., 44 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash).
- [x] **GF-013** [ISSUE] #2016 (types-sync) — types.ts já atualizado: `contact_notes.is_pinned`, `admin_list_cron_jobs`, `admin_toggle_cron_job` confirmados em produção e no types.ts atual. Próxima execução agendada (seg 03/11) deve fechar sem diff. 18 comentários: abaixo do limite E51 (20).
- [x] **GF-014** [PR] #2042 `claude/w32-w94-migrations-concurrency` — ci(W94+W32): talkx-status-regen concurrency + MIGRATIONS daily lote section _(1 arq., 22 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash).
- [x] **GF-015** [PR] #2092 `claude/fix-z029-z015-summary-500-261018-1940` — fix(ci): types-sync job summary + gmail-cron-sync raw-500 (Z029+Z015p) _(workflow, rascunho, 1 arq., 18 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash). Está em RASCUNHO: confirmar que está pronta antes de tirar do rascunho.
- [x] **GF-016** [PR] #2100 `claude/fix-fase5-GA09-GA62-GA75-GA92-261019-1206` — fix: GA09/GA62/GA75/GA92/GA98/GA100 — concurrency, codeql diário, endpoint, rate _(workflow, rascunho, 7 arq., 18 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash). Está em RASCUNHO: confirmar que está pronta antes de tirar do rascunho.

### Lote 3 — conflito pequeno / renumerar migration
- [x] **GF-017** [PR] #2036 `claude/fix-db-migrate-ga04-ga05-261016-0011` — fix(ci): GA04/GA05 — console.error no heredoc db-migrate + fixtures GA05 _(workflow, rascunho, 3 arq., 191 atrás)_ — 2 arquivo(s) em conflito (db-migrate.yml, db-migrate-contratos.unit.mjs) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [x] **GF-018** [PR] #2125 `claude/fix-ga-fase1-lote-banco-261020-2200` — fix(ci): Fase 1 do plano GA18 GA19 + GA26 prepare _(workflow, 8 arq., 137 atrás)_ — 2 arquivo(s) em conflito (types-sync.yml, check-migration-drift.mjs) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [x] **GF-019** [PR] #2142 `claude/fix-ga-resto-dbmigrate-20261021-0729` — fix(ci): Resto GA13-GA17 (db-migrate 2 jobs, apply_all_missing, portao destrutiv _(workflow, 21 arq., 137 atrás)_ — 1 arquivo(s) em conflito (db-migrate.yml) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [x] **GF-020** [PR] #2143 `claude/fix-ga-resto-typessync-20261021-0730` — fix(ci): Resto GA20-GA25 (Gate 3, DESTINO split, auto-merge grants) _(workflow, 12 arq., 137 atrás)_ — 2 arquivo(s) em conflito (db-live-guard.yml, types-sync.yml) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [x] **GF-021** [PR] #2197 `claude/ga-ci-batch-ga49-ga54-ga60-ga64-231023` — ci: lote GA49–GA64 — fila-merge, actions-kpi, types-sync, codeql e branch-hygien _(workflow, 12 arq., 118 atrás)_ — 2 arquivo(s) em conflito (types-sync.yml, fila-merge.mjs) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [x] **GF-022** [PR] #2246 `claude_05/festive-carson-ub43wu` — fix: retry automático em fila-merge.mjs para HTTP 504 transitório _(migration, 23 arq., 106 atrás)_ — remover supabase/migrations/20261026210300_reconcile_team_reactions… (já na main, outro conteúdo); depois tratar como retry do fila-merge (ficar com UMA).
- [x] **GF-023** [PR] #2261 `fix/ci-workflows` — fix: corrigir falhas de CI em 4 suítes de teste e retry de rede no fila-merge _(migration, rascunho, 7 arq., 106 atrás)_ — remover supabase/migrations/20261026210300_reconcile_team_reactions… (já na main); 5 arquivos em conflito; retry fila-merge (ficar com UMA).

### Lote 4 — conflito grande / isolar delta
- [x] **GF-024** [PR] #2104 `claude/fix-db-guard-pguser-261019-1430` — fix(ci): PGUSER postgres + GA75 endpoint + GA77 sem auto-restore + TS2322 + secu _(workflow, 7 arq., 139 atrás)_ — 5 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [x] **GF-025** [PR] #2110 `claude/fix-unit-tests-createlogger-261019-1620` — fix(tests): add createLogger to vi.mock('@/lib/logger') em 20 testes _(workflow, 21 arq., 139 atrás)_ — 21 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [x] **GF-026** [PR] #2144 `claude/fix-ga-resto-docs-regen-20261021-0726` — fix(ci): Resto GA37 GA96-GA98 (docs deploy, regen, CODEOWNERS) _(workflow, 9 arq., 137 atrás)_ — 6 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [x] **GF-027** [PR] #2145 `claude/fix-ga-resto-sonar-contracts-20261021-0726` — fix(ci): Resto GA86 GA99 GA100 (sonar, contracts, adocao) _(workflow, 26 arq., 137 atrás)_ — 4 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [x] **GF-028** [PR] #2195 `claude/confident-bardeen-ndq0ch` — fix: crash cachedConversations undefined e this-binding perdido no rpc de metas  _(workflow, 25 arq., 111 atrás)_ — 14 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [x] **GF-029** [BR] `claude/fix-auto-update-pr-branch-261023-1950` _(+75, 3 em conflito)_ — workflow sem PR → `git merge-tree`: já na main → apagar branch; senão abrir PR única por workflow.
- [x] **GF-030** [BR] `claude/fix-e2e-logado-ga09-261017-1410` _(+5)_ — workflow sem PR → `git merge-tree`: já na main → apagar branch; senão abrir PR única por workflow.
- [x] **GF-031** [BR] `claude/fix-types-sync-ga20-ga21-261017-0015` _(+63, 2 em conflito)_ — workflow sem PR → `git merge-tree`: já na main → apagar branch; senão abrir PR única por workflow.

### Lote 5 — mega-PRs, decisões e documentação
- [x] **GF-032** [WF] 25 workflows "fantasma" — listar e documentar (Bearer, Hadolint, super-linter, main.yml…); não apagar runs sem necessidade.
- [x] **GF-033** [BR] `adm01-debug-patch-1-2` _(+43)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-034** [BR] `adm01-debug-patch-1-3` _(+47)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-035** [BR] `adm01-debug-patch-1-4` _(+55)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-036** [BR] `adm01-debug-patch-1-5` _(+57)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-037** [BR] `adm01-debug-patch-1-6` _(+55)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-038** [BR] `adm01-debug-patch-1-7` _(+55)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-039** [BR] `adm01-debug-patch-1-8` _(+43)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-040** [BR] `adm01-debug-patch-1` _(+39)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-041** [BR] `adm01-debug-patch-2-10` _(+30)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-042** [BR] `adm01-debug-patch-2-11` _(+40)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-043** [BR] `adm01-debug-patch-2-12` _(+29)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-044** [BR] `adm01-debug-patch-2-1` _(+28)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-045** [BR] `adm01-debug-patch-2-2` _(+66)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-046** [BR] `adm01-debug-patch-2-3` _(+31)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-047** [BR] `adm01-debug-patch-2-4` _(+36)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-048** [BR] `adm01-debug-patch-2-5` _(+98)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-049** [BR] `adm01-debug-patch-2-6` _(+18)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-050** [BR] `adm01-debug-patch-2-7` _(+33)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-051** [BR] `adm01-debug-patch-2-8` _(+70)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-052** [BR] `adm01-debug-patch-2-9` _(+34)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-053** [BR] `adm01-debug-patch-2` _(+42)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-054** [BR] `adm01-debug-patch-3-2` _(+93)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-055** [BR] `adm01-debug-patch-3` _(+32)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.
- [x] **GF-056** [BR] `adm01-debug-patch-4` _(+1)_ — criada pelo Joaquim na interface do GitHub (workflow de template — origem dos workflows "fantasma") → NÃO apagar nem abrir PR; registrar em PENDENCIAS.md o que ela adiciona, para decisão dele.

## PA — PRS ABERTAS 03 (`session_014nTibSHzggW5SPQNJ2z38L`)

### Lote 1 — urgente e barato (fechar, priorizar, destravar)
- [ ] **PA-001** [PR] #2077 `fix/f1a-lote-b-gamificacao-sem-escrita` — fix: remove teste obsoleto de mutations.ts — gamificação é só leitura no cliente _(1 arq., 115 atrás)_ — conteúdo 100% na main → FECHAR como obsoleta (comentário com prova) e apagar a branch.
- [ ] **PA-002** [PR] #2109 `claude/fix-unit-tests-customemojis-261019-1540` — fix(test): mock useCustomEmojis.upload suporta duplo .order() _(1 arq., 139 atrás)_ — conteúdo 100% na main → FECHAR como obsoleta (comentário com prova) e apagar a branch.
- [ ] **PA-003** [PR] #2111 `claude/fix-typecheck-suppression-261019-1342` — fix(types): narrowar reason_code em useTalkXSuppression para union type _(1 arq., 139 atrás)_ — DUPLICATA: tipa hook useTalkXSuppression — obsoleta se #2071 entrar.
- [ ] **PA-004** [PR] #2208 `claude/fix-typecheck-suppression-261023-2230` — fix(types): named SuppressionReasonCode type export _(1 arq., 114 atrás)_ — DUPLICATA: tipa hook useTalkXSuppression — obsoleta se #2071 entrar.
- [ ] **PA-005** [PR] #2230 `claude/chore-remove-hook-morto-talksuppression-261024-1541` — chore: remove hook morto useTalkXSuppression _(3 arq., 106 atrás)_ — FECHAR após o merge da mantida: duplicata da #2071 (hook useTalkXSuppression).
- [ ] **PA-006** [PR] #2242 `chore/analise-prs-261024-2325` — chore: inventário de PRs abertas e regras de negócio para análise _(rascunho, 3 arq., 106 atrás)_ — DUPLICATA: inventário de PRs — escolher entre #2242 e #2284.
- [ ] **PA-007** [PR] #2244 `fix/types-rpc-ausentes-261025` — fix(types): adiciona 9 assinaturas de RPC ausentes — desbloqueia CI de todas as  _(5 arq., 106 atrás)_ — DUPLICATA: tipos de RPC — conferir types.ts da main; provável obsoleta.
- [ ] **PA-008** [PR] #2250 `claude/fix-types-rpc-ausentes-251025-1230` — fix(types): adiciona 9 assinaturas de RPC ausentes em types.ts _(rascunho, 1 arq., 18 atrás)_ — DUPLICATA: tipos de RPC — conferir types.ts da main.
- [ ] **PA-009** [PR] #2284 `claude_pink/dreamy-wright-j0bser` — chore(analise-prs): auditoria de 100 PRs abertas — dossiês, relatório e regras d _(107 arq., 88 atrás)_ — DUPLICATA: inventário de PRs (107 arq.) — escolher entre #2242 e #2284.
- [ ] **PA-010** [PR] #2354 `claude/keen-galileo-dxai3p` — fix: corrigir 3 workflows com falha no CI (auto-update-pr-branch, settings-guard _(6 arq., 15 atrás)_ — DUPLICATA: auto-update/settings-guard — consolidar.
- [ ] **PA-011** [PR] #2372 `claude/fix-ci-workflows-261030-0830` — chore: PENDENCIAS.md e RELATORIO_CI_FINAL.md — workflows bloqueados Regra 8 _(3 arq., 0 atrás)_ — DUPLICATA: auto-update/settings-guard — consolidar.
- [ ] **PA-012** [PR] #2388 `main` — claude/fix-unit-tests-src-261024-1630...adm01-debug:main?expand=1 _(903 arq., 0 atrás)_ — head = main / 0 arquivos → FECHAR com comentário.
- [ ] **PA-013** [PR] #2389 `main` — compare/adm01-debug:claude/dazzling-cannon-j7iw08...adm01-debug:main?expand=1 _(101 arq., 0 atrás)_ — head = main / 0 arquivos → FECHAR com comentário.

### Lote 2 — entra sem conflito
- [ ] **PA-014** [PR] #2071 `fix/f1a-lote-b-talkxsuppression-hook-morto` — fix: remove hook morto useTalkXSuppression (TL-002) — 1 produto + 1 teste (lote  _(2 arq., 141 atrás)_ — MANTER: remove hook morto useTalkXSuppression (limpa, +38). Depois fechar #2230; reavaliar #2111/#2208.
- [ ] **PA-015** [PR] #2146 `claude/feat-teamchat-cid-261021-0758` — feat(team-chat): TeamChatView seleciona conversa via ?cid= (receptor E90) _(2 arq., 9 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash).
- [ ] **PA-016** [PR] #2222 `claude/fix-tc009-team-receipts-cid-261021-0853` — fix(db): corrige TC-009 — aplica predecessora 20261006222024 antes da 2026100919 _(rascunho, 1 arq., 108 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash). Está em RASCUNHO: confirmar que está pronta antes de tirar do rascunho.
- [ ] **PA-017** [PR] #2286 `claude/fix-stable-inventory-e09-261027-2359` — fix(edge-deploy): E09 — timestampBumped como evidência quando version não increm _(1 arq., 0 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash).

### Lote 3 — conflito pequeno / renumerar migration
- [ ] **PA-018** [PR] #2062 `fix/f1a-framer-motion-mock-voicechangerpicker-20261018` — fix(test): mock de framer-motion sem useReducedMotion — 1 arquivo (lote F1a) _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (VoiceChangerPicker.aria.test.tsx) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **PA-019** [PR] #2065 `fix/f1a-lote-b-realtime-channel-mock` — fix(test): mock de supabase.channel ausente em AgentsView — 2 arquivos (lote F1a _(2 arq., 115 atrás)_ — 2 arquivo(s) em conflito (AgentsView.capacidade.test.tsx, AgentsView.pendencias.test.tsx) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **PA-020** [PR] #2072 `fix/f1a-lote-b-talkxsegments` — fix: supabase.rpc perde o this + lead_origin sem comingSoon + real_sector/real_u _(2 arq., 141 atrás)_ — 1 arquivo(s) em conflito (useTalkXSegments.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **PA-021** [PR] #2076 `fix/f1a-lote-b-batch2` — fix(test): mock de framer-motion sem useReducedMotion/MotionConfig em GroupsView _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (GroupsView.a11y.test.tsx) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **PA-022** [PR] #2080 `fix/f1a-lote-b-useteamchatnotifications` — fix: useTeamChatNotifications — canal recriado no volume + aviso sem Service Wor _(2 arq., 141 atrás)_ — 2 arquivo(s) em conflito (useTeamChatNotifications.canal-estavel.test.tsx, useTeamChatNotifications.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **PA-023** [PR] #2083 `fix/f1a-lote-b-batch6` — fix: NPSDashboard não expunha erro de leitura nem aviso de teto (t_1944d290) — 1 _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (NPSDashboard.tsx) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **PA-024** [PR] #2087 `fix/f1a-lote-b-batch10` — fix(test): mock de supabase.rpc ausente ao buscar em GmailInboxView.paginacao (l _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (GmailInboxView.paginacao.test.tsx) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **PA-025** [PR] #2107 `claude/docs-g9-absorb-261019-1300` — docs(g9): absorver planos de docs ausentes da main — E274 _(3 arq., 115 atrás)_ — 1 arquivo(s) em conflito (PLANO_ORDEM_BANNER_SUPERIOR_20_ETAPAS_2026-09-30.md) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **PA-026** [PR] #2148 `claude/test-e2e-contatos-fab-261021-0819` — test(e2e): destrava specs deslogados de Contatos com boot e health mockados _(3 arq., 115 atrás)_ — 2 arquivo(s) em conflito (a11y-fab-cabecalho.spec.ts, mapa-mocks.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **PA-027** [PR] #2196 `claude/dia-2026-10-19-ct011-hmac-talkx-artefatos-231023` — feat: TalkX editor de templates e artefatos gerados (dia/2026-10-19) _(6 arq., 115 atrás)_ — 1 arquivo(s) em conflito (TalkXTemplateEditor.tsx) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **PA-028** [PR] #2225 `claude/fix-e2e-mock-app-bootstrap-261024-1527` — fix(e2e): mock do RPC app_bootstrap para corrigir travamento em ProtectedRoute _(1 arq., 107 atrás)_ — 1 arquivo(s) em conflito (mapa-mocks.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.

### Lote 4 — conflito grande / isolar delta
- [ ] **PA-029** [PR] #2058 `fix/f1a-lote-b-main` — fix(test): mock de @/lib/logger sem createLogger — 9 arquivos (lote F1a) _(9 arq., 141 atrás)_ — 7 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **PA-030** [PR] #2068 `fix/f1a-lote-b-admin-audit-page-size` — fix(test): mock de useAdminData sem AUDIT_PAGE_SIZE/MIN_PASSWORD_LENGTH — 2 arqu _(3 arq., 115 atrás)_ — 3 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **PA-031** [PR] #2091 `claude/fix-z011bc-timing-safe-261018-1855` — fix: timing-safe comparison em searchbox-budget-alert e whatsapp-webhook (Z011-B _(3 arq., 140 atrás)_ — 3 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **PA-032** [PR] #2233 `claude/fix-ci-tests-batch2-2610-1830` — fix: corrige 3 falhas de Vitest (SL-070, HZ5-09, a11y TTS) _(8 arq., 106 atrás)_ — 6 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **PA-033** [PR] #2263 `claude/fix-settings-salvar-aparencia-261025-1905` — fix: salvar preferências na Aparência (SettingsView passa onSave/isSaving) _(migration, 169 arq., 106 atrás)_ — cadeia empilhada (78% já na main) — isolar arquivos próprios numa PR nova sobre a main e fechar esta.
- [ ] **PA-034** [PR] #2266 `claude/fix-paleta-filtros-celebracoes-261025-2110` — fix: paleta de comandos acessível, filtros do inbox com voltar/avançar e celebra _(migration, 171 arq., 106 atrás)_ — cadeia empilhada (75% na main) — isolar arquivos próprios; fechar.
- [ ] **PA-035** [PR] #2267 `claude/fix-fila-offline-sem-dono-261025-2110` — fix: fila de envio offline não entrega item sem dono e não ressuscita após logou _(migration, 175 arq., 106 atrás)_ — cadeia empilhada (81% na main) — isolar arquivos próprios; fechar.
- [ ] **PA-036** [PR] #2268 `claude/fix-templates-supervisor-knowledge-261025-2110` — fix: supervisor volta a gerenciar templates do WhatsApp e Base de Conhecimento n _(migration, 173 arq., 106 atrás)_ — cadeia empilhada (80% na main) — isolar arquivos próprios; fechar.
- [ ] **PA-037** [PR] #2269 `claude/fix-talkx-segmentos-estimativa-261025-2110` — fix: Talk X segmentos sem estimativa enganosa (real_* em breve, atualizar tolera _(migration, 173 arq., 106 atrás)_ — ponta da cadeia empilhada (76% na main) — isolar arquivos próprios; fechar.

### Lote 5 — mega-PRs, decisões e documentação
- [ ] **PA-038** [PR] #2035 `claude/fix-logger-vitest-mock-261017-1000` — fix: mock global @/lib/logger no Vitest — desbloqueia CI de todos os PRs do Copi _(319 arq., 151 atrás)_ — MEGA-PR (319 arq., 30 em conflito, base antiga) → fechar e reabrir só com o delta real sobre a main.
- [ ] **PA-039** [PR] #2219 `claude/fix-unit-tests-pre-existentes-261024-1700` — fix: corrige falhas de testes unitários pré-existentes em main _(rascunho, 117 arq., 106 atrás)_ — MEGA-PR (117 arq., 30 em conflito, base antiga) → fechar e reabrir só com o delta real sobre a main.

## S2 — SUPABASE 02 (`session_014nTibW6M4o7ENkRmrqeVwQ`)

### Lote 1 — urgente e barato (fechar, priorizar, destravar)
- [ ] **S2-001** [PR] #2255 `claude/chore-auditoria-supabase-final-251025-1655` — chore: auditoria Supabase — relatório e progresso finais (2026-10-25) _(2 arq., 15 atrás)_ — FECHAR após o merge da mantida: mesmo relatório da #2397 (combinar com SUPABASE-03).
- [ ] **S2-002** [PR] #2265 `claude/fix-revogar-grants-escrita-anon-261025-2115` — fix: revoga grants de escrita do anon em public (CRITICAL-1) _(migration, rascunho, 1 arq., 106 atrás)_ — CRITICAL-1 segurança. Versão 20261026220300 COLIDE → nova versão (reserve_migration_version), tirar de rascunho, CI, merge. PRIORIDADE MÁXIMA.
- [ ] **S2-003** [BR] `claude/festive-faraday-kv669k` _(+1976)_ — sua auditoria: push (commit b4a615e) e ABRIR PR.

### Lote 2 — entra sem conflito
- [ ] **S2-004** [PR] #2383 `codex/revoke-public-truncate-grants-20261030` — fix(db): revoga privilégios estruturais de clientes públicos _(migration, 11 arq., 0 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash).
- [ ] **S2-005** [PR] #2384 `codex/teamchat-audit-action-contract-20261030` — fix(team-chat): accept emitted audit actions _(migration, 6 arq., 0 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash).
- [ ] **S2-006** [PR] #2386 `codex/tcm-insert-member-a2-20261030` — fix(team-chat): scope direct member inserts to owners _(migration, 2 arq., 0 atrás)_ — sem conflito → atualizar com a main, rodar CI, ligar auto-merge (squash).

### Lote 3 — conflito pequeno / renumerar migration
- [ ] **S2-007** [PR] #2059 `fix/f1a-lote-b-connectioncard-dialog` — fix(test): ConnectionCard — handleDisconnectDialogOpenChange indefinido — 6 arqu _(1 arq., 141 atrás)_ — 1 arquivo(s) em conflito (ConnectionCard.tsx) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-008** [PR] #2063 `fix/f1a-lote-b-authprovider` — fix(test): useAuth sem AuthProvider no teste — 2 arquivos (lote F1a) _(2 arq., 141 atrás)_ — 2 arquivo(s) em conflito (AgentsView.conexoes.test.tsx, team-chat-notifications-mount.test.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-009** [PR] #2066 `fix/f1a-lote-b-audiomemes-storage-path` — fix: useAudioMemes sobe chave solta no bucket com policy por pasta (PK-16/PK-17) _(2 arq., 115 atrás)_ — 2 arquivo(s) em conflito (useAudioMemes.pasta-usuario.test.tsx, useAudioMemes.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-010** [PR] #2069 `fix/f1a-lote-b-useadmindata-select` — fix(test): mock de supabase sem .range()/.gte()/.lte() em useAdminData.select —  _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (useAdminData.select.test.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-011** [PR] #2074 `fix/f1a-lote-b-hooks-misc-1` — fix: overlay de useScreenProtection sem role=alert/aria-live — 1 arquivo (lote F _(1 arq., 141 atrás)_ — 1 arquivo(s) em conflito (useScreenProtection.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-012** [PR] #2078 `f3/strict-false-baseline-20261018` — ci(F3): baseline strict=false — opção A sem fila serial _(4 arq., 140 atrás)_ — 1 arquivo(s) em conflito (github-settings-guard.unit.mjs) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-013** [PR] #2081 `fix/f1a-lote-b-batch4` — fix: contagem de whatsapp_connections lançava e derrubava toda a coleta de diagn _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (useDiagnosticsData.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-014** [PR] #2084 `fix/f1a-lote-b-batch7` — fix: Leaderboard não distinguia RPC caída de ranking vazio — 1 arquivo (lote F1a _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (Leaderboard.tsx) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-015** [PR] #2088 `fix/f1a-lote-b-batch12` — fix: área segura mobile (safe-area-*) e rolagem sem barra (scrollbar-none) sem r _(1 arq., 141 atrás)_ — 1 arquivo(s) em conflito (utilities.css) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-016** [PR] #2097 `claude/fix-unit-tests-main-261019-1500` — fix: corrige falhas pré-existentes nos Unit Tests (useKnowledgeBase + useTalkXSe _(2 arq., 115 atrás)_ — 2 arquivo(s) em conflito (useKnowledgeBase.ts, useTalkXSegments.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-017** [PR] #2113 `claude/fix-evolution-go-gaps-d6-261019-1548` — fix(evolution-api): remover set-presence, find-chats e find-status-messages (GO_ _(rascunho, 3 arq., 139 atrás)_ — 1 arquivo(s) em conflito (index.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-018** [PR] #2137 `claude/fix-canonical-receipt-policies-261020-2005` — fix(db): recria canonicamente as policies de receipt do team chat (replay) _(migration, 1 arq., 115 atrás)_ — versão 20261021000000 fora de ordem → versão nova.
- [ ] **S2-019** [PR] #2152 `claude/test-toque44-seletores-261021-0853` — test(e2e): spec de toque 44px volta ao verde com seletores do app real _(2 arq., 115 atrás)_ — 1 arquivo(s) em conflito (mapa-mocks.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-020** [PR] #2186 `claude/loving-lovelace-esc3l2` — fix(security): auditoria Supabase 2026-10-22 — department_invites ownership + lo _(migration, 58 arq., 115 atrás)_ — auditoria de segurança (58 arq., 115 commits atrás); migrations 202610261x0300 fora de ordem → versão nova; isolar delta.
- [ ] **S2-021** [PR] #2206 `claude/fix-known-violations-copilot-feedback-261023-2035` — fix(ci): adiciona copilot_feedback a known-violations para desbloquear Contrato  _(rascunho, 1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (known-violations.json) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-022** [PR] #2226 `claude/fix-db-guard-b0c-261024-1527` — fix(db-guard): corrige assertion B.0c no TC-009 — backfill não deve disparar tri _(migration, 1 arq., 108 atrás)_ — 1 arquivo(s) em conflito (20261009193246_team_receipts_reactions_conversation_id_forced.sql) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-023** [PR] #2228 `claude/fix-unit-tests-mechanical-261024-1527` — fix(tests): corrige falha mecânica de mock em useAdminDataCreateUser.test.ts _(1 arq., 107 atrás)_ — 1 arquivo(s) em conflito (useAdminDataCreateUser.test.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S2-024** [PR] #2238 `claude/feat-message-delivery-post-iniciado-261024-1719` — feat(message-delivery): carimbo do POST iniciado (PD-79) + codigo de erro estave _(migration, 6 arq., 106 atrás)_ — versão 20261026210300 COLIDE com migration da main → renumerar, resolver conflito, CI, merge.
- [ ] **S2-025** [PR] #2245 `claude/fix-talkx-cron-startup-timeout-261025-1700` — fix(talkx): corrige 4.007 falhas/30d do cron talkx-scheduler-1min _(migration, rascunho, 2 arq., 106 atrás)_ — versão 20261026200300 fora de ordem → versão nova; 1 conflito.
- [ ] **S2-026** [PR] #2277 `claude_04/clever-ramanujan-xllbpo` — chore(db): GOAL backend — classifica 17 tabelas RLS + decide backups + prepara D _(migration, workflow, 8 arq., 97 atrás)_ — remover 20261026220300 e 20261026230300 (já na main com outro conteúdo); DROP 20261026240300 → PENDENCIAS.md (só Joaquim).

### Lote 4 — conflito grande / isolar delta
- [ ] **S2-027** [PR] #2249 `claude/fix-testes-unitarios-minimo-251025-1230` — fix: 3 falhas de testes unitários (HighContrastToggle, mock de canal Talk X, nom _(rascunho, 5 arq., 106 atrás)_ — 5 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.

### Lote 5 — mega-PRs, decisões e documentação
- [ ] **S2-028** [DOC] PENDENCIAS.md — registrar os DROPs e aplicações no banco que dependem do Joaquim.
- [ ] **S2-029** [PR] #2095 `claude/fix-z017-z020-auth-cors-261018-1950` — fix(security): Z018+Z020 — external-db-proxy code-leak em 502, catch via interna _(workflow, 135 arq., 140 atrás)_ — MEGA-PR (135 arq., 30 em conflito, base antiga) → fechar e reabrir só com o delta real sobre a main.

## S3 — SUPABASE 03 (`session_014nTibVDbrHYoev6Apcc9C4`)

### Lote 1 — urgente e barato (fechar, priorizar, destravar)
- [ ] **S3-001** [PR] #2215 `claude/feat-copiloto-edges-fases8-10-261024-1545` — feat: 7 edge functions copilot fases 8-10 (CV-071–CV-100) _(rascunho, 8 arq., 110 atrás)_ — FECHAR após o merge da mantida: mesmos 7 arquivos da #2216.
- [ ] **S3-002** [PR] #2217 `claude/feat-copiloto-edge-fases8-10-261024-1700` — feat: edge functions AI copiloto fases 8-15 (CV-071–CV-150) _(rascunho, 7 arq., 110 atrás)_ — FECHAR após o merge da mantida: mesmos 7 arquivos da #2216 (conferir que #2216 ⊇).
- [ ] **S3-003** [PR] #2397 `claude/dreamy-bardeen-m4odyv` — Reset audit progress to new session baseline _(31 arq., 1 atrás)_ — sua auditoria (dreamy-bardeen) — CI e merge; depois decidir #2255.

### Lote 2 — entra sem conflito
- [ ] **S3-004** [PR] #2216 `claude/feat-copiloto-edge-fns-fases8-15-261024-1615` — feat: 7 edge functions copiloto RADAR fases 8-15 (CV-071–CV-150) _(rascunho, 7 arq., 110 atrás)_ — MANTER: edge functions copiloto fases 8–15 (7 arquivos únicos). Atualizar, CI, merge; depois fechar #2215 e #2217.

### Lote 3 — conflito pequeno / renumerar migration
- [ ] **S3-005** [PR] #1997 `claude/feat-copiloto-cv011-020-migrations-261016-1930` — feat: CV-010–020 — Fase 2 RADAR copilot (migrations + feature flag) _(migration, 9 arq., 1 atrás)_ — copilot_sessions/insights/feedback já na main (20261030100000/20261030110000/20261026130300) → tirar essas; restam tick_trigger/presence/retention com versão nova.
- [ ] **S3-006** [PR] #2060 `fix/f1a-order-mock-usecustomemojis-20261018` — fix(test): mock da cadeia supabase sem o 2º .order() — 1 arquivo (lote F1a) _(1 arq., 141 atrás)_ — 1 arquivo(s) em conflito (useCustomEmojis.upload.test.tsx) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S3-007** [PR] #2064 `fix/f1a-supabase-channel-mock-audiomeme-20261018` — fix(test): mock de supabase.channel incompleto — 1 arquivo (lote F1a) _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (useChatMediaSending.audio-meme-falha.test.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S3-008** [PR] #2067 `fix/f1a-logger-ttsvoice-mock-arquivos-conversa-20261018` — fix(test): 2 mocks locais incompletos — 1 arquivo (lote F1a) _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (arquivos-ver-na-conversa.test.tsx) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S3-009** [PR] #2075 `fix/f1a-lote-b-usewarroomalerts` — fix: aviso de desktop do War Room saía pelo caminho que exige Service Worker — 1 _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (useWarRoomAlerts.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S3-010** [PR] #2079 `fix/f1a-lote-b-batch3` — fix(test): assume canal errado quando useTeamReadState abre o seu próprio — useT _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (useTeamMessages.canal-e-reconexao.test.tsx) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S3-011** [PR] #2082 `fix/f1a-lote-b-batch5` — fix: falha de leitura em useUserSettings ficava invisível (C-1) — 1 arquivo (lot _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (useUserSettings.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S3-012** [PR] #2086 `fix/f1a-lote-b-batch9` — fix: botão de remover atendente do QueueCard sem nome exato e morto ao toque (N- _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (QueueCard.tsx) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S3-013** [PR] #2089 `fix/f1a-lote-b-batch13` — fix: ChatService.uploadAudio gravava sempre como .webm, ignorando o mime real do _(1 arq., 115 atrás)_ — 1 arquivo(s) em conflito (chat.service.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S3-014** [PR] #2147 `claude/fix-n011-dinamico-261021-0759` — fix(db-audit): guard n011 com teto dinamico por dominio e canonico atual _(1 arq., 137 atrás)_ — 1 arquivo(s) em conflito (n011-storage-policies-dedup.test.mjs) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S3-015** [PR] #2214 `claude/feat-copiloto-fases13-15-ddl-261024-1530` — feat: DDL 7 tabelas copiloto RADAR fases 13-15 (CV-121–CV-150) _(migration, rascunho, 2 arq., 110 atrás)_ — RADAR fases 13–15; versão 20261026180300 fora de ordem → versão nova; 1 conflito.
- [ ] **S3-016** [PR] #2232 `claude/fix-unit-tests-ui-divergent-round2-261024-1541` — test(inbox): corrige seletor CSS do TtsButton — h-6.w-6 → h-8.w-8 [round2] _(1 arq., 106 atrás)_ — 1 arquivo(s) em conflito (SummaryResult.test.tsx) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S3-017** [PR] #2381 `claude/radar-motor-copilot-live-301030` — feat(copilot): motor do RADAR no ai-jobs-worker, nascendo desligado (CV-021–045) _(migration, 29 arq., 11 atrás)_ — 1 arquivo(s) em conflito (types.ts) → resolver, CI, merge. Antes: `git merge-tree` — se o delta líquido for vazio, FECHAR.
- [ ] **S3-018** [BR] `claude/feat-copiloto-cv021-030-worker-261016-2100` _(+1007, 1 em conflito)_ — migration sem PR → versão nova via reserve_migration_version, resolver conflito, abrir PR.
- [ ] **S3-019** [BR] `claude/feat-copiloto-cv031-040-brinde-intelligence-261016-2025` _(+1891, 1 em conflito)_ — migration sem PR → versão nova via reserve_migration_version, resolver conflito, abrir PR.
- [ ] **S3-020** [BR] `codex/publish-followup-20261021` _(+1963, 33 em conflito)_ — migration sem PR → versão nova via reserve_migration_version, resolver conflito, abrir PR.

### Lote 4 — conflito grande / isolar delta
- [ ] **S3-021** [PR] #2070 `fix/f1a-lote-b-useadmindata-createuser-avatar` — fix: avatar assinado ao carregar + testes de handleCreateUser na camada antiga d _(4 arq., 115 atrás)_ — 75% já na main → isolar o delta numa PR nova sobre a main; fechar esta.
- [ ] **S3-022** [PR] #2098 `claude/fix-ci-tests-261019-1200` — fix: corrigir falhas de CI — testes, a11y, bundle e motion (261019) _(11 arq., 139 atrás)_ — 7 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **S3-023** [PR] #2108 `claude_pink/cool-dijkstra-xk9ek2` — fix(ci): GA20/GA21/GA22/GA23/GA27/GA38/GA39/GA55/GA72 + GA75–GA78/GA92 — auditor _(migration, workflow, rascunho, 83 arq., 80 atrás)_ — 15 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **S3-024** [PR] #2124 `claude/fix-ga-fase0-banco-e2e-261020-2200` — fix(ci): Fase 0 do plano GA02-GA12 _(migration, workflow, 13 arq., 137 atrás)_ — 3 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **S3-025** [PR] #2187 `claude/busy-cannon-40szm9` — fix(tests): corrige falhas de testes no baseline main — mocks, lógica e código m _(68 arq., 115 atrás)_ — 30 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **S3-026** [PR] #2190 `claude/ecstatic-bardeen-twiveb` — fix: corrige 9 falhas de CI que mantinham a main vermelha _(migration, workflow, 94 arq., 112 atrás)_ — 30 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **S3-027** [PR] #2199 `claude/magical-pasteur-iz2pgy` — fix: corrige 3 falhas de CI — unit tests virtualizer + DB Guard PG17 roles _(migration, rascunho, 23 arq., 117 atrás)_ — 12 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.
- [ ] **S3-028** [PR] #2221 `claude/fix-unit-tests-src-261024-1630` — fix: corrige falhas pré-existentes nos Unit Tests de src/ _(rascunho, 45 arq., 106 atrás)_ — 25 arquivos em conflito → `git merge-tree` contra a main; delta vazio → FECHAR; senão resolver ou isolar o delta.

## BR — BRANCHS CORREÇÕES (`session_014nTibVLQcoWAuwGA72Dxmv`)

### Lote 1 — urgente e barato (fechar, priorizar, destravar)
- [ ] **BR-001** [DOC] analise/progresso.json + dossiês — refazer os dossiês com histórico completo (o lote 2 foi revertido).
- [ ] **BR-002** [PR] #2200 `claude/dazzling-cannon-j7iw08` — analise: dossiê branch hermes/telefonia-contrato-dados-26092615475e51 _(22 arq., 18 atrás)_ — FECHAR após o merge da mantida: dossiê contido na #2396.
- [ ] **BR-003** [PR] #2396 `claude/trusting-albattani-9x3ipg` — docs: add analysis dossier for hermes/telefonia-contrato-dados branch _(20 arq., 0 atrás)_ — esta sessão — docs; auto-merge ligado.
- [ ] **BR-004** [BR] `automation/types-sync` _(+0)_ — SUPERADA (merge-tree = main) → confirmar e apagar a branch.
- [ ] **BR-005** [BR] `claude/fervent-noether-vvq63j` _(+0)_ — SUPERADA (merge-tree = main) → confirmar e apagar a branch.
- [ ] **BR-006** [BR] `claude/fix-deploy-functions-2408` _(+47)_ — duplicata do fix da #2409 → apagar depois do merge da #2409.

### Lote 2 — entra sem conflito
- [ ] **BR-007** [BR] `claude/fix-ci-workitem-tz-261025-1350` _(+4)_ — entra limpa → revisar o conteúdo e abrir PR (ou apagar se for só ruído).
- [ ] **BR-008** [BR] `claude/fix-plano-190-etapas-261019-1200` _(+979)_ — entra limpa → revisar o conteúdo e abrir PR (ou apagar se for só ruído).
- [ ] **BR-009** [BR] `claude/fix-types-sync-is-pinned-261029` _(+7)_ — entra limpa → revisar o conteúdo e abrir PR (ou apagar se for só ruído).
- [ ] **BR-010** [BR] `claude/fix-unit-tests-inbox-261023-1108` _(+3)_ — entra limpa → revisar o conteúdo e abrir PR (ou apagar se for só ruído).
- [ ] **BR-011** [BR] `claude/pensive-cori-i93zgf` _(+2)_ — entra limpa → revisar o conteúdo e abrir PR (ou apagar se for só ruído).

### Lote 3 — conflito pequeno / renumerar migration
- [ ] **BR-012** [BR] `claude/feat-copiloto-cv041-050-suggest-reply-261016-2145` _(+1392, 1 em conflito)_ — RADAR com 4 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-013** [BR] `claude/feat-copiloto-cv051-060-radar-popup-261016-2130` _(+1099, 2 em conflito)_ — RADAR com 6 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-014** [BR] `claude/feat-copiloto-cv071-080-objection-battlecard-261016-2230` _(+1372, 5 em conflito)_ — RADAR com 9 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-015** [BR] `claude/feat-copiloto-cv071-150-fases-8-15-261024-1400` _(+2336, 10 em conflito)_ — RADAR com 14 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-016** [BR] `claude/feat-copiloto-cv081-090-catalog-budget-261016-2235` _(+923, 5 em conflito)_ — RADAR com 4 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-017** [BR] `claude/feat-copiloto-cv091-100-lead-signals-261016-2240` _(+1024, 4 em conflito)_ — RADAR com 7 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-018** [BR] `claude/feat-copiloto-cv091-100-signals-261016-2305` _(+1023, 7 em conflito)_ — RADAR com 7 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-019** [BR] `claude/feat-copiloto-cv101-110-multimodal-261016-0730` _(+938, 5 em conflito)_ — RADAR com 11 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-020** [BR] `claude/feat-copiloto-cv101-110-multimodal-261016-2310` _(+639, 3 em conflito)_ — RADAR com 5 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-021** [BR] `claude/feat-copiloto-cv111-120-guardrails-261016-0810` _(+668, 2 em conflito)_ — RADAR com 10 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-022** [BR] `claude/feat-copiloto-cv111-120-guardrails-261016-2315` _(+606, 2 em conflito)_ — RADAR com 6 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-023** [BR] `claude/feat-copiloto-cv121-130-supervisor-261016-2304` _(+1079, 4 em conflito)_ — RADAR com 8 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-024** [BR] `claude/feat-copiloto-cv121-130-supervisor-261016-2320` _(+565, 2 em conflito)_ — RADAR com 6 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-025** [BR] `claude/feat-copiloto-cv131-140-analytics-261016-2325` _(+776, 2 em conflito)_ — RADAR com 6 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-026** [BR] `claude/feat-copiloto-cv131-140-aprendizado-261016-2310` _(+895, 2 em conflito)_ — RADAR com 10 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-027** [BR] `claude/feat-copiloto-cv141-150-integration-261016-2330` _(+900, 2 em conflito)_ — RADAR com 6 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-028** [BR] `claude/feat-copiloto-cv141-150-piloto-261016-2317` _(+1393, 2 em conflito)_ — RADAR com 10 arquivo(s) de código novo → consolidar com as outras versões da mesma fase, resolver conflito, abrir PR.
- [ ] **BR-029** [BR] `claude/feat-e83-entrar-por-codigo-261020-1935` _(+219, 2 em conflito)_ — 1 arquivo(s) de código novo + conflito → resolver e abrir PR.
- [ ] **BR-030** [BR] `fix/f1a-lote-b-batch14` _(+218, 2 em conflito)_ — 1 arquivo(s) de código novo + conflito → resolver e abrir PR.

### Lote 4 — conflito grande / isolar delta
- [ ] **BR-031** [BR] `claude/chore-regen-edge-manifest-261030-0830` _(+3, 1 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-032** [BR] `claude/feat-copiloto-cv061-070-ghost-text-261016-2200` _(+206, 8 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-033** [BR] `claude/fix-ci-mocks-framer-261025-1700` _(+37, 7 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-034** [BR] `claude/fix-ci-talkx-segments-261025-1330` _(+21, 1 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-035** [BR] `claude/fix-ci-teamchat-mount-261025-1340` _(+18, 1 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-036** [BR] `claude/fix-ci-testes-admin-261025-1709` _(+101, 7 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-037** [BR] `claude/fix-ci-testes-geral-261025-1709` _(+51, 3 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-038** [BR] `claude/fix-ci-testes-inbox-261025-1710` _(+57, 5 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-039** [BR] `claude/fix-ci-testes-talkx-251025-1200` _(+99, 7 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-040** [BR] `claude/fix-ci-testes-ui-261025-1709` _(+83, 6 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-041** [BR] `claude/fix-ci-unit-tests-261025-1230` _(+41, 3 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-042** [BR] `claude/fix-contatos-cabecalho-fab-261020-1933` _(+17, 2 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-043** [BR] `claude/fix-deno-lock-tslib-261030-1100` _(+162, 1 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-044** [BR] `claude/fix-deploy-functions-deno-none` _(+66, 2 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-045** [BR] `claude/fix-main-tests-231023-1530` _(+452, 23 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-046** [BR] `claude/fix-talkx-hook-morto-261025-1915` _(+532, 12 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-047** [BR] `claude/optimistic-hypatia-5ormu1` _(+3123, 14 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-048** [BR] `claude/wizardly-meitner-aejx3i` _(+10246, 13 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-049** [BR] `codex/consolida-contatos-fab` _(+17, 2 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-050** [BR] `codex/sincronizacao-canonica-20261016` _(+13, 2 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-051** [BR] `dia/2026-10-23` _(+187, 14 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-052** [BR] `feat/media-migration-tool-261024-2336` _(+245, 1 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-053** [BR] `fix/deploy-functions-deno-auto-2026-10-30` _(+69, 1 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-054** [BR] `fix/f1a-lote-b-batch8` _(+421, 2 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.
- [ ] **BR-055** [BR] `fix/f1a-lote-b-useknowledgebase` _(+737, 2 em conflito)_ — conflito sem arquivo novo → comparar o diff líquido com a main; coberto → apagar; senão abrir PR.

### Lote 5 — mega-PRs, decisões e documentação
- [ ] **BR-056** [COORD] analise/PLANO_COORDENACAO.md + BACKLOG_TAREFAS.md — marcar FEITO conforme as sessões reportarem; reatribuir o que travar.
