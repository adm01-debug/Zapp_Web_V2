# Dossiê — claude__feat-radar-panels-8to15-261108-1906 (PR #2820)

**Ref:** `origin/claude/feat-radar-panels-8to15-261108-1906` · tip `5472e476` · merge-base `9183f0f6`
**Commits próprios:** `b88f6317e feat(copilot): renderiza painéis RADAR fases 8-15 no ChatInputArea` (+2 merges de main).
**Stat:** 1 arquivo, +12 linhas (`src/components/inbox/chat/ChatInputArea.tsx`).

## Propósito
Ligar o componente `RadarPhase8to15Panel` (já existente) na caixa de digitação da Inbox (desktop, fora do modo edição), passando última mensagem do cliente, rascunho, nome do contato e callback de inserção.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/components/inbox/chat/ChatInputArea.tsx` | **JÁ NA MAIN, em versão superior** (PR #2809, commit `be8aa06a1`, 2026-11-09) | `git log -S'RadarPhase8to15Panel' origin/main -- <arquivo>` → `be8aa06a1 feat(copiloto): painel RADAR fases 8–15 visível no chat (CV-071..150) (#2809)`. Main: import na linha 8; render nas linhas 220-228 com os mesmos props da branch (`lastClientMessage`, `draftText`, `clientName`, `onInsertText`) **mais** `daysSinceLastContact` (calculado nas linhas 126-131). Guarda idêntica `!logic.isMobile && !editingMessage`. |

### As 2 linhas "faltantes" (line_check)
1. `// CV-071..150 — painel RADAR das Fases 8-15 (objeções, catálogo, termômetro, coaching)` — comentário acima do import. Main tem o import sem esse comentário (linha 8) e tem comentário equivalente `// CV-071..150 — dias desde a última mensagem...` na linha 126. Valor: **nenhum** (cosmético).
2. `className="px-4 pt-1"` — main usa `className="px-4 pt-2"` (linha 222). Diferença de 4px de padding; a main é a versão que o dono mergeou depois. Valor: **nenhum**.

Componente alvo existe na main: `git ls-tree origin/main -- src/components/copilot/RadarPhase8to15Panel.tsx` → blob `0d3f50c1`; interface aceita `daysSinceLastContact?` (linha 35).

## Veredito
**INCORPORADA** (confiança alta). PR #2820 era duplicata de #2809; a versão mergeada é superset (adiciona `daysSinceLastContact`). Nada a recuperar.

`apagar_branch_seguro = true`.

## Verificação adversarial

**Parecer: CONCORDO com INCORPORADA. `apagar_branch_seguro = true`.**

Tentei refutar procurando qualquer hunk de valor ≥ médio fora da main. Não existe — o diff inteiro da branch são 12 linhas em 1 arquivo, e todas estão na main em versão superior.

Provas que eu mesmo rodei:
1. `git diff --stat 9183f0f6 origin/claude/feat-radar-panels-8to15-261108-1906` → `src/components/inbox/chat/ChatInputArea.tsx | 12 ++++++++++++`, 1 arquivo. `git show --stat b88f6317e` (único commit próprio; os outros 2 são merges de main) → mesmo 1 arquivo, +12/-0. Não há arquivo escondido que os merges de main tenham mascarado, porque o diff líquido merge-base→tip é idêntico ao commit.
2. `git grep -n "RadarPhase8to15Panel" origin/main -- src/components/inbox/chat/ChatInputArea.tsx` → linha 8 (import) e linha 221 (render). `git log -S'RadarPhase8to15Panel' --oneline origin/main -- <arquivo>` → `be8aa06a1 feat(copiloto): painel RADAR fases 8–15 visível no chat (CV-071..150) (#2809)` — entrou por merge legítimo, não por remoção/revert.
3. Abri `git show origin/main:src/components/inbox/chat/ChatInputArea.tsx` nas linhas 219-227: render sob a guarda idêntica `!logic.isMobile && !editingMessage`, com os 4 props da branch (`lastClientMessage`, `draftText`, `clientName`, `onInsertText`) **mais** `daysSinceLastContact={daysSinceLastContact}`, calculado nas linhas 127-131 (`useMemo` sobre a última mensagem do contato). Superset estrito.
4. Componente alvo presente: `git ls-tree origin/main -- src/components/copilot/RadarPhase8to15Panel.tsx` → blob `0d3f50c156b0`.
5. As 2 linhas do `line_check.missing_sample` conferidas uma por uma:
   - `// CV-071..150 — painel RADAR das Fases 8-15 (objeções, catálogo, termômetro, coaching)` → comentário de import. Main não tem esse comentário nessa linha, mas tem o equivalente na linha 127 (`// CV-071..150 — dias desde a última mensagem do cliente...`). Valor: nenhum.
   - `className="px-4 pt-1"` → main usa `pt-2` (linha 222), igual ao `RadarPhase7Panel` logo acima (linha 213, também `pt-2`). O `pt-1` da branch é que estaria **inconsistente** com o painel vizinho. Trazer de volta seria regressão visual, não resgate.
6. `git merge-base --is-ancestor b88f6317e origin/main` → não é ancestral: o commit não entrou, o conteúdo entrou por #2809. Isso não muda nada: o critério é o conteúdo estar na main, e está.

Nenhuma lacuna adicional encontrada. Não há motivo para DECISAO_DONO (front puro, sem DDL, edge, workflow ou custo).
