# Resgate lote 3 — tudo que só existe em branch, pelos três eixos

Este diretório existe para que as 78 branches remotas possam ser fechadas **sem
perder uma linha** de trabalho de outro agente. São **1.009 arquivos**, cada um
gravado pelo **OID do blob original** — byte a byte o que o outro agente
produziu, sem reescrita.

## Como a lista foi montada (o teste, não a impressão)

As adjudicações anteriores (#3241, #3250, #3251) compararam **caminhos** e
**árvores**. Isso deixava passar um caso: o arquivo existe na `main`, mas a
branch adicionou linhas que a `main` nunca recebeu. Esta rodada mede exatamente
isso.

Para cada branch `B`:

1. `git merge-base origin/main B` → ponto de bifurcação real (histórico
   completo, 10.194 commits; o clone foi desencurtado antes de medir);
2. `git diff --unified=0 <merge-base>..B` → **só o que a branch adicionou**,
   nunca o que ela tem de velho;
3. cada linha adicionada (≥25 caracteres, sem `import`/chave solta/comentário)
   é procurada no corpus de **945.832 linhas distintas** da `main` de hoje
   (todos os `.ts .tsx .js .mjs .sql .sh .yml .json .css .md`);
4. arquivo com ≥1 linha adicionada **ausente** da `main` entra aqui.

Resultado: **883 pares (branch, arquivo)** com linhas ausentes, **10.439 linhas**
no total. Destes, 37 arquivos são **artefato de máquina** e ficaram fora (lista
abaixo). Os **846 restantes** estão todos aqui.

Por que o teste anterior não bastava: 109 caminhos que só existiam em branch
tinham conteúdo **idêntico ao que a `main` apagou de propósito** — nada a
resgatar; e 1.717 pares estavam **inteiramente contidos** na `main`. O que
sobrou é o que de fato só existe em branch.

## Distribuição

| Categoria | Arquivos | Linhas ausentes |
|---|---|---|
| testes | 264 | 903 |
| scripts | 176 | 1620 |
| src | 166 | 1467 |
| ci (`.github/`) | 70 | 599 |
| docs | 66 | 602 |
| edge functions | 51 | 844 |
| análise/dossiês | 37 | 691 |
| outros | 10 | 112 |
| migrations | 6 | 64 |

`MANIFESTO.tsv` tem a linha a linha: branch, caminho original, OID do blob,
quantas linhas adicionadas faltam na `main`, quantas foram adicionadas, categoria.

## Por que aqui, e não no caminho real

Aqui **nada executa** — medido no repositório, não suposto:

- `tsc`: `tsconfig.app.json` tem `"include": ["src"]` → não alcança `analise-prs/`;
- Vitest: `include: ["src/**/*.{test,spec}.{ts,tsx}"]` (`vitest.config.ts:19`) →
  um `.test.tsx` preservado aqui fica fora do glob;
- ESLint: **não roda na CI** (nenhum passo de `eslint`/`lint-ratchet` em
  `.github/workflows/ci.yml`);
- `check-test-inventory.mjs`: varre `supabase/functions`, `scripts` e
  `scripts/db-audit` a partir da raiz → não alcança `analise-prs/`;
- actionlint: glob `.github/workflows/*.yml` (`ci.yml:394`) → os workflows
  preservados aqui não são lidos por ele, nem pelo GitHub Actions;
- replay de migrations: lê `supabase/migrations/` da raiz;
- `vite build`: parte do entry em `src/`.

O OID do blob é do **conteúdo**, não do caminho: promover depois é **mover**,
não reescrever.

## O que ficou fora, e por quê

37 arquivos são saída de máquina que a `main` regenera, com versão atual já no
repositório. Preservar uma cópia velha não guarda trabalho de ninguém — guarda
um retrato desatualizado do estado:

`supabase/schema-manifest.json`, `supabase/schema-catalog.json`,
`supabase/deployment-manifest.json`, `src/integrations/supabase/types.ts`
(todos gerados por `scripts/supabase_snapshot/` via `types-sync.yml`),
`scripts/ci/eslint-baseline.json`, `analise-prs/prs.json`,
`analise-prs/prs.csv`, `analise-prs/prs-lista.json`,
`analise-prs/progresso.json`, `auditoria-supabase/progresso.json`,
`docs/reconciliation/tasks/P046.json`.

Eram 19,9 MB dos 10,99 MB finais — e nenhuma linha de engenharia.

## O que NÃO entra em produção por decisão do dono

Entre os 846 há **70 arquivos de `.github/`** e **6 migrations**. Pela regra 8
do `AGENTS.md`, workflow de CI, segredo e DDL em produção são decisão do dono,
não do agente. Eles estão preservados aqui, inertes, à espera dessa decisão —
exatamente como os 29 de `analise-prs/resgate-regra8-261118/`.

## Terceiro eixo: o que as branches REMOVERAM e a `main` não recebeu

Preservar o que a branch adicionou não cobre o caso inverso: a branch **apagou**
algo que a `main` ainda tem. Se aquela remoção era uma correção, ela também é
trabalho.

Medido do mesmo jeito, pelo outro lado do diff: linha removida pela branch
(vs. seu merge-base) que **continua viva** na `main` de hoje. Resultado: **501
pares (branch, arquivo), 326 arquivos, 17.702 linhas**. Nenhum é trabalho a
adotar — a lista inteira cai em quatro grupos:

1. **Artefato gerado sendo regerado** — `supabase/schema-manifest.json`
   (10.837 linhas num único par), `analise-prs/prs.json`. A `main` tem a versão
   atual.
2. **Substituição cujo lado novo já está preservado** —
   `.github/workflows/db-migrate.yml` (−1.038 linhas: a branch troca o workflow
   de 1.493 linhas por um de 466, já guardado em
   `analise-prs/resgate-regra8-261118/`) e
   `supabase/functions/evolution-api/index.ts` (−482, com o lado adicionado neste
   lote).
3. **Deleção de documento** — `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`
   (−782). Apagar um plano não é entrega.
4. **Deleção de teste** — `src/pages/__tests__/ChatPopup.messageBalloon.test.tsx`
   (−159), `ChatPopup.pagination.test.tsx` (−147),
   `useTeamChatPanel.search-antigas.test.tsx` (−85),
   `workItemFormat.test.ts` (−53), `scripts/ci/fila-merge.unit.mjs` (−96),
   `scripts/ci/vercel-env-cleanup.unit.mjs` (−88). Pela regra do `AGENTS.md`,
   teste não se apaga para ficar verde — adotar essas remoções seria regressão,
   não resgate. `fila-merge` e `vercel-env-cleanup` ainda são os que as PRs
   #3231 e #3244 trouxeram para a `main` de propósito.

Com isso os três eixos estão cobertos: caminho novo, linha adicionada e linha
removida. Depois deste lote, nenhuma das 78 branches tem conteúdo que exista só
nela.


## Reauditoria dos descartes (mesma sessão, depois de uma cobrança do dono)

A primeira versão deste lote tinha **846** arquivos e descartava três classes por
**julgamento**, não por prova. A reauditoria encontrou erro em duas delas.

### Erro 1 — "artefato de máquina" que era julgamento de agente

Dos 11 arquivos que eu tratei como saída de máquina, **5 não têm gerador nenhum
no repositório** (`grep -rln <caminho> scripts/ .github/workflows/` → vazio) e o
conteúdo é **decisão humana**:

| Arquivo | O que tem dentro |
|---|---|
| `analise-prs/prs.json` | `"veredito": "CI_BLOQUEADO"` por PR, com `mergeable_state` |
| `analise-prs/prs.csv` | coluna `intencao` em prosa, veredito por PR |
| `analise-prs/progresso.json` | mapa `verdicts` (`MERGEAR_SE_CI_VERDE`, `BLOQUEADO_CI_E_BEHIND`) |
| `analise-prs/prs-lista.json` | inventário de PR com branch/base/sha |
| `auditoria-supabase/progresso.json` | encerramento de auditoria de segurança, com resultado por guarda (`G2_check_secdef_public_execute: PASS — 402 SECURITY DEFINER...`) |

Os **17 blobs** dessas 5 famílias entraram. Os 6 que de fato têm gerador provado
ficaram fora: `schema-manifest.json`, `schema-catalog.json`,
`deployment-manifest.json`, `types.ts`, `eslint-baseline.json` (gerado por
`scripts/ci/lint-ratchet.mjs:219`) e `docs/reconciliation/tasks/P046.json`
(gerado por `scripts/talkx/v4-status.mjs`).

### Erro 2 — "a `main` apagou de propósito" também era julgamento

Eu havia excluído 109 caminhos cujo blob era **byte-idêntico** ao que a `main`
apagou, concluindo que a branch não tinha autorado nada. Verdade — mas isso não
prova que a `main` absorveu a **capacidade**.

Prova do contrário, medida por símbolo exportado contra a `main` inteira
(`src supabase scripts e2e tests`):

`src/components/__tests__/componentesDuplicados.test.ts` registra 4 remoções como
"cópia sem importador, o canônico ficou". Em 2 dos 4 casos a cópia **não era
duplicata**:

| Cópia removida | Exportava | Canônico exporta | Perdido de fato |
|---|---|---|---|
| `dashboard/TrendIndicator.tsx` | `TrendIndicator`, `CompactTrendBadge`, `TrendSparkline`, `TrendData`, `calculateTrend` | só `TrendIndicator` | `CompactTrendBadge`, `TrendSparkline` |
| `dashboard/MetricComparison.tsx` | `MetricComparison`, `ComparisonCard`, `TeamComparison` | só `MetricComparison` | `ComparisonCard`, `TeamComparison` |

Em vez de refazer o julgamento caso a caso, o critério virou **exaustivo por
construção**: entraram **todos** os 135 caminhos que só existem em branch
(**148 blobs** a mais), com gerador provado como única exclusão.

### Descartes que a reauditoria confirmou, agora com prova

A `main` defende quase toda remoção com **teste-contrato próprio** — não é
suposição:

| O que foi descartado | Prova na `main` |
|---|---|
| Campanhas clássicas (`CampaignsView`, `CampaignCreateDialog`, `CampaignABTesting`, `useCampaigns`) | `tests/contracts/no-campaigns-classicas.contract.test.ts` |
| `useBulkActions` | `src/hooks/__tests__/useBulkActions.removido.test.ts` |
| `useVersions` | `src/hooks/system/__tests__/useVersionsAusente.test.ts` |
| `VoIPPanel` | `src/components/calls/__tests__/TelefoniaView.test.tsx:58` |
| `useCallHistory` | `src/components/calls/__tests__/calls-access.test.ts:219` |
| Compras/pagamentos no CRM | decisão `bd4c4bd7a` + DROP das tabelas em `bd25801a2` |
| Integrações Typebot/Dify/Chatwoot/Flowise/OpenAI | `src/hooks/integrations/evolutionApi.types.ts:99-100` documenta a remoção; **0 das 75** `action` da edge `evolution-api` atende essas rotas |
| `phoneNormalization`, `rateLimiter`, `webhookStatusPriority`, `groupsAutoSync` | lógica migrada para `supabase/functions/_shared/`, coberta por `evolution-helpers-phone-status.test.ts`; a normalização GO virou `_shared/evolution-go-adapter.ts` com `evolution-go-group-routing.test.ts` |
| `ai-auto-tag/auth_test.ts` | `supabase/functions/ai-auto-tag/auth.test.ts` na `main` tem **3** casos contra 2 da branch |
| `useTalkXSuppression.test.ts` | `main` tem `useTalkXSuppression.test.tsx` **e** `useTalkXSuppression.hook-morto.test.ts` |
| `useDebounce.test.ts` | `src/hooks/__tests__/useDebounce.test.ts` |
| `ConversationMemoryPanel` | `ConversationMemorySection` + `.test.tsx` + `.escrita.test.tsx` |
| `scripts/vercel/verify-production.mjs` | substituído por `verify-release-targets.mjs` em `d39dc1124` |
| Conjunto mobile antigo | `haptics` → `ui/mobile-components.tsx`; long-press → `VolumeTriggerButton`/`BoardColumn`; ripple → `ui/micro-interactions.tsx`; keyboard-aware → catálogo; sheet → `ProductDetailDialog`. Só `SpeedDialFAB` não tem equivalente |
| `team-chat-security-gaps.test.ts` | **teste falso** (toda asserção é `expect(true).toBe(true)`), e as falhas de RLS que ele apontava **já estão corrigidas**: `tcm_insert_member` usa `can_insert_team_conversation_member(...)`, existe policy de DELETE em `team_conversations`, `tcm_delete_own_or_admin` tem `is_last_team_conversation_owner`, e há coluna `member_role` |

### Terceiro eixo, refeito exaustivamente

Antes eu havia classificado só os 20 maiores dos 501 pares de remoção. Refeito
para os **326 arquivos**: 9 gerado/baseline (11.507 linhas), 99 teste, 76 doc,
14 workflow, 73 `src/`, 14 edge, 34 script, 2 migration, 5 outros.

E o único caso que o eixo das adições não cobre — **correção por deleção pura**
(a branch só removeu, sem adicionar nada no arquivo) — foi isolado: `git diff
--numstat` por branch dá **30 pares / 23 arquivos**, dos quais 19 ainda existem
na `main`. Os dois substantivos foram lidos linha a linha:

- `supabase/functions/evolution-api/index.ts` (−95 e −90, duas branches de
  20-21/10): removem `set-presence`, `set-settings`, `get-settings` e
  `get-webhook` (com o tratamento do flavor GO). São branches **atrasadas** — a
  `main` tem mais. Adotar seria regressão de telefonia/WhatsApp.
- `src/hooks/integrations/useTalkXSuppression.ts` (−125, mesma branch de 20/10):
  mesma situação, a `main` cresceu depois do fork.

O resto são deleções de teste (`useInboxBulkActions.test.ts` −55), de documento
(`PLANO_GITHUB_ACTIONS_100_ETAPAS` −975), de migration já aplicada
(`20261107121000`, `20261107120000`, `20261107123000`, `20261107122000`) e de
ferramentas que as PRs #3231 e #3244 trouxeram de propósito (`fila-merge`,
`vercel-env-cleanup`). **Nada a adotar**, e nada a perder: o conteúdo removido
continua na `main`.
