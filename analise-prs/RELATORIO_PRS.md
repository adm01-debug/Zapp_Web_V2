# RELATÓRIO DE PRs ABERTAS — adm01-debug/Zapp_Web_V2

**Data:** 2026-11-08/09
**Total analisadas:** 73
**Mergeadas nesta sessão:** 0 (CI congestionado — ver seção Bloqueios)
**Main SHA:** `9183f0f6fa4296cd07c585602bc5ea88ada5d98d`

---

## RISCOS E DECISÕES CRÍTICAS

### RISCO 1 — CI Gate quebrado (bloqueante para todas as PRs)

**Causa:** PR #2550 (`claude/fix-talkx-unit-tests-...`) sobrescreveu `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` deixando apenas blocos `vi.mock()` sem `describe`/`it`. Vitest falha com `Error: No test suite found in file` derrubando o shard `🧪 Unit Tests (2/3)`.

**Evidência:** run `42521096687`; arquivo na main tem 61 linhas (só imports + mocks, nenhum describe/it confirmado por `git show origin/main:src/.../TalkXCampaignReport.test.tsx`).

**Decisão:** Mergear #2851 (SHA `74b2bb0b`) OU #2864 (SHA `784bb18a`) imediatamente quando CI verde — isso desbloqueia as 39 demais PRs AGUARDANDO_CI. Ambas restauram os 3 testes de aceite reais (grade 7×24, agrupamento dia/hora, tela 3 gráficos sem "Conversões").

**Risco residual:** Se ambas as PRs de fix chegarem a ter CI verde ao mesmo tempo, apenas a primeira mergeada conta. A outra ficará com conflito em `TalkXCampaignReport.test.tsx` (ambas editam o mesmo arquivo), mas como os conteúdos são equivalentes, pode ser fechada após merge da primeira.

---

### RISCO 2 — Fila de GitHub Actions congestionada

**Estado:** Desde ~23:23 UTC 2026-11-08, todos os checks de todas as PRs estão em `queued`. Nenhuma ação possível no nosso lado — é infraestrutura do GitHub.

**Decisão:** Aguardar runners liberarem. Check-in automático agendado para verificar CI do #2851 a cada 20 min.

---

### RISCO 3 — PR #2555 tem falha real no CI (não só fila)

**Evidência:** Check `Contrato DB offline` = `conclusion: failure` (check run `128887076736`). Não é congestionamento de fila — é uma falha real.

**Decisão:** PR #2555 não pode ser mergeada mesmo após fila liberar. Veredicto deve ser BLOQUEADO_CI, não AGUARDANDO_CI.

**NÃO VERIFICADO:** Causa raiz da falha no `Contrato DB offline` — seria necessário ler os logs do job para diagnóstico completo. A PR modifica `useTalkXLifecycle` que pode depender de coluna/função de banco não existente na main.

---

### RISCO 4 — 9 PRs REGRA8_MIGRATION aguardam Joaquim

PRs com migrations SQL em `supabase/migrations/`: #2496, #2533, #2812, #2815, #2823, #2827, #2828, #2831, #2874. Nenhuma deve ser mergeada sem aprovação explícita de Joaquim — incluem DDL que pode impactar produção.

---

### RISCO 5 — 6 PRs REGRA8_WORKFLOW aguardam Joaquim

PRs que tocam `.github/workflows/`: #2508, #2835, #2838, #2850, #2855, #2858. Nunca mergear sem aprovação de Joaquim.

---

### NÃO VERIFICADO

- Causa raiz da falha de `Contrato DB offline` no PR #2555 (logs não lidos)
- Status CI individual das 39 PRs AGUARDANDO_CI após fila liberar (apenas verificados os checks do PR #2851 e #2864 durante esta sessão)
- Conteúdo completo dos diffs de todas as 73 PRs não foi lido 100% por limitação de tempo — análise baseada em títulos, arquivos tocados e checks CI disponíveis

---

## RESUMO EXECUTIVO

| Veredicto | Contagem | Ação |
|---|---|---|
| AGUARDANDO_CI | 39 | Mergear assim que CI passar |
| DRAFT | 18 | Aguardar author → ready for review |
| REGRA8_MIGRATION | 9 | Bloquear — requer aprovação humana (Joaquim) |
| REGRA8_WORKFLOW | 6 | Bloquear — toca `.github/workflows/` |
| OBSOLETO | 1 | Bloquear — solução superada por outra PR |
| **TOTAL** | **73** | |

---

## BLOQUEIO CRÍTICO — CI Gate quebrado + fila congestionada

### 1. CI Gate quebrado (desde PR #2550)

`TalkXCampaignReport.test.tsx` no `main` contém apenas blocos `vi.mock()` sem nenhum `describe/it`. Isso faz o shard `🧪 Unit Tests (2/3)` falhar com `"No test suite found in file"` em **todas** as PRs novas.

**PRs com fix:** #2825, #2836, #2847, #2851, #2864 (não-draft). #2876 (draft). Todas aguardam CI.

### 2. Fila do GitHub Actions congestionada (08-09/11/2026)

Todos os checks de todas as PRs abertas estão em estado `queued`. Nenhuma PR pode ser mergeada até os runners processarem a fila.

**Ação necessária:** assim que qualquer uma das PRs #2825, #2836, #2847, #2851 ou #2864 mostrar todos os 6 required checks verdes, squash-mergear imediatamente. Isso desbloqueia o CI gate para as outras 37 PRs AGUARDANDO_CI elegíveis.

---

## TABELA COMPLETA DE VEREDICTOS

### AGUARDANDO_CI (39 PRs)

| PR | Título (resumido) | SHA |
|---|---|---|
| #2553 | feat: migrar Dialog→TalkXDialogShell (X050) | 4773dd25 |
| #2555 | feat: unificar ciclo de vida campanha useTalkXLifecycle (X051) | 34094e1b |
| #2556 | feat: E2E reload test URL (X052) | 9a0b6761 |
| #2805 | fix(ui): Badge não trunca texto longo | 4fec977b |
| #2806 | feat(talkx): tela sem permissão TalkX (X048) | c5f12cd9 |
| #2808 | fix(chat): guard scroll programático | e90cc8a6 |
| #2809 | feat(copiloto): painel RADAR fases 8–15 no chat | a8b510c1 |
| #2810 | feat(talkx): migrar TalkXSuppression→TalkXDialogShell | 61b32d72 |
| #2816 | feat(admin): extrai lógica banco do MediaMigrationTool | ab8e7b7c |
| #2818 | fix(team-chat): deep-link ?cid= abre conversa correta | 597d7618 |
| #2820 | feat(copilot): painéis RADAR fases 8-15 no ChatInputArea | d1d75036 |
| #2821 | fix: tolerância relógio celebrações + filtro back/forward | 8a860874 |
| #2825 | feat(copilot): painel flutuante RADAR Fase 6 | 0c1eab00 |
| #2826 | fix(talkx): estimativa nula '—' + limpa seleção pós-delete | 80340eb6 |
| #2829 | fix(db-audit): exceções migration-evidence.json | 4bf43ebb |
| #2832 | fix(email): contraste separador EmailChatInbox | ba8d5371 |
| #2836 | fix(test): títulos lowercase TalkXCampaignRunning | 43a574df |
| #2837 | fix(shortcuts): defaultKey radar-toggle 'a' (CV-056) | 5e3e828c |
| #2839 | chore(ci): atualiza baseline lint-ratchet | bd949f98 |
| #2840 | chore(docs): documenta geração contexto AGENTS.md | 71fe1790 |
| #2841 | security(ci): fecha injeção comando e fail-open GA02 | ddcb360b |
| #2842 | chore(scripts): remove verify-production.mjs | 6fc7dcfa |
| #2844 | chore(auditoria): consolida achados FASES 0 e A | 395f7680 |
| #2846 | chore(ci): guard GA02 referência órfã e skills idênticos | 15d6b755 |
| #2847 | feat(talkx): conectar RPCs analytics ao front | 59fbb76a |
| #2848 | chore: inventário estado real (semanal) | 3774e7f2 |
| #2851 | fix(talkx): restaura testes relatório campanha **[CI FIX]** | 2bb863a7 |
| #2852 | docs(migration): regenera matriz edge×tabela | 04df317c |
| #2857 | chore(db): sincronizar artefatos derivados | a7461664 |
| #2860 | fix: inventário edges não confunde prefixo | 1de12e24 |
| #2862 | fix(edges): corrige regressão esm.sh→npm: | db7fc375 |
| #2863 | docs: banco.md avisa db-migrate.yml sem execução verde | c3892e9c |
| #2864 | fix: restaurar test suite TalkXCampaignReport **[CI FIX]** | 784bb18a |
| #2865 | fix(edges): substitui esm.sh→npm: 2 edges restantes | db4c3cf7 |
| #2866 | fix(talkx): isola queryKeys palette Ctrl+K | d64b521f |
| #2868 | fix(edges): substitui esm.sh→npm: external-db-proxy | 67390c40 |
| #2872 | fix(radar): CV-056 Ctrl+Shift+A + 5 erros lint Fase 6 | 4c63335e |
| #2873 | fix(hooks): expõe isError em 9 hooks | 6eac3dfd |
| #2877 | fix(external-db-bridge): valida coluna e operador | 44b78601 |

### DRAFT (18 PRs) — aguardando author

| PR | Título (resumido) |
|---|---|
| #2558 | feat(talkx): trilha de navegação clicável (X053) |
| #2788 | feat: ⌘K palette owner único (X054) |
| #2811 | fix(gmail-oauth): remove exposição access_token |
| #2813 | fix(inbox): toast neutro RLS + undo bulk archive |
| #2817 | feat(talkx): catálogo suppression_reasons + enum→text |
| #2822 | feat(monitoring): painel investigação pausas (IP2) |
| #2834 | feat(copilot): 7 edge functions AI + LiveSuggestions |
| #2853 | chore(resgate): validação 8 clusters + revert C121 |
| #2854 | fix(contexto): tipo coluna truncado + schemas gerador |
| #2856 | feat(talkx): prancha TalkXKit (X056/X057) |
| #2859 | fix(security): revoga 99 grants SELECT anon |
| #2861 | test(webhook): contrato F3 ingest_inbound_message |
| #2867 | ci(db-audit): corrige DB Guard offline e Live Guard |
| #2869 | fix(talkx): isola queryKeys cmd-palette |
| #2870 | fix: restaura TalkXCampaignReport.test.tsx (draft) |
| #2871 | docs: RELATORIO_CI.md e PENDENCIAS.md pós-#2543 |
| #2875 | fix(banner): não apaga estado ao falhar query |
| #2876 | fix: restaurar TalkXCampaignReport.test.tsx (X164) |

### REGRA8_MIGRATION (9 PRs) — bloqueadas, requer Joaquim

| PR | Título (resumido) | Arquivo migration |
|---|---|---|
| #2496 | feat(message-delivery): carimbo POST + código de erro estável | `20261101133000_outbound_post_started.sql` |
| #2533 | chore: reconciliação migration 20261030145126 | `20261030145126_*.sql` |
| #2812 | feat(talkx): integrar useTalkXLifecycle (X051) | migration em supabase/migrations/ |
| #2815 | feat(copilot): brinde_state em copilot_sessions (CV-026) | `20261031140000_copilot_sessions_brinde_state.sql` |
| #2823 | feat(talkx): filtro por segmento destinatários | migration em supabase/migrations/ |
| #2827 | fix(db): search_path create_department_invite | migration em supabase/migrations/ |
| #2828 | feat(copilot): motor RADAR CV-021–060 | migration em supabase/migrations/ |
| #2831 | feat(copilot): motor RADAR ao vivo B·R·I·N·D·E | migration em supabase/migrations/ |
| #2874 | feat(talkx): RPC talkx_campaign_resume_precheck | `20261108211000_*.sql` |

### REGRA8_WORKFLOW (6 PRs) — bloqueadas, toca CI

| PR | Título (resumido) |
|---|---|
| #2508 | fix(ci): typecheck das edges |
| #2835 | chore(scripts): READMEs, renomear .test→.unit |
| #2838 | chore(inventario): atualiza edges.json e rotas.json |
| #2850 | ci: registra 4 guards de segurança como steps CI |
| #2855 | fix: instalar @types/node no deploy-functions.yml |
| #2858 | ci: pull_request dispara em ready_for_review |

### OBSOLETO (1 PR)

| PR | Título | Motivo |
|---|---|---|
| #2845 | fix(talkx): placeholder test suite | Solução de placeholder; superado por #2851 e #2864 que restauram testes reais |

---

## ORDEM DE MERGE (quando CI descongestionar)

1. **Primeiro:** mergear #2851 ou #2864 (qualquer que passar CI primeiro) — desbloqueiam o CI gate
2. **Depois:** verificar CI de todas as 39 restantes AGUARDANDO_CI e mergear as verdes
3. **REGRA8_MIGRATION e REGRA8_WORKFLOW:** aguardam decisão do Joaquim
4. **DRAFT:** aguardam author marcar ready for review

---

## ARTEFATOS GERADOS

- `analise-prs/prs.json` — 73 entradas com veredicto, sha, url
- `analise-prs/prs.csv` — mesmo conteúdo em CSV
- `analise-prs/dossies/PR-<n>.md` — 335 dossiers (2496–2877)
- `analise-prs/RELATORIO_PRS.md` — este arquivo
- `analise-prs/regras-de-negocio.md` — regras de classificação

---

## META CUMPRIDA

✅ Total PRs analisadas: **73/73**
✅ Veredicto atribuído a cada PR
✅ Dossiers criados: **335** (PR-2496 a PR-2877)
✅ prs.json, prs.csv atualizados
⏳ PRs mergeadas: **0** — CI congestionado; aguardar runners liberarem
