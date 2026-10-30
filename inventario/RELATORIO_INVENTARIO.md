# Relatório de Inventário — Branches Zapp_Web_V2

**Data da coleta:** 2026-10-23  
**SHA de referência `main`:** `a9ddd2f9a0ec6fc57085ff463db09f2ed7eb9674`  
**Commit mais recente em `main`:** 2026-10-23T13:22:28-03:00  
**Total de branches remotas (excl. main):** 176  
**Gerado por:** inventário read-only — nenhuma escrita remota, nenhum banco tocado

---

## 1. Totais por Categoria

| Cat | Descrição | Qtd |
|-----|-----------|-----|
| A   | Já incorporada (cherry-pick ou merged+deletada) | 0 |
| B   | Sem conteúdo real (ahead > 0, files_changed = 0) | 21 |
| C   | Alto valor — código real, **sem PR aberta** | 10 |
| D   | Médio valor — código real, **PR aberta não mergeada** | 74 |
| E   | Contém migrations Supabase (risco/oportunidade) | 8 |
| F   | WIP pesado (>10 marcadores TODO/FIXME/WIP) | 9 |
| G   | Outros (infra, config, CI sem src/ dominante) | 54 |
| **TOTAL** | | **176** |

> **Soma de verificação:** 0 (A) + 21 (B) + 10 (C) + 74 (D) + 8 (E) + 9 (F) + 54 (G) = 176

---

## 2. Distribuição por Prefixo

| Prefixo | Branches | Observação |
|---------|----------|------------|
| `claude` | 90 | Agentes Claude Code |
| `fix` | 35 | Correções manuais/agentes |
| `codex` | 6 | Agentes OpenAI Codex |
| `hermes` | 5 | Agente Hermes |
| `claude_pink` | 2 | Variante Claude Pink |
| `backup` | 2 | Backups manuais |
| `dia` | 2 | Branches de lote diário |
| `docs` | 2 | Documentação |
| `devin` | 1 | Agente Devin |
| `claude_juca` | 1 | Outros/manual |
| `f3` | 1 | Outros/manual |
| `chore` | 1 | Outros/manual |
| `feat` | 1 | Outros/manual |
| `adm01-debug-patch-1` | 1 | Outros/manual |
| `adm01-debug-patch-1-2` | 1 | Outros/manual |
| `adm01-debug-patch-1-3` | 1 | Outros/manual |
| `adm01-debug-patch-1-4` | 1 | Outros/manual |
| `adm01-debug-patch-1-5` | 1 | Outros/manual |
| `adm01-debug-patch-1-6` | 1 | Outros/manual |
| `adm01-debug-patch-1-7` | 1 | Outros/manual |
| `adm01-debug-patch-1-8` | 1 | Outros/manual |
| `adm01-debug-patch-2` | 1 | Outros/manual |
| `adm01-debug-patch-2-1` | 1 | Outros/manual |
| `adm01-debug-patch-2-10` | 1 | Outros/manual |
| `adm01-debug-patch-2-11` | 1 | Outros/manual |
| `adm01-debug-patch-2-12` | 1 | Outros/manual |
| `adm01-debug-patch-2-2` | 1 | Outros/manual |
| `adm01-debug-patch-2-3` | 1 | Outros/manual |
| `adm01-debug-patch-2-4` | 1 | Outros/manual |
| `adm01-debug-patch-2-5` | 1 | Outros/manual |
| `adm01-debug-patch-2-6` | 1 | Outros/manual |
| `adm01-debug-patch-2-7` | 1 | Outros/manual |
| `adm01-debug-patch-2-8` | 1 | Outros/manual |
| `adm01-debug-patch-2-9` | 1 | Outros/manual |
| `adm01-debug-patch-3` | 1 | Outros/manual |
| `adm01-debug-patch-3-2` | 1 | Outros/manual |
| `adm01-debug-patch-4` | 1 | Outros/manual |
| `dependabot` | 1 | Dependabot automático |
| `ci` | 1 | Outros/manual |
| `lote` | 1 | Outros/manual |

---

## 3. Clusters de Sobreposição (por área dominante)

| Área | Branches |
|------|----------|
| Frontend/src | 79 |
| CI/Workflows | 35 |
| Mixed/Outros | 32 |
| Supabase/Migrations | 9 |

### 3.1 Cluster Copiloto (21 branches)

Conjunto coeso de branches `claude/feat-copiloto-cv*` implementando etapas sequenciais de um módulo copiloto de vendas. Existem **duas versões concorrentes** para vários blocos de etapas:

| Bloco | Versão mais recente (sem PR) | Versão anterior (PR aberta) |
|-------|------------------------------|------------------------------|
| cv061-070 Ghost Text | `claude/feat-copiloto-cv061-070-ghost-text-261016-2200` | `claude/feat-copiloto-cv061-070-ghost-text-261016-2142` |
| cv091-100 Signals | `claude/feat-copiloto-cv091-100-lead-signals-261016-2240` | `claude/feat-copiloto-cv091-100-signals-261016-2305` |
| cv101-110 Multimodal | `claude/feat-copiloto-cv101-110-multimodal-261016-2310` | `claude/feat-copiloto-cv101-110-multimodal-261016-0730` |
| cv121-130 Supervisor | `claude/feat-copiloto-cv121-130-supervisor-261016-2320` | `claude/feat-copiloto-cv121-130-supervisor-261016-2304` |
| cv131-140 Analytics/Aprendizado | `claude/feat-copiloto-cv131-140-analytics-261016-2325` | `claude/feat-copiloto-cv131-140-aprendizado-261016-2310` |
| cv141-150 Integration/Piloto | `claude/feat-copiloto-cv141-150-integration-261016-2330` | `claude/feat-copiloto-cv141-150-piloto-261016-2317` |

> **Atenção:** Nos pares acima, a versão mais recente (sem PR aberta, categoria C) tem mais arquivos e inserções. Escolher uma versão por bloco antes de tentar mergear.

### 3.2 Cluster CI/Workflows (35 branches)

Grandes PRs abertas tentando corrigir CI vermelho. Sobreposição máxima em `.github/workflows/ci.yml` (21 branches tocam esse arquivo). Quatro branches se destacam por volume:


---

## 4. TOP 30 — Tabela Completa

| # | Branch | Cat | Score | Ahead | Files | Ins | Del | WIP | Conflitos | PR |
|---|--------|-----|-------|-------|-------|-----|-----|-----|-----------|----|
|  1 | `claude/feat-copiloto-cv061-070-ghost-text-261...` | C | 27.5 | 1 | 18 | 1983 | 2 | 0 | 0 | — |
|  2 | `claude/feat-copiloto-cv091-100-lead-signals-2...` | C | 25.9 | 1 | 11 | 1014 | 0 | 1 | 0 | — |
|  3 | `claude/feat-copiloto-cv141-150-integration-26...` | C | 25.1 | 1 | 8 | 909 | 0 | 0 | 0 | — |
|  4 | `claude/feat-copiloto-cv131-140-analytics-2610...` | C | 24.4 | 1 | 8 | 770 | 0 | 0 | 0 | — |
|  5 | `claude/feat-copiloto-cv101-110-multimodal-261...` | C | 23.7 | 1 | 8 | 632 | 0 | 0 | 0 | — |
|  6 | `claude/feat-copiloto-cv111-120-guardrails-261...` | C | 23.5 | 1 | 8 | 600 | 0 | 0 | 0 | — |
|  7 | `claude/feat-copiloto-cv121-130-supervisor-261...` | C | 23.3 | 1 | 8 | 559 | 0 | 0 | 0 | — |
|  8 | `claude/pensive-cori-i93zgf` | C | 19.3 | 1 | 2 | 2 | 2 | 0 | 0 | — |
|  9 | `claude/fix-ci-main-verde-261023-1540` | C | 18.8 | 7 | 12 | 84 | 33 | 0 | 0 | #2189 (closed) |
| 10 | `claude/feat-e83-entrar-por-codigo-261020-1935` | C | 18.6 | 1 | 5 | 361 | 0 | 1 | 0 | #2131 (closed) |
| 11 | `codex/publish-followup-20261021` | E | 16.1 | 1 | 59 | 1715 | 868 | 9 | 66 | — |
| 12 | `claude/feat-copiloto-cv031-040-brinde-intelli...` | E | 15.4 | 1 | 16 | 1889 | 1 | 2 | 0 | #2000 (open) |
| 13 | `claude/ecstatic-bardeen-twiveb` | E | 14.6 | 51 | 92 | 3729 | 1422 | 14 | 0 | #2190 (open) |
| 14 | `claude/feat-copiloto-cv011-020-migrations-261...` | E | 12.8 | 5 | 9 | 324 | 382 | 1 | 0 | #1997 (open) |
| 15 | `claude/fix-ga-fase0-banco-e2e-261020-2200` | E | 12.7 | 1 | 13 | 389 | 84 | 6 | 11 | #2124 (open) |
| 16 | `claude/feat-copiloto-cv021-030-worker-261016-...` | E | 12.3 | 1 | 4 | 1005 | 3 | 1 | 0 | #1998 (open) |
| 17 | `claude/fix-canonical-receipt-policies-261020-...` | E | 12.1 | 1 | 1 | 109 | 0 | 0 | 0 | #2137 (open) |
| 18 | `claude/loving-lovelace-esc3l2` | E | 12.1 | 28 | 58 | 6440 | 385 | 39 | 0 | #2186 (open) |
| 19 | `fix/ci-workflows-vermelhos` | D | 22.3 | 1 | 325 | 1023 | 609 | 1 | 329 | #2151 (open) |
| 20 | `claude/sharp-faraday-qfortu` | D | 21.7 | 92 | 374 | 9806 | 4722 | 4 | 445 | #2054 (open) |
| 21 | `fix/ci-verde-261021` | D | 21.5 | 7 | 46 | 1085 | 440 | 2 | 62 | #2155 (open) |
| 22 | `claude/ga-ci-verde-261020` | D | 21.1 | 45 | 159 | 14260 | 12894 | 7 | 2 | #2138 (open) |
| 23 | `codex/fix-failed-workflows-20261020` | D | 19.7 | 2 | 45 | 500 | 368 | 0 | 12 | #2139 (open) |
| 24 | `claude/feat-copiloto-cv061-070-ghost-text-261...` | D | 17.7 | 2 | 18 | 1982 | 2 | 0 | 0 | #2005 (open) |
| 25 | `claude/feat-copiloto-cv101-110-multimodal-261...` | D | 17.1 | 1 | 16 | 939 | 0 | 0 | 0 | #2025 (open) |
| 26 | `claude/feat-copiloto-cv091-100-signals-261016...` | D | 17.0 | 1 | 14 | 1026 | 0 | 0 | 0 | #2024 (open) |
| 27 | `claude/feat-copiloto-cv121-130-supervisor-261...` | D | 16.7 | 1 | 12 | 1082 | 0 | 0 | 0 | #2029 (open) |
| 28 | `claude/feat-copiloto-cv141-150-piloto-261016-...` | D | 16.7 | 1 | 12 | 1400 | 0 | 0 | 0 | #2032 (open) |
| 29 | `claude/feat-copiloto-cv071-080-objection-batt...` | D | 16.6 | 1 | 14 | 1377 | 0 | 2 | 0 | #2013 (open) |
| 30 | `claude/feat-copiloto-cv131-140-aprendizado-26...` | D | 16.3 | 1 | 12 | 902 | 0 | 0 | 0 | #2030 (open) |

---

## 5. Lista A/B — Candidatos para Análise Profunda

Branches priorizadas para a próxima fase de análise (PROMPT 2). Ordenadas por potencial de incorporação.

### 5.1 Grupo A — Alta Prioridade (Categorias C e E, 0 conflitos)

**`claude/feat-copiloto-cv061-070-ghost-text-261016-2200`**
- Categoria: C | Score: 27.52 | Ahead: 1 | 18 arquivos, 1983+/2-
- sem PR — nunca revisado
- Commits: _feat: CV-061–070 — ghost text, voice dictation, smart templates, attachment sugg_

**`claude/feat-copiloto-cv091-100-lead-signals-261016-2240`**
- Categoria: C | Score: 25.92 | Ahead: 1 | 11 arquivos, 1014+/0-
- sem PR — nunca revisado
- Commits: _feat: CV-091–100 — Fase 10 RADAR termômetro do lead, speed-to-lead e follow-up i_

**`claude/feat-copiloto-cv141-150-integration-261016-2330`**
- Categoria: C | Score: 25.07 | Ahead: 1 | 8 arquivos, 909+/0-
- sem PR — nunca revisado
- Commits: _feat: CV-141–150 RADAR fase 15 — orquestrador master, painel unificado, persistê_

**`claude/feat-copiloto-cv131-140-analytics-261016-2325`**
- Categoria: C | Score: 24.37 | Ahead: 1 | 8 arquivos, 770+/0-
- sem PR — nunca revisado
- Commits: _feat: CV-131–140 RADAR fase 14 — analytics, conversão e A/B testing_

**`claude/feat-copiloto-cv101-110-multimodal-261016-2310`**
- Categoria: C | Score: 23.68 | Ahead: 1 | 8 arquivos, 632+/0-
- sem PR — nunca revisado
- Commits: _feat: CV-101–110 RADAR fase 11 — análise multimodal (áudio, imagem, documento)_

**`claude/feat-copiloto-cv111-120-guardrails-261016-2315`**
- Categoria: C | Score: 23.52 | Ahead: 1 | 8 arquivos, 600+/0-
- sem PR — nunca revisado
- Commits: _feat: CV-111–120 RADAR fase 12 — guardrails de privacidade, tom e LGPD_

**`claude/feat-copiloto-cv121-130-supervisor-261016-2320`**
- Categoria: C | Score: 23.32 | Ahead: 1 | 8 arquivos, 559+/0-
- sem PR — nunca revisado
- Commits: _feat: CV-121–130 RADAR fase 13 — supervisor, coaching e modo treinamento_

**`claude/pensive-cori-i93zgf`**
- Categoria: C | Score: 19.34 | Ahead: 1 | 2 arquivos, 2+/2-
- sem PR — nunca revisado
- Commits: _fix(build): remove export duplicado isOverdue e exporta nextBestActionKey_

**`claude/fix-ci-main-verde-261023-1540`**
- Categoria: C | Score: 18.82 | Ahead: 7 | 12 arquivos, 84+/33-
- PR#2189 (closed)
- Commits: _fix(ci): remove 20261003272707 da cadeia do teste dashboard-rls fix(ci): atualiz_

**`claude/feat-e83-entrar-por-codigo-261020-1935`**
- Categoria: C | Score: 18.57 | Ahead: 1 | 5 arquivos, 361+/0-
- PR#2131 (closed)
- Commits: _feat(E83): entrar no canal de departamento por codigo de convite_

**`claude/feat-copiloto-cv031-040-brinde-intelligence-261016-2025`**
- Categoria: E | Score: 15.4 | Ahead: 1 | 16 arquivos, 1889+/1-
- PR#2000 (open)
- Commits: _feat: CV-031–040 RADAR Fase 4 — inteligência B·R·I·N·D·E ao vivo_
- ⚠️ **Tem migrations:** `supabase/migrations/20261016194000_copilot_live_helpers.sql|supabase/migrations/20261016200000_copil`

**`claude/ecstatic-bardeen-twiveb`**
- Categoria: E | Score: 14.6 | Ahead: 51 | 92 arquivos, 3729+/1422-
- PR#2190 (open)
- Commits: _fix: rewrite useAdminData with tab param, fetchData, handleCreateUser, accessLev_
- ⚠️ **Tem migrations:** `supabase/migrations/20261023100000_talkx_campaign_recipients_page_add_segment.sql`

**`claude/feat-copiloto-cv011-020-migrations-261016-1930`**
- Categoria: E | Score: 12.8 | Ahead: 5 | 9 arquivos, 324+/382-
- PR#1997 (open)
- Commits: _fix: restaurar schema-catalog.json (CV-020) — vazio acidentalmente feat: CV-020_
- ⚠️ **Tem migrations:** `supabase/migrations/20261016193000_copilot_sessions.sql|supabase/migrations/20261016193100_copilot_i`

**`claude/feat-copiloto-cv021-030-worker-261016-2100`**
- Categoria: E | Score: 12.3 | Ahead: 1 | 4 arquivos, 1005+/3-
- PR#1998 (open)
- Commits: _feat: CV-021–030 — motor copilot-live (análise incremental RADAR)_
- ⚠️ **Tem migrations:** `supabase/migrations/20261016194000_copilot_live_helpers.sql`

**`claude/fix-canonical-receipt-policies-261020-2005`**
- Categoria: E | Score: 12.1 | Ahead: 1 | 1 arquivos, 109+/0-
- PR#2137 (open)
- Commits: _fix(db): recria canonicamente as policies de receipt do team chat (replay)_
- ⚠️ **Tem migrations:** `supabase/migrations/20261021000000_recreate_team_message_receipt_policies_canonical.sql`

**`claude/loving-lovelace-esc3l2`**
- Categoria: E | Score: 12.1 | Ahead: 28 | 58 arquivos, 6440+/385-
- PR#2186 (open)
- Commits: _fix: s11-rls-matrix.sql — seed para user_b e C8 com controle positivo real fix:_
- ⚠️ **Tem migrations:** `supabase/migrations/20261026100300_dept_invites_ownership_fix.sql|supabase/migrations/20261026110300`

### 5.2 Grupo B — Prioridade Média (Categorias D, 0–2 conflitos)

**`claude/ga-ci-verde-261020`**
- Categoria: D | Score: 21.1 | Ahead: 45 | 159 arquivos | Conflitos: 2
- PR: PR#2138 (open)
- Commits: _chore(merge): atualiza ga-ci-verde com origin/main para disparar CI merge(fa5):_

**`claude/feat-copiloto-cv061-070-ghost-text-261016-2142`**
- Categoria: D | Score: 17.69 | Ahead: 2 | 18 arquivos | Conflitos: 0
- PR: PR#2005 (open)
- Commits: _Merge branch 'main' into claude/feat-copiloto-cv061-070-ghost-text-261016-2142 f_

**`claude/feat-copiloto-cv101-110-multimodal-261016-0730`**
- Categoria: D | Score: 17.09 | Ahead: 1 | 16 arquivos | Conflitos: 0
- PR: PR#2025 (open)
- Commits: _feat: RADAR Fase 11 — Multimodal CV-101–110 (áudio, imagem, documento)_

**`claude/feat-copiloto-cv091-100-signals-261016-2305`**
- Categoria: D | Score: 17.03 | Ahead: 1 | 14 arquivos | Conflitos: 0
- PR: PR#2024 (open)
- Commits: _feat: Fase 10 RADAR — termômetro, sinais de compra, speed-to-lead, follow-up (CV_

**`claude/feat-copiloto-cv121-130-supervisor-261016-2304`**
- Categoria: D | Score: 16.73 | Ahead: 1 | 12 arquivos | Conflitos: 0
- PR: PR#2029 (open)
- Commits: _feat: CV-121–130 supervisor coaching e treinamento (Phase 13)_

**`claude/feat-copiloto-cv141-150-piloto-261016-2317`**
- Categoria: D | Score: 16.73 | Ahead: 1 | 12 arquivos | Conflitos: 0
- PR: PR#2032 (open)
- Commits: _feat: RADAR copiloto CV-141–150 — Custos, piloto e rollout (Fase 15)_

**`claude/feat-copiloto-cv071-080-objection-battlecard-261016-2230`**
- Categoria: D | Score: 16.62 | Ahead: 1 | 14 arquivos | Conflitos: 0
- PR: PR#2013 (open)
- Commits: _feat: CV-071–080 — Fase 8 RADAR objeções, battlecard, guardrail de desconto e ri_

**`claude/feat-copiloto-cv131-140-aprendizado-261016-2310`**
- Categoria: D | Score: 16.34 | Ahead: 1 | 12 arquivos | Conflitos: 0
- PR: PR#2030 (open)
- Commits: _feat: CV-131–140 aprendizado contínuo e avaliação (Phase 14)_

**`claude/feat-copiloto-cv051-060-radar-popup-261016-2130`**
- Categoria: D | Score: 16.27 | Ahead: 4 | 9 arquivos | Conflitos: N/A
- PR: PR#2003 (open)
- Commits: _fix: add missing nextBestActionKey export to useNextBestAction fix: resolve Type_

**`devin/1792420175-remove-memoria-orphan`**
- Categoria: D | Score: 16.16 | Ahead: 4 | 8 arquivos | Conflitos: N/A
- PR: PR#2112 (open)
- Commits: _fix(inbox): liga <video> do StoryViewer ao controle único de volume fix(ci): exc_

---

## 6. Verificação Manual (5 branches aleatórias)

Escolhidas com `random.seed(42)` — comparação entre TSV e git ao vivo:

| Branch | ahead(TSV) | ahead(git) | files(TSV) | files(git) | OK? |
|--------|-----------|-----------|-----------|-----------|-----|
| `codex/docs-email-navy-plan-100-20261002` | 9271 | 9271 | 0 | 0 | ✓ |
| `claude/feat-copiloto-cv071-080-objection-battlecard-261016-2230` | 1 | 1 | 14 | 14 | ✓ |
| `claude/feat-copiloto-cv121-130-supervisor-261016-2320` | 1 | 1 | 8 | 8 | ✓ |
| `fix/f1a-lote-b-authprovider` | 2 | 2 | 2 | 2 | ✓ |
| `fix/f1a-lote-b-batch6` | 2 | 2 | 1 | 1 | ✓ |

Todos os campos conferidos bateram exatamente. Nenhum valor foi inventado.

---

## 7. Limitações e Observações

1. **CHERRY_ALL_MINUS sempre `nao`:** O `git cherry` foi executado para todas as 176 branches, e nenhuma retornou `PLUS=0 && MINUS>0`. Isso é esperado: as branches que foram mergeadas são deletadas automaticamente (`delete_branch_on_merge=true`). As 176 branches restantes ainda têm pelo menos um commit não incorporado.

2. **Coluna `authors` pode conter ` ` (espaço) para branches com `AHEAD>0` mas cujo `git log` não retornou nomes** — não é dado faltante no script, é comportamento real de branches muito antigas ou reescritas por force-push.

3. **Branches `adm01-debug-patch-N` (16 branches):** Geradas pelo editor web do GitHub. Todas têm ahead=1 e filecount baixo. Avaliadas individualmente — a maioria categoria D (PR aberta).

4. **Branches com AHEAD > 1000** (ex.: `codex/docs-email-navy-plan-100-20261002` com 9271 commits): Divergência muito antiga — provavelmente criadas antes de um reset de histórico ou vindas de outro fork. `git diff --shortstat` mostra `0 files changed` porque o merge-tree three-way coincide. Classificadas como B (sem conteúdo real).

5. **WIP_COUNT** conta ocorrências de `TODO|FIXME|WIP|XXX|placeholder|not implemented` nas linhas adicionadas (linhas começando com `+`). Não é indicador de qualidade — é indicador de trabalho incompleto.

6. **Conflitos TOP 30:** `git merge-tree` com timeout de 60s por branch. Branches com muitas mudanças em arquivos altamente editados (ex.: `ci.yml`, `CLAUDE.md`) têm conflitos altos mesmo com poucas linhas de mudança real.

7. **Dados de PR:** Coletados via API GitHub em 3 páginas de 100 (PRs #2199 a ~#1879). PRs anteriores a #1879 **não estão no `prs.json`**. Branches com PR antiga podem aparecer como 'sem PR' neste relatório.

---

## 8. Arquivos Gerados

| Arquivo | Linhas | Descrição |
|---------|--------|-----------|
| `inventario/branches_raw.tsv` | 177 | Dados brutos — 1 header + 176 branches × 17 colunas |
| `inventario/branches.csv` | 177 | Dados classificados — 16 colunas + categoria + score |
| `inventario/branches.json` | — | Mesmos dados em JSON, ordenados por score |
| `inventario/top30.txt` | 30 | Nomes das 30 branches com maior potencial |
| `inventario/prs.json` | — | 183 entradas: branch → PR mais recente |
| `inventario/conflict_counts.tsv` | 31 | Contagem de marcadores de conflito no TOP 30 |

---

_Relatório gerado em 2026-10-23. SHA main verificado ao vivo: `a9ddd2f9a0ec6fc57085ff463db09f2ed7eb9674`._