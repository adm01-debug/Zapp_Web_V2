Especialista: semisenior (area-front-componentes)

Refazer 1 do redesenho do cartão do Quadro (etapas 084–090): corrijo ponto a
ponto a recusa 2, sobre a entrega anterior (base 3c5a79e9c1).

Ponto 1 — teclado sozinho revela a ação: ADICIONEI `group-focus-within:opacity-100`
e `group-focus-within:pointer-events-auto` ao "Abrir conversa" e ao kebab
(não- agenda), em `src/components/tasks/shared/WorkItemCard.tsx`. Desvio da
receita, proposital: TROCAR (remover o `focus-visible`) quebraria o teste-guarda
do E16 em `quadroLarguraFocoContraste.test.tsx` (fora do escopo, não posso
afrouxar), que exige `focus-visible:opacity-100` em todo focável que nasce
oculto — o `focus-visible` fica, redundante. Teste:
"P1 — teclado sozinho revela o Abrir conversa" + "P1 — o kebab da Lista também
aparece com o foco dentro do card" — VERMELHO antes (8 falhas, classes
ausentes), VERDE depois.

Ponto 2 — régua do alvo: em `TaskCheckbox.tsx` REMOVI o `-m-[11px]` (a margem
negativa estendia a caixa clicável de 40 px por cima do título/vizinhos) e o
círculo passou de 18 px para 20 px (`h-5 w-5`); em `PriorityPill.tsx` e na tag
"Atrasada" do card, `text-2xs` → `text-xs`. Sem `::before` (não revive os
62 px). Régua colada (mesmo modo, Lista/Quadro/Agenda usam a mesma peça): alvo
40 px (`h-10 w-10`) ≥ 24 px, visual 20 px, respiro pelo gap do flex (sem
sobreposição). Teste: "tem alvo de toque de 40 px com o círculo visual de
20 px" (primitivos), "alvo ≥ 40 px…" + "P2 — urgente e atraso sobem para
text-xs" (card) — VERMELHO antes, VERDE depois.

Ponto 3 — card fora da ordem de Tab: `tabIndex={0}` → `tabIndex={-1}` no
`article` (`WorkItemCard.tsx`). Remover por completo quebraria em silêncio a
seleção 090 (`cardRef.current?.focus()` viraria no-op e o teste 090, que
afirma `document.activeElement === card`, falharia); com -1 o card sai da
ordem e o foco programático continua valendo. Teste: dragHandleProps agora
afirma `tabindex === '-1'` + axe `nested-interactive` sem violações; o teste
090 segue verde — VERMELHO antes (tabindex 0), VERDE depois.

Ponto 4 — NÃO PROCEDE, com prova. O `--warning-text` EXISTE em
`src/styles/tokens.css:158` (claro, `38 92% 30%`) e `:476` (escuro,
`40 91% 60%`); não há sistema de skins no app (só `data-theme` em
`team-chat-tokens.css`, sem redefinição de tokens). O sino já usa o par via
`[&_svg]:text-[hsl(var(--warning-text))]` — conferi no CSS COMPILADO do
`vite build`: a regra
`.[&_svg]:text-[hsl(var(--warning-text))] svg{color:hsl(var(--warning-text))}`
existe no bundle, e o contraste calculado é 5,40:1 no claro e 9,96:1 no
escuro (mínimo 4,5:1). Criar o token de novo seria duplicar. Nenhum teste
afirmava o contrário; o teste do sino segue verde.

Ponto 5 — aria em pt-BR: `aria-label` agora é
`"<título>, <estado por extenso>[, prazo <data formatada>|, sem prazo]"`
(`ROTULO_STATUS` cobre os 6 estados; a data usa `formatWorkItemDate`, a mesma
regra do `DateLabel`), sem mudar props (`WorkItemCard.tsx`). Teste: "P5 — o
nome acessível…" (`Fazendo`, `prazo 04 mai., 14:00`, sem `doing`/ISO),
"sem prazo…", "todos os estados…" (`Caixa de entrada`, `Cancelada`) —
VERMELHO antes (`doing` + ISO cru, medido), VERDE depois. Chamador atualizado:
`TasksBoardMode.a11y.test.tsx` (fora da lista, mas afirmava o nome antigo)
casa agora pelo prefixo `"<título>, A fazer"` — adaptação ao ponto 5, sem
afrouxar (o nome completo segue afirmado nos testes do card).

Arquivos (`git diff --name-only`, base 3c5a79e9c1):
src/components/tasks/shared/WorkItemCard.tsx
src/components/tasks/shared/TaskCheckbox.tsx
src/components/tasks/shared/PriorityPill.tsx
src/components/tasks/__tests__/WorkItemCard.test.tsx
src/components/tasks/__tests__/primitivosCompartilhados.test.tsx
src/components/tasks/__tests__/TasksBoardMode.a11y.test.tsx

Verificações (resultado real):
- `bun run vitest run src/components/tasks src/hooks/tasks` → 40 arquivos, 539 passed, 1 todo.
- `bunx eslint` nos 6 arquivos → limpo; `tsc --noEmit` → nenhum erro nos 6 arquivos.
- `bun run build` (11,03 s) → CSS contém `--warning-text` claro/escuro, a regra
  do sino e `.group:focus-within …pointer-events-auto/opacity-100`.

Nota de ambiente: `hermes-tarefa-iniciar/fechar` estão congelados (CONGELADO sem
MODO_V2) e a guarda bloqueia criar branch/worktree; trabalhei no workspace do
trabalho anterior
(`redesenho-cartao-quadro-urgente-atrasa-26101310490af5`), com commits novos
sobre 3c5a79e9c1 — o diff da revisão é `3c5a79e9c1..HEAD`.
