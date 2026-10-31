# Plano de coordenação — 6 sessões ZAPP WEB V2 (v2)

**Data:** 2026-10-31 ~03:00 UTC · `main` = `668d77329`
**Coordenação:** sessão "ZAPP WEB V2 - BRANCHS CORREÇÕES" (`session_014nTibVLQcoWAuwGA72Dxmv`)
**Inventários-base** (nesta mesma branch, `claude/trusting-albattani-9x3ipg`):
- `analise/inventario-2026-10-31/prs-abertas.md` — 142 PRs, estado de merge, CI, duplicatas, colisões de migration
- `analise/inventario-2026-10-31/workflows-main.md` — último run de cada workflow na `main` e causa da falha
- `analise/inventario-2026-10-31/branches-remotas.md` — 225 branches classificadas por `git merge-tree`

**Lista de tarefas individuais (239, por sessão e lote):** `analise/BACKLOG_TAREFAS.md`.

Para ler: `git fetch origin claude/trusting-albattani-9x3ipg && git show origin/claude/trusting-albattani-9x3ipg:analise/PLANO_COORDENACAO.md`

---

## 0. Correção do aviso anterior

O aviso de 02:39 ("18 branches SUPERADA") **estava errado**. O clone era raso, `git diff origin/main...branch`
falhou com `no merge base` e a saída vazia foi lida como "0 arquivos". Revertido em `4f021866e`.
Das 17 branches: 7 tocam migrations, 8 conflitam com a `main`, 1 toca workflow, 1 integra limpa.
**Nenhum veredito daquele lote vale.**

---

## 1. Fatos que mudam o jeito de trabalhar

1. **Required checks reais da `main` são 3, não 6:** `🏗️ Build`, `🔎 TypeCheck`, `✅ CI Gate (required check)`
   (`strict=true`, `required_linear_history=true`, `enforce_admins=true`). O `CI Gate` agrega os demais.
   O CLAUDE.md ainda lista os 6 antigos — documentação desatualizada (meta da sessão GH-REQUIRED).
2. **A `main` está verde** em TypeCheck, Unit Tests 3/3, Contrato DB offline, Security e E2E.
   As falhas em massa nas PRs (Contrato DB 97, Unit Tests ~95) são **CI antigo sobre base antiga**:
   a cura é atualizar com a `main` e rodar o CI de novo, não corrigir PR por PR.
3. **142 PRs abertas:** 109 conflitam com a `main`, 104 nem têm o `CI Gate`, maioria 100–190 commits atrás,
   25 rascunhos, 49 com auto-merge (nenhuma entra sem atualização).
4. **225 branches remotas:** 108 com conflito, 70 tocam workflow, 22 tocam migration, 21 limpas, 4 SUPERADA.
   83 não estão no inventário antigo; 34 do inventário já foram apagadas.
5. **5 workflows vermelhos na `main`:** deploy-functions, db-live-guard, e2e-logado, db-migrate, branch-hygiene-audit.

---

## 2. Regras para todas as sessões

1. **Clone completo antes de qualquer veredito:** `git fetch --unshallow` (ou `git rev-parse --is-shallow-repository` = `false`).
   Erro de git **nunca** é "sem diferença". Use `git merge-tree --write-tree origin/main origin/<b>`:
   resultado igual à árvore da `main` = SUPERADA.
2. **Cada PR e cada branch tem UM dono** (tabelas da seção 3). Não mexa em PR/branch de outra sessão.
   Se precisar, mande mensagem ao dono.
3. **Fechar PR ou apagar branch:** só depois de provar que o conteúdo está na `main` (ou que outra PR o carrega),
   com comentário dizendo onde está o conteúdo. Fechar não é neutro.
4. **Merge:** ligue auto-merge (squash) quando a PR estiver pronta; o `auto-update-pr-branch.yml` atualiza
   PRs com auto-merge. **No máximo 3 PRs suas em "atualizar + CI" ao mesmo tempo** — os runners já estão
   enfileirando e cada merge deixa todas as outras PRs `BEHIND`.
5. **Migrations:** versão nova sempre por `SELECT supabase_migrations.reserve_migration_version('<sessao>','<motivo>')`
   + `ls supabase/migrations` + PRs abertas. Nunca editar migration que já está na `main` (o db-guard reprova).
   **Nenhuma escrita no banco de produção por agente** (CLAUDE.md §0): DDL entra pelo `db-migrate.yml`
   com aprovação do Joaquim. O que depender dele vai para `PENDENCIAS.md`.
6. **Nada em SINGU** nem nos outros bancos externos. `DROP`/`REVOKE` destrutivo = só Joaquim.
7. **Não pular, apagar ou enfraquecer teste**; não usar `continue-on-error`, `|| true`, `@ts-ignore`.
8. **Ao concluir um item**, mande mensagem curta à sessão coordenadora (`session_014nTibVLQcoWAuwGA72Dxmv`):
   `FEITO <item> — PR #N mergeada / fechada (motivo)`. A coordenação mantém este arquivo atualizado.

---

## 3. Metas por sessão

### S1 — GH ACTIONS REQUIRED (`session_014nTibRx2Q1QhGpGBeEpLKV`)
**Meta: `ci.yml` e os checks obrigatórios; deploy-functions e e2e-logado verdes na `main`.**
1. deploy-functions: ficar com **#2409**. Depois do merge, fechar **#2407, #2408, #2380** (duplicatas) e decidir #2411 (docs do mesmo fix).
2. e2e-logado: `e2e/telefonia.spec.ts:224` (Y11, número incompleto) falha no Firefox; o job autenticado estoura o tempo. Revisar #2279 (workers 1→2, rascunho).
3. Corrigir a documentação dos required checks: CLAUDE.md (tabela "Perímetro do GitHub") e `scripts/ci/github-settings-baseline.json` com os 3 reais — conferir antes o que o `settings-guard` compara.
4. Consolidar as PRs que tocam `ci.yml` (23): plano GA (#2034, #2124 *só a parte de ci.yml*, #2036, #2125, #2123, #2126, #2128, #2129, #2143, #2144, #2145, #2100), "destrava workflows" (#2151, #2155, #2139, #2138, #2093), pular jobs em rascunho (#2046 × #2295), auto-update/settings-guard (#2056, #2211, #2354, #2372). Para cada uma: o conteúdo já está na `main`? Fechar com referência; o que faltar vira **uma** PR por workflow.

### S2 — GH ACTIONS FAILURE (`session_014nTibS9cuNo8UN81A4hCUu`)
**Meta: workflows de banco e de higiene verdes; issues de alerta limpas.**
1. Fechar a sua #2407 (duplicata da #2409, dona S1) — confirmar com S1.
2. db-live-guard (issue #1965): 2 versões com `statements` em prosa, 1 nome divergente, 3 com SQL divergente (todas de 16/10); ACL de `mcp_exec` (`check-mcp-exec-acl.sql:380`); auditoria de runtime config. Diagnóstico só por leitura; correção por arquivo + PR; escrita no ledger = PENDENCIAS.md para o Joaquim.
3. db-migrate: `remote_only_count=3` (3 versões no ledger sem arquivo). Reconciliar arquivos (CLAUDE.md §"Alocação de versão", regra 2). Revisar #2142.
4. branch-hygiene-audit (cancelado no passo "KPI do GitHub Actions"; #2197) e settings-guard (agendado de 29/10 falhou).
5. Issue #2016 (types-sync, 18 comentários, parada desde 29/10) — aplicar a política E51 (>20 comentários) se for o caso.
6. 25 workflows "fantasma" no Actions sem arquivo na `main`: listar e documentar (não apagar runs sem necessidade).
7. PRs de workflow que **não** tocam `ci.yml`: `db-guard.yml`/`db-migrate.yml` (#1930, #2042, #2142, #2197, #2261 parte workflow) e o retry do `fila-merge.mjs` (#2218, #2246, #2261, #2273, #2274 → **uma só**). Em #2246/#2261, **remover** o arquivo `20261026210300_reconcile_team_reactions…` (já está na `main` com outro conteúdo).

### S3 — PRS ABERTAS 03 (`session_014nTibSHzggW5SPQNJ2z38L`)
**Meta: zerar o backlog de PRs de código (sem migration e sem workflow).**
1. Fechar já, com comentário: **#2077, #2109** (100% na `main`), **#2388, #2389** (head = `main`, 0 arquivos).
2. Família "corrige testes unitários" (~40 PRs: #2058–#2089, #2097, #2110, #2187, #2219, #2221, #2228, #2232, #2233, #2249): a `main` passa Unit Tests 3/3. Para cada uma, `git merge-tree` contra a `main`; sem delta real → fechar; com delta → atualizar, CI, merge.
3. Duplicatas: #2071 × #2230 (hook `useTalkXSuppression`; #2111, #2208 dependem), #2242 × #2284, #2244 × #2250 (tipos de RPC — conferir `types.ts` da `main`).
4. Cadeia empilhada #2263 → #2266 → #2267 → #2268 → #2269: 75–81% já na `main`; isolar os 3–9 arquivos próprios de cada uma numa PR nova sobre a `main`.
5. Mega-PRs com base de 17–21/10 (#2035, #2040, #2105, #2126 *se não for de S1*, #2151 *idem*, #2138, #2219, #2284): fechar e reabrir só com o delta real.
6. Restante das PRs de código conflitantes (lista em `prs-abertas.md`): resolver conflito, atualizar, CI, merge — uma por vez.

### S4 — SUPABASE 02 (`session_014nTibW6M4o7ENkRmrqeVwQ`)
**Meta: publicar a sua auditoria e destravar as PRs de migration de segurança, team chat e entrega.**
1. Push de `claude/festive-faraday-kv669k` (commit `b4a615e`) e abrir PR (hoje não tem).
2. **#2265** (CRITICAL-1, revoga escrita do anon) — versão `20261026220300` colide: nova versão reservada. Prioridade máxima de segurança.
3. **#2238** (`outbound_post_started`) — versão `20261026210300` colide: renumerar.
4. **#2277** — remover os 2 arquivos que já estão na `main` com outro conteúdo; o `DROP` de `20261026240300_drop_bkp_261023.sql` vai para PENDENCIAS.md (só Joaquim).
5. #2186 (auditoria de segurança, 58 arquivos), #2095 (Z018/Z020, 135 arquivos), #2137, #2245, #2226: versões fora de ordem → versão nova; isolar o delta real.
6. #2383, #2384, #2386 (codex, sem conflito): CI e merge. #2255 × #2397: combinar com S5 qual fica.

### S5 — SUPABASE 03 (`session_014nTibVDbrHYoev6Apcc9C4`)
**Meta: publicar a sua auditoria e integrar a parte de banco e edge functions do Copiloto RADAR.**
1. Push e merge da **#2397** (`dreamy-bardeen`).
2. Migrations do RADAR: **#1997** (tabelas `copilot_sessions/insights/feedback` já estão na `main` com outras versões; restam tick_trigger/presence/retention), **#2214** (fases 13–15), **#2381** (motor, 25 arquivos únicos), #2108, #2199, #2190, #2124 (fix-ga-fase0).
3. Branches de migration do RADAR **sem PR**: `feat-copiloto-cv021-030-worker-261016-2100`, `feat-copiloto-cv031-040-brinde-intelligence-261016-2025` (14 arquivos únicos), `codex/publish-followup-20261021` (33 em conflito).
4. Edge functions do copiloto fases 8–15: **#2215, #2216, #2217** são os mesmos 7 arquivos — ficar com uma (#2216 ou #2217) e fechar as outras.

### S6 — BRANCHS CORREÇÕES (`session_014nTibVLQcoWAuwGA72Dxmv`, esta) ✅ CONCLUÍDA (2026-10-31)
**Meta atingida: 56 BR tasks concluídas (BR-001..BR-056).**

**Resultado por lote:**
1. ✅ **Lote 1 (BR-001..BR-006):** dossiês lotes 1-4 em PRs #2413, #2415, #2422, #2429; PR #2396 aberta (auto-merge).
2. ✅ **Lote 2 (BR-007..BR-011):** PRs #2416 (fix-ci-workitem-tz), #2418 (fix-plano-190-etapas), #2417 (fix-unit-tests-inbox) abertas; branches SUPERADA apagadas.
3. ✅ **Lote 3 (BR-012..BR-030):** branches cv04x–cv14x RADAR (fases 2–7) confirmadas COBERTA via git merge-tree (conteúdo na main por PR #2361) e apagadas; feat-e83 e fix-f1a-batch14 COBERTA e apagadas.
4. ✅ **Lote 4 (BR-031..BR-055):** todas as 25 branches COBERTA confirmadas e apagadas.
5. ✅ **Lote 5 (BR-056):** este commit — BACKLOG_TAREFAS.md e PLANO_COORDENACAO.md atualizados.

**Branches restantes (não S6):** cv041–cv141 com código novo mas conflito pertencem a S5 (ver meta S5 acima).

---

## 4. Ordem de prioridade (vale para todos)

1. `main` verde: #2409 (S1).
2. Segurança: #2265 (S4).
3. Limpeza barata (fechar obsoletas e duplicatas) — reduz ruído e fila de CI: S1, S2, S3.
4. Publicar auditorias: festive-faraday (S4), #2397 (S5).
5. Integração de conteúdo novo: RADAR (S5 + S6), PRs de código (S3), migrations (S4, S5).
6. Workflows restantes e documentação (S1, S2).

## 5. Pendências que dependem do Joaquim (registrar em PENDENCIAS.md)

- Aprovar no environment `producao-ddl` cada `db-migrate.yml` com `apply=true`.
- `DROP` de `20261026240300_drop_bkp_261023.sql` (#2277).
- Correção de linhas do ledger para o db-live-guard (`statements` em prosa / SQL divergente).
- Secret `SUPABASE_SERVICE_ROLE_KEY` ausente no e2e-logado (só pula limpeza, não causa falha).
