# Dossiê — `claude/feat-radar-fase6-261108-1933` (PR #2825)

- tip `03e96a7005c4d583b4e6597c0705c4109581cb3c` · merge_base `9183f0f6fa4296cd07c585602bc5ea88ada5d98d` · 8 commits · 6 arquivos
- **Veredito: OBSOLETA** (confiança alta) · `apagar_branch_seguro = true` **com uma condição** (ver "Dependências")

## Propósito da branch
Fase 6 do Copiloto RADAR (CV-051–060): criar um painel flutuante (`RadarPhase6Panel`, 319 linhas) com modos
mini/normal/foco, indicador "pensando" com timeout, timeline de insights, "não perturbe", drawer mobile e
atalho de teclado; montá-lo no `ChatPanel`; e, no último commit, restaurar a suíte vitest
`TalkXCampaignReport` (X164).

Commits: `13ab17183` (painel), `08e6fa3d7`/`79456641f` (briga do atalho Ctrl+Shift+R → Ctrl+Shift+A),
`03e96a700` (teste TalkX), mais 4 merges de `main`.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/copilot/RadarPhase6Panel.tsx` | **Superado**. A `main` já tem o mesmo painel CV-051–060 em outro desenho, mais completo e ligado ao motor de IA: `src/components/inbox/copilot/RadarPanel.tsx` (461 linhas) + `RadarLive.tsx` + `RadarCards.tsx` + teste `__tests__/RadarPanel.test.tsx`. | Entrou pela PR **#2828** (`git log --diff-filter=A origin/main` → `11841dba9 feat(copilot): motor e telas RADAR Copiloto CV-021–060 (#2828)`). Marcadores na `main`: `RadarPanel.tsx:62` (timeout CV-054), `:107` (arrastar CV-051), `:128` (atalhos CV-056), `:184` (drawer mobile CV-060), `:263` (modos CV-052), `:282` (DND CV-058), `:340` (`aria-live="polite"` CV-055/057). |
| idem | **Meia-feature na branch**: o painel só desenha `radar.timeline`, e **ninguém chama `pushInsight`/`startThinking`** em nenhum arquivo da branch → na tela ficaria para sempre "Nenhum insight ainda nesta sessão". Os cards CV-053 (Etapa, B·R·I·N·D·E, Sugestões, Próximo passo, Alertas, Produtos, Quem decide) estão citados no cabeçalho e **não existem no código**. | `git grep -n "pushInsight\|startThinking" <branch> -- src` só acha a definição em `useRadarPanel.ts:45,165,205`. O painel da `main`, ao contrário, recebe dados reais via `RadarLive.tsx:27-29` (`useCopilotSession` + `useLiveSuggestions`). |
| idem | **Bug conhecido nesta versão**: o listener usa `Ctrl+Shift+R` (`RadarPhase6Panel.tsx:127`), que na `main` já é `mark-resolved` (`defaultShortcuts.ts:35`). Corrigido só na branch irmã. | `git diff <esta> <irmã> -- src/components/copilot/RadarPhase6Panel.tsx` → irmã usa `e.key.toLowerCase() === 'a'`. |
| `src/hooks/copilot/useRadarPanel.ts` | **Incompatível com a `main`**. O arquivo **não existia** no merge_base; branch e `main` o criaram em paralelo (daí o CONFLICT). A `main` expõe `useRadarPanel(userId, conversationId)` com `RADAR_CARD_IDS`/`cardOrder`/`collapsedCards`, consumido por `RadarLive.tsx:16,29`, `RadarPanel.tsx:10`, `RadarCards.tsx:9` e testado em `__tests__/RadarPanel.test.tsx:135-174`. A branch expõe `useRadarPanel(conversationId)` com `open/thinking/timeline`. Trocar o hook quebra o painel que já está na `main`. | `git show 9183f0f:src/hooks/copilot/useRadarPanel.ts` → `fatal: path ... exists on disk, but not in '9183f0f'`. |
| `src/components/copilot/index.ts` | Só exporta o painel obsoleto (2 linhas) + troca "Fases 7–13" por "Fases 6–13" no comentário. Sem valor isolado. | `git diff` do arquivo. |
| `src/components/inbox/ChatPanel.tsx` | Monta o painel obsoleto (lazy + `<Suspense>`, 10 linhas). O ponto de montagem **em si** é o que falta na `main` — mas para o painel A, e isso é **decisão do dono já registrada**: montar custa 4,6 KB e a `main` tem 3,0 KB de folga no teto de assets. | `PENDENCIAS.md` item 6 (linhas 253-307): "`RadarLive` ... **sem nenhum consumidor**", medição `4097,0 KB de um teto de 4100 KB`, "Não subi o teto por conta própria". |
| `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx` | **INCORPORADA com cobertura maior na `main`**. Os 3 testes da branch já existem lá, mais amplos (13 casos, 215 linhas, +174 desde o merge_base). | `main:...test.tsx:72` (agrupa mesmo dia), `:84` (2026-10-05 segunda / 2026-10-11 domingo), `:99` (granularidade hora), `:109-119` (grade 7x24, nulos), `:176` (os três cartões), `:189` (`hasConversionSource === false` → sem série Conversões), `:201` (falha de PDF). A `main` mocka os subcomponentes de gráfico em vez do `recharts` — mesma intenção. Só não tem as asserções de rótulo ("Resumo da Campanha", "Responderam", "Clicaram", nome do criador): valor baixo. |
| `src/hooks/shortcuts/defaultShortcuts.ts` | 3 linhas: registra `radar-toggle` (Ctrl+Shift+A) na lista **`SHORTCUTS_SOMENTE_INFORMATIVOS`** — ou seja, entrada de catálogo sem handler. Inútil sem o painel. A versão desta branch ainda está inconsistente com o listener do painel (`R` vs `a`). | `git diff` do arquivo; `main:defaultShortcuts.ts:35` já usa Ctrl+Shift+R para `mark-resolved`. |

## Por que OBSOLETA e não PERDIDA
Duas provas somadas:

1. A necessidade CV-051–060 está atendida na `main` por outra abordagem **mais completa** (painel A: arrastável,
   7 cards reais, aria-live, DND, drawer mobile, ligado ao motor de IA) — PR #2828, commit `11841dba9`.
2. A abordagem desta branch (painel B) **está preservada em forma corrigida** na branch irmã
   `claude/fix-radar-fase6-cv056-shortcuts-261108-2335` (PR #2872), que é a que o dono tem em aberto como
   "opção B" na issue #2967: `PENDENCIAS.md:170-182` — "A auditoria encontrou **dois painéis concorrentes**
   ... **B** — `RadarPhase6Panel` (321 linhas) | branch `claude/fix-radar-fase6-cv056-shortcuts-261108-2335`
   (PR #2872) ... **O que fazer:** responda "RADAR opção A" ou "RADAR opção B"".

Diff entre as duas irmãs (`git diff <esta> <irmã>`): a irmã é **posterior e melhor** — corrige o atalho
(`Ctrl+Shift+R` → `Ctrl+Shift+A`), acrescenta `aria-label` no mudo global, move a montagem no `ChatPanel` para
dentro da área do chat e arruma o `SHORTCUTS_SOMENTE_INFORMATIVOS`. O único conteúdo exclusivo desta branch é
o teste TalkX, que a `main` já cobre melhor.

Não é `DECISAO_DONO` **deste item**: a decisão de produto (A ou B) e a do teto de bundle já estão registradas
em `PENDENCIAS.md` e ancoradas na branch #2872, não nesta.

## Dependências / condição para apagar
Apagar `claude/feat-radar-fase6-261108-1933` é seguro **enquanto**
`origin/claude/fix-radar-fase6-cv056-shortcuts-261108-2335` (PR #2872) continuar de pé — é ela que guarda a
"opção B" prometida ao dono em `PENDENCIAS.md:179`. Se outra triagem marcar a #2872 para exclusão, pare e
avise o dono: as duas juntas apagam a opção B da issue #2967.

## Nada a portar
Não há hunk desta branch que valha recuperar. Se o dono responder "RADAR opção B", o material a usar é o da
branch #2872 (versão corrigida), não esta.

## Verificação adversarial

Parecer: **concordo com OBSOLETA** · `apagar_branch_seguro = true` (mantida a condição da #2872). Tentei refutar
arquivo por arquivo e não achei nenhum hunk de valor ≥ médio fora da `main`/da irmã.

Checagens que fiz (`origin/main` em `dac285f62`):

1. **Substituição alegada existe e cobre a necessidade.** `git show origin/main:src/components/inbox/copilot/RadarPanel.tsx`
   → 461 linhas, com os marcadores nas linhas citadas: `:2` (CV-051–060), `:62`/`:94` (timeout CV-054),
   `:104` + `:338` (aria-live CV-055/057), `:107` (arrastar CV-051), `:128` (atalhos CV-056), `:184` (drawer
   mobile CV-060), `:263` (modos CV-052), `:282`/`:347` (DND CV-058). Os **7 cards CV-053** que a branch só
   promete no cabeçalho existem de verdade na `main`: `RadarCards.tsx:61` "Etapa da venda", `:95` "B·R·I·N·D·E",
   `:173` "Próximo passo", `:196` "Alertas", `:222` "Produtos sugeridos", `:246` "Quem decide".
2. **Painel da branch é mesmo meia-feature.** `git grep -n "pushInsight\|startThinking" origin/claude/feat-radar-fase6-261108-1933 -- src`
   devolve **só as 6 linhas de definição/retorno** em `src/hooks/copilot/useRadarPanel.ts:43,45,149,165,204,205`.
   Zero chamadores → a timeline que o painel renderiza nunca receberia nada.
3. **Hook é incompatível, confirmado.** `origin/main:src/hooks/copilot/useRadarPanel.ts:70` →
   `useRadarPanel(userId: string | undefined, conversationId?: string)` com `RADAR_CARD_IDS` (`:10`) e
   `cardOrder` (`:24,33,60,134`). A branch expõe `useRadarPanel(conversationId)`. Adotar o da branch quebra
   RadarLive/RadarPanel/RadarCards.
4. **Colisão de atalho confirmada.** Branch: `RadarPhase6Panel.tsx:127` → `e.ctrlKey && e.shiftKey && e.key === 'R'`.
   `origin/main:src/hooks/shortcuts/defaultShortcuts.ts:35` → `mark-resolved` com `defaultKey: 'r'`,
   `ctrlKey+shiftKey`. A branch está com o bug; a irmã corrigiu.
5. **Opção B está preservada.** `git ls-remote origin refs/heads/claude/fix-radar-fase6-cv056-shortcuts-261108-2335`
   → `4c63335e7` (viva). `origin/main:PENDENCIAS.md` §2 (issue #2967) nomeia essa branch como opção B e diz
   "responda RADAR opção A ou RADAR opção B". `git diff <esta> <irmã>` mexe nos 5 arquivos (a irmã é posterior
   e melhor); o único conteúdo exclusivo desta branch é o teste TalkX (88 linhas a mais no diff do teste).
6. **Teste TalkX: a `main` cobre mais.** `origin/main:...TalkXCampaignReport.test.tsx` tem 215 linhas e **13 `it()`**
   (`:69,72,84,92,99,109,115,119,168,172,176,189,201`) contra **3** na branch (`:91,98,107`). As intenções da
   branch têm equivalente: três gráficos → `main:176`; sem série Conversões → `main:189`; balde diário e grade
   7x24 → `main:72,84,109,115`. Só faltam asserções de rótulo ("Resumo da Campanha", "Responderam", "Clicaram",
   nome do criador) — valor baixo, e o mock de `recharts` da branch é alternativa ao mock de subcomponentes da
   `main`, não ganho.
7. **Ponto a registrar (não muda o veredito).** O painel A da `main` continua **órfão**:
   `git grep -n "RadarLive\|RadarPanel" origin/main -- src` só acha ocorrências dentro de
   `src/components/inbox/copilot/` e do próprio hook — nenhum consumidor externo. Ou seja, a necessidade de
   produto CV-051–060 está **codificada** na `main` mas não **ligada na tela**. Isso é a pendência registrada
   pelo dono (`PENDENCIAS.md` §2 e §6, teto de assets), não lacuna desta branch: a montagem desta branch é do
   painel B obsoleto, e a versão boa dessa montagem está na irmã #2872 (`ChatPanel.tsx`, 16 linhas de diferença).
