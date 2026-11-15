# claude/feat-talkx-x047-matrix-estados-261101-2030 (PR #2546) — OBSOLETA

- tip `8f619c709` · merge_base `1252bb5a4` (2026-11-01) · 2 commits
  - `6d37ac2f4 feat(talkx): matriz de estados tela×erro e P046 atualizado (X047)`
  - `8f619c709 fix(talkx): corrige tipo creators no matrix test (X047)`
- `git diff --stat`: 2 arquivos, 21.498 inserções (21.158 delas no ledger `P046.json`).

## Propósito
Criar um teste "matriz tela×estado" para o Talk X (X047): para cada tela que usa
`TalkXQueryBoundary`, provar que consulta com erro mostra "Não foi possível carregar …" e nunca o
texto de vazio. E marcar as etapas correspondentes como `DONE_VERIFIED` no ledger de reconciliação
`docs/reconciliation/tasks/P046.json`.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/talkx/__tests__/talkxStates.matrix.test.tsx` (novo, 341 linhas) | **Duplicata mais fraca** de arquivo que já existia na main **no próprio merge_base** | `git ls-tree -r --name-only 1252bb5a4 -- src/components/talkx/kit/__tests__/` lista `talkxStates.matrix.test.tsx`; `git show 1252bb5a4:src/components/talkx/kit/__tests__/talkxStates.matrix.test.tsx \| wc -l` = **695**. Criado em `445450af3` (2026-10-03, "feat(talkx): expõe erro nos hooks e cria o TalkXQueryBoundary (X047)", PR #1837) — um mês antes da branch. |
| `docs/reconciliation/tasks/P046.json` | Reformatação integral de JSON minificado de 1,4 MB (ruído) + 8 flips de `status` no ledger, **sem atualizar `status_counts`** | ver abaixo |

### 1. Teste da matriz — cobertura da main é superconjunto

A branch cobre 9 telas com **um único caso** cada ("erro vence vazio"). A main cobre, por tela,
`erro` + `retry` + `carregando` + `vazio`, mais um contrato estático (≥9 usos reais de
`<TalkXQueryBoundary`, ausência do placeholder legado "Carregando campanha…").

| Tela do teste da branch | Onde está provado na main hoje |
|---|---|
| TalkXOverview | `src/components/talkx/kit/__tests__/talkxStates.matrix.test.tsx:426` (linha "Visão geral", casos erro/retry/carregando/vazio, `vazioTexto: /Nenhuma campanha encontrada/`) |
| TalkXSegments | mesmo arquivo, linha "Segmentos" (`:459`) |
| TalkXTemplates | mesmo arquivo, linha "Templates" (`:472`) |
| TalkXSuppression | mesmo arquivo, linha "Supressão" (`:485`) |
| TalkXAnalytics | mesmo arquivo, linha "Analytics" (`:498`) |
| TalkXSettings | mesmo arquivo, linha "Configurações" (`:509`) |
| TalkXCampaignScheduled | mesmo arquivo, linha "Agendada" (`:546`) |
| TalkXCampaignPaused | `src/components/talkx/__tests__/TalkXCampaignPaused.test.tsx:230-237` ("consulta com erro: mostra o erro e não o conteúdo") e `:239-245` (vazio) |
| TalkXTemplateEditor | `src/components/talkx/__tests__/TalkXTemplateEditor.states.test.tsx:102-112` ("consulta com erro: mostra o erro, NUNCA o vazio da biblioteca"), + retry, carregando, vazio e conteúdo |

A invariante central "erro vence vazio" do componente compartilhado está provada em
`src/components/talkx/kit/__tests__/talkxStates.matrix.test.tsx:63` — *"erro: mostra o erro e NUNCA
o vazio (nem com a lista vazia)"* — e as duas telas acima consomem esse mesmo boundary
(`src/components/talkx/TalkXCampaignPaused.tsx:159`, `src/components/talkx/TalkXTemplateEditor.tsx:515`).

A main ainda cobre **3 linhas que a branch não tinha**: Monitor (`TalkXLiveMonitor.tsx`),
Em andamento (`TalkXCampaignRunning.tsx`) e Carregamento do wizard (`TalkXView.tsx`).

Além de redundante, o arquivo da branch já está **desatualizado** contra a main: monta
`<TalkXOverview>` sem `onRetry` (hoje `src/components/talkx/TalkXOverview.tsx:53` tem a prop e o
caso de retry depende dela) e não cobre `retry`/`aria-busy`. Portar daria um segundo arquivo de
mesmo basename cobrindo menos.

### 2. `docs/reconciliation/tasks/P046.json` — ledger gerado

Na main o arquivo é **uma linha** minificada de 1.399.707 bytes (`2b4dac2d3`, 2026-10-04,
"docs(reconciliation): checkpoint da auditoria exaustiva"). A branch reescreve o arquivo inteiro
formatado (21.158 linhas de diff). Comparação **semântica** (JSON parseado, não textual):

- `plan` idêntico; `status_counts` **idêntico** (`DONE_VERIFIED: 2`, `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE: 28`, `PARTIAL: 114`);
- 200 tasks em ambos; **8 tasks diferem**, só nos campos `status`, `verified_at`, `verified_by`:

| índice | título (trecho) | main → branch |
|---|---|---|
| 6 | "Corrigir quebra de hooks do Analytics; abas com dropdown, deep link…" | IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE → DONE_VERIFIED |
| 7 | "Corrigir condição incompleta no construtor…" | idem |
| 41 | "Dividir `talkxShared.tsx` em `kit/*` com barrel…" | idem |
| 42 | "Completar `TalkXTable`: ordenação, seleção em massa…" | idem |
| 43 | "`KpiCard` com comparativo de período…" | idem |
| 44 | "Unificar a barra de filtros…" | idem |
| 45 | "Reescrever os 6 estados do sistema…" | idem |
| 46 | "Expor erro nos hooks e aplicar carregando/erro/vazio em todas as telas" | PARTIAL → DONE_VERIFIED |

Todas ganharam `verified_at: 2026-11-01T23:28:05.918Z`, `verified_by: claude/fix-talkx-x047-matrix-261101`.
Problemas: (a) é **bookkeeping de doc gerado**, não comportamento de produto; (b) o `status_counts`
do mesmo arquivo **não foi atualizado**, então o ledger ficaria internamente contraditório
(2 `DONE_VERIFIED` declarados contra 10 reais); (c) a prova que a branch invoca para marcar
`DONE_VERIFIED` é exatamente o teste duplicado do item 1, que já existia na main desde 2026-10-03 —
ou seja, o selo não acrescenta evidência nova; (d) reformatar 1,4 MB para mudar 24 campos é churn
puro (contra AGENTS.md "diff mínimo, zero churn").

## Veredito: OBSOLETA
Nada a recuperar. O teste é duplicata mais pobre de arquivo que já estava na main no merge_base; o
resto é selo de status num ledger gerado, sem evidência nova e com contagem inconsistente.

- `apagar_branch_seguro`: **true** (prova completa nos 2 arquivos).
- Confere com a triagem anterior (`triagem_2804: {"2546": "OBSOLETA"}`), agora com prova lida no código.

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA**. Tentei refutar os dois arquivos e os dois caem.

**1. `src/components/talkx/__tests__/talkxStates.matrix.test.tsx` (341 linhas) — duplicata mais fraca, já coberta.**
- `git ls-tree -r --name-only 1252bb5a41 -- src/components/talkx/kit/__tests__/` lista `talkxStates.matrix.test.tsx` **no próprio merge_base**; `git show origin/main:src/components/talkx/kit/__tests__/talkxStates.matrix.test.tsx | wc -l` = **695** (idêntico no merge_base: 695).
- Cobertura da main (`LINHAS` em :426-565) = 10 linhas: Visão geral, Segmentos, Templates, Supressão, Analytics, Configurações, Monitor, Em andamento, Agendada + wizard `TalkXView`, cada uma com os casos `erro / retry / carregando / vazio` (:617, :630, :642, :663) e com texto de vazio **específico por tela** (ex.: `/Nenhuma campanha encontrada/`, `/Nenhum segmento salvo/`). A branch tem 9 linhas com **um só** caso (erro) e `expectNoEmpty()` por regex genérico.
- A main ainda tem o que a branch não tem: `:69` `erro: mostra o erro e NUNCA o vazio (nem com a lista vazia)`, `:101` precedência carregando×erro e `:141` contrato estático `pelo menos 9 usos reais de TalkXQueryBoundary` + `:165` ausência do placeholder legado.
- As 2 telas fora da matriz da main têm prova própria na main: `src/components/talkx/__tests__/TalkXCampaignPaused.test.tsx:230-237` (`consulta com erro: mostra o erro e não o conteúdo`, checando também `[data-talkx-query="content"] === null`) e `src/components/talkx/__tests__/TalkXTemplateEditor.states.test.tsx:103-112` (`consulta com erro: mostra o erro, NUNCA o vazio da biblioteca`, com `[data-talkx-query="empty"]` e `loading` nulos) — asserções **mais fortes** que as da branch. Ambas as telas usam o mesmo boundary (3 ocorrências de `TalkXQueryBoundary` em cada arquivo-fonte na main).
- O arquivo da branch já está defasado: monta `<TalkXOverview>` sem `onRetry`, prop que existe hoje em `src/components/talkx/TalkXOverview.tsx:53,74,151-154` e sustenta o caso de "Tentar novamente".
- Nenhum guard/CI exige o caminho `src/components/talkx/__tests__/talkxStates.matrix.test.tsx`: `git grep "talkxStates.matrix" origin/main -- scripts/ .github/ e2e/` só retorna TSVs de `docs/_arquivo/`, que apontam para o caminho da main (`kit/__tests__/`, SHA256 540d21d3…) com veredito "JÁ ESTÁ NA MAIN". `vitest.config.ts:19` usa `src/**/*.{test,spec}.{ts,tsx}` — portar criaria um segundo arquivo de mesmo basename cobrindo menos.

**2. `docs/reconciliation/tasks/P046.json` — reformatação sem valor e internamente inconsistente.**
- Normalizando os dois lados (`JSON.parse` → `stringify`), o diff semântico cai de 21.158 para **150 linhas**: 8 flips de status (7× `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE` → `DONE_VERIFIED` em X007, X008, X042-X046 e 1× `PARTIAL` → `DONE_VERIFIED` em X047) + `verified_at: 2026-11-01T23:28:05.918Z` / `verified_by: claude/fix-talkx-x047-matrix-261101`. O resto dos 21.158 é só o arquivo minificado virando pretty-print.
- Portar **corromperia** o ledger: `plan.status_counts` continua `{DONE_VERIFIED:2, …, IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE:28, PARTIAL:114}` enquanto a contagem real das `tasks` na branch é `{DONE_VERIFIED:10, …, IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE:21, PARTIAL:113}`. Na main o cabeçalho e as tasks batem exatamente.
- A única "evidência" invocada para os flips é o teste duplicado do item 1, que não prova nada novo. Sem evidência de runtime, o flip para `DONE_VERIFIED` é afirmação sem prova.

Conclusão: zero hunk de valor ≥ médio fora da main. Veredito mantido **OBSOLETA**; apagar a branch é seguro (PR #2546 pode ser fechada com este parecer).
