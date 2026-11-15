# Dossiê — `Github_Copilotauditorias-anteriores-reconciliacao`

- Ref: `origin/Github_Copilotauditorias-anteriores-reconciliacao` · tip `141d30b34` (2026-10-31, "chore: 2026-10-31") · merge-base `e4989b16f` · 1 commit à frente · sem PR.
- Único arquivo: `analise-prs/auditorias-anteriores.md` (+222 linhas, arquivo novo no merge-base: `git show e4989b16f:analise-prs/auditorias-anteriores.md` → "exists on disk, but not in e4989b16f").

## Propósito
Rascunho do relatório "Reconciliação de Auditorias Anteriores" (data 2026-10-31, autor "Copilot Project Coordinator", rodapé: "gerado por sessao Copilot `Github_Copilotcuddly-barnacle` em 2026-10-31T15:14Z"). Documento só de prosa: tabela D01–D18 de documentos lidos, achados SEG/CI/FE/DB/INF, contradições, PRs, backlog B01–B10, linha do tempo. Zero código, migration, edge ou workflow (`counts`: src=0, edges=0, migrations=0, workflows=0).

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência |
|---|---|---|---|
| `analise-prs/auditorias-anteriores.md` | BOTH_CHANGED / CONFLICT (161 linhas "faltando") | **Versão paralela superada.** A `main` recebeu no MESMO dia outra redação do MESMO relatório (mesmo título, mesma data, mesmo autor, cabeçalho cita explicitamente "sessão `Github_Copilotauditorias-anteriores-reconciliacao`"), commitada direto pelo dono e depois mantida/verificada. As 161 linhas "faltando" são apenas texto diferente para o mesmo conteúdo. | `git log origin/main -- analise-prs/auditorias-anteriores.md`: `ee8f4b6eb` 2026-10-31 adm01-debug "docs: reconciliação de auditorias anteriores em analise-prs/" (+225) → `c570d5d46` (#2630, cópia em `docs/_arquivo/analise-prs/`) → `042e5935f` (#2748, 06/11) → `37822ce6f` (#2752, 06/11, B10 recuperada). `git show origin/main:analise-prs/auditorias-anteriores.md` linhas 1-3: "# Reconciliação de Auditorias Anteriores / **Data:** 2026-10-31 / **Autor:** Copilot Project Coordinator (sessão `Github_Copilotauditorias-anteriores-reconciliacao`)". `git diff --stat ee8f4b6eb:... origin/<branch>:...` = 174 ins / 177 del (reescrita completa, não acréscimo). |

### Comparação de conteúdo (branch → onde está na main)
- Seções 1 (D01–D18), 2 (fontes inacessíveis), 3 (achados), 4 (contradições), 5 (PRs), 6 (trabalho recuperado), 7 (backlog), 8 (timeline) ↔ `main` tem as mesmas 8 seções (linhas 8, 33, 47, 79, 162, 173, 193, 204) com cobertura igual ou maior (ex.: main tem 11 SEG, 9 CI, 12 FE, 5 DB, 4 QA, 6 INF vs branch 10/9/9/5/5).
- A versão da `main` é a que foi **verificada depois**: SEG-09/DB-03 (`enforceRateLimit`) marcado "SUPERADO / NÃO PROCEDE" com evidência de código (`_shared/validation.ts` 144-161, 365-401, verificação 06/11/2026) — a branch ainda afirma "CONFIRMADO PENDENTE" (SEG-07/B02), ou seja, a branch carrega um achado já refutado. B10 marcado "RECUPERADA" na main (#2752) — na branch está aberto.
- Fatos exclusivos da branch, todos históricos e já cobertos em outro lugar da main ou estalos:
  - CI-02/CI-03 (PR #2394 deno.lock + fila-merge) → `docs/_arquivo/RELATORIO_CI.md:160` ("PR #2394 — MERGEADA em bcb11c84") e `docs/ci/RELATORIO_CI.md:21`.
  - DB-03 (TC-004, migration `20261006170426`) → migration existe em `supabase/migrations/20261006170426_fix_member_role_leave_remove_rpcs.sql` e é citada em `docs/audits/MATRIZ_BABBAGE_SALVAGE.md`.
  - CI-06 (PR #2244 types.ts) → `docs/_arquivo/analise-prs/dossies/PR-2244.md`.
  - SEG-08/CI-01/B03 "main sem branch protection" → **estalado**: `scripts/ci/github-settings-baseline.json` (`medido_em` 2026-11-02) registra `strict:true`, `enforce_admins:true`, required checks CI Gate/Build/TypeCheck.
  - DB-05 (`rpc_refresh_daily_metrics` 2.2s) → `docs/adr/ADR-003-june-2026-db-audit-and-performance.md`.
  - INF-02 (21 edges órfãs, fonte `ESTADO.md`) → não há tabela equivalente em `analise-prs/`; é menção de 1 linha a um doc de 20/10 (`docs/audits/AUDITORIA_MIGRACAO_DB_2026-08-27.md:443` trata o tema em outra data). Valor baixo.
  - Backlog B06 (Multiplix 15 itens), B07 (auditar 21 edges órfãs), B10 (otimizar rpc_refresh_daily_metrics) → B06 coberto por "Trabalho Anterior Recuperado" item 5 da main; B07/B10 sem equivalente, prosa.

## Veredito
**OBSOLETA** (confiança alta). A necessidade (relatório de reconciliação de auditorias de 31/10) foi atendida na `main` por outra redação do mesmo relatório, escolhida pelo dono (commit direto `ee8f4b6eb`) e evoluída com verificação posterior (#2748, #2752). Portar a branch reintroduziria um achado refutado (enforceRateLimit "pendente") e um fato estalado (sem branch protection). Nada de código.

`apagar_branch_seguro = true` — único arquivo, docs, superado com prova.

## Lacunas (nenhuma recomendada para portar)
| Arquivo | Tipo | Valor | Descrição |
|---|---|---|---|
| `analise-prs/auditorias-anteriores.md` | docs | baixo | ~3 linhas de prosa exclusivas da branch sem equivalente em `analise-prs/`: INF-02 (21 edges órfãs per `ESTADO.md` de 20/10), backlog B07 (auditar edges órfãs) e B10 (otimizar `rpc_refresh_daily_metrics`). Se alguém quiser, acrescentar como 3 linhas na tabela "Recomendações Fora do Escopo" da main; não justifica PR própria. |

Trecho da branch (para referência, caso se decida acrescentar):
```
| INF-02 | D02 | 21 edge functions orfas (sem chamador no repositorio) | CONFIRMADO PENDENTE | ESTADO.md: lista as 21; pode ser chamadas externas (N8N, cron) |
| B07 | INF-02 | Auditar as 21 edge functions orfas | MEDIO | 21 edges sem chamador verificado no repo podem ser mortas ou dependencias externas nao documentadas |
| B10 | DB-05 | Otimizar `rpc_refresh_daily_metrics` (2.2s avg) | BAIXO | 739 chamadas = 1.6K CPU-segundos; impacto em custo de banco |
```

## Verificação adversarial

**Concordo: OBSOLETA. `apagar_branch_seguro = true`.** Tentei refutar e não achei nenhum hunk de valor ≥ médio fora da `main`.

### O que conferi por conta própria
1. **Escopo mecânico** — `git diff --stat e4989b16f origin/Github_Copilotauditorias-anteriores-reconciliacao` = 1 arquivo, +222/-0 (`analise-prs/auditorias-anteriores.md`, inexistente no merge-base: `git ls-tree e4989b16f -- analise-prs/auditorias-anteriores.md` vazio). Tip `141d30b34` "chore:" (Joaquim Ataides, 31/10 15:18). Zero código/migration/edge/workflow.
2. **A substituição da `main` cobre a necessidade** — li `git show origin/main:analise-prs/auditorias-anteriores.md` inteiro (225 linhas). Mesmo título/data/autor; 8 seções equivalentes às 8 da branch; **mais** achados (11 SEG + 9 CI + 12 FE + 5 DB + 4 QA + 6 INF = 47 vs 38 da branch) e 13 PRs mapeadas. Histórico: `ee8f4b6eb` (31/10, commit direto do dono) → `c570d5d46` (#2630) → `042e5935f` (#2748, 06/11) → `37822ce6f` (#2752, 06/11).
3. **Nuance que o dossiê subestimava (e que eu testei a fundo):** não é só "texto diferente" — as duas redações leram **conjuntos de fontes parcialmente distintos**. A branch lê 7 fontes que a versão da main não lê (`ESTADO.md`, `analise-prs/RELATORIO_PRS.md`, `analise-prs/regras-de-negocio.md`, `.tmp/relato.md`, `HANDOFF_MULTIPLIX`, `PLANO_TALKX_V4`, `UX_AUDIT_REPORT`). Era aqui que poderia haver perda. Rastreei cada fato derivado dessas 7 fontes:
   - CI-02/CI-03 (PR #2394, deno.lock + fila-merge) → `docs/_arquivo/RELATORIO_CI.md:160` ("**MERGEADA** em `bcb11c84`"), :212, :265 e `docs/ci/RELATORIO_CI.md:21`. **Coberto com o mesmo SHA.**
   - CI-06 (PR #2244, types.ts/RPCs) → `docs/_arquivo/analise-prs/dossies/PR-2244.md:1`, `docs/_arquivo/analise-prs/baseline/merge-attempts.txt:7`, `docs/_arquivo/analise/BACKLOG_TAREFAS.md:136`, `.claude/commands/resgate-validacao.md:14`. **Coberto.**
   - CI-07 (regressão Unit Tests desde ~24/10) → `analise-prs/diagnostico-3-prs-restantes-261106.md:34` (diagnóstico de 06/11, mais recente e mais fundo), `docs/_arquivo/analise-prs/baseline/unit-tests.txt:22`, dossiês PR-2278/PR-2305. **Coberto e superado.**
   - DB-03 (TC-004) → migration na main: `git ls-tree origin/main -- supabase/migrations/20261006170426_fix_member_role_leave_remove_rpcs.sql` → blob `11e5ae180`. O aviso da branch ("branch `v2/retomar-rpcs-member-role-261012170456d0` tem a mesma migration, manter só uma") ficou **sem objeto**: a migration já está única na main.
   - FE-05/FE-06 (Multiplix 15 itens, TalkX V4 200 etapas) → versão da main, "Trabalho Anterior Recuperado" itens 5 e 6 (`v_main.md` ~linhas 197-199).
   - FE-09 (UX_AUDIT_REPORT) → a própria branch diz "conteudo nao lido integralmente". Valor zero.
   - INF-02/B07 (21 edges órfãs) → `git grep` na main não acha a lista das 21 (`docs/audits/AUDITORIA_MIGRACAO_DB_2026-08-27.md:443` trata o tema em outra data). **Mas a branch também não tem a lista** — é 1 linha citando `ESTADO.md`, que a própria versão da main já registra como fonte não recuperada ("Fontes Inacessíveis", B10). Nada a portar.
   - B10 (`rpc_refresh_daily_metrics` 2.2s) → `docs/adr/ADR-003-june-2026-db-audit-and-performance.md`. Valor baixo, prosa.
4. **Correção ao dossiê (não muda o veredito):** o argumento "a branch carrega o fato estalado de `main` sem branch protection, a main não" está **errado**. A versão da `main` também afirma isso: `analise-prs/auditorias-anteriores.md:103` (CI-01 "**CONFIRMADO PENDENTE** — `GET /branches/main/protection` → 404") e `:211` (B02 "todo merge é sem portão hoje"), contra `scripts/ci/github-settings-baseline.json` (`medido_em` 2026-11-02: `strict:true`, `enforce_admins:true`, required checks CI Gate/Build/TypeCheck). Ou seja: defeito do documento **da main**, não vantagem da branch. Já o argumento do `enforceRateLimit` está certo — main SEG-09/DB-03 "SUPERADO / NÃO PROCEDE" com evidência de código (06/11) vs branch SEG-07 "CONFIRMADO PENDENTE": portar a branch reintroduziria achado refutado.

### Parecer
Veredito mantido: **OBSOLETA**, confiança alta. A branch é uma redação paralela, mais pobre (38 achados vs 47), menos verificada (nenhuma passagem de 06/11) e com um achado já refutado. Todo fato exclusivo dela foi localizado na main em outro arquivo, com SHA ou caminho. Apagar a branch não perde nada; o único resíduo são ~3 linhas de prosa de valor baixo (INF-02/B07/B10), já transcritas acima no dossiê caso o dono queira acrescentá-las ao backlog.
