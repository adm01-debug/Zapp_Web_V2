# Dossiê — claude/fix-x051-remote-completion-test-261108-2057 (PR #2836, CLOSED não mergeada)

- ref: `origin/claude/fix-x051-remote-completion-test-261108-2057` · tip `6081b16` · merge-base `9183f0f`
- Propósito (git log MB..tip): durante a integração do X051 (`useTalkXLifecycle` em `TalkXCampaignRunning`, commit `25876de`), a tela passou a usar o copy padrão do hook (`'Pausar campanha?'`, minúsculo). A branch (a) trocou os títulos dos `AlertDialog` locais para minúsculo (`287c42916`), (b) ajustou o teste `remote-completion` para minúsculo (`04915211e`) e (c) portou a suíte `TalkXCampaignReport.test.tsx` (que no MB tinha só mocks, 0 `describe/it`) para destravar CI (`6081b16`).

## Arquivo × achado × evidência

| Arquivo | Lacuna mecânica | Achado | Evidência |
|---|---|---|---|
| `src/components/talkx/TalkXCampaignRunning.tsx` | 2 linhas `<AlertDialogTitle>Pausar/Cancelar campanha?</AlertDialogTitle>` | **OBSOLETA** — o X051 mergeado (#2555, `a49ef4ad5`) removeu os `AlertDialog` locais (`git show a49ef4ad5` linhas `-<AlertDialogTitle>Pausar Campanha?</AlertDialogTitle>`) e substituiu por `TalkXLifecycleDialog` com override **deliberado em maiúsculo**: `origin/main:src/components/talkx/TalkXCampaignRunning.tsx:613 title: 'Pausar Campanha?'` e `:619 title: 'Cancelar Campanha?'`, com comentário nas linhas 606-610 ("o mesmo de antes do diálogo único (o E2E `talkx-launch` e o operador contam com...)"). `git grep AlertDialog origin/main -- TalkXCampaignRunning.tsx` = 0 ocorrências. | `git log -S"title: 'Pausar Campanha?'" origin/main -- <arquivo>` → `a49ef4ad5` |
| `src/components/talkx/__tests__/TalkXCampaignRunning.remote-completion.test.tsx` | 6 linhas trocando `'Pausar Campanha?'`→`'Pausar campanha?'` | **OBSOLETA (e aplicar quebraria a main)** — a main manteve o arquivo igual ao MB (blob `445c3bee`, nenhum commit em `9183f0f..origin/main` tocou o arquivo) e ele assere `'Pausar Campanha?'` (linhas 150-151, 182, 187, 196, 202), coerente com o título que a tela renderiza hoje (Running.tsx:613). O teste irmão `TalkXCampaignRunning.lifecycle.test.tsx:187-188` confirma a decisão: `// Texto do diálogo desta tela é o de antes do X051 ("Pausar")` + `getByText('Pausar Campanha?')`. | Trocar para minúsculo faria `getByText` falhar na main. |
| `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` | 66 linhas (mock `recharts`, imports, fixtures, 3 testes) | **INCORPORADA por equivalente** — a main reescreveu o arquivo em `568d3f932` "feat(testes): 12 testes reais para TalkXCampaignReport e talkxReportData" (depois `cb6576b2a`, `d73156d89`, `c545e5b63`): 215 linhas cobrindo `talkxReportSeriesFromRows` (5 casos), `talkxReportHeatmapFromTimestamps` (3), `TalkXCampaignReport` (4: título, nome, 3 cartões via `data-testid`, `hasConversionSource=false`, falha de PDF). Mesma intenção dos 3 testes da branch (série diária, heatmap seg→dom, 3 gráficos sem série Conversões). Em vez de mockar `recharts`, a main mocka os 3 subcomponentes (`../TalkXReportPerformance|Funnel|Heatmap`) — abordagem mais isolada. Hunks menores da branch (remover docblock X164, compactar `select:` do builder, remover comentário "Cliques não têm linhas") já estão na main (`git grep 'X164 / TL-080'` e `'Cliques não têm'` em origin/main → 0; `select: (cols: string) => { selected = cols; return builder; }` presente). `removed_still_in_main: 1` = linha `return builder;` genérica do builder, ruído. | `git show origin/main:<arquivo>` |

## Veredito: **OBSOLETA** · confiança alta · `apagar_branch_seguro: true`

- A correção de títulos atacava um estado intermediário do X051 (copy padrão do hook). O X051 mergeado (#2555) decidiu manter o texto antigo em maiúsculo nesta tela (override `RUNNING_LIFECYCLE_COPY`), e a main (componente + 2 testes) é coerente com isso. Portar a branch quebraria `remote-completion.test.tsx` e `lifecycle.test.tsx` na main.
- A suíte do relatório tem substituto mais completo na main.
- Observação sobre o comentário de fechamento (11/11): alegou que o teste da branch é "idêntico byte a byte" ao que entrou com a #2555. **Falso**: a main tem o blob `445c3bee` (maiúsculo), não `9a86e2ec`; `a49ef4ad5` não tocou o `remote-completion.test.tsx`. O veredito OBSOLETA continua correto, pelo motivo acima (decisão deliberada de copy), não pelo motivo alegado.
- NÃO RODADO: vitest (sem `node_modules` no clone — `npx vitest` falha com EOVERRIDE postcss). Prova é estática (texto do componente × asserts do teste na main).

## Lacunas a recuperar
Nenhuma.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA** — `apagar_branch_seguro: true`. Nada a recuperar.

O achado mecânico (5 linhas em `src/components/talkx/TalkXCampaignRunning.tsx`, add em `25876de64`) é real e tem
cheiro de alerta: o commit `287c42916`, cujo título promete apenas "corrige títulos Pausar/Cancelar para lowercase
(R2-MOD-032)", na verdade **reverteu a integração X051 inteira** — não mexeu em 2 strings, desfez o commit anterior
e trouxe de volta os `AlertDialog` locais, `pauseOpen`/`cancelOpen`/`pauseReason`/`resuming`, `handlePause`,
`handleCancel`, `handleResume`. Título ≠ efeito; quem lê só a ponta (`MB..tip`) não vê que o hook existiu.

Mas a intenção **sobrevive na main, em forma superior**, então não é reversão de trabalho real:

| Linha removida por `287c42916` | Onde está hoje em `origin/main` |
|---|---|
| `import { useTalkXLifecycle, TalkXLifecycleDialog } from './useTalkXLifecycle';` | `:11-13` (`useTalkXLifecycleWith, TalkXLifecycleDialog, …`) |
| `const lifecycle = useTalkXLifecycle();` | `:657` `const lifecycle = useTalkXLifecycleWith(` — variante com `copy`/`onSuccess`/`onError` |
| `lifecycle.close();` | `:689` `const closeLifecycle = lifecycle.close;` |
| `resuming={lifecycle.isPending && lifecycle.intent?.kind === 'resume'}` | `:905` `resuming={lifecycle.pendingKind === 'resume'}` |
| `{/* Diálogo unificado de ciclo de vida … — X051 */}` + `<TalkXLifecycleDialog controller={lifecycle} />` | `:922-923` mesmo componente, comentário equivalente |

Evidências:
- `git show 287c42916 -- src/components/talkx/TalkXCampaignRunning.tsx` — reverte o diff de `25876de64` por inteiro.
- `git grep -n -E "useTalkXLifecycle|TalkXLifecycleDialog|lifecycle\.(close|request)" origin/main -- src/components/talkx/TalkXCampaignRunning.tsx` → 9 ocorrências (`:11`, `:13`, `:657`, `:689`, `:900-902`, `:923`).
- `git grep -nc "useTalkXLifecycle" origin/claude/fix-x051-remote-completion-test-261108-2057 -- <arquivo>` → 0 (a ponta não tem o hook).
- `git grep -n "AlertDialog" origin/main -- <arquivo>` → 0 (a main não voltou aos diálogos locais).
- A main resolveu o conflito de copy que a branch tentou resolver ao contrário: em vez de rebaixar o título da tela
  para minúsculo, fixou `RUNNING_LIFECYCLE_COPY` (`:614-626`) com `'Pausar Campanha?'`/`'Cancelar Campanha?'` e
  documentou o motivo (`:610-613`: E2E `talkx-launch` e operador; retomar sem diálogo, decisão do dono 2026-11-13).

Conclusão: o veredito OBSOLETA da triagem fica de pé, e passa a ter uma razão adicional — a branch acabou
*sem* o X051, que é justamente o que a main entregou (#2555, `a49ef4ad5`). Mergear a ponta hoje removeria o
diálogo único da tela de execução.

## Verificação adversarial

Parecer: **concordo com OBSOLETA** · `apagar_branch_seguro: true` · nenhuma lacuna ≥ média encontrada.

Tentei refutar os 3 arquivos do `git diff 9183f0f..origin/claude/fix-x051-remote-completion-test-261108-2057`
(diffstat: 3 arquivos, +107/-24 — nada fora desses 3):

1. `src/components/talkx/TalkXCampaignRunning.tsx` (2 linhas) — o diff só troca
   `<AlertDialogTitle>Pausar Campanha?</AlertDialogTitle>` → `Pausar campanha?` (idem Cancelar) **em
   `AlertDialog` locais que não existem mais na main** (`git grep -c AlertDialog origin/main --
   src/components/talkx/TalkXCampaignRunning.tsx` → 0 linhas). A main tem
   `RUNNING_LIFECYCLE_COPY` com `title: 'Pausar Campanha?'` / `'Cancelar Campanha?'` e o comentário
   logo acima (`origin/main:src/components/talkx/TalkXCampaignRunning.tsx:606-624`) dizendo que o texto
   é "o mesmo de antes do diálogo único" porque o E2E `talkx-launch` e o operador contam com ele.
   Confirmei que o default do hook é minúsculo (`origin/main:src/components/talkx/useTalkXLifecycle.tsx:137
   title: 'Pausar campanha?'`) — ou seja, o override em maiúsculo é escolha explícita, não esquecimento.
   O hunk da branch é a decisão **invertida**: aplicar hoje seria reverter a decisão do dono (13/11).

2. `src/components/talkx/__tests__/TalkXCampaignRunning.remote-completion.test.tsx` (6 linhas) — a main
   está idêntica ao merge-base (blob `445c3bee4819…` em `9183f0f6` e em `origin/main`) e assere maiúsculo
   nas linhas 150, 151, 182, 187, 196, 202. Confirmado também em
   `origin/main:src/components/talkx/__tests__/TalkXCampaignRunning.lifecycle.test.tsx:188`
   (`getByText('Pausar Campanha?')` dentro do `alertdialog`). Portar o hunk deixaria 2 suítes vermelhas.

3. `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` (66 linhas, o único candidato real
   a lacuna) — a main tem 215 linhas / 12 testes e **mais** arquivos vizinhos que a branch não tinha:
   `TalkXReportFunnel.test.tsx`, `TalkXReportHeatmap.test.tsx`, `TalkXReportPerformance.test.tsx`,
   `TalkXCampaignReport.segmento.test.tsx` (`git ls-tree -r --name-only origin/main --
   src/components/talkx/report`). Cada asserção da branch tem destino na main:
   - série diária por balde → `TalkXCampaignReport.test.tsx:69-106` (5 casos, inclui vazio, `sent_at` nulo e `hour`);
   - heatmap 7x24 começando na segunda → `:109-122` + `TalkXReportHeatmap.test.tsx:35` ("a grade começa na
     segunda e termina no domingo");
   - títulos "Desempenho da Campanha" / "Funil de Conversão" / "Mapa de Calor de Respostas" → provados nos
     testes dos próprios subcomponentes (`TalkXReportHeatmap.test.tsx:39`, `TalkXReportFunnel.test.tsx:42-61`,
     `TalkXReportPerformance.test.tsx:65-130`), em vez de uma asserção de integração com `recharts` mockado;
   - `hasConversionSource=false` / sem série "Conversões" → `TalkXCampaignReport.test.tsx:189-200` e
     `TalkXReportPerformance.test.tsx:97`.
   Único resíduo não coberto: a asserção `getByText('Fulana de Tal')` (prop `creators` → `MetaRow
   "Responsável"`, `origin/main:src/components/talkx/report/TalkXCampaignReport.tsx:327`), que nenhum teste
   da main cobre (`git grep -l -E "creators|Responsável" origin/main -- 'src/components/talkx/**/__tests__/*'`
   → só `kit/__tests__/talkxStates.matrix.test.tsx`). É **uma linha** de asserção sobre render condicional de
   um rótulo: valor baixo, não justifica reabrir a branch; se interessar, é 1 linha a somar no teste da main,
   não um resgate.

Não encontrei commit de remoção proposital a reverter: `287c42916` reverteu a integração do X051 **dentro da
branch**, e a main entregou o X051 por outro caminho (#2555, `a49ef4ad5`), como o dossiê já registrou.

NÃO VERIFICADO por execução: vitest não rodado (mesma limitação da triagem — clone sem `node_modules`). A prova
é estática: texto renderizado pela main × asserts dos testes da main.
