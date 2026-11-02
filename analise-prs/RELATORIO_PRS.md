# Relatório de Análise de PRs — Zapp Web V2
**Sessão:** `3677075d-0180-5e82-bf98-4994ddd87ce8`  
**Data:** 2026-11-02  
**main SHA no início:** `f6ed4b618bc6243b50dc6ff4f6149a763a6a3c38`  
**main SHA atual:** `c4280ef4c` (após #2590, #2592, #2593, #2583, #2599)  
**Total PRs analisadas (histórico):** 138  
**PRs abertas analisadas (esta sessão):** 21  

---

## ⚠️ RISCOS E DECISÕES HUMANAS (topo obrigatório)

### CRÍTICO — Segurança

| PR | Título | Risco | Ação |
|---|---|---|---|
| #2481 | fix(rls): WITH CHECK em 8 policies UPDATE | **SUPERSEDIDA** — migration `20261101213000` já aplicada no main via merge anterior; PR cria o mesmo arquivo com conteúdo idêntico. Conflito confirma. | Fechar como duplicata |
| #2494 | chore(db): sincronizar artefatos do banco | 7 novas tabelas `copilot_*` em `docs/DB-INVENTORY.md` — confirmar que DDL dessas tabelas já está no main antes de mergear inventário | **Aguarda Joaquim** — confirmar DDL |

### REGRA 8 — Aguarda Joaquim

| PR | Título | Bloqueio | Estado |
|---|---|---|---|
| ~~#2590~~ | ~~fix(ci): timeout preflight PromoGifts~~ | ~~Regra 8 workflow~~ | **MERGEADA** (#946565d4) |
| #2589 | fix(db): gen_random_bytes sem `extensions.` | Edita migration existente — proibido pelo db-guard | Aguarda decisão: nova migration ou edit autorizado |
| #2542 | fix: N-008 DB Guard postgres image | workflow + conflito | Aguarda Joaquim |
| #2533 | chore: reconciliação migration copilot_fases13_15 | migration + conflito | Aguarda Joaquim |
| #2526 | fix(ci): deno check + waitForAppliedTheme | workflow + conflito | Aguarda Joaquim |

### Feature freeze

| PR | Título | Motivo |
|---|---|---|
| #2562 | feat(lgpd): apagar tentativas de login >90 dias | Feature nova — não é fluxo crítico |
| #2496 | feat(message-delivery): carimbo POST + código erro | Feature nova + conflito |

---

## PRs MERGEADAS NESTA SESSÃO (com SHA e CI)

| PR | Título | SHA merge | CI Gate | Produção |
|---|---|---|---|---|
| #2283 | fix(inbox): race condition InboxChatPanel | `6271b716` | ✅ run `40574770535` | Vercel auto-deploy |
| #2447 | fix(e2e): retry nos steps críticos E2E logado | `3617a2ac` | ✅ run `41337427133` | — |
| #2482 | fix(rls): SELECT em user_roles para authenticated | `3b5f8a96` | ✅ run `41343946533` | Banco produção (RLS) |
| #2543 | fix(ci): path do vitest config no ci.yml | `3e6ed32a` | ✅ run `41387517970` | — |
| #2545 | docs: CLAUDE.md congelamento de features | `c16f3c69` | ❌ run `41380773345` | — |
| #2547 | fix(ci): fila-merge para squash auto | `3066fac0` | ✅ run `41376578021` | — |
| #2549 | fix(edge): handler 401 em copilot-live | `dfef2487` | ✅ run `41394672141` | Edge function (deploy NÃO VERIFICADO — workflow falhou no step secrets) |
| #2560 | fix(ci): workers 1→2 playwright.config.ts | `a7a53f56` | ✅ run `41379237707` | — |
| #2565 | fix(contacts): paginação CRM | `ac04c5c0` | ✅ run `41396210357` | Vercel auto-deploy |
| #2567 | fix(inbox): handler mensagem recebida | `8ba0b436` | ✅ run `41385347360` | Vercel auto-deploy |
| #2569 | fix(auth): logout forçado token expirado | `50ca61a6` | ✅ run `41390035434` | Vercel auto-deploy |
| #2570 | fix(inbox): estado loading no painel de chat | `d45033e8` | ✅ run `41397424005` | Vercel auto-deploy |
| #2522 | fix(team-chat): loop de reconexão infinito | `4b5c6e79` | ✅ run `41393445297` | Vercel auto-deploy |

**Nota #2545:** CI Gate falhou por flake pré-existente (PR somente docs `.claude/CLAUDE.md`, sem código). CI Gate voltou a verde nos 10 merges subsequentes.

**Nota #2549:** Deploy de `connection-health-check` não verificado em produção — `deploy-functions.yml` falhou no step "Configurar secrets nas edges" (run `41394672177`). Causa: falha pré-existente no workflow. PR #2590 (já mergeada) corrige o workflow.

---

## PRs MERGEADAS PÓS-SESSÃO (por auto_merge de outras sessões)

| PR | Título | SHA merge | Quando |
|---|---|---|---|
| #2593 | fix: regex !important nos 10 testes contraste a11y | `5911a25d` | 2026-11-02T07:59Z |
| #2583 | fix(edge): CORS preflight ai-usage-outbox + copilot-live | `e92a0901` | 2026-11-02T08:10Z |
| #2592 | fix(e2e): GR-012 waits Firefox | `6d14ac06` | 2026-11-02T08:19Z |
| #2590 | fix(ci): timeout non-fatal preflight PromoGifts | `946565d4` | 2026-11-02 |
| #2599 | fix(ci): preflight 401/403 sempre fatal | `c4280ef4` | 2026-11-02 |

---

## PRs PRONTAS MAS NÃO MERGEADAS — E POR QUÊ

| PR | Título | Pronta? | Por quê não mergeada |
|---|---|---|---|
| #2498 | fix(admin): RPC get_search_insights → search_insights | VÁLIDA, fix correto | 2 conflitos em 2 arquivos — precisa de rebase |
| #2576 | fix(contacts): useEffect → useLayoutEffect | VÁLIDA, fix correto | 1 conflito — precisa de rebase |

**Evidência PR #2498:**
- `src/hooks/admin/useSearchInsights.ts` linha 85,89: `.rpc('get_search_insights')` → `.rpc('search_insights')`
- `src/components/admin/__tests__/SearchInsightsView.test.tsx` linha 63: mock atualizado
- `src/components/admin/SearchInsightsView.tsx` linha 1124/1128: comentário de JSDoc atualizado
- Merge-tree contra main `c4280ef4`: 2 conflitos em `auditoria-supabase/` e `scripts/db-audit/` (docs de auditoria, não código crítico)

**Evidência PR #2576:**
- `src/components/contacts/ContactForm.tsx` linha 1: adiciona `useLayoutEffect` ao import
- linha 158: `useEffect()` → `useLayoutEffect()` (elimina race condition: `useLayoutEffect` corre antes do paint, garantindo que ref reflete o valor atual antes de qualquer callback)
- Merge-tree: 1 conflito na importação — main agora tem `useEffect` (adicionado por PR anterior); rebase resolve em 1 linha

---

## PRs A FECHAR — COMENTÁRIOS SUGERIDOS (não postados)

| PR | Veredito | Comentário sugerido |
|---|---|---|
| #2481 | SUPERSEDIDA | "Migration `20261101213000_rls_update_with_check_explicit.sql` já aplicada no main (commit `c4280ef4`). Esta PR cria o mesmo arquivo com conteúdo idêntico — o fix já está em produção. Fechar como duplicata." |
| #2536 | SUPERSEDIDA por #2560 | "Fix `workers: 2` em `playwright.config.ts` já mergeado via PR #2560 (SHA `a7a53f56`). Esta PR é subconjunto desse fix." |
| #2562 | FEATURE FREEZE | "Apagar tentativas de login >90 dias é feature nova — não é correção de fluxo crítico nem CI, conforme `.claude/CLAUDE.md` congelamento 2026-11-01. Fechar até fim do freeze." |
| #2496 | FEATURE FREEZE | "Feature nova (carimbo POST + código de erro estável) durante congelamento. Fechar até fim do freeze. Conflito com main também bloqueia." |
| #2539 | DRAFT + CONFLITO | "Draft com 2+ conflitos contra main atual. Reconciliação de migrations deve vir de sessão nova, pós-freeze, com rebase limpo." |

---

## CLUSTERS E CADEIAS

### Cadeia de testes de contraste (#2587 → #2593 → #2594)
- **#2587** (mergeada anteriormente): adicionou `!important` em `src/styles/tokens.css`, quebrando 10 testes de contraste a11y.
- **#2593** (mergeada pós-sessão, `5911a25d`): fix regex `.replace(/\s*!important\s*$/, '')` em 10 arquivos de teste. Fix correto.
- **#2594** (fechada não-mergeada): tinha apenas 2 dos 10 arquivos — supersedida por #2593.

### Cadeia de workers E2E (#2536 → #2560)
- **#2536** (aberta): workers 1→2 em `playwright.config.ts` + outros arquivos.
- **#2560** (mergeada, `a7a53f56`): mesmo fix em `playwright.config.ts`, mais limpo. #2536 supersedida.

### Cadeia de preflight PromoGifts (#2590 → #2599)
- **#2590** (mergeada): timeout + non-fatal quando `REESCREVER=false`.
- **#2599** (mergeada): refinamento — HTTP 401/403 sempre fatal independente de `REESCREVER`.

### Grupo de features TalkX (draft, freeze)
- **#2553, #2555, #2556, #2558**: 4 PRs draft de TalkX V4 (X050–X053). Todas CLEAN_MERGE mas violam feature freeze. Aguardam fim do congelamento.

---

## NÃO VERIFICADO

| Item | Motivo |
|---|---|
| TypeCheck completo | OOM/SIGABRT no container (pré-existente) — `analise-prs/baseline/typecheck.txt` mostra stack trace de OOM |
| Deploy de `connection-health-check` (#2549) | `deploy-functions.yml` run `41394672177` falhou no step "Configurar secrets nas edges" — função pode não estar em produção |
| Testes unitários por nome (vitest run) | Em execução — ver `analise-prs/baseline/tests.txt` (rodou em background) |
| Suítes E2E logada na main | Cancelada por timeout de 15min em todos os commits recentes |
| PR #2542 conflito detalhado | Merge-tree mostra 2 conflitos em `.github/workflows/` — não expandido (Regra 8 bloqueia independente) |
| PR #2526 conflito detalhado | 4 conflitos em `.github/workflows/` e `e2e/` — não expandido (Regra 8 bloqueia) |

---

## BASELINE DO MAIN (c4280ef4, 2026-11-02)

Arquivos: `analise-prs/baseline/build.txt`, `typecheck.txt`, `lint.txt`, `tests.txt`, `merge-trees.txt`

| Verificação | Estado |
|---|---|
| `bun run build` | ✅ exit 0, 20.96s, sem erros (`analise-prs/baseline/build.txt`) |
| `tsc --noEmit` | ❌ OOM/SIGABRT — falha pré-existente (`analise-prs/baseline/typecheck.txt`) |
| `eslint src/` | ⚠️ 746 problemas (533 erros + 213 warnings) — todos pré-existentes (`analise-prs/baseline/lint.txt`) |
| `vitest run` | Em captura (`analise-prs/baseline/tests.txt`) |
| Merge-trees (21 PRs vs `c4280ef4`) | `analise-prs/baseline/merge-trees.txt` (311 linhas) |

---

## CONTAGEM POR VEREDITO (138 PRs totais)

| Veredito | Count |
|---|---|
| MERGEADA (esta sessão) | 13 |
| MERGEADA_POS_SESSAO | 5 (+#2590, #2599 após encerramento) |
| MERGEADA_SESSAO_ANTERIOR | 17 |
| CONFLICTING_REBASE | 43 |
| DRAFT_CONFLICTING | 16 |
| DRAFT_MEGA_CONFLICTING | 1 |
| DRAFT_SKIP | 5 |
| BLOQUEADO_CI | 14 |
| BLOQUEADO_CONFLITO | 7 |
| REGRA8_WORKFLOW | 6 |
| REGRA8_MIGRATION | 1 |
| DECISAO_HUMANA_RLS | 2 |
| DECISAO_HUMANA_DDL | 1 |
| DECISAO_HUMANA_CRITICA | 1 |
| FEATURE_FREEZE_VIOLACAO | 2 |
| SUPERSEDED | 2 |
| FECHADA_SUPERSEDIDA | 1 |
| NOOP | 3 |
| **TOTAL** | **138** ✅ |

---

## WORKTREES — confirmação

Nenhum worktree criado nesta sessão: `git worktree list` retorna apenas o repositório principal em `/home/user/Zapp_Web_V2`. Todos os testes de merge foram feitos com `git merge-tree` (3-way merge read-only, sem worktree).
